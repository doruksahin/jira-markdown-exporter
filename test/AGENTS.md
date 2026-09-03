# Test Guide

Read the root `AGENTS.md` first. Tests here define the standalone exporter's
observable contract.

Use the closest existing pattern:

- Writer behavior: `core/generic-profile-writer.test.ts` uses a temporary
  output root to prove exact bytes, idempotency, stale-file replacement, and
  preservation outside the profile-owned directory.
- Runner behavior: `core/run-export.test.ts` uses a fake reader to prove JQL
  selection, de-duplication, bounded failures, and partial results.
- CLI behavior: `jira/cli.test.ts` calls exported argument and main functions;
  do not spawn a shell merely to test parsing.
- Jira behavior: `jira/jira-board-issue-reader.test.ts` fakes the narrow Jira
  read client and uses mocked `fetch` only for attachment bytes.
- Profile behavior: `core/output-profile.test.ts` creates local profiles and
  proves valid output plus traversal and symlink rejection.
- Package independence: `core/package-boundary.test.ts` proves the shipped
  runtime, schemas, and built-in profile remain consumer-neutral.

Assert observable behavior rather than private call structure. For example,
prove that a sibling file survives a refresh, that two equal attachment names
produce distinct ID-prefixed files, or that a partial receipt retains the
successful issue's generated output.

Tests must not contact a live Jira site, require credentials, or write outside
temporary directories. Run `pnpm check` after changes and
`pnpm release:check` before a package candidate.
