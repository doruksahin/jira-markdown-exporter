import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JIRA_MARKDOWN_EXPORTER_VERSION } from '../../src/version.js';

const repositoryRoot = resolve('.');
const forbiddenConsumerTerms = /adc-vault|adcreative|obsidian|work[ _-]?os|40 Jira/i;

describe('consumer-neutral package boundary', () => {
  it('keeps runtime, schemas, and packaged profiles free of consumer-specific policy', async () => {
    const files = await sourceFiles(['src', 'profiles/generic-v1', 'schemas']);
    const violations: string[] = [];
    for (const file of files) {
      if (!/\.(?:ts|json|liquid)$/.test(file)) continue;
      const content = await readFile(file, 'utf8');
      if (forbiddenConsumerTerms.test(content)) violations.push(relative(repositoryRoot, file));
    }
    expect(violations).toEqual([]);
  });

  it('ships only the generic built-in profile and no retired compatibility build output', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { files: string[] };
    expect(manifest.files).toEqual([
      'dist',
      'docs/output-profiles.md',
      'docs/server-operation.md',
      'profiles/generic-v1/*.liquid',
      'profiles/generic-v1/profile.json',
      'schemas',
      'README.md',
    ]);
    await expect(lstat(join(repositoryRoot, 'dist', 'board-sync'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(join(repositoryRoot, 'dist', 'output', 'work-os-v1-writer.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('publishes the scoped MIT package while retaining the stable CLI command', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
      name: string;
      private?: boolean;
      license: string;
      bin: Record<string, string>;
      publishConfig: { access: string; registry: string };
    };

    expect(manifest.name).toBe('@doruksahin/jira-markdown-exporter');
    expect(manifest.private).toBeUndefined();
    expect(manifest.license).toBe('MIT');
    expect(manifest.bin).toEqual({
      'jira-markdown-export': 'dist/cli/main.js',
    });
    expect(manifest.publishConfig).toEqual({
      access: 'public',
      registry: 'https://registry.npmjs.org',
    });
  });

  it('keeps package and runtime versions aligned', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string };
    const releasePlease = JSON.parse(
      await readFile(join(repositoryRoot, 'release-please-config.json'), 'utf8'),
    ) as {
      packages: Record<string, { 'extra-files': Array<{ type: string; path: string }> }>;
    };
    const versionSource = await readFile(join(repositoryRoot, 'src', 'version.ts'), 'utf8');

    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(JIRA_MARKDOWN_EXPORTER_VERSION).toBe(manifest.version);
    expect(releasePlease.packages['.']?.['extra-files']).toContainEqual({
      type: 'generic',
      path: 'src/version.ts',
    });
    expect(versionSource).toContain('x-release-please-version');
  });
});

async function sourceFiles(roots: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) await walk(join(repositoryRoot, root), files);
  return files;
}

async function walk(directory: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Packaged source contains a symbolic link: ${relative(repositoryRoot, path)}`);
    if (entry.isDirectory()) await walk(path, files);
    else files.push(path);
  }
}
