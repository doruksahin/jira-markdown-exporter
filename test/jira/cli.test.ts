import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExportResult } from '../../src/domain/export-result.js';
import { JIRA_MARKDOWN_EXPORTER_VERSION } from '../../src/version.js';

const mocks = vi.hoisted(() => ({
  exportJiraMarkdown: vi.fn(),
  calculateOutputProfileDigest: vi.fn(async () => `sha256:${'a'.repeat(64)}`),
  loadOutputProfile: vi.fn(async () => ({
    manifest: { id: 'generic-v1', schemaVersion: 1, ownedDirectory: 'jira-snapshot', attachmentsDirectory: 'attachments', files: [] },
  })),
}));

vi.mock('../../src/index.js', () => ({ exportJiraMarkdown: mocks.exportJiraMarkdown }));
vi.mock('../../src/output/output-profile.js', () => ({
  calculateOutputProfileDigest: mocks.calculateOutputProfileDigest,
  loadOutputProfile: mocks.loadOutputProfile,
}));

import { exitCodeForStatus, main, parseArguments } from '../../src/cli/main.js';

const jiraEnv = {
  JIRA_HOST: 'https://example.atlassian.net',
  JIRA_EMAIL: 'robot@example.com',
  JIRA_API_TOKEN: 'secret',
};

function result(status: ExportResult['status'] = 'success'): ExportResult {
  const counts = status === 'success'
    ? { total: 1, synced: 1, failed: 0 }
    : status === 'partial'
      ? { total: 2, synced: 1, failed: 1 }
      : { total: 1, synced: 0, failed: 1 };
  return {
    schemaVersion: 1,
    exporterVersion: JIRA_MARKDOWN_EXPORTER_VERSION,
    profileId: 'generic-v1',
    profileDigest: `sha256:${'a'.repeat(64)}`,
    status,
    ...counts,
    outputDir: '/tmp/export',
    issues: [],
  };
}

