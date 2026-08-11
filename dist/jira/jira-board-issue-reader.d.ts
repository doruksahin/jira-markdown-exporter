import type { BoardIssueSnapshot } from '../domain/board-snapshot.js';
import type { BoardIssueReader } from '../ports/board-issue-reader.js';
import type { JiraConfig } from '../config/jira-config.js';
export declare class JiraBoardIssueReader implements BoardIssueReader {
    private readonly config;
    private readonly request;
    private readonly authorization;
    private readonly origin;
    constructor(config: JiraConfig, request?: typeof fetch);
    searchIssueKeys(jql: string): Promise<readonly string[]>;
    fetchIssue(issueKey: string): Promise<BoardIssueSnapshot>;
    downloadAttachment(contentUrl: string): Promise<Uint8Array>;
    private fetchAllComments;
    private getJson;
}
export declare function assertJiraOrigin(contentUrl: string, jiraHost: string): string;
export declare function convertBoardIssue(issue: JiraIssue, rawComments: readonly JiraComment[], jiraHost: string): BoardIssueSnapshot;
interface JiraIssue {
    key: string;
    fields?: JiraFields;
}
interface JiraFields {
    summary?: string;
    description?: unknown;
    status?: {
        name?: string;
    };
    issuetype?: {
        name?: string;
    };
    priority?: {
        name?: string;
    };
    assignee?: JiraPerson | null;
    reporter?: JiraPerson | null;
    created?: string;
    updated?: string;
    labels?: string[];
    parent?: {
        key?: string;
    };
    attachment?: JiraAttachment[];
}
interface JiraComment {
    id?: string;
    author?: JiraPerson;
    created?: string;
    updated?: string;
    body?: unknown;
}
interface JiraAttachment {
    id?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    author?: JiraPerson;
    created?: string;
    content?: string;
}
interface JiraPerson {
    displayName?: string;
}
export {};
