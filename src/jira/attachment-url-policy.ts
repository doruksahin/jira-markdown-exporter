/**
 * The Jira REST attachment `content` field can point to this Atlassian-hosted
 * media API instead of the configured `<tenant>.atlassian.net` origin.
 *
 * Keep this list exact. Attachment URLs are untrusted input and the download
 * request carries the caller's Jira authorization header, so a broad suffix
 * check such as `*.atlassian.com` would be unsafe.
 */
const TRUSTED_MEDIA_ORIGINS = new Set(['https://api.media.atlassian.com']);

/**
 * Accepts an attachment URL only when it belongs to the configured Jira site
 * or the exact, documented Atlassian media origin used by Jira attachments.
 */
export function assertAllowedAttachmentUrl(contentUrl: string, jiraHost: string): string {
  const source = new URL(contentUrl);
  const jiraOrigin = new URL(jiraHost).origin;
  if (source.origin !== jiraOrigin && !TRUSTED_MEDIA_ORIGINS.has(source.origin)) {
    throw new Error(`Attachment host is outside the trusted Jira/Atlassian origins: ${source.origin}`);
  }
  return source.toString();
}
