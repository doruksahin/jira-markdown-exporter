export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
export function normalizeIssueKey(value) {
    const key = value.trim().toUpperCase();
    if (!JIRA_ISSUE_KEY.test(key))
        throw new Error(`Invalid Jira issue key: ${value}`);
    return key;
}
