# Jira Markdown Exporter

`@doruksahin/jira-markdown-exporter` is a standalone, read-only Jira Cloud exporter. It
selects issues by key or JQL, normalizes Jira data, and renders deterministic
Markdown through a caller-selected output profile.

The package has no knowledge of a consuming repository. A profile chooses the
generated directory and Markdown filenames; the exporter owns only that
directory beneath each issue key.

See [Repository architecture](docs/architecture/README.md) for the current
responsibility, interface, dependency, execution, storage, and failure
boundaries.

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

## Try an offline demo

From a source checkout with dependencies installed:

```sh
pnpm demo
```

This builds the package and exports a synthetic `DEMO-1` task through the public
library API with the built-in `generic-v1` profile. No Jira credentials or network
requests are used. The demo prints the generated `issue.md` and leaves all four
Markdown files and a validated JSON receipt in a fresh temporary directory for
inspection. The operating system chooses the temporary root; paths vary per run.

Example output, omitting build output and the Markdown preview:

```text
Offline demo: synthetic data; no Jira requests.
Run directory: /tmp/jira-exporter-demo-ABC123
Demo export success: 1/1 synced, 0 failed
- DEMO-1: synced · /tmp/jira-exporter-demo-ABC123/output/DEMO-1/jira-snapshot
Receipt: /tmp/jira-exporter-demo-ABC123/export-receipt.json
```

Use `pnpm demo --partial` to simulate a second issue failing. It retains the
successful issue's Markdown, records the failure in the receipt, and exits `2`:

```text
Demo export partial: 1/2 synced, 1 failed
- DEMO-1: synced · /tmp/jira-exporter-demo-ABC123/output/DEMO-1/jira-snapshot
- DEMO-404: failed · Synthetic failure: issue unavailable
```

The demo uses an injected reader with already-normalized data. It demonstrates
rendering and receipt behavior; it does not verify CLI parsing, Jira authentication,
pagination, ADF conversion, or attachment downloads. The example is source-checkout
tooling and is not included in the npm package.

## Try one real issue and capture its run output

With `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` already injected into your
environment, run this from the source checkout. Replace `PROJ-123` with an issue
you can read:

```sh
pnpm build
export_demo_root="$(mktemp -d)"
if node dist/cli/main.js \
  --issue-keys PROJ-123 \
  --output-dir "$export_demo_root/output" \
  --receipt "$export_demo_root/export-receipt.json" \
  > "$export_demo_root/stdout.log" \
  2> "$export_demo_root/stderr.log"
then
  export_demo_status=0
else
  export_demo_status=$?
fi
cat "$export_demo_root/stdout.log" "$export_demo_root/stderr.log"
printf 'Exit: %s\nRun directory: %s\n' "$export_demo_status" "$export_demo_root"
```

A successful CLI run prints the following final summary (paths vary):

```text
Jira export success: 1/1 synced, 0 failed
- PROJ-123: synced · /tmp/example/output/PROJ-123/jira-snapshot
```

The receipt records counts, provenance, paths, warnings, and failures. `stdout.log`
and `stderr.log` are captured by the shell in this example; the exporter does not
create log files or retain run history automatically. Output is a final result,
not live progress. Each attempt gets its own directory so previous receipts and
logs remain available. Keep real Jira output and receipts out of source control.

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

## Read board configuration as a library

Both public entrypoints export `createJiraReadApi`. The caller supplies a Jira
host and an authenticated JSON GET transport; endpoint construction and
normalization stay inside the package. No native network fallback or cache is
used by this API.

```ts
import { createJiraReadApi } from '@doruksahin/jira-markdown-exporter/embedded';

const jira = createJiraReadApi({ host: jiraHost }, { jiraGet });
const layout = await jira.readBoardLayout(boardId);
// layout: { id, name, columns: [{ name, statusIds }] }
```

`readBoardLayout` reads the board configuration and returns deeply frozen
`JiraBoardLayout` data, preserving Jira's column order, names, status ID order,
and columns with no statuses. The response must identify the requested board,
contain at least one named column, and use nonempty decimal string status IDs.
Malformed data or repeated status IDs (within or across columns) reject with
`JIRA_TRANSPORT_INVALID_RESPONSE`, operation `jira-board-layout`. Transport
failures retain bounded error codes and HTTP status, including permission
failures; response bodies are excluded.

All `JiraIssueRecord` reads retain `fields.status.id` as `statusId` alongside
the existing status name and category. A missing ID becomes an empty string.
Consumers own issue selection, joining IDs to columns, unmapped-issue behavior,
refresh policy, and presentation. Board configuration is independent of
Markdown snapshot export and does not change its files or receipt.

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

Library consumers can validate unknown JSON with the same schemas used by the
exporter instead of maintaining a second receipt or manifest decoder:

```ts
import {
  calculateOutputProfileDigest,
  parseExportReceipt,
  parseOutputProfileManifest,
} from '@doruksahin/jira-markdown-exporter/embedded';

const manifest = parseOutputProfileManifest(JSON.parse(profileJson));
const profile = { manifest, templates };
const expectedDigest = await calculateOutputProfileDigest(profile);
const receipt = parseExportReceipt(JSON.parse(receiptJson));

if (receipt.profileId !== manifest.id || receipt.profileDigest !== expectedDigest) {
  throw new Error('Export receipt does not match the selected output profile');
}
```

The parse functions perform structural validation against the published JSON
Schemas. Consumers remain responsible for cross-document policy such as the
expected exporter version, profile identity, digest, issue selection, and
allowed publication destination. The digest helper validates the complete
profile and hashes its normalized manifest and template content using the same
implementation as the exporter.

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
- Final human-readable results go to stdout when `--json` is not selected;
  JSON mode emits the machine result instead. The CLI does not emit live progress.

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

Use the [maintainer change map](docs/maintenance.md#change-map) to select the
owning source and contract test. For documentation or architecture changes,
run the [architecture and link checks](docs/maintenance.md#verification).

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
