import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExporterTransportError,
  createJiraReadApi,
  exportJiraMarkdown,
  type JiraGetTransport,
  type OutputProfile,
} from '../../src/embedded.js';
import { assertJiraGetOnly, JiraSdkReadClient } from '../../src/jira/jira-read-client.js';

const config = { host: 'https://acme.atlassian.net', email: 'person@example.test', apiToken: 'test-only-token' };
const embeddedConfig = { host: config.host };
const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe('embedded transport boundary', () => {
  it('owns endpoint generation, pagination, JQL, and issue normalization', async () => {
    const urls: URL[] = [];
    const transport: JiraGetTransport = async (request) => {
      expect('method' in request).toBe(false);
      expect(request.headers).toEqual({ Accept: 'application/json' });
      const url = new URL(request.url);
      urls.push(url);
      if (url.pathname === '/rest/api/3/myself') return response({ accountId: 'acct-1', displayName: 'Person', emailAddress: 'person@example.test', active: true });
      if (url.pathname === '/rest/api/3/field') return response([{ id: 'customfield_1', name: 'Sprint', schema: { custom: 'sprint-schema' } }]);
      if (url.pathname === '/rest/agile/1.0/board/7/sprint') {
        const startAt = Number(url.searchParams.get('startAt'));
        return startAt === 0
          ? response({ values: [{ id: 11, name: 'Sprint 11', state: 'active' }], startAt: 0, total: 2, isLast: false })
          : response({ values: [{ id: 12, name: 'Sprint 12', state: 'future' }], startAt: 1, total: 2, isLast: true });
      }
      if (url.pathname === '/rest/agile/1.0/board/7/issue') {
        const startAt = Number(url.searchParams.get('startAt'));
        return startAt === 0
          ? response({ issues: [rawIssue('ATT-1', 'One')], startAt: 0, total: 2, maxResults: 100 })
          : response({ issues: [rawIssue('ATT-2', 'Two')], startAt: 1, total: 2, maxResults: 100 });
      }
      throw new Error(`unexpected test endpoint ${url.pathname}`);
    };
    const api = createJiraReadApi(embeddedConfig, { jiraGet: transport });

    await expect(api.probeMyself()).resolves.toMatchObject({ accountId: 'acct-1', active: true });
    await expect(api.listFields()).resolves.toEqual([{ id: 'customfield_1', name: 'Sprint', customSchema: 'sprint-schema' }]);
    await expect(api.listBoardSprints({ boardId: 7, states: ['active', 'future'] })).resolves.toHaveLength(2);
    const issues = await api.listBoardIssues({
      boardId: 7,
      projectKey: 'ATT',
      assigneeAccountId: 'acct-1',
      unresolvedOnly: true,
      orderByUpdatedDesc: true,
      storyPointsField: 'customfield_2',
    });
    expect(issues).toMatchObject({ total: 2, issues: [{ key: 'ATT-1', summary: 'One', description: 'Plain text', storyPoints: '3' }, { key: 'ATT-2', summary: 'Two' }] });
    const issueUrls = urls.filter((url) => url.pathname.endsWith('/issue'));
    expect(issueUrls).toHaveLength(2);
    expect(issueUrls[0]?.searchParams.get('jql')).toBe('project = "ATT" AND assignee = "acct-1" AND resolution = Unresolved ORDER BY updated DESC');
    expect(issueUrls[1]?.searchParams.get('startAt')).toBe('1');
  });

  it('lists assigned issues through enhanced-search token pagination', async () => {
    const urls: URL[] = [];
    const api = createJiraReadApi(embeddedConfig, { jiraGet: async (request) => {
      const url = new URL(request.url);
      urls.push(url);
      return url.searchParams.get('nextPageToken')
        ? response({ issues: [rawIssue('PROJ-2', 'Two')], nextPageToken: '' })
        : response({ issues: [rawIssue('PROJ-1', 'One')], nextPageToken: 'page-2' });
    } });

    await expect(api.listAssignedIssues({
      projectKey: 'PROJ',
      assigneeAccountId: 'acct-1',
      unresolvedOnly: true,
      orderByUpdatedDesc: true,
      storyPointsField: 'customfield_2',
    })).resolves.toMatchObject({ total: 2, issues: [{ key: 'PROJ-1' }, { key: 'PROJ-2' }] });
    expect(urls.map((url) => url.pathname)).toEqual(['/rest/api/3/search/jql', '/rest/api/3/search/jql']);
    expect(urls[0]?.searchParams.get('jql')).toBe(
      'project = "PROJ" AND assignee = "acct-1" AND resolution = Unresolved ORDER BY updated DESC',
    );
    expect(urls[1]?.searchParams.get('nextPageToken')).toBe('page-2');
  });

  it('selects assigned sprint issues and assigned children of sprint members', async () => {
    const jqls: string[] = [];
    const api = createJiraReadApi(embeddedConfig, { jiraGet: async (request) => {
      const jql = new URL(request.url).searchParams.get('jql') || '';
      jqls.push(jql);
      return jql.includes('sprint = 42')
        ? response({ issues: [rawIssue('PROJ-1', 'Direct'), rawIssue('PROJ-10', 'Parent')] })
        : response({ issues: [
          rawIssue('PROJ-1', 'Direct'),
          rawIssue('PROJ-2', 'Child', 'PROJ-10'),
          rawIssue('PROJ-3', 'Outside'),
        ] });
    } });

    await expect(api.listSprintIssues({
      sprintId: 42,
      projectKey: 'PROJ',
      assigneeAccountId: 'acct-1',
      storyPointsField: 'customfield_2',
    })).resolves.toMatchObject({ total: 2, issues: [{ key: 'PROJ-1' }, { key: 'PROJ-2' }] });
    expect(jqls).toEqual([
      'project = "PROJ" AND assignee = "acct-1"',
      'project = "PROJ" AND sprint = 42',
    ]);
  });

  it('rejects repeated enhanced-search tokens and invalid assigned-issue policy', async () => {
    const api = createJiraReadApi(embeddedConfig, { jiraGet: async () => (
      response({ issues: [rawIssue('PROJ-1', 'One')], nextPageToken: 'same-token' })
    ) });

    await expect(api.listAssignedIssues({
      projectKey: 'PROJ',
      assigneeAccountId: 'acct-1',
      unresolvedOnly: true,
      orderByUpdatedDesc: true,
      storyPointsField: 'customfield_2',
    })).rejects.toMatchObject({ code: 'JIRA_PAGINATION_INVALID', operation: 'jira-assigned-issues' });
    await expect(api.listAssignedIssues({
      projectKey: 'PROJ',
      assigneeAccountId: 'acct-1',
      unresolvedOnly: false,
      orderByUpdatedDesc: true,
      storyPointsField: 'customfield_2',
    } as unknown as Parameters<typeof api.listAssignedIssues>[0])).rejects.toThrow('explicitly select');

    const emptyPageApi = createJiraReadApi(embeddedConfig, { jiraGet: async () => (
      response({ issues: [], nextPageToken: 'unexpected-next-page' })
    ) });
    await expect(emptyPageApi.listAssignedIssues({
      projectKey: 'PROJ',
      assigneeAccountId: 'acct-1',
      unresolvedOnly: true,
      orderByUpdatedDesc: true,
      storyPointsField: 'customfield_2',
    })).rejects.toMatchObject({ code: 'JIRA_PAGINATION_INVALID', operation: 'jira-assigned-issues' });
  });

  it('preserves bounded injected transport facts and drops unsafe text', async () => {
    const client = new JiraSdkReadClient(config, async () => {
      throw Object.assign(new Error('token=test-only-token&jql=secret'), {
        code: 'rate_limited', status: 429, retryable: true, attempts: 3, summary: 'Jira rate limited',
      });
    });
    const error = await client.getIssue({ issueIdOrKey: 'ATT-1' }).catch((value) => value);
    expect(error).toBeInstanceOf(ExporterTransportError);
    expect(error.toJSON()).toEqual({
      code: 'JIRA_TRANSPORT_REQUEST_FAILED', operation: 'jira-issue', status: 429,
      transportCode: 'rate_limited', retryable: true, attempts: 3, transportSummary: 'Jira rate limited',
    });
    expect(JSON.stringify(error)).not.toContain('test-only-token');
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('fails attachment-enabled embedded export before Jira or filesystem work', async () => {
    const outputDir = await temporaryDirectory();
    let calls = 0;
    await expect(exportJiraMarkdown({
      ...embeddedConfig,
      issueKeys: ['ATT-1'],
      outputDir,
      downloadAttachments: true,
      outputProfile: inlineProfile,
    }, { jiraGet: async () => { calls += 1; return response({}); } })).rejects.toMatchObject({
      code: 'ATTACHMENT_TRANSPORT_REQUIRED', operation: 'attachment',
    });
    expect(calls).toBe(0);
    expect(await readdir(outputDir)).toEqual([]);
  });

  it('keeps the embedded runtime graph free of jira.js, Axios, fetch, and XHR', async () => {
    const entry = resolve('dist/embedded.js');
    const visited = new Set<string>();
    const visit = async (file: string): Promise<void> => {
      if (visited.has(file)) return;
      visited.add(file);
      const source = await readFile(file, 'utf8');
      expect(source).not.toMatch(/from ['"](?:jira\.js|axios)/);
      expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest)\s*\(/);
      for (const match of source.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
        await visit(resolve(dirname(file), match[1]));
      }
    };
    await visit(entry);
    expect(visited.size).toBeGreaterThan(5);
  });

  it('enforces GET-only at the private Node SDK adapter boundary', () => {
    expect(() => assertJiraGetOnly('POST')).toThrowError(expect.objectContaining({ code: 'JIRA_TRANSPORT_METHOD_NOT_ALLOWED' }));
    expect(() => assertJiraGetOnly('GET')).not.toThrow();
  });
});

function response(body: unknown) { return Promise.resolve({ status: 200, headers: {}, body }); }

function rawIssue(key: string, summary: string, parentKey = 'PROJ-0') {
  return {
    id: key.replace(/\D/g, '') || '1', key, fields: {
      summary,
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain text' }] }] },
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'High' }, issuetype: { name: 'Task' }, updated: '2026-08-18T10:00:00Z',
      assignee: { accountId: 'acct-1', displayName: 'Person', active: true }, comment: { total: 2 },
      parent: { key: parentKey }, labels: ['one'], customfield_2: 3,
    },
  };
}

const inlineProfile: OutputProfile = {
  manifest: { id: 'test-v1', schemaVersion: 1, ownedDirectory: 'snapshot', attachmentsDirectory: 'attachments', files: [{ template: 'issue.md.liquid', output: 'issue.md' }] },
  templates: { 'issue.md.liquid': '# {{ issue.key }}\n' },
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jira-markdown-embedded-'));
  temporaryDirectories.push(directory);
  return directory;
}
