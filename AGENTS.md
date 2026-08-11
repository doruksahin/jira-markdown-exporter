# Jira Markdown Exporter — Agent Guide

## What this repository is for

This is the standalone, **read-only** exporter behind the Obsidian Work OS
Jira → Obsidian sync. It turns Jira issue data into a deterministic Markdown
snapshot. It does not create, edit, transition, or comment on Jira issues.

The live consumer is the Obsidian Work OS plugin in the AdCreative vault. Its
runtime constructs this compatibility invocation:

```sh
node node_modules/tsx/dist/cli.mjs src/board-sync/cli.ts \
  --issue-keys ATT-5215 \
  --output-dir "/path/to/Tasks/Sprints/26_08_01 · 16793" \
  --json
```

The compatibility entrypoint is therefore part of the public contract:
[`src/board-sync/cli.ts`](src/board-sync/cli.ts). Do not remove, rename, or
change its argument behavior without migrating the Work OS caller.

The actual CLI implementation is [`src/cli/main.ts`](src/cli/main.ts). Its
documented command examples are in [`README.md`](README.md), and its JSON
receipt is defined by [`schemas/export-receipt.schema.json`](schemas/export-receipt.schema.json).

## Output authority: the non-negotiable boundary

For an issue such as `ATT-123`, the exporter owns **exactly**:

```text
<output-dir>/ATT-123/40 Jira/
├── 00 Issue.md
├── 10 Comments.md
├── 20 Attachments.md
├── 90 Sync.md
└── attachments/                 # only with --download-attachments
```

It must not alter sibling, human-owned packet files such as:

```text
<output-dir>/ATT-123/00 Task.md
<output-dir>/ATT-123/10 Worklog.md
<output-dir>/ATT-123/20 Test.md
<output-dir>/ATT-123/30 Comms.md
```

This is executable behavior, not just documentation. Before changing output
ownership, read and preserve the regression in
[`test/core/work-os-v1-writer.test.ts`](test/core/work-os-v1-writer.test.ts):
the test writes `00 Task.md` with `# Human-owned`, runs the writer twice, and
asserts that the human file survives while an obsolete file *inside* `40 Jira`
is removed. Follow that exact example when reasoning about a proposed change.

## Architecture: follow the data flow

```text
CLI / compatibility wrapper
  → runner
    → BoardIssueReader port
      → JiraBoardIssueReader adapter
    → work-os-v1 writer
      → <KEY>/40 Jira
```

Use the provider-neutral `BoardIssueSnapshot` at
[`src/domain/board-snapshot.ts`](src/domain/board-snapshot.ts) as the boundary
between fetching and rendering. For example, a future Linear or fixture reader
would implement [`src/ports/board-issue-reader.ts`](src/ports/board-issue-reader.ts)
and return the same snapshot; it must not make the writer import Jira types.

`runExport` in [`src/runner/run-export.ts`](src/runner/run-export.ts) is the
orchestration boundary. Its partial-failure example is in
[`test/core/run-export.test.ts`](test/core/run-export.test.ts): `ATT-1` writes
successfully while `ATT-2` returns `status: "failed"`; the final receipt is
`partial`, and `ATT-1/40 Jira/00 Issue.md` remains available. Do not replace
that behavior with all-or-nothing export semantics.

## Safety rules

1. Keep Jira read-only. The only Jira adapter is
   [`src/jira/jira-board-issue-reader.ts`](src/jira/jira-board-issue-reader.ts).
   It may issue GET requests only. Never add mutation endpoints such as
   `POST /issue`, `PUT /issue`, transitions, or comment creation.
2. Never log, serialize, commit, or add examples containing `JIRA_API_TOKEN`.
   Credentials come from runtime environment variables as shown in
   [`README.md`](README.md). Keep `.env` local and ignored.
3. Preserve attachment-origin validation. The adapter's
   `assertJiraOrigin` prevents a Jira attachment URL from redirecting to a
   foreign host. The concrete rejection example is
   `https://evil.example/file` in
   [`test/jira/jira-board-issue-reader.test.ts`](test/jira/jira-board-issue-reader.test.ts).
4. Preserve the filename-collision rule. `design.png` attachment IDs `20` and
   `21` become `20-design.png` and `21-design.png`; see the second writer test.
   Do not localize an ambiguous filename-only Markdown link.
5. Preserve generated-byte stability. The writer trims trailing whitespace and
   writes exactly one final newline in `writeMarkdown`. Update golden-like
   assertions when intentionally changing this contract.

## How to make changes

Start from a concrete behavior and its existing test:

| Change request | Start here | Required proof |
|---|---|---|
| New Markdown field or layout | `src/output/work-os-v1-writer.ts` | Extend `test/core/work-os-v1-writer.test.ts`; verify no file outside `40 Jira` changes. |
| Jira REST field, pagination, or ADF behavior | `src/jira/jira-board-issue-reader.ts` | Extend `test/jira/jira-board-issue-reader.test.ts` with mocked `fetch`. |
| Selector, flag, exit-code, or JSON receipt change | `src/cli/main.ts` + schema | Extend `test/jira/cli.test.ts` and update `schemas/export-receipt.schema.json` and `README.md`. |
| Retry/partial failure behavior | `src/runner/run-export.ts` | Extend `test/core/run-export.test.ts` using `FakeReader`. |

For example, if asked to add a `--dry-run` flag, do not put Jira HTTP logic in
`src/cli/main.ts`. Parse the flag there, pass it to the runner, and add a
`FakeReader` test proving no writer call occurs. If asked to render an
additional Jira field, add it to `BoardIssueSnapshot`, map it in the Jira
adapter, render it in the writer, and test the rendered packet. Update the
schema/README only when the public receipt or CLI contract changes.

## Verification and handoff

Run this exact repository check after code changes:

```sh
pnpm check
```

It runs TypeScript typechecking, builds `dist/`, and executes the Vitest suite.
Do not commit `dist/`, `node_modules/`, or credentials; all are intentionally
ignored. Report verification with the actual command and result, for example:
`pnpm check — 12 tests passed`.

For scope and compatibility decisions, consult these repository records before
inventing a new contract:

- [`docs/extraction-plan.md`](docs/extraction-plan.md) — extraction boundary and migration intent.
- [`decree/adr/exporter/adr-01kzr66763mx33yrfbw9exwjaq-preserve-work-os-v1-as-the-initial-output-profile.md`](decree/adr/exporter/adr-01kzr66763mx33yrfbw9exwjaq-preserve-work-os-v1-as-the-initial-output-profile.md) — why the initial layout stays `work-os-v1`.
- [`decree/spec/exporter/spec-01kzr6678ktm854ejtmbjz2gqj-implement-standalone-jira-markdown-exporter-v1.md`](decree/spec/exporter/spec-01kzr6678ktm854ejtmbjz2gqj-implement-standalone-jira-markdown-exporter-v1.md) — implemented v1 scope.
