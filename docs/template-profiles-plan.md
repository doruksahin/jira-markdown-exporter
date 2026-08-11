# Output profiles implementation plan

## Goal

Make the Markdown layer configurable without making the exporter unsafe or
turning every profile into a TypeScript fork. The initial built-in profile must
continue to generate the existing `work-os-v1` packet for `ATT-123` exactly:
`<output>/ATT-123/40 Jira/{00 Issue,10 Comments,20 Attachments,90 Sync}.md`.

## Research decision

Use [LiquidJS](https://liquidjs.com/api/), the TypeScript-compatible Liquid
engine. It provides file templates, filters, partials, and layouts without a
new bespoke template language. The built-in templates are version-controlled
in this repository. A future external template directory is local-only and
validated; no remote-template URL or code-evaluation feature is introduced.

The [LiquidJS layout/partial model](https://liquidjs.com/tutorials/partials-and-layouts.html)
is sufficient for packet files and shared frontmatter/notice fragments. A
profile manifest is documented as JSON and checked against
`schemas/output-profile.schema.json`; JSON Schema is the portable structural
contract, while the small runtime loader performs the safety checks necessary
before writing a file.

## Boundaries that do not become templates

- Jira reads, pagination, ADF conversion, and attachment-origin policy.
- Attachment downloading, ID-prefixed safe filenames, and inline-media
  localization. Example: IDs `20` and `21` both named `design.png` must not
  overwrite or ambiguously rewrite one another.
- Atomic replacement of only the profile-owned directory. Example: a refresh
  of `ATT-123` must never touch `ATT-123/00 Task.md`.
- Export receipt, partial failure behavior, and the CLI’s selector contract.

## Implementation steps

1. Introduce a normalized `ExportTemplateModel`, which contains only rendered
   values and no Jira `contentUrl` or filesystem paths.
2. Introduce a small `OutputProfile` loader with a manifest:
   `id`, `schemaVersion`, `ownedDirectory`, `attachmentsDirectory`, and an
   ordered, unique list of `{ template, output }` mappings.
3. Add path validation before rendering: manifests cannot choose absolute,
   parent-directory, duplicate, or non-Markdown output paths; templates must
   remain below their selected profile directory.
4. Move current `work-os-v1` Markdown literals to `profiles/work-os-v1/` Liquid
   templates and render that profile through the loader.
5. Keep `writeWorkOsV1Snapshot` as a compatibility API. It delegates to the
   built-in `work-os-v1` profile, so existing Work OS callers need no migration.
6. Add `--profile work-os-v1` and `--template-dir /local/profile` to the CLI.
   The built-in profile remains the default; a template directory is an
   explicit local opt-in.
7. Prove parity and safety in tests: default output versus selected profile,
   an external profile, partial result behavior, and rejected unsafe manifests.
8. Publish the built-in profile templates and manifest in the npm archive and
   document the supported template model with an `ATT-123` example.

## Definition of done

- Existing writer regressions pass without changing their expected behavior.
- The default and explicit `work-os-v1` outputs are byte-identical.
- An external local profile can render a different safe Markdown file without
  any TypeScript change.
- Invalid manifests cannot escape `<output>/<KEY>/<ownedDirectory>`.
- `pnpm release:check`, `decree lint`, and package dry-run succeed.
