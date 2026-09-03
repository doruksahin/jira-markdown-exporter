# Output profiles

An output profile converts a normalized issue snapshot into deterministic
Markdown. It controls presentation only. Jira reads, attachment downloads,
filename safety, inline-media localization, atomic replacement, and receipts
remain exporter behavior.

## Select a profile

The built-in `generic-v1` profile is the default:

```sh
jira-markdown-export \
  --issue-keys PROJ-123 \
  --output-dir /tmp/jira-export \
  --profile generic-v1
```

Select a checked-out external profile with an absolute path:

```sh
jira-markdown-export \
  --issue-keys PROJ-123 \
  --output-dir /tmp/jira-export \
  --template-dir /absolute/path/to/profile
```

`--profile` and `--template-dir` are mutually exclusive.

## Minimal external profile

Create two files:

```text
compact-profile/
├── profile.json
└── Summary.md.liquid
```

`profile.json`:

```json
{
  "$schema": "/absolute/path/to/jira-markdown-exporter/schemas/output-profile.schema.json",
  "id": "compact-v1",
  "schemaVersion": 1,
  "ownedDirectory": "jira-snapshot",
  "attachmentsDirectory": "files",
  "files": [
    { "template": "Summary.md.liquid", "output": "Summary.md" }
  ]
}
```

`Summary.md.liquid`:

```liquid
# {{ issue.key }} · {{ issue.summary }}

Attachments: {{ attachments.size }}
```

For `PROJ-123`, this writes only:

```text
<output-dir>/PROJ-123/jira-snapshot/Summary.md
```

The exporter replaces the complete `jira-snapshot` directory on success. A
consumer must therefore put only generated files inside `ownedDirectory`.

## Manifest contract

The schema is [`schemas/output-profile.schema.json`](../schemas/output-profile.schema.json).

- `id` is the profile's stable identifier.
- `schemaVersion` is currently `1`.
- `ownedDirectory` is one safe directory segment beneath each issue key.
- `attachmentsDirectory` is one safe directory segment beneath the owned
  directory.
- `files` is an ordered, non-empty list of Liquid template paths and Markdown
  output paths.

Template paths must end in `.liquid`; outputs must end in `.md`. Paths cannot
be absolute, contain empty or parent segments, collide with another output, or
equal/sit beneath `attachmentsDirectory`. The selected profile directory and
its descendants cannot be symlinks. Unknown manifest and file properties are
rejected.

Library callers can validate an unknown manifest with
`parseOutputProfileManifest(value)` and calculate its exact exporter digest
with `calculateOutputProfileDigest({ manifest, templates })`. Both functions
are exported from the package root and `/embedded` entrypoint. This keeps the
published JSON Schema and exporter digest implementation authoritative for
downstream receipt verification.

## Template model

Liquid templates receive a normalized, credential-free model:

| Object | Fields |
| --- | --- |
| `issue` | `key`, `url`, `summary`, `description`, `updated`, `metadata` |
| `comments` | sorted `id`, `author`, `created`, `date`, `updatedNote`, `body` entries |
| `linkedIssues` | sorted `relationship`, `key`, `url`, `summary`, `status`, `issueType`, `assignee` entries |
| `attachments` | sorted `id`, `filename`, `mimeType`, `size`, `author`, `created`, `localPath` entries |
| `sync` | `attachmentCount`, `downloadedAttachments`, `attachmentDownloadsEnabled`, `warnings` |

`attachment.localPath` is empty unless its binary was downloaded. The Jira
attachment content URL is intentionally absent. Existing inline media links
have already been safely localized before `issue.description` reaches a
template.

Available filters are:

- `tableCell`: escape table separators and line breaks
- `formatBytes`: format a numeric byte size
- `yaml`: serialize a safe scalar for frontmatter

Liquid includes may reference partials beneath the selected profile directory.
Remote templates and arbitrary JavaScript helpers are not supported.

## Attachments

When `--download-attachments` is enabled, binaries are stored under
`attachmentsDirectory` with an attachment-ID prefix. Templates should use
`attachment.localPath` exactly and should use
`sync.attachmentDownloadsEnabled` to distinguish disabled downloads from a
failed requested download.

```liquid
{% if attachment.localPath != blank %}
[open](<{{ attachment.localPath }}>)
{% elsif sync.attachmentDownloadsEnabled %}
download failed
{% else %}
not downloaded
{% endif %}
```

## Verify a profile change

Add or update a test that creates a temporary profile, runs the exporter with a
fake reader, and asserts the exact path and bytes. Also verify that a sibling
file outside `ownedDirectory` survives a repeated export.

```sh
pnpm check
```

Before packaging:

```sh
pnpm release:check
```
