export type ExportStatus = 'success' | 'partial' | 'failed';

export interface ExportedIssueFailure {
  readonly code: string;
  readonly operation: string;
  readonly summary: string;
  readonly status?: number;
  readonly transportCode?: string;
  readonly retryable?: boolean;
  readonly attempts?: number;
}

export interface ExportedIssueResult {
  readonly key: string;
  readonly status: 'synced' | 'failed';
  readonly issueDir?: string;
  readonly comments?: number;
  readonly attachments?: number;
  readonly downloadedAttachments?: number;
  readonly warnings?: readonly string[];
  readonly error?: string;
  readonly failure?: ExportedIssueFailure;
}

/** Public receipt returned by the runner and serialized by the CLI. */
export interface ExportResult {
  readonly schemaVersion: 1;
  readonly exporterVersion: string;
  readonly profileId: string;
  readonly profileDigest: `sha256:${string}`;
  readonly status: ExportStatus;
  readonly total: number;
  readonly synced: number;
  readonly failed: number;
  readonly outputDir: string;
  readonly issues: readonly ExportedIssueResult[];
}
