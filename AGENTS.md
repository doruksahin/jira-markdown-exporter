# Jira Markdown Exporter — Agent Guide

This package exports read-only Jira snapshots through consumer-neutral output
profiles. Consumers own their templates, workflow, packet lifecycle, and
publication policy.

## Read when needed

- **Architecture:** Before changing interfaces, responsibilities, dependencies,
  execution/storage integration, or failure behavior, read
  [repository architecture](docs/architecture/README.md) and keep its
  [contract](.architecture/contract.json) synchronized.
- **Implementation:** Use the [change map](docs/maintenance.md#change-map) to
  locate source and required proof; read the [source guide](src/AGENTS.md)
  before changing runtime code.
- **Tests or profiles:** Read the [test guide](test/AGENTS.md) or
  [profile guide](profiles/AGENTS.md) before changing that area.
- **Documentation:** Follow [documentation maintenance](docs/maintenance.md#documentation-and-links)
  for routing, links, architecture updates, and the link check.
- **Release:** Follow the [release playbook](docs/releasing.md).

## Non-negotiable rules

1. Keep Jira read-only. Only GET operations belong in the Jira adapter.
2. Never log or serialize credentials. Templates must not receive credentials
   or attachment content URLs.
3. Keep runtime code, schemas, and packaged profiles consumer-neutral. The
   [package-boundary test](test/core/package-boundary.test.ts) is the guard.
4. Replace only the selected profile's owned directory. Preserve sibling files
   beneath the issue-key directory.
5. Reject unsafe manifest paths and profile symlinks.
6. Preserve attachment-origin validation and collision-safe ID-prefixed names.
7. Preserve partial results: completed issues remain available when another fails.
8. Preserve deterministic bytes: trim trailing whitespace and write one final newline.

## Verification

Run `pnpm check` after a change and `pnpm release:check` before a release
candidate. For documentation or architecture changes, also run the
[architecture and link checks](docs/maintenance.md#verification).

Never edit or commit generated `dist/`, `node_modules/`, credentials, or
downloaded Jira data.
