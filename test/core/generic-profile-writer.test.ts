import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardIssueSnapshot } from '../../src/domain/board-snapshot.js';
import { loadOutputProfile } from '../../src/output/output-profile.js';
import { attachmentStorageName, writeOutputProfileSnapshot } from '../../src/output/profile-writer.js';
import { ExporterTransportError } from '../../src/transport.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('generic-v1 writer', () => {
  it('owns only its snapshot directory and is idempotent', async () => {
    const outputDir = await temporaryDirectory();
    const issueRoot = join(outputDir, 'PROJ-123');
    await mkdir(issueRoot, { recursive: true });
    const consumerFile = join(issueRoot, 'consumer-note.md');
    await writeFile(consumerFile, '# Consumer-owned\n');

    const first = await writeGenericSnapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1, 2, 3]),
    });
    const generatedFiles = ['issue.md', 'comments.md', 'attachments.md', 'metadata.md'];
    const initial = await Promise.all(generatedFiles.map((file) => readFile(join(first.issueDir, file), 'utf8')));
    expect(initial[0]).toContain('_No linked issues._');
    await writeFile(join(first.issueDir, 'obsolete.md'), 'owned and removable\n');
    await writeGenericSnapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([1, 2, 3]),
    });
    const repeated = await Promise.all(generatedFiles.map((file) => readFile(join(first.issueDir, file), 'utf8')));

    expect(repeated).toEqual(initial);
    expect(await readFile(consumerFile, 'utf8')).toBe('# Consumer-owned\n');
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
    const result = await writeGenericSnapshot(issue, {
      outputDir, downloadAttachments: true, downloadAttachment: async () => new Uint8Array([9]),
    });
    const markdown = await readFile(join(result.issueDir, 'issue.md'), 'utf8');

    expect(markdown).toContain('![first](<./attachments/20-design.png>)');
    expect(markdown).toContain('![second](<./attachments/21-design.png>)');
    expect(markdown).toContain('![ambiguous](./attachments/design.png)');
    expect(attachmentStorageName(issue.attachments[0])).toBe('20-design.png');
    expect(attachmentStorageName({ id: 'id/unsafe', filename: '../evil?.png' })).toBe('id_unsafe-evil_.png');
  });

  it('distinguishes disabled attachment downloads from failed downloads', async () => {
    const outputDir = await temporaryDirectory();
    const initial = await writeGenericSnapshot(fixtureIssue(), { outputDir });
    const metadataOnly = await readFile(join(initial.issueDir, 'issue.md'), 'utf8');
    expect(metadataOnly).toContain('Attachment downloads are disabled for this sync: design.png');
    expect(metadataOnly).not.toContain('Image could not be downloaded');
    expect(await readFile(join(initial.issueDir, 'attachments.md'), 'utf8')).toContain('not downloaded');
    await expect(writeGenericSnapshot(fixtureIssue(), {
      outputDir, downloadAttachments: true, downloadAttachment: async () => { throw new Error('network down'); },
    })).resolves.toMatchObject({ downloadedAttachments: 0 });
    const failedDownload = await readFile(join(initial.issueDir, 'issue.md'), 'utf8');
    expect(failedDownload).toContain('Image could not be downloaded: design.png');
    expect(failedDownload).not.toContain('downloads are disabled');
    expect(await readFile(join(initial.issueDir, 'attachments.md'), 'utf8')).toContain('download failed');
  });

  it('records only the bounded HTTP status for attachment transport failures', async () => {
    const outputDir = await temporaryDirectory();
    const result = await writeGenericSnapshot(fixtureIssue(), {
      outputDir,
      downloadAttachments: true,
      downloadAttachment: async () => {
        throw new ExporterTransportError('ATTACHMENT_TRANSPORT_HTTP_ERROR', 'attachment', 303);
      },
    });

    expect(result.warnings).toEqual(['design.png: Attachment transport returned an HTTP error (HTTP 303)']);
    expect(await readFile(join(result.issueDir, 'metadata.md'), 'utf8'))
      .toContain('design.png: Attachment transport returned an HTTP error (HTTP 303)');
  });
});

async function writeGenericSnapshot(
  issue: BoardIssueSnapshot,
  options: {
    outputDir: string;
    downloadAttachments?: boolean;
    downloadAttachment?: (attachment: BoardIssueSnapshot['attachments'][number]) => Promise<Uint8Array>;
  },
) {
  return writeOutputProfileSnapshot(issue, { ...options, profile: await loadOutputProfile() });
}

function fixtureIssue(): BoardIssueSnapshot {
  return {
    key: 'PROJ-123', url: 'https://example.test/browse/PROJ-123', summary: 'A fixture',
    description: '![design](./attachments/design.png)', status: 'In Progress', issueType: 'Task', priority: 'Medium',
    assignee: 'Person', reporter: 'Reporter', created: '2026-08-01T00:00:00.000Z', updated: '2026-08-02T00:00:00.000Z',
    labels: ['zeta', 'alpha'], parentKey: '', linkedIssues: [], comments: [], attachments: [{
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
