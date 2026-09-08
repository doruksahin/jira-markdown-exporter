import { describe, expect, it, vi } from 'vitest';
import { createJiraReadApi, type JiraBoardLayout } from '../../src/index.js';
import { createJiraReadApi as createEmbeddedJiraReadApi, ExporterTransportError } from '../../src/embedded.js';

const config = { host: 'https://example.atlassian.net' };
const rawLayout = {
  id: 7,
  name: 'Product board',
  self: 'https://example.atlassian.net/rest/agile/1.0/board/7/configuration',
  columnConfig: { columns: [
    { name: 'Waiting', statuses: [{ id: '10001', self: 'unused' }], min: 0 },
    { name: 'Quality', statuses: [{ id: '10003' }, { id: '10002' }] },
    { name: 'Shipped', statuses: [] },
  ] },
};

describe.each([
  ['root', createJiraReadApi],
  ['embedded', createEmbeddedJiraReadApi],
] as const)('%s board layout API', (_entrypoint, createApi) => {
  it('reads ordered board columns including empty columns through the injected GET transport', async () => {
    const jiraGet = vi.fn(async () => ({ status: 200, body: rawLayout }));
    const api = createApi(config, { jiraGet });
    const layout: JiraBoardLayout = await api.readBoardLayout('7');
    expect(jiraGet.mock.calls).toHaveLength(1);
    expect(jiraGet).toHaveBeenCalledWith({
      url: 'https://example.atlassian.net/rest/agile/1.0/board/7/configuration',
      headers: { Accept: 'application/json' },
      responseType: 'json',
    });
    expect(layout).toEqual({
      id: '7', name: 'Product board', columns: [
        { name: 'Waiting', statusIds: ['10001'] },
        { name: 'Quality', statusIds: ['10003', '10002'] },
        { name: 'Shipped', statusIds: [] },
      ],
    });
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.columns)).toBe(true);
    for (const column of layout.columns) {
      expect(Object.isFrozen(column)).toBe(true);
      expect(Object.isFrozen(column.statusIds)).toBe(true);
    }
  });

  it.each([
    null,
    {},
    { ...rawLayout, id: 8 },
    { ...rawLayout, id: [7] },
    { ...rawLayout, id: { toString: null } },
    { ...rawLayout, name: '' },
    { ...rawLayout, columnConfig: {} },
    { ...rawLayout, columnConfig: { columns: [] } },
    { ...rawLayout, columnConfig: { columns: [null] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality' }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: ' ', statuses: [] }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality', statuses: [null] }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality', statuses: [{ id: 'token=secret' }] }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality', statuses: [{ id: 10001 }] }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality', statuses: [{ id: '' }] }] } },
    { ...rawLayout, columnConfig: { columns: [{ name: 'Quality', statuses: [{ id: '1' }, { id: '1' }] }] } },
    { ...rawLayout, columnConfig: { columns: [
      { name: 'Waiting', statuses: [{ id: '1' }] },
      { name: 'Quality', statuses: [{ id: '1' }] },
    ] } },
  ])('rejects malformed or ambiguous layout without exposing response data %#', async (body) => {
    const api = createApi(config, { jiraGet: async () => ({ status: 200, body }) });
    const error = await api.readBoardLayout(7).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ExporterTransportError);
    expect(error).toMatchObject({
      message: 'Jira transport returned an invalid response',
      code: 'JIRA_TRANSPORT_INVALID_RESPONSE', operation: 'jira-board-layout',
    });
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it.each([403, 404, 429, 500])('preserves bounded HTTP status %i without response data', async (status) => {
    const api = createApi(config, { jiraGet: async () => ({ status, body: { message: 'token=secret' } }) });
    const error = await api.readBoardLayout(7).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'JIRA_TRANSPORT_HTTP_ERROR', operation: 'jira-board-layout', status });
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('bounds a thrown transport failure and rejects an unsafe board ID before requesting', async () => {
    const jiraGet = vi.fn(async () => { throw new Error('token=secret'); });
    const api = createApi(config, { jiraGet });
    await expect(api.readBoardLayout('../myself')).rejects.toThrow('Invalid Jira board ID');
    expect(jiraGet).not.toHaveBeenCalled();
    await expect(api.readBoardLayout(7)).rejects.toMatchObject({
      message: 'Jira transport request failed',
      code: 'JIRA_TRANSPORT_REQUEST_FAILED', operation: 'jira-board-layout',
    });
  });
});
