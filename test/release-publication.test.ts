import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const publishScript = join(repositoryRoot, 'scripts', 'publish-release-artifact.mjs');
const uploadScript = join(repositoryRoot, 'scripts', 'upload-release-artifacts.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'jira-exporter-publication-'));
  temporaryRoots.push(root);
  const bin = join(root, 'bin');
  await mkdir(bin);
  return { root, bin };
}

async function fakeCommand(path: string, source: string) {
  await writeFile(path, `#!/usr/bin/env node\n${source}`);
  await chmod(path, 0o755);
}

async function packageArchive(
  root: string,
  archive: string,
  overrides: Record<string, unknown> = {},
) {
  const manifest = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
  ) as Record<string, unknown>;
  const source = join(root, `archive-${Math.random().toString(16).slice(2)}`);
  const packageDirectory = join(source, 'package');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify({ ...manifest, ...overrides })}\n`,
  );
  await execFileAsync('tar', ['-czf', archive, '-C', source, 'package']);
}

function environment(bin: string, values: Record<string, string>) {
  return {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    ...values,
  };
}

describe('release publication retry safety', () => {
  it('keeps GitHub orchestration credentials separate from OIDC publication', async () => {
    const workflow = await readFile(
      join(repositoryRoot, '.github', 'workflows', 'release-please.yml'),
      'utf8',
    );
    const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));
    const scopedArchiveReferences = workflow.match(
      /doruksahin-jira-markdown-exporter-\$\{\{ steps\.identity\.outputs\.version \}\}\.tgz/g,
    );

    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).toContain('npm install --global npm@11.12.1');
    expect(workflow).toContain(
      "github.event_name != 'workflow_dispatch' || inputs.publish_tag == ''",
    );
    expect(publishJob).toContain('id-token: write');
    expect(publishJob).not.toContain('RELEASE_PLEASE_TOKEN');
    expect(scopedArchiveReferences).toHaveLength(3);
  });

  it('skips npm publication when the registry already has the exact tarball', async () => {
    const { root, bin } = await fixture();
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    const archiveName = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const archive = join(root, archiveName);
    await packageArchive(root, archive);
    const bytes = await readFile(archive);
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    const log = join(root, 'npm.log');

    await fakeCommand(join(bin, 'npm'), `
import { appendFile } from 'node:fs/promises';
await appendFile(process.env.FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === 'view') process.stdout.write(JSON.stringify(process.env.FAKE_INTEGRITY));
else process.exitCode = 2;
`);

    const result = await execFileAsync(process.execPath, [publishScript, archive], {
      cwd: repositoryRoot,
      env: environment(bin, { FAKE_LOG: log, FAKE_INTEGRITY: integrity }),
    });

    expect(result.stdout).toContain('Verified existing npm package');
    expect(await readFile(log, 'utf8')).not.toContain('publish');
  });

  it('publishes a missing npm version to the scope-specific public registry', async () => {
    const { root, bin } = await fixture();
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    const archiveName = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const archive = join(root, archiveName);
    const log = join(root, 'npm.log');
    await packageArchive(root, archive);

    await fakeCommand(join(bin, 'npm'), `
import { appendFile } from 'node:fs/promises';
await appendFile(process.env.FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === 'view') {
  process.stderr.write('npm error E404 Not Found');
  process.exitCode = 1;
}
`);

    const result = await execFileAsync(process.execPath, [publishScript, archive], {
      cwd: repositoryRoot,
      env: environment(bin, { FAKE_LOG: log }),
    });
    const calls = await readFile(log, 'utf8');

    expect(result.stdout).toContain('Published npm package');
    expect(calls).toContain('"publish"');
    expect(calls).toContain('--@doruksahin:registry=https://registry.npmjs.org');
    expect(calls).toContain('--provenance');
  });

  it('rejects an npm version whose registry integrity differs', async () => {
    const { root, bin } = await fixture();
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    const archiveName = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const archive = join(root, archiveName);
    const log = join(root, 'npm.log');
    await packageArchive(root, archive);

    await fakeCommand(join(bin, 'npm'), `
import { appendFile } from 'node:fs/promises';
await appendFile(process.env.FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[2] === 'view') process.stdout.write(JSON.stringify('sha512-not-the-local-integrity'));
`);

    await expect(
      execFileAsync(process.execPath, [publishScript, archive], {
        cwd: repositoryRoot,
        env: environment(bin, { FAKE_LOG: log }),
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('different artifact'),
    });
    expect(await readFile(log, 'utf8')).not.toContain('"publish"');
  });

  it('rejects a substituted tarball whose packaged identity differs', async () => {
    const { root } = await fixture();
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    const archiveName = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const archive = join(root, archiveName);
    await packageArchive(root, archive, { name: '@attacker/substitute' });

    await expect(
      execFileAsync(process.execPath, [publishScript, archive], {
        cwd: repositoryRoot,
        env: process.env,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('package identity does not match'),
    });
  });

  it('verifies equal GitHub assets without replacing them', async () => {
    const { root, bin } = await fixture();
    const local = join(root, 'artifact.tgz');
    const remote = join(root, 'remote');
    const log = join(root, 'gh.log');
    await mkdir(remote);
    await writeFile(local, 'same bytes');
    await writeFile(join(remote, 'artifact.tgz'), 'same bytes');

    await fakeCommand(join(bin, 'gh'), `
import { appendFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
await appendFile(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args[1] === 'view') process.stdout.write('artifact.tgz\\n');
if (args[1] === 'download') {
  const name = args[args.indexOf('--pattern') + 1];
  const destination = args[args.indexOf('--dir') + 1];
  await copyFile(join(process.env.FAKE_REMOTE, name), join(destination, name));
}
`);

    const result = await execFileAsync(process.execPath, [uploadScript, 'v1.0.0', local], {
      cwd: repositoryRoot,
      env: environment(bin, { FAKE_LOG: log, FAKE_REMOTE: remote }),
    });

    expect(result.stdout).toContain('Verified existing release asset');
    expect(await readFile(log, 'utf8')).not.toContain('"upload"');
  });

  it('rejects a divergent GitHub asset without uploading anything', async () => {
    const { root, bin } = await fixture();
    const local = join(root, 'artifact.tgz');
    const missing = join(root, 'SHA256SUMS');
    const remote = join(root, 'remote');
    const log = join(root, 'gh.log');
    await mkdir(remote);
    await writeFile(local, 'local bytes');
    await writeFile(missing, 'new checksum');
    await writeFile(join(remote, 'artifact.tgz'), 'different bytes');

    await fakeCommand(join(bin, 'gh'), `
import { appendFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
await appendFile(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args[1] === 'view') process.stdout.write('artifact.tgz\\n');
if (args[1] === 'download') {
  const name = args[args.indexOf('--pattern') + 1];
  const destination = args[args.indexOf('--dir') + 1];
  await copyFile(join(process.env.FAKE_REMOTE, name), join(destination, name));
}
`);

    await expect(
      execFileAsync(process.execPath, [uploadScript, 'v1.0.0', local, missing], {
        cwd: repositoryRoot,
        env: environment(bin, { FAKE_LOG: log, FAKE_REMOTE: remote }),
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('refusing to replace it'),
    });
    expect(await readFile(log, 'utf8')).not.toContain('"upload"');
  });
});
