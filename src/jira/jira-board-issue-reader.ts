import type { BoardAttachmentSnapshot, BoardCommentSnapshot, BoardIssueLinkSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';
import type { BoardIssueReader } from '../ports/board-issue-reader.js';
import type { JiraConfig } from '../config/jira-config.js';
import type { Version3Models } from 'jira.js/version3';
import { adfToMarkdown } from './adf-to-markdown.js';
import { assertAllowedAttachmentUrl } from './attachment-url-policy.js';
import { JiraSdkReadClient, type JiraReadClient } from './jira-read-client.js';

const PAGE_SIZE = 100;
const ISSUE_FIELDS = [
  'summary', 'description', 'status', 'issuetype', 'priority', 'assignee',
  'reporter', 'created', 'updated', 'labels', 'parent', 'issuelinks', 'attachment',
];

export class JiraBoardIssueReader implements BoardIssueReader {
  constructor(
    private readonly config: JiraConfig,
    private readonly client: JiraReadClient = new JiraSdkReadClient(config),
    private readonly request: typeof fetch = fetch,
  ) {}

  async searchIssueKeys(jql: string): Promise<readonly string[]> {
    const keys: string[] = [];
    const seenTokens = new Set<string>();
    let nextPageToken: string | undefined;
    do {
      const page = await this.client.searchIssues({
        jql,
        maxResults: PAGE_SIZE,
        fields: ['key'],
        nextPageToken,
      });
      for (const issue of page.issues ?? []) if (issue.key) keys.push(issue.key);
      const next = page.nextPageToken?.trim() || undefined;
      if (next && seenTokens.has(next)) throw new Error('Jira search returned a repeated page token');
      if (next) seenTokens.add(next);
      nextPageToken = next;
    } while (nextPageToken);
    return [...new Set(keys)];
  }

  async fetchIssue(issueKey: string): Promise<BoardIssueSnapshot> {
    const [issue, comments] = await Promise.all([
      this.client.getIssue({ issueIdOrKey: issueKey, fields: ISSUE_FIELDS }),
      this.fetchAllComments(issueKey),
    ]);
    return convertBoardIssue(issue, comments, this.config.host);
  }

  async downloadAttachment(contentUrl: string): Promise<Uint8Array> {
    let url = assertAllowedAttachmentUrl(contentUrl, this.config.host);
    for (let redirects = 0; redirects < 5; redirects += 1) {
      const response = await this.request(url, {
        method: 'GET',
        headers: { Authorization: basicAuthorization(this.config) },
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Attachment redirect had no location');
        url = assertAllowedAttachmentUrl(new URL(location, url).toString(), this.config.host);
        continue;
      }
      if (!response.ok) throw new Error(`Attachment HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }
    throw new Error('Attachment exceeded redirect limit');
  }

  private async fetchAllComments(issueKey: string): Promise<Version3Models.Comment[]> {
    const comments: Version3Models.Comment[] = [];
    let startAt = 0;
    while (true) {
      const page = await this.client.getComments({
        issueIdOrKey: issueKey,
        startAt,
        maxResults: PAGE_SIZE,
        orderBy: 'created',
      });
      const batch = page.comments ?? [];
      comments.push(...batch);
      startAt += batch.length;
      if (batch.length === 0 || startAt >= (page.total ?? comments.length)) break;
    }
    return comments;
  }

}

export function convertBoardIssue(issue: Version3Models.Issue, rawComments: readonly Version3Models.Comment[], jiraHost: string): BoardIssueSnapshot {
  const fields = issue.fields;
  const attachments = (fields.attachment ?? []).map((attachment) => toAttachment(attachment));
  const attachmentNames = new Set(attachments.map((attachment) => attachment.filename));
  const description = adfToMarkdown(fields.description, attachmentNames);
  return {
    key: issue.key,
    url: `${new URL(jiraHost).origin}/browse/${issue.key}`,
    summary: fields.summary ?? '',
    description,
    status: fields.status?.name ?? '',
    issueType: fields.issuetype?.name ?? '',
    priority: fields.priority?.name ?? '',
    assignee: fields.assignee?.displayName ?? 'Unassigned',
    reporter: fields.reporter?.displayName ?? 'Unknown',
    created: fields.created ?? '',
    updated: fields.updated ?? '',
    labels: fields.labels ?? [],
    parentKey: fields.parent?.key ?? '',
    linkedIssues: (fields.issuelinks ?? []).flatMap((link) => toIssueLink(link, jiraHost)),
    comments: rawComments.map(toComment).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)),
    attachments: attachments.map((attachment) => ({ ...attachment, inlineInDescription: attachmentNames.has(attachment.filename) && description.includes(`attachments/${attachment.filename}`) })),
  };
}

function toComment(comment: Version3Models.Comment): BoardCommentSnapshot {
  return {
    id: comment.id ?? '',
    author: comment.author?.displayName ?? 'Unknown',
    created: comment.created ?? '',
    updated: comment.updated ?? '',
    body: adfToMarkdown(comment.body),
  };
}

function toAttachment(attachment: Version3Models.Attachment): Omit<BoardAttachmentSnapshot, 'inlineInDescription'> {
  const mimeType = attachment.mimeType ?? 'application/octet-stream';
  return {
    id: attachment.id ?? '',
    filename: attachment.filename ?? `attachment-${attachment.id ?? 'unknown'}`,
    mimeType,
    size: typeof attachment.size === 'number' ? attachment.size : null,
    author: attachment.author?.displayName ?? 'Unknown',
    created: attachment.created ?? '',
    contentUrl: attachment.content ?? '',
    isImage: mimeType.startsWith('image/'),
  };
}

function toIssueLink(link: Version3Models.IssueLink, jiraHost: string): readonly BoardIssueLinkSnapshot[] {
  const direction = link.outwardIssue ? 'outward' : link.inwardIssue ? 'inward' : undefined;
  const issue = direction === 'outward' ? link.outwardIssue : link.inwardIssue;
  if (!direction || !issue?.key) return [];
  const relationship = link.type?.[direction]?.trim() || link.type?.name?.trim() || 'Linked issue';
  return [{
    relationship,
    key: issue.key,
    url: `${new URL(jiraHost).origin}/browse/${issue.key}`,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? '',
    issueType: issue.fields?.issuetype?.name ?? '',
    assignee: issue.fields?.assignee?.displayName ?? '',
  }];
}

function basicAuthorization(config: JiraConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`;
}
