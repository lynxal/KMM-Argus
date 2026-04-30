# Documentation & Code Quality Audit (§6.9, §6.10)

Scope: §6.9 (Documentation), §6.10 (Code quality), with awareness of §5.9. Static
review only; coverage % runs are flagged `unverified — requires runtime`.

## §6.9 Documentation

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.9.1 | `README.md` exists at repo root | PASS | `/Users/vardan.kurkchiyan/AndroidStudioProjects/argus/README.md` (534 lines) |
| 6.9.2 | Prominent debug-only warning callout | PASS | `README.md:25-34` — H2 "Debug-Only Distribution Model" + `> [!WARNING]` GFM callout |
| 6.9.3 | Code samples reference real classes/methods (compiles **unverified — requires fresh-module build**) | PARTIAL | Samples reference real types (see walkthrough); 3 named imports in the iOS Step 3 snippet diverge from sample code: `fireOkHttpCall` / `fireUrlConnectionCall` / `fireCorrelatedPair` overrides are listed but `publishCustom` is omitted; sample's enabled impl actually overrides only `buildHttpClient`, `installLogging`, `observeArgusUrl` (`sample/src/iosArgusEnabledMain/.../DebugToolsImpl.kt`) — code as printed will not compile against the real `DebugTools` interface |
| 6.9.4 | Samples match `:sample` exactly or have annotated divergence | FAIL | Multiple silent divergences (see "Code samples vs sample app diff"). The README claims "Every code block below is copied verbatim from `:sample`" (`README.md:38`, `README.md:195`); this is not true |
| 6.9.5 | Troubleshooting covers the three named scenarios | PASS | `README.md:508-528` — "Can't connect from desktop" (§12.1, 4 sub-causes), "Release build fails to compile / link" (§12.2), "Release APK contains Argus classes" (§12.3) |
| 6.9.6 | Configuration reference covers all `ArgusConfig` options | FAIL | README §9 (`README.md:436-455`) documents `port`, `maxEvents`, `maxBodyBytes`, `redactHeaders`, `corsDevOrigins` only. `ArgusConfig` (`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfig.kt:27-50`) and `ArgusConfigBuilder` (`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfigBuilder.kt:14-30`) also expose `persist`, `persistMaxSizeMb`, `persistMaxAgeDays` — undocumented in the README. The Ktor plugin's `fullBodyHosts` (`argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt:21`) is also undocumented |

### README walkthrough

- **§1 Hero / pitch** (`README.md:1-13`) — fine, includes a missing-image link to `docs/ui/hero.png` (referenced four times: §1, §8 event-list, §8 filters, §8 waterfall — these PNGs may or may not exist; not load-bearing for this slice).
- **§2 Status table** (`README.md:14-23`) — version `0.0.1`, Kotlin 2.2.0, Ktor 3.2.0. Did not cross-check the build files for this audit slice.
- **§3 Debug-only distribution** (`README.md:25-34`) — strong, prominent warning. Satisfies 6.9.2.
- **§4 Android install** (`README.md:36-191`) — five steps, all with code blocks. Diverges from sample (see below).
- **§5 iOS install** (`README.md:193-385`) — five steps, ends with iOS gate description. Diverges from sample.
- **§6 Staging variant** (`README.md:386-394`) — narrative only, no code. OK.
- **§7 Discovering the device** (`README.md:396-414`) — accurate; matches `ArgusHandle.onStarted()` log line at `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt:25`.
- **§8 UI walkthrough** (`README.md:416-434`) — feature description, 3 image links (`docs/ui/event-list.png`, `docs/ui/filters.png`, `docs/ui/waterfall.png`).
- **§9 Configuration reference** (`README.md:436-455`) — incomplete table. See 6.9.6.
- **§10 Sample apps** (`README.md:457-478`) — points to `:sample`; references `verifyReleaseHasNoArgus` and `verifyIosReleaseHasNoArgus`, which both exist (`sample/build.gradle.kts:136`, `sample/build.gradle.kts:206`).
- **§11 Architecture** (`README.md:480-506`) — Mermaid graph + module table. Module list does **not** mention `:argus-ios`, `:argus-okhttp`, `:argus-urlconnection` despite all three having sources on disk (`argus-ios/src/iosMain/kotlin/...`, `argus-okhttp/src/main/kotlin/...`, `argus-urlconnection/src/main/kotlin/...`).
- **§12 Troubleshooting** (`README.md:508-528`) — fine. See 6.9.5.
- **§13 Contributing & License** — license is "not yet declared" (`README.md:533`), which is acceptable pre-1.0 but worth noting.

