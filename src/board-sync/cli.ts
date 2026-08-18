#!/usr/bin/env node

/**
 * Compatibility entrypoint for standalone board-sync callers.
 *
 * Work OS bundles the library API; retaining this narrow wrapper preserves the
 * historical CLI argument and receipt contract for other callers.
 */
import { main } from "../cli/main.js";

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
