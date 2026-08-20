---
date: '2026-08-11'
governs:
- AGENTS.md
- PROJECT.md
- docs/
- package.json
- pnpm-lock.yaml
- profiles/
- README.md
- src/
- schemas/
- test/
id: SPEC-01KZR6678KTM854EJTMBJZ2GQJ
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
- ADR-01KZR66763MX33YRFBW9EXWJAQ
status: implemented
---

# SPEC-01KZR6678KTM854EJTMBJZ2GQJ Implement standalone Jira Markdown Exporter v1

## Overview

Implement a Node.js TypeScript package whose CLI reads Jira snapshots and writes
only the deterministic `work-os-v1` `40 Jira/` directory. The package exposes
domain DTOs, a provider port, a runner, a Jira v3 adapter, a Markdown writer,
and a schema-valid final JSON receipt.

## Technical Design

The later embedded-transport contract
`SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H` is authoritative for attachment HTTP
transport. This V1 record remains authoritative for output ownership,
deterministic rendering, CLI behavior, and partial-result semantics.

`src/domain` defines immutable issue, comment, attachment, and receipt types.
`src/ports` declares a read-only reader. `src/runner` resolves issue keys,
processes each issue independently, and returns success, partial, or failed.
`src/output` renders and replaces only the owned `40 Jira/` subtree.

`src/jira` creates a Jira v3 client from environment credentials, paginates JQL
and comments, explicitly requests snapshot fields, converts ADF content to
Markdown, and accepts downloads only from the configured Jira origin.

`src/cli` validates the two selection modes and writes the structured receipt
as its final JSON line. The CLI maps receipt statuses to exit codes 0, 2, and
1. The `schemas` directory holds the versioned receipt JSON schema.

`src/index.ts` is the package library entrypoint. It accepts credentials,
selection, output directory and a prevalidated in-memory output profile as a
typed config object; it does not read environment variables or write process
output. The CLI loads its environment/profile adapters and delegates to this
same entrypoint. Package exports expose the library and canonical profile
assets so an embedding application can bundle them without copying templates.

## Testing Strategy

Vitest fixture tests will cover owned-directory isolation, deterministic
Markdown, attachment naming and inline links, per-issue partial failures,
argument parsing, JQL/comment pagination, and foreign-origin attachment
rejection. `pnpm check` runs typecheck and tests.

## Acceptance Criteria

- [x] CLI validates both selection modes and returns documented exit codes.
- [x] `work-os-v1` writes the four Markdown files and optional attachment files
  without altering files outside `40 Jira/`.
- [x] Result receipts conform to the versioned JSON schema and report partial
  failures per issue.
- [x] Jira reads paginate JQL/comments and reject foreign attachment origins.
- [x] Tests cover deterministic output, ownership isolation, CLI parsing, and
  Jira adapter guards.
- [x] README and contract documentation describe runtime configuration and
  output ownership.
- [x] A typed library entrypoint and the CLI share one export implementation;
  the library does not read `process.env` or write stdout/stderr.
- [x] Canonical profile assets are package exports and an in-memory profile
  renders through the same deterministic writer.