### Code samples vs sample app diff

The README explicitly claims `verbatim` parity with `:sample` (`README.md:38`, `README.md:195`). Per-block:

| Block | README location | Sample location | Match? |
|---|---|---|---|
| `app/build.gradle.kts` deps | `README.md:44-49` | `sample/build.gradle.kts:?` | Not directly checked — the README only shows the deps line, not the whole file |
| `DebugTools` interface | `README.md:60-71` | `sample/src/commonMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt:1-27` | **Diverges**. README shows 3 methods (`buildHttpClient`, `installLogging`, `observeArgusUrl`); sample defines 7 (adds `publishCustom`, `fireOkHttpCall`, `fireUrlConnectionCall`, `fireCorrelatedPair`). All four extras are Phase 3 features; not annotated in the README |
| Android debug `DebugToolsImpl` | `README.md:79-120` | `sample/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt:1-121` | **Diverges**. Real impl has additional fields (`ioScope`, `okHttpClient`, `ktorClient`) and override implementations for the four Phase 3 methods. README's verbatim claim is false |
| Android release `DebugToolsImpl` | `README.md:128-160` | `sample/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt:1-47` | **Diverges**. Real impl adds 4 no-op overrides for Phase 3 methods. README's invariant comment also reads `verifyReleaseHasNoArgus`; the actual sample's comment reads `:sample-android:verifyReleaseHasNoArgus` (`sample/src/androidRelease/.../DebugToolsImpl.kt:2`) — a stale `:sample-android` task path that no longer exists; the task is registered under `:sample` (`sample/build.gradle.kts:136`). The release-source-set comment points at a task that does not exist |
| `SampleApp` Application class | `README.md:168-188` | `sample/src/androidMain/kotlin/com/lynxal/argus/sample/SampleApp.kt` | Not directly diffed — likely diverges as `:sample` is a Compose-Multiplatform module and uses additional state for the UI |
| iOS `DebugToolsImpl` enabled | `README.md:254-291` | `sample/src/iosArgusEnabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` | **Diverges**. README shows `fireOkHttpCall`/`fireUrlConnectionCall` as `{ /* JVM-only */ }` overrides, which would only compile if the interface declared them — and the interface does declare them, so this part is consistent. README explicitly omits `publishCustom` and `fireCorrelatedPair` with the comment "…publishCustom and fireCorrelatedPair omitted; see :sample" (`README.md:289`) — that comment is honest but means the snippet, copy-pasted, will not compile against the real interface |
| iOS `DebugToolsImpl` disabled | `README.md:297-323` | `sample/src/iosArgusDisabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` | Likely **matches more closely** — both contain the four no-op overrides — but I did not byte-diff |
| Swift `iOSApp.swift` | `README.md:352-369` | `sample/iosApp/...` | Not checked |

**Bottom line on §6.9.4:** The README's "verbatim" claim is wrong. The Phase 3 methods are present in the real sample (which is healthy for a runnable demo of correlation, custom events, and the OkHttp/HttpURLConnection engines) but are stripped from the README. A new developer copying the README will get a `DebugTools` interface that the rest of the sample can't satisfy; if they then copy the rest of the sample they'll see compile errors until they reconcile.

### Troubleshooting completeness

| Scenario | Coverage |
|---|---|
| Cannot connect from desktop | PRESENT — `README.md:510-516`, four sub-causes (AP isolation, firewall, port conflict, IP changed) |
| Release build broken | PRESENT — `README.md:517` |
| Release APK contains Argus classes | PRESENT — `README.md:519-525` with both the verify task command and a diagnostic `gradle :app:dependencies` recipe |

### ArgusConfig reference completeness

| Config field | Defined at | Documented in README §9? |
|---|---|---|
| `port` | `ArgusConfig.kt:33`, `ArgusConfigBuilder.kt:25` | YES (`README.md:443`) |
| `maxEvents` | `ArgusConfig.kt:29`, `ArgusConfigBuilder.kt:14` | YES (`README.md:444`) |
| `maxBodyBytes` | `ArgusConfig.kt:30`, `ArgusConfigBuilder.kt:15` | YES (`README.md:445`) |
| `redactHeaders` | `ArgusConfig.kt:31`, `ArgusConfigBuilder.kt:16` | YES (`README.md:446`) |
| `corsDevOrigins` | `ArgusConfig.kt:32`, `ArgusConfigBuilder.kt:17` | YES (`README.md:447`) |
| `persist` | `ArgusConfig.kt:39`, `ArgusConfigBuilder.kt:28` | NO |
| `persistMaxSizeMb` | `ArgusConfig.kt:44`, `ArgusConfigBuilder.kt:29` | NO |
| `persistMaxAgeDays` | `ArgusConfig.kt:49`, `ArgusConfigBuilder.kt:30` | NO |
| `fullBodyHosts` (plugin-level) | `ArgusClientConfig.kt:21` | NO |
| `captureRequestBody` (plugin-level) | `ArgusClientConfig.kt:11` | NO |
| `captureResponseBody` (plugin-level) | `ArgusClientConfig.kt:12` | NO |

