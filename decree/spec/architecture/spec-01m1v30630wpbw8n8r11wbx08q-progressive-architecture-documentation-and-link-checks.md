---
date: '2026-09-06'
governs:
- AGENTS.md
- README.md
- src/AGENTS.md
- test/AGENTS.md
- profiles/AGENTS.md
- docs/architecture/README.md
- docs/maintenance.md
- .architecture/SOURCE.md
- .lychee-files
- .github/workflows/links.yml
id: SPEC-01M1V30630WPBW8N8R11WBX08Q
references:
- ADR-01M1H1J8YC48HC47TPGVNMFAES
status: implemented
---

# Progressive Architecture Documentation and Link Checks

## Overview

Make maintained architecture and agent guidance navigable with small entry
points, concrete links, and a repeatable local link gate. Preserve the accepted
[consumer-neutral exporter boundary](../../adr/exporter/adr-01m1h1j8yc48hc47tpgvnmfaes-consumer-neutral-jira-exporter-output.md).
This SPEC governs the documentation and link-check maintenance scope only;
historical export behavior, release work, and its remaining smoke criteria
remain owned by their existing specifications.

## Technical Design

Keep universal invariants and triggered routes in the root agent guide. Move
the detailed change map to a maintainer page; link the repository architecture
to source, decisions, and shared maintenance instructions. Use relative
Markdown links for repository targets and full GitHub URLs for cross-repository
references. Keep the shared architecture checker unchanged.

Add a pinned Lychee action and version to check authored Markdown files and
local heading anchors on pushes and pull requests. The reviewed input list
includes agent guides, checker provenance, and Decree documentation, and keeps
the local gate independent of remote repository authentication. Document the local command and the online-check limitation.

## Testing Strategy

Run `pnpm check`, the architecture checker, Lychee 0.24.2 in offline mode with
anchor checking, Decree lint, and `git diff --check`. Confirm the committed CI
job runs the same link command. No runtime, manifest, package version, or
release configuration changes belong in this work.

## Acceptance Criteria

- [x] Agent entry points retain invariants and route to architecture, maintenance, and area-specific guidance through working Markdown links.
- [x] Architecture and maintenance pages link to their source, decisions, shared standard, shared maintenance process, and verification commands.
- [x] Pinned Lychee CI checks authored local files and anchors without credentials; its exact local command and remote-check limits are documented.
- [x] Normal package checks, architecture check, link check, Decree lint, and whitespace validation pass without changing runtime or release files.
