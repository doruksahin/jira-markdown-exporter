# Jira Markdown Exporter

Standalone, read-only Jira issue snapshot exporter.

This repository is the reusable extraction of the Jira → Obsidian board-sync
flow. It provides a small CLI and a versioned contract for exporting selected
Jira issues into deterministic Markdown packets.

The implementation boundary, output layout, JSON receipt, tests, and consumer
migration sequence are defined in [the extraction plan](docs/extraction-plan.md).
The local-capsule and live-consumer boundary is recorded in
[PROJECT.md](PROJECT.md).

## Repository map: follow a concrete example

Read the following files in order before changing behavior. They are linked to
the same executable examples rather than describing an aspirational design.

| Concern | Source of truth | Concrete example to preserve |
| --- | --- | --- |
| Consumer and filesystem ownership | [AGENTS.md](AGENTS.md) and [PROJECT.md](PROJECT.md) | Refreshing `ATT-123` replaces only `ATT-123/40 Jira/`, while its human-owned `00 Task.md` survives. |
| Public commands and exit codes | [src/cli/main.ts](src/cli/main.ts), [CLI tests](test/jira/cli.test.ts), and [receipt schema](schemas/export-receipt.schema.json) | `--issue-keys ATT-1,ATT-2` and `--jql` are mutually exclusive; JSON mode ends with the versioned receipt. |
| Obsidian compatibility | [src/board-sync/cli.ts](src/board-sync/cli.ts) | Work OS calls this thin wrapper with `tsx`; it delegates to the same CLI rather than implementing a second exporter. |
| Fetching boundary | [snapshot DTO](src/domain/board-snapshot.ts), [reader port](src/ports/board-issue-reader.ts), and [Jira adapter](src/jira/jira-board-issue-reader.ts) | A provider returns `BoardIssueSnapshot`; the writer never imports Jira response types. |
| Partial results | [runner](src/runner/run-export.ts) and [runner regression](test/core/run-export.test.ts) | If `ATT-1` succeeds and `ATT-2` fails, keep `ATT-1` on disk and return a `partial` receipt. |
| Markdown layout and attachments | [work-os-v1 writer](src/output/work-os-v1-writer.ts) and [writer regression](test/core/work-os-v1-writer.test.ts) | Attachment IDs `20` and `21` named `design.png` become distinct files; ambiguous filename-only links stay untouched. |
| Output profiles and templates | [profile guide](docs/output-profiles.md), [built-in manifest](profiles/work-os-v1/profile.json), and [profile regression](test/core/output-profile.test.ts) | `work-os-v1` is the default; a local profile can render `ATT-123/Jira Snapshot/Summary.md` without a TypeScript fork. |
| Jira pagination, links, media, and origin safety | [Jira adapter regression](test/jira/jira-board-issue-reader.test.ts) | Follow Jira pagination, render a direct `blocks` link to `ATT-456`, fetch all comments, and reject an attachment URL such as `https://evil.example/file`. |
| Release contents | [package manifest](package.json) and [release check](#public-github-versus-npm-publishing) | `pnpm release:check` builds, tests, and previews precisely the files named in `package.json#files`. |

For source-level layer rules, read [src/AGENTS.md](src/AGENTS.md). For the
test style and the temporary-directory fixtures behind the examples above,
read [test/AGENTS.md](test/AGENTS.md). For a template-only change, begin in
[profiles/AGENTS.md](profiles/AGENTS.md).

## Before you install or run it

You need four things:

1. **Node.js 20 or newer.** Check with `node --version`.
2. **pnpm.** If it is not installed, enable the Node-provided package manager:
   `corepack enable pnpm`.
3. **Read access to your Jira site** and a Jira API token for the account whose
   issues you want to export.
4. **A local output directory** where generated issue packets belong. For
   example, exporting `ATT-5215` into `/tmp/packets` owns only
   `/tmp/packets/ATT-5215/40 Jira/`; it never changes
   `/tmp/packets/ATT-5215/00 Task.md`.

### Credentials stay local

The CLI reads these values from the process environment:

```text
JIRA_HOST=https://your-company.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-personal-jira-api-token
```

Do **not** add them to Git, issues, shell history shared with others, or this
repository's documentation. `.env` is ignored for local development, but the
preferred pattern is to inject the variables from your secret manager or shell
session. The live Obsidian Work OS integration passes its token from Obsidian
SecretStorage; it does not write it to the vault.

## Choose an execution path

### 1. Run from a source checkout — best for development

```bash
git clone https://github.com/doruksahin/jira-markdown-exporter.git
cd jira-markdown-exporter
corepack enable pnpm
pnpm install
pnpm check

JIRA_HOST=https://example.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=... \
pnpm export --issue-keys ATT-1,ATT-2 --output-dir /path/to/packets --json
```

`pnpm export` runs [`src/cli/main.ts`](src/cli/main.ts) through `tsx`. This is
the clearest route when changing or debugging the exporter.

### 2. Install the released CLI globally — best for normal use

After the first npm release, install the versioned package once:

```bash
npm install --global jira-markdown-exporter
jira-markdown-export --help
```

The `bin` field installs `jira-markdown-export` into your global PATH. Use it
with local Jira credentials:

```bash
JIRA_HOST=https://example.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=... \
jira-markdown-export --issue-keys ATT-5215 --output-dir /path/to/packets --json
```

Until that first release exists, use the source-checkout path above. Do not use
`pnpm dlx github:…` as the primary installation method: Git dependencies may
download development dependencies and are not a stable release channel.

### 3. Use it from Obsidian Work OS

Set **Jira Markdown exporter** to the local checkout path, for example:

```text
/Users/you/Code/jira-markdown-exporter
```

Work OS calls the compatibility entrypoint
[`src/board-sync/cli.ts`](src/board-sync/cli.ts) with `tsx`. That wrapper is
kept specifically so the existing **Jira → Obsidian sync** button continues to
work.

## Usage

```bash
JIRA_HOST=https://example.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=... \
jira-markdown-export --issue-keys ATT-1,ATT-2 --output-dir /path/to/packets --json
```

Use `--jql '<query>'` instead of `--issue-keys` to select issues with Jira
Query Language. Add `--download-attachments` to write binaries below the owned
`attachments/` directory. The CLI is read-only against Jira.

### Select an output profile

The default profile is the existing, Work OS-compatible `work-os-v1` layout.
Passing it explicitly produces the same packet:

```bash
jira-markdown-export --issue-keys ATT-123 --output-dir /path/to/packets --profile work-os-v1
```

To use a locally checked-out profile, pass `--template-dir` instead. Its
`profile.json` manifest and Liquid templates define only rendered Markdown;
the exporter still owns atomic writes, attachment downloading, and path safety.
See the concrete `ATT-123` profile in [the output-profile guide](docs/output-profiles.md).

In JSON mode, the final stdout line conforms to
[schemas/export-receipt.schema.json](schemas/export-receipt.schema.json).
Exit status `0` means every issue synced, `2` means a partial per-issue result,
and `1` means the export failed.

The compatibility entrypoint `src/board-sync/cli.ts` is retained for callers
that previously invoked the embedded Work OS exporter with `tsx`.

### Observable behavior

The CLI always reads Jira and never mutates it. For `ATT-123`, the writer is
allowed to refresh only the generated directory below; this is asserted with a
real sibling file in
[test/core/work-os-v1-writer.test.ts](test/core/work-os-v1-writer.test.ts):

```text
<output-dir>/ATT-123/
├── 00 Task.md       # human-owned; preserved
└── 40 Jira/         # exporter-owned; replaced as one snapshot
```

When multiple issue keys are requested, one failed issue does not erase a
completed packet. The `ATT-1` success / `ATT-2` failure fixture in
[test/core/run-export.test.ts](test/core/run-export.test.ts) produces a
`partial` receipt and leaves `ATT-1/40 Jira/00 Issue.md` readable. Treat both
examples as public compatibility behavior.

### Jira SDK boundary

The exporter uses the typed `jira.js` Cloud v3 client only for issue JSON,
comment pages, and enhanced JQL pages. Its intentionally narrow
[`JiraReadClient`](src/jira/jira-read-client.ts) exposes only those read
operations, so exporter code cannot reach Jira mutation APIs by accident.
Attachment binaries remain on native `fetch`: their manual redirect handling
and exact Jira/Atlassian Media origin allowlist are a separate security
boundary. The adapter regression fakes these two transports independently.

### Linked work items

`00 Issue.md` also includes direct Jira issue links. For example, a Jira
relationship from `ATT-123` that **blocks** `ATT-456` renders the configured
relationship label, linked key and URL, summary, status, issue type, and
assignee. The `ATT-456` data is returned as part of Jira's `issuelinks` issue
field; the exporter does not recursively export `ATT-456` or make separate
requests for its comments and attachments. This preserves one snapshot per
selected issue and respects Jira's own custom link types. The exact regression
is [the Jira adapter test](test/jira/jira-board-issue-reader.test.ts) and the
rendered `ATT-123` packet is [the work-os-v1 fixture](test/fixtures/work-os-v1/00%20Issue.md).

## Public GitHub versus npm publishing

This repository can be public on GitHub without being published to npm.
GitHub is the source of truth; npm is the installation channel for stable CLI
releases. The npm archive will contain only `dist/`, `profiles/`, `schemas/`, and the
declared documentation files from `package.json`'s `files` list. Source code,
tests, vault data, local `.env` files, and downloaded Jira attachments are not
published.

The package is intentionally blocked from publishing today by `"private":
true` and `"license": "UNLICENSED"`. Before the first release, choose a
license, verify that `jira-markdown-exporter` is still available on the public
npm registry, authenticate to npm, remove the publish block, run
`pnpm release:check`, tag `v0.1.0`, and publish from that clean commit. The
explicit `publishConfig.registry` prevents an accidental publish to GitHub
Packages when a developer's local npm registry is configured there.

The exact release gates live in [package.json](package.json): `prepack` builds
the ignored `dist/` artifact and `release:check` runs the typecheck, the
regression suite, and `npm pack --dry-run`. The npm archive intentionally does
not include the source checkout, tests, vault data, `.env`, or downloaded
attachments.

## Initial contract

The first release preserves the `work-os-v1` profile:

```text
<output-dir>/<JIRA-KEY>/40 Jira/
├── 00 Issue.md
├── 10 Comments.md
├── 20 Attachments.md
├── 90 Sync.md
└── attachments/
```

The exporter owns only `40 Jira/`; it must not change task-packet files outside
that directory or write back to Jira.
