import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';
import type { BoardAttachmentSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';
import { errorMessage } from '../domain/errors.js';
import { exporterTransportFailure } from '../transport.js';
import { normalizeIssueKey } from '../domain/board-snapshot.js';
import { validateOutputProfile, type OutputProfile } from './output-profile.js';
import { createExportTemplateModel, sortedAttachments } from './template-model.js';

export interface ProfileWriteOptions {
  readonly outputDir: string;
  readonly profile: OutputProfile;
  readonly downloadAttachments?: boolean;
  readonly downloadAttachment?: (attachment: BoardAttachmentSnapshot) => Promise<Uint8Array>;
}

export interface ProfileWriteResult {
  readonly issueDir: string;
  readonly files: readonly string[];
  readonly downloadedAttachments: number;
  readonly warnings: readonly string[];
}

/** Replaces exactly `<outputDir>/<KEY>/<profile.ownedDirectory>`. */
export async function writeOutputProfileSnapshot(
  issue: BoardIssueSnapshot,
  options: ProfileWriteOptions,
): Promise<ProfileWriteResult> {
  const profile = await validateOutputProfile(options.profile);
  const key = normalizeIssueKey(issue.key);
  await assertIssueRootConfined(options.outputDir, key);
  const issueDir = join(options.outputDir, key, profile.manifest.ownedDirectory);
  const stagingDir = `${issueDir}.next-${process.pid}-${Date.now()}`;
  await mkdir(dirname(issueDir), { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  try {
    const attachments = await writeAttachmentBinaries(issue, stagingDir, { ...options, profile });
    const localizedIssue = {
      ...issue,
      description: localizeInlineMedia(
        issue.description,
        issue.attachments,
        attachments.localPaths,
        options.downloadAttachments === true,
      ),
    };
    const model = createExportTemplateModel(
      localizedIssue,
      attachments.localPaths,
      attachments.downloaded,
      options.downloadAttachments === true,
      attachments.warnings,
    );
    const rendered = await renderProfile(profile, model);
    await Promise.all(rendered.map(async ({ output, content }) => {
      const target = join(stagingDir, output);
      await mkdir(dirname(target), { recursive: true });
      await writeMarkdown(target, content);
    }));
    await replaceOwnedDirectory(issueDir, stagingDir);
    return {
      issueDir,
      files: rendered.map(({ output }) => join(issueDir, output)),
      downloadedAttachments: attachments.downloaded,
      warnings: attachments.warnings,
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

async function assertIssueRootConfined(outputDir: string, key: string): Promise<void> {
  const issueRoot = join(outputDir, key);
  try {
    if ((await lstat(issueRoot)).isSymbolicLink()) {
      throw new Error(`Issue output directory must not be a symbolic link: ${key}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function renderProfile(profile: OutputProfile, model: ReturnType<typeof createExportTemplateModel>): Promise<readonly { output: string; content: string }[]> {
  if (!profile.directory && !profile.templates) throw new Error('Output profile has no template source');
  const engine = new Liquid({
    ...(profile.templates ? { templates: { ...profile.templates } } : { root: profile.directory }),
    strictVariables: true,
    strictFilters: true,
  });
  registerFilters(engine);
  return Promise.all(profile.manifest.files.map(async (file) => ({
    output: file.output,
    content: await engine.renderFile(file.template, model),
  })));
}

function registerFilters(engine: Liquid): void {
  engine.registerFilter('tableCell', (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>'));
  engine.registerFilter('formatBytes', (value: unknown) => formatBytes(typeof value === 'number' ? value : null));
  engine.registerFilter('yaml', (value: unknown) => JSON.stringify(value ?? ''));
}

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
    await rename(backupDir, issueDir).catch(() => undefined);
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true });
}

async function writeAttachmentBinaries(
  issue: BoardIssueSnapshot,
  issueDir: string,
  options: ProfileWriteOptions,
): Promise<{ downloaded: number; localPaths: Map<string, string>; warnings: string[] }> {
  const localPaths = new Map<string, string>();
  const warnings: string[] = [];
  if (!options.downloadAttachments || issue.attachments.length === 0) return { downloaded: 0, localPaths, warnings };
  if (!options.downloadAttachment) throw new Error('downloadAttachment adapter is required when binary downloads are enabled');
  const attachmentDir = join(issueDir, options.profile.manifest.attachmentsDirectory);
  await mkdir(attachmentDir, { recursive: true });
  for (const attachment of sortedAttachments(issue.attachments)) {
    const safeName = attachmentStorageName(attachment);
    try {
      await writeFile(join(attachmentDir, safeName), await options.downloadAttachment(attachment));
      localPaths.set(attachment.id, `${options.profile.manifest.attachmentsDirectory}/${safeName}`);
    } catch (error) {
      const transportFailure = exporterTransportFailure(error);
      const status = transportFailure?.status;
      warnings.push(`${attachment.filename}: ${errorMessage(error)}${status === undefined ? '' : ` (HTTP ${status})`}`);
    }
  }
  return { downloaded: localPaths.size, localPaths, warnings };
}

/** Localizes only known inline attachments. ID references win over filenames. */
export function localizeInlineMedia(
  description: string,
  attachments: readonly BoardAttachmentSnapshot[],
  localPaths: ReadonlyMap<string, string>,
  attachmentDownloadsEnabled: boolean,
): string {
  let result = description;
  const filenameCounts = new Map<string, number>();
  for (const attachment of attachments) filenameCounts.set(attachment.filename, (filenameCounts.get(attachment.filename) ?? 0) + 1);
  for (const attachment of sortedAttachments(attachments.filter((item) => item.inlineInDescription))) {
    const localPath = localPaths.get(attachment.id);
    const idTargets = [`attachment:${attachment.id}`, `attachment://${attachment.id}`, `/secure/attachment/${attachment.id}`, `./attachments/${attachment.id}`];
    const filenameTargets = filenameCounts.get(attachment.filename) === 1
      ? [`./attachments/${attachment.filename}`, `attachments/${attachment.filename}`] : [];
    for (const target of [...idTargets, ...filenameTargets]) result = replaceMarkdownTarget(
      result,
      target,
      localPath ? `./${localPath}` : undefined,
      attachment.filename,
      attachmentDownloadsEnabled,
    );
  }
  return result;
}

function replaceMarkdownTarget(
  source: string,
  target: string,
  localTarget: string | undefined,
  filename: string,
  attachmentDownloadsEnabled: boolean,
): string {
  const escaped = escapeRegExp(target);
  const link = new RegExp(`(!?\\[[^\\]]*\\]\\()<?${escaped}>?(\\))`, 'g');
  return source.replace(link, (_match, prefix: string, suffix: string) => (
    localTarget
      ? `${prefix}<${localTarget}>${suffix}`
      : attachmentDownloadsEnabled
        ? `> [!warning] Image could not be downloaded: ${filename}`
        : `> [!info] Attachment downloads are disabled for this sync: ${filename}`
  ));
}

export function attachmentStorageName(attachment: Pick<BoardAttachmentSnapshot, 'id' | 'filename'>): string {
  const id = attachment.id.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown';
  return `${id}-${safeFilename(attachment.filename)}`;
}

function safeFilename(value: string): string {
  const safe = basename(value).normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
  return safe || 'attachment';
}
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
