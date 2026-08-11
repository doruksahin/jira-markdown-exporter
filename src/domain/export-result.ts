export type ExportStatus = 'success' | 'partial' | 'failed';

export interface ExportedIssueResult {
  readonly key: string;
  readonly status: 'synced' | 'failed';
  readonly issueDir?: string;
  readonly comments?: number;
  readonly attachments?: number;
  readonly downloadedAttachments?: number;
  readonly warnings?: readonly string[];
  readonly error?: string;
}

/** Public receipt returned by the runner and serialized by the CLI. */
export interface ExportResult {
  readonly schemaVersion: 1;
  readonly status: ExportStatus;
  readonly total: number;
  readonly synced: number;
  readonly failed: number;
  readonly outputDir: string;
  readonly issues: readonly ExportedIssueResult[];
}
