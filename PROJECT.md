# Jira Markdown Exporter

## Product boundary

This repository owns one product: a standalone, read-only Jira Cloud exporter.
It accepts an issue-key or JQL selection, Jira credentials, an output root, and
an output profile. It produces deterministic Markdown plus a versioned JSON
receipt.

The exporter owns:

- GET-only Jira access and pagination
- provider normalization and ADF-to-Markdown conversion
- attachment origin checks, download, and collision-safe filenames
- safe Liquid profile loading and rendering
- atomic replacement of the profile-owned directory
- per-issue success, partial, and failure receipts

The exporter does not own:

- a consumer's repository layout or naming
- packet initialization or lifecycle
- publication, Git commits, pull requests, or deployment
- user interfaces, schedulers, or secret stores
- consumer-specific profiles

Consumers compose with the exporter through `--template-dir`, the staged
filesystem tree, and `schemas/export-receipt.schema.json`. The exporter must
build, test, package, and release without access to a consumer repository.

## Distribution

GitHub is the source repository and release record. The stable machine
installation channel is the public, scoped npm package
`@doruksahin/jira-markdown-exporter`; its executable remains
`jira-markdown-export`.

Consumer repositories install an exact local development dependency and commit
their lockfile. Servers that do not have a consumer checkout install the exact
package into a dedicated prefix. A global installation is only a convenience
for a human-operated machine, not the CI or production contract.

Release Please owns versions, tags, and GitHub Releases. A release job builds
and verifies one npm-compatible `.tgz`, then uses that same byte-for-byte file
as both the GitHub Release asset and npm publication payload. npm publication
uses GitHub Actions OIDC after the one-time package bootstrap and trusted
publisher configuration. The repository must not claim a version is available
from npm until the registry confirms it.

## Secrets

The CLI reads `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` from its process
environment. Library callers pass the same values in memory. These values must
never enter source control, profiles, receipts, logs, fixtures, or generated
Markdown.
