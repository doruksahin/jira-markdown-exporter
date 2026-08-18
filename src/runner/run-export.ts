import { errorMessage } from '../domain/errors.js';
import { normalizeIssueKey } from '../domain/board-snapshot.js';
import type { ExportResult, ExportedIssueResult } from '../domain/export-result.js';
import { loadOutputProfile } from '../output/output-profile.js';
import { writeOutputProfileSnapshot } from '../output/profile-writer.js';
import type { BoardIssueReader } from '../ports/board-issue-reader.js';
import type { OutputProfile } from '../output/output-profile.js';

export interface RunExportOptions {
  readonly outputDir: string;
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly downloadAttachments?: boolean;
  /** Built-in profile name; defaults to the byte-compatible `work-os-v1`. */
  readonly profile?: string;
  /** Explicit local profile directory containing `profile.json` and templates. */
  readonly templateDir?: string;
  /** Prevalidated in-memory profile used by embedded library consumers. */
  readonly outputProfile?: OutputProfile;
}

/** Fetches and writes each issue independently; one failed issue never rolls back another. */
export async function runExport(reader: BoardIssueReader, options: RunExportOptions): Promise<ExportResult> {
  if (options.outputProfile && (options.profile || options.templateDir)) {
    throw new Error('Use outputProfile or a filesystem profile selection, not both');
  }
  const profile = options.outputProfile ?? await loadOutputProfile({ profile: options.profile, templateDir: options.templateDir });
  const keys = await resolveIssueKeys(reader, options);
  const issues: ExportedIssueResult[] = [];
  for (const key of keys) {
    try {
      const issue = await reader.fetchIssue(key);
      const written = await writeOutputProfileSnapshot(issue, {
        outputDir: options.outputDir,
        profile,
        downloadAttachments: options.downloadAttachments,
        downloadAttachment: reader.downloadAttachment.bind(reader),
      });
      issues.push({ key, status: 'synced', issueDir: written.issueDir, comments: issue.comments.length,
        attachments: issue.attachments.length, downloadedAttachments: written.downloadedAttachments, warnings: written.warnings });
    } catch (error) {
      issues.push({ key, status: 'failed', error: errorMessage(error) });
    }
  }
  const synced = issues.filter((issue) => issue.status === 'synced').length;
  const failed = issues.length - synced;
  return { schemaVersion: 1, status: failed === 0 ? 'success' : synced === 0 ? 'failed' : 'partial', total: issues.length, synced, failed, outputDir: options.outputDir, issues };
}

/** Compatibility alias for the embedded board-sync entrypoint. */
export const runBoardSync = runExport;

async function resolveIssueKeys(reader: BoardIssueReader, options: RunExportOptions): Promise<readonly string[]> {
  const explicit = options.issueKeys?.map(normalizeIssueKey) ?? [];
  const searched = options.jql?.trim() ? await reader.searchIssueKeys(options.jql.trim()) : [];
  const keys = explicit.length ? explicit : searched.map(normalizeIssueKey);
  if (keys.length === 0) throw new Error('No Jira issue keys were provided or found');
  return [...new Set(keys)];
}