describe('CLI argument contract', () => {
  let root: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jira-export-cli-'));
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mocks.exportJiraMarkdown.mockReset();
    mocks.calculateOutputProfileDigest.mockClear();
    mocks.loadOutputProfile.mockClear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('prints self-contained help for unattended operators and language models', async () => {
    await expect(main(['--help'])).resolves.toBe(0);

    expect(stderr).not.toHaveBeenCalled();
    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(help).toContain('Usage: jira-markdown-export [options]');
    expect(help).toContain('Standalone, read-only Jira Cloud');
    expect(help).toContain('Required environment:');
    expect(help).toContain('JIRA_HOST');
    expect(help).toContain('JIRA_EMAIL');
    expect(help).toContain('JIRA_API_TOKEN');
    expect(help).toContain('Selection: exactly one');
    expect(help).toContain('--issue-keys <keys>');
    expect(help).toContain('--jql <query>');
    expect(help).toContain('--jql-file <path>');
    expect(help).toContain('--output-dir <path>');
    expect(help).toContain('--receipt <path>');
    expect(help).toContain('--json');
    expect(help).toContain('Output contract:');
    expect(help).toContain('Exit status:');
    expect(help).toContain('0  complete export');
    expect(help).toContain('2  partial export');
    expect(help).toContain('1  invalid input');
    expect(help).toContain('Examples:');
  });

  it('parses an explicit issue selection and built-in profile', () => {
    expect(parseArguments(['--issue-keys', 'PROJ-1, PROJ-2', '--output-dir', './export', '--download-attachments', '--profile', 'generic-v1', '--json'])).toMatchObject({ issueKeys: ['PROJ-1', 'PROJ-2'], downloadAttachments: true, profile: 'generic-v1', json: true });
  });

  it('requires exactly one of issue keys, inline JQL, or a JQL file', () => {
    expect(() => parseArguments(['--output-dir', './packets'])).toThrow('exactly one');
    expect(() => parseArguments(['--issue-keys', 'ATT-1', '--jql', 'project = ATT', '--output-dir', './packets'])).toThrow('exactly one');
    expect(() => parseArguments(['--issue-keys', 'ATT-1', '--jql-file', './scope.jql', '--output-dir', './packets'])).toThrow('exactly one');
    expect(() => parseArguments(['--jql', 'project = ATT', '--jql-file', './scope.jql', '--output-dir', './packets'])).toThrow('exactly one');
  });

  it('rejects a profile and template directory together', () => {
    expect(() => parseArguments(['--issue-keys', 'PROJ-1', '--output-dir', './export', '--profile', 'generic-v1', '--template-dir', './profile'])).toThrow('either --profile or --template-dir');
  });

  it('rejects JSON stdout and a receipt file together', () => {
    expect(() => parseArguments(['--issue-keys', 'PROJ-1', '--output-dir', './export', '--receipt', './receipt.json', '--json'])).toThrow('either --json or --receipt');
  });

  it('records a conflicting-output usage failure only in the requested receipt file', async () => {
    const receipt = join(root, 'usage-failure.json');

    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', join(root, 'export'), '--receipt', receipt, '--json'], jiraEnv)).resolves.toBe(1);

    expect(JSON.parse(await readFile(receipt, 'utf8'))).toMatchObject({ exporterVersion: JIRA_MARKDOWN_EXPORTER_VERSION, status: 'failed' });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('either --json or --receipt'));
  });

  it('records an argument failure when a valid receipt destination appears after the invalid argument', async () => {
    const receipt = join(root, 'argument-failure.json');

    await expect(main(['--unknown', '--receipt', receipt], jiraEnv)).resolves.toBe(1);

    expect(JSON.parse(await readFile(receipt, 'utf8'))).toMatchObject({ exporterVersion: JIRA_MARKDOWN_EXPORTER_VERSION, status: 'failed' });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown argument'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage: jira-markdown-export [options]'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('jira-markdown-export --help'));
  });

  it('reads trimmed UTF-8 JQL and atomically replaces the export receipt without leaving a temporary file', async () => {
    const jqlFile = join(root, 'scope.jql');
    const receipt = join(root, 'receipts', 'export.json');
    await writeFile(jqlFile, '  project = ATT\n', 'utf8');
    await mkdir(join(root, 'receipts'));
    await writeFile(receipt, 'old receipt\n', 'utf8');
    const exported = result('success');
    mocks.exportJiraMarkdown.mockResolvedValue(exported);

    await expect(main(['--jql-file', jqlFile, '--output-dir', join(root, 'export'), '--receipt', receipt], jiraEnv)).resolves.toBe(0);

    expect(mocks.exportJiraMarkdown).toHaveBeenCalledWith(expect.objectContaining({ jql: 'project = ATT', issueKeys: undefined }), { useDefaultTransport: true });
    const serialized = `${JSON.stringify(exported)}\n`;
    await expect(readFile(receipt, 'utf8')).resolves.toBe(serialized);
    await expect(readdir(join(root, 'receipts'))).resolves.toEqual(['export.json']);
    expect(stdout).toHaveBeenCalledWith('Jira export success: 1/1 synced, 0 failed\n');
    expect(stderr).not.toHaveBeenCalled();
  });

  it('preserves exact JSON stdout output when no receipt file is requested', async () => {
    const exported = result('success');
    mocks.exportJiraMarkdown.mockResolvedValue(exported);

    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', join(root, 'export'), '--json'], jiraEnv)).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(exported)}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('writes a partial receipt and preserves the partial exit code', async () => {
    const receipt = join(root, 'partial.json');
    const exported = result('partial');
    mocks.exportJiraMarkdown.mockResolvedValue(exported);

    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', join(root, 'export'), '--receipt', receipt], jiraEnv)).resolves.toBe(2);

    await expect(readFile(receipt, 'utf8')).resolves.toBe(`${JSON.stringify(exported)}\n`);
    expect(stdout).toHaveBeenCalledWith('Jira export partial: 1/2 synced, 1 failed\n');
  });

  it('writes a machine-readable failed receipt when export throws', async () => {
    const outputDir = resolve(root, 'export');
    const receipt = join(root, 'failed.json');
    mocks.exportJiraMarkdown.mockRejectedValue(new Error('network unavailable'));

    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', outputDir, '--receipt', receipt], jiraEnv)).resolves.toBe(1);

    const failed = { schemaVersion: 1, exporterVersion: JIRA_MARKDOWN_EXPORTER_VERSION, profileId: 'generic-v1', profileDigest: `sha256:${'a'.repeat(64)}`, status: 'failed', total: 0, synced: 0, failed: 0, outputDir, issues: [], error: 'network unavailable' };
    const serialized = `${JSON.stringify(failed)}\n`;
    await expect(readFile(receipt, 'utf8')).resolves.toBe(serialized);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('Jira export failed: network unavailable\n');
  });

  it.each([
    ['empty', Buffer.from(' \n\t')],
    ['invalid UTF-8', Buffer.from([0xc3, 0x28])],
  ])('rejects an %s JQL file before contacting Jira', async (_label, contents) => {
    const jqlFile = join(root, 'scope.jql');
    await writeFile(jqlFile, contents);

    await expect(main(['--jql-file', jqlFile, '--output-dir', join(root, 'export'), '--json'], jiraEnv)).resolves.toBe(1);

    expect(mocks.exportJiraMarkdown).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual(expect.not.objectContaining({ profileId: expect.anything(), profileDigest: expect.anything() }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it('rejects an unreadable JQL file before contacting Jira', async () => {
    const jqlFile = join(root, 'missing.jql');

    await expect(main(['--jql-file', jqlFile, '--output-dir', join(root, 'export'), '--json'], jiraEnv)).resolves.toBe(1);

    expect(mocks.exportJiraMarkdown).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ status: 'failed' });
    expect(stderr).not.toHaveBeenCalled();
  });

  it('rejects an insecure Jira host before loading a profile or contacting Jira', async () => {
    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', join(root, 'export'), '--json'], { ...jiraEnv, JIRA_HOST: 'http://example.atlassian.net' })).resolves.toBe(1);

    expect(mocks.loadOutputProfile).not.toHaveBeenCalled();
    expect(mocks.exportJiraMarkdown).not.toHaveBeenCalled();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ status: 'failed', error: expect.stringContaining('https') });
  });

  it('returns failure without printing a successful result when the receipt cannot be written', async () => {
    const receipt = join(root, 'existing-directory');
    await mkdir(receipt);
    mocks.exportJiraMarkdown.mockResolvedValue(result('success'));

    await expect(main(['--issue-keys', 'ATT-1', '--output-dir', join(root, 'export'), '--receipt', receipt], jiraEnv)).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('Jira export failed:');
  });

  it('preserves success, partial, and failed exit codes', () => {
    expect(exitCodeForStatus('success')).toBe(0);
    expect(exitCodeForStatus('partial')).toBe(2);
    expect(exitCodeForStatus('failed')).toBe(1);
  });
});
