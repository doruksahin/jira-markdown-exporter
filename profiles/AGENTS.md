# Built-in Profile Guide

Read the root [agent guide](../AGENTS.md) and [docs/output-profiles.md](../docs/output-profiles.md) before changing a
profile. This directory owns presentation only: Liquid templates and their
`profile.json` manifests.

`generic-v1` is the only packaged profile. It is deliberately neutral and
writes four Markdown documents beneath `jira-snapshot/`. Do not add a profile
that encodes another repository's paths, terminology, or publication policy.
Consumer-specific profiles belong with their consumers and are selected with
`--template-dir`.

Profiles must not implement Jira HTTP, credentials, attachment downloads,
filename safety, media localization, receipts, or filesystem replacement.
Those remain exporter responsibilities.

When changing `generic-v1`:

1. Update [profile.json](generic-v1/profile.json) and the matching template together.
2. Assert the observable output in [test/core/generic-profile-writer.test.ts](../test/core/generic-profile-writer.test.ts).
3. Preserve the template model documented in [docs/output-profiles.md](../docs/output-profiles.md).
4. Run `pnpm check`.
5. Run `pnpm release:check` before packaging.

The [package-boundary test](../test/core/package-boundary.test.ts) must continue to prove that packaged profiles contain
no consumer-specific policy.
