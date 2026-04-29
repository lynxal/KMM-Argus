# Feature: argus-readme — Generate root README.md

## Context

Argus is now publishable on Maven Central (commit `7ae05ef`) and the debug-only distribution gate is enforced by `:sample-android:verifyReleaseHasNoArgus`. The current root `README.md` (60 lines) is a terse module index. It does not explain the debug-only model prominently, walk a new integrator through the source-set seam pattern, or surface the UI. A new developer cannot integrate Argus from this README alone.

This task replaces it with a 12-section README that:

- Makes section 3 (Debug-Only Distribution Model) a prominent warning callout — this is the project's most load-bearing invariant.
- Copies all integration code samples **verbatim** from `:sample-android` so the docs can never drift from a passing CI build.
- Embeds visuals captured from `design_handoff_argus_inspector/Argus Inspector.html` via Playwright (the prototype is a runnable React+Babel page — we render it headless and snapshot each view).
- Targets <30 minutes for a new developer to integrate Argus end-to-end.

## Phase 1: Save spec documentation

Create `agent-os/specs/2026-04-29-1700-argus-readme/`:

- `plan.md` — copy of this plan
- `shape.md` — scope, decisions, AskUserQuestion answers (hero from design ref, Playwright-captured PNGs, Mermaid diagram)
- `references.md` — pointers to verified source-of-truth files (paths + line refs from exploration)
- `standards.md` — `agent-os/standards/index.yml` lookup; likely none of the engineering standards apply directly to docs, so this can be a short note ("no standards apply: documentation-only change").
- `visuals/` — final PNGs after Phase 2 (also copied to `docs/ui/` for the README to reference)

## Phase 2: Capture UI screenshots via Playwright

The HTML prototype is React with inline Babel — fully self-contained. Render headless at desktop size (≥1440×900) and capture each canonical view.

1. Install Playwright if absent (`npx playwright install chromium`). Use a one-shot Node script under `scripts/capture-ui.mjs`; do not commit a `node_modules` to the Argus repo — run via `npx`.
2. Open `file://.../design_handoff_argus_inspector/Argus Inspector.html`. Wait for the React app to mount (poll for the TopBar wordmark or a known DOM node).
3. Capture the views the README needs. The TopBar has a segmented view switcher — click each segment and snapshot:
   - `docs/ui/hero.png` — Split view, light theme, populated event list, one row selected (used in section 1 hero **and** section 7 walkthrough).
   - `docs/ui/event-list.png` — List view, full-width.
   - `docs/ui/detail-tabs.png` — Split view focused on the right detail pane (Headers or Response tab).
   - `docs/ui/waterfall.png` — Waterfall view.
   - `docs/ui/filters.png` — Split view with the FilterBar in an active state (a method or status filter toggled).
4. Trim/crop if necessary. Optimize PNGs with `pngquant` or accept raw output — README load time is not critical.
5. Verify each PNG renders correctly on GitHub by previewing locally (`gh pr create --draft` is not needed; `grip` or VS Code preview suffices).

If Playwright capture fails or quality is poor, fall back to TODO placeholders with the exact PNG paths reserved — README ships either way.

## Phase 3: Author `README.md`

Replace the current 60-line README with the 12 sections specified, using these verified sources verbatim (do not paraphrase code):

### Verified source-of-truth references

| Section | Content | Source |
|---|---|---|
| 4 step 2 | DebugTools interface | `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt` (full file, ~11 lines) |
| 4 step 3 | Debug DebugToolsImpl | `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (full file) |
| 4 step 4 | Release DebugToolsImpl | `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (full file — keep the leading invariant comment) |
| 4 step 5 | DI wiring | `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/SampleApp.kt` (the `onCreate` block) |
| 4 step 1 | Gradle dependency | `sample-android/build.gradle.kts:85` — but rewrite `projects.argusAndroid` → `"com.lynxal.argus:argus-android:0.0.1"` since external consumers use the published coordinate |
| 6 | Logcat line | `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt:25` — `Argus listening on http://<ip>:<port>` |
| 8 | ArgusConfig fields | `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusConfigBuilder.kt` (port, maxEvents, maxBodyBytes, redactHeaders, corsDevOrigins) plus defaults from `argus-server-core/.../ArgusConfig.kt` |
| 11 | Verify task name | `:sample-android:verifyReleaseHasNoArgus` — defined in `sample-android/build.gradle.kts:101-154` |

### Section-by-section content notes

