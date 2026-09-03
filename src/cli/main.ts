#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';
import { loadJiraConfig } from '../config/jira-config.js';
import { errorMessage } from '../domain/errors.js';
import type { ExportResult } from '../domain/export-result.js';
import { exportJiraMarkdown } from '../index.js';
import { calculateOutputProfileDigest, loadOutputProfile } from '../output/output-profile.js';
import { JIRA_MARKDOWN_EXPORTER_VERSION } from '../version.js';

export interface CliOptions {
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly jqlFile?: string;
  readonly outputDir: string;
  readonly downloadAttachments: boolean;
  readonly profile?: string;
  readonly templateDir?: string;
  readonly json: boolean;
  readonly receipt?: string;
}

export function parseArguments(argv: readonly string[]): CliOptions {
  const receiptDestination = findReceiptDestination(argv);
  const command = createCommand();
  try {
    command.parse([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed') throw new HelpRequested();
      throw new UsageError(commanderErrorMessage(error), receiptDestination);
    }
    throw error;
  }
  const parsed = command.opts<ParsedCommandOptions>();
  const issueKeys = parsed.issueKeys?.split(',').map((key) => key.trim()).filter(Boolean);
  const jql = parsed.jql?.trim();
  const jqlFile = parsed.jqlFile ? resolve(parsed.jqlFile) : undefined;
  const outputDir = parsed.outputDir;
  const profile = parsed.profile;
  const templateDir = parsed.templateDir;
  const json = parsed.json === true;
  const receipt = parsed.receipt ? resolve(parsed.receipt) : undefined;
  if (!outputDir) throw new UsageError(`--output-dir is required\n\n${usage()}`, receipt);
  const selectors = Number(Boolean(issueKeys?.length)) + Number(Boolean(jql)) + Number(Boolean(jqlFile));
  if (selectors !== 1) {
    throw new UsageError(`Use exactly one of --issue-keys, --jql, or --jql-file\n\n${usage()}`, receipt);
  }
  if (profile && templateDir) throw new UsageError('Use either --profile or --template-dir, not both', receipt);
  if (json && receipt) throw new UsageError('Use either --json or --receipt, not both', receipt);
  return { issueKeys, jql, jqlFile, outputDir: resolve(outputDir), downloadAttachments: parsed.downloadAttachments === true, profile, templateDir: templateDir ? resolve(templateDir) : undefined, json, receipt };
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const receiptDestination = findReceiptDestination(argv);
  let options: CliOptions;
  try { options = parseArguments(argv); }
  catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(helpText());
      return 0;
    }
    const failed = cliFailureEnvelope(error);
    if (receiptDestination) {
      try { await writeReceipt(receiptDestination, failed); }
      catch (receiptError) { return writeFailure(cliFailureEnvelope(receiptError), false); }
      process.stderr.write(`${errorMessage(error)}\n`);
      return 1;
    }
    if (argv.includes('--json')) process.stdout.write(serializeReceipt(failed));
    else process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  let profileProvenance: ProfileProvenance | undefined;
  try {
    const jql = options.jqlFile ? await readJql(options.jqlFile) : options.jql;
    const config = loadJiraConfig(env);
    const outputProfile = await loadOutputProfile({ profile: options.profile, templateDir: options.templateDir });
    profileProvenance = {
      profileId: outputProfile.manifest.id,
      profileDigest: await calculateOutputProfileDigest(outputProfile),
    };
    const result = await exportJiraMarkdown({
      ...config,
      issueKeys: options.issueKeys,
      jql,
      outputDir: options.outputDir,
      downloadAttachments: options.downloadAttachments,
      outputProfile,
    }, { useDefaultTransport: true });
    if (options.receipt) await writeReceipt(options.receipt, result);
    writeResult(result, options.json);
    return exitCodeForStatus(result.status);
  } catch (error) {
    let failed = cliFailureEnvelope(error, options.outputDir, profileProvenance);
    if (options.receipt) {
      try { await writeReceipt(options.receipt, failed); }
      catch (receiptError) { failed = cliFailureEnvelope(receiptError, options.outputDir, profileProvenance); }
    }
    return writeFailure(failed, options.json);
  }
}

export function exitCodeForStatus(status: ExportResult['status']): 0 | 1 | 2 {
  return status === 'success' ? 0 : status === 'partial' ? 2 : 1;
}

function writeResult(result: ExportResult, json: boolean): void {
  if (json) { process.stdout.write(serializeReceipt(result)); return; }
  process.stdout.write(`Jira export ${result.status}: ${result.synced}/${result.total} synced, ${result.failed} failed\n`);
  for (const issue of result.issues) process.stdout.write(`- ${issue.key}: ${issue.status}${issue.issueDir ? ` · ${issue.issueDir}` : issue.error ? ` · ${issue.error}` : ''}\n`);
}

interface CliFailureEnvelope {
  readonly schemaVersion: 1;
  readonly exporterVersion: string;
  readonly profileId?: string;
  readonly profileDigest?: `sha256:${string}`;
  readonly status: 'failed';
  readonly total: 0;
  readonly synced: 0;
  readonly failed: 0;
  readonly outputDir?: string;
  readonly issues: readonly [];
  readonly error: string;
}

interface ProfileProvenance {
  readonly profileId: string;
  readonly profileDigest: `sha256:${string}`;
}

