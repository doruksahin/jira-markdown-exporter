import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function usage() {
  return 'Usage: node scripts/upload-release-artifacts.mjs <tag> <file> [file...]';
}

async function main() {
  const [tag, ...requestedFiles] = process.argv.slice(2);
  if (!tag || requestedFiles.length === 0) throw new Error(usage());

  const files = [];
  const names = new Set();
  for (const requestedFile of requestedFiles) {
    const file = await realpath(resolve(requestedFile));
    if (!(await lstat(file)).isFile()) throw new Error(`Release asset is not a file: ${file}`);
    const name = basename(file);
    if (names.has(name)) throw new Error(`Duplicate release asset name: ${name}`);
    names.add(name);
    files.push({ file, name });
  }

  const { stdout } = await execFileAsync(
    'gh',
    ['release', 'view', tag, '--json', 'assets', '--jq', '.assets[].name'],
    { env: process.env },
  );
  const existingNames = new Set(stdout.split('\n').filter(Boolean));
  const downloadDirectory = await mkdtemp(join(tmpdir(), 'jira-exporter-release-assets-'));

  try {
    const existingFiles = files.filter(({ name }) => existingNames.has(name));
    const missingFiles = files.filter(({ name }) => !existingNames.has(name));
    for (const { file, name } of existingFiles) {
      await execFileAsync(
        'gh',
        ['release', 'download', tag, '--pattern', name, '--dir', downloadDirectory],
        { env: process.env },
      );
      const [localBytes, remoteBytes] = await Promise.all([
        readFile(file),
        readFile(join(downloadDirectory, name)),
      ]);
      if (!localBytes.equals(remoteBytes)) {
        throw new Error(`Existing release asset differs; refusing to replace it: ${name}`);
      }
      process.stdout.write(`Verified existing release asset: ${name}\n`);
    }

    for (const { file, name } of missingFiles) {
      await execFileAsync('gh', ['release', 'upload', tag, file], { env: process.env });
      process.stdout.write(`Uploaded release asset: ${name}\n`);
    }
  } finally {
    await rm(downloadDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
