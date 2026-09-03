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
    expect(manifest.files).toContain('profiles/generic-v1/*.liquid');
    expect(manifest.files).toContain('profiles/generic-v1/profile.json');
    expect(manifest.files).not.toContain('profiles');
    await expect(lstat(join(repositoryRoot, 'dist', 'board-sync'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(join(repositoryRoot, 'dist', 'output', 'work-os-v1-writer.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps package and runtime versions aligned', async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string };
    expect(manifest.version).toBe('0.3.0');
    expect(JIRA_MARKDOWN_EXPORTER_VERSION).toBe(manifest.version);
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
