import { describe, expect, it } from 'vitest';
import { main, parseArguments } from '../../src/cli/main.js';

describe('CLI argument contract', () => {
  it('returns success for help', async () => {
    await expect(main(['--help'])).resolves.toBe(0);
  });

  it('parses an explicit issue selection and built-in profile', () => {
    expect(parseArguments(['--issue-keys', 'ATT-1, ATT-2', '--output-dir', './packets', '--download-attachments', '--profile', 'work-os-v1', '--json'])).toMatchObject({ issueKeys: ['ATT-1', 'ATT-2'], downloadAttachments: true, profile: 'work-os-v1', json: true });
  });

  it('requires exactly one selector', () => {
    expect(() => parseArguments(['--output-dir', './packets'])).toThrow('exactly one');
    expect(() => parseArguments(['--issue-keys', 'ATT-1', '--jql', 'project = ATT', '--output-dir', './packets'])).toThrow('exactly one');
  });

  it('rejects a profile and template directory together', () => {
    expect(() => parseArguments(['--issue-keys', 'ATT-1', '--output-dir', './packets', '--profile', 'work-os-v1', '--template-dir', './profile'])).toThrow('either --profile or --template-dir');
  });
});
