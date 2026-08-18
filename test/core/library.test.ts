import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportJiraMarkdown } from '../../src/index.js';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import type { OutputProfile } from '../../src/output/output-profile.js';
import type { BoardIssueReader } from '../../src/ports/board-issue-reader.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('exportJiraMarkdown', () => {
  it('uses explicit in-memory configuration and profile without process environment or stdout', async () => {
    const outputDir = await temporaryDirectory();
    const receipt = await exportJiraMarkdown({
      host: 'https://example.atlassian.net',
      email: 'person@example.test',
      apiToken: 'test-only-token',
      issueKeys: ['ATT-1'],
      outputDir,
      outputProfile: inlineProfile,
    }, { reader: new FakeReader() });

    expect(receipt).toMatchObject({ schemaVersion: 1, status: 'success', total: 1, synced: 1 });
    expect(await readFile(join(outputDir, 'ATT-1', '40 Jira', '00 Issue.md'), 'utf8'))
      .toBe('# ATT-1\nLibrary fixture\n');
  });
});

const inlineProfile: OutputProfile = {
  manifest: {
    id: 'work-os-v1',
    schemaVersion: 1,
    ownedDirectory: '40 Jira',
    attachmentsDirectory: 'attachments',
    files: [{ template: '00 Issue.md.liquid', output: '00 Issue.md' }],
  },
  templates: { '00 Issue.md.liquid': '# {{ issue.key }}\n{{ issue.summary }}\n' },
};

class FakeReader implements BoardIssueReader {
  async searchIssueKeys(): Promise<readonly string[]> { return ['ATT-1']; }
  async fetchIssue(): Promise<BoardIssueSnapshot> {
    return {
      key: 'ATT-1', url: 'https://example.atlassian.net/browse/ATT-1', summary: 'Library fixture',
      description: '', status: 'Open', issueType: 'Task', priority: 'Medium', assignee: 'Person',
      reporter: 'Reporter', created: '', updated: '', labels: [], parentKey: '', linkedIssues: [],
      comments: [], attachments: [],
    };
  }
  async downloadAttachment(): Promise<Uint8Array> { return new Uint8Array(); }
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jira-markdown-library-'));
  temporaryDirectories.push(directory);
  return directory;
}
