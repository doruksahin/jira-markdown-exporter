import { describe, expect, it } from 'vitest';
import { readJiraDevelopment } from '../../src/jira/jira-development.js';

const repository = { name: 'frontend', url: 'https://github.com/acme/frontend' };
const branch = { name: 'feature/ATT-1', url: 'https://github.com/acme/frontend/tree/feature/ATT-1', repository };
const pullRequest = {
  id: '42', title: 'Implement ATT-1', url: 'https://github.com/acme/frontend/pull/42', status: 'OPEN',
  source: { branch: 'feature/ATT-1', repository }, destination: { branch: 'main', repository },
};
function summary() {
  return { errors: [], summary: {
    branch: { overall: { count: 1 }, byInstanceType: { GitHub: { count: 1 } } },
    pullrequest: { overall: { count: 1 }, byInstanceType: { GitHub: { count: 1 } } },
  } };
}

describe('readJiraDevelopment', () => {
  it('exports linked branch and PR metadata from the providers advertised by Jira', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => summary(),
      getDevelopmentDetail: async (_id, provider, kind) => {
        expect(provider).toBe('GitHub');
        return { errors: [], detail: [kind === 'branch' ? { branches: [branch] } : { pullRequests: [pullRequest] }] };
      },
    }, '10001');
    expect(result).toMatchObject({ status: 'available', branches: [{ ...branch, repository: 'frontend' }], pullRequests: [{
      id: '42', title: 'Implement ATT-1', url: pullRequest.url, status: 'OPEN',
      sourceBranch: branch.name, targetBranch: 'main', repository: 'frontend',
    }], warnings: [] });
  });

  it('keeps branch evidence when PR retrieval is forbidden without exposing response or exception content', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => summary(),
      getDevelopmentDetail: async (_id, _provider, kind) => {
        if (kind === 'pullrequest') throw Object.assign(new Error('secret-token raw-response'), { status: 403 });
        return { detail: [{ branches: [branch] }] };
      },
    }, '10001');
    expect(result.status).toBe('partial');
    expect(result.branches).toEqual([{ ...branch, repository: 'frontend' }]);
    expect(result.pullRequests).toEqual([]);
    expect(result.warnings.join(' ')).toContain('403');
    expect(JSON.stringify(result)).not.toMatch(/secret-token|raw-response/);
  });

  it.each([{}, { errors: ['secret-token'], summary: {} }, null])('reports malformed or error summaries as unavailable (%j)', async (response) => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => response,
      getDevelopmentDetail: async () => { throw new Error('Details must not be fetched'); },
    }, '10001');
    expect(result.status).toBe('unavailable');
    expect(result.branches).toEqual([]);
    expect(result.pullRequests).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('distinguishes a successful empty development summary from unavailable development data', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => ({ errors: [], summary: {} }),
      getDevelopmentDetail: async () => { throw new Error('No provider advertised'); },
    }, '10001');
    expect(result).toEqual({ status: 'available', branches: [], pullRequests: [], warnings: [] });
  });

  it('supports older clients and missing numeric issue IDs as unavailable', async () => {
    expect((await readJiraDevelopment({}, '10001')).status).toBe('unavailable');
    expect((await readJiraDevelopment({}, '')).status).toBe('unavailable');
  });

  it('retains successes from multiple providers when one provider returns malformed details', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => ({ summary: {
        branch: { overall: { count: 2 }, byInstanceType: { GitHub: { count: 1 }, Bitbucket: { count: 1 } } },
      } }),
      getDevelopmentDetail: async (_id, provider) => provider === 'GitHub'
        ? { detail: [{ branches: [branch] }] }
        : { detail: 'invalid-response-secret' },
    }, '10001');
    expect(result.status).toBe('partial');
    expect(result.branches).toEqual([{ ...branch, repository: 'frontend' }]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('invalid-response-secret');
  });

  it('continues to valid providers after an earlier provider advertises a malformed count', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => ({ summary: {
        branch: { overall: { count: 2 }, byInstanceType: { Broken: { count: 'invalid' }, GitHub: { count: 1 } } },
      } }),
      getDevelopmentDetail: async () => ({ detail: [{ branches: [branch] }] }),
    }, '10001');
    expect(result.status).toBe('partial');
    expect(result.branches).toEqual([{ ...branch, repository: 'frontend' }]);
  });

  it.each([{}, { detail: [] }, { errors: ['private-error'], detail: [{ branches: [branch] }] }])('does not mistake malformed detail for complete development evidence (%j)', async (response) => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => summary(),
      getDevelopmentDetail: async () => response,
    }, '10001');
    expect(result.status).not.toBe('available');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('private-error');
  });

  it('does not serialize executable or credential-bearing development links', async () => {
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => summary(),
      getDevelopmentDetail: async () => ({ detail: [{
        branches: [{ ...branch, url: 'javascript:alert(1)', repository: { name: 'frontend', url: 'https://secret:token@example.test' } }],
        pullRequests: [{ ...pullRequest, url: 'https://secret:token@example.test/pull/42' }],
      }] }),
    }, '10001');
    expect(JSON.stringify(result)).not.toMatch(/javascript:|secret:token/);
  });

  it('deduplicates and sorts branch evidence so repeated provider entries produce stable output', async () => {
    const earlier = { ...branch, name: 'a/ATT-1', url: 'https://github.com/acme/frontend/tree/a/ATT-1' };
    const result = await readJiraDevelopment({
      getDevelopmentSummary: async () => summary(),
      getDevelopmentDetail: async (_id, _provider, kind) => ({ detail: [kind === 'branch'
        ? { branches: [branch, earlier, branch] }
        : { pullRequests: [pullRequest, pullRequest] }] }),
    }, '10001');
    expect(result.branches.map((item) => item.name)).toEqual(['a/ATT-1', 'feature/ATT-1']);
    expect(result.pullRequests).toHaveLength(1);
  });
});
