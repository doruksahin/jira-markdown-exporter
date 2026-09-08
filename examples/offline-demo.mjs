import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exportJiraMarkdown,
  parseExportReceipt,
  parseOutputProfileManifest,
} from '@doruksahin/jira-markdown-exporter';

// This example injects normalized, synthetic data at the public reader boundary.
// It exercises rendering and receipts without Jira transport or credentials.
const issue = {
  key: 'DEMO-1',
  url: 'https://example.atlassian.net/browse/DEMO-1',
  summary: 'Try a single-issue Markdown export',
  description: 'Export this synthetic task and inspect its Markdown and receipt.',
  status: 'To Do',
  issueType: 'Task',
  priority: 'Medium',
  assignee: 'Demo Assignee',
  reporter: 'Demo Reporter',
  created: '2026-01-01T09:00:00.000Z',
  updated: '2026-01-02T10:00:00.000Z',
  labels: ['demo'],
  parentKey: '',
  linkedIssues: [],
  comments: [{
    id: '10001',
    author: 'Demo Reviewer',
    created: '2026-01-02T10:00:00.000Z',
    updated: '2026-01-02T10:00:00.000Z',
    body: 'This comment is synthetic too.',
  }],
  attachments: [],
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--partial')) {
    throw new Error('Usage: pnpm demo [--partial]');
  }
  const partial = args[0] === '--partial';
  const profileRoot = new URL('../profiles/generic-v1/', import.meta.url);
  const manifest = parseOutputProfileManifest(JSON.parse(
    await readFile(new URL('profile.json', profileRoot), 'utf8'),
  ));
  const templates = Object.fromEntries(await Promise.all(manifest.files.map(
    async ({ template }) => [template, await readFile(new URL(template, profileRoot), 'utf8')],
  )));
  const runRoot = await mkdtemp(join(tmpdir(), 'jira-exporter-demo-'));
  process.stdout.write(`Offline demo: synthetic data; no Jira requests.\nRun directory: ${runRoot}\n`);
  const receipt = parseExportReceipt(await exportJiraMarkdown({
    host: 'https://example.atlassian.net',
    email: '',
    apiToken: '',
    issueKeys: partial ? ['DEMO-1', 'DEMO-404'] : ['DEMO-1'],
    outputDir: join(runRoot, 'output'),
    outputProfile: { manifest, templates },
  }, {
    reader: {
      async searchIssueKeys() { throw new Error('Demo supports explicit keys only'); },
      async fetchIssue(key) {
        if (key !== issue.key) throw new Error('Synthetic failure: issue unavailable');
        return issue;
      },
      async downloadAttachment() { throw new Error('Demo has no attachment binaries'); },
    },
  }));
  assert.equal(receipt.status, partial ? 'partial' : 'success');
  assert.equal(receipt.total, partial ? 2 : 1);
  assert.equal(receipt.synced, 1);
  assert.equal(receipt.failed, partial ? 1 : 0);
  const snapshotDir = receipt.issues.find(({ status }) => status === 'synced').issueDir;
  for (const { output } of manifest.files) {
    const markdown = await readFile(join(snapshotDir, output), 'utf8');
    assert.ok(markdown.includes(issue.key));
    assert.ok(markdown.endsWith('\n') && !markdown.endsWith('\n\n'));
  }
  const receiptPath = join(runRoot, 'export-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Demo export ${receipt.status}: ${receipt.synced}/${receipt.total} synced, ${receipt.failed} failed\n`);
  for (const result of receipt.issues) {
    process.stdout.write(`- ${result.key}: ${result.status} · ${result.issueDir ?? result.error}\n`);
  }
  process.stdout.write(`Receipt: ${receiptPath}\n\nGenerated issue.md:\n`);
  process.stdout.write(await readFile(join(snapshotDir, 'issue.md'), 'utf8'));
  process.exitCode = partial ? 2 : 0;
}

main().catch((error) => {
  process.stderr.write(`Demo failed: ${error.message}\n`);
  process.exitCode = 1;
});
