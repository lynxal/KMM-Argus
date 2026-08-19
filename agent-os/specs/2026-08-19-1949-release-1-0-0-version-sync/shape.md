# Release 1.0.0 — version sync — Shaping Notes

## Scope

Cut Argus `1.0.0`. The version bump itself is one line; the work is that the
version was restated by hand in a dozen other places and those had already
drifted apart.

`gradle.properties:16` `argus.version` is documented as the single source of
truth and the seven module `coordinates(…)` calls really do read it. Nothing
else did. At the time of shaping the tree held four different "current
versions":

| Surface | Value |
|---|---|
| `gradle.properties:16` | `0.0.3` |
| `argus-android/build.gradle.kts:40` — `BuildConfig.ARGUS_VERSION` | `0.1.0` |
| `argus-ios/.../ios/AppInfoBuilder.kt:21` — `private const val ARGUS_VERSION` | `0.1.0` |
| `README.md` (11 coordinates + status row), `argus-webui/package.json`, `Package.swift`, `AGENTS.md:94` | `0.0.2` |
| Git tags | `0.0.1`, `0.0.2`, `0.0.3` |

`0.0.3` was tagged and no doc followed. The two hardcoded `0.1.0` values are a
real defect, not cosmetics: both `AppInfoBuilder`s feed `AppInfo.argusVersion`
into `GET /api/info` (`routes/Info.kt:28`) and the WebSocket `hello` frame
(`routes/Ws.kt:23`), so Argus reported a library version that was never
released. The `argus-ios` copy of that hardcode was not in issue #8 — it was
found while inventorying.

## Decisions

- **Version `1.0.0`**, tag `1.0.0` with **no `v` prefix**. All three existing
  tags are unprefixed; `Package.swift`'s `v0.0.2` was itself part of the bug.
- **One generated constant, via BuildKonfig.** `:argus-core` applies
  `com.codingfeline.buildkonfig` to generate `ArgusBuildKonfig.ARGUS_VERSION`
  from `argus.version`, exposed as a public object (`exposeObjectWithName`) so
  `:argus-android` and `:argus-ios` can read it — BuildKonfig generates an
  internal one by default. The Android `buildConfigField` and the iOS
  `private const val` are deleted, along with the now-dead
  `buildFeatures { buildConfig = true }`.

  A hand-rolled `GenerateArgusVersionTask` copying
  `argus-webui-bundle`'s `GenerateBundleTask` was built and working first; it was
  replaced with BuildKonfig because ~70 lines of build script for one string does
  not pay for itself when a maintained plugin does it in ten.

  **Pin the plugin to the release built against this repo's Kotlin.** `0.21.2`
  targets Kotlin 2.3.21 and is correct here. `0.22.0` targets 2.4.0, and because
  BuildKonfig is declared in the root `plugins {}` block its newer
  `kotlin-stdlib` reaches the shared buildscript classpath, where
  `:sample:lintVitalAnalyzeRelease` emits *"metadata is 2.4.0, expected 2.2.0"*
  and silently stops analysing while still reporting BUILD SUCCESSFUL.
- **Hand-written pins are gated, not generated.** Docs, `package.json`, and
  `Package.swift` cannot read a Gradle property, so a root `verifyVersionPins`
  task fails the build when any of them disagrees with `argus.version`. It also
  scans for a reintroduced `ARGUS_VERSION` literal or `buildConfigField`, which
  is what turns "we fixed the drift" into "the drift can't come back".
- **Wrong repo path fixed everywhere.** All 7 module POMs pointed `url`, `scm`,
  and `issueManagement` at `https://github.com/lynxal/argus`, which 404s. That
  metadata was about to ship to Maven Central with 1.0.0. Live files fixed;
  archived `agent-os/specs/**` left alone.
- **MIT LICENSE added.** `README.md` promised one "before `1.0.0`" and the POMs
  already declared MIT with a link to a file that did not exist.
- **SPM checksum lands after the release.** `swift package compute-checksum`
  runs in `publishToMavenCentral.yml` against the zip CI builds; a locally built
  zip would not be byte-identical, so a locally computed checksum would not
  match the published asset. `Package.swift` is tagged with the URL fixed and
  the placeholder intact, and the real checksum is committed to `main` once CI
  prints it. The gate deliberately does not validate the checksum.
- **Left alone:** the sample app's `0.0.1`; `ARGUS_SCHEMA_VERSION` (a separate
  wire-compat axis by design, `Schema.kt:9-10`); test fixtures at `0.1.0` and
  `0.2.1` — a fixture equal to the real version would mask a hardcoding bug;
  the dead `HelloPayload.serverVersion`, since populating it is a wire change.
- **Web UI now shows the version.** `websocketSource.ts` used to drop
  `argusVersion` on the floor, so nothing on screen could contradict the server's
  hardcoded `0.1.0` — fixing the backend alone would have been unverifiable from
  the UI. `DeviceInfo` now carries it and the TopBar renders `Argus (1.0.0)`.
  Both versions are parenthesised against their own label —
  `Argus (1.0.0)` and `com.lynxal.argus.sample (0.0.1) · Google Pixel 6` — because
  two bare numbers side by side gave no way to tell the library version from the
  host app's. The design avoided this by putting the version in a status bar that
  was never built; the parentheses solve it without adding one.
  Covered by `scripts/probe-webui/version-probe.js`.

- **Connection dot fixed in passing.** `.ds-conn-dot` sets `width`/`height` on a
  bare `<span>`, which `display: inline` ignores, so the TopBar's dot rendered
  0×0 and the pill's `gap-2` left dead space that read as off-centre text. The
  app's five other dots are direct flex children, which blockifies them, so only
  this one broke. Fixed with `display: inline-block` and asserted by measured box
  in the probe.

## Context

- **Visuals:** none provided. `design_handoff_argus_inspector/argus/Inspector.jsx:81`
  has an "Argus 1.0.0" chip, referenced only for the deferred follow-up.
- **References:** see `references.md`.
- **Product alignment:** `agent-os/product/tech-stack.md:14` already describes
  `argus.version` as the single source of truth. This change makes that
  description true, and drops the parenthetical version number from the doc so
  it stops needing a bump.

## Standards Applied

- `workflow/commit-conventions` — the only relevant standard. The other 16
  categories cover the parent Canvas app (BLE mesh, SignalR, Koin) and do not
  apply to a release-prep change.
