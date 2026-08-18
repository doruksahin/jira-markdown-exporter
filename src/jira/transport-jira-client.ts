import type { Version3Models, Version3Parameters } from 'jira.js/version3';
import type { JiraConfig } from '../config/jira-config.js';
import {
  ExporterTransportError,
  type ExporterTransportOperation,
  type JiraGetTransport,
} from '../transport.js';
import type { JiraReadClient } from './jira-read-client.js';

export class JiraTransportReadClient implements JiraReadClient {
  constructor(private readonly config: Pick<JiraConfig, 'host'>, private readonly transport: JiraGetTransport) {}

  searchIssues(parameters: Version3Parameters.SearchForIssuesUsingJqlEnhancedSearch): Promise<Version3Models.SearchAndReconcileResults> {
    return jiraGetJson(this.config, this.transport, 'jira-search', '/rest/api/3/search/jql', {
      jql: parameters.jql,
      maxResults: parameters.maxResults,
      fields: parameters.fields,
      nextPageToken: parameters.nextPageToken,
    }) as Promise<Version3Models.SearchAndReconcileResults>;
  }

  getIssue(parameters: Version3Parameters.GetIssue): Promise<Version3Models.Issue> {
    return jiraGetJson(
      this.config,
      this.transport,
      'jira-issue',
      `/rest/api/3/issue/${encodeURIComponent(String(parameters.issueIdOrKey))}`,
      { fields: parameters.fields },
    ) as Promise<Version3Models.Issue>;
  }

  getComments(parameters: Version3Parameters.GetComments): Promise<Version3Models.PageOfComments> {
    return jiraGetJson(
      this.config,
      this.transport,
      'jira-comments',
      `/rest/api/3/issue/${encodeURIComponent(String(parameters.issueIdOrKey))}/comment`,
      {
        startAt: parameters.startAt,
        maxResults: parameters.maxResults,
        orderBy: parameters.orderBy,
      },
    ) as Promise<Version3Models.PageOfComments>;
  }
}

export async function jiraGetJson(
  config: Pick<JiraConfig, 'host'>,
  transport: JiraGetTransport,
  operation: ExporterTransportOperation,
  path: string,
  parameters: Readonly<Record<string, unknown>> = {},
): Promise<unknown> {
  const url = jiraReadUrl(config.host, path, parameters);
  let response;
  try {
    response = await transport(Object.freeze({
      url,
      headers: Object.freeze({ Accept: 'application/json' }),
      responseType: 'json',
    }));
  } catch (error) {
    if (error instanceof ExporterTransportError) throw error.withOperation(operation);
    throw new ExporterTransportError('JIRA_TRANSPORT_REQUEST_FAILED', operation, safeTransportFacts(error));
  }
  if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new ExporterTransportError('JIRA_TRANSPORT_INVALID_RESPONSE', operation);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ExporterTransportError('JIRA_TRANSPORT_HTTP_ERROR', operation, response.status);
  }
  return response.body;
}

export function jiraReadUrl(
  host: string,
  path: string,
  parameters: Readonly<Record<string, unknown>> = {},
): string {
  const url = new URL(path, new URL(host).origin);
  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined || value === '') continue;
    const serialized = Array.isArray(value) ? value.join(',')
      : value instanceof Date ? value.toISOString()
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
    url.searchParams.set(key, serialized);
  }
  return url.toString();
}

function safeTransportFacts(error: unknown): Readonly<{
  status?: number;
  transportCode?: string;
  retryable?: boolean;
  attempts?: number;
  summary?: string;
}> {
  if (!error || typeof error !== 'object') return Object.freeze({});
  const value = error as Record<string, unknown>;
  return Object.freeze({
    ...(Number.isInteger(value.status) ? { status: Number(value.status) } : {}),
    ...(/^(?:[A-Z][A-Z0-9_]{0,63}|[a-z][a-z0-9_]{0,63})$/.test(String(value.code || '')) ? { transportCode: String(value.code) } : {}),
    ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
    ...(Number.isInteger(value.attempts) ? { attempts: Number(value.attempts) } : {}),
    ...(/^[A-Za-z][A-Za-z0-9 _.-]{0,119}$/.test(String(value.summary || '')) ? { summary: String(value.summary) } : {}),
  });
}