The README does not distinguish between server-side `ArgusConfig` (consumed by `Argus.start()`) and client-side `ArgusClientConfig` (consumed by `install(ArgusPlugin)`). The two have related but distinct surfaces; Spec §6.9.6 calls out `ArgusConfig` specifically.

## §6.10 Code quality

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.10.1 | No TODO/FIXME/HACK in shipped code | PASS | grep over `argus-core/src`, `argus-android/src`, `argus-server-core/src`, `argus-ios/src`, `argus-okhttp/src`, `argus-urlconnection/src`, `argus-webui-bundle/src` returns zero matches |
| 6.10.2 | Public API has KDoc | PARTIAL | Spot-check below — server-side has solid KDoc; the Android entry point and the Ktor plugin entry symbol both lack KDoc |
| 6.10.3 | No unused imports / commented-out code | PASS (heuristic) | No wildcard imports in commonMain; no `//\s+(val\|var\|fun\|class\|return)\s+` matches outside test sources. Static IDE-style unused-import detection requires running ktlint/detekt — flagged as `unverified` but no obvious cases found |
| 6.10.4 | Module-level README or KDoc package docs | FAIL | No `README.md` at any of the module roots (`argus-core/`, `argus-server-core/`, `argus-android/`, `argus-ios/`, `argus-webui-bundle/`, `argus-okhttp/`, `argus-urlconnection/`). No `package-info.java` style doc files. Some classes carry purpose docs (e.g. `ArgusConfigBuilder` describes its role) but no module-level overview exists outside of the root `README.md` §11 module table |
| 6.10.5 | Test coverage of the three named slices | PARTIAL FAIL | See below |
| 6.10.6 | No reflection in capture paths | PASS | `grep -rEn "kotlin\.reflect\|::class\.java\|Class\.forName"` in `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor` and `.../logging` returns zero hits. The plugin uses `this::class.simpleName` (`ArgusClientPlugin.kt:231`) for error classification — KClass, not Java reflection, no method/field lookup, no class loading; acceptable |
| 6.10.7 | No platform-specific code in `commonMain` of any KMP module | PASS | `grep -lEn "^import (java\.\|android\.)"` over `argus-core/src/commonMain`, `argus-server-core/src/commonMain`, `argus-webui-bundle/src/commonMain` returns no matches |
| 6.10.8 | No `runBlocking` in production paths | PASS | `runBlocking` appears only in `argus-core/src/jvmTest/...ArgusClientPluginConcurrencyTest.kt:14,23`, `argus-core/src/jvmTest/...ArgusClientPluginLatencyTest.kt:14,59`, `argus-server-core/src/jvmTest/...LoadTest.kt:10,35` — all test-only |

### TODO/FIXME/HACK scan

`grep -rEn "TODO|FIXME|HACK"` over all `:argus-*` `src/` trees: **zero matches.** Clean.

### KDoc coverage spot-check

Public API surface, sampled across `:argus-core` and `:argus-android`:

