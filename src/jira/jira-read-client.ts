import { Version3Client } from 'jira.js/version3';
import type { Version3Models, Version3Parameters } from 'jira.js/version3';
import axios, { AxiosHeaders, type AxiosAdapter } from 'axios';
import type { Config as JiraClientConfig } from 'jira.js';
import type { JiraConfig } from '../config/jira-config.js';
import {
  ExporterTransportError,
  type ExporterTransportOperation,
  type JiraGetTransport,
  type TransportHeaders,
} from '../transport.js';

/**
 * The only Jira JSON operations this exporter is allowed to perform.
 *
 * Keep this deliberately smaller than `Version3Client`: the exporter is
 * read-only and does not need Jira's mutation APIs. Attachment bytes are not
 * included here because they use the separately guarded native-fetch path.
 */
export interface JiraReadClient {
  searchIssues(parameters: Version3Parameters.SearchForIssuesUsingJqlEnhancedSearch): Promise<Version3Models.SearchAndReconcileResults>;
  getIssue(parameters: Version3Parameters.GetIssue): Promise<Version3Models.Issue>;
  getComments(parameters: Version3Parameters.GetComments): Promise<Version3Models.PageOfComments>;
}

/** Production implementation backed by the typed Jira Cloud v3 client. */
export class JiraSdkReadClient implements JiraReadClient {
  private readonly client: Version3Client;

  constructor(config: JiraConfig, transport?: JiraGetTransport) {
    this.client = new Version3Client(jiraClientConfig(config, transport));
  }

  async searchIssues(parameters: Version3Parameters.SearchForIssuesUsingJqlEnhancedSearch): Promise<Version3Models.SearchAndReconcileResults> {
    return this.perform('jira-search', () => this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch(parameters));
  }

  async getIssue(parameters: Version3Parameters.GetIssue): Promise<Version3Models.Issue> {
    return this.perform('jira-issue', () => this.client.issues.getIssue(parameters));
  }

  async getComments(parameters: Version3Parameters.GetComments): Promise<Version3Models.PageOfComments> {
    return this.perform('jira-comments', () => this.client.issueComments.getComments(parameters));
  }

  private async perform<T>(operation: ExporterTransportOperation, request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      const transportError = findTransportError(error);
      if (transportError) throw transportError.withOperation(operation);
      throw error;
    }
  }
}

export function jiraClientConfig(config: JiraConfig, transport?: JiraGetTransport): JiraClientConfig {
  return {
    host: config.host,
    authentication: { basic: { email: config.email, apiToken: config.apiToken } },
    ...(transport ? { baseRequestConfig: { adapter: jiraGetAdapter(transport) } } : {}),
  };
}

export async function performJiraRead<T>(
  operation: ExporterTransportOperation,
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const transportError = findTransportError(error);
    if (transportError) throw transportError.withOperation(operation);
    throw error;
  }
}

/** Internal assertion shared by the Axios bridge and its focused regression. */
export function assertJiraGetOnly(method: string | undefined): void {
  if (String(method || 'GET').toUpperCase() !== 'GET') {
    throw new ExporterTransportError('JIRA_TRANSPORT_METHOD_NOT_ALLOWED', 'jira-json');
  }
}

function jiraGetAdapter(transport: JiraGetTransport): AxiosAdapter {
  return async (config) => {
    assertJiraGetOnly(config.method);
    const request = Object.freeze({
      url: axios.getUri(config),
      headers: requestHeaders(config.headers),
      responseType: 'json' as const,
      ...(typeof config.timeout === 'number' && config.timeout > 0 ? { timeoutMs: config.timeout } : {}),
    });
    let response;
    try {
      response = await transport(request);
    } catch (error) {
      if (error instanceof ExporterTransportError) throw error;
      throw new ExporterTransportError(
        'JIRA_TRANSPORT_REQUEST_FAILED',
        'jira-json',
        safeTransportFacts(error),
      );
    }
    if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
      throw new ExporterTransportError('JIRA_TRANSPORT_INVALID_RESPONSE', 'jira-json');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ExporterTransportError('JIRA_TRANSPORT_HTTP_ERROR', 'jira-json', response.status);
    }
    return {
      data: response.body,
      status: response.status,
      statusText: '',
      headers: AxiosHeaders.from(responseHeaders(response.headers)),
      config,
    };
  };
}

function requestHeaders(headers: AxiosHeaders): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers.toJSON(true))) {
    if (value === null || value === undefined) continue;
    result[name] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }
  return Object.freeze(result);
}

function responseHeaders(headers: TransportHeaders | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers || {})) {
    result[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

function findTransportError(error: unknown): ExporterTransportError | undefined {
  const pending: unknown[] = [error];
  for (let depth = 0; depth < 12 && pending.length; depth += 1) {
    const current = pending.shift();
    if (current instanceof ExporterTransportError) return current;
    if (current && typeof current === 'object') {
      if ('cause' in current) pending.push(current.cause);
      if ('response' in current) pending.push(current.response);
    }
  }
  return undefined;
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
    ...(/^(?:[A-Z][A-Z0-9_]{0,63}|[a-z][a-z0-9_]{0,63})$/.test(String(value.code || ''))
      ? { transportCode: String(value.code) } : {}),
    ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
    ...(Number.isInteger(value.attempts) ? { attempts: Number(value.attempts) } : {}),
    ...(/^[A-Za-z][A-Za-z0-9 _.-]{0,119}$/.test(String(value.summary || '')) ? { summary: String(value.summary) } : {}),
  });
}
