# Jira Markdown Exporter

Standalone, read-only Jira issue snapshot exporter.

This repository is planned as the reusable extraction of the board-sync flow
currently embedded in `jira-task-to-md`. It will provide a small CLI and a
versioned contract for exporting selected Jira issues into deterministic
Markdown packets.

The implementation boundary, output layout, JSON receipt, tests, and consumer
migration sequence are defined in [the extraction plan](docs/extraction-plan.md).

## Usage

```bash
JIRA_HOST=https://example.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=... \
pnpm jira-markdown-export --issue-keys ATT-1,ATT-2 --output-dir /path/to/packets --json
```

Use `--jql '<query>'` instead of `--issue-keys` to select issues with Jira
Query Language. Add `--download-attachments` to write binaries below the owned
`attachments/` directory. The CLI is read-only against Jira.

In JSON mode, the final stdout line conforms to
[schemas/export-receipt.schema.json](schemas/export-receipt.schema.json).
Exit status `0` means every issue synced, `2` means a partial per-issue result,
and `1` means the export failed.

The compatibility entrypoint `src/board-sync/cli.ts` is retained for callers
that previously invoked the embedded Work OS exporter with `tsx`.

## Initial contract

The first release preserves the `work-os-v1` profile:

```text
<output-dir>/<JIRA-KEY>/40 Jira/
├── 00 Issue.md
├── 10 Comments.md
├── 20 Attachments.md
├── 90 Sync.md
└── attachments/
```

The exporter owns only `40 Jira/`; it must not change task-packet files outside
that directory or write back to Jira.
