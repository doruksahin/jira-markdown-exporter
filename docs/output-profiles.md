# Output profiles

An output profile converts one provider-neutral `BoardIssueSnapshot` into a
deterministic Markdown packet. It changes presentation only; Jira reads,
attachment downloads, attachment filename safety, inline-media localization,
atomic replacement, and the JSON receipt remain exporter behavior.

The built-in default is [`work-os-v1`](../profiles/work-os-v1/profile.json).
For `ATT-123`, it owns only:

```text
<output-dir>/ATT-123/40 Jira/
├── 00 Issue.md
├── 10 Comments.md
├── 20 Attachments.md
├── 90 Sync.md
└── attachments/
```

`ATT-123/00 Task.md` remains human-owned. This is enforced by
[`test/core/work-os-v1-writer.test.ts`](../test/core/work-os-v1-writer.test.ts).

## Use a profile

The default and the explicit built-in selection are equivalent:

```sh
jira-markdown-export --issue-keys ATT-123 --output-dir /path/to/packets
jira-markdown-export --issue-keys ATT-123 --output-dir /path/to/packets --profile work-os-v1
```

Use a local profile directory only when a different packet layout is needed:

```sh
jira-markdown-export --issue-keys ATT-123 \
  --output-dir /path/to/packets \
  --template-dir /path/to/compact-profile
```

`--profile` and `--template-dir` are deliberately mutually exclusive. Work OS
does not pass either flag, so it stays on the byte-compatible `work-os-v1`
profile.

## Minimal local profile

Create these two files:

```text
compact-profile/
├── profile.json
└── Summary.md.liquid
```

```json
{
  "$schema": "https://github.com/doruksahin/jira-markdown-exporter/blob/main/schemas/output-profile.schema.json",
  "id": "compact-v1",
  "schemaVersion": 1,
  "ownedDirectory": "Jira Snapshot",
  "attachmentsDirectory": "files",
  "files": [
    { "template": "Summary.md.liquid", "output": "Summary.md" }
  ]
}
```

```liquid
# {{ issue.key }} · {{ issue.summary }}

Attachments: {{ attachments.size }}
```

For `ATT-123`, this writes only
`<output-dir>/ATT-123/Jira Snapshot/Summary.md`. The local-profile regression
in [`test/core/output-profile.test.ts`](../test/core/output-profile.test.ts)
uses this exact manifest and output.

## Template model

Liquid templates receive a normalized, credential-free model:

| Object | Available fields | Example |
| --- | --- | --- |
| `issue` | `key`, `url`, `summary`, `description`, `updated`, `metadata` | `{{ issue.key }}` renders `ATT-123`. |
| `comments` | sorted `id`, `author`, `created`, `date`, `updatedNote`, `body` entries | `{% for comment in comments %}`. |
| `linkedIssues` | sorted `relationship`, `key`, `url`, `summary`, `status`, `issueType`, `assignee` entries | `{% for link in linkedIssues %}`. |
| `attachments` | sorted `id`, `filename`, `mimeType`, `size`, `author`, `created`, `localPath` entries | `localPath` is empty unless binary downloading succeeds. |
| `sync` | `attachmentCount`, `downloadedAttachments`, `warnings` | `{% for warning in sync.warnings %}`. |

Attachment `contentUrl` is intentionally absent. A template cannot request a
new download or observe Jira credentials. Existing media links have already
been rewritten safely before `issue.description` reaches the template.

`linkedIssues` contains direct Jira issue-to-issue links only. `relationship`
is Jira's configured label from the exported issue's perspective, so it may be
`blocks`, `is blocked by`, `relates to`, or a site-specific link type. The
exporter does not recursively fetch descriptions, comments, or attachments for
those linked issues. Jira remote links are also intentionally outside this
snapshot field.

The built-in profile demonstrates a shared notice partial, loops,
conditionals, and the exporter filters `tableCell`, `formatBytes`, and `yaml`.

## Safety contract

Before rendering, the loader rejects empty manifests, unknown schema versions,
absolute or parent-directory paths, duplicate output files, non-Liquid
templates, and non-Markdown outputs. It therefore cannot write a manifest entry
such as `../00 Task.md`; the exact rejection is tested in
[`test/core/output-profile.test.ts`](../test/core/output-profile.test.ts).

The profile’s `ownedDirectory` and `attachmentsDirectory` are single safe path
segments. Output paths may be nested below the owned directory, but never
escape it. Each issue is still staged and swapped atomically at the owned
directory boundary.

Profiles are local files, not remote code. Do not add URL-based template
loading, arbitrary JavaScript helpers, or a broad host/plugin system. If a
reusable profile becomes useful, version it in a normal Git repository and pass
its checked-out directory through `--template-dir`.

## Maintaining a profile

1. Start with [`profiles/work-os-v1`](../profiles/work-os-v1).
2. Add or alter a template and its `profile.json` mapping together.
3. Add a regression that verifies output and ownership, not a Liquid internals.
4. Run `pnpm check`; before publication, run `pnpm release:check`.

The implementation plan and rationale are in
[`docs/template-profiles-plan.md`](template-profiles-plan.md).
