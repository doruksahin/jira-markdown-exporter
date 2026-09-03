---
date: '2026-09-02'
id: ADR-01M1H1J8YC48HC47TPGVNMFAES
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
- ADR-01KZR66763MX33YRFBW9EXWJAQ
status: accepted
supersedes: ADR-01KZR66763MX33YRFBW9EXWJAQ
---

# ADR-01M1H1J8YC48HC47TPGVNMFAES Consumer-Neutral Jira Exporter Output

## Context and Problem Statement

The standalone exporter still embeds its first consumer's `work-os-v1` profile,
defaults every export to that profile, names a compatibility entry point after
the Work OS board sync, and owns the consumer-specific `40 Jira/` directory.
The AdCreative vault then stages that output and remaps it into its canonical
`10 Tasks/Packets/<JIRA-KEY>/jira/` tree. This makes exporter releases depend on
ADC presentation and path policy, and prevents a remote runner from composing
the exporter with another consumer without inheriting Work OS concepts.

The exporter already has the useful seam: a validated external Liquid profile
with an arbitrary owned directory. We need to make that seam authoritative
while preserving read-only Jira access, deterministic rendering, atomic
owned-directory replacement, partial results, and attachment safety.

## Decision Drivers

- The exporter builds, tests, documents, and releases without `adc-vault`,
  Obsidian, Work OS, task-packet paths, or ADC templates.
- Consumers own their templates, destination mapping, preservation policy, and
  publication verification.
- The CLI remains usable in GitHub Actions and ordinary Node.js environments.
- Existing Jira pagination, normalization, attachment-origin checks,
  deterministic output, and per-issue partial results remain unchanged.
- The migration adds no hosted process, adapter registry, or second rendering
  engine.

## Considered Options

- **Keep `work-os-v1` bundled and add a neutral profile beside it.** This is
  compatible, but the exporter still owns and releases ADC policy.
- **Return only normalized Jira JSON and move all Markdown rendering to each
  consumer.** This gives the strongest separation, but duplicates or relocates
  the already proven renderer and is unnecessary for the current deployment.
- **Require or select consumer-neutral profiles and treat ADC's external profile
  plus publisher as consumer adapters.** The exporter retains generic rendering
  and filesystem staging; ADC owns `work-os-v1`, packet paths, attachment
  preservation, and publication.

## Decision Outcome

Chosen option: **consumer-neutral exporter profiles with consumer-owned
adapters**, because it removes ADC policy from the exporter while reusing the
existing profile interface and proven rendering implementation.

The exporter will ship no Work OS profile or Work OS compatibility command.
Its output remains the generic
`<output>/<JIRA-KEY>/<profile.ownedDirectory>/` tree, and its JSON receipt
describes per-issue results without assigning a vault destination. A caller may
provide an external profile directory; the profile ID and owned-directory name
are input data, not exporter policy.

The AdCreative vault will own the migrated `work-os-v1` templates and a small
filesystem publisher adapter. Remote execution stages exporter output in a
temporary directory, captures the versioned JSON receipt, then asks the ADC
adapter to validate and publish successful issue snapshots into canonical
packets. The ADC adapter retains path confinement, symlink rejection,
attachment-evidence preservation, publication ordering, and final filesystem
verification. Git checkout, secrets, commits, and pull requests remain the
responsibility of the runner such as GitHub Actions.

The initial manual smoke workflow keeps the raw receipt, staged Jira content,
publisher result, and validated changed-path list only on the ephemeral runner
filesystem. It does not upload those diagnostics or publish generated Jira
content. Only bounded status information is written to the job log; the
disposable runner removes the raw operational data when the job ends.

The first migration supports existing canonical packets and fails before
mutation when a packet is missing. Creating new task packets and generated task
records remains a separate ADC workflow rather than becoming exporter
behavior.
