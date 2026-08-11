# Output Profile Authoring Guide

Read the repository-root [`AGENTS.md`](../AGENTS.md) and the complete
[`docs/output-profiles.md`](../docs/output-profiles.md) before changing a
profile. This directory owns presentation only: Markdown templates and their
`profile.json` manifests. It does not own Jira HTTP, credentials, attachment
downloads, filename safety, media-link rewriting, export receipts, or atomic
filesystem replacement.

## Start from the concrete built-in example

[`work-os-v1/profile.json`](work-os-v1/profile.json) is the canonical profile.
For `ATT-123`, it maps four Liquid templates to exactly these owned files:

```text
<output-dir>/ATT-123/40 Jira/
├── 00 Issue.md        ← work-os-v1/00 Issue.md.liquid
├── 10 Comments.md     ← work-os-v1/10 Comments.md.liquid
├── 20 Attachments.md  ← work-os-v1/20 Attachments.md.liquid
├── 90 Sync.md         ← work-os-v1/90 Sync.md.liquid
└── attachments/       ← binaries written by the exporter, never a template
```

The exact expected Markdown for that fixture is committed under
[`test/fixtures/work-os-v1`](../test/fixtures/work-os-v1). The regression in
[`test/core/output-profile.test.ts`](../test/core/output-profile.test.ts)
compares every generated file against those four golden files. Changing
`work-os-v1` therefore changes a compatibility contract, not merely wording.

## Manifest rules

Every profile has a `profile.json` with this minimum shape:

```json
{
  "id": "compact-v1",
  "schemaVersion": 1,
  "ownedDirectory": "Jira Snapshot",
  "attachmentsDirectory": "files",
  "files": [
    { "template": "Summary.md.liquid", "output": "Summary.md" }
  ]
}
```

Use [`schemas/output-profile.schema.json`](../schemas/output-profile.schema.json)
for editor validation. Keep these rules literal:

1. `ownedDirectory` and `attachmentsDirectory` are single folder names. For
   example, `Jira Snapshot` is valid; `../Task` and `nested/folder` are not.
2. Every `template` ends in `.liquid`; every `output` ends in `.md`.
3. Output paths may nest below the owned directory, such as
   `reference/Links.md`, but must never contain `..`, be absolute, or duplicate
   another output path.
4. Update the manifest mapping and the matching template in the same change.

The loader rejects unsafe output such as `../00 Task.md`. See the exact
rejection fixture in [`test/core/output-profile.test.ts`](../test/core/output-profile.test.ts).

## Template model: use only rendered data

Liquid templates receive only `issue`, `comments`, `attachments`, and `sync`.
The exact field list is in [`docs/output-profiles.md`](../docs/output-profiles.md).

For example, `work-os-v1/20 Attachments.md.liquid` should render a local link
only when `attachment.localPath` is non-empty:

```liquid
{% if attachment.localPath != blank %}
[open](<{{ attachment.localPath }}>)
{% else %}
not downloaded
{% endif %}
```

Do not add `contentUrl` to a template. `contentUrl` is intentionally excluded
from [`src/output/template-model.ts`](../src/output/template-model.ts), so a
template cannot trigger a download or expose a Jira attachment endpoint.

Do not reimplement collision handling in Liquid. When IDs `20` and `21` both
have the filename `design.png`, the exporter has already chosen distinct local
paths such as `attachments/20-design.png` and `attachments/21-design.png`.
Use the provided `attachment.localPath` exactly.

## Which change belongs where

| Request | Change here? | Correct starting point |
| --- | --- | --- |
| Rename an `ATT-123` Markdown heading | Yes | The relevant `.liquid` template and its golden/output test. |
| Add a fifth Markdown file | Yes | `profile.json`, a new `.liquid` file, and an output-profile regression. |
| Use a different packet folder, such as `Jira Snapshot` | Yes | A new local profile manifest; prove its owned directory in a test. |
| Download a missing attachment | No | `src/output/profile-writer.ts` and its tests. |
| Parse another Jira REST field | No | `src/jira/jira-board-issue-reader.ts`, then extend the safe template model only if it is rendered. |
| Change the Work OS launcher command | No | `src/board-sync/cli.ts` and the root compatibility contract. |

## Required proof

For a new profile, copy the `compact-v1` pattern from
[`test/core/output-profile.test.ts`](../test/core/output-profile.test.ts): make
a temporary profile directory, run `runExport`, and assert the exact output
path and contents. For a `work-os-v1` change, update a golden file only after
confirming the consumer wants the new output.

Run:

```sh
pnpm check
```

Before a release, run `pnpm release:check`. It proves that the `profiles/`
directory and its manifest/templates are included in the npm archive.
