---
date: '2026-08-11'
id: ADR-01KZR66763MX33YRFBW9EXWJAQ
references:
- PRD-01KZR5W5CNKW62PP98VGPNJTJX
status: accepted
---

# ADR-01KZR66763MX33YRFBW9EXWJAQ Preserve Work OS v1 as the initial output profile

## Context and Problem Statement

The existing consumer already relies on a `40 Jira/` packet subtree with four
Markdown files and attachment binaries. A standalone exporter needs a stable
public contract, but introducing a generic layout during extraction would force
the consumer migration to change semantics and implementation at once.

## Decision Drivers

- Preserve the currently proven task-packet ownership boundary.
- Give new consumers an explicit, versioned contract before supporting another
  layout.

## Considered Options

- Preserve `work-os-v1` as the only v1 output profile.
- Introduce a generic layout together with the extraction.
- Keep the exporter embedded in the existing workspace.

## Decision Outcome

Chosen option: "Preserve `work-os-v1` as the only v1 output profile", because
it separates reusable read-only export from consumer-specific migration risk.
The standalone implementation owns only `<output>/<key>/40 Jira/`; a generic
layout may be added later as an explicit, separately versioned profile.
