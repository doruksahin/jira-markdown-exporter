---
date: '2026-08-11'
governs:
- src/
- schemas/
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
