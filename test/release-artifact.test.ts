import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const artifactScript = join(repositoryRoot, 'scripts', 'build-release-artifact.mjs');
const smokeScript = join(repositoryRoot, 'scripts', 'smoke-installed-artifact.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'jira-exporter-release-'));
  temporaryRoots.push(root);
  return root;
}

async function buildArtifact(outputDirectory: string) {
  return execFileAsync(process.execPath, [artifactScript, outputDirectory], {
    cwd: repositoryRoot,
    env: process.env,
  });
}

describe('release artifact command', () => {
  it('creates a checksummed npm archive reproducibly in explicit empty directories', async () => {
    const root = await temporaryRoot();
    const firstOutput = join(root, 'first');
    const secondOutput = join(root, 'second');

    const first = await buildArtifact(firstOutput);
    const second = await buildArtifact(secondOutput);

    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    const archiveName = `${packageJson.name.replace(/^@/, '').replaceAll('/', '-')}-${packageJson.version}.tgz`;
    const firstArchive = await readFile(join(firstOutput, archiveName));
    const secondArchive = await readFile(join(secondOutput, archiveName));
    const expectedDigest = createHash('sha256').update(firstArchive).digest('hex');

    expect(secondArchive).toEqual(firstArchive);
    expect(await readFile(join(firstOutput, 'SHA256SUMS'), 'utf8')).toBe(
      `${expectedDigest}  ${archiveName}\n`,
    );
    expect(await readFile(join(secondOutput, 'SHA256SUMS'), 'utf8')).toBe(
      `${expectedDigest}  ${archiveName}\n`,
    );
    expect(first.stdout).toContain(archiveName);
    expect(second.stdout).toContain(expectedDigest);

    const smoke = await execFileAsync(process.execPath, [
      smokeScript,
      join(firstOutput, archiveName),
    ], {
      cwd: repositoryRoot,
      env: process.env,
    });
    expect(smoke.stdout).toContain('Installed package smoke passed');

    const listing = await execFileAsync('tar', [
      '-tzf',
      join(firstOutput, archiveName),
    ]);
    const packagedPaths = listing.stdout.trim().split('\n');
    expect(packagedPaths).toContain('package/LICENSE');
    expect(packagedPaths).toContain('package/dist/cli/main.js');
    expect(packagedPaths).not.toContain('package/scripts/build-release-artifact.mjs');
    expect(packagedPaths.some((path) => path.startsWith('package/test/'))).toBe(false);

  }, 120_000);

  it('refuses to write into a non-empty output directory', async () => {
    const root = await temporaryRoot();
    const outputDirectory = join(root, 'occupied');
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, 'keep.txt'), 'do not replace\n');

    await expect(buildArtifact(outputDirectory)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Output directory must be empty'),
    });
    expect(await readFile(join(outputDirectory, 'keep.txt'), 'utf8')).toBe(
      'do not replace\n',
    );
  });

  it('refuses to use the repository root as an output directory', async () => {
    await expect(buildArtifact(repositoryRoot)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Refusing to use a filesystem or repository root as output',
      ),
    });
  });
});
