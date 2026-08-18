import type { BoardAttachmentSnapshot, BoardCommentSnapshot, BoardIssueLinkSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';

export interface ExportTemplateModel {
  readonly issue: {
    readonly key: string;
    readonly url: string;
    readonly summary: string;
    readonly description: string;
    readonly updated: string;
    readonly metadata: readonly TemplateMetadata[];
  };
  readonly comments: readonly TemplateComment[];
  readonly linkedIssues: readonly TemplateIssueLink[];
  readonly attachments: readonly TemplateAttachment[];
  readonly sync: {
    readonly attachmentCount: number;
    readonly downloadedAttachments: number;
    readonly attachmentDownloadsEnabled: boolean;
    readonly warnings: readonly string[];
  };
}

export interface TemplateMetadata { readonly name: string; readonly value: string; }
export interface TemplateComment { readonly id: string; readonly author: string; readonly created: string; readonly date: string; readonly updatedNote: string; readonly body: string; }
export interface TemplateIssueLink { readonly relationship: string; readonly key: string; readonly url: string; readonly summary: string; readonly status: string; readonly issueType: string; readonly assignee: string; }
export interface TemplateAttachment { readonly id: string; readonly filename: string; readonly mimeType: string; readonly size: number | null; readonly author: string; readonly created: string; readonly localPath: string; }

/**
 * Creates the intentionally small, credential-free view exposed to templates.
 * In particular, attachment content URLs never leave the download layer.
 */
export function createExportTemplateModel(
  issue: BoardIssueSnapshot,
  localPaths: ReadonlyMap<string, string>,
  downloadedAttachments: number,
  attachmentDownloadsEnabled: boolean,
  warnings: readonly string[],
): ExportTemplateModel {
  return {
    issue: {
      key: issue.key,
      url: issue.url,
      summary: issue.summary,
      description: issue.description,
      updated: issue.updated,
      metadata: metadata(issue),
    },
    comments: [...issue.comments].sort(compareComments).map(toTemplateComment),
    linkedIssues: [...issue.linkedIssues].sort(compareIssueLinks).map(toTemplateIssueLink),
    attachments: sortedAttachments(issue.attachments).map((attachment) => ({
      id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType,
      size: attachment.size, author: attachment.author, created: attachment.created,
      localPath: localPaths.get(attachment.id) ?? '',
    })),
    sync: { attachmentCount: issue.attachments.length, downloadedAttachments, attachmentDownloadsEnabled, warnings },
  };
}

function metadata(issue: BoardIssueSnapshot): readonly TemplateMetadata[] {
  return [
    { name: 'Jira', value: `[${issue.key}](<${issue.url}>)` }, { name: 'Status', value: issue.status },
    { name: 'Type', value: issue.issueType }, { name: 'Priority', value: issue.priority },
    { name: 'Assignee', value: issue.assignee }, { name: 'Reporter', value: issue.reporter },
    { name: 'Created', value: issue.created || '—' }, { name: 'Updated', value: issue.updated || '—' },
    { name: 'Parent', value: issue.parentKey || '—' },
    { name: 'Labels', value: issue.labels.length ? [...issue.labels].sort().map((label) => `\`${label}\``).join(', ') : '—' },
  ];
}

function toTemplateComment(comment: BoardCommentSnapshot): TemplateComment {
  return {
    id: comment.id || '—', author: comment.author, created: comment.created || '—',
    date: comment.created ? comment.created.slice(0, 10) : 'No date',
    updatedNote: comment.updated && comment.updated !== comment.created ? ` · updated ${comment.updated}` : '',
    body: comment.body || '_No comment body._',
  };
}

function toTemplateIssueLink(link: BoardIssueLinkSnapshot): TemplateIssueLink {
  return {
    relationship: link.relationship || 'Linked issue', key: link.key, url: link.url,
    summary: link.summary || '—', status: link.status || '—', issueType: link.issueType || '—', assignee: link.assignee || '—',
  };
}

export function sortedAttachments(attachments: readonly BoardAttachmentSnapshot[]): readonly BoardAttachmentSnapshot[] {
  return [...attachments].sort((left, right) => left.id.localeCompare(right.id) || left.filename.localeCompare(right.filename));
}

function compareComments(left: BoardCommentSnapshot, right: BoardCommentSnapshot): number {
  return left.created.localeCompare(right.created) || left.id.localeCompare(right.id);
}

function compareIssueLinks(left: BoardIssueLinkSnapshot, right: BoardIssueLinkSnapshot): number {
  return left.relationship.localeCompare(right.relationship) || left.key.localeCompare(right.key);
}
