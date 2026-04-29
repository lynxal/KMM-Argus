# References for argus-readme

Verified source-of-truth files. Every code block in `README.md` is copied
verbatim from one of these.

## Sample-android integration (Installation §4)

| Snippet | File | Lines |
|---|---|---|
| Gradle dep | `sample-android/build.gradle.kts` | 84–86 (rewrite `projects.argusAndroid` → published coordinate) |
| `DebugTools` interface | `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt` | full file |
| Debug `DebugToolsImpl` | `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` | full file |
| Release `DebugToolsImpl` | `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` | full file (keep the leading invariant comment) |
| DI wiring | `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/SampleApp.kt` | full file |

## Configuration (§8)

| Item | File |
|---|---|
| `ArgusConfigBuilder` (public DSL) | `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusConfigBuilder.kt` |
| `ArgusConfig` defaults + `DEFAULT_REDACTED_HEADERS` | `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfig.kt` |

## Discoverability (§6)

| Item | File:line |
|---|---|
| `Argus listening on http://<ip>:<port>` logcat line | `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt:25` |
| `argus.url: StateFlow<String?>` exposure | `argus-android/.../ArgusHandle.kt` (the `_url` MutableStateFlow) |

## CI gate / Troubleshooting (§3, §11)

| Item | File:lines |
|---|---|
| `verifyReleaseHasNoArgus` Gradle task | `sample-android/build.gradle.kts:101–154` |
| Forbidden dex prefixes (`com/lynxal/argus/`, `io/ktor/server/`) | `sample-android/build.gradle.kts:91–98` |
| `releaseRuntimeClasspath` diagnostic | standard Android Gradle config; no project-specific reference needed |

## Module versions / minSdk (§2)

| Item | File:line |
|---|---|
| Library version `0.0.1` | `argus-android/build.gradle.kts:62` (`coordinates(...)`) |
| Library `minSdk = 24` | `gradle/libs.versions.toml` (`android-minSdk = "24"`) |

## Design prototype (§1, §7 visuals)

- Source HTML: `design_handoff_argus_inspector/Argus Inspector.html`
- Each view = a `<DCArtboard id="ab-...">`; the React component renders `data-dc-slot` on the wrapping div.
- Inspector frame inside each artboard has class `.argus-frame` — that's what we screenshot to avoid the artboard's label/padding chrome.
- Capture script: `scripts/capture-ui.mjs` (serves the folder over loopback HTTP to satisfy Babel's XHR origin requirement, then snapshots each `.argus-frame` via Playwright).
- Captured PNGs: `docs/ui/{hero,event-list,waterfall,filters}.png` (also copied to `visuals/` in this spec folder).

## Distribution-model wording (§3, §10)

- `agent-os/specs/2026-04-29-1500-argus-distribution/plan.md` — authoritative source for the seam-pattern explanation, the verifyReleaseHasNoArgus rationale, and the "no no-op shim by design" decision.
- `agent-os/product/mission.md` — pitch material for §1 (Stetho/Flipper/Chucker/Charles framing, KMP-ready, on-device server).
