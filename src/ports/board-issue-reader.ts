import type { BoardAttachmentSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';

/** Read-only boundary. Implementations must not mutate Jira. */
export interface BoardIssueReader {
  searchIssueKeys(jql: string): Promise<readonly string[]>;
  fetchIssue(issueKey: string): Promise<BoardIssueSnapshot>;
  downloadAttachment(attachment: BoardAttachmentSnapshot): Promise<Uint8Array>;
}
