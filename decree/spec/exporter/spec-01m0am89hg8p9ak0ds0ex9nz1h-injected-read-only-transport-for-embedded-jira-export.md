---
date: '2026-08-18'
governs:
- src/index.ts
- src/
- src/jira/jira-read-client.ts
- src/jira/jira-board-issue-reader.ts
- src/cli/main.ts
- test/core/library.test.ts
- test/jira/jira-board-issue-reader.test.ts
- test/jira/cli.test.ts
- package.json
- pnpm-lock.yaml
- README.md
id: SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
- ADR-01KZR66763MX33YRFBW9EXWJAQ
- SPEC-01KZR6678KTM854EJTMBJZ2GQJ
status: implemented
---

# SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H Injected Read-Only Transport for Embedded Jira Export

## Overview

Expose the existing read-only exporter to embedded runtimes such as Obsidian
without moving Jira endpoint construction, pagination, conversion, or output
rendering into the consumer. The public library accepts an environment-neutral
JSON GET callback. The exporter-owned embedded read facade is the source of
truth for Jira REST paths, parameters, pagination, ownership JQL, standard
fields, and normalized Work OS records. The standalone CLI keeps the existing
`jira.js` and native transport path, preserving
its flags, receipt, output bytes, and attachment behavior.

Attachment bytes remain a separate security boundary. The exporter derives the
content URL from the validated Jira origin and immutable attachment ID and
requests Jira REST v3 with `redirect=false`. An embedded caller supplies only
an injected byte GET callback; it never receives or chooses an attachment
origin. An embedded caller without that capability can export Markdown, but an
attachment-enabled request fails before any Jira read or filesystem write.

## Technical Design

### Public transport contract

`src/transport.ts` owns public types with no Axios or Obsidian dependency:

- `JiraGetTransport` receives `{url, headers, responseType: "json",
  timeoutMs?}` and returns `{status, headers?, body}`. There is no method field,
  so a caller cannot request a Jira mutation through this seam.
- `AttachmentGetTransport` exposes a GET callback receiving `{url, headers,
  responseType: "bytes", timeoutMs?}`. The URL is exporter-derived, uses the
  configured Jira origin, and includes `redirect=false`; callers cannot supply
  a different endpoint. Responses include status, headers, and bytes.
- `ExporterTransportError` exposes only a stable bounded code, operation, and
  optional HTTP status. Its message and enumerable fields never include
  credentials, response bodies, or full request URLs/query strings.

`exportJiraMarkdown` requires one explicit dependency mode: a provider-neutral
`reader`, an embedded `jiraGet` callback with optional attachment capability,
or `useDefaultTransport: true`. The CLI uses the third mode. In embedded mode,
`downloadAttachments: true` without an attachment byte transport throws
`ATTACHMENT_TRANSPORT_REQUIRED` before the reader or writer runs. No embedded
call silently falls back to native network access.

### Embedded Jira read facade

The package exports `jira-markdown-exporter/embedded`. Its runtime dependency
graph contains no `jira.js`, Axios, native `fetch`, or XHR code. Its required
GET callback serves both Markdown export and `createJiraReadApi`, which owns
myself/project/board/assignee probes, field discovery, direct task evidence,
board sprints, sprint issues, and board issues. It also owns pagination,
project-and-assignee JQL, the standard issue field set, plain-text ADF and
assignee/sprint normalization. Callers supply only stable team identifiers and
tracked custom-field IDs. The Node entrypoint retains `jira.js` for CLI parity.

### Attachment adapter

`JiraBoardIssueReader` invokes a narrow attachment GET callback with the
canonical `/rest/api/3/attachment/content/{id}?redirect=false` URL. Attachment
IDs are validated before URL construction and the completed URL must retain the
configured HTTPS Jira origin. Only `200` with a byte body succeeds; redirects,
foreign origins, malformed responses, and non-success statuses fail with stable
redacted errors. The default Node callback additionally uses `redirect:
"error"`; Obsidian can use `requestUrl` because Jira itself does not redirect.
Authorization is passed in memory but never included in an error or receipt.
Jira-provided `contentUrl` metadata is never executed as a download target.

### Release identity

The non-redirecting attachment transport is released as package version `0.2.5`, including the
matching exported runtime version constant and lockfile importer version. The
consumer refreshes its vendored archive from the exact `npm pack` artifact and
verified SHA-256; this SPEC does not modify the vault vendor copy.

## Testing Strategy

Vitest coverage uses fake callbacks and no live Jira instance. Tests prove the
embedded runtime graph has no Node/browser network implementation; that its
facade owns endpoint, JQL, field, pagination, and normalization behavior; and that
status, thrown, and malformed results map to bounded error facts without token,
body, JQL, or full-URL leakage. Library tests compare provider-neutral reader,
injected transport, and explicit default selection behavior and prove missing
attachment capability fails before transport or writes. Attachment tests prove
the canonical attachment-ID endpoint includes `redirect=false`, foreign or
malformed inputs cannot influence the request, redirect responses fail closed,
and incapable transports fail before writes. Existing fixtures prove CLI/output
parity.

Run `pnpm check`, then `npm pack --pack-destination <temporary-directory>` and
record the resulting tarball name and SHA-256 for the Work OS vendor refresh.

## Acceptance Criteria

- [x] Public JSON and attachment GET contracts contain no Axios or Obsidian types and expose no mutation method.
- [x] Embedded export requires an injected Jira GET callback and never falls back to native network access.
- [x] The embedded read facade is authoritative for Jira paths, fields, ownership JQL, pagination, and normalized Work OS records.
- [x] Transport failures expose only stable code, operation, and bounded status facts; secrets, bodies, JQL, and full query URLs are absent.
- [x] Attachment downloads require explicit manual-redirect capability and preserve per-hop exact-origin validation.
- [x] Standalone CLI flags, exit codes, receipt shape, generated Markdown, and default native transport behavior remain unchanged.
- [x] Focused tests cover adapter selection, GET-only enforcement, error/status mapping, redaction, parity, and attachment fail-closed behavior.
- [x] Package and runtime constant identify version 0.2.2, the lockfile pins its transport dependency, and the packed tarball SHA-256 is reported without modifying the vault vendor archive.
- [x] `pnpm check` passes.
- [x] README documents the embedded transport contract and attachment limitation without duplicating Jira endpoint or output-profile rules.
- [x] Embedded export and read-facade configuration require only the Jira host; email and API token remain inside the injected authorization transport.
- [x] Failed issue receipts preserve an allowlisted structured projection of known transport errors without removing the existing error text or exposing request data.
- [x] Metadata-only sync labels attachment downloads as intentionally disabled, while requested download failures retain explicit failure wording.
- [x] Attachment downloads derive a same-origin Jira REST v3 URL exclusively from the attachment ID and set `redirect=false`.
- [x] The embedded byte transport accepts only exporter-owned GET requests and fails closed on redirects, invalid responses, and missing capability.
- [x] The Node CLI retains attachment downloads and rejects unexpected redirects without changing flags, receipts, output paths, or partial-failure behavior.
- [x] Attachment warnings expose a bounded HTTP status when available, without URLs, credentials, or response bodies.
- [x] Package and runtime constant identify version 0.2.5; `pnpm check` and a clean `npm pack` pass.
