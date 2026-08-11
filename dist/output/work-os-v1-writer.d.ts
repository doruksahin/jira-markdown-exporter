import type { BoardAttachmentSnapshot, BoardIssueSnapshot } from '../domain/board-snapshot.js';
export interface WorkOsV1WriteOptions {
    readonly outputDir: string;
    readonly downloadAttachments?: boolean;
    readonly downloadAttachment?: (contentUrl: string) => Promise<Uint8Array>;
}
export interface WorkOsV1WriteResult {
    readonly issueDir: string;
    readonly files: readonly string[];
    readonly downloadedAttachments: number;
    readonly warnings: readonly string[];
}
/**
 * Replaces exactly `<outputDir>/<KEY>/40 Jira`. All other packet files are
 * deliberately outside this writer's authority.
 */
export declare function writeWorkOsV1Snapshot(issue: BoardIssueSnapshot, options: WorkOsV1WriteOptions): Promise<WorkOsV1WriteResult>;
/** Compatibility alias for consumers migrating from the embedded exporter. */
export declare const writeBoardSnapshot: typeof writeWorkOsV1Snapshot;
export declare function attachmentStorageName(attachment: Pick<BoardAttachmentSnapshot, 'id' | 'filename'>): string;
/** Localizes only known inline attachments. ID references win over filenames. */
export declare function localizeInlineMedia(description: string, attachments: readonly BoardAttachmentSnapshot[], localPaths: ReadonlyMap<string, string>): string;
