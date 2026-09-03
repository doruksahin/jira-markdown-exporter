import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import { loadOutputProfile } from '../../src/output/output-profile.js';
import { writeOutputProfileSnapshot } from '../../src/output/profile-writer.js';
import { runExport } from '../../src/runner/run-export.js';
import type { BoardIssueReader } from '../../src/ports/board-issue-reader.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('output profiles', () => {
  it('publishes schema path constraints that match runtime safety checks', async () => {
    const schema = JSON.parse(await readFile(new URL('../../schemas/output-profile.schema.json', import.meta.url), 'utf8')) as {
      properties: Record<string, { pattern?: string } | { items: { properties: Record<string, { pattern: string }> } }>;
    };
    const idPattern = new RegExp((schema.properties.id as { pattern: string }).pattern);
    const ownedPattern = new RegExp((schema.properties.ownedDirectory as { pattern: string }).pattern);
    const files = schema.properties.files as { items: { properties: Record<string, { pattern: string }> } };
    const templatePattern = new RegExp(files.items.properties.template.pattern);
    const outputPattern = new RegExp(files.items.properties.output.pattern);

    expect(idPattern.test('generic-v1')).toBe(true);
    expect(idPattern.test('   ')).toBe(false);
    expect(ownedPattern.test('snapshot')).toBe(true);
    expect(ownedPattern.test('..')).toBe(false);
    expect(ownedPattern.test('   ')).toBe(false);
    expect(ownedPattern.test('nested/snapshot')).toBe(false);
    expect(templatePattern.test('partials/notice.liquid')).toBe(true);
    expect(templatePattern.test('../notice.liquid')).toBe(false);
    expect(outputPattern.test('nested/summary.md')).toBe(true);
    expect(outputPattern.test('/tmp/summary.md')).toBe(false);
    expect(outputPattern.test('nested/../summary.md')).toBe(false);
  });

  it('renders the generic built-in profile by default', async () => {
    const profileOutput = await temporaryDirectory();
    const issue = fixtureIssue();
    const selected = await writeOutputProfileSnapshot(issue, {
      outputDir: profileOutput, profile: await loadOutputProfile(),
      downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1]),
    });
    expect(selected.issueDir).toBe(join(profileOutput, 'ATT-123', 'jira-snapshot'));
    expect(await readFile(join(selected.issueDir, 'issue.md'), 'utf8')).toContain('# ATT-123: A fixture');
    expect(await readFile(join(selected.issueDir, 'comments.md'), 'utf8')).toContain('_No visible comments._');
    expect(await readFile(join(selected.issueDir, 'attachments.md'), 'utf8')).toContain('attachments/20-design.png');
    expect(await readFile(join(selected.issueDir, 'metadata.md'), 'utf8')).toContain('Downloaded attachments: 1');
  });

  it('renders an explicit local profile without changing TypeScript', async () => {
    const outputDir = await temporaryDirectory();
    const profileDir = await temporaryDirectory();
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'compact-v1', schemaVersion: 1, ownedDirectory: 'Jira Snapshot', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: 'Summary.md' }],
    }));
    await writeFile(join(profileDir, 'summary.md.liquid'), '# {{ issue.key }}\n{{ issue.summary }}\nattachments={{ attachments.size }}\n');
    const receipt = await runExport(new SingleIssueReader(fixtureIssue()), { outputDir, issueKeys: ['ATT-123'], templateDir: profileDir });
    expect(receipt).toMatchObject({ status: 'success', synced: 1 });
    expect(await readFile(join(outputDir, 'ATT-123', 'Jira Snapshot', 'Summary.md'), 'utf8')).toBe('# ATT-123\nA fixture\nattachments=1\n');
  });

  it('renders every issue from the same immutable filesystem profile snapshot used by its digest', async () => {
    const outputDir = await temporaryDirectory();
    const profileDir = await temporaryDirectory();
    const templatePath = join(profileDir, 'summary.md.liquid');
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'snapshot-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: 'summary.md' }],
    }));
    await writeFile(templatePath, '# original {{ issue.key }}\n');
    let fetches = 0;
    const reader: BoardIssueReader = {
      async searchIssueKeys() { return []; },
      async fetchIssue(key) {
        fetches += 1;
        if (fetches === 1) await writeFile(templatePath, '# changed {{ issue.key }}\n');
        return { ...fixtureIssue(), key };
      },
      async downloadAttachment() { return new Uint8Array(); },
    };

    const receipt = await runExport(reader, {
      outputDir, issueKeys: ['ATT-1', 'ATT-2'], templateDir: profileDir,
    });

    expect(receipt.status).toBe('success');
    await expect(readFile(join(outputDir, 'ATT-1', 'snapshot', 'summary.md'), 'utf8')).resolves.toBe('# original ATT-1\n');
    await expect(readFile(join(outputDir, 'ATT-2', 'snapshot', 'summary.md'), 'utf8')).resolves.toBe('# original ATT-2\n');
  });

  it('identifies equivalent filesystem and in-memory profile inputs with the same deterministic digest', async () => {
    const firstProfileDir = await temporaryDirectory();
    const secondProfileDir = await temporaryDirectory();
    const manifest = {
      id: 'digest-v1', schemaVersion: 1 as const, ownedDirectory: 'snapshot', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: 'summary.md' }],
    };
    const template = '# {{ issue.key }}\n';
    const partial = 'stable partial\n';
    await writeProfile(firstProfileDir, JSON.stringify(manifest), [
      ['summary.md.liquid', template], ['partials/notice.liquid', partial],
    ]);
    await writeProfile(secondProfileDir, JSON.stringify({
      files: manifest.files, attachmentsDirectory: manifest.attachmentsDirectory,
      ownedDirectory: manifest.ownedDirectory, schemaVersion: manifest.schemaVersion, id: manifest.id,
    }, null, 2), [
      ['partials/notice.liquid', partial], ['summary.md.liquid', template],
    ]);

    const filesystemFirst = await runExport(new SingleIssueReader(fixtureIssue()), {
      outputDir: await temporaryDirectory(), issueKeys: ['ATT-123'], templateDir: firstProfileDir,
    });
    const filesystemSecond = await runExport(new SingleIssueReader(fixtureIssue()), {
      outputDir: await temporaryDirectory(), issueKeys: ['ATT-123'], templateDir: secondProfileDir,
    });
    const inMemory = await runExport(new SingleIssueReader(fixtureIssue()), {
      outputDir: await temporaryDirectory(), issueKeys: ['ATT-123'],
      outputProfile: { manifest, templates: { 'partials/notice.liquid': partial, 'summary.md.liquid': template } },
    });

    expect(filesystemFirst.profileDigest).toBe(filesystemSecond.profileDigest);
    expect(filesystemFirst.profileDigest).toBe(inMemory.profileDigest);
  });

  it('changes the profile digest when the manifest, a template, or a partial changes', async () => {
    const manifest = {
      id: 'digest-v1', schemaVersion: 1 as const, ownedDirectory: 'snapshot', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: 'summary.md' }],
    };
    const baseOptions = { issueKeys: ['ATT-123'], outputProfile: {
      manifest, templates: { 'summary.md.liquid': '# {{ issue.key }}\n', 'partials/notice.liquid': 'before\n' },
    } };
    const before = await runExport(new SingleIssueReader(fixtureIssue()), {
      ...baseOptions, outputDir: await temporaryDirectory(),
    });
    const changedManifest = await runExport(new SingleIssueReader(fixtureIssue()), {
      ...baseOptions, outputDir: await temporaryDirectory(),
      outputProfile: { ...baseOptions.outputProfile, manifest: { ...manifest, id: 'digest-v2' } },
    });
    const changedTemplate = await runExport(new SingleIssueReader(fixtureIssue()), {
      ...baseOptions, outputDir: await temporaryDirectory(),
      outputProfile: { ...baseOptions.outputProfile, templates: {
        ...baseOptions.outputProfile.templates, 'summary.md.liquid': '## {{ issue.key }}\n',
      } },
    });
    const changedPartial = await runExport(new SingleIssueReader(fixtureIssue()), {
      ...baseOptions, outputDir: await temporaryDirectory(),
      outputProfile: { ...baseOptions.outputProfile, templates: {
        ...baseOptions.outputProfile.templates, 'partials/notice.liquid': 'after\n',
      } },
    });

    expect(changedManifest.profileDigest).not.toBe(before.profileDigest);
    expect(changedTemplate.profileDigest).not.toBe(before.profileDigest);
    expect(changedPartial.profileDigest).not.toBe(before.profileDigest);
  });

  it('rejects a manifest that would write outside its owned directory', async () => {
    const profileDir = await temporaryDirectory();
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'unsafe-v1', schemaVersion: 1, ownedDirectory: 'Jira', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: '../00 Task.md' }],
    }));
    await expect(loadOutputProfile({ templateDir: profileDir })).rejects.toThrow('unsafe output path');
  });

  it.each([
    { attachmentsDirectory: 'attachments.md', output: 'attachments.md' },
    { attachmentsDirectory: 'attachments', output: 'attachments/index.md' },
  ])('rejects Markdown output owned by the attachments directory: $output', async ({ attachmentsDirectory, output }) => {
    const profileDir = await temporaryDirectory();
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'overlap-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory,
      files: [{ template: 'summary.md.liquid', output }],
    }));
    await writeFile(join(profileDir, 'summary.md.liquid'), '# summary\n');

    await expect(loadOutputProfile({ templateDir: profileDir })).rejects.toThrow('attachmentsDirectory');
  });

  it.each([
    {
      label: 'manifest',
      manifest: {
        id: 'strict-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory: 'attachments',
        files: [{ template: 'summary.md.liquid', output: 'summary.md' }], consumerPath: 'vault',
      },
    },
    {
      label: 'file',
      manifest: {
        id: 'strict-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory: 'attachments',
        files: [{ template: 'summary.md.liquid', output: 'summary.md', mode: 'replace' }],
      },
    },
  ])('rejects unknown $label properties at runtime as declared by the schema', async ({ manifest }) => {
    const profileDir = await temporaryDirectory();
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify(manifest));
    await writeFile(join(profileDir, 'summary.md.liquid'), '# summary\n');

    await expect(loadOutputProfile({ templateDir: profileDir })).rejects.toThrow('unknown');
  });

  it('revalidates in-memory profiles before writing', async () => {
    const outputDir = await temporaryDirectory();
    const unsafeProfile = {
      manifest: {
        id: 'unsafe-v1', schemaVersion: 1 as const, ownedDirectory: '..', attachmentsDirectory: 'files',
        files: [{ template: 'summary.md.liquid', output: 'summary.md' }],
      },
      templates: { 'summary.md.liquid': '# unsafe\n' },
    };

    await expect(writeOutputProfileSnapshot(fixtureIssue(), {
      outputDir,
      profile: unsafeProfile,
    })).rejects.toThrow('unsafe ownedDirectory');
    expect(await readFile(join(outputDir, 'summary.md'), 'utf8').catch(() => 'missing')).toBe('missing');
  });

  it('rejects symbolic links anywhere in an external profile', async () => {
    const profileDir = await temporaryDirectory();
    const outside = join(await temporaryDirectory(), 'outside.liquid');
    await writeFile(outside, '# outside\n');
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'unsafe-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: 'summary.md' }],
    }));
    await symlink(outside, join(profileDir, 'summary.md.liquid'));

    await expect(loadOutputProfile({ templateDir: profileDir })).rejects.toThrow('must not contain symbolic links');
  });

  it('rejects a symbolic-link issue directory before writing outside the output root', async () => {
    const outputDir = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await symlink(outside, join(outputDir, 'ATT-123'));

    await expect(runExport(new SingleIssueReader(fixtureIssue()), {
      outputDir,
      issueKeys: ['ATT-123'],
    })).resolves.toMatchObject({
      status: 'failed',
      issues: [{ key: 'ATT-123', status: 'failed', error: 'Issue output directory must not be a symbolic link: ATT-123' }],
    });
    expect(await readFile(join(outside, 'sentinel'), 'utf8').catch(() => 'missing')).toBe('missing');
  });
});

