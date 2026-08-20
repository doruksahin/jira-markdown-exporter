import { describe, expect, it } from 'vitest';
import { assertAllowedAttachmentUrl } from '../../src/jira/attachment-url-policy.js';
import { convertBoardIssue, JiraBoardIssueReader } from '../../src/jira/jira-board-issue-reader.js';
import type { JiraReadClient } from '../../src/jira/jira-read-client.js';

const config = { host: 'https://acme.atlassian.net', email: 'person@example.test', apiToken: 'token' };

describe('JiraBoardIssueReader', () => {
  it('follows enhanced-search page tokens and de-duplicates keys', async () => {
    const requests: Array<{ nextPageToken?: string }> = [];
    const responses = [
      { issues: [{ key: 'ATT-1' }, { key: 'ATT-2' }], nextPageToken: 'next' },
      { issues: [{ key: 'ATT-2' }, { key: 'ATT-3' }] },
    ];
    const reader = new JiraBoardIssueReader(config, fakeClient({
      searchIssues: async (request) => {
        requests.push(request);
        return responses.shift() ?? {};
      },
    }));
    await expect(reader.searchIssueKeys('project = ATT')).resolves.toEqual(['ATT-1', 'ATT-2', 'ATT-3']);
    expect(requests).toEqual([
      { jql: 'project = ATT', maxResults: 100, fields: ['key'], nextPageToken: undefined },
      { jql: 'project = ATT', maxResults: 100, fields: ['key'], nextPageToken: 'next' },
    ]);
  });

  it('paginates comments until Jira total is reached', async () => {
    const requests: Array<{ startAt?: number }> = [];
    const issueRequests: Array<{ fields?: string[] }> = [];
    const reader = new JiraBoardIssueReader(config, fakeClient({
      getIssue: async (request) => {
        issueRequests.push(request);
        return asJiraIssue({ key: 'ATT-1', fields: { summary: 'One' } });
      },
      getComments: async (request) => {
        requests.push(request);
        return request.startAt === 0
          ? asJiraComments({ comments: [{ id: '1', created: '2026-01-01' }], total: 2 })
          : asJiraComments({ comments: [{ id: '2', created: '2026-01-02' }], total: 2 });
      },
    }));
    const issue = await reader.fetchIssue('ATT-1');
    expect(issue.comments.map((comment) => comment.id)).toEqual(['1', '2']);
    expect(requests).toEqual([
      { issueIdOrKey: 'ATT-1', startAt: 0, maxResults: 100, orderBy: 'created' },
      { issueIdOrKey: 'ATT-1', startAt: 1, maxResults: 100, orderBy: 'created' },
    ]);
    expect(issueRequests).toEqual([{ issueIdOrKey: 'ATT-1', fields: expect.arrayContaining(['summary', 'issuelinks', 'attachment']) }]);
  });

  it('normalizes inward and outward Jira issue links without fetching linked issues', () => {
    const issue = convertBoardIssue({ key: 'ATT-1', fields: {
      issuelinks: [
        { type: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }, outwardIssue: { key: 'ATT-2', fields: { summary: 'Blocked issue', status: { name: 'To Do' }, issuetype: { name: 'Bug' }, assignee: { displayName: 'Ari' } } } },
        { type: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }, inwardIssue: { key: 'ATT-3', fields: { summary: 'Blocking issue', status: { name: 'In Progress' }, issuetype: { name: 'Task' }, assignee: { displayName: 'Bea' } } } },
      ],
    } }, [], config.host);

    expect(issue.linkedIssues).toEqual([
      { relationship: 'blocks', key: 'ATT-2', url: 'https://acme.atlassian.net/browse/ATT-2', summary: 'Blocked issue', status: 'To Do', issueType: 'Bug', assignee: 'Ari' },
      { relationship: 'is blocked by', key: 'ATT-3', url: 'https://acme.atlassian.net/browse/ATT-3', summary: 'Blocking issue', status: 'In Progress', issueType: 'Task', assignee: 'Bea' },
    ]);
  });

  it('allows the exact Jira and Atlassian media origins, but rejects foreign hosts', () => {
    expect(assertAllowedAttachmentUrl('https://acme.atlassian.net/secure/attachment/1/file.png', config.host)).toContain('/secure/attachment');
    expect(assertAllowedAttachmentUrl('https://api.media.atlassian.com/file/1/binary', config.host)).toContain('/file/1/binary');
    expect(() => assertAllowedAttachmentUrl('https://evil.example/file', config.host)).toThrow('outside the trusted Jira/Atlassian origins');
    expect(() => assertAllowedAttachmentUrl('https://api.media.atlassian.com.evil.example/file', config.host)).toThrow('outside the trusted Jira/Atlassian origins');
  });

  it('downloads attachment bytes from the canonical non-redirecting Jira endpoint', async () => {
    const urls: string[] = [];
    const reader = new JiraBoardIssueReader(config, fakeClient(), {
      get: async (request) => {
        urls.push(request.url);
        return { status: 200, headers: {}, body: new Uint8Array([1, 2, 3]) };
      },
    });
    await expect(reader.downloadAttachment(attachment('1'))).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(urls).toEqual(['https://acme.atlassian.net/rest/api/3/attachment/content/1?redirect=false']);
  });

  it('does not execute Jira content URLs and rejects redirects or malformed attachment IDs', async () => {
    const urls: string[] = [];
    const reader = new JiraBoardIssueReader(config, fakeClient(), {
      get: async (request) => {
        urls.push(request.url);
        return { status: 303, headers: { location: 'https://evil.example/file' }, body: new Uint8Array() };
      },
    });
    await expect(reader.downloadAttachment({ ...attachment('1'), contentUrl: 'https://evil.example/file' }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_TRANSPORT_HTTP_ERROR', status: 303 });
    await expect(reader.downloadAttachment(attachment('../1')))
      .rejects.toMatchObject({ code: 'ATTACHMENT_REDIRECT_REJECTED' });
    expect(urls).toEqual(['https://acme.atlassian.net/rest/api/3/attachment/content/1?redirect=false']);
  });

  it('renders an attached ADF media node as a local Markdown image', () => {
    const issue = convertBoardIssue({ key: 'ATT-1', fields: {
      description: { type: 'doc', content: [{ type: 'mediaSingle', content: [{ type: 'media', attrs: { alt: 'design.png' } }] }] },
      attachment: [{ id: '1', filename: 'design.png', mimeType: 'image/png' }],
    } }, [], config.host);
    expect(issue.description).toContain('![design.png](./attachments/design.png)');
    expect(issue.attachments[0]?.inlineInDescription).toBe(true);
  });
});

function fakeClient(overrides: Partial<JiraReadClient> = {}): JiraReadClient {
  return {
    searchIssues: async () => { throw new Error('Unexpected Jira search'); },
    getIssue: async () => { throw new Error('Unexpected Jira issue read'); },
    getComments: async () => { throw new Error('Unexpected Jira comment read'); },
    ...overrides,
  };
}

function asJiraIssue(value: unknown) {
  return value as import('jira.js/version3').Version3Models.Issue;
}

function asJiraComments(value: unknown) {
  return value as import('jira.js/version3').Version3Models.PageOfComments;
}

function attachment(id: string) {
  return {
    id,
    filename: 'design.png',
    mimeType: 'image/png',
    size: 3,
    author: 'Person',
    created: '2026-08-20T00:00:00.000Z',
    contentUrl: 'https://acme.atlassian.net/secure/attachment/1/design.png',
    isImage: true,
    inlineInDescription: true,
  };
}
