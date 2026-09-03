# Template-profile design

Status: implemented

Output profiles provide a narrow configuration seam for Markdown presentation.
The exporter ships one neutral `generic-v1` profile and accepts local external
profiles through `--template-dir`.

The profile manifest declares:

- a stable ID and schema version
- one owned output directory
- one attachment directory
- ordered Liquid-template to Markdown-output mappings

Profiles receive a normalized, credential-free template model. They do not
control Jira requests, binary download policy, filesystem traversal, atomic
replacement, or receipt generation. The loader rejects absolute and parent
paths, duplicate outputs, invalid extensions, unsafe directory segments, and
symlinks.

The design intentionally excludes remote templates, arbitrary JavaScript
helpers, and a generalized extension registry. Reusable consumer-specific
profiles remain versioned with their consumer and are passed as local files.

The executable proof lives in:

- `test/core/output-profile.test.ts`
- `test/core/generic-profile-writer.test.ts`
- `test/core/package-boundary.test.ts`

See `docs/output-profiles.md` for authoring and CLI examples.
