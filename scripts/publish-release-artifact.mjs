import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const npmRegistryArgument = '--@doruksahin:registry=https://registry.npmjs.org';

function usage() {
  return 'Usage: node scripts/publish-release-artifact.mjs <package.tgz>';
}

function archiveName(name, version) {
  return `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;
}

async function remoteIntegrity(packageSpec) {
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['view', packageSpec, 'dist.integrity', '--json', npmRegistryArgument],
      { env: process.env },
    );
    const integrity = JSON.parse(stdout);
    if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
      throw new Error(`npm returned invalid integrity metadata for ${packageSpec}`);
    }
    return integrity;
  } catch (error) {
    if (error?.stderr?.includes('E404')) return undefined;
    throw error;
  }
}

async function packagedManifest(archive) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'tar',
      ['-xOf', archive, 'package/package.json'],
      { maxBuffer: 1024 * 1024 },
    ));
  } catch {
    throw new Error('Release artifact does not contain a readable package/package.json');
  }

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('Release artifact contains an invalid package/package.json');
  }
}

async function main() {
  if (process.argv.length !== 3) throw new Error(usage());

  const archive = await realpath(resolve(process.argv[2]));
  if (!(await lstat(archive)).isFile() || !archive.endsWith('.tgz')) {
    throw new Error('Artifact must be an existing .tgz file');
  }

  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const expectedName = archiveName(packageJson.name, packageJson.version);
  if (basename(archive) !== expectedName) {
    throw new Error(`Expected release artifact ${expectedName}`);
  }

  const packed = await packagedManifest(archive);
  if (
    packed.name !== packageJson.name ||
    packed.version !== packageJson.version ||
    packed.license !== 'MIT' ||
    packed.private === true ||
    packed.bin?.['jira-markdown-export'] !== 'dist/cli/main.js' ||
    packed.publishConfig?.access !== 'public' ||
    packed.publishConfig?.registry !== 'https://registry.npmjs.org'
  ) {
    throw new Error('Release artifact package identity does not match the public package contract');
  }

  const bytes = await readFile(archive);
  const localIntegrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const packageSpec = `${packageJson.name}@${packageJson.version}`;
  const publishedIntegrity = await remoteIntegrity(packageSpec);

  if (publishedIntegrity !== undefined) {
    if (publishedIntegrity !== localIntegrity) {
      throw new Error(`npm already has a different artifact for ${packageSpec}`);
    }
    process.stdout.write(`Verified existing npm package: ${packageSpec}\n`);
    return;
  }

  try {
    await execFileAsync(
      'npm',
      [
        'publish',
        archive,
        '--access',
        'public',
        '--provenance',
        npmRegistryArgument,
      ],
      { cwd: repositoryRoot, env: process.env, maxBuffer: 10 * 1024 * 1024 },
    );
    process.stdout.write(`Published npm package: ${packageSpec}\n`);
  } catch (error) {
    const racedIntegrity = await remoteIntegrity(packageSpec);
    if (racedIntegrity === localIntegrity) {
      process.stdout.write(`Verified concurrently published npm package: ${packageSpec}\n`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
