import type { BoardIssueSnapshot } from '../domain/board-snapshot.js';
import { loadOutputProfile } from './output-profile.js';
import {
  attachmentStorageName,
  localizeInlineMedia,
  writeOutputProfileSnapshot,
  type ProfileWriteResult,
} from './profile-writer.js';

export interface WorkOsV1WriteOptions {
  readonly outputDir: string;
  readonly downloadAttachments?: boolean;
  readonly downloadAttachment?: (contentUrl: string) => Promise<Uint8Array>;
}

export type WorkOsV1WriteResult = ProfileWriteResult;

/**
 * Compatibility API for Work OS. It is now a thin selection of the built-in
 * versioned profile rather than a second, hard-coded renderer.
 */
export async function writeWorkOsV1Snapshot(issue: BoardIssueSnapshot, options: WorkOsV1WriteOptions): Promise<WorkOsV1WriteResult> {
  return writeOutputProfileSnapshot(issue, { ...options, profile: await loadOutputProfile({ profile: 'work-os-v1' }) });
}

/** Compatibility alias for consumers migrating from the embedded exporter. */
export const writeBoardSnapshot = writeWorkOsV1Snapshot;

export { attachmentStorageName, localizeInlineMedia };
