# Stateless server operation

`jira-markdown-export` is a one-shot process:

```text
environment credentials + selector + profile + empty output path
                              |
                              v
                    jira-markdown-export
                              |
                              v
                 generated tree + JSON receipt
```

It does not keep a database, cache, selected board, selected person, scheduler,
or previous-run state. The runner owns scheduling, retries, retention, and any
publication of the generated tree.

## Build a checksummed package artifact

From a clean, reviewed commit:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm release:check
artifact_dir="$(mktemp -d)/release"
pnpm release:artifact "$artifact_dir"
ls -l "$artifact_dir"
```

The command creates exactly these files in a new or empty directory:

```text
release/
├── jira-markdown-exporter-<version>.tgz
└── SHA256SUMS
```

It runs `pnpm build` and then creates the npm-compatible archive with `npm
pack`. It never publishes to a package registry, and it refuses a file,
symlink, repository root, filesystem root, or non-empty directory as its
destination. It assembles the archive in a temporary staging directory and
only then copies the archive and checksum into the requested destination.

Verify the artifact before installation. On Linux:

```sh
cd "$artifact_dir"
sha256sum --check SHA256SUMS
```

On macOS:

```sh
cd "$artifact_dir"
shasum --algorithm 256 --check SHA256SUMS
```

Store the `.tgz`, `SHA256SUMS`, source commit SHA, and required Node major
version together in the release system. The checksum identifies the exact
package payload, but the archive does not vendor or lock its runtime
dependencies. `npm install` resolves those declared dependency ranges from the
configured registry.

The reproducible build path is the pinned source commit with the tracked
`pnpm-lock.yaml`:

```sh
git checkout --detach <reviewed-40-character-commit-sha>
corepack enable
pnpm install --frozen-lockfile
pnpm check
node dist/cli/main.js --help
```

Use the package artifact when a registry-resolved installation is acceptable
and verify its checksum first. Do not describe the `.tgz` alone as a fully
locked or standalone executable.

For an isolated installation on a runner:

```sh
install_root="$(mktemp -d)"
npm install --ignore-scripts --prefix "$install_root" \
  "$artifact_dir/jira-markdown-exporter-<version>.tgz"
export PATH="$install_root/node_modules/.bin:$PATH"
jira-markdown-export --help
```

The installed-package smoke intentionally has the same network dependency as
that installation because npm must resolve runtime dependencies:

```sh
pnpm release:smoke-install \
  "$artifact_dir/jira-markdown-exporter-<version>.tgz"
```

It installs into a temporary prefix with lifecycle scripts disabled, invokes
the installed `jira-markdown-export --help`, and removes the temporary prefix.
Keep this explicit release smoke separate from `pnpm check`, which remains
self-contained after the repository dependencies have been installed.

## Prepare inputs

Inject Jira credentials from the runner's secret store into the process
environment:

```text
JIRA_HOST=https://your-company.atlassian.net
JIRA_EMAIL=service-account@example.com
JIRA_API_TOKEN=<secret value>
```

Do not put credentials in JQL, arguments, a profile, an artifact, or a checked-in
environment file.

Keep selection policy outside the exporter. A board, person, sprint, or project
can be expressed as JQL owned by the calling repository:

```jql
project = PROJ
AND assignee = currentUser()
AND statusCategory != Done
ORDER BY updated DESC
```

Mount or copy that query and the optional output profile as read-only inputs.
Create a unique work directory for each attempt so concurrent or retried jobs
cannot share output:

```sh
run_root="$(mktemp -d)"
mkdir "$run_root/output"
cp /read-only-inputs/scope.jql "$run_root/scope.jql"
```

## Run one export

```sh
if JIRA_HOST="$JIRA_HOST" \
  JIRA_EMAIL="$JIRA_EMAIL" \
  JIRA_API_TOKEN="$JIRA_API_TOKEN" \
  jira-markdown-export \
    --jql-file "$run_root/scope.jql" \
    --template-dir /read-only-inputs/profile \
    --output-dir "$run_root/output" \
    --receipt "$run_root/export-receipt.json"
then
  export_status=0
else
  export_status=$?
fi
```

`--jql-file` reads UTF-8 JQL without shell interpolation. It is mutually
exclusive with `--jql` and `--issue-keys`. `--receipt` writes the JSON receipt
to the named path using an atomic same-directory replacement.

A completed export result identifies the contract and rendering inputs with
`schemaVersion`, `exporterVersion`, `profileId`, and `profileDigest` and
conforms to `schemas/export-receipt.schema.json`. Consumers should validate
those values before publishing output. If CLI validation fails before an
output profile is available, `--receipt` instead writes a preflight error
envelope; it cannot truthfully include `profileId` or `profileDigest` and is
not a completed export receipt. Both forms can contain issue-derived
filenames, warnings, or errors, so keep them private or sanitize them before
wider distribution.

Exit status is the final process signal:

| Exit | Result | Runner action |
| --- | --- | --- |
| `0` | All selected issues exported. | Validate the receipt, then consume the output. |
| `2` | Some issues exported and some failed. | Apply explicit partial-result policy. |
| `1` | Invalid input/configuration, or no issue exported. | Keep diagnostics; do not publish output. |

The runner should bound the overall job duration and decide whether exit `1`
or `2` is retryable. The exporter does not schedule its own next execution.

## Stdout compatibility

`--receipt` is the clearest process interface because stdout remains available
for runner diagnostics. Existing callers can continue to request the same JSON
receipt on stdout:

```sh
jira-markdown-export \
  --jql-file "$run_root/scope.jql" \
  --output-dir "$run_root/output" \
  --json > "$run_root/export-receipt.json"
```

Do not pass `--json` together with `--receipt`; choose one receipt destination.
Without either option, stdout is human-readable status rather than a machine
contract.

## Verify an unchanged rebuild

Artifact reproducibility is an executable release check:

```sh
first="$(mktemp -d)/first"
second="$(mktemp -d)/second"
pnpm release:artifact "$first"
pnpm release:artifact "$second"
cmp "$first"/jira-markdown-exporter-*.tgz \
    "$second"/jira-markdown-exporter-*.tgz
diff -u "$first/SHA256SUMS" "$second/SHA256SUMS"
```

The focused regression is `test/release-artifact.test.ts`. It proves the
package payload and checksum are reproducible without resolving a second set
of dependencies. `pnpm release:check` also typechecks, builds, runs the
complete suite, and previews the npm package contents without publishing. Run
the separately named `release:smoke-install` command when network access to the
configured npm registry is available.
