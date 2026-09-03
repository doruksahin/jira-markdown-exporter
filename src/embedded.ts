import type { JiraConfig } from './config/jira-config.js';
import type { ExportResult } from './domain/export-result.js';
import { JiraBoardIssueReader } from './jira/jira-board-issue-reader.js';
import { JiraTransportReadClient } from './jira/transport-jira-client.js';
import type { OutputProfile } from './output/output-profile.js';
import { runExport } from './runner/run-export.js';
import { ExporterTransportError, type AttachmentGetTransport, type JiraGetTransport } from './transport.js';

export { JIRA_MARKDOWN_EXPORTER_VERSION } from './version.js';
export { parseExportReceipt, parseOutputProfileManifest } from './schema-parsers.js';
export { calculateOutputProfileDigest } from './output/output-profile.js';

export interface EmbeddedJiraMarkdownExportRequest extends Pick<JiraConfig, 'host'> {
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly outputDir: string;
  readonly downloadAttachments?: boolean;
  readonly outputProfile: OutputProfile;
}

export interface EmbeddedJiraMarkdownExporterDependencies {
  readonly jiraGet: JiraGetTransport;
  readonly attachmentGet?: AttachmentGetTransport;
}

/** Embedded-safe export path: injected GET only, with no native network fallback. */
export async function exportJiraMarkdown(
  request: EmbeddedJiraMarkdownExportRequest,
  dependencies: EmbeddedJiraMarkdownExporterDependencies,
): Promise<ExportResult> {
  if (request.downloadAttachments && !dependencies.attachmentGet) {
    throw new ExporterTransportError('ATTACHMENT_TRANSPORT_REQUIRED', 'attachment');
  }
  const client = new JiraTransportReadClient(request, dependencies.jiraGet);
  const reader = new JiraBoardIssueReader(request, client, dependencies.attachmentGet);
  return runExport(reader, {
    issueKeys: request.issueKeys,
    jql: request.jql,
    outputDir: request.outputDir,
    downloadAttachments: request.downloadAttachments,
    outputProfile: request.outputProfile,
  });
}

export { createJiraReadApi } from './jira/jira-read-api.js';
export { ExporterTransportError } from './transport.js';
export type { JiraConfig } from './config/jira-config.js';
export type { ExportResult, ExportedIssueFailure, ExportedIssueResult, ExportStatus } from './domain/export-result.js';
export type { OutputProfile, OutputProfileManifest } from './output/output-profile.js';
export type {
  JiraBoardRecord,
  JiraFieldRecord,
  JiraIssueEvidence,
  JiraIssueList,
  JiraIssueRecord,
  JiraProjectRecord,
  JiraReadApi,
  JiraSprintRecord,
  JiraUserRecord,
} from './jira/jira-read-api.js';
export type {
  AttachmentGetTransport,
  AttachmentGetTransportRequest,
  AttachmentGetTransportResponse,
  ExporterTransportErrorCode,
  ExporterTransportOperation,
  JiraGetTransport,
  JiraGetTransportRequest,
  JiraGetTransportResponse,
  TransportHeaders,
} from './transport.js';
