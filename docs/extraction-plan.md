# Standalone exporter boundary

Status: implemented

## Goal

Keep Jira acquisition and safe deterministic rendering reusable without
embedding any consumer repository's paths, templates, or publication policy.

## Public process contract

```sh
jira-markdown-export \
  --issue-keys PROJ-123,PROJ-124 \
  --output-dir /tmp/jira-export \
  --template-dir /absolute/path/to/profile \
  --download-attachments \
  --json
```

The CLI accepts exactly one selector: `--issue-keys` or `--jql`. It reads
credentials from `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. Exit `0`
means success, `2` means partial success, and `1` means failure.

## Ownership split

The exporter owns:

- GET-only Jira reads, pagination, and normalization
- safe attachment acquisition and ADF conversion
- profile validation and Liquid rendering
- atomic replacement of `<output>/<KEY>/<ownedDirectory>`
- a versioned JSON receipt

A consumer owns:

- its external profile and naming
- packet or workspace initialization
- validation and publication into final destinations
- attachment preservation beyond one export run
- scheduling, Git operations, and deployment

The integration surface is intentionally small: the external profile, staged
filesystem output, and receipt schema. No consumer adapter or workflow belongs
inside this package.

## Proof

- generic and external profiles render exact output
- repeat exports are byte-identical and preserve sibling files
- unsafe paths and profile symlinks fail closed
- JQL and comments paginate
- attachments use collision-safe names and reject foreign origins
- partial exports retain completed issue output
- the packaged runtime, schemas, and built-in profile contain no
  consumer-specific policy

Run `pnpm check` for the full contract and `pnpm release:check` for the package
boundary.

## Deliberately deferred

- Jira writes
- remote template loading
- an HTTP service
- scheduler or Git hosting integration
- a general plugin registry
- consumer-specific publication
