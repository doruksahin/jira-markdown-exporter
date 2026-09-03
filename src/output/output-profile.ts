import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

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
  readonly directory?: string;
  readonly templates?: Readonly<Record<string, string>>;
  readonly manifest: OutputProfileManifest;
}

export interface OutputProfileSelection {
  readonly profile?: string;
  readonly templateDir?: string;
}

/** Loads the generic built-in profile or an explicitly selected local profile directory. */
export async function loadOutputProfile(selection: OutputProfileSelection = {}): Promise<OutputProfile> {
  if (selection.profile && selection.templateDir) throw new Error('Use either --profile or --template-dir, not both');
  const name = selection.profile ?? 'generic-v1';
  const directory = selection.templateDir ? resolve(selection.templateDir) : builtinProfileDirectory(name);
  if (!directory) throw new Error(`Unknown built-in output profile: ${name}`);
  return validateOutputProfile({ directory, manifest: parseManifest(await readManifest(directory), directory) });
}

/** Revalidates profiles supplied through the public in-memory API before filesystem writes. */
export async function validateOutputProfile(profile: OutputProfile): Promise<OutputProfile> {
  const manifest = freezeManifest(parseManifest(profile.manifest, profile.directory || 'in-memory output profile'));
  if (profile.templates) return Object.freeze({ manifest, templates: immutableTemplates(profile.templates) });
  if (!profile.directory) return Object.freeze({ manifest });
  const directory = resolve(profile.directory);
  await assertSymlinkFreeProfile(directory);
  return Object.freeze({ manifest, templates: await snapshotTemplates(directory) });
}

/** Hashes the validated logical profile content independently of filesystem traversal order. */
export async function calculateOutputProfileDigest(profile: OutputProfile): Promise<`sha256:${string}`> {
  if (!profile.templates && profile.directory) return calculateOutputProfileDigest(await validateOutputProfile(profile));
  const hash = createHash('sha256');
  addDigestEntry(hash, 'manifest', JSON.stringify(profile.manifest));
  if (profile.templates) {
    for (const name of Object.keys(profile.templates).sort()) addDigestEntry(hash, name, profile.templates[name] ?? '');
  } else {
    throw new Error('Output profile has no template source');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function snapshotTemplates(directory: string): Promise<Readonly<Record<string, string>>> {
  const templates: Record<string, string> = {};
  for (const name of await profileFileNames(directory)) {
    if (name === 'profile.json') continue;
    const bytes = await readFile(resolve(directory, name));
    try {
      templates[name] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Output profile template must contain valid UTF-8: ${name}`);
    }
  }
  return Object.freeze(templates);
}

function immutableTemplates(source: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const templates: Record<string, string> = {};
  for (const name of Object.keys(source).sort()) {
    const content = source[name];
    if (typeof content !== 'string') throw new Error(`Output profile template must be a string: ${name}`);
    templates[name] = content;
  }
  return Object.freeze(templates);
}

function freezeManifest(manifest: OutputProfileManifest): OutputProfileManifest {
  const files = Object.freeze(manifest.files.map((file) => Object.freeze({ ...file })));
  return Object.freeze({ ...manifest, files });
}

function addDigestEntry(hash: ReturnType<typeof createHash>, name: string, content: string | Uint8Array): void {
  const nameBytes = Buffer.from(name, 'utf8');
  const contentBytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  hash.update(`${nameBytes.byteLength}:`);
  hash.update(nameBytes);
  hash.update(`${contentBytes.byteLength}:`);
  hash.update(contentBytes);
}

async function profileFileNames(directory: string, relative = ''): Promise<readonly string[]> {
  const entries = await readdir(relative ? resolve(directory, relative) : directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...await profileFileNames(directory, child));
    else if (entry.isFile()) names.push(child);
  }
  return names;
}

function builtinProfileDirectory(name: string): string | undefined {
  if (name !== 'generic-v1') return undefined;
  return fileURLToPath(new URL('../../profiles/generic-v1/', import.meta.url));
}

async function assertSymlinkFreeProfile(directory: string, relative = ''): Promise<void> {
  const current = relative ? resolve(directory, relative) : directory;
  if ((await lstat(current)).isSymbolicLink()) {
    throw new Error(`Output profile must not contain symbolic links: ${relative || directory}`);
  }
  if (!(await lstat(current)).isDirectory()) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Output profile must not contain symbolic links: ${child}`);
    if (entry.isDirectory()) await assertSymlinkFreeProfile(directory, child);
  }
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
  assertKnownProperties(value, ['$schema', 'id', 'schemaVersion', 'ownedDirectory', 'attachmentsDirectory', 'files'], 'manifest');
  const id = requiredString(value, 'id', directory);
  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) throw new Error(`Output profile ${id} must use schemaVersion 1`);
  const ownedDirectory = safeSegment(requiredString(value, 'ownedDirectory', directory), 'ownedDirectory', id);
  const attachmentsDirectory = safeSegment(requiredString(value, 'attachmentsDirectory', directory), 'attachmentsDirectory', id);
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error(`Output profile ${id} must declare at least one file`);
  const outputNames = new Set<string>();
  const files = value.files.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Output profile ${id} file ${index + 1} must be an object`);
    assertKnownProperties(entry, ['template', 'output'], `file ${index + 1}`);
    const template = safeRelativePath(requiredString(entry, 'template', directory), 'template', id);
    const output = safeRelativePath(requiredString(entry, 'output', directory), 'output', id);
    if (!template.endsWith('.liquid')) throw new Error(`Output profile ${id} template must end with .liquid: ${template}`);
    if (!output.endsWith('.md')) throw new Error(`Output profile ${id} output must end with .md: ${output}`);
    if (output === attachmentsDirectory || output.startsWith(`${attachmentsDirectory}/`)) {
      throw new Error(`Output profile ${id} output must not overlap attachmentsDirectory: ${output}`);
    }
    if (outputNames.has(output)) throw new Error(`Output profile ${id} maps output more than once: ${output}`);
    outputNames.add(output);
    return { template, output };
  });
  return { id, schemaVersion, ownedDirectory, attachmentsDirectory, files };
}

function assertKnownProperties(value: Record<string, unknown>, allowed: readonly string[], location: string): void {
  const allowedNames = new Set(allowed);
  const unknown = Object.keys(value).find((name) => !allowedNames.has(name));
  if (unknown) throw new Error(`Output profile has unknown ${location} property: ${unknown}`);
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
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`Output profile ${id} has unsafe ${field} path: ${value}`);
  }
  return value.replaceAll('\\', '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
