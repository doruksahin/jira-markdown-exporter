import { execFile } from 'node:child_process';
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function usage() {
  return 'Usage: node scripts/smoke-installed-artifact.mjs <package.tgz>';
}

async function main() {
  if (process.argv.length !== 3) throw new Error(usage());

  const archive = await realpath(resolve(process.argv[2]));
  const metadata = await lstat(archive);
  if (!metadata.isFile() || !archive.endsWith('.tgz')) {
    throw new Error('Artifact must be an existing .tgz file');
  }

  const smokeRoot = await mkdtemp(join(tmpdir(), 'jira-exporter-install-'));
  try {
    await execFileAsync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--prefix',
        smokeRoot,
        archive,
      ],
      { cwd: smokeRoot, env: process.env, maxBuffer: 10 * 1024 * 1024 },
    );
    const cli = join(
      smokeRoot,
      'node_modules',
      '.bin',
      'jira-markdown-export',
    );
    const { stdout } = await execFileAsync(cli, ['--help'], {
      cwd: smokeRoot,
      env: process.env,
    });
    if (!stdout.includes('Usage:')) {
      throw new Error('Installed jira-markdown-export did not print help');
    }
    process.stdout.write(`Installed package smoke passed: ${archive}\n`);
  } finally {
    await rm(smokeRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
