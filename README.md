# Jira Markdown Exporter

Standalone, read-only Jira issue snapshot exporter.

This repository is planned as the reusable extraction of the board-sync flow
currently embedded in `jira-task-to-md`. It will provide a small CLI and a
versioned contract for exporting selected Jira issues into deterministic
Markdown packets.

The implementation boundary, output layout, JSON receipt, tests, and consumer
migration sequence are defined in [the extraction plan](docs/extraction-plan.md).

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
