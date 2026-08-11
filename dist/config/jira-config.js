/** Loads only the credentials required by the read-only Jira API adapter. */
export function loadJiraConfig(env = process.env) {
    const host = required(env, 'JIRA_HOST').replace(/\/+$/, '');
    let parsed;
    try {
        parsed = new URL(host);
    }
    catch {
        throw new Error('JIRA_HOST must be an absolute URL, for example https://example.atlassian.net');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('JIRA_HOST must use http or https');
    }
    return { host: parsed.origin, email: required(env, 'JIRA_EMAIL'), apiToken: required(env, 'JIRA_API_TOKEN') };
}
function required(env, name) {
    const value = env[name]?.trim();
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
