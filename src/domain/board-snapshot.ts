/** A read-only, provider-neutral snapshot of one Jira issue. */
export interface BoardCommentSnapshot {
  readonly id: string;
  readonly author: string;
  readonly created: string;
  readonly updated: string;
  readonly body: string;
}

/** Metadata for an attachment. `contentUrl` is intentionally never rendered. */
export interface BoardAttachmentSnapshot {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number | null;
  readonly author: string;
  readonly created: string;
  readonly contentUrl: string;
  readonly isImage: boolean;
  readonly inlineInDescription: boolean;
}

export interface BoardIssueSnapshot {
  readonly key: string;
  readonly url: string;
  readonly summary: string;
  readonly description: string;
  readonly status: string;
  readonly issueType: string;
  readonly priority: string;
  readonly assignee: string;
  readonly reporter: string;
  readonly created: string;
  readonly updated: string;
  readonly labels: readonly string[];
  readonly parentKey: string;
  readonly comments: readonly BoardCommentSnapshot[];
  readonly attachments: readonly BoardAttachmentSnapshot[];
}

export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function normalizeIssueKey(value: string): string {
  const key = value.trim().toUpperCase();
  if (!JIRA_ISSUE_KEY.test(key)) throw new Error(`Invalid Jira issue key: ${value}`);
  return key;
}
