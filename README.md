# Jira Markdown Exporter

Standalone, read-only Jira issue snapshot exporter.

This repository is the reusable extraction of the Jira → Obsidian board-sync
flow. It provides a small CLI and a versioned contract for exporting selected
Jira issues into deterministic Markdown packets.

The implementation boundary, output layout, JSON receipt, tests, and consumer
migration sequence are defined in [the extraction plan](docs/extraction-plan.md).

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

## Start in one of three ways

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
npm install --global @doruksahin/jira-markdown-exporter
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

Set **Jira Markdown dışa aktarıcı** to the local checkout path, for example:

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

In JSON mode, the final stdout line conforms to
[schemas/export-receipt.schema.json](schemas/export-receipt.schema.json).
Exit status `0` means every issue synced, `2` means a partial per-issue result,
and `1` means the export failed.

The compatibility entrypoint `src/board-sync/cli.ts` is retained for callers
that previously invoked the embedded Work OS exporter with `tsx`.

## Public GitHub versus npm publishing

This repository can be public on GitHub without being published to npm.
GitHub is the source of truth; npm is the installation channel for stable CLI
releases. The npm archive will contain only `dist/`, `schemas/`, and the
declared documentation files from `package.json`'s `files` list. Source code,
tests, vault data, local `.env` files, and downloaded Jira attachments are not
published.

The package is intentionally blocked from publishing today by `"private":
true` and `"license": "UNLICENSED"`. Before the first release, choose a
license, verify that `@doruksahin/jira-markdown-exporter` is available on the
public npm registry, authenticate to npm, remove the publish block, run
`pnpm release:check`, tag `v0.1.0`, and publish from that clean commit. The
explicit `publishConfig.registry` prevents an accidental publish to GitHub
Packages when a developer's local npm registry is configured there.

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
