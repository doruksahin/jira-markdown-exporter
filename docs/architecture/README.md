# Repository architecture

This page records the current repository boundary. Public command details,
schemas, and decision history remain authoritative in their owning files.

## Responsibility

This repository owns a standalone, read-only Jira Cloud exporter. It selects
issues, normalizes Jira responses into `BoardIssueSnapshot`, renders a selected
generic or external output profile, writes the profile-owned directory, and
returns a versioned export result.

The exporter remains consumer-neutral. Packet storage, acceptance-criteria
lifecycle, consumer directory conventions, publication, scheduling, and user
interfaces belong to callers. The accepted boundary decision is
[ADR-01M1H1J8YC48HC47TPGVNMFAES](../../decree/adr/exporter/adr-01m1h1j8yc48hc47tpgvnmfaes-consumer-neutral-jira-exporter-output.md).

## Interfaces

- **CLI call:** `jira-markdown-export` enters at
  [`src/cli/main.ts`](../../src/cli/main.ts). Its exact flags, environment,
  receipt behavior, and exit statuses are documented in the
  [README](../../README.md#discover-the-command-contract).
- **Library import:** `@doruksahin/jira-markdown-exporter` enters at
  [`src/index.ts`](../../src/index.ts). A caller supplies an output profile and
  explicitly chooses a reader, injected GET transports, or the default Node
  transport.
- **Embedded library import:** `@doruksahin/jira-markdown-exporter/embedded`
  enters at [`src/embedded.ts`](../../src/embedded.ts). The caller supplies a
  Jira JSON GET transport and, when attachments are enabled, a byte GET
  transport; it has no native network fallback.
- **File exchange:** the CLI can read UTF-8 JQL from `--jql-file` and a local
  profile from `--template-dir`. It writes only
  `<output-dir>/<issue-key>/<profile.ownedDirectory>` plus an optional receipt
  named by `--receipt`. The profile and receipt formats are owned by
  [`schemas/output-profile.schema.json`](../../schemas/output-profile.schema.json)
  and
  [`schemas/export-receipt.schema.json`](../../schemas/export-receipt.schema.json).

## Dependencies

**Repository installation.** [`package.json`](../../package.json) installs no
`@doruksahin/*` or `@adcreative/*` package. Its runtime packages are `ajv` for
schema validation, `axios` for the injected adapter used by `jira.js`,
`commander` for the CLI, `jira.js` for the default Node Jira client, and
`liquidjs` for profile rendering. TypeScript, TSX, Vitest, and Node type
definitions are development-only dependencies.

**Library imports.** A consumer's package manifest establishes an installation
relationship with this package; importing the public root or `/embedded`
establishes a separate in-process library relationship. The root can construct
the default Jira client; `/embedded` uses caller-injected GET callbacks.
`BoardIssueReader` is the internal application port between Jira acquisition
and [`runExport`](../../src/runner/run-export.ts).

**CLI calls and file exchange.** A consumer may invoke the installed executable
and then validate its receipt and generated tree. That process call and those
files do not make the consumer a dependency of this repository. The complete
operational composition is documented in
[Stateless server operation](../server-operation.md).

## Execution and storage

The CLI and library are one-shot Node.js executions. Jira reads occur through
GET-only adapters. Each issue is handled independently by `runExport`, then the
profile writer stages and atomically replaces only the selected profile's owned
directory. Sibling files under the issue-key directory remain untouched.

The exporter has no database, durable cache, scheduler, packet store, or
publication destination. Callers own secret injection, work-directory
lifetime, retries, retention, and any later movement of generated files.

## Failure behavior

Input and preflight failures return exit status `1` from the CLI. Completed
multi-issue runs preserve successful issue output: all-success returns `0`, a
partial result returns `2`, and a run with no exported issue returns `1`.
Attachment download failures become bounded per-issue warnings when rendering
can continue. Credentials and attachment content URLs are excluded from the
template model and intentional receipt fields.

The exact completed-result shape belongs to the
[export receipt schema](../../schemas/export-receipt.schema.json); transport
and embedded-runtime failure constraints belong to
[SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H](../../decree/spec/exporter/spec-01m0am89hg8p9ak0ds0ex9nz1h-injected-read-only-transport-for-embedded-jira-export.md).

## Current implementation

`src/cli/main.ts` parses process inputs and loads the selected profile;
`src/index.ts` or `src/embedded.ts` selects the Jira reader; Jira adapters
produce `BoardIssueSnapshot`; `src/runner/run-export.ts` coordinates issues;
and `src/output/profile-writer.ts` renders deterministic Markdown and replaces
the owned directory. Built-in presentation is limited to the
[`generic-v1` profile manifest](../../profiles/generic-v1/profile.json).

The implemented consumer-neutral extraction and its verification scope are
recorded in
[SPEC-01M1H1RXRVZFJ1GBPP39EKA2XR](../../decree/spec/exporter/spec-01m1h1rxrvzfj1gbpp39eka2xr-consumer-neutral-jira-export-and-adc-publication.md).

## Planned changes

Future only: the broader Jira producer/read facade may be extracted from this
package so Jira acquisition can be shared independently of Markdown export.
No such extraction is implemented by this architecture adoption; the current
exports and ownership remain unchanged. The existing deferred item is recorded
under
[SPEC-01M1H1RXRVZFJ1GBPP39EKA2XR](../../decree/spec/exporter/spec-01m1h1rxrvzfj1gbpp39eka2xr-consumer-neutral-jira-export-and-adc-publication.md#deferred-v2).

## Decisions

- [ADR-01M1H1J8YC48HC47TPGVNMFAES](../../decree/adr/exporter/adr-01m1h1j8yc48hc47tpgvnmfaes-consumer-neutral-jira-exporter-output.md)
  owns the consumer-neutral output and integration boundary.
- [SPEC-01M0AM89HG8P9AK0DS0EX9NZ1H](../../decree/spec/exporter/spec-01m0am89hg8p9ak0ds0ex9nz1h-injected-read-only-transport-for-embedded-jira-export.md)
  owns the injected GET transport and embedded-runtime boundary.
- [Output profiles](../output-profiles.md) owns the profile manifest, template
  model, rendering, and attachment presentation contract.

## Verification

`python3 .architecture/check.py` validates this repository's architecture
contract and internal-package allowlist. `pnpm check` runs typechecking and the
behavior suite. Tests use fake Jira readers/transports and temporary files:
`test/jira` covers CLI and Jira adapter relationships, while `test/core`
covers library, runner, schema, profile writer, and package-boundary behavior.
No test relationship requires a live Jira site or a consumer repository.
