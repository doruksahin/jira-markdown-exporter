# Jira Markdown Exporter

## Purpose

The source of truth for a read-only Jira issue → deterministic Markdown packet
CLI. It powers the Obsidian Work OS **Jira → Obsidian sync** flow without
writing changes back to Jira.

## Source and consumer

- **Repository:** `doruksahin/jira-markdown-exporter` on GitHub.
- **Local capsule:** `/Users/doruk/Desktop/PROJECTS/tools/jira-markdown-exporter`.
- **Live consumer:** the Work OS plugin in the AdCreative Obsidian vault. Its
  tracked runtime bundles the exact library entrypoint and canonical profile;
  teammate setup has no path to this capsule.
- **Output ownership:** only `<packet parent>/<ISSUE-KEY>/40 Jira/`; see the
  `ATT-123` preservation regression in `test/core/work-os-v1-writer.test.ts`.

## Distribution boundary

GitHub is the source repository. The intended end-user installation channel is
the versioned public npm package `jira-markdown-exporter`, which
exposes the `jira-markdown-export` command through `package.json#bin`.

The package is not published yet. `package.json` deliberately has
`"private": true` and `"license": "UNLICENSED"` until a license and npm
publishing authority are chosen. Follow `README.md`'s **Public GitHub versus
npm publishing** section before changing either guard.

## Local state and secrets

The CLI reads `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. Library callers
pass the same values through the typed in-memory request. Never commit or copy
credentials into this repository, GitHub, npm, the vault, or generated files.