class SingleIssueReader implements BoardIssueReader {
  constructor(private readonly issue: BoardIssueSnapshot) {}
  async searchIssueKeys(): Promise<readonly string[]> { return [this.issue.key]; }
  async fetchIssue(): Promise<BoardIssueSnapshot> { return this.issue; }
  async downloadAttachment(): Promise<Uint8Array> { return new Uint8Array(); }
}

function fixtureIssue(): BoardIssueSnapshot {
  return {
    key: 'ATT-123', url: 'https://example.test/browse/ATT-123', summary: 'A fixture',
    description: '![design](./attachments/design.png)', status: 'In Progress', issueType: 'Task', priority: 'Medium',
    assignee: 'Doruk', reporter: 'PM', created: '2026-08-01T00:00:00.000Z', updated: '2026-08-02T00:00:00.000Z',
    labels: ['zeta', 'alpha'], parentKey: '', linkedIssues: [{
      relationship: 'blocks', key: 'ATT-456', url: 'https://example.test/browse/ATT-456', summary: 'A linked fixture',
      status: 'To Do', issueType: 'Bug', assignee: 'Teammate',
    }], comments: [], attachments: [{
      id: '20', filename: 'design.png', mimeType: 'image/png', size: 2048, author: 'Designer',
      created: '2026-08-02T00:00:00.000Z', contentUrl: 'https://example.test/content/20', isImage: true, inlineInDescription: true,
    }],
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jira-markdown-exporter-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeProfile(
  directory: string,
  manifest: string,
  files: readonly (readonly [string, string])[],
): Promise<void> {
  await writeFile(join(directory, 'profile.json'), manifest);
  for (const [name, content] of files) {
    await mkdir(join(directory, name, '..'), { recursive: true });
    await writeFile(join(directory, name), content);
  }
}
