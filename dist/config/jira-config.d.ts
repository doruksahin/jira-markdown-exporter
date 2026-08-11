export interface JiraConfig {
    readonly host: string;
    readonly email: string;
    readonly apiToken: string;
}
/** Loads only the credentials required by the read-only Jira API adapter. */
export declare function loadJiraConfig(env?: NodeJS.ProcessEnv): JiraConfig;