| Symbol | File:line | KDoc? |
|---|---|---|
| `object Argus` (Android entry) | `argus-android/.../Argus.kt:19` | NO |
| `Argus.start(context, configure)` | `argus-android/.../Argus.kt:20` | NO — no `@param`, no description of `ArgusHandle` lifecycle, no warning about debug-only |
| `class ArgusHandle` | `argus-android/.../ArgusHandle.kt:12` | NO |
| `ArgusHandle.eventBus` | `argus-android/.../ArgusHandle.kt:16` | NO |
| `ArgusHandle.url` | `argus-android/.../ArgusHandle.kt:19` | NO |
| `ArgusHandle.stop()` | `argus-android/.../ArgusHandle.kt:28` | NO |
| `class AndroidArgusDriverFactory` | `argus-android/.../db/AndroidArgusDriverFactory.kt:13` | not checked, but no obvious KDoc above class declaration in scan output |
| `val Argus: ClientPlugin<ArgusClientConfig>` (Ktor plugin entry) | `argus-core/.../ktor/ArgusClientPlugin.kt:33` | NO |
| `class ArgusClientConfig` | `argus-core/.../ktor/ArgusClientConfig.kt:7` | NO at class level (the `fullBodyHosts` property has KDoc; other props don't) |
| `class ArgusLoggerDelegate` | `argus-core/.../logging/ArgusLoggerDelegate.kt:37` | YES — thorough |
| `interface ArgusEventBus` | `argus-core/.../model/ArgusEventBus.kt:14` | YES |
| `object NoopEventBus` | `argus-core/.../model/NoopEventBus.kt:3` | not checked |
| `sealed interface ArgusEvent` | `argus-core/.../model/ArgusEvent.kt:16` | YES |
| `data class HttpEvent` | `argus-core/.../model/HttpEvent.kt:8` | NO |
| `class ArgusServer` | `argus-server-core/.../ArgusServer.kt:30` | YES — thorough, including `boundPort` and `start()`/`stop()` semantics |
| `data class ArgusConfig` | `argus-server-core/.../ArgusConfig.kt:27` | YES (class + persist trio) |
| `class ArgusConfigBuilder` | `argus-server-core/.../ArgusConfigBuilder.kt:13` | YES |
| `fun argusConfig(...)` | `argus-server-core/.../ArgusConfigBuilder.kt:52` | YES |

**Verdict:** `argus-server-core` and the `argus-core` model/logging packages are well-documented. The two highest-value entry points for new integrators — `Argus.start()` (the Android facade) and the Ktor `Argus` plugin val — have **no KDoc at all.** This is a usability gap: anything an IDE quick-doc shows when a new user types `Argus.start(...)` will be empty. Same for `ArgusHandle.url` / `eventBus` / `stop()`.

### Test coverage

Per-module commonTest inventory:

| Module | commonTest path | Files | Covers Ktor plugin via `MockEngine`? | Covers logger delegate via fake bus? |
|---|---|---|---|---|
| `:argus-core` | `argus-core/src/commonTest/kotlin/...` | 13 files (ktor plugin, logger delegate, model serialization, correlation) | YES — `ArgusClientPluginTest.kt`, `ArgusClientPluginCorrelationTest.kt`, `FullBodyHostsTest.kt` use Ktor `MockEngine` (file inspected; uses common-test sources). `RecordingEventBus.kt` is the fake bus | YES — `ArgusLoggerDelegateTest.kt`, `ArgusLoggerDelegateCorrelationTest.kt` |
| `:argus-server-core` | `argus-server-core/src/commonTest/kotlin/...` | 5 files (ring buffer, filter, protocol serialization) | n/a | n/a |
| `:argus-android` | `argus-android/src/androidUnitTest/kotlin/...` | 2 files (`AppInfoBuilderTest.kt`, `ArgusConfigBuilderTest.kt`) | — | — |

Findings against §6.10.5:

- `:argus-core/commonTest` covers Ktor plugin against `MockEngine` and logger delegate against a recording bus → **PASS**.
- `:argus-server-core/commonTest` does **NOT** cover routing via Ktor's test client. Routing tests exist only at `argus-server-core/src/jvmTest/kotlin/com/lynxal/argus/server/routes/RoutesTest.kt` and `WsTest.kt`. They are JVM-only, not multiplatform. Spec §6.10.5 specifies `commonTest` → **FAIL** (the tests exist; just not where the spec requires).
- `:argus-android` has **no** smoke test for `ArgusServer.start()` and `stop()`. The two unit tests exercise only the config builder and `AppInfoBuilder` (`argus-android/src/androidUnitTest/kotlin/com/lynxal/argus/android/AppInfoBuilderTest.kt`, `ArgusConfigBuilderTest.kt`). No `Argus.start(...).stop()` test exists in `argus-android/src/androidUnitTest/` or any instrumented `androidTest` directory (the latter is not present at all) → **FAIL**.

Test coverage **percentage** is `unverified — requires runtime` (need `./gradlew koverHtmlReport` or equivalent to compute).

### runBlocking / reflection / platform-in-commonMain scan

- `runBlocking` — three test-only matches across `:argus-core/jvmTest` and `:argus-server-core/jvmTest`. Zero in production. → PASS.
- `kotlin.reflect`, `::class.java`, `Class.forName`, `getDeclaredField`, `getDeclaredMethod`, `getMethod(` in capture paths (`argus-core/src/commonMain/kotlin/com/lynxal/argus/{ktor,logging}`) — zero matches. The only KClass usage is `this::class.simpleName` at `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:231` for naming the throwable in `HttpError`; this is metadata, not reflective dispatch. → PASS.
- `import java.` / `import android.` in any KMP module's `commonMain` — zero matches. → PASS.

## Notes & risks

1. **README "verbatim" claim is false.** §4 and §5 of the README each open with a sentence asserting the snippets are copied verbatim from `:sample` and gated by CI. The actual `:sample` code under `src/androidDebug/`, `src/androidRelease/`, `src/iosArgusEnabledMain/`, `src/iosArgusDisabledMain/`, and `src/commonMain/.../debug/DebugTools.kt` includes four Phase 3 methods (`publishCustom`, `fireOkHttpCall`, `fireUrlConnectionCall`, `fireCorrelatedPair`) that the README either drops or comments out with `…omitted; see :sample`. Recommend either (a) adding an explicit "Phase 3 demo methods omitted from this README — see `:sample`" callout once at the top of §4 / §5, or (b) splitting the Phase 1 minimal sample from the Phase 3 demo sample so the README's verbatim claim becomes true.

2. **Stale task path in release-source invariant comment.** `sample/src/androidRelease/.../DebugToolsImpl.kt:2` references `:sample-android:verifyReleaseHasNoArgus`. The actual task is `:sample:verifyReleaseHasNoArgus` (`sample/build.gradle.kts:136`). A user who copy-pastes the comment will write a misleading reference into their own codebase.

3. **§9 Configuration reference is incomplete.** Three persistence-related options (`persist`, `persistMaxSizeMb`, `persistMaxAgeDays`) are public on both `ArgusConfig` and `ArgusConfigBuilder` but appear nowhere in the README. The README also doesn't mention `ArgusClientConfig.fullBodyHosts` / `captureRequestBody` / `captureResponseBody`, all of which are public knobs on the install block. This conflicts with §6.9.6's "all `ArgusConfig` options".

4. **Module-level docs missing.** No `README.md` per module and no package-level KDoc files. The root README §11 has a module table but doesn't replace per-module orientation docs that a maintainer / consumer of an individual artifact would expect.

5. **KDoc gap on the Android entry point.** `Argus.start()` and `ArgusHandle` (the symbols a new integrator types first) have zero KDoc. By contrast, `ArgusServer`, `ArgusConfigBuilder`, and `ArgusLoggerDelegate` are well-documented. Recommend prioritizing KDoc on the Android facade and on the `Argus` Ktor plugin val (`argus-core/.../ktor/ArgusClientPlugin.kt:33`).

6. **`:argus-android` smoke test missing.** Spec §6.10.5 requires at least a smoke test for `ArgusServer.start()` and `stop()`. Only `AppInfoBuilderTest` and `ArgusConfigBuilderTest` exist. The server lifecycle is exercised on JVM via `:argus-server-core/jvmTest/.../RoutesTest.kt` (Ktor `testApplication`), but nothing exercises the Android facade end-to-end.

7. **Server routing tests live in `jvmTest`, not `commonTest`.** Spec §6.10.5 requires `:argus-server-core/commonTest` to cover routing via Ktor's test client. `RoutesTest.kt` and `WsTest.kt` are at `argus-server-core/src/jvmTest/`. Functionally equivalent (`testApplication` runs on the JVM regardless of source set), but it means an iOS-targeting CI run won't execute these tests. Recommend moving them to `commonTest` if Ktor's `testApplication` is multiplatform-available in the project's Ktor version.

8. **Phase 3 modules present.** `:argus-okhttp` and `:argus-urlconnection` exist on disk with sources and tests (`argus-okhttp/src/main/kotlin/...`, `argus-urlconnection/src/main/kotlin/...`). The audit spec §7 lists these as Phase 3 (deferred). Out of scope for this audit slice but flagged for the architectural-compliance reviewer.

9. **Image assets referenced from README may or may not exist.** `docs/ui/hero.png`, `docs/ui/event-list.png`, `docs/ui/filters.png`, `docs/ui/waterfall.png` (`README.md:5,420,427,430`). `/docs` directory exists with a `ui` subdir; not byte-checked here. Broken images would degrade README quality but not violate any §6.9 item directly.

10. **Coverage % unverified.** Spec §6.10.5 enumerates required test surfaces but does not request a numeric coverage threshold. Coverage % via Kover or JaCoCo is `unverified — requires runtime` per the audit-depth setting.
