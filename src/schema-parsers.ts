import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

import exportReceiptSchema from '../schemas/export-receipt.schema.json' with { type: 'json' };
import outputProfileManifestSchema from '../schemas/output-profile.schema.json' with { type: 'json' };
import type { ExportResult } from './domain/export-result.js';
import type { OutputProfileManifest } from './output/output-profile.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });

const exportReceiptValidator = ajv.compile(exportReceiptSchema);
const outputProfileManifestValidator = ajv.compile(outputProfileManifestSchema);

/** Validates an unknown completed export receipt against the published JSON Schema. */
export function parseExportReceipt(value: unknown): ExportResult {
  return parseWithSchema(value, exportReceiptValidator, 'export receipt') as ExportResult;
}

/** Validates an unknown output profile manifest against the published JSON Schema. */
export function parseOutputProfileManifest(value: unknown): OutputProfileManifest {
  return parseWithSchema(value, outputProfileManifestValidator, 'output profile manifest') as OutputProfileManifest;
}

function parseWithSchema(
  value: unknown,
  validate: ValidateFunction<unknown>,
  label: string,
): unknown {
  if (validate(value)) return value;
  throw new Error(`Invalid ${label}: ${formatErrors(validate.errors)}`);
}

function formatErrors(errors: readonly ErrorObject[] | null | undefined): string {
  if (!errors?.length) return 'schema validation failed';
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
    .join('; ');
}
