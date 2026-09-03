# Jira Markdown Exporter

`@doruksahin/jira-markdown-exporter` is a standalone, read-only Jira Cloud exporter. It
selects issues by key or JQL, normalizes Jira data, and renders deterministic
Markdown through a caller-selected output profile.

The package has no knowledge of a consuming repository. A profile chooses the
generated directory and Markdown filenames; the exporter owns only that
directory beneath each issue key.

## Requirements

- Node.js 20 or newer
- pnpm 10 when running from source
- A Jira Cloud account with read access and an API token
- A local output-profile directory, or the built-in `generic-v1` profile

The CLI reads credentials only from the process environment:

```text
JIRA_HOST=https://your-company.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token
```

Do not put these values in profile files, command arguments, generated output,
or source control.

## Discover the command contract

```sh
jira-markdown-export --help
```

The generated plain-text help is the self-contained interface reference for
both unattended operators and language models. It includes every option, the
three required environment variables, selector exclusivity, receipt and output
semantics, exit statuses, and copyable examples.

## Install

For a repository or GitHub Actions job, install an exact version as a local
development dependency and commit both the manifest and lockfile:

```sh
pnpm add --save-dev --save-exact @doruksahin/jira-markdown-exporter@X.Y.Z
pnpm exec jira-markdown-export --help
```

Replace `X.Y.Z` with a version that exists on npm. Do not use `latest`, `^`, or
`~` in unattended jobs. The committed lockfile fixes the resolved dependency
graph, while the exact direct dependency makes exporter upgrades explicit in
code review.

For a one-off, non-locked invocation, npm can download and run one exact
version without a global installation:

```sh
npm exec --yes \
  --package=@doruksahin/jira-markdown-exporter@X.Y.Z \
  -- jira-markdown-export --help
```

The public package is available from npm. Confirm the requested version exists
before using it in unattended work; the checksummed GitHub Release `.tgz`
remains the independent artifact-verification and fallback installation path.
See [Stateless server operation](docs/server-operation.md) for both procedures.

## Run from source

A pinned source checkout is useful for development and for independently
rebuilding a release:

```sh
git clone https://github.com/doruksahin/jira-markdown-exporter.git
cd jira-markdown-exporter
exporter_ref="FULL_40_CHARACTER_COMMIT_SHA"
printf '%s\n' "$exporter_ref" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "Replace exporter_ref with a full lowercase commit SHA" >&2
  exit 1
}
git fetch origin
git checkout --detach "$exporter_ref"
test "$(git rev-parse HEAD)" = "$exporter_ref"
corepack enable
pnpm install --frozen-lockfile
pnpm check
node dist/cli/main.js --help
```

Export one or more explicit issues with the built-in generic profile:

```sh
JIRA_HOST=https://your-company.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=your-api-token \
node dist/cli/main.js \
  --issue-keys PROJ-123,PROJ-124 \
  --output-dir /tmp/jira-export \
  --profile generic-v1 \
  --json
```

Select with JQL instead:

```sh
JIRA_HOST=https://your-company.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=your-api-token \
node dist/cli/main.js \
  --jql 'project = PROJ AND statusCategory != Done ORDER BY key' \
  --output-dir /tmp/jira-export \
  --profile generic-v1 \
  --json
```

Use `--jql-file /absolute/path/to/scope.jql` when the query is already stored
as a runner input. Exactly one of `--issue-keys`, `--jql`, and `--jql-file` is
required. `--output-dir` is also required. `generic-v1` is the default, so its
`--profile` flag may be omitted.

## Run as a stateless server job

The exporter is a one-shot process. It receives credentials from the
environment and selection/profile paths from arguments, writes into a unique
work directory, emits a receipt, and exits. It keeps no database, cache,
scheduler, selected board, selected person, or previous-run state.

```sh
run_root="$(mktemp -d)"
mkdir "$run_root/output"

JIRA_HOST="$JIRA_HOST" \
JIRA_EMAIL="$JIRA_EMAIL" \
JIRA_API_TOKEN="$JIRA_API_TOKEN" \
node dist/cli/main.js \
  --jql-file /read-only-inputs/scope.jql \
  --template-dir /read-only-inputs/profile \
  --output-dir "$run_root/output" \
  --receipt "$run_root/export-receipt.json"
```

The runner remains responsible for secret injection, scheduling, retries,
retention, and publishing the output. See [Stateless server operation](docs/server-operation.md)
for the complete artifact-build, checksum, installation, execution, and
verification playbook.

## Use an external output profile

Use `--template-dir` when a consuming repository owns its Markdown layout:

```sh
JIRA_HOST=https://your-company.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=your-api-token \
node dist/cli/main.js \
  --issue-keys PROJ-123 \
  --output-dir /tmp/jira-export \
  --template-dir /absolute/path/to/profile \
  --json
```

`--profile` and `--template-dir` are mutually exclusive. A local profile is
data, not executable code: `profile.json` maps Liquid templates to Markdown
outputs. See [Output profiles](docs/output-profiles.md) for the complete
manifest and template contract.

For the built-in profile, `PROJ-123` produces:

```text
/tmp/jira-export/PROJ-123/jira-snapshot/
├── issue.md
├── comments.md
├── attachments.md
└── metadata.md
```

The writer stages and atomically replaces only
`<output-dir>/<issue-key>/<ownedDirectory>`. Files beside that directory are
not owned or changed by the exporter. A successful repeat export is
byte-identical, and stale files inside the owned directory are removed.

## Attachments

Without `--download-attachments`, templates receive attachment metadata but no
binary files are written. Add the flag to download binaries into the profile's
`attachmentsDirectory`:

