# Releasing Jira Markdown Exporter

This repository uses Release Please to turn reviewed Conventional Commit
changes into versioned GitHub Releases. npm publication is intentionally
disabled: releases distribute a checksummed npm-compatible package archive.

## Normal release flow

1. Create a normal branch and pull request. Use a Conventional Commit title:
   `fix:` for a patch, `feat:` for a minor, or `feat!:` for a major release.
2. Wait for `release check (Node 20)` to pass, then squash-merge the PR.
3. Wait for Release Please to open or update `chore(main): release X.Y.Z`.
4. Review its `package.json`, `CHANGELOG.md`, and
   `.release-please-manifest.json` changes. Wait for CI to pass.
5. Merge the generated release PR. Release Please creates `vX.Y.Z` and the
   matching GitHub Release.
6. The same workflow checks out the released revision, reruns
   `pnpm release:check`, builds the package, verifies `SHA256SUMS`, and uploads
   both files to the GitHub Release.

Do not manually edit the package version, changelog, release manifest, or tag.
Merging the generated release PR is the explicit publication decision.

## Required repository secret

`RELEASE_PLEASE_TOKEN` must be able to create pull requests, push release
branches, create tags and GitHub Releases, and upload release assets. A token
is used instead of the default Actions token so generated release-PR activity
can trigger CI.

Never print the token or place it in repository files. Store it only as an
encrypted GitHub Actions secret.

## Verify a release

Replace `X.Y.Z` with the released version:

```sh
gh release view vX.Y.Z \
  --repo doruksahin/jira-markdown-exporter \
  --json tagName,targetCommitish,publishedAt,url,assets

verification_root="$(mktemp -d)"
gh release download vX.Y.Z \
  --repo doruksahin/jira-markdown-exporter \
  --dir "$verification_root"

cd "$verification_root"
shasum --algorithm 256 --check SHA256SUMS

install_root="$(mktemp -d)"
npm install --ignore-scripts --no-audit --no-fund \
  --package-lock=false \
  --prefix "$install_root" \
  "$verification_root/jira-markdown-exporter-X.Y.Z.tgz"
"$install_root/node_modules/.bin/jira-markdown-export" --help
```

The release is complete only when the tag exists, both assets are present, the
checksum passes, and the installed CLI prints its complete help contract.

## Recovery

- If the ordinary PR fails CI, fix that PR; do not merge it.
- If the generated release PR is wrong, leave it open, merge a normal fix PR,
  and let Release Please update the same candidate.
- If release artifact upload fails after the GitHub Release is created, rerun
  the failed Release Please workflow. Upload uses `--clobber`, so recovery is
  idempotent.
- Never repair a failed candidate by manually creating a tag or changing
  release-owned version files on `main`.
