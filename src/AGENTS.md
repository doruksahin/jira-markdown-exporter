# Source Code Guide

Read the root `AGENTS.md` first. This file narrows its rules to `src/`.

## Layer ownership

- `domain/` contains normalized snapshots and result types, never raw Jira
  responses.
- `ports/` defines the narrow reader boundary: search issue keys, fetch an
  issue, and download an attachment.
- `jira/` contains GET-only Jira adapters, pagination, ADF conversion, and
  attachment-origin policy.
- `output/` loads safe profiles, builds a credential-free template model, and
  atomically replaces one profile-owned directory.
- `runner/` coordinates selection, fetching, rendering, and per-issue results.
- `cli/` translates arguments, environment configuration, receipts, and exit
  codes. It must not contain Jira fetching or rendering logic.

Keep dependencies pointing inward:

```text
CLI and adapters -> runner, ports, domain
runner           -> ports, domain, output
output           -> domain
domain, ports    -> no CLI or concrete transport
```

For a Jira-specific conversion, map the value into `BoardIssueSnapshot` in the
Jira adapter and render only the normalized value. Do not import Jira SDK types
into the output layer.

## Sensitive boundaries

- `contentUrl` exists only so the attachment adapter can download bytes. Keep
  it out of `template-model.ts`, receipts, logs, and generated Markdown.
- `localizeInlineMedia` gives attachment-ID references precedence and leaves
  ambiguous filename-only links unchanged.
- Attachment binary requests must retain exact-origin validation and must not
  follow an unvalidated redirect.
- A failed attachment becomes a bounded warning; it must not corrupt an
  otherwise readable snapshot.
- A repeated enhanced-search page token must fail instead of looping.
- New Jira reads belong on the narrow `JiraReadClient` interface. Do not expose
  the full SDK client outside `jira/`.

## Public-contract changes

Any receipt field change requires coordinated updates to:

- `domain/export-result.ts`
- `schemas/export-receipt.schema.json`
- runner and CLI tests
- `README.md`

Any profile contract change requires coordinated updates to:

- `output/output-profile.ts`
- `schemas/output-profile.schema.json`
- `docs/output-profiles.md`
- focused profile tests

After runtime changes, run `pnpm check`. Do not edit or commit generated
`dist/`; `prepack` rebuilds it.
