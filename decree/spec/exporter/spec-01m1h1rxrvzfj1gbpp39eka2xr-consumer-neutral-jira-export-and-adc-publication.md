---
date: '2026-09-02'
governs:
- .github/
- .release-please-manifest.json
- AGENTS.md
- PROJECT.md
- README.md
- docs/
- package.json
- pnpm-lock.yaml
- profiles/
- release-please-config.json
- schemas/
- scripts/
- src/
- test/
id: SPEC-01M1H1RXRVZFJ1GBPP39EKA2XR
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
- ADR-01M1H1J8YC48HC47TPGVNMFAES
- SPEC-01KZR6678KTM854EJTMBJZ2GQJ
- SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H
status: approved
---

# SPEC-01M1H1RXRVZFJ1GBPP39EKA2XR Consumer-Neutral Jira Export and ADC Publication

## Overview

Remove AdCreative, Obsidian, Work OS, task-packet, `work-os-v1`, and `40 Jira`
policy from the standalone exporter while preserving its proven Jira reader,
generic Liquid profile seam, deterministic owned-directory writer, partial
results, and read-only transport safety. The AdCreative vault will supply its
profile as external input and publish staged output through a vault-owned
filesystem adapter suitable for GitHub Actions.

## Technical Design

First restore the behavior present in the pinned `0.2.11` archive but missing
from the checked-in `0.2.5` TypeScript: assigned-issue enhanced-search paging,
sprint parent closure, pagination guards, and the
`jira-assigned-issues` transport operation. Regression tests must prove this
restoration before extraction changes build on it. The next controlled package
version will align `package.json` with the exported runtime version; the
unreproducible `0.2.11` archive is evidence, not a source baseline.

The exporter keeps one generic interface:

```text
export(selection, output root, output profile, attachment policy)
  -> <output>/<JIRA-KEY>/<profile.ownedDirectory>/** + JSON receipt
```

The package will default to a consumer-neutral built-in Markdown profile and
continue accepting `--template-dir` for external profiles. The built-in
`work-os-v1` assets, Work OS identity constant, compatibility writer, and
board-sync command will be removed. The embedded GET-only entry point may
remain because injected transport is consumer-neutral. Existing receipt status
and exit-code semantics remain stable in this extraction.

The ADC repository owns its migrated Liquid profile and a dependency-free Node
filesystem publisher. The remote composition exports into a temporary staging
root, captures the CLI's JSON receipt, validates all issue/source/target paths
and symlink components before mutation, and publishes only successful issues
into existing canonical packet `jira/` roots. The publisher preserves current
attachment evidence rules, writes binaries then supporting Markdown then the
issue note, deletes only obsolete generated files, and verifies ordinary
filesystem visibility. Missing packets fail preflight; packet creation remains
outside this extraction.

GitHub Actions initially provides only a manual read-only smoke workflow. It
does not schedule runs, commit, push, open pull requests, host a process, or
introduce a container or adapter registry. Raw receipts, staged Jira content,
publisher results, and changed-path diagnostics remain on the ephemeral runner
and are not uploaded. The job log exposes only bounded completion status.

For stateless server execution, the CLI also accepts JQL from a UTF-8 file and
can atomically write its JSON receipt to an explicit path. These are alternate
input and output adapters for the same one-shot export operation: inline JQL
and JSON stdout remain compatible. A completed run receipt identifies the exporter
version, selected profile, and deterministic profile digest so a downstream
process can establish provenance without relying on machine-local state.

The repository can build one versioned npm-compatible tarball and a SHA-256
checksum file into an explicit artifact directory. The checksum identifies the
package payload, not a vendored dependency closure. Artifact creation does not
publish to a registry, create a container, schedule execution, or retain
cross-run state.

The public command uses an established CLI parser to keep argument parsing and
generated help in one contract. `jira-markdown-export --help` must be
self-contained for unattended operators and language models: it names every
selector and option, required environment variables, output and receipt
semantics, exit statuses, and copyable examples without requiring source-code
inspection.

GitHub delivery follows the same reviewed two-PR rail as the other maintained
packages. CI runs the complete release check on ordinary pull requests.
Release Please manifest mode reads Conventional Commits on `main`, owns the
package version, changelog, manifest, `vX.Y.Z` tag, and GitHub Release. After a
release is created, the workflow rebuilds the tested npm-compatible tarball,
verifies its checksum, and attaches both the tarball and `SHA256SUMS` to that
release. npm publication remains disabled until licensing and publication are
decided separately.

