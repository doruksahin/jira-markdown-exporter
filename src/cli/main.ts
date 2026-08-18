#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJiraConfig } from '../config/jira-config.js';
import { errorMessage } from '../domain/errors.js';
import type { ExportResult } from '../domain/export-result.js';
import { exportJiraMarkdown } from '../index.js';
import { loadOutputProfile } from '../output/output-profile.js';

export interface CliOptions {
  readonly issueKeys?: readonly string[];
  readonly jql?: string;
  readonly outputDir: string;
  readonly downloadAttachments: boolean;
  readonly profile?: string;
  readonly templateDir?: string;
  readonly json: boolean;
}

export function parseArguments(argv: readonly string[]): CliOptions {
  let issueKeys: string[] | undefined;
  let jql: string | undefined;
  let outputDir: string | undefined;
  let downloadAttachments = false;
  let profile: string | undefined;
  let templateDir: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--issue-keys') issueKeys = value(argv, ++index, argument).split(',').map((key) => key.trim()).filter(Boolean);
    else if (argument === '--jql') jql = value(argv, ++index, argument).trim();
    else if (argument === '--output-dir') outputDir = value(argv, ++index, argument);
    else if (argument === '--download-attachments') downloadAttachments = true;
    else if (argument === '--profile') profile = value(argv, ++index, argument);
    else if (argument === '--template-dir') templateDir = value(argv, ++index, argument);
    else if (argument === '--json') json = true;
    else if (argument === '--help' || argument === '-h') throw new HelpRequested();
    else throw new UsageError(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  if (!outputDir) throw new UsageError(`--output-dir is required\n\n${usage()}`);
  if ((!issueKeys?.length && !jql) || (issueKeys?.length && jql)) {
    throw new UsageError(`Use exactly one of --issue-keys or --jql\n\n${usage()}`);
  }
  if (profile && templateDir) throw new UsageError('Use either --profile or --template-dir, not both');
  return { issueKeys, jql, outputDir: resolve(outputDir), downloadAttachments, profile, templateDir: templateDir ? resolve(templateDir) : undefined, json };
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let options: CliOptions;
  try { options = parseArguments(argv); }
  catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  try {
    const config = loadJiraConfig(env);
    const outputProfile = await loadOutputProfile({ profile: options.profile, templateDir: options.templateDir });
    const result = await exportJiraMarkdown({
      ...config,
      issueKeys: options.issueKeys,
      jql: options.jql,
      outputDir: options.outputDir,
      downloadAttachments: options.downloadAttachments,
      outputProfile,
    });
    writeResult(result, options.json);
    return result.status === 'success' ? 0 : result.status === 'partial' ? 2 : 1;
  } catch (error) {
    const failed: ExportResult & { readonly error: string } = { schemaVersion: 1, status: 'failed', total: 0, synced: 0, failed: 0, outputDir: options.outputDir, issues: [], error: errorMessage(error) };
    if (options.json) process.stdout.write(`${JSON.stringify(failed)}\n`);
    else process.stderr.write(`Jira export failed: ${failed.error}\n`);
    return 1;
  }
}

function writeResult(result: ExportResult, json: boolean): void {
  if (json) { process.stdout.write(`${JSON.stringify(result)}\n`); return; }
  process.stdout.write(`Jira export ${result.status}: ${result.synced}/${result.total} synced, ${result.failed} failed\n`);
  for (const issue of result.issues) process.stdout.write(`- ${issue.key}: ${issue.status}${issue.issueDir ? ` · ${issue.issueDir}` : issue.error ? ` · ${issue.error}` : ''}\n`);
}

class UsageError extends Error {}
class HelpRequested extends Error {}
function value(argv: readonly string[], index: number, flag: string): string { const result = argv[index]; if (!result || result.startsWith('--')) throw new UsageError(`${flag} requires a value`); return result; }
function usage(): string { return ['Usage:', '  jira-markdown-export --issue-keys ATT-1,ATT-2 --output-dir /path/to/Tasks [--download-attachments] [--profile work-os-v1] [--json]', '  jira-markdown-export --jql "project = ATT" --output-dir /path/to/Tasks [--download-attachments] [--template-dir /path/to/profile] [--json]'].join('\n'); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().then((code) => { process.exitCode = code; });
