export interface JiraConfig {
  readonly host: string;
  readonly email: string;
  readonly apiToken: string;
}

/** Loads only the credentials required by the read-only Jira API adapter. */
export function loadJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  const host = required(env, 'JIRA_HOST').replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(host);
  } catch {
    throw new Error('JIRA_HOST must be an absolute URL, for example https://example.atlassian.net');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('JIRA_HOST must use https');
  }
  return { host: parsed.origin, email: required(env, 'JIRA_EMAIL'), apiToken: required(env, 'JIRA_API_TOKEN') };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
