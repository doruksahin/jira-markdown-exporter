import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { BoardAttachmentSnapshot, BoardCommentSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';
import { errorMessage } from '../domain/errors.js';
import { normalizeIssueKey } from '../domain/board-snapshot.js';

const GENERATED_FOLDER = '40 Jira';

export interface WorkOsV1WriteOptions {
  readonly outputDir: string;
  readonly downloadAttachments?: boolean;
  readonly downloadAttachment?: (contentUrl: string) => Promise<Uint8Array>;
}

export interface WorkOsV1WriteResult {
  readonly issueDir: string;
  readonly files: readonly string[];
  readonly downloadedAttachments: number;
  readonly warnings: readonly string[];
}

/**
 * Replaces exactly `<outputDir>/<KEY>/40 Jira`. All other packet files are
 * deliberately outside this writer's authority.
 */
export async function writeWorkOsV1Snapshot(
  issue: BoardIssueSnapshot,
  options: WorkOsV1WriteOptions,
): Promise<WorkOsV1WriteResult> {
  const key = normalizeIssueKey(issue.key);
  const issueDir = join(options.outputDir, key, GENERATED_FOLDER);
  const stagingDir = `${issueDir}.next-${process.pid}-${Date.now()}`;
  await mkdir(dirname(issueDir), { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  try {
    const attachments = await writeAttachmentBinaries(issue, stagingDir, options);
    const files = ['00 Issue.md', '10 Comments.md', '20 Attachments.md', '90 Sync.md'];
    const contents = [
      buildIssueMarkdown(issue, attachments.localPaths),
      buildCommentsMarkdown(issue),
      buildAttachmentsMarkdown(issue, attachments.localPaths),
      buildSyncMarkdown(issue, attachments.downloaded, attachments.warnings),
    ];
    await Promise.all(files.map((file, index) => writeMarkdown(join(stagingDir, file), contents[index])));
    await replaceOwnedDirectory(issueDir, stagingDir);
    return {
      issueDir,
      files: files.map((file) => join(issueDir, file)),
      downloadedAttachments: attachments.downloaded,
      warnings: attachments.warnings,
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

/** Compatibility alias for consumers migrating from the embedded exporter. */
export const writeBoardSnapshot = writeWorkOsV1Snapshot;

async function replaceOwnedDirectory(issueDir: string, stagingDir: string): Promise<void> {
  const backupDir = `${issueDir}.previous-${process.pid}-${Date.now()}`;
  try {
    await rename(issueDir, backupDir);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(stagingDir, issueDir);
  } catch (error) {
    // Best-effort restoration keeps an existing generated packet available.
    await rename(backupDir, issueDir).catch(() => undefined);
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true });
}

async function writeAttachmentBinaries(
  issue: BoardIssueSnapshot,
  issueDir: string,
  options: WorkOsV1WriteOptions,
): Promise<{ downloaded: number; localPaths: Map<string, string>; warnings: string[] }> {
  const localPaths = new Map<string, string>();
  const warnings: string[] = [];
  if (!options.downloadAttachments || issue.attachments.length === 0) {
    return { downloaded: 0, localPaths, warnings };
  }
  if (!options.downloadAttachment) {
    throw new Error('downloadAttachment adapter is required when binary downloads are enabled');
  }
  const attachmentDir = join(issueDir, 'attachments');
  await mkdir(attachmentDir, { recursive: true });
  for (const attachment of sortedAttachments(issue.attachments)) {
    if (!attachment.contentUrl) {
      warnings.push(`${attachment.filename}: Jira content URL yok`);
      continue;
    }
    const safeName = attachmentStorageName(attachment);
    try {
      await writeFile(join(attachmentDir, safeName), await options.downloadAttachment(attachment.contentUrl));
      localPaths.set(attachment.id, `attachments/${safeName}`);
    } catch (error) {
      warnings.push(`${attachment.filename}: ${errorMessage(error)}`);
    }
  }
  return { downloaded: localPaths.size, localPaths, warnings };
}

export function attachmentStorageName(attachment: Pick<BoardAttachmentSnapshot, 'id' | 'filename'>): string {
  const id = attachment.id.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown';
  return `${id}-${safeFilename(attachment.filename)}`;
}

function buildIssueMarkdown(issue: BoardIssueSnapshot, localPaths: ReadonlyMap<string, string>): string {
  const metadata: [string, string][] = [
    ['Jira', `[${issue.key}](<${issue.url}>)`], ['Status', issue.status], ['Type', issue.issueType],
    ['Priority', issue.priority], ['Assignee', issue.assignee], ['Reporter', issue.reporter],
    ['Created', issue.created || '—'], ['Updated', issue.updated || '—'], ['Parent', issue.parentKey || '—'],
    ['Labels', issue.labels.length ? [...issue.labels].sort().map((label) => `\`${label}\``).join(', ') : '—'],
  ];
  const rows = metadata.map(([field, value]) => `| ${field} | ${escapeTableCell(value)} |`).join('\n');
  return `${frontmatter('jira-generated-issue', issue)}
# ${issue.key} · ${issue.summary}

${notice()}

| Field | Value |
|---|---|
${rows}

## Description

${localizeInlineMedia(issue.description, issue.attachments, localPaths) || '_Jira açıklaması yok._'}
`;
}

/** Localizes only known inline attachments. ID references win over filenames. */
export function localizeInlineMedia(
  description: string,
  attachments: readonly BoardAttachmentSnapshot[],
  localPaths: ReadonlyMap<string, string>,
): string {
  let result = description;
  const filenameCounts = new Map<string, number>();
  for (const attachment of attachments) filenameCounts.set(attachment.filename, (filenameCounts.get(attachment.filename) ?? 0) + 1);
  for (const attachment of sortedAttachments(attachments.filter((item) => item.inlineInDescription))) {
    const localPath = localPaths.get(attachment.id);
    const idTargets = [`attachment:${attachment.id}`, `attachment://${attachment.id}`, `/secure/attachment/${attachment.id}`, `./attachments/${attachment.id}`];
    const filenameTargets = filenameCounts.get(attachment.filename) === 1
      ? [`./attachments/${attachment.filename}`, `attachments/${attachment.filename}`] : [];
    for (const target of [...idTargets, ...filenameTargets]) {
      result = replaceMarkdownTarget(result, target, localPath ? `./${localPath}` : undefined, attachment.filename);
    }
  }
  return result;
}

function replaceMarkdownTarget(source: string, target: string, localTarget: string | undefined, filename: string): string {
  const escaped = escapeRegExp(target);
  // Matches normal and angle-bracket Markdown destinations without touching prose.
  const link = new RegExp(`(!?\\[[^\\]]*\\]\\()<?${escaped}>?(\\))`, 'g');
  return source.replace(link, (_match, prefix: string, suffix: string) => (
    localTarget ? `${prefix}<${localTarget}>${suffix}` : `> [!warning] Görsel indirilemedi: ${filename}`
  ));
}

function buildCommentsMarkdown(issue: BoardIssueSnapshot): string {
  const comments = [...issue.comments].sort(compareComments);
  const body = comments.length ? comments.map(buildComment).join('\n\n---\n\n') : '_Bu issue için görünür yorum yok._';
  return `${frontmatter('jira-generated-comments', issue, [`comment_count: ${comments.length}`])}
# ${issue.key} · Comments

${notice()}

${body}
`;
}

function buildComment(comment: BoardCommentSnapshot): string {
  const date = comment.created ? comment.created.slice(0, 10) : 'Tarih yok';
  const updated = comment.updated && comment.updated !== comment.created ? ` · güncellendi ${comment.updated}` : '';
  return `## ${date} · ${comment.author}

<small>Comment ${comment.id || '—'} · ${comment.created || '—'}${updated}</small>

${comment.body || '_Boş yorum._'}`;
}

function buildAttachmentsMarkdown(issue: BoardIssueSnapshot, localPaths: ReadonlyMap<string, string>): string {
  const attachments = sortedAttachments(issue.attachments);
  const rows = attachments.length
    ? attachments.map((attachment) => attachmentRow(attachment, localPaths.get(attachment.id))).join('\n')
    : '| _Attachment yok_ | — | — | — | — | — |';
  return `${frontmatter('jira-generated-attachments', issue, [`attachment_count: ${attachments.length}`])}
# ${issue.key} · Attachments

${notice()}

| Name | MIME | Size | Author | Created | Yerel dosya |
|---|---|---:|---|---|---|
${rows}
`;
}

function attachmentRow(attachment: BoardAttachmentSnapshot, localPath?: string): string {
  const local = localPath ? `[aç](<${localPath}>)` : 'indirilmedi';
  return `| ${escapeTableCell(attachment.filename)} | ${escapeTableCell(attachment.mimeType)} | ${formatBytes(attachment.size)} | ${escapeTableCell(attachment.author)} | ${attachment.created || '—'} | ${local} |`;
}

function buildSyncMarkdown(issue: BoardIssueSnapshot, downloaded: number, warnings: readonly string[]): string {
  const warningLines = warnings.length ? warnings.map((warning) => `- ${warning}`).join('\n') : '- Yok.';
  return `${frontmatter('jira-generated-sync', issue)}
# ${issue.key} · Sync metadata

${notice()}

- **Jira updated:** ${issue.updated || '—'}
- **Comments:** ${issue.comments.length}
- **Attachments:** ${issue.attachments.length}
- **Downloaded binaries:** ${downloaded}

## Warnings

${warningLines}
`;
}

function frontmatter(type: string, issue: BoardIssueSnapshot, extra: readonly string[] = []): string {
  return ['---', `type: ${type}`, `jira_key: ${issue.key}`, `jira_updated: ${JSON.stringify(issue.updated)}`, 'generated_by: jira-markdown-exporter', ...extra, '---'].join('\n');
}

function notice(): string {
  return '> [!warning] Jira tarafından üretilir\n> Bu klasördeki dosyaları elle düzenleme; bir sonraki sync değişiklikleri yeniler.';
}

function sortedAttachments(attachments: readonly BoardAttachmentSnapshot[]): BoardAttachmentSnapshot[] {
  return [...attachments].sort((left, right) => left.id.localeCompare(right.id) || left.filename.localeCompare(right.filename));
}
function compareComments(left: BoardCommentSnapshot, right: BoardCommentSnapshot): number {
  return left.created.localeCompare(right.created) || left.id.localeCompare(right.id);
}
function safeFilename(value: string): string {
  const safe = basename(value).normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
  return safe || 'attachment';
}
function escapeTableCell(value: string): string { return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>'); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function formatBytes(size: number | null): string {
  if (size === null) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
async function writeMarkdown(path: string, content: string): Promise<void> {
  const normalized = `${content.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd()}\n`;
  await writeFile(path, normalized, 'utf8');
}
