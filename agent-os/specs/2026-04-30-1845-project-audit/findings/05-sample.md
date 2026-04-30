# Sample App Audit (§6.8)

Module: `:sample` (KMP, Android + iOS — replaces former `:sample-android` per
commit `f6e4b5e feat: ship iOS support via :argus-ios + unified :sample app`).
Audit is static-only.

## §6.8 Verification

| Item   | Spec                                                              | Status         | Evidence |
|--------|-------------------------------------------------------------------|----------------|----------|
| 6.8.1  | Module installs on emulator + device via `installDebug`           | PASS (static)  | Valid Android application module: `sample/build.gradle.kts:77-112` (applicationId `com.lynxal.argus.sample`, minSdk 34, targetSdk from libs). Manifest at `sample/src/androidMain/AndroidManifest.xml`. Runtime install/launch unverified — flagged as such per audit instructions. |
| 6.8.2  | Buttons GET /users/1, GET /posts, GET image, GET failing host     | PASS           | `sample/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleScreen.kt:23-26,67-70`; wired to `SampleActions.onGet` → `HttpClient.get` at `sample/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleActions.kt:15-19`. The HttpClient comes from `DebugToolsImpl.buildHttpClient()` which installs the Argus Ktor plugin (debug variant only). |
| 6.8.3  | Failing-host URL is unreachable                                   | PASS           | `https://this-host-does-not-exist-argus-test.invalid/` — uses the reserved `.invalid` TLD (RFC 2606). `SampleScreen.kt:26`. |
| 6.8.4  | One log button per KMMLogging level w/ payload                    | PASS           | Five buttons VERBOSE/DEBUG/INFO/WARN/ERROR at `SampleScreen.kt:82-86`. Each routes through `SampleActions.onEmit` (`SampleActions.kt:21-47`) which builds a payload `mapOf("source" to "sample", "action" to action)` and dispatches via `Logger.tag("Argus sample")`. |
| 6.8.5  | ERROR log button includes synthetic throwable chain                | PASS           | `SampleActions.kt:41-45`: `cause = RuntimeException("sample error", IllegalStateException("inner cause"))` — a two-level chained throwable wired into the ERROR emission. |
| 6.8.6  | UI displays Argus URL on start                                    | PASS           | `SampleScreen.kt:39,56-65`: `argusUrl.collectAsState()` rendered as `Text("Argus: $bound")` inside a `SelectionContainer` (so engineers can copy it). The `StateFlow<String?>` plumbing originates in `ArgusHandle._url` (`argus-android/.../ArgusHandle.kt:18-19`) and is exposed by `DebugToolsImpl.observeArgusUrl()` (debug) / `MutableStateFlow(null).asStateFlow()` (release). |
| 6.8.7  | Logcat emits `Argus listening on http://<host>:<port>` at INFO    | PASS           | `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt:25`: `Log.i(LOG_TAG, "Argus listening on $bound")`. Tag is `"Argus"` (line 35). Format matches spec verbatim. |
| 6.8.8  | Release variant: zero Argus imports in `src/release/DebugToolsImpl` | PASS           | `sample/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`: imports only `android.app.Application`, `com.lynxal.logging.*`, `io.ktor.client.*` (CIO + ContentNegotiation + serialization-json), `kotlinx.coroutines.flow.*`. No `com.lynxal.argus.*` import. File is annotated with the seam invariant comment (lines 1-3). Build also enforces this: `verifyReleaseHasNoArgus` task (`sample/build.gradle.kts:128-187`) dexdumps the release APK and fails on any `Lcom/lynxal/argus/` (sample subpackage exempted) or `Lio/ktor/server/` descriptor. Release-build runtime verification unverified per audit instructions. |
| 6.8.9  | Release variant has functional buttons (seam doesn't leak)        | PASS           | UI in `commonMain` (`SampleScreen.kt`, `SampleActions.kt`, `App.kt`) consumes only the `DebugTools` interface and a generic `HttpClient`. The `MainActivity` (`sample/src/androidMain/.../MainActivity.kt`) instantiates `DebugToolsImpl` polymorphically through `SampleApp.debugTools: DebugTools` (`SampleApp.kt:9-18`). Release `DebugToolsImpl` returns a plain CIO HttpClient, an empty URL StateFlow, and no-op stubs for Phase-3 hooks — the GET buttons still fire HTTP requests (no capture); log buttons still emit through `Logger`/`DebugLoggerImplementation`; OkHttp / HttpURLConnection / Custom / Correlated-pair buttons silently no-op. |

## Interface seam

Three-file pattern:

- **Interface** — `sample/src/commonMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt`
  - `buildHttpClient(): HttpClient` — returns a Ktor client (Argus-instrumented in debug).
  - `installLogging()` — registers KMMLogging delegates.
  - `observeArgusUrl(): StateFlow<String?>` — surface for the URL banner.
  - `publishCustom(source, label, payload)` — Phase 3 CustomEvent hook.
  - `fireOkHttpCall(url)` — Phase 3 OkHttp demo.
  - `fireUrlConnectionCall(url)` — Phase 3 HttpURLConnection demo.
  - `fireCorrelatedPair(first, second)` — Phase 2 correlation demo.
  - Imports: `io.ktor.client.HttpClient`, `kotlinx.coroutines.flow.StateFlow`. Zero `com.lynxal.argus.*`.
- **Debug impl** — `sample/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (122 lines)
  - Calls `Argus.start(app)` (port 8787, maxBodyBytes 256 KiB) → produces `ArgusHandle`.
  - Builds Ktor client with `install(ArgusPlugin)`.
  - Builds OkHttp client with `ArgusOkHttpInterceptor`.
  - HttpURLConnection wrapped via `ArgusUrlConnection.wrap(...)`.
  - `installLogging` registers `DebugLoggerImplementation` + `ArgusLoggerDelegate`.
  - Correlated pair uses `withCorrelation { ... }` (from `:argus-core`).
- **Release impl** — `sample/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (47 lines)
  - Plain CIO Ktor client (no Argus plugin).
  - `installLogging` registers only `DebugLoggerImplementation`.
  - Argus URL is a permanent null `StateFlow`.
  - Phase 3 hooks are explicit no-ops with comments.

**Symmetry check.** Same constructor signature `(app: Application)`, same six override methods, same return types. The `@Suppress("unused")` on the release `app` parameter is intentional and acceptable (the dependency is needed only by the seam itself). No methods missing or extra in the release variant.

**Zero-Argus-imports check on release.** Confirmed by inspection of imports (lines 5-15 of release impl) and additionally enforced by the dexdump-based `verifyReleaseHasNoArgus` Gradle task (`sample/build.gradle.kts:136-187`) which is wired into `tasks.named("check")` (lines 272-275). The forbidden-prefix list also blocks `Lio/ktor/server/`, catching transitive leaks.

**iOS seam.** `sample/src/iosArgusEnabledMain/.../DebugToolsImpl.kt` and `sample/src/iosArgusDisabledMain/.../DebugToolsImpl.kt` mirror the Android pair, selected at configuration time by the `argusEnabled` Gradle property (`sample/build.gradle.kts:15-16,58-69`). Counterpart `verifyIosReleaseHasNoArgus` task scans `Sample.framework` strings for forbidden Kotlin/Native symbol tokens (`sample/build.gradle.kts:206-270`).

## Button inventory

All buttons live in `sample/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleScreen.kt`.

| # | Label                                            | Trigger                          | Target / payload                                                                                                              |
|---|--------------------------------------------------|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| 1 | `GET /users/1`                                   | `actions.onGet(USERS_URL)`       | `https://jsonplaceholder.typicode.com/users/1` via Argus-Ktor client (debug) / plain CIO (release)                            |
| 2 | `GET /posts`                                     | `actions.onGet(POSTS_URL)`       | `https://jsonplaceholder.typicode.com/posts`                                                                                  |
| 3 | `GET image (200x200)`                            | `actions.onGet(IMAGE_URL)`       | `https://picsum.photos/200` (binary JPEG)                                                                                     |
| 4 | `GET failing host`                               | `actions.onGet(FAILING_URL)`     | `https://this-host-does-not-exist-argus-test.invalid/` (RFC 2606 reserved TLD — guaranteed unreachable)                       |
| 5 | `Correlated pair: /users/1 → /posts`             | `onCorrelatedPair(USERS_URL, POSTS_URL)` | Two sequential GETs inside `withCorrelation { ... }` plus three `Logger.tag("Argus sample").info` markers (debug only) |
| 6 | `Emit VERBOSE log`                               | `actions.onEmit(LogLevel.Verbose, ...)` | `logger.verbose { message="sample verbose"; payload=mapOf("source"→"sample","action"→...) }`                            |
| 7 | `Emit DEBUG log`                                 | `actions.onEmit(LogLevel.Debug, ...)`   | `logger.debug { message="sample debug"; payload=... }`                                                                |
| 8 | `Emit INFO log`                                  | `actions.onEmit(LogLevel.Info, ...)`    | `logger.info { message="sample info"; payload=... }`                                                                  |
| 9 | `Emit WARN log`                                  | `actions.onEmit(LogLevel.Warning, ...)` | `logger.warning { message="sample warning"; payload=... }`                                                            |
| 10 | `Emit ERROR log (with throwable)`               | `actions.onEmit(LogLevel.Error, ...)`   | `logger.error { message="sample error"; payload=...; cause=RuntimeException("sample error", IllegalStateException("inner cause")) }` |
| 11 | `Emit custom event`                             | `tools.publishCustom("sample","demo-event","Hello from the sample app")` (in `MainActivity.kt:18-23`) | `argus.eventBus.publishCustom(source, label, Direction.NONE, payload)` (debug) / no-op (release) |
| 12 | `OkHttp call: /users/1`                         | `tools.fireOkHttpCall(USERS_URL)`        | OkHttp client w/ `ArgusOkHttpInterceptor` → `https://jsonplaceholder.typicode.com/users/1`                          |
| 13 | `HttpURLConnection call: /posts`                | `tools.fireUrlConnectionCall(POSTS_URL)` | `ArgusUrlConnection.wrap(...)` around `HttpURLConnection` → `https://jsonplaceholder.typicode.com/posts`            |

Coverage of §6.8 button list is exact: four GET buttons (small JSON, larger JSON list, binary image, failing host) and five log buttons (one per KMMLogging level, ERROR with throwable chain). Phase 2 correlation and Phase 3 (Custom / OkHttp / HttpURLConnection) buttons are above and beyond the §6.8 minimum.

## URL surfacing

- Source of truth: `argus-android/src/androidMain/.../ArgusHandle.kt:18-19,21-26` exposes `url: StateFlow<String?>`; `onStarted` populates it with `"http://$ip:${server.boundPort}"`.
- Debug seam adapter: `sample/src/androidDebug/.../DebugToolsImpl.kt:72` — `override fun observeArgusUrl(): StateFlow<String?> = argus.url`.
- Release seam adapter: `sample/src/androidRelease/.../DebugToolsImpl.kt:18,30` — emits a permanent `null`.
- Wiring into UI: `sample/src/androidMain/.../MainActivity.kt:16` passes `tools.observeArgusUrl()` into `App(...)`.
- Render: `sample/src/commonMain/.../ui/SampleScreen.kt:39,56-65` — `val url by argusUrl.collectAsState(); url?.let { ... Text("Argus: $bound") ... }`. Wrapped in `SelectionContainer` for copy-paste. Hidden when null (release builds show no banner — correct).

## Logcat line

- Emitter: `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt:25` — `Log.i(LOG_TAG, "Argus listening on $bound")` where `LOG_TAG = "Argus"` (line 35) and `bound = "http://$ip:${server.boundPort}"`.
- Called by `onStarted()` (line 21), which is invoked from server-start path inside `:argus-android`. Format matches the spec wording verbatim. Level is INFO via `Log.i`.

## Phase 3 demo buttons

All three are wired correctly at the dependency, seam, and UI layers.

- **Module dependencies** — `sample/build.gradle.kts:114-120`:
  ```
  debugImplementation(compose.uiTooling)
  debugImplementation(projects.argusAndroid)
  debugImplementation(projects.argusOkhttp)
  debugImplementation(projects.argusUrlconnection)
  debugImplementation(libs.okhttp)
  ```
  All Argus modules and OkHttp itself are `debugImplementation` only — release builds will not see them.
- **OkHttp**: `androidDebug/.../DebugToolsImpl.kt:41-50` builds an `OkHttpClient` with `ArgusOkHttpInterceptor(argus.eventBus, ArgusOkHttpConfig().apply { maxBodyBytes = 262_144L })`. `fireOkHttpCall` (lines 83-91) executes the request on `Dispatchers.IO`-backed scope, swallows errors with `runCatching`. Correctly wired to `:argus-okhttp`.
- **HttpURLConnection**: `androidDebug/.../DebugToolsImpl.kt:93-107` calls `ArgusUrlConnection.wrap(raw, argus.eventBus, cfg)` around a freshly-opened `HttpURLConnection`, then `connect()` and reads bytes. Correctly wired to `:argus-urlconnection`.
- **CustomEvent**: `androidDebug/.../DebugToolsImpl.kt:74-81` calls `argus.eventBus.publishCustom(source, label, Direction.NONE, payload)` — uses the `:argus-core` extension. The MainActivity wires it with `source="sample"`, `label="demo-event"` (`MainActivity.kt:17-23`).
- **Release no-ops** at `androidRelease/.../DebugToolsImpl.kt:32-42` — three explicit empty bodies. Seam holds.

Note: §7 of the spec lists `:argus-okhttp`, `:argus-urlconnection`, and `ArgusEventBus.publishCustom(...)` as Phase 3 (deferred). They are now present and wired into the sample. This is consistent with recent commits `aeebc34 feat: add :argus-okhttp and :argus-urlconnection engine modules` and `16a2408 feat(sample): add custom, OkHttp, and HttpURLConnection demo buttons` — flagged for the phase-boundary auditor (`08-phase34.md`), not against §6.8.

## Notes & risks

- **Static-only verification.** Items 6.8.1, 6.8.7 (logcat at runtime), 6.8.8, 6.8.9 (release runtime) are static-clean but not exercised. Recommended next step: `./gradlew :sample:installDebug` then observe logcat for `Argus listening on http://...`, and `./gradlew :sample:assembleRelease :sample:verifyReleaseHasNoArgus`.
- **Sample minSdk divergence.** `sample/build.gradle.kts:86` pins `minSdk = 34` due to a D8 DEX-v40 issue with Ktor 3.2.x's context-parameter SimpleNames. The comment at lines 83-86 calls this out as harness-only. The library `:argus-core` still targets minSdk 24. Acceptable but worth tracking — if Ktor or D8 ships a fix, this should be reverted to keep parity with the library floor.
- **iOS unification.** The module is now `:sample` (not `:sample-android`); spec text in §3.1 / §4 / §5.8 / §6.3 / §6.8 still says `:sample-android`. Reviewer should treat this as a doc-debt item; the substantive contract (debug-only distribution, seam pattern, release zero-imports) is satisfied by the unified module via Gradle source-set splits and the `argusEnabled` flag for iOS.
- **`debugImplementation(libs.okhttp)`** — OkHttp is added only at debug. The OkHttp class objects are pulled via the Argus interceptor wiring; the release `DebugToolsImpl` does not import OkHttp. Correct, but means an engineer experimenting with OkHttp directly in `commonMain` would silently break the release build. Low risk.
- **Phase 3 features in MVP scope?** Per §7 the OkHttp, HttpURLConnection, and CustomEvent buttons are deferred features. Their presence here is consistent with the scope creep flagged in `08-phase34.md`. Within §6.8 itself there is no requirement violated — just an extension beyond the minimum.
- **Throwable chain depth.** ERROR-log throwable is two levels (`RuntimeException` → `IllegalStateException`). Spec §6.8 only requires "synthetic throwable chain"; this satisfies it. Capture-side cause-chain recursion (§6.2) needs to be verified separately.
- **Buttons rendered inside a `LazyColumn`.** No accessibility labels beyond the visible `Text(label)`; acceptable for a developer-facing harness.
- **No tests.** No `androidTest` or commonTest under `sample/`. Spec does not require tests in the sample, but a smoke test that constructs `DebugToolsImpl` (release) would catch future seam regressions cheaply.
