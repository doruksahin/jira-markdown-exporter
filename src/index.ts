import type { JiraConfig } from './config/jira-config.js';
import type { ExportResult } from './domain/export-result.js';
import { JiraBoardIssueReader } from './jira/jira-board-issue-reader.js';
import type { OutputProfile } from './output/output-profile.js';
import type { BoardIssueReader } from './ports/board-issue-reader.js';
import { runExport } from './runner/run-export.js';

export const JIRA_MARKDOWN_EXPORTER_VERSION = '0.2.1' as const;
export const WORK_OS_OUTPUT_PROFILE = Object.freeze({ id: 'work-os-v1', version: 1 } as const);

export interface JiraMarkdownExportRequest extends JiraConfig {
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly outputDir: string;
  readonly downloadAttachments?: boolean;
  readonly outputProfile: OutputProfile;
}

export interface JiraMarkdownExporterDependencies {
  /** Test/provider seam. Production callers omit this and use the GET-only Jira reader. */
  readonly reader?: BoardIssueReader;
}

/**
 * Runs the read-only Jira exporter from an explicit in-memory configuration.
 * It never reads process.env, parses CLI arguments, or writes to stdout.
 */
export async function exportJiraMarkdown(
  request: JiraMarkdownExportRequest,
  dependencies: JiraMarkdownExporterDependencies = {},
): Promise<ExportResult> {
  const reader = dependencies.reader ?? new JiraBoardIssueReader({
    host: request.host,
    email: request.email,
    apiToken: request.apiToken,
  });
  return runExport(reader, {
    issueKeys: request.issueKeys,
    jql: request.jql,
    outputDir: request.outputDir,
    downloadAttachments: request.downloadAttachments,
    outputProfile: request.outputProfile,
  });
}

export type { JiraConfig } from './config/jira-config.js';
export type { ExportResult, ExportedIssueResult, ExportStatus } from './domain/export-result.js';
export type { OutputProfile, OutputProfileManifest } from './output/output-profile.js';
