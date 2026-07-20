---
title: "Working on the Gloomberb fork: always-latest local run + fork-safe release"
date: 2026-07-20
category: developer-experience
module: build-and-release
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - "Running a fork of Gloomberb locally and wanting every launch to reflect the fork's latest code"
  - "Cutting a release on a fork that lacks the upstream's Apple signing / npm / Homebrew secrets"
  - "Preventing a locally-installed build from silently auto-updating back to upstream"
related_components:
  - electrobun
  - cli
  - updater
tags: [fork, electrobun, bun, release, source-runner, notarization, auto-update, tui]
---

# Working on the Gloomberb fork: always-latest local run + fork-safe release

## Context

Gloomberb ships two surfaces from one Bun/OpenTUI codebase: a `gloomberb` terminal command (TUI) and an Electrobun desktop `.app`. The upstream release machinery assumes upstream's environment — Apple Developer signing secrets, `npm publish` rights, and a Homebrew tap — none of which a fork under a different org has. Three distinct frictions surface when working on a fork:

1. A locally-installed build is a **frozen snapshot**; iterating means rebuilding/reinstalling constantly.
2. The installed app's updater points at **upstream releases**, so it silently drifts off the fork.
3. The tag-triggered release CI **hard-fails on a fork** (missing signing secrets) and, worse, its later steps target upstream (`npm publish`, `homebrew-tap`).

This documents the workflow that makes all three tractable without touching upstream.

## Guidance

### 1. Make the `gloomberb` command always run the fork's latest source

The one-time `curl | sh` installer (`scripts/install.sh`) points `~/.local/bin/gloomberb` at the installed app's TUI shim — a compiled snapshot. Replace that symlink with a **source-runner** shell wrapper that executes the working tree directly:

```sh
#!/bin/sh
# gloomberb - always runs the fork's latest local source.
set -eu
GLOOMBERB_REPO="$HOME/projects/raava-solutions-gloomberb"
BUN="$(command -v bun || true)"
[ -x "$BUN" ] || BUN="$HOME/.bun/bin/bun"
if [ -z "${BUN:-}" ] || [ ! -x "$BUN" ]; then
  echo "gloomberb: bun runtime not found" >&2
  exit 1
fi
cd "$GLOOMBERB_REPO"
exec "$BUN" src/index.tsx "$@"
```

Every invocation runs the current working tree — no rebuild. This is **safe from the self-updater**: the TUI's `resolveSelfUpdateTargetPath` returns `null` when argv0 is an interpreter (`bun src/index.tsx`) rather than an installed binary, so interpreter-mode is never treated as a self-update target (see `src/updater.test.ts`). The app installer also only writes the symlink on `curl|sh` install, **not on app launch**, so a running app never clobbers the wrapper.

Tradeoff: the command runs whatever branch is *checked out*. Keep the repo on `main` for "fork latest release"; `git pull` to advance.

### 2. Repoint the desktop updater to the fork (kill upstream drift)

In `electrobun.config.ts`, the release base URL is baked in at build time. Point it at the fork and gate notarization so local builds don't hard-fail:

```ts
// before
const RELEASE_BASE_URL = "https://github.com/vincelwt/gloomberb/releases/latest/download";
// after
const RELEASE_BASE_URL = "https://github.com/raava-solutions/gloomberb/releases/latest/download";

mac: {
  codesign: true,
  createDmg: true,
  notarize: !!process.env.GLOOMBERB_NOTARIZE, // was `true`
  // ...
}
```

### 3. Build + install the desktop app locally without Apple secrets

The `dev` build channel auto-skips codesign and notarization:

```sh
bun run desktop:build          # -> build/dev-macos-arm64/Gloomberb-dev.app  (CFBundleVersion from package.json)
# patch display name if desired, then install over the old app:
/usr/libexec/PlistBuddy -c 'Set :CFBundleName Gloomberb' "$APP/Contents/Info.plist"
rm -rf /Applications/Gloomberb.app && ditto "$APP" /Applications/Gloomberb.app
codesign --force --deep -s - /Applications/Gloomberb.app   # ad-hoc sign so Gatekeeper allows it
xattr -dr com.apple.quarantine /Applications/Gloomberb.app
```

The built `.app` is a complete bundle: GUI view at `Contents/Resources/app/views/mainview/index.html`, launcher, and bun runtime in `Contents/MacOS/`.

### 4. Fork-safe release: disable the CI workflow BEFORE pushing a tag

`scripts/release.sh` and `.github/workflows/release.yml` assume upstream. On a fork, disable the tag-triggered workflow first, then bump/tag/push, then attach a locally-built binary to a fork `gh release`:

```sh
gh workflow disable "Release" --repo raava-solutions/gloomberb   # stops the red run + upstream npm/homebrew steps
./scripts/bump-version.sh 0.10.0                                  # commit + tag + push to fork origin
bun run scripts/build.ts                                         # ad-hoc signed self-contained binary in dist/
# IMPORTANT: build AFTER the version bump — build.ts reads package.json at build time,
# so building before the bump stamps the OLD version into the binary.
gzip -kf dist/gloomberb-darwin-arm64
gh release create v0.10.0 --repo raava-solutions/gloomberb dist/gloomberb-darwin-arm64.gz
```

## Why This Matters

- **Without the source-runner**, "test my fork change" means a full rebuild+reinstall every iteration. With it, the change is live on the next `gloomberb` invocation.
- **Without repointing the updater**, the installed app silently pulls upstream releases and your fork work evaporates on the next update check — a hard-to-notice regression.
- **Without disabling the release workflow first**, pushing a tag to the fork triggers a red CI run (missing Apple secrets) and steps that would attempt `npm publish` and a Homebrew-tap push against *upstream* landmines.
- **The GUI `.app` is a snapshot and cannot auto-update from the fork** — fork releases carry only the TUI binary, not the Electrobun app-update tarballs the GUI updater expects. That is a limitation (refresh the GUI by rebuilding) but *also* the mechanism that guarantees it never drifts back to upstream.

## When to Apply

- Any time a fork must run "latest" locally while the source of truth is a working tree, not a published artifact.
- Any Electrobun/Bun desktop+TUI project forked away from an environment that holds signing/publish secrets.

## Examples

Verifying the two surfaces after setup:

```sh
# CLI runs fork source in a clean env (no inherited PATH):
env -i HOME="$HOME" PATH="$HOME/.local/bin:/usr/bin:/bin" gloomberb --version
#   -> 0.10.1  (from src/version.ts, branch=main)

# GUI boots and the wrapper survived the app install:
open -a /Applications/Gloomberb.app && pgrep -fl 'Gloomberb.app/Contents/MacOS/launcher'
file ~/.local/bin/gloomberb   # -> POSIX shell script (still the source-runner, not the app shim)
```

## Related
- `scripts/install.sh` — the one-time installer whose symlink the source-runner replaces
- `src/updater.test.ts` — proves interpreter-mode is non-self-update
- `electrobun.config.ts` — release base URL + notarize gating
