# Source Code Guide

Read the root [`AGENTS.md`](../AGENTS.md) first. This file narrows its rules to
`src/`.

## Layer ownership, with real examples

- `domain/` contains portable values and result types. Example:
  [`domain/board-snapshot.ts`](domain/board-snapshot.ts) contains a Jira issue
  *snapshot*, not a Jira API response. `contentUrl` exists so an adapter can
  download a file, but the writer deliberately never renders it.
- `ports/` defines provider boundaries. Example:
  [`ports/board-issue-reader.ts`](ports/board-issue-reader.ts) has only
  `searchIssueKeys`, `fetchIssue`, and `downloadAttachment`.
- `jira/` is the Jira-specific adapter. Example:
  [`jira/jira-board-issue-reader.ts`](jira/jira-board-issue-reader.ts) requests
  explicit `ISSUE_FIELDS`, follows enhanced-search page tokens, and fetches all
  comments. Keep REST parsing and ADF conversion here.
- `runner/` combines the port and output profile. Example:
  [`runner/run-export.ts`](runner/run-export.ts) isolates a failure for
  `ATT-2` instead of discarding a completed `ATT-1` export.
- `output/` owns only generated filesystem layout. Example:
  [`output/work-os-v1-writer.ts`](output/work-os-v1-writer.ts) replaces one
  `40 Jira` directory through a staging directory; it does not touch `00 Task.md`.
- `cli/` translates arguments and exit codes only. Example:
  [`cli/main.ts`](cli/main.ts) accepts exactly one of `--issue-keys` and
  `--jql`, then delegates to `runExport`.
- `board-sync/cli.ts` is a deliberately tiny compatibility wrapper for Obsidian
  Work OS. Treat it as public surface, even though the implementation lives in
  `cli/main.ts`.

## Dependency direction

Keep dependencies pointing inward:

```text
cli, jira adapter, output → runner/ports/domain
runner                 → ports/domain/output
output                 → domain
domain and ports       → no Jira, CLI, or filesystem adapters
```

For example, if a Markdown field needs a Jira-specific conversion, convert it
to the string in `jira/adf-to-markdown.ts`, store that string in
`BoardIssueSnapshot.description`, and let the writer render it. Do not import
`adf-to-md` into `output/work-os-v1-writer.ts`.

## Changes that need particular care

- Attachment links: `localizeInlineMedia` gives ID references precedence and
  refuses ambiguous filename-only links. The duplicate `design.png` case in
  `test/core/work-os-v1-writer.test.ts` is the required reference example.
- Attachment downloading: a failure becomes a warning in `90 Sync.md`; it is
  not a reason to corrupt the previous readable snapshot. See the third writer
  test.
- Pagination: a repeated Jira enhanced-search token throws rather than looping.
  See the first adapter test before changing token handling.
- Public output: Any added receipt property must be reflected in
  `domain/export-result.ts`, `schemas/export-receipt.schema.json`, CLI tests,
  and `README.md`.
