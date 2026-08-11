import { errorMessage } from '../domain/errors.js';
import { normalizeIssueKey } from '../domain/board-snapshot.js';
import { writeWorkOsV1Snapshot } from '../output/work-os-v1-writer.js';
/** Fetches and writes each issue independently; one failed issue never rolls back another. */
export async function runExport(reader, options) {
    const keys = await resolveIssueKeys(reader, options);
    const issues = [];
    for (const key of keys) {
        try {
            const issue = await reader.fetchIssue(key);
            const written = await writeWorkOsV1Snapshot(issue, {
                outputDir: options.outputDir,
                downloadAttachments: options.downloadAttachments,
                downloadAttachment: reader.downloadAttachment.bind(reader),
            });
            issues.push({ key, status: 'synced', issueDir: written.issueDir, comments: issue.comments.length,
                attachments: issue.attachments.length, downloadedAttachments: written.downloadedAttachments, warnings: written.warnings });
        }
        catch (error) {
            issues.push({ key, status: 'failed', error: errorMessage(error) });
        }
    }
    const synced = issues.filter((issue) => issue.status === 'synced').length;
    const failed = issues.length - synced;
    return { schemaVersion: 1, status: failed === 0 ? 'success' : synced === 0 ? 'failed' : 'partial', total: issues.length, synced, failed, outputDir: options.outputDir, issues };
}
/** Compatibility alias for the embedded board-sync entrypoint. */
export const runBoardSync = runExport;
async function resolveIssueKeys(reader, options) {
    const explicit = options.issueKeys?.map(normalizeIssueKey) ?? [];
    const searched = options.jql?.trim() ? await reader.searchIssueKeys(options.jql.trim()) : [];
    const keys = explicit.length ? explicit : searched.map(normalizeIssueKey);
    if (keys.length === 0)
        throw new Error('No Jira issue keys were provided or found');
    return [...new Set(keys)];
}