function cliFailureEnvelope(error: unknown, outputDir?: string, profileProvenance?: ProfileProvenance): CliFailureEnvelope {
  return {
    schemaVersion: 1,
    exporterVersion: JIRA_MARKDOWN_EXPORTER_VERSION,
    ...profileProvenance,
    status: 'failed',
    total: 0,
    synced: 0,
    failed: 0,
    ...(outputDir ? { outputDir } : {}),
    issues: [],
    error: errorMessage(error),
  };
}

function findReceiptDestination(argv: readonly string[]): string | undefined {
  let destination: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--receipt') continue;
    const candidate = argv[index + 1];
    if (candidate && !candidate.startsWith('--')) destination = resolve(candidate);
  }
  return destination;
}

function writeFailure(failed: CliFailureEnvelope, json: boolean): 1 {
  if (json) process.stdout.write(serializeReceipt(failed));
  else process.stderr.write(`Jira export failed: ${failed.error}\n`);
  return 1;
}

function serializeReceipt(receipt: ExportResult | CliFailureEnvelope): string {
  return `${JSON.stringify(receipt)}\n`;
}

async function readJql(path: string): Promise<string> {
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch (error) { throw new Error(`Could not read --jql-file ${path}: ${errorMessage(error)}`); }
  let jql: string;
  try { jql = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim(); }
  catch { throw new Error(`--jql-file must contain valid UTF-8: ${path}`); }
  if (!jql) throw new Error(`--jql-file must contain non-empty JQL: ${path}`);
  return jql;
}

async function writeReceipt(path: string, receipt: ExportResult | CliFailureEnvelope): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, serializeReceipt(receipt), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

class UsageError extends Error { constructor(message: string, readonly receipt?: string) { super(message); } }
class HelpRequested extends Error {}

interface ParsedCommandOptions {
  readonly issueKeys?: string;
  readonly jql?: string;
  readonly jqlFile?: string;
  readonly outputDir?: string;
  readonly downloadAttachments?: boolean;
  readonly profile?: string;
  readonly templateDir?: string;
  readonly json?: boolean;
  readonly receipt?: string;
}

function createCommand(): Command {
  return new Command()
    .name('jira-markdown-export')
    .description('Standalone, read-only Jira Cloud issue exporter to deterministic Markdown.')
    .usage('[options]')
    .helpOption('-h, --help', 'display this complete command contract')
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({ writeOut: () => undefined, writeErr: () => undefined })
    .option('--issue-keys <keys>', 'comma-separated Jira issue keys')
    .option('--jql <query>', 'inline Jira Query Language selector')
    .option('--jql-file <path>', 'path to a UTF-8 file containing JQL')
    .option('--output-dir <path>', 'root directory for generated issue snapshots')
    .option('--download-attachments', 'download attachment binaries into the profile-owned directory')
    .option('--profile <id>', 'built-in output profile (default: generic-v1)')
    .option('--template-dir <path>', 'external output profile directory containing profile.json')
    .option('--receipt <path>', 'atomically write the JSON result or preflight envelope to this path')
    .option('--json', 'write the JSON result or preflight envelope to stdout');
}

function helpText(): string {
  return `${createCommand().helpInformation()}${helpContract()}`;
}

function helpContract(): string {
  return `
Required environment:
  JIRA_HOST       HTTPS Jira Cloud origin, for example https://company.atlassian.net
  JIRA_EMAIL      Jira account email; inject from the runner secret store
  JIRA_API_TOKEN  Jira API token; inject from the runner secret store

Selection: exactly one of --issue-keys, --jql, or --jql-file is required.
Profile: use --profile or --template-dir, not both. generic-v1 is the default.

Output contract:
  --output-dir is always required. Each issue is written beneath <output-dir>/<KEY>/.
  --receipt atomically writes JSON to a file; --json writes JSON to stdout. Do not combine them.
  Completed receipts include exporterVersion, profileId, profileDigest, status, counts, and issues.
  Failures before a profile is available use a provenance-free preflight envelope.
  Without --receipt or --json, stdout contains human-readable status.

Exit status:
  0  complete export; every selected issue was written
  2  partial export; successful issue output remains available
  1  invalid input, configuration failure, or no issue exported

Examples:
  jira-markdown-export --issue-keys PROJ-123,PROJ-124 --output-dir /tmp/jira-export --receipt /tmp/receipt.json
  jira-markdown-export --jql-file /inputs/scope.jql --template-dir /inputs/profile --output-dir /tmp/jira-export --receipt /tmp/receipt.json
`;
}

function commanderErrorMessage(error: CommanderError): string {
  let detail: string;
  if (error.code === 'commander.unknownOption') {
    detail = `Unknown argument: ${error.message.replace(/^error: unknown option /, '')}`;
  } else {
    detail = error.message.replace(/^error: /, '');
  }
  return `${detail}\n\n${usage()}`;
}

function usage(): string {
  const command = createCommand();
  return `Usage: ${command.name()} ${command.usage()}\nRun jira-markdown-export --help for the complete command contract.`;
}

function invokedAsExecutable(argv1: string | undefined): boolean {
  if (!argv1) return false;
  try { return realpathSync(resolve(argv1)) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (invokedAsExecutable(process.argv[1])) void main().then((code) => { process.exitCode = code; });
