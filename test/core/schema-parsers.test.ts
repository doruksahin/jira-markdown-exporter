import { describe, expect, it } from 'vitest';

import {
  calculateOutputProfileDigest,
  parseExportReceipt,
  parseOutputProfileManifest,
} from '../../src/index.js';
import {
  calculateOutputProfileDigest as calculateEmbeddedOutputProfileDigest,
  parseExportReceipt as parseEmbeddedExportReceipt,
  parseOutputProfileManifest as parseEmbeddedOutputProfileManifest,
} from '../../src/embedded.js';

const manifest = {
  id: 'contract-v1',
  schemaVersion: 1 as const,
  ownedDirectory: 'snapshot',
  attachmentsDirectory: 'attachments',
  files: [{ template: 'issue.md.liquid', output: 'issue.md' }],
};

const receipt = {
  schemaVersion: 1 as const,
  exporterVersion: '0.4.1',
  profileId: 'contract-v1',
  profileDigest: `sha256:${'a'.repeat(64)}` as const,
  status: 'success' as const,
  total: 1,
  synced: 1,
  failed: 0,
  outputDir: '/tmp/export',
  issues: [{ key: 'ATT-123', status: 'synced' as const, issueDir: '/tmp/export/ATT-123/snapshot' }],
};

describe('public JSON Schema parsers', () => {
  it('accepts completed receipts through the root and embedded entrypoints', () => {
    expect(parseExportReceipt(receipt)).toBe(receipt);
    expect(parseEmbeddedExportReceipt(receipt)).toBe(receipt);
  });

  it('rejects receipts that do not conform to the published schema', () => {
    expect(() => parseExportReceipt({ ...receipt, profileDigest: 'not-a-digest' }))
      .toThrow('Invalid export receipt');
    expect(() => parseExportReceipt({ ...receipt, consumerPath: 'vault' }))
      .toThrow('additional properties');
  });

  it('accepts profile manifests through the root and embedded entrypoints', () => {
    expect(parseOutputProfileManifest(manifest)).toBe(manifest);
    expect(parseEmbeddedOutputProfileManifest(manifest)).toBe(manifest);
  });

  it('rejects manifests that do not conform to the published schema', () => {
    expect(() => parseOutputProfileManifest({ ...manifest, ownedDirectory: '..' }))
      .toThrow('Invalid output profile manifest');
    expect(() => parseOutputProfileManifest({ ...manifest, files: [] }))
      .toThrow('must NOT have fewer than 1 items');
  });

  it('exposes one validated profile digest implementation from both entrypoints', async () => {
    const profile = { manifest, templates: { 'issue.md.liquid': '# {{ issue.key }}\n' } };

    const rootDigest = await calculateOutputProfileDigest(profile);
    const embeddedDigest = await calculateEmbeddedOutputProfileDigest(profile);

    expect(rootDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(embeddedDigest).toBe(rootDigest);
  });
});
