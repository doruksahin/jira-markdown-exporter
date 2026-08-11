import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import { attachmentStorageName, writeWorkOsV1Snapshot } from '../../src/output/work-os-v1-writer.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('work-os-v1 writer', () => {
  it('owns only 40 Jira and is idempotent', async () => {
    const outputDir = await temporaryDirectory();
    const taskDir = join(outputDir, 'ATT-123');
    await mkdir(taskDir, { recursive: true });
    const humanNote = join(taskDir, '00 Task.md');
    await writeFile(humanNote, '# Human-owned\n');

    const first = await writeWorkOsV1Snapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1, 2, 3]),
    });
    const generatedFiles = ['00 Issue.md', '10 Comments.md', '20 Attachments.md', '90 Sync.md'];
    const initial = await Promise.all(generatedFiles.map((file) => readFile(join(first.issueDir, file), 'utf8')));
    await writeFile(join(first.issueDir, 'obsolete.md'), 'owned and removable\n');
    await writeWorkOsV1Snapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1, 2, 3]),
    });
    const repeated = await Promise.all(generatedFiles.map((file) => readFile(join(first.issueDir, file), 'utf8')));

    expect(repeated).toEqual(initial);
    expect(await readFile(humanNote, 'utf8')).toBe('# Human-owned\n');
    await expect(readFile(join(first.issueDir, 'obsolete.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(first.issueDir, 'attachments', '20-design.png'))).toEqual(Buffer.from([1, 2, 3]));
  });

  it('uses attachment IDs for collision-safe binary paths and inline localization', async () => {
    const outputDir = await temporaryDirectory();
    const base = fixtureIssue();
    const issue: BoardIssueSnapshot = {
      ...base,
      description: '![first](attachment:20)\n![second](attachment:21)\n![ambiguous](./attachments/design.png)',
      attachments: [
        base.attachments[0],
        { ...base.attachments[0], id: '21', contentUrl: 'https://example.test/content/21' },
      ],
    };
    const result = await writeWorkOsV1Snapshot(issue, {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([9]),
    });
    const markdown = await readFile(join(result.issueDir, '00 Issue.md'), 'utf8');

    expect(markdown).toContain('![first](<./attachments/20-design.png>)');
    expect(markdown).toContain('![second](<./attachments/21-design.png>)');
    expect(markdown).toContain('![ambiguous](./attachments/design.png)');
    expect(attachmentStorageName(issue.attachments[0])).toBe('20-design.png');
    expect(attachmentStorageName({ id: 'id/unsafe', filename: '../evil?.png' })).toBe('id_unsafe-evil_.png');
  });

  it('leaves a readable generated packet when a later refresh download fails', async () => {
    const outputDir = await temporaryDirectory();
    const initial = await writeWorkOsV1Snapshot(fixtureIssue(), { outputDir });
    await expect(writeWorkOsV1Snapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => { throw new Error('network down'); },
    })).resolves.toMatchObject({ downloadedAttachments: 0 });
    expect(await readFile(join(initial.issueDir, '00 Issue.md'), 'utf8')).toContain('ATT-123');
  });
});

function fixtureIssue(): BoardIssueSnapshot {
  return {
    key: 'ATT-123', url: 'https://example.test/browse/ATT-123', summary: 'A fixture',
    description: '![design](./attachments/design.png)', status: 'In Progress', issueType: 'Task', priority: 'Medium',
    assignee: 'Doruk', reporter: 'PM', created: '2026-08-01T00:00:00.000Z', updated: '2026-08-02T00:00:00.000Z',
    labels: ['zeta', 'alpha'], parentKey: '', comments: [], attachments: [{
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
