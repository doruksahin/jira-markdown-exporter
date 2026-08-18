# Extraction plan: Jira Markdown Exporter

Status: implemented
Governing PRD: `PRD-01KZR5W5CNKW62PP98VGPNJTJX`

## Goal

Extract the reusable, read-only board-sync flow from the `jira-task-to-md`
workspace into this repository without changing the current Obsidian Work OS
packet format during migration.

## Public CLI contract

```bash
jira-markdown-export \
  --issue-keys ATT-5199,ATT-5215 \
  --output-dir /path/to/task-packets \
  --download-attachments \
  --json
```

The CLI supports exactly one selector: `--issue-keys <CSV>` or `--jql <QUERY>`.
It requires `--output-dir`, reads `JIRA_HOST`, `JIRA_EMAIL`, and
`JIRA_API_TOKEN`, and exits with `0` (success), `2` (partial), or `1` (failed).

In `--json` mode its final stdout line will conform to a versioned JSON schema.
The receipt includes only outcome counts, safe paths, per-issue status, and
warnings; it excludes credentials and remote attachment URLs.

## v1 output profile

`work-os-v1` is the sole profile in the first release. For each issue it writes:

```text
<output-dir>/<JIRA-KEY>/40 Jira/
├── 00 Issue.md
├── 10 Comments.md
├── 20 Attachments.md
├── 90 Sync.md
└── attachments/<attachment-id>-<safe-filename>
```

It owns only the `40 Jira/` subtree. Existing packet files such as
`00 Task.md`, `10 Worklog.md`, and `30 Comms.md` are immutable from the
exporter’s perspective.

## Extraction boundary

Move or re-author only these concepts:

| Layer | Standalone responsibility |
|---|---|
| `domain` | `BoardIssueSnapshot`, comments, attachments, result receipt |
| `ports` | `BoardIssueReader`: search, fetch, and attachment download |
| `jira` | read-only Jira v3 client, JQL/comment pagination, ADF rendering |
| `output` | deterministic `work-os-v1` Markdown writer and attachment storage |
| `library` | explicit in-memory configuration and reusable export entrypoint |
| `cli` | argument validation, environment adapter, JSON result and exit code |

Do not copy the old pipeline domain, report generation, LLM flow, task tracker,
or generic Jira converter. The generic converter pulls in unrelated types and
dependencies. The new adapter will explicitly request the fields it needs and
will reject attachment URLs outside the configured Jira origin.

## Implementation phases

1. **Contract fixtures** — Freeze golden `work-os-v1` files and a JSON receipt
   schema. Include duplicate attachment names and inline-image localization.
2. **Core** — Implement DTOs, reader port, runner, deterministic renderer, and
   owned-directory writer.
3. **Jira adapter** — Add Jira v3 JQL/comment pagination, ADF-to-Markdown,
   origin-checked binary downloads, and environment-only credential loading.
4. **CLI and documentation** — Publish usage, output, authentication, errors,
   schema, and migration documentation.
5. **Library migration** — Export the typed config-object API, make the CLI a
   consumer of it, and let Work OS bundle the API plus canonical profile.

## Required tests

- CLI argument and exit-code behavior.
- Golden output for all four Markdown files.
- Idempotent repeat exports and preservation outside `40 Jira/`.
- JQL and comment pagination.
- Partial per-issue failures and schema-valid JSON receipts.
- Attachment ID naming, duplicate filename handling, inline-link rewriting, and
  foreign-origin rejection.

## Deferred

- A generic, non-Work-OS directory layout.
- Jira writes, sprint discovery, lifecycle logic, Obsidian UI, Multica sync,
  hosted execution, and package publication.
