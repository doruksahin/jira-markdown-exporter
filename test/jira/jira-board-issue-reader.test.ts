import { describe, expect, it } from 'vitest';
import { assertJiraOrigin, convertBoardIssue, JiraBoardIssueReader } from '../../src/jira/jira-board-issue-reader.js';

const config = { host: 'https://acme.atlassian.net', email: 'person@example.test', apiToken: 'token' };

describe('JiraBoardIssueReader', () => {
  it('follows enhanced-search page tokens and de-duplicates keys', async () => {
    const urls: string[] = [];
    const responses = [
      { issues: [{ key: 'ATT-1' }, { key: 'ATT-2' }], nextPageToken: 'next' },
      { issues: [{ key: 'ATT-2' }, { key: 'ATT-3' }] },
    ];
    const reader = new JiraBoardIssueReader(config, (async (input) => {
      urls.push(String(input));
      return Response.json(responses.shift());
    }) as typeof fetch);
    await expect(reader.searchIssueKeys('project = ATT')).resolves.toEqual(['ATT-1', 'ATT-2', 'ATT-3']);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('nextPageToken=next');
  });

  it('paginates comments until Jira total is reached', async () => {
    const reader = new JiraBoardIssueReader(config, (async (input) => {
      const url = String(input);
      if (url.includes('/comment?')) {
        return Response.json(url.includes('startAt=0')
          ? { comments: [{ id: '1', created: '2026-01-01' }], total: 2 }
          : { comments: [{ id: '2', created: '2026-01-02' }], total: 2 });
      }
      return Response.json({ key: 'ATT-1', fields: { summary: 'One' } });
    }) as typeof fetch);
    const issue = await reader.fetchIssue('ATT-1');
    expect(issue.comments.map((comment) => comment.id)).toEqual(['1', '2']);
  });

  it('rejects foreign attachment origins before requesting them', () => {
    expect(() => assertJiraOrigin('https://evil.example/file', config.host)).toThrow('outside configured Jira origin');
    expect(assertJiraOrigin('https://acme.atlassian.net/secure/attachment/1/file.png', config.host)).toContain('/secure/attachment');
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
