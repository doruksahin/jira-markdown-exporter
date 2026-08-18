import { ExporterTransportError, type AttachmentGetTransport } from '../transport.js';
import type { JiraConfig } from '../config/jira-config.js';

export function nativeAttachmentTransport(config: JiraConfig): AttachmentGetTransport {
  return Object.freeze({
    manualRedirects: true as const,
    get: async (request: Parameters<AttachmentGetTransport['get']>[0]) => {
      let response: Response;
      try {
        response = await fetch(request.url, {
          method: 'GET',
          headers: {
            ...request.headers,
            Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
          },
          redirect: 'manual',
        });
      } catch (_error) {
        throw new ExporterTransportError('ATTACHMENT_TRANSPORT_REQUEST_FAILED', 'attachment');
      }
      return Object.freeze({
        status: response.status,
        headers: Object.freeze(Object.fromEntries(response.headers.entries())),
        body: new Uint8Array(await response.arrayBuffer()),
      });
    },
  });
}
