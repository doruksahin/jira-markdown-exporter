import type { BoardIssueSnapshot } from '../domain/board-snapshot.js';

/** Read-only boundary. Implementations must not mutate Jira. */
export interface BoardIssueReader {
  searchIssueKeys(jql: string): Promise<readonly string[]>;
  fetchIssue(issueKey: string): Promise<BoardIssueSnapshot>;
  downloadAttachment(contentUrl: string): Promise<Uint8Array>;
}
