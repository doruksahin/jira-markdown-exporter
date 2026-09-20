import type { DevelopmentBranch, DevelopmentPullRequest, IssueDevelopment } from '../domain/board-snapshot.js';
import type { JiraReadClient } from './jira-read-client.js';

/** Jira's internal development API is isolated here because it has no stable public contract. */
export async function readJiraDevelopment(
  client: Pick<JiraReadClient, 'getDevelopmentSummary' | 'getDevelopmentDetail'>,
  issueId: string,
): Promise<IssueDevelopment> {
  const branches: DevelopmentBranch[] = [];
  const pullRequests: DevelopmentPullRequest[] = [];
  const warnings: string[] = [];
  if (!/^\d+$/.test(issueId) || !client.getDevelopmentSummary || !client.getDevelopmentDetail) {
    return { status: 'unavailable', branches, pullRequests, warnings: ['Development information is unavailable from this issue reader.'] };
  }
  let summary: Record<string, unknown>;
  try {
    summary = object(response(await client.getDevelopmentSummary(issueId)).summary);
  } catch (error) {
    return { status: 'unavailable', branches, pullRequests, warnings: [warning(error)] };
  }
  let completed = 0;
  for (const kind of ['branch', 'pullrequest'] as const) {
    try {
      if (summary[kind] === undefined) continue;
      const group = object(summary[kind]);
      const providers = object(group.byInstanceType);
      const overall = object(group.overall);
      if (!count(overall.count)) throw new Error('Invalid count');
      if (Number(overall.count) > 0 && !Object.keys(providers).length) throw new Error('Missing providers');
      for (const provider of Object.keys(providers).sort()) {
        try {
          const providerCount = object(providers[provider]).count;
          if (!count(providerCount)) throw new Error('Invalid count');
          if (providerCount === 0) continue;
          const result = response(await client.getDevelopmentDetail(issueId, provider, kind));
          const details = array(result.detail);
          // A nonzero summary without detail is incomplete, not an empty success.
          if (!details.length) throw new Error('Missing detail');
          const batchBranches: DevelopmentBranch[] = [];
          const batchPullRequests: DevelopmentPullRequest[] = [];
          for (const raw of details) {
            const detail = object(raw);
            if (kind === 'branch') {
              let found = false;
              if (detail.branches !== undefined) {
                found = true;
                batchBranches.push(...array(detail.branches).map((value) => branch(value)));
              }
              if (detail.repositories !== undefined) {
                found = true;
                for (const rawRepository of array(detail.repositories)) {
                  const repository = object(rawRepository);
                  batchBranches.push(...array(repository.branches).map((value) => branch(value, repository)));
                }
              }
              if (!found) throw new Error('Missing branches');
            } else {
              batchPullRequests.push(...array(detail.pullRequests).map(pullRequest));
            }
          }
          if (!(kind === 'branch' ? batchBranches.length : batchPullRequests.length)) throw new Error('Missing advertised development data');
          branches.push(...batchBranches);
          pullRequests.push(...batchPullRequests);
          completed += 1;
        } catch (error) {
          warnings.push(warning(error));
        }
      }
    } catch (error) {
      warnings.push(warning(error));
    }
  }
  return {
    status: warnings.length ? (completed ? 'partial' : 'unavailable') : 'available',
    branches: unique(branches, (value) => `${value.name}\0${value.repository}\0${value.url}`),
    pullRequests: unique(pullRequests, (value) => `${value.url}\0${value.repository}\0${value.id}`),
    warnings: [...new Set(warnings)],
  };
}

function response(value: unknown): Record<string, unknown> {
  const result = object(value);
  for (const key of ['errors', 'configErrors']) {
    if (result[key] !== undefined && array(result[key]).length) throw new Error('Development response errors');
  }
  return result;
}

function branch(value: unknown, fallback?: Record<string, unknown>): DevelopmentBranch {
  const item = object(value);
  return { name: requiredText(item.name), url: safeUrl(item.url), repository: text(object(item.repository ?? fallback ?? {}).name) };
}

function pullRequest(value: unknown): DevelopmentPullRequest {
  const item = object(value);
  const source = object(item.source ?? {});
  const destination = object(item.destination ?? {});
  return {
    id: text(item.id), title: text(item.name ?? item.title), url: safeUrl(item.url),
    status: text(item.status), sourceBranch: text(source.branch), targetBranch: text(destination.branch),
    repository: text(object(item.repository ?? destination.repository ?? source.repository ?? {}).name),
  };
}

function safeUrl(value: unknown): string {
  if (!value) return '';
  if (typeof value !== 'string') throw new Error('Invalid URL');
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe URL');
    return url.href.replaceAll('<', '%3C').replaceAll('>', '%3E').replaceAll('|', '%7C');
  } catch {
    throw new Error('Invalid development URL');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid development object');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid development array');
  return value;
}
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid development text');
  return String(value).trim();
}
function requiredText(value: unknown): string {
  const result = text(value);
  if (!result) throw new Error('Missing development name');
  return result;
}
function count(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= 0; }
function warning(error: unknown): string {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return `Development information could not be fully retrieved${Number.isInteger(status) && Number(status) >= 100 && Number(status) <= 599 ? ` (HTTP ${status})` : ''}.`;
}
function unique<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()].sort((a, b) => key(a).localeCompare(key(b)));
}
