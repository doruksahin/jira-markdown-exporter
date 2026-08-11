import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, sep } from 'node:path';

export interface OutputProfileManifest {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly ownedDirectory: string;
  readonly attachmentsDirectory: string;
  readonly files: readonly OutputProfileFile[];
}

export interface OutputProfileFile {
  readonly template: string;
  readonly output: string;
}

export interface OutputProfile {
  readonly directory: string;
  readonly manifest: OutputProfileManifest;
}

export interface OutputProfileSelection {
  readonly profile?: string;
  readonly templateDir?: string;
}

const BUILTIN_PROFILES: Readonly<Record<string, string>> = {
  'work-os-v1': fileURLToPath(new URL('../../profiles/work-os-v1/', import.meta.url)),
};

/** Loads a built-in profile or an explicitly selected local profile directory. */
export async function loadOutputProfile(selection: OutputProfileSelection = {}): Promise<OutputProfile> {
  if (selection.profile && selection.templateDir) throw new Error('Use either --profile or --template-dir, not both');
  const name = selection.profile ?? 'work-os-v1';
  const directory = selection.templateDir ? resolve(selection.templateDir) : BUILTIN_PROFILES[name];
  if (!directory) throw new Error(`Unknown built-in output profile: ${name}`);
  return { directory, manifest: parseManifest(await readManifest(directory), directory) };
}

async function readManifest(directory: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(directory, 'profile.json'), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Could not load output profile at ${directory}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseManifest(value: unknown, directory: string): OutputProfileManifest {
  if (!isRecord(value)) throw new Error(`Output profile manifest at ${directory} must be a JSON object`);
  const id = requiredString(value, 'id', directory);
  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) throw new Error(`Output profile ${id} must use schemaVersion 1`);
  const ownedDirectory = safeSegment(requiredString(value, 'ownedDirectory', directory), 'ownedDirectory', id);
  const attachmentsDirectory = safeSegment(requiredString(value, 'attachmentsDirectory', directory), 'attachmentsDirectory', id);
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error(`Output profile ${id} must declare at least one file`);
  const outputNames = new Set<string>();
  const files = value.files.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Output profile ${id} file ${index + 1} must be an object`);
    const template = safeRelativePath(requiredString(entry, 'template', directory), 'template', id);
    const output = safeRelativePath(requiredString(entry, 'output', directory), 'output', id);
    if (!template.endsWith('.liquid')) throw new Error(`Output profile ${id} template must end with .liquid: ${template}`);
    if (!output.endsWith('.md')) throw new Error(`Output profile ${id} output must end with .md: ${output}`);
    if (outputNames.has(output)) throw new Error(`Output profile ${id} maps output more than once: ${output}`);
    outputNames.add(output);
    return { template, output };
  });
  return { id, schemaVersion, ownedDirectory, attachmentsDirectory, files };
}

function requiredString(value: Record<string, unknown>, key: string, directory: string): string {
  const result = value[key];
  if (typeof result !== 'string' || !result.trim()) throw new Error(`Output profile at ${directory} requires a non-empty ${key}`);
  return result.trim();
}

function safeSegment(value: string, field: string, id: string): string {
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\') || isAbsolute(value)) {
    throw new Error(`Output profile ${id} has unsafe ${field}: ${value}`);
  }
  return value;
}

function safeRelativePath(value: string, field: string, id: string): string {
  if (isAbsolute(value) || value.split(/[\\/]/).some((part) => part === '..' || part === '') || value.includes(`.${sep}`)) {
    throw new Error(`Output profile ${id} has unsafe ${field} path: ${value}`);
  }
  return value.replaceAll('\\', '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
