# Release 1.0.1 — issue #24

## Context

1.0.0 is live: all seven artifacts return 200 on `repo1`, tag `1.0.0` exists, and every
version pin in the tree agrees on `1.0.0`. There is no version conflict — the tree is clean
and nothing yet claims `1.0.1`. Issue #24 is a tracking note for the next cut.

Eleven merged changes now sit on `main` past the `1.0.0` tag — more than issue #24's table
lists. Beyond #20 (rollup lockfile), #21 (sources-jar publish fix) and #22 (lifecycle), the
release also carries #17/#26 (a `Verify (Web UI)` CI job), #28/#30 (expanded JSON nodes
surviving the stream, app-shell scroll containment) and #31 (a resizable waterfall list pane).

Two things found during shaping that the release must not ship as-is:

1. **`README.md:704` is now wrong.** #22 made `Argus.start()` return the live handle instead
   of binding a second server, but §9.3 still promises *"every `Argus.start()` creates a fresh
   server with a fresh event bus and a fresh ring buffer"* — and then builds a whole
   start-on-demand guide on that premise. #22 changed no docs.
2. **1.0.0 needed a manual Publish click.** The publish run invoked only
   `publishAllPublicationsToMavenCentralRepository`, never the plugin's `releaseRepository`
   task, and all seven modules call `publishToMavenCentral()` — which defaults
   `automaticRelease = false` in vanniktech 0.33.0. That is why the artifacts did not appear
   on `repo1` immediately. Confirmed from the run log for `32284424263`.

**Intended outcome:** `main` carries a correct, self-consistent 1.0.1 tree with accurate docs
and refreshed screenshots, tagged `1.0.1`, ready for you to cut the GitHub Release yourself.

## Decisions taken during shaping

| Question | Decision |
|---|---|
| Version | **1.0.1.** #22 fixed unintended behaviour rather than changing an intended contract. |
| Publish pipeline | **Untouched.** You run the release; I document the manual Portal click in `AGENTS.md`. |
| Release notes | Drafted covering *all* merged work, not just issue #24's table. |
| Screenshots | Refreshed from the **real web UI**, not the design canvas. |
| #23 (iOS CI gate) | **Out of scope** — stays its own issue. |

## Out of scope

