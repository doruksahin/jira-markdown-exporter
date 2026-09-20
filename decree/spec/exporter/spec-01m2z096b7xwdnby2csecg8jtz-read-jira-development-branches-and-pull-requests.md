---
date: '2026-09-20'
governs:
- src/
- test/
- profiles/generic-v1/
- docs/output-profiles.md
id: SPEC-01M2Z096B7XWDNBY2CSECG8JTZ
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
- ADR-01M1H1J8YC48HC47TPGVNMFAES
status: implemented
---

# SPEC-01M2Z096B7XWDNBY2CSECG8JTZ Read Jira development branches and pull requests

## Overview

Include associated branch names and pull request links in read-only issue snapshots and
profile output. Consumers continue to own packet publication and presentation.

## Technical Design

The Jira adapter reads the numeric issue ID, then the internal development summary and
provider-specific branch/pullrequest detail endpoints. Discover provider names from the
summary rather than assume GitHub. Keep endpoint parsing in one development module,
behind optional narrow client methods so existing injected readers remain compatible.
Normalize branches and pull requests into deterministic arrays, keep only safe HTTP(S)
links, and expose a credential-free `development` model to Liquid profiles. Both Node
and embedded transports use the same normalization. All requests remain GET-only.

Unavailable or malformed development responses produce fixed warnings and an explicit
unavailable/partial state, preserving the issue, comments and successful development
reads. Warnings reach existing receipts. Empty successfully read data is distinct from
unavailable data. The built-in issue template shows a Development section; external
profiles opt into the same model without changing the profile schema.

The [Atlassian issue](https://jira.atlassian.com/browse/JSWCLOUD-16901) documents these
internal endpoints and their unsupported, changeable status. No Jira writes or GitHub
fallback, lifecycle inference, or credentials are added.

## Acceptance Criteria

- [x] Discover providers and normalize branches and PR links through both transport paths.
- [x] Distinguish empty, unavailable and partial data without failing the issue export.
- [x] Render deterministic development output and preserve existing owned-directory safety.
- [x] Pass package checks and exercise the actual consumer against a packed candidate.

## Testing Strategy

Synthetic transport fixtures cover multiple providers, malformed data, failures, unsafe
URLs, duplicate records, and deterministic rendering. Run the package check and required
local architecture/documentation checks. Separately report live verification and local
candidate installation; this implementation does not claim a published release.

## Verification results — 2026-09-20

Package check: 138 tests passed (135 behavior/publication and 3 release-artifact),
including both public injected transports. Architecture checker, shared-checker
audit, Decree lint, whitespace and offline link checks passed. The actual consumer
installed a local packed candidate without changing its published dependency pin;
its full verification passed 211 tests, type checks, generated parity and secret
scan, and the final package revision passed all 31 targeted Sync tests. The
consumer's separate navigation audit has a pre-existing screenshot-location failure.

The pre-edit intent check reported historical churn in older specifications and
an outstanding remote smoke criterion. Scope review notes preserve that pending
evidence; these results do not claim historical release completion or publication.

A live consumer Sync was also exercised after reloading the candidate plugin.
The generated issue note displayed a linked branch and OPEN pull request with
source/target branch names. Publication and vault indexing completed successfully;
operational logs and downloaded Jira evidence remain in the consumer vault.
