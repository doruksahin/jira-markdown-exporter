import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

function usage() {
  return 'Usage: node scripts/build-release-artifact.mjs <empty-output-directory>';
}

async function prepareOutputDirectory(requestedPath) {
  const outputDirectory = resolve(requestedPath);
  const filesystemRoot = parse(outputDirectory).root;

  if (outputDirectory === filesystemRoot || outputDirectory === repositoryRoot) {
    throw new Error('Refusing to use a filesystem or repository root as output');
  }

  try {
    const metadata = await lstat(outputDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('Output path must be a real directory, not a file or symlink');
    }
    if ((await readdir(outputDirectory)).length > 0) {
      throw new Error('Output directory must be empty');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    await mkdir(outputDirectory, { recursive: true });
  }

  const canonicalOutput = await realpath(outputDirectory);
  if (canonicalOutput === filesystemRoot || canonicalOutput === repositoryRoot) {
    throw new Error('Refusing to use a filesystem or repository root as output');
  }

  return canonicalOutput;
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error(usage());
  }

  const outputDirectory = await prepareOutputDirectory(process.argv[2]);
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const archiveName = `${packageJson.name.replace(/^@/, '').replaceAll('/', '-')}-${packageJson.version}.tgz`;
  const stagingDirectory = await mkdtemp(join(tmpdir(), 'jira-exporter-pack-'));
  const finalArchive = join(outputDirectory, archiveName);
  const finalChecksums = join(outputDirectory, 'SHA256SUMS');

  try {
    await execFileAsync('pnpm', ['build'], {
      cwd: repositoryRoot,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const { stdout } = await execFileAsync(
      'npm',
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        stagingDirectory,
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const packResult = JSON.parse(stdout);
    if (
      !Array.isArray(packResult) ||
      packResult.length !== 1 ||
      packResult[0]?.filename !== archiveName
    ) {
      throw new Error('npm pack returned an unexpected archive');
    }

    const stagedArchive = join(stagingDirectory, archiveName);
    const archiveBytes = await readFile(stagedArchive);
    const digest = createHash('sha256').update(archiveBytes).digest('hex');

    await writeFile(finalArchive, archiveBytes, { flag: 'wx' });
    try {
      await writeFile(finalChecksums, `${digest}  ${archiveName}\n`, { flag: 'wx' });
    } catch (error) {
      await rm(finalArchive, { force: true });
      throw error;
    }

    process.stdout.write(
      `Created ${finalArchive}\nSHA-256 ${digest}\nChecksums ${finalChecksums}\n`,
    );
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
