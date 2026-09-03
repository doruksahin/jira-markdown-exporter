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

GitHub is the source repository. The intended stable installation channel is
the versioned npm package and its `jira-markdown-export` binary. Publication is
currently blocked by `private: true` and `UNLICENSED` until license and release
authority are explicitly decided.

## Secrets

The CLI reads `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` from its process
environment. Library callers pass the same values in memory. These values must
never enter source control, profiles, receipts, logs, fixtures, or generated
Markdown.
