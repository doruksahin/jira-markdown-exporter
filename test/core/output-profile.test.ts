import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import { loadOutputProfile } from '../../src/output/output-profile.js';
import { writeOutputProfileSnapshot } from '../../src/output/profile-writer.js';
import { writeWorkOsV1Snapshot } from '../../src/output/work-os-v1-writer.js';
import { runExport } from '../../src/runner/run-export.js';
import type { BoardIssueReader } from '../../src/ports/board-issue-reader.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('output profiles', () => {
  it('keeps the explicit work-os-v1 profile byte-identical to the compatibility writer', async () => {
    const compatibilityOutput = await temporaryDirectory();
    const profileOutput = await temporaryDirectory();
    const issue = fixtureIssue();
    const compatibility = await writeWorkOsV1Snapshot(issue, { outputDir: compatibilityOutput, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1]) });
    const selected = await writeOutputProfileSnapshot(issue, {
      outputDir: profileOutput, profile: await loadOutputProfile({ profile: 'work-os-v1' }),
      downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1]),
    });
    for (const filename of ['00 Issue.md', '10 Comments.md', '20 Attachments.md', '90 Sync.md']) {
      const actual = await readFile(join(selected.issueDir, filename), 'utf8');
      expect(actual).toBe(await readFile(join(compatibility.issueDir, filename), 'utf8'));
      expect(actual).toBe(await readFile(new URL(`../fixtures/work-os-v1/${filename}`, import.meta.url), 'utf8'));
    }
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

  it('rejects a manifest that would write outside its owned directory', async () => {
    const profileDir = await temporaryDirectory();
    await writeFile(join(profileDir, 'profile.json'), JSON.stringify({
      id: 'unsafe-v1', schemaVersion: 1, ownedDirectory: 'Jira', attachmentsDirectory: 'files',
      files: [{ template: 'summary.md.liquid', output: '../00 Task.md' }],
    }));
    await expect(loadOutputProfile({ templateDir: profileDir })).rejects.toThrow('unsafe output path');
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
