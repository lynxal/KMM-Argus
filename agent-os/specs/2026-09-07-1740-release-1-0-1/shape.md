# Release 1.0.1 — Shaping Notes

Tracking issue: [#24](https://github.com/lynxal/KMM-Argus/issues/24)

## Scope

Cut 1.0.1. 1.0.0 is live on Maven Central; eleven changes have landed on `main` since its tag.
This release bumps the version, sweeps every hand-written pin, corrects the docs that #22 made
wrong, refreshes the README screenshots so they show the shipped UI, and drafts the release
notes. Tagging is in scope; cutting the GitHub Release and publishing the binaries is not —
that stays with the maintainer.

## Starting state (verified, not assumed)

- `argus.version=1.0.0`, and every pin in the tree agrees. `:verifyVersionPins` is green.
- Tag `1.0.0` exists. All seven artifacts return `200` on `repo1.maven.org`.
- `origin/main` and the working branch are identical — nothing ahead, nothing behind.
- **There is no version conflict.** Nothing in the tree claims 1.0.1 yet; issue #24 is a
  tracking note, not a half-finished bump.

## What the release actually carries

Issue #24's table lists #20, #21, #22 and commit `262f697`. `git log 1.0.0..origin/main` shows
more, and the release notes have to cover it:

| Change | What |
|---|---|
| #20 | `npm ci` on macOS runners — the lockfile carried 4 of rollup's 25 platform binaries |
| #21 | The 1.0.0 publish failure: `withType<Jar>()` matched `bundling.Jar`, not KGP's sources jars |
| #22 | Lifecycle — ignore post-`stop()` callbacks; keep one live Argus server per process |
| #17 / #26 | A `Verify (Web UI)` CI job with five headless probes |
| #28 / #30 | Expanded JSON nodes survive the stream; app shell holds to the window |
| #31 | The waterfall list pane resizes and remembers its width; rows stop clipping |
| `262f697` | The verified 1.0.0 XCFramework checksum in `Package.swift` |

## Findings from shaping

Four things surfaced that the release must not ship as-is.

### 1. README §9.3 contradicts the shipped behaviour

`README.md:704` still says:

> every `Argus.start()` creates a fresh server with a fresh event bus and a fresh ring buffer

#22 removed that. A `start()` while a healthy instance is live now returns the existing
handle. The whole "Starting on demand" subsection is built on the old premise, and PR #22
touched no docs — its diff is 12 files, all Kotlin and build files.

### 2. 1.0.0 needed a manual Publish click in the Central Portal

Issue #24 raised this as a suspicion. It is now confirmed:

- The 1.0.0 publish run (`32284424263`) invoked only
  `publishAllPublicationsToMavenCentralRepository`. The log shows no `releaseRepository` task.
- All seven modules call `publishToMavenCentral()`, which in vanniktech 0.33.0 defaults
  `automaticRelease = false` (`MavenPublishBaseExtension.kt:69`).
- With that flag false, the build service queues a `Close` end-of-build action but not
  `ReleaseAfterClose` (`SonatypeRepositoryBuildService.kt:135-137`).

So the deployment uploads and then waits for a human to click **Publish**. That is why the
artifacts did not appear on `repo1` right after the workflow went green.

### 3. A version restatement the gate cannot see

`argus-webui/src/dev/fixtures/events.ts:220` hardcodes `argusVersion: '1.0.0'`. It is what the
web UI's top bar renders in mock mode — so it is what the refreshed screenshots will show —
and `:verifyVersionPins` cannot see it: `pinnedFiles` does not list the file, and the
hardcoded-literal guard only matches the `ARGUS_VERSION` identifier in `.kt`/`.kts`
(`build.gradle.kts:113-127`). Exactly the drift class the gate was built to stop.

### 4. Two more stale claims in README §8 (found while regenerating the screenshots)

Checking the captions against the shipped UI turned up two more:

- The detail-tab lists were wrong for all three event kinds. Actual, from
  `components/EventDetail/tabs/`: HTTP `Headers · Request · Response · Timing · Related Logs ·
  Raw`; Log `Message · Payload · Stack Trace · Related Logs · Raw`; Custom
  `Payload · Metadata · Raw`. The README listed an `Overview` tab and a `cURL` tab, neither of
  which exists.
- The shortcut line advertised `1` / `2` / `3` for List / Split / Waterfall. `input/keyboard.ts`
  has no such bindings — `w` cycles the three.

Both corrected. The "compact (28 px) / comfy (32 px) densities" claim in the same paragraph was
checked too and is accurate (`EventList.ts:13-14`).

## Decisions

| Question | Decision | Why |
|---|---|---|
| 1.0.1 or 1.1.0? | **1.0.1** | #22 fixed unintended behaviour — binding a second port, or reporting `startupError` on a pinned port — rather than changing an intended contract. Raised because the letter of README §9.3 argued for a minor; that paragraph is being corrected either way. |
| Fix the manual-Publish step? | **No — document it** | The maintainer runs the release. Changing the publish pipeline mid-release cannot be proven until the real run fires, so `AGENTS.md` gets an explicit step instead, plus a note of the one-line fix as a deliberate not-yet. |
| Screenshot source | **The real web UI** | Today's images are design-canvas exports. The canvas has no splitter, so re-exporting it cannot show #31. Playwright against the built bundle can. |
| Release notes | **Cover all merged work** | Issue #24's table is a subset. Six PRs' worth of user-visible change would otherwise go unannounced. |
| #23 (iOS CI gate) | **Out of scope** | Stays its own issue. Manually dispatching `Verify (iOS/Mac)` against `main` before tagging is already a checklist step. |

## Context

- **Visuals:** None provided. Four existing images in `docs/ui/` are being replaced.
- **References:** See `references.md`.
- **Product alignment:** `agent-os/product/` holds `mission.md`, `roadmap.md` and
  `tech-stack.md`. Nothing in them constrains release mechanics, so no alignment question
  arose.

## Standards applied

- `workflow/commit-conventions` — every commit in this release follows it. See
  `standards.md`. The rest of `agent-os/standards/` (17 categories) is Canvas-app domain
  material — BLE mesh, SignalR, screen models — and none of it touches this work.
