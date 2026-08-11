# Test Guide

Read the root [`AGENTS.md`](../AGENTS.md) first. Tests in this directory are
the compatibility contract for the live Obsidian exporter, not incidental
implementation tests.

Use the closest existing example instead of creating a new test style:

- Writer behavior: copy the pattern in
  [`core/work-os-v1-writer.test.ts`](core/work-os-v1-writer.test.ts). It uses a
  temporary output directory and a real `00 Task.md` to prove ownership stays
  inside `40 Jira`.
- Runner behavior: copy `FakeReader` from
  [`core/run-export.test.ts`](core/run-export.test.ts). It demonstrates that a
  failed issue still produces a `partial` receipt while another issue's packet
  remains on disk.
- CLI behavior: call exported `parseArguments` or `main` as in
  [`jira/cli.test.ts`](jira/cli.test.ts). Do not spawn a shell just to test a
  flag parser.
- Jira adapter behavior: fake the narrow `JiraReadClient` passed to
  `JiraBoardIssueReader`, as in
  [`jira/jira-board-issue-reader.test.ts`](jira/jira-board-issue-reader.test.ts).
  Pass a mocked native `fetch` only for attachment-download behavior. The test
  must not call a real Jira instance or require credentials.
- Output-profile behavior: start with
  [`core/output-profile.test.ts`](core/output-profile.test.ts). Its `compact-v1`
  fixture proves a checked-out local profile writes `ATT-123/Jira Snapshot/Summary.md`,
  while its unsafe-manifest case proves `../00 Task.md` is rejected.

When adding a test, assert observable contract:

```ts
// Good: proves a human-owned sibling survives a generated refresh.
expect(await readFile(humanNote, 'utf8')).toBe('# Human-owned\n');

// Avoid: asserts a private helper was called a particular number of times.
```

For a new attachment edge case, assert both the generated Markdown destination
and the stored binary filename. The existing `20-design.png` / `21-design.png`
case is the canonical collision example.
