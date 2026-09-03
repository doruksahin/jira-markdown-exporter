import type { JiraConfig } from './config/jira-config.js';
import type { ExportResult } from './domain/export-result.js';
import { JiraBoardIssueReader } from './jira/jira-board-issue-reader.js';
import { JiraSdkReadClient } from './jira/jira-read-client.js';
import { nativeAttachmentTransport } from './jira/node-attachment-transport.js';
import type { OutputProfile } from './output/output-profile.js';
import type { BoardIssueReader } from './ports/board-issue-reader.js';
import { runExport } from './runner/run-export.js';
import {
  ExporterTransportError,
  type AttachmentGetTransport,
  type JiraGetTransport,
} from './transport.js';
export { JIRA_MARKDOWN_EXPORTER_VERSION } from './version.js';


export interface JiraMarkdownExportRequest extends JiraConfig {
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly outputDir: string;
  readonly downloadAttachments?: boolean;
  readonly outputProfile: OutputProfile;
}

export type JiraMarkdownExporterDependencies =
  | Readonly<{ reader: BoardIssueReader; jiraGet?: never; attachmentGet?: never; useDefaultTransport?: never }>
  | Readonly<{ jiraGet: JiraGetTransport; attachmentGet?: AttachmentGetTransport; reader?: never; useDefaultTransport?: never }>
  | Readonly<{ useDefaultTransport: true; reader?: never; jiraGet?: never; attachmentGet?: never }>;

/**
 * Runs the read-only Jira exporter from an explicit in-memory configuration.
 * It never reads process.env, parses CLI arguments, or writes to stdout.
 */
export async function exportJiraMarkdown(
  request: JiraMarkdownExportRequest,
  dependencies: JiraMarkdownExporterDependencies,
): Promise<ExportResult> {
  const config = {
    host: request.host,
    email: request.email,
    apiToken: request.apiToken,
  };
  let reader: BoardIssueReader;
  if ('reader' in dependencies && dependencies.reader) {
    reader = dependencies.reader;
  } else if ('jiraGet' in dependencies && dependencies.jiraGet) {
    if (request.downloadAttachments && !dependencies.attachmentGet) {
      throw new ExporterTransportError('ATTACHMENT_TRANSPORT_REQUIRED', 'attachment');
    }
    const unavailableAttachment: AttachmentGetTransport = Object.freeze({
      get: async () => { throw new ExporterTransportError('ATTACHMENT_TRANSPORT_REQUIRED', 'attachment'); },
    });
    reader = new JiraBoardIssueReader(
      config,
      new JiraSdkReadClient(config, dependencies.jiraGet),
      dependencies.attachmentGet || unavailableAttachment,
    );
  } else if ('useDefaultTransport' in dependencies && dependencies.useDefaultTransport === true) {
    reader = new JiraBoardIssueReader(config, new JiraSdkReadClient(config), nativeAttachmentTransport(config));
  } else {
    throw new ExporterTransportError('JIRA_TRANSPORT_INVALID_RESPONSE', 'jira-json');
  }
  return runExport(reader, {
    issueKeys: request.issueKeys,
    jql: request.jql,
    outputDir: request.outputDir,
    downloadAttachments: request.downloadAttachments,
    outputProfile: request.outputProfile,
  });
}

export type { JiraConfig } from './config/jira-config.js';
export type { ExportResult, ExportedIssueFailure, ExportedIssueResult, ExportStatus } from './domain/export-result.js';
export type { OutputProfile, OutputProfileManifest } from './output/output-profile.js';
export { ExporterTransportError } from './transport.js';
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
export type { BoardIssueReader } from './ports/board-issue-reader.js';
export { createJiraReadApi } from './jira/jira-read-api.js';
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