```sh
node dist/cli/main.js \
  --issue-keys PROJ-123 \
  --output-dir /tmp/jira-export \
  --template-dir /absolute/path/to/profile \
  --download-attachments \
  --json
```

Attachment filenames are prefixed with the Jira attachment ID to prevent
collisions. Downloads are restricted to the configured Jira origin and the
official Atlassian media origin. A failed attachment download becomes a
bounded warning; it does not expose the remote content URL or credentials.

## Receipt and exit status

With `--receipt /path/to/export-receipt.json`, the exporter atomically writes
the machine result. A completed export result conforms to
[`schemas/export-receipt.schema.json`](schemas/export-receipt.schema.json) and
includes `exporterVersion`, `profileId`, and `profileDigest` so a downstream
process can verify which executable and rendering profile produced the staged
files. If validation fails before the profile is available, the file contains
a preflight error envelope without profile provenance; it is not a completed
export receipt.

Existing callers can continue to send JSON to stdout with `--json`:

```sh
node dist/cli/main.js \
  --issue-keys PROJ-123 \
  --output-dir /tmp/jira-export \
  --profile generic-v1 \
  --json > /tmp/jira-export-receipt.json
```

`--receipt` and `--json` are mutually exclusive. Without either option, stdout
contains human-readable status.

A completed receipt records the schema version, exporter and profile
provenance, overall status, counts, output root, and one result per issue. A
synced issue includes its generated directory, counts, and attachment warnings.
A failed issue includes an error string and may also include a structured
`failure` object. Only the structured failure facts are allowlisted and
bounded; filenames, warnings, and unclassified error strings can originate
from Jira or the local runtime.

Treat the complete receipt as potentially sensitive operational output. Keep it
in local or runner-temporary storage, do not publish it by default, and sanitize
it before sharing. Credentials and attachment content URLs are not intentional
receipt fields, but callers must not rely on arbitrary error text being safe.

Exit statuses are:

| Status | Meaning |
| --- | --- |
| `0` | Every selected issue was exported. |
| `2` | Some issues were exported and some failed. Successful output remains available. |
| `1` | Argument/configuration failure, or no selected issue was exported. |

Shells treat `2` as failure. A caller that intentionally accepts partial
results must capture the status, validate the receipt, and publish only entries
whose status is `synced`.

## Safety and behavior guarantees

- Jira access is GET-only; this package never creates, edits, comments on, or
  transitions an issue.
- Issue keys, profile paths, output paths, and profile symlinks are validated.
- Templates cannot access Jira credentials or attachment content URLs.
- Issues are written independently, so one failed issue does not roll back a
  completed issue.
- Generated Markdown has stable whitespace and one final newline.
- Progress and human-readable output go to stdout only when `--json` is not
  selected; JSON mode is suitable for process composition.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `JIRA_HOST/JIRA_EMAIL/JIRA_API_TOKEN is required` | Export the named variable in the same process that launches the CLI. |
| `Use exactly one of --issue-keys, --jql, or --jql-file` | Keep one selector and remove the others, or add the missing selector. |
| `Unknown built-in output profile` | Use `generic-v1`, or pass an absolute `--template-dir`. |
| `Could not load output profile` | Confirm `profile.json` exists and every referenced `.liquid` file is present. |
| `unsafe ... path` | Remove absolute paths, empty segments, backslashes, or `..` from the profile. |
| Exit `2` | Inspect the receipt's failed issue entries; successful issue directories are still valid. |
| Attachment warning | Confirm the account can read the attachment and that the URL belongs to Jira or Atlassian Media. |

Re-run the same command after fixing a transient failure. The owned snapshot
directory is replaced atomically and deterministic output should produce no
content change.

## Development and release proof

Use the closest contract test when changing behavior:

- CLI and selectors: `test/jira/cli.test.ts`
- reproducible package artifact: `test/release-artifact.test.ts`
- Jira pagination and attachment safety: `test/jira/jira-board-issue-reader.test.ts`
- partial results and receipts: `test/core/run-export.test.ts`
- generic output and idempotency: `test/core/generic-profile-writer.test.ts`
- profile validation: `test/core/output-profile.test.ts`
- consumer-neutral package boundary: `test/core/package-boundary.test.ts`

Run the complete check:

```sh
pnpm check
```

Before publishing a package candidate, also run:

```sh
pnpm release:check
```

`release:check` typechecks, builds, runs all tests, and previews the exact npm
archive. To create the versioned `.tgz` and `SHA256SUMS` without publishing:

```sh
artifact_dir="$(mktemp -d)/release"
pnpm release:artifact "$artifact_dir"
```

Repeated unchanged builds are required to produce the same archive SHA-256.
The checksum identifies the package payload; it does not lock the transitive
runtime dependencies that `npm install` resolves. A pinned source commit plus
`pnpm-lock.yaml` and `pnpm install --frozen-lockfile` remains the reproducible
build path. See [Stateless server operation](docs/server-operation.md) for the
separate, network-dependent installed-package smoke.

## GitHub releases

Release Please owns version bumps, `CHANGELOG.md`, `vX.Y.Z` tags, and GitHub
Releases. The release workflow builds and verifies one `.tgz`; that exact file
is the payload for both the GitHub Release and npm publication. Changes reach a
release through a normal Conventional Commit PR followed by the generated
`chore(main): release X.Y.Z` PR; neither version files nor tags are created
manually.

See [the release playbook](https://github.com/doruksahin/jira-markdown-exporter/blob/main/docs/releasing.md)
for the exact merge, verification, artifact-download, checksum, installation,
and recovery commands.
