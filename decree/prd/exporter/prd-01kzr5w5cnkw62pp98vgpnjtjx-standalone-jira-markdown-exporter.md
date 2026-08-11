---
id: PRD-01KZR5W5CNKW62PP98VGPNJTJX
status: draft
date: 2026-08-11
---

# PRD-01KZR5W5CNKW62PP98VGPNJTJX Standalone Jira Markdown Exporter

## Problem Statement

The current Jira-to-Markdown exporter is embedded in the much broader
`jira-task-to-md` workspace. Its useful board-sync path is coupled to pipeline
types, a generic Jira converter, and application dependencies that consumers
such as Obsidian Work OS do not need. Moving or reusing it therefore requires
copying implementation details and absolute local paths instead of consuming a
small, versioned contract.

Teams need a standalone, read-only CLI that can fetch explicitly requested
Jira issues or a JQL result and write a deterministic Markdown snapshot
without creating, moving, or changing surrounding task-packet files.

## Requirements

- Provide a standalone Node.js TypeScript repository with a published-bin-ready
  CLI named `jira-markdown-export`.
- Accept exactly one issue selection mode: `--issue-keys <CSV>` or `--jql
  <QUERY>`, plus required `--output-dir <DIR>`, optional
  `--download-attachments`, and optional `--json`.
- Read Jira credentials only from `JIRA_HOST`, `JIRA_EMAIL`, and
  `JIRA_API_TOKEN`; never write credentials, request bodies, or attachment URLs
  into the result receipt.
- Implement a read-only Jira adapter that paginates JQL and comments, explicitly
  requests the fields needed by the snapshot, and rejects attachment download
  URLs outside the configured Jira origin.
- Define and version public snapshot DTOs, a provider port, and a JSON result
  schema. The final stdout line in `--json` mode must conform to that schema and
  report success, partial, or failed execution per issue.
- Ship the compatibility output profile `work-os-v1`. It owns only
  `<output-dir>/<ISSUE-KEY>/40 Jira/` and writes `00 Issue.md`,
  `10 Comments.md`, `20 Attachments.md`, `90 Sync.md`, and optional
  `attachments/`. It must preserve files outside that owned directory.
- Make output deterministic for identical snapshots, including whitespace,
  attachment names, manifests, and Markdown links. Inline image localization
  must use attachment IDs rather than ambiguous filenames.
- Include user documentation for authentication, CLI usage, the `work-os-v1`
  layout, JSON receipt schema, failure and exit-code behavior, and migration
  from the embedded exporter.
- Migrate the AdCreative Obsidian integration only after fixture parity and a
  real read-only validation demonstrate that the standalone CLI produces the
  expected packet layout.

## Success Criteria

- `jira-markdown-export --help` documents the supported interface and the
  command returns exit code 0, 2, or 1 for success, partial, or failed export.
- Fixture tests verify all four `work-os-v1` Markdown files, attachment
  localization, idempotent output, exact ownership of `40 Jira/`, JQL/comment
  pagination, origin rejection, and structured partial failures.
- A caller can replace the old board-sync invocation with the standalone CLI
  without importing the old workspace or parsing human-facing terminal text.
- The repository contains a versioned JSON schema and examples that let an
  independent consumer validate the receipt and discover the generated files.
- `pnpm check` and `decree lint` pass before the initial commit.

## Scope

### In scope

- Extracting the board snapshot reader, Markdown renderer, writer, CLI, tests,
  and documentation into this repository.
- A compatibility-preserving `work-os-v1` output profile and an explicit
  provider boundary suitable for future non-Jira sources.
- A small integration guide and migration checklist for the existing AdCreative
  Work OS consumer.

### Out of scope

- Obsidian UI, sprint discovery, task-packet lifecycle, Multica synchronization,
  Jira mutations, or a hosted service.
- Generic task management, the old LLM pipeline, report generation, and the
  legacy single-issue conversion workflow.
- A second generic output layout in the initial release.

## Delivery Plan

1. Freeze the `work-os-v1` result and directory contract as schemas, examples,
   and golden fixtures.
2. Implement snapshot domain types, the reader port, read-only Jira adapter,
   ADF Markdown conversion, writer, and CLI with the narrow dependency set.
3. Prove the contract with focused unit and integration-style fixture tests.
4. Add a migration guide, then point the existing Work OS consumer at the new
   CLI in a follow-up change after parity validation.
