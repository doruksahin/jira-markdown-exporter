# Maintainer guide

Use [repository architecture](architecture/README.md) for responsibility and
interface boundaries. This page routes a change to its implementation and proof.

## Change map

| Change | Start here | Required proof |
| --- | --- | --- |
| CLI flag or exit behavior | [CLI](../src/cli/main.ts) | [CLI tests](../test/jira/cli.test.ts), [receipt schema](../schemas/export-receipt.schema.json) and [README](../README.md) when public output changes |
| Jira field, pagination, or ADF conversion | [Jira adapters](../src/jira/) | [Jira reader tests](../test/jira/jira-board-issue-reader.test.ts) with fake transport |
| Receipt or partial-result behavior | [Export runner](../src/runner/run-export.ts) | [Runner tests](../test/core/run-export.test.ts) |
| Rendering or attachment storage | [Profile writer](../src/output/profile-writer.ts) | [Writer tests](../test/core/generic-profile-writer.test.ts) |
| Manifest or template model | [Output layer](../src/output/) and [profile schema](../schemas/output-profile.schema.json) | [Profile tests](../test/core/output-profile.test.ts) and [profile contract](output-profiles.md) |
| Built-in generic presentation | [Generic profile](../profiles/generic-v1/profile.json) | Exact observable output assertions in [writer tests](../test/core/generic-profile-writer.test.ts) |
| Reproducible package artifact | [Artifact builder](../scripts/build-release-artifact.mjs) | [Release-artifact tests](../test/release-artifact.test.ts) |
| Public package contents | [Package manifest](../package.json) | [Package-boundary tests](../test/core/package-boundary.test.ts) and `pnpm release:check` |

## Documentation and links

Keep the [root agent guide](../AGENTS.md) focused on universal rules and
task-triggered links. Put detailed instructions beside the code or in the
owning guide. Use relative Markdown links for repository files and heading
anchors; use complete GitHub URLs for other repositories. Code spans are for
commands, identifiers, and example paths, not navigational references.

When a boundary changes, update [repository architecture](architecture/README.md),
its [machine contract](../.architecture/contract.json), and the relevant
[decision](architecture/README.md#decisions). Follow the shared
[architecture maintenance procedure](https://github.com/doruksahin/plugin-architecture/blob/main/docs/maintenance.md)
for model changes and the
[architecture standard](https://github.com/doruksahin/plugin-architecture/blob/main/standard/README.md)
for the common format. The shared repository requires GitHub access.

Keep the vendored [checker](../.architecture/check.py) byte-identical to its
[recorded source](../.architecture/SOURCE.md). Sync it from the shared tooling
when upgrading the standard; do not modify the local copy.

## Verification

From the repository root:

```sh
pnpm check
python3 .architecture/check.py
lychee --offline --include-fragments=anchor-only --no-progress --files-from .lychee-files
decree lint
git diff --check
```

Install [Lychee 0.24.2](https://github.com/lycheeverse/lychee/releases/tag/lychee-v0.24.2)
to match the [required link job](../.github/workflows/links.yml). The
[input list](../.lychee-files) covers authored repository and architecture
documentation, including the nested agent guides and checker provenance.
The check fails on missing local files or Markdown heading anchors; it skips
URLs and does not need credentials or a network connection.

External links, including the private shared architecture repository, require
a separate authorized online check. An offline pass does not verify those
URLs, and this repository's default CI token does not grant access to a
different private repository. Do not weaken the local gate to accommodate
remote authentication failures.

Before a release candidate, follow the [release playbook](releasing.md) and
run `pnpm release:check`.
