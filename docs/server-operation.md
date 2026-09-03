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

## Choose an installation model

### Consumer repository and CI: exact local dependency

This is the preferred model. The consuming repository owns the selected
version and its complete resolved dependency graph:

```sh
pnpm add --save-dev --save-exact @doruksahin/jira-markdown-exporter@X.Y.Z
git add package.json pnpm-lock.yaml
pnpm exec jira-markdown-export --help
```

Replace `X.Y.Z` with an npm-published version. Commit the manifest and lockfile,
install with `pnpm install --frozen-lockfile` in CI, and invoke the local binary
with `pnpm exec`. Do not use a floating tag or version range for unattended
exports.

For a one-off job where creating a lockfile is intentionally unnecessary:

```sh
npm exec --yes \
  --package=@doruksahin/jira-markdown-exporter@X.Y.Z \
  -- jira-markdown-export --help
```

This pins the direct version but resolves and downloads dependencies for that
invocation; it is not a replacement for a committed consumer lockfile.

### Standalone server: isolated prefix

A server without a consumer checkout can install one exact version into a
dedicated, replaceable directory instead of changing the machine-wide Node
installation:

```sh
exporter_version=X.Y.Z
install_root="/opt/jira-markdown-export/$exporter_version"

npm install \
  --ignore-scripts \
  --no-audit \
  --no-fund \
  --package-lock=false \
  --prefix "$install_root" \
  --@doruksahin:registry=https://registry.npmjs.org \
  "@doruksahin/jira-markdown-exporter@$exporter_version"

"$install_root/node_modules/.bin/jira-markdown-export" --help
```

Provision `/opt/jira-markdown-export` with the service account's normal file
permissions. Keep each version in its own prefix, point the scheduler at the
explicit binary path, and roll back by restoring the previous explicit path.
The exporter itself remains a one-shot process; the service manager owns its
schedule, timeout, credentials, and work directory.

A global install is acceptable only as a human convenience on a workstation:

```sh
npm install --global @doruksahin/jira-markdown-exporter@X.Y.Z
jira-markdown-export --help
```

Do not make CI or a production scheduler depend on whichever global version
happens to be on `PATH`.

If npm unexpectedly looks for the scoped package in a company registry, first
inspect the effective setting:

```sh
npm config get @doruksahin:registry
```

Then override only this install when public npm is the intended source:

```sh
npm install \
  --@doruksahin:registry=https://registry.npmjs.org \
  --save-dev \
  --save-exact \
  @doruksahin/jira-markdown-exporter@X.Y.Z
```

Do not silently change an organization-wide registry configuration; keep the
explicit override in the consumer environment when that routing is required.

### GitHub Release tarball

Before the first npm publication, or when validating the release payload,
download the exact GitHub Release archive and checksum:

```sh
release_version=X.Y.Z
artifact_dir="$(mktemp -d)"

gh release download "v$release_version" \
  --repo doruksahin/jira-markdown-exporter \
  --dir "$artifact_dir"

cd "$artifact_dir"
sha256sum --check SHA256SUMS

install_root="$(mktemp -d)"
npm install \
  --ignore-scripts \
  --no-audit \
  --no-fund \
  --package-lock=false \
  --prefix "$install_root" \
  "$artifact_dir/doruksahin-jira-markdown-exporter-$release_version.tgz"
"$install_root/node_modules/.bin/jira-markdown-export" --help
```

On macOS, use `shasum --algorithm 256 --check SHA256SUMS`. The checksum fixes
the package payload, but installation still resolves its declared runtime
dependencies from npm. The `.tgz` is therefore not a dependency-vendored
standalone executable.

## GitHub Actions consumer

The consumer repository owns its JQL, optional profile, exporter dependency,
and lockfile. After adding the exact dependency as shown above, a minimal job is:

```yaml
name: Export Jira

on:
  workflow_dispatch:
  schedule:
    - cron: "0 5 * * 1-5"

permissions:
  contents: read

jobs:
  export:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out consumer inputs
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 20

      - name: Install the locked toolchain
        run: |
          corepack enable
          pnpm install --frozen-lockfile

      - name: Export Jira into runner-temporary storage
        env:
          JIRA_HOST: ${{ secrets.JIRA_HOST }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
        run: |
          pnpm exec jira-markdown-export \
            --jql-file ./jira/scope.jql \
            --template-dir ./jira/profile \
            --output-dir "$RUNNER_TEMP/jira-artifact" \
            --receipt "$RUNNER_TEMP/export-receipt.json"

      - name: Upload successful export
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: jira-export
          path: |
            ${{ runner.temp }}/jira-artifact
            ${{ runner.temp }}/export-receipt.json
          if-no-files-found: error
```

Create `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` as GitHub Actions
secrets. Keep `jira/scope.jql` and `jira/profile/` in the consumer repository;
they express consumer policy and presentation, not exporter configuration. If
the built-in `generic-v1` profile is sufficient, remove `--template-dir`.

The example uploads only after exit `0`. A consumer that accepts exit `2` must
add an explicit partial-result step that validates the receipt and selects only
`synced` issue entries before publication. Runner-temporary output is discarded
after the job unless a later step deliberately uploads or publishes it. A
receipt can contain Jira-derived filenames, warnings, and error text; apply the
repository's artifact access and retention policy, or omit or sanitize the
receipt before broader sharing.

## Build and inspect a release artifact

Maintainers can reproduce the checksummed package from a clean, reviewed
checkout:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm release:check
artifact_dir="$(mktemp -d)/release"
pnpm release:artifact "$artifact_dir"
pnpm release:smoke-install "$artifact_dir"/doruksahin-jira-markdown-exporter-*.tgz
```

`release:artifact` accepts only a new or empty real directory, builds the
package, and creates the versioned `.tgz` plus `SHA256SUMS`. The smoke installs
that archive with lifecycle scripts disabled and invokes its
`jira-markdown-export --help`. The release workflow sends this one verified
archive to both GitHub Releases and npm; it must not rebuild separately for
either destination.

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

Choose the explicit installed binary. In a consumer checkout:

```sh
exporter_bin="$PWD/node_modules/.bin/jira-markdown-export"
test -x "$exporter_bin"
```

For the isolated server installation, set `exporter_bin` to
`/opt/jira-markdown-export/X.Y.Z/node_modules/.bin/jira-markdown-export`
instead. The scheduled command should not depend on a mutable global `PATH`.

```sh
if JIRA_HOST="$JIRA_HOST" \
  JIRA_EMAIL="$JIRA_EMAIL" \
  JIRA_API_TOKEN="$JIRA_API_TOKEN" \
  "$exporter_bin" \
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

Node consumers can use the package's `parseExportReceipt` rather than copying
the receipt schema into runner code. `parseOutputProfileManifest` and
`calculateOutputProfileDigest` provide the corresponding profile checks.
These functions are available from both the package root and its `/embedded`
entrypoint; publication policy and cross-document comparisons remain the
runner's responsibility.

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
"$exporter_bin" \
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
cmp "$first"/doruksahin-jira-markdown-exporter-*.tgz \
    "$second"/doruksahin-jira-markdown-exporter-*.tgz
diff -u "$first/SHA256SUMS" "$second/SHA256SUMS"
```

The focused regression is `test/release-artifact.test.ts`. It proves the
package payload and checksum are reproducible without resolving a second set
of dependencies. `pnpm release:check` also typechecks, builds, runs the
complete suite, and previews the npm package contents without publishing. Run
the separately named `release:smoke-install` command when network access to the
configured npm registry is available.
