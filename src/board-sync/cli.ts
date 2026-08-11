#!/usr/bin/env node

/**
 * Compatibility entrypoint for the existing Work OS launcher.
 *
 * The launcher invokes `tsx src/board-sync/cli.ts`; retaining this narrow
 * wrapper lets it migrate repositories without changing its command contract.
 */
import { main } from "../cli/main.js";

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
