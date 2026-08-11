import { adfToMarkdown } from './adf-to-markdown.js';
const PAGE_SIZE = 100;
const ISSUE_FIELDS = ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated', 'labels', 'parent', 'attachment'];
export class JiraBoardIssueReader {
    config;
    request;
    authorization;
    origin;
    constructor(config, request = fetch) {
        this.config = config;
        this.request = request;
        this.origin = new URL(config.host).origin;
        this.authorization = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`;
    }
    async searchIssueKeys(jql) {
        const keys = [];
        const seenTokens = new Set();
        let nextPageToken;
        do {
            const params = new URLSearchParams({ jql, maxResults: String(PAGE_SIZE), fields: 'key' });
            if (nextPageToken)
                params.set('nextPageToken', nextPageToken);
            const page = await this.getJson(`/rest/api/3/search/jql?${params}`);
            for (const issue of page.issues ?? [])
                if (issue.key)
                    keys.push(issue.key);
            const next = page.nextPageToken?.trim() || undefined;
            if (next && seenTokens.has(next))
                throw new Error('Jira search returned a repeated page token');
            if (next)
                seenTokens.add(next);
            nextPageToken = next;
        } while (nextPageToken);
        return [...new Set(keys)];
    }
    async fetchIssue(issueKey) {
        const fields = ISSUE_FIELDS.join(',');
        const [issue, comments] = await Promise.all([
            this.getJson(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fields)}`),
            this.fetchAllComments(issueKey),
        ]);
        return convertBoardIssue(issue, comments, this.config.host);
    }
    async downloadAttachment(contentUrl) {
        let url = assertJiraOrigin(contentUrl, this.config.host);
        for (let redirects = 0; redirects < 5; redirects += 1) {
            const response = await this.request(url, { method: 'GET', headers: { Authorization: this.authorization }, redirect: 'manual' });
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location)
                    throw new Error('Attachment redirect had no location');
                url = assertJiraOrigin(new URL(location, url).toString(), this.config.host);
                continue;
            }
            if (!response.ok)
                throw new Error(`Attachment HTTP ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
        }
        throw new Error('Attachment exceeded redirect limit');
    }
    async fetchAllComments(issueKey) {
        const comments = [];
        let startAt = 0;
        while (true) {
            const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(PAGE_SIZE), orderBy: 'created' });
            const page = await this.getJson(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params}`);
            const batch = page.comments ?? [];
            comments.push(...batch);
            startAt += batch.length;
            if (batch.length === 0 || startAt >= (page.total ?? comments.length))
                break;
        }
        return comments;
    }
    async getJson(path) {
        const response = await this.request(`${this.origin}${path}`, { headers: { Authorization: this.authorization, Accept: 'application/json' } });
        if (!response.ok)
            throw new Error(`Jira HTTP ${response.status} for ${path.split('?')[0]}`);
        return response.json();
    }
}
export function assertJiraOrigin(contentUrl, jiraHost) {
    const source = new URL(contentUrl);
    if (source.origin !== new URL(jiraHost).origin)
        throw new Error(`Attachment host is outside configured Jira origin: ${source.origin}`);
    return source.toString();
}
export function convertBoardIssue(issue, rawComments, jiraHost) {
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
        comments: rawComments.map(toComment).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)),
        attachments: attachments.map((attachment) => ({ ...attachment, inlineInDescription: attachmentNames.has(attachment.filename) && description.includes(`attachments/${attachment.filename}`) })),
    };
}
function toComment(comment) { return { id: comment.id ?? '', author: comment.author?.displayName ?? 'Unknown', created: comment.created ?? '', updated: comment.updated ?? '', body: adfToMarkdown(comment.body) }; }
function toAttachment(attachment) { const mimeType = attachment.mimeType ?? 'application/octet-stream'; return { id: attachment.id ?? '', filename: attachment.filename ?? `attachment-${attachment.id ?? 'unknown'}`, mimeType, size: typeof attachment.size === 'number' ? attachment.size : null, author: attachment.author?.displayName ?? 'Unknown', created: attachment.created ?? '', contentUrl: attachment.content ?? '', isImage: mimeType.startsWith('image/') }; }
