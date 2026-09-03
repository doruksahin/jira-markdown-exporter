# Releasing Jira Markdown Exporter

This repository uses Release Please for versions, changelog entries, tags, and
GitHub Releases. The release workflow builds one npm-compatible archive,
verifies it, uploads that exact archive to GitHub, and publishes the same bytes
as `@doruksahin/jira-markdown-exporter` on npm. The executable installed by the
package remains `jira-markdown-export`.

npm publication has not happened merely because this document exists. Treat a
version as public only after both the GitHub Release and npm registry checks in
this playbook pass.

## Release flow

1. Create a normal pull request with a Conventional Commit title: `fix:` for a
   patch, `feat:` for a minor, or `feat!:` for a major.
2. Wait for `release check (Node 20)` and review to pass, then squash-merge it.
3. Release Please opens or updates `chore(main): release X.Y.Z`.
4. Review the generated `package.json`, `CHANGELOG.md`, and
   `.release-please-manifest.json` changes. Wait for CI to pass.
5. Merge that release PR. Release Please creates `vX.Y.Z` and its GitHub
   Release.
6. The same workflow checks out the released SHA, runs `pnpm release:check`,
   creates one `doruksahin-jira-markdown-exporter-X.Y.Z.tgz`, verifies its
   `SHA256SUMS`, uploads both files to the GitHub Release, and publishes that
   `.tgz` to npm through GitHub Actions OIDC.

Do not manually edit the package version, changelog, release manifest, or tag.
Merging the generated release PR is the publication decision.

The one-time `v0.2.5` bootstrap tag anchors the package version that existed
before this release rail. It is not a precedent for creating future tags
manually.

## Repository and npm prerequisites

The GitHub repository needs `RELEASE_PLEASE_TOKEN` as an Actions secret. It
must be able to create release pull requests, push release branches, create
tags and GitHub Releases, and upload release assets. It is not an npm token.

The npm package must use public access. The Release Please job needs GitHub
write permissions, while the separate publish job needs the OIDC permission:

```yaml
jobs:
  release:
    permissions:
      contents: write
      issues: write
      pull-requests: write

  publish:
    permissions:
      contents: write
      id-token: write
```

Trusted Publishing also requires a supported current npm CLI in the publish
job and explicit routing of the `@doruksahin` scope to
`https://registry.npmjs.org`. No long-lived `NPM_TOKEN` belongs in this
workflow.

After the package exists, configure its npm Trusted Publisher with these exact
coordinates:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| GitHub owner | `doruksahin` |
| Repository | `jira-markdown-exporter` |
| Workflow filename | `release-please.yml` |
| Environment | Leave empty unless the publish job declares one; if it does, match it exactly. |
| Allowed actions | `npm publish` |

## First public npm publication

Trusted Publishing configuration normally follows creation of the npm package.
The first release therefore has one owner-operated bootstrap. The release
workflow may reach its OIDC publish step and fail until this is complete; the
already-created GitHub Release and its verified files are the bootstrap input.

On a trusted machine with Node and npm installed, replace `X.Y.Z`, then use a
dedicated npm configuration file so unrelated registry settings cannot redirect
the publish:

```sh
release_version=X.Y.Z
verification_root="$(mktemp -d)"
npm_auth_root="$(mktemp -d)"
touch "$npm_auth_root/npmrc"
chmod 600 "$npm_auth_root/npmrc"

gh release download "v$release_version" \
  --repo doruksahin/jira-markdown-exporter \
  --dir "$verification_root"

gh release view "v$release_version" \
  --repo doruksahin/jira-markdown-exporter \
  --json tagName,targetCommitish,publishedAt,url,assets

cd "$verification_root"
shasum --algorithm 256 --check SHA256SUMS

npm login \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org \
  --userconfig "$npm_auth_root/npmrc"

npm publish \
  "$verification_root/doruksahin-jira-markdown-exporter-$release_version.tgz" \
  --access public \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org \
  --userconfig "$npm_auth_root/npmrc"

npm logout \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org \
  --userconfig "$npm_auth_root/npmrc"
```

Authenticate interactively as the npm owner of the `@doruksahin` scope and
complete the account's required 2FA/WebAuthn challenge. Never paste an npm
credential into the repository, workflow, command history, or release asset.
After logout, delete the temporary `npm_auth_root` directory using its printed,
fully resolved path.