1. **What is Argus** — pitch (one paragraph from `agent-os/product/mission.md` and the design handoff README intro). Hero: `docs/ui/hero.png`. Feature bullets: HTTP/WebSocket capture, structured logging, custom events, real-time push to web UI, redaction, debug-only safety.
2. **Status** — version `0.0.1` (read from `gradle.properties`/`build.gradle.kts`); platforms: Android (KMP-ready); min SDK from `sample-android/build.gradle.kts`. Verify before writing.
3. **⚠️ Debug-Only Distribution Model** — GitHub-flavored callout (`> [!WARNING]`) at the top, then the four bullets. State the gate task name (`./gradlew :sample-android:verifyReleaseHasNoArgus`).
4. **Installation — Android** — five steps, code blocks copied verbatim per the table above. Keep the `// Invariant:` comment from the release impl — it explains *why* the file looks the way it does.
5. **Optional: Staging Variant** — short. Note that staging is **consumer-side**: Argus does not define a staging build type. Pattern: add a `staging` build type to your app, then `stagingImplementation("com.lynxal.argus:argus-android:0.0.1")` and a `src/staging/.../DebugToolsImpl.kt` that mirrors the debug impl.
6. **Discovering the device** — describe `Argus listening on http://<host>:<port>` in logcat, plus direct IP entry in the desktop browser. Note the URL also exposed via `argus.url: StateFlow<String?>` for in-app overlays.
7. **UI walkthrough** — embed the four section-7 PNGs. For each, one-paragraph caption pulled from `design_handoff_argus_inspector/README.md` (event list rows, detail tabs, waterfall segments, filters). Mention `/`-to-search and `?`-help shortcut.
8. **Configuration reference** — table of `ArgusConfigBuilder` fields with defaults; brief redaction note (`DEFAULT_REDACTED_HEADERS` from `argus-core` — list the actual header names so users know what's stripped by default).
9. **Sample app** — pointer to `:sample-android` with the "clone, open, run" two-minute claim. Include the exact gradle command (`./gradlew :sample-android:installDebug`).
10. **Architecture** — Mermaid graph showing `argus-core ← argus-server-core ← argus-android ← consumer-app` with `argus-webui-bundle` as a runtime resource of `argus-server-core`. One-line module table (already in current README — reuse). Cross-link to section 3 for "why debug-only".
11. **Troubleshooting** — four sub-issues from the spec. For "Release APK contains Argus classes", point at the verifyReleaseHasNoArgus task and `./gradlew :app:dependencies --configuration releaseRuntimeClasspath` as the diagnostic.
12. **Contributing, license** — short. Verify license file at repo root before claiming one (currently no LICENSE file checked in; flag this if missing).

## Phase 4: Verify code samples match reality

Before marking done, run a literal-string check: for each code block in the new README, grep the matching source file to confirm the snippet appears verbatim. A small discrepancy (an extra import, a renamed param) silently breaks the "docs == reality" guarantee.

```
grep -F "<first line of snippet>" sample-android/src/.../<file>
```

Repeat for all six verbatim blocks.

## Phase 5: End-to-end verification

Acceptance check (from the user's spec):

1. **Render check** — preview README.md locally; confirm Mermaid renders, all PNGs load, callout box renders, table of contents (if added) links correctly.
2. **Cold-read walkthrough** — read it as a new developer would. Time how long it takes to copy the dependency line, both impls, and the wiring code into a fresh app. Should be under 30 minutes including reading the warnings.
3. **CI alignment** — the README references `:sample-android:verifyReleaseHasNoArgus` and `verifyRelease.yml`. Confirm both still exist and the task name matches.
4. **Section 3 prominence** — confirm the warning callout renders at the top of section 3 and is visually distinct from regular text on GitHub.

## Critical files

- `README.md` (rewrite)
- `docs/ui/*.png` (new directory; 5 captured images)
- `scripts/capture-ui.mjs` (new; Playwright capture script — keep it small and committed for repeatability)
- `agent-os/specs/2026-04-29-1700-argus-readme/{plan,shape,references,standards}.md` (new spec folder)

## Out of scope

- Authoring a full `CONTRIBUTING.md` — section 12 will link to it as a TODO if the file doesn't exist.
- Adding a `LICENSE` file — flag if missing; do not author one without explicit guidance.
- Implementing a `staging` build type in any module — staging stays a documented consumer-side pattern.
- Changing any code in `argus-*` modules or `:sample-android`. README is documentation-only.
