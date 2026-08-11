import type { BoardAttachmentSnapshot, BoardCommentSnapshot, BoardIssueLinkSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';
import type { BoardIssueReader } from '../ports/board-issue-reader.js';
import type { JiraConfig } from '../config/jira-config.js';
import { adfToMarkdown } from './adf-to-markdown.js';
import { assertAllowedAttachmentUrl } from './attachment-url-policy.js';

const PAGE_SIZE = 100;
const ISSUE_FIELDS = ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated', 'labels', 'parent', 'issuelinks', 'attachment'];

export class JiraBoardIssueReader implements BoardIssueReader {
  private readonly authorization: string;
  private readonly origin: string;

  constructor(private readonly config: JiraConfig, private readonly request: typeof fetch = fetch) {
    this.origin = new URL(config.host).origin;
    this.authorization = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`;
  }

  async searchIssueKeys(jql: string): Promise<readonly string[]> {
    const keys: string[] = [];
    const seenTokens = new Set<string>();
    let nextPageToken: string | undefined;
    do {
      const params = new URLSearchParams({ jql, maxResults: String(PAGE_SIZE), fields: 'key' });
      if (nextPageToken) params.set('nextPageToken', nextPageToken);
      const page = await this.getJson<SearchPage>(`/rest/api/3/search/jql?${params}`);
      for (const issue of page.issues ?? []) if (issue.key) keys.push(issue.key);
      const next = page.nextPageToken?.trim() || undefined;
      if (next && seenTokens.has(next)) throw new Error('Jira search returned a repeated page token');
      if (next) seenTokens.add(next);
      nextPageToken = next;
    } while (nextPageToken);
    return [...new Set(keys)];
  }

  async fetchIssue(issueKey: string): Promise<BoardIssueSnapshot> {
    const fields = ISSUE_FIELDS.join(',');
    const [issue, comments] = await Promise.all([
      this.getJson<JiraIssue>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fields)}`),
      this.fetchAllComments(issueKey),
    ]);
    return convertBoardIssue(issue, comments, this.config.host);
  }

  async downloadAttachment(contentUrl: string): Promise<Uint8Array> {
    let url = assertAllowedAttachmentUrl(contentUrl, this.config.host);
    for (let redirects = 0; redirects < 5; redirects += 1) {
      const response = await this.request(url, { method: 'GET', headers: { Authorization: this.authorization }, redirect: 'manual' });
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

  private async fetchAllComments(issueKey: string): Promise<JiraComment[]> {
    const comments: JiraComment[] = [];
    let startAt = 0;
    while (true) {
      const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(PAGE_SIZE), orderBy: 'created' });
      const page = await this.getJson<CommentPage>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params}`);
      const batch = page.comments ?? [];
      comments.push(...batch);
      startAt += batch.length;
      if (batch.length === 0 || startAt >= (page.total ?? comments.length)) break;
    }
    return comments;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request(`${this.origin}${path}`, { headers: { Authorization: this.authorization, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Jira HTTP ${response.status} for ${path.split('?')[0]}`);
    return response.json() as Promise<T>;
  }
}

export function convertBoardIssue(issue: JiraIssue, rawComments: readonly JiraComment[], jiraHost: string): BoardIssueSnapshot {
  const fields = issue.fields ?? {};
  const attachments = (fields.attachment ?? []).map((attachment) => toAttachment(attachment));
  const attachmentNames = new Set(attachments.map((attachment) => attachment.filename));
  const description = adfToMarkdown(fields.description, attachmentNames);
  return {
    key: issue.key,
    url: `${new URL(jiraHost).origin}/browse/${issue.key}`,
    summary: fields.summary ?? '', description, status: fields.status?.name ?? '', issueType: fields.issuetype?.name ?? '', priority: fields.priority?.name ?? '',
    assignee: fields.assignee?.displayName ?? 'Unassigned', reporter: fields.reporter?.displayName ?? 'Unknown', created: fields.created ?? '', updated: fields.updated ?? '',
    labels: fields.labels ?? [], parentKey: fields.parent?.key ?? '',
    linkedIssues: (fields.issuelinks ?? []).flatMap((link) => toIssueLink(link, jiraHost)),
    comments: rawComments.map(toComment).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)),
    attachments: attachments.map((attachment) => ({ ...attachment, inlineInDescription: attachmentNames.has(attachment.filename) && description.includes(`attachments/${attachment.filename}`) })),
  };
}

function toComment(comment: JiraComment): BoardCommentSnapshot { return { id: comment.id ?? '', author: comment.author?.displayName ?? 'Unknown', created: comment.created ?? '', updated: comment.updated ?? '', body: adfToMarkdown(comment.body) }; }
function toAttachment(attachment: JiraAttachment): Omit<BoardAttachmentSnapshot, 'inlineInDescription'> { const mimeType = attachment.mimeType ?? 'application/octet-stream'; return { id: attachment.id ?? '', filename: attachment.filename ?? `attachment-${attachment.id ?? 'unknown'}`, mimeType, size: typeof attachment.size === 'number' ? attachment.size : null, author: attachment.author?.displayName ?? 'Unknown', created: attachment.created ?? '', contentUrl: attachment.content ?? '', isImage: mimeType.startsWith('image/') }; }
function toIssueLink(link: JiraIssueLink, jiraHost: string): readonly BoardIssueLinkSnapshot[] {
  const direction = link.outwardIssue ? 'outward' : link.inwardIssue ? 'inward' : undefined;
  const issue = direction === 'outward' ? link.outwardIssue : link.inwardIssue;
  if (!direction || !issue?.key) return [];
  const relationship = link.type?.[direction]?.trim() || link.type?.name?.trim() || 'Linked issue';
  return [{
    relationship, key: issue.key, url: `${new URL(jiraHost).origin}/browse/${issue.key}`,
    summary: issue.fields?.summary ?? '', status: issue.fields?.status?.name ?? '',
    issueType: issue.fields?.issuetype?.name ?? '', assignee: issue.fields?.assignee?.displayName ?? '',
  }];
}

interface SearchPage { issues?: Array<{ key?: string }>; nextPageToken?: string; }
interface CommentPage { comments?: JiraComment[]; total?: number; }
interface JiraIssue { key: string; fields?: JiraFields; }
interface JiraFields { summary?: string; description?: unknown; status?: { name?: string }; issuetype?: { name?: string }; priority?: { name?: string }; assignee?: JiraPerson | null; reporter?: JiraPerson | null; created?: string; updated?: string; labels?: string[]; parent?: { key?: string }; issuelinks?: JiraIssueLink[]; attachment?: JiraAttachment[]; }
interface JiraComment { id?: string; author?: JiraPerson; created?: string; updated?: string; body?: unknown; }
interface JiraAttachment { id?: string; filename?: string; mimeType?: string; size?: number; author?: JiraPerson; created?: string; content?: string; }
interface JiraPerson { displayName?: string; }
interface JiraIssueLink { type?: { name?: string; inward?: string; outward?: string }; inwardIssue?: JiraLinkedIssue; outwardIssue?: JiraLinkedIssue; }
interface JiraLinkedIssue { key?: string; fields?: Pick<JiraFields, 'summary' | 'status' | 'issuetype' | 'assignee'>; }
