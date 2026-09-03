export type TransportHeaders = Readonly<Record<string, string | readonly string[]>>;

export interface JiraGetTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly responseType: 'json';
  readonly timeoutMs?: number;
}

export interface JiraGetTransportResponse {
  readonly status: number;
  readonly headers?: TransportHeaders;
  readonly body: unknown;
}

export type JiraGetTransport = (
  request: JiraGetTransportRequest,
) => Promise<JiraGetTransportResponse>;

export interface AttachmentGetTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly responseType: 'bytes';
  readonly timeoutMs?: number;
}

export interface AttachmentGetTransportResponse {
  readonly status: number;
  readonly headers?: TransportHeaders;
  readonly body: Uint8Array;
}

export interface AttachmentGetTransport {
  readonly get: (
    request: AttachmentGetTransportRequest,
  ) => Promise<AttachmentGetTransportResponse>;
}

export type ExporterTransportErrorCode =
  | 'JIRA_TRANSPORT_METHOD_NOT_ALLOWED'
  | 'JIRA_TRANSPORT_REQUEST_FAILED'
  | 'JIRA_TRANSPORT_INVALID_RESPONSE'
  | 'JIRA_TRANSPORT_HTTP_ERROR'
  | 'JIRA_PAGINATION_INVALID'
  | 'ATTACHMENT_TRANSPORT_REQUIRED'
  | 'ATTACHMENT_TRANSPORT_REQUEST_FAILED'
  | 'ATTACHMENT_TRANSPORT_INVALID_RESPONSE'
  | 'ATTACHMENT_TRANSPORT_HTTP_ERROR'
  | 'ATTACHMENT_REDIRECT_INVALID'
  | 'ATTACHMENT_REDIRECT_REJECTED'
  | 'ATTACHMENT_REDIRECT_LIMIT';

export type ExporterTransportOperation =
  | 'jira-json'
  | 'jira-search'
  | 'jira-issue'
  | 'jira-comments'
  | 'jira-myself'
  | 'jira-project'
  | 'jira-board'
  | 'jira-assignee'
  | 'jira-fields'
  | 'jira-board-sprints'
  | 'jira-board-issues'
  | 'jira-sprint-issues'
  | 'jira-assigned-issues'
  | 'attachment';

const ERROR_MESSAGES: Readonly<Record<ExporterTransportErrorCode, string>> = Object.freeze({
  JIRA_TRANSPORT_METHOD_NOT_ALLOWED: 'Jira transport rejected a non-GET request',
  JIRA_TRANSPORT_REQUEST_FAILED: 'Jira transport request failed',
  JIRA_TRANSPORT_INVALID_RESPONSE: 'Jira transport returned an invalid response',
  JIRA_TRANSPORT_HTTP_ERROR: 'Jira transport returned an HTTP error',
  JIRA_PAGINATION_INVALID: 'Jira pagination response was invalid',
  ATTACHMENT_TRANSPORT_REQUIRED: 'Attachment download requires an injected byte transport',
  ATTACHMENT_TRANSPORT_REQUEST_FAILED: 'Attachment transport request failed',
  ATTACHMENT_TRANSPORT_INVALID_RESPONSE: 'Attachment transport returned an invalid response',
  ATTACHMENT_TRANSPORT_HTTP_ERROR: 'Attachment transport returned an HTTP error',
  ATTACHMENT_REDIRECT_INVALID: 'Attachment redirect response was invalid',
  ATTACHMENT_REDIRECT_REJECTED: 'Attachment URL was rejected by origin policy',
  ATTACHMENT_REDIRECT_LIMIT: 'Attachment redirect limit was exceeded',
});

export class ExporterTransportError extends Error {
  readonly name = 'ExporterTransportError';
  readonly status?: number;
  readonly transportCode?: string;
  readonly retryable?: boolean;
  readonly attempts?: number;
  readonly transportSummary?: string;

  constructor(
    readonly code: ExporterTransportErrorCode,
    readonly operation: ExporterTransportOperation,
    facts: number | Readonly<{
      status?: number;
      transportCode?: string;
      retryable?: boolean;
      attempts?: number;
      summary?: string;
    }> = {},
  ) {
    super(ERROR_MESSAGES[code]);
    const normalized = typeof facts === 'number' ? { status: facts } : facts;
    const status = normalized.status;
    if (Number.isInteger(status) && Number(status) >= 100 && Number(status) <= 599) {
      this.status = Number(status);
    }
    if (/^(?:[A-Z][A-Z0-9_]{0,63}|[a-z][a-z0-9_]{0,63})$/.test(String(normalized.transportCode || ''))) {
      this.transportCode = String(normalized.transportCode);
    }
    if (typeof normalized.retryable === 'boolean') this.retryable = normalized.retryable;
    if (Number.isInteger(normalized.attempts) && Number(normalized.attempts) >= 1 && Number(normalized.attempts) <= 10) {
      this.attempts = Number(normalized.attempts);
    }
    if (/^[A-Za-z][A-Za-z0-9 _.-]{0,119}$/.test(String(normalized.summary || ''))) {
      this.transportSummary = String(normalized.summary);
    }
  }

  withOperation(operation: ExporterTransportOperation): ExporterTransportError {
    return new ExporterTransportError(this.code, operation, {
      status: this.status,
      transportCode: this.transportCode,
      retryable: this.retryable,
      attempts: this.attempts,
      summary: this.transportSummary,
    });
  }

  toJSON(): Readonly<{
    code: ExporterTransportErrorCode;
    operation: ExporterTransportOperation;
    status?: number;
    transportCode?: string;
    retryable?: boolean;
    attempts?: number;
    transportSummary?: string;
  }> {
    return Object.freeze({
      code: this.code,
      operation: this.operation,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.transportCode === undefined ? {} : { transportCode: this.transportCode }),
      ...(this.retryable === undefined ? {} : { retryable: this.retryable }),
      ...(this.attempts === undefined ? {} : { attempts: this.attempts }),
      ...(this.transportSummary === undefined ? {} : { transportSummary: this.transportSummary }),
    });
  }
}

export function exporterTransportFailure(error: unknown): Readonly<{
  code: ExporterTransportErrorCode;
  operation: ExporterTransportOperation;
  summary: string;
  status?: number;
  transportCode?: string;
  retryable?: boolean;
  attempts?: number;
}> | undefined {
  if (!(error instanceof ExporterTransportError)) return undefined;
  return Object.freeze({
    code: error.code,
    operation: error.operation,
    summary: error.message,
    ...(error.status === undefined ? {} : { status: error.status }),
    ...(error.transportCode === undefined ? {} : { transportCode: error.transportCode }),
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.attempts === undefined ? {} : { attempts: error.attempts }),
  });
}
