import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import type { BoardIssueReader } from '../../src/ports/board-issue-reader.js';
import { runExport } from '../../src/runner/run-export.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('runExport', () => {
  it('reports a per-issue partial failure without discarding completed output', async () => {
    const outputDir = await temporaryDirectory();
    const reader = new FakeReader(new Map([
      ['ATT-1', fixture('ATT-1')], ['ATT-2', new Error('not found')],
    ]));
    const receipt = await runExport(reader, { outputDir, issueKeys: ['att-1', 'ATT-2'] });

    expect(receipt).toMatchObject({ schemaVersion: 1, status: 'partial', total: 2, synced: 1, failed: 1 });
    expect(receipt.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'ATT-2', status: 'failed', error: 'not found' }),
    ]));
    expect(await readFile(join(outputDir, 'ATT-1', '40 Jira', '00 Issue.md'), 'utf8')).toContain('ATT-1');
  });

  it('uses JQL when explicit keys are absent and de-duplicates normalized keys', async () => {
    const outputDir = await temporaryDirectory();
    const reader = new FakeReader(new Map([['ATT-1', fixture('ATT-1')]]));
    const receipt = await runExport(reader, { outputDir, jql: 'project = ATT' });
    expect(receipt).toMatchObject({ status: 'success', total: 1, synced: 1 });
    expect(reader.searched).toBe('project = ATT');
  });
});

class FakeReader implements BoardIssueReader {
  public searched: string | undefined;
  constructor(private readonly entries: ReadonlyMap<string, BoardIssueSnapshot | Error>) {}
  async searchIssueKeys(jql: string): Promise<readonly string[]> { this.searched = jql; return ['att-1', 'ATT-1']; }
  async fetchIssue(key: string): Promise<BoardIssueSnapshot> {
    const entry = this.entries.get(key);
    if (entry instanceof Error) throw entry;
    if (!entry) throw new Error('missing');
    return entry;
  }
  async downloadAttachment(): Promise<Uint8Array> { return new Uint8Array(); }
}
function fixture(key: string): BoardIssueSnapshot {
  return { key, url: `https://example.test/browse/${key}`, summary: key, description: '', status: 'Open', issueType: 'Task', priority: 'Low', assignee: '', reporter: '', created: '', updated: '', labels: [], parentKey: '', comments: [], attachments: [] };
}
async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jira-markdown-exporter-'));
  temporaryDirectories.push(directory);
  return directory;
}