## Testing Strategy

Exporter tests use fake Jira readers and temporary directories to prove the
restored read behavior, generic profile output, idempotency, partial results,
selector and exit-code contracts, attachment safety, traversal rejection, and
absence of consumer terms from runtime/package contents. `pnpm check` and
`pnpm release:check` are the package gates.

ADC publisher tests use frozen receipts and staged directories to prove
success, partial and failed publication, attachment preservation, deterministic
repeat runs, missing-packet preflight, symlink/traversal rejection, publication
ordering, obsolete-file cleanup, and preservation of human packet files. The
operator README's commands must be executed against local fixtures; a final
manual GitHub Actions run proves credentials, network, checkout, staging, and
publication composition without committing its output.

## Acceptance Criteria

- [x] Checked-in TypeScript restores the assigned-issue and sprint-parent
  behavior present in the frozen `0.2.11` archive, with regression tests.
- [x] `package.json` and the exported runtime version agree in a controlled new
  package version.
- [x] Exporter runtime, built-in profiles, package exports, and release archive
  contain no ADC, Obsidian, Work OS, task-packet, `work-os-v1`, or `40 Jira`
  policy.
- [x] A consumer-neutral built-in profile works without extra setup, and an
  external profile supplied through `--template-dir` writes only its declared
  owned directory.
- [x] CLI selection, JSON receipt, exit codes, deterministic output, partial
  results, and read-only attachment safeguards remain covered by tests.
- [x] The ADC-owned profile reproduces the current four Markdown files from the
  same frozen issue fixture.
- [x] The dependency-free ADC filesystem publisher validates before mutation,
  preserves human files and attachment evidence, publishes only successful
  issues, and rejects unsafe paths and symlinks in tests.
- [x] A second identical export and publish produces byte-identical output and
  no tracked diff.
- [x] Exporter README and ADC operator README contain copy-paste local, CI,
  troubleshooting, verification, and upgrade instructions derived from tested
  commands.
- [x] Exporter `pnpm check` and `pnpm release:check`, Work OS `npm test`, ADC
  publisher tests, navigation audit, Decree lint, and `git diff --check` pass.
- [x] The CLI accepts exactly one of issue keys, inline JQL, or a UTF-8 JQL
  file, while retaining existing selector behavior and exit codes.
- [x] `--receipt` atomically writes the same versioned JSON result available on
  stdout, including for partial and ordinary failed runs, without making logs
  part of the machine-readable output.
- [x] Every completed receipt identifies the exporter version, profile ID, and
  a stable SHA-256 digest of the validated profile inputs; failures before a
  profile is available use a distinct preflight envelope.
- [x] A release-artifact command creates a versioned package tarball and
  `SHA256SUMS` in an explicit directory, and repeated builds from unchanged
  inputs produce matching hashes.
- [x] Server-oriented README examples document secrets, isolated temporary
  output, JQL-file selection, receipt handling, checksum verification, and the
  absence of persistent exporter state.
- [x] `jira-markdown-export --help` is generated from the CLI definition and
  self-contained for humans and language models, including purpose, required
  environment, all options, selector exclusivity, output/receipt semantics,
  exit statuses, and examples, while existing CLI behavior remains compatible.
- [ ] Pull requests and `main` pushes run the complete Node 20 release check,
  with workflow dependencies pinned to reviewed immutable action revisions.
- [ ] Release Please manifest configuration starts after the pre-extraction
  baseline, proposes the next version from Conventional Commits, and owns
  `package.json`, `CHANGELOG.md`, the release manifest, tag, and GitHub Release.
- [ ] A created GitHub Release receives the checksummed package tarball and
  `SHA256SUMS`, while npm publication remains disabled.
- [x] The README and release playbook document the normal feature PR, generated
  release PR, verification, recovery, and artifact-installation flow.
- [ ] The first release through this rail is merged and verified end to end:
  release PR, version, tag, GitHub Release, package archive, checksum, and
  installed CLI help.
- [ ] A manual read-only GitHub Actions smoke run completes, validates changed
  paths, keeps raw diagnostics only on the ephemeral runner, and neither
  uploads, commits, nor publishes generated Jira content.

### Deferred (v2)

- [ ] Extract live Work OS board reads from the embedded Jira read interface.
- [ ] Add remote creation of previously unseen task packets and generated task
  records.
- [ ] Add scheduled execution, automated commits or pull requests, containers,
  or a hosted process after operational need is demonstrated.
