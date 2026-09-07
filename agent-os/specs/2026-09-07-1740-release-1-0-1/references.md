# References for Release 1.0.1

## Similar implementations

### The 1.0.0 release spec

- **Location:** `agent-os/specs/2026-08-19-1949-release-1-0-0-version-sync/`
- **Relevance:** The spec that built `:verifyVersionPins` and wrote the `AGENTS.md` Release
  section this release follows. `plan.md:118-139` is the design rationale for the gate;
  `shape.md:53` records why `Package.swift` has to be pinned by hand at all.
- **Key patterns:** Two rules carried forward — a pinned-file scan must fail loudly when its
  regex matches *nothing* (a rotted regex must not pass by silence), and a gate change is only
  proven by watching it fail, not by watching it pass (`plan.md:154`).

### The version-pin gate itself

- **Location:** `build.gradle.kts:22-160`
- **Relevance:** The authority on which files are pinned. `pinnedFiles` plus the `scan(…)`
  calls are the real checklist for the pin sweep — this spec's file list is a convenience copy
  and can go stale.
- **Key patterns:** npm manifests are JSON-parsed, not regexed, because `package-lock.json`
  carries a transitive `stackback@0.0.2` whose `"version"` sits at the same indent as the real
  `packages[""]` entry. Any new pin in a JSON file follows that.

### The web UI probes

- **Location:** `scripts/probe-webui/splitter-probe.js`, `scripts/probe-webui/fake-device.js`
- **Relevance:** The Playwright pattern the screenshot script follows. `playwright` is already
  a devDependency there, so no new dependency is needed. `splitter-probe.js:19-40` has the
  layout constants and the persisted-width behaviour needed to widen the pane before shooting
  `waterfall.png`.
- **Key patterns:** Probes serve the **built** bundle from the same origin as the API so the
  real `mountApp` and `websocketSource` run — no test seam in shipped code. Layout is asserted
  by measuring boxes and reading computed `display`, never by class names or the `hidden`
  attribute.
- **Not reused:** `fake-device.js`'s `APP_INFO` advertises
  `com.lynxal.argus.probe · 0.0.0-probe · Probe Device` — fine for a probe, wrong for a README
  image. The screenshot script uses the web UI's own mock source (`?simulate=off`) and its
  `FIXTURE_DEVICE` instead.

### The web UI mock source

- **Location:** `argus-webui/src/app.ts:16-99`, `argus-webui/src/transport/mockSource.ts`,
  `argus-webui/src/dev/fixtures/events.ts`
- **Relevance:** How the screenshots get presentable data. `app.ts:26-38` selects the mock
  source when `?simulate=` is explicit even when the page is served over http, so the built
  bundle can be driven against `FIXTURE_EVENTS` with no server. `?simulate=off` means "no
  scripted reconnect", not "no mock" — it still replays the fixtures, at speed 4.

## What is being replaced

### The design canvas exports

- **Location:** `design_handoff_argus_inspector/Argus Inspector.html`, and the four
  `docs/ui/*.png` exported from it
- **Relevance:** The current README images. The artboard labels (`Inspector · Waterfall`,
  `Inspector · List only + Jump-to-latest pill`) and sizes (1360×860 / 1360×720, exported at
  2x) identify the source; `waterfall.png` still shows the artboard chrome and a clipped
  second panel.
- **Why not re-export:** `design_handoff_argus_inspector/argus/` has no splitter or drag
  handling anywhere, and its last commit predates #31 and #28. Re-exporting would still show
  the old fixed list pane. The design handoff remains the design source of truth — it is just
  not a source of screenshots of shipped behaviour.

## Upstream

### vanniktech gradle-maven-publish-plugin 0.33.0

- **Location:** `~/.gradle/caches/modules-2/files-2.1/com.vanniktech/gradle-maven-publish-plugin/0.33.0/`
  (sources jar)
- **Relevance:** Where the manual-Publish finding was verified rather than guessed.
  `MavenPublishBaseExtension.kt:69` shows `automaticRelease` defaulting to `false`;
  `SonatypeRepositoryBuildService.kt:135-137` shows `ReleaseAfterClose` only being queued when
  that flag is true; `MavenPublishBaseExtension.kt:178-183` shows
  `publishAndReleaseToMavenCentral` as the task that would queue it regardless.
- **Note for later:** both the flag and the task work through *end-of-build* actions, so
  neither depends on task ordering across the seven modules. That is what makes the one-line
  workflow fix safe when it is eventually taken.
