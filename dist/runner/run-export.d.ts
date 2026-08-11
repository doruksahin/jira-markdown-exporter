import type { ExportResult } from '../domain/export-result.js';
import type { BoardIssueReader } from '../ports/board-issue-reader.js';
export interface RunExportOptions {
    readonly outputDir: string;
    readonly issueKeys?: readonly string[];
    readonly jql?: string;
    readonly downloadAttachments?: boolean;
}
/** Fetches and writes each issue independently; one failed issue never rolls back another. */
export declare function runExport(reader: BoardIssueReader, options: RunExportOptions): Promise<ExportResult>;
/** Compatibility alias for the embedded board-sync entrypoint. */
export declare const runBoardSync: typeof runExport;
