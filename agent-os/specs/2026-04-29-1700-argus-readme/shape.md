# argus-readme — Shaping Notes

## Scope

Replace the 60-line root `README.md` with a comprehensive 12-section developer-onboarding doc. A new integrator should be able to wire Argus into an Android app in under 30 minutes using only the README.

## Decisions

- **Section 3 is a GitHub `> [!WARNING]` callout.** The debug-only invariant is the project's most load-bearing rule; it gets visual weight, not just prose.
- **All integration code blocks are copied verbatim from `:sample-android`.** Docs and reality cannot diverge — the sample is gated by `:sample-android:verifyReleaseHasNoArgus` in CI, so anything that builds in the sample is guaranteed correct in the README.
- **Sample dependency line is rewritten for external consumers.** The sample uses `debugImplementation(projects.argusAndroid)` (project ref); the README shows `debugImplementation("com.lynxal.argus:argus-android:0.0.1")` (Maven Central coordinate). Everything else is verbatim.
- **Visual assets are captured from the design prototype, not the live app.** `design_handoff_argus_inspector/Argus Inspector.html` is a React+Babel page that renders every Inspector view as a labeled `DCArtboard`. We snapshot each via Playwright to PNG. Rationale: the live app on a connected device would require capturing live traffic in just the right state for marketing-quality images; the prototype is already pixel-perfect and reproducible from `scripts/capture-ui.mjs`.
- **Mermaid for the architecture diagram.** Renders natively on GitHub, editable as plain markdown.
- **Staging is documented as a consumer-side pattern only.** Argus does not define a `staging` build type; we describe the pattern (add `staging` build type, `stagingImplementation`, `src/staging/.../DebugToolsImpl.kt`) but ship no module-side support.
- **Hero image reuses `hero.png` for both section 1 and section 7's detail-tabs caption.** The split view shows both event list and detail pane (with tabs visible) — one image carries both captions.

## Context

- **Visuals provided:** Five PNGs captured from the design prototype, stored in `docs/ui/`:
  - `hero.png` — Inspector split view (event list + detail pane with tabs and JSON body)
  - `event-list.png` — Inspector list-only view, full width
  - `waterfall.png` — Waterfall view with timing tracks
  - `filters.png` — Filter popover open showing active filter state
  Capture is reproducible: `node scripts/capture-ui.mjs` (Playwright + a tiny in-script static server, since Babel-standalone XHR-fetches `*.jsx` and Chrome blocks that from `file://` origin).
- **References studied:**
  - `sample-android/src/{androidMain,androidDebug,androidRelease}/.../debug/` — DebugTools interface + both impls
  - `sample-android/src/androidMain/.../SampleApp.kt` — DI wiring (`onCreate`)
  - `sample-android/build.gradle.kts` — debug-only Gradle dep + `verifyReleaseHasNoArgus` task
  - `argus-android/.../ArgusConfigBuilder.kt` + `argus-server-core/.../ArgusConfig.kt` — config DSL and defaults
  - `argus-android/.../ArgusHandle.kt:25` — `Argus listening on $bound` logcat line
  - `agent-os/specs/2026-04-29-1500-argus-distribution/plan.md` — authoritative source for the distribution model wording
  - `agent-os/product/mission.md` — pitch material (Stetho/Flipper/Chucker/Charles framing)
  - `design_handoff_argus_inspector/README.md` — UI walkthrough captions (event row anatomy, detail tabs list, waterfall segments, filter pills)
- **Product alignment:** Mission frames Argus as a Ktor-native, KMP-ready, debug-only inspector. The README's section 1 pitch and section 3 debug-only callout reflect this directly.

## Standards Applied

- No engineering standards from `agent-os/standards/index.yml` apply to this work — the change is documentation-only. (Standards there cover analytics, architecture, persistence, ui-navigation, etc. — none govern README structure.)

## Out of Scope

- Authoring `CONTRIBUTING.md`. Section 12 will link to it as a TODO if absent.
- Authoring a `LICENSE` file. None exists at repo root today; the README will note this rather than invent a license.
- Adding any `staging` wiring to `argus-*` modules. Staging stays a documented consumer-side pattern.
- Modifying any Kotlin source. README is documentation-only.