Now configure the Trusted Publisher coordinates above and dispatch the release
workflow for the existing tag:

```sh
gh workflow run release-please.yml \
  --repo doruksahin/jira-markdown-exporter \
  --field publish_tag="v$release_version"
```

The recovery path checks out that tag, verifies `vX.Y.Z` against the package
version, rebuilds the deterministic archive, and checks existing GitHub and npm
artifacts for byte identity. Because the bootstrap already published this
version, the npm helper exits after confirming identical registry integrity;
this retry does not exercise OIDC authentication. Trusted Publishing is first
proven when the workflow publishes the next previously unpublished version.

After that first OIDC publication succeeds, harden the npm package's publishing
access to require 2FA and disallow tokens. Revoke any unused npm automation or
granular access tokens left from older release processes. Future releases then
publish through the configured Trusted Publisher without an interactive
bootstrap or long-lived npm credential.

## Verify a release end to end

Replace `X.Y.Z` with the release version:

```sh
release_version=X.Y.Z
verification_root="$(mktemp -d)"
npm_copy_root="$(mktemp -d)"

gh release view "v$release_version" \
  --repo doruksahin/jira-markdown-exporter \
  --json tagName,targetCommitish,publishedAt,url,assets

gh release download "v$release_version" \
  --repo doruksahin/jira-markdown-exporter \
  --dir "$verification_root"

cd "$verification_root"
shasum --algorithm 256 --check SHA256SUMS

npm view "@doruksahin/jira-markdown-exporter@$release_version" \
  version dist.integrity dist.tarball \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org

npm pack "@doruksahin/jira-markdown-exporter@$release_version" \
  --ignore-scripts \
  --pack-destination "$npm_copy_root" \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org

cmp \
  "$verification_root/doruksahin-jira-markdown-exporter-$release_version.tgz" \
  "$npm_copy_root/doruksahin-jira-markdown-exporter-$release_version.tgz"

install_root="$(mktemp -d)"
npm install \
  --ignore-scripts \
  --no-audit \
  --no-fund \
  --package-lock=false \
  --prefix "$install_root" \
  --registry https://registry.npmjs.org \
  --@doruksahin:registry=https://registry.npmjs.org \
  "@doruksahin/jira-markdown-exporter@$release_version"
"$install_root/node_modules/.bin/jira-markdown-export" --help
```

On Linux, replace the checksum command with `sha256sum --check SHA256SUMS`.
The release is complete only when the tag exists, the GitHub files are present,
the checksum passes, npm reports the exact version, the npm tarball is
byte-identical to the GitHub tarball, and the installed CLI prints its complete
help contract.

The GitHub-only release rail was proven by
[`v0.3.0`](https://github.com/doruksahin/jira-markdown-exporter/releases/tag/v0.3.0).
That statement does not claim `v0.3.0` or any later version has been published
to npm.

## Recovery

- If an ordinary PR fails CI, fix that PR; do not merge it.
- If the generated release PR is wrong, leave it open, merge a normal fix PR,
  and let Release Please update the candidate.
- If the first OIDC publish fails because the npm package or Trusted Publisher
  does not exist, perform the unavoidable one-time exact-`.tgz` bootstrap above,
  configure the publisher, then dispatch `release-please.yml` with
  `publish_tag: vX.Y.Z`. That dispatch verifies artifact identity; the next
  previously unpublished version is the first real OIDC authentication proof.
- For any artifact or publication retry, prefer a new `workflow_dispatch` run
  with `publish_tag: vX.Y.Z` over rerunning a historical failed run. The tag is
  the explicit immutable recovery input.
- If npm already contains the release version, the dispatched job verifies
  that its registry tarball is byte-identical to the rebuilt release `.tgz`; a
  match is success, while a mismatch is a hard stop that needs investigation.
- If GitHub asset upload fails after npm succeeds, dispatch the workflow with
  the same tag. The upload helper accepts byte-identical existing assets and
  fails closed if an existing asset differs; npm publication uses the same
  identity check. Recovery therefore does not create or replace an unverified
  build.
- Never repair a failed candidate by manually creating a tag, changing
  release-owned version files on `main`, publishing a fresh local build, or
  replacing an npm version. npm versions are immutable.
