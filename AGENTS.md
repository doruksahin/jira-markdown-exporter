# Jira Markdown Exporter — Agent Guide

## Purpose and boundary

This repository is a standalone, read-only Jira Cloud exporter. It fetches
issues, normalizes them, renders a selected output profile, and returns a
versioned receipt. It must not know the directory conventions, lifecycle, UI,
or publication policy of any consuming repository.

The public CLI is `src/cli/main.ts`. The reusable application entrypoint is
`src/index.ts`. Public usage, receipt behavior, and exit codes are documented
in `README.md` and `schemas/export-receipt.schema.json`.

## Architecture

```text
CLI or library caller
  -> runExport application flow
  -> BoardIssueReader port
  -> JiraBoardIssueReader adapter
  -> generic profile writer
  -> <output>/<KEY>/<profile.ownedDirectory>
```

`BoardIssueSnapshot` is the boundary between Jira fetching and rendering. The
writer must not import Jira response types. Output profiles own presentation
only; they do not own Jira transport, attachment safety, receipts, or atomic
filesystem replacement.

## Non-negotiable rules

1. Keep Jira read-only. Only GET operations belong in the Jira adapter.
2. Never log or serialize credentials. Templates must not receive credentials
   or attachment content URLs.
3. Keep runtime code, schemas, and packaged profiles consumer-neutral. The
   package-boundary test is the executable guard.
4. Replace only the selected profile's owned directory. Preserve sibling files
   beneath the issue-key directory.
5. Reject unsafe manifest paths and profile symlinks.
6. Preserve attachment-origin validation and collision-safe ID-prefixed names.
7. Preserve partial-result semantics: completed issues remain available when a
   different issue fails.
8. Preserve deterministic bytes: trim trailing whitespace and write one final
   newline.

## Change map

| Change | Start here | Required proof |
| --- | --- | --- |
| CLI flag or exit behavior | `src/cli/main.ts` | `test/jira/cli.test.ts`, schema and README when public output changes |
| Jira field, pagination, or ADF conversion | `src/jira/` | focused Jira adapter test with fake transport |
| Receipt or partial-result behavior | `src/runner/run-export.ts` | `test/core/run-export.test.ts` |
| Rendering or attachment storage | `src/output/profile-writer.ts` | `test/core/generic-profile-writer.test.ts` |
| Manifest or template model | `src/output/` and `schemas/output-profile.schema.json` | `test/core/output-profile.test.ts` and profile guide |
| Built-in generic presentation | `profiles/generic-v1/` | exact observable output assertion |
| Public package contents | `package.json` | `test/core/package-boundary.test.ts` and `pnpm release:check` |

Do not add a consumer adapter, workflow, task lifecycle, or consumer-owned
template to this repository. Consumers integrate through `--template-dir`,
the generated tree, and the JSON receipt.

## Verification

After a change:

```sh
pnpm check
```

Before a release candidate:

```sh
pnpm release:check
```

Never edit or commit `dist/` or `node_modules/`. Never commit credentials or
downloaded Jira data. Read `test/AGENTS.md` before changing tests and
`profiles/AGENTS.md` before changing the built-in profile.