- No change to `.github/workflows/publishToMavenCentral.yml`.
- No `publishToMavenCentral(automaticRelease = true)` in module build files.
- No change to `verifyIos.yml` triggers (#23).
- No `publishToMavenLocal` or any publish run from this machine.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-09-07-1740-release-1-0-1/` with `plan.md` (this file), `shape.md`
(scope, the five decisions above with their reasoning, the two findings), `standards.md`
(`workflow/commit-conventions` — the only standard that applies; the rest of
`agent-os/standards/` is Canvas-app domain material) and `references.md` (pointing at
`agent-os/specs/2026-08-19-1949-release-1-0-0-version-sync/` as the spec that built
`verifyVersionPins`, and at `scripts/probe-webui/splitter-probe.js` as the Playwright
pattern the screenshot script follows). No `visuals/` — none were provided.

## Task 2 — Bump the version and sweep every pin

`gradle.properties:16` — `argus.version=1.0.1`.

Then every hand-written restatement. The authority on the list is the `pinnedFiles` list and
the `scan(…)` calls in `build.gradle.kts:22-121`, not this plan:

- `README.md:21` — §2 status row `| Version | \`1.0.0\` |`
- `README.md:49,50,351,594` — dependency snippets
- `README.md:830-836` — module table coordinates (7 rows)
- `Package.swift:26` — `releases/download/1.0.1/argus_ios.xcframework.zip`
- `argus-webui/package.json:3` and `argus-webui/package-lock.json:3,9` — both the root
  `version` and `packages[""].version`; the lockfile is parsed as JSON, not regexed
- `AGENTS.md:115` — the `git tag 1.0.0` example. **Not covered by the gate**, so it needs a
  manual eye; `verifyVersionPins` only scans `AGENTS.md` for `com.lynxal.argus:` coordinates.

Run `./gradlew :verifyVersionPins` until green.

**`Package.swift` is knowingly inconsistent between this commit and Task 9.** The URL points
at the 1.0.1 asset while the checksum is still 1.0.0's, and the asset does not exist until
the Release is cut. SPM consumers tracking `main` in that window get a 404 or a checksum
mismatch. Unavoidable — the checksum is of the zip CI builds — and it is how 1.0.0 went out.

## Task 3 — Correct README §9.3 for #22's behaviour

`README.md:704-712`. The "Starting on demand" subsection is built on a premise #22 removed.
Rewrite it to state what `Argus.start()` now does, sourced from the merged implementation
(`argus-android/src/androidMain/kotlin/com/lynxal/argus/android/Argus.kt`) and PR #22's body:

- A `start()` while a healthy instance is live **returns that instance's handle**; the new
  config is ignored and a log says so.
- A handle that failed to bind is **replaced**, not reused — otherwise Argus could never rebind.
- A `stop()` then `start()` still yields a fresh server, bus and ring buffer, so the existing
  advice (wire plugins through a switchable bus, not a captured `handle.eventBus`) still holds
  for the start/stop-from-debug-menu case.
- Under a concurrent double-start the last caller wins and the displaced server is stopped,
  not abandoned.

Keep §9.3's existing voice and length. Do not restate the `AtomicReference` reasoning — that
belongs in the PR, not the integration guide.

## Task 4 — Stop the mock device advertising a stale version

`argus-webui/src/dev/fixtures/events.ts:220` hardcodes `argusVersion: '1.0.0'`. It is the
version the web UI's top bar renders in mock mode, so it is what Task 6's screenshots will
show — and it is invisible to `verifyVersionPins`, whose hardcoded-literal guard only looks
for the `ARGUS_VERSION` identifier in `.kt`/`.kts` (`build.gradle.kts:113-127`).

1. Set it to `1.0.1`.
2. Extend `verifyVersionPins` to cover it: add the file to `pinnedFiles` and a `scan(…)` call
   for `argusVersion: '<x.y.z>'`, following the existing rot-detection shape — a zero-hit
   regex must fail loudly rather than pass by matching nothing.

`FIXTURE_DEVICE.version` (`1.4.2`, the fake *host app's* version) and
`scripts/probe-webui/fake-device.js`'s `APP_INFO` are unrelated to `argus.version` and stay
as they are.

## Task 5 — Write the manual Publish step into the release checklist

`AGENTS.md` §Release, step 5. Add, with the evidence: `publishToMavenCentral()` defaults
`automaticRelease = false`, and the workflow runs `publishAllPublicationsToMavenCentralRepository`,
which uploads the deployment but never releases it. So after the workflow goes green, the
deployment sits in the Central Portal awaiting a manual **Publish** — artifacts will not
appear on `repo1` until it is clicked, and then only after mirror lag.

Note the one-line fix that would remove the step (`arguments: publishAndReleaseToMavenCentral`)
as a deliberate not-yet, so it is not rediscovered as a bug. Leave the workflow file alone.

## Task 6 — Refresh `docs/ui/*.png` from the real web UI

Today's four images are exports of the **design canvas**
(`design_handoff_argus_inspector/Argus Inspector.html`) — the artboard labels
`Inspector · Waterfall` / `Inspector · List only + Jump-to-latest pill` and the 1360×860 /
1360×720 sizes match at 2x, and `waterfall.png` still carries the artboard chrome and a
clipped second panel. The canvas has no splitter, so it cannot show #31.

Add `scripts/probe-webui/docs-shots.js`, modelled on `splitter-probe.js:1-40` (Playwright is
already a devDependency there):

- Serve the **built** bundle — `argus-webui && npm run build`, then `vite preview` — and load
  it with `?simulate=off`. `argus-webui/src/app.ts:26-38` uses the mock source when
  `?simulate=` is explicit even over http, so this renders the shipped UI against
  `FIXTURE_EVENTS` / `FIXTURE_DEVICE` (`com.example.app · 1.4.2 · Pixel 8`) — the same
  presentable data the current images show. `fake-device.js` is the wrong source here: its
  `APP_INFO` advertises `com.lynxal.argus.probe · 0.0.0-probe · Probe Device`.
- `deviceScaleFactor: 2`, viewports `1360×860` for `hero.png` / `waterfall.png` and
  `1360×720` for `event-list.png` / `filters.png`, so filenames, dimensions and the four
  README references at `README.md:7,637,643,647` all stay put.
- Wait for the footer event count to settle before shooting — the mock replays at speed 4.
- For `waterfall.png`, drag the splitter wider first (`splitter-probe.js` has the selectors
  and the persisted-width behaviour) so the image shows what #31 delivered.
- Add it to `scripts/probe-webui/package.json` as a script, but **not** to the `probes`
  aggregate — it writes files and is not a pass/fail check, so it must stay out of CI.

Then eyeball all four. A screenshot that shows a clipped row or an empty pane is worse than
the design export it replaces.

## Task 7 — Verify locally

```bash
./gradlew :verifyVersionPins \
  jvmTest testDebugUnitTest testReleaseUnitTest \
  :argus-okhttp:test :argus-urlconnection:test \
  :sample:assembleDebug :sample:verifyReleaseHasNoArgus

cd argus-webui && npm run lint && npm run test && npm run build
cd ../scripts/probe-webui && npm run probes
```

Also prove the Task 4 gate extension is not vacuous: point the fixture at a wrong version and
confirm `:verifyVersionPins` fails with that `file:line`. A green-only check proves nothing —
same standard `agent-os/specs/2026-08-19-1949-release-1-0-0-version-sync/plan.md:154` set.

iOS is not verifiable here (Kotlin/Native linking needs several GB); it is covered by the
dispatch in Task 8.

## Task 8 — Land it and tag

Commits follow `agent-os/standards/workflow/commit-conventions.md` — `chore:` for the bump,
`docs:` for README/AGENTS, `feat:`/`chore:` for the gate extension and the shot script,
imperative subjects under 72 chars, **no AI attribution trailer**.

1. Push `vkurkchi/relea`, open a PR against `main`. `Verify (JVM/Android)` and
   `Verify (Web UI)` both fire on PRs, so they gate the merge.
2. Merge. If `main` has moved, **merge `origin/main` into the branch** — never rebase or
   force-push a pushed branch.
3. Dispatch **`Verify (iOS/Mac)` against `main`.** It is `workflow_dispatch`-only (#23) and is
   the only gate that exercises Kotlin/Native and the macOS toolchain — the half that nearly
   took 1.0.0 down. Dispatch `Verify (JVM/Android)` against `main` too, per the checklist.
4. Tag the merge commit `1.0.1` — bare, no `v` prefix, matching `argus.version` exactly.
   Nothing enforces that match; `publishToMavenCentral.yml` builds the SPM asset URL from the
   tag name.

**I will ask before pushing the tag.** It is where the release becomes visible, and creating
the GitHub Release from it triggers an irreversible publish. Cutting the Release is yours.

## Task 9 — Release notes, and the post-release checksum

Draft the notes into the spec folder as `release-notes.md`, following 1.0.0's shape (Install /
What changed / Fixes / Modules table). Cover everything merged since the tag, not just issue
#24's table:

- **#22** — `start()` reuses a live instance instead of binding a second port; callbacks
  arriving after `stop()` are ignored, so a stopped handle no longer republishes a live URL.
- **#31** — the waterfall list pane resizes and remembers its width; rows no longer clip.
- **#28 / #30** — expanded JSON nodes stay open when a new event arrives; the app shell holds
  to the window so inner panes scroll instead of growing the page.
- **#21** — fixed the `androidReleaseSourcesJar` failure that broke 1.0.0's own publish.
- **#20** — `npm ci` on macOS runners.
- **#17 / #26** — a `Verify (Web UI)` CI job with five headless probes.

After your Release run finishes, paste the printed SHA-256 into `Package.swift`'s
`binaryTarget` and commit it to `main`. It can only exist after the asset does — a locally
built zip will not match. This closes the Task 2 window.

## Verification summary

| What | How |
|---|---|
| Pins agree | `./gradlew :verifyVersionPins` green, and **failing** when a pin is wrong |
| Nothing regressed | The CI-equivalent Gradle block plus `npm run lint && npm run test` |
| Web UI behaviour | `scripts/probe-webui && npm run probes` — all five green |
| iOS / macOS | `Verify (iOS/Mac)` dispatched against `main` |
| Docs match code | Read §9.3 against `Argus.kt`'s merged `start()`; §9.3's claims must be checkable in the source |
| Screenshots | Open all four; each must show the current UI, `Argus 1.0.1` in the footer, and no clipped rows |
| Tag | `git tag --list` shows bare `1.0.1`; it equals `argus.version` |
