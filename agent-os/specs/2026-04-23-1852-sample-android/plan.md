# Feature: `:sample-android` Validation Harness

## Context

Argus' capture side has landed in `:argus-core`:

- **Ktor client plugin** `val Argus` with `ArgusClientConfig { eventBus, maxBodyBytes, redactHeaders, captureRequestBody, captureResponseBody }` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/`.
- **KMMLogging delegate** `ArgusLoggerDelegate(bus, ArgusLoggerConfig)` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/`.
- **Event model** `sealed interface ArgusEvent` with `HttpEvent`, `LogEvent`, `CustomEvent` polymorphic `@Serializable` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`.
- **Sinks** `ArgusEventBus { publish(event: ArgusEvent) }` (non-suspend), `NoopEventBus` default.

Neither piece has been exercised end-to-end against a real HttpClient yet. There is no server bus, no web UI, no mDNS. Before any of those land, we need a runnable harness that proves the capture path is wired correctly and — critically — that the integration pattern keeps all Argus code out of the release APK from day one.

This module ships that harness. It also locks in the **`DebugTools` variant-seam pattern** that every future Argus consumer will follow: a shared interface in `androidMain`, a real impl in `androidDebug` that installs the Argus plugin and the logger delegate, and a no-op impl in `androidRelease` that has zero `com.lynxal.argus.*` imports. Getting the seam right now means later work (argus-android, mDNS, webui) just swaps `ConsoleEventBus` for the real `ArgusServer` bus without touching the pattern.

The user referenced `../KmmPermissions/:exampleApp` for structure. We match its KMP + Compose Multiplatform + plugin-alias + version-catalog patterns, but narrow to `androidTarget()` only (spec is Android-only; iOS target can be added later when the server needs it). The variant seam is Android-native: `src/androidDebug/` + `src/androidRelease/` sourcesets, wired via `androidDebug.dependencies { implementation(project(":argus-core")) }`.

## Recommended approach

**Module:** `:sample-android`, KMP + `com.android.application` + Compose Multiplatform.
- Plugins: `kotlinMultiplatform`, `androidApplication`, `composeMultiplatform`, `composeCompiler`, `kotlinSerialization`.
- Targets: `androidTarget()` only.
- Namespace / applicationId: `com.lynxal.argus.sample`. minSdk 24, target/compile 36.
- Variants: debug + release. No staging.

**Variant seam** (the load-bearing pattern):

| Sourceset | Contains | Imports `com.lynxal.argus.*`? |
|---|---|---|
| `commonMain` | Compose UI, `EventLogBuffer`, screen composables | No |
| `androidMain` | `SampleApp : Application`, `MainActivity`, `DebugTools` interface | No |
| `androidDebug` | `DebugToolsImpl` (installs Argus plugin + delegate), `ConsoleEventBus` | **Yes** |
| `androidRelease` | `DebugToolsImpl` (no-op, CIO client only, only `DebugLoggerImplementation`) | **No** |

`DebugTools` interface exposes only `buildHttpClient(): HttpClient`, `installLogging()`, and `observeEventLog(): StateFlow<List<String>>` — none of these reference Argus types, so the interface itself is safe in release.

**Dependencies:** see `gradle/libs.versions.toml` and `sample-android/build.gradle.kts` after landing.

**Ktor config in `androidDebug` DebugToolsImpl:**

```kotlin
HttpClient(CIO) {
    install(Argus) {
        eventBus = bus
        maxBodyBytes = 262_144L   // 256 KB — smaller than default 1 MB
    }
    install(ContentNegotiation) { json() }
}
```

**`ConsoleEventBus`** (debug-only, temporary — replaced by `ArgusServer`'s `ChannelEventBus` in a later prompt):

```kotlin
class ConsoleEventBus(
    private val tag: String,
    private val sink: EventLogBuffer,
) : ArgusEventBus {
    private val json = Json { prettyPrint = false; ignoreUnknownKeys = true }
    override fun publish(event: ArgusEvent) {
        val line = json.encodeToString(ArgusEvent.serializer(), event)
        Log.d(tag, line)
        sink.append(line)
    }
}
```

**`EventLogBuffer`** (commonMain — shared UI state, works in release where it just stays empty):

```kotlin
class EventLogBuffer(private val capacity: Int = 100) {
    private val _events = MutableStateFlow<List<String>>(emptyList())
    val events: StateFlow<List<String>> = _events.asStateFlow()
    fun append(line: String) { /* bounded queue, emit latest N */ }
}
```

**UI** (Compose, `commonMain`): single scrollable screen with `Scaffold` → `LazyColumn`:
- Title "Argus Sample"
- HTTP buttons: `GET /users/1`, `GET /posts`, `GET image (200x200)`, `GET failing host`
- Divider
- Log buttons: VERBOSE / DEBUG / INFO / WARN / ERROR (+throwable)
- Divider
- In-app tail: monospace `Text` showing the latest N events.

HTTP requests launched via `rememberCoroutineScope()`; each button uses the shared `HttpClient` on `SampleApp`. Log emissions call `Logger.verbose/debug/info/warning/error { message = "..."; payload = mapOf("source" to "sample", "action" to "<button>") }`; the ERROR variant also sets `cause = RuntimeException("sample error", IllegalStateException("inner cause"))`. Logger's default `minLevel = Debug` is lowered to `Verbose` during `installLogging()` so the VERBOSE button actually fires.

**Critical files:**

```
sample-android/
├── build.gradle.kts
├── src/
│   ├── commonMain/kotlin/com/lynxal/argus/sample/
│   │   ├── ui/App.kt
│   │   ├── ui/SampleScreen.kt
│   │   ├── ui/SampleActions.kt
│   │   └── debug/EventLogBuffer.kt
│   ├── androidMain/kotlin/com/lynxal/argus/sample/
│   │   ├── SampleApp.kt
│   │   ├── MainActivity.kt
│   │   └── debug/DebugTools.kt
│   ├── androidMain/AndroidManifest.xml
│   ├── androidMain/res/values/strings.xml, themes.xml
│   ├── androidDebug/kotlin/com/lynxal/argus/sample/debug/
│   │   ├── DebugToolsImpl.kt
│   │   └── ConsoleEventBus.kt
│   └── androidRelease/kotlin/com/lynxal/argus/sample/debug/
│       └── DebugToolsImpl.kt        # ZERO com.lynxal.argus.* imports
```

**Repo-level changes:**
- `settings.gradle.kts`: `include(":sample-android")`.
- `gradle/libs.versions.toml`: plugin aliases `androidApplication`, `composeMultiplatform`, `composeCompiler`; library aliases for `ktor-client-cio`, `ktor-client-content-negotiation`, `ktor-serialization-kotlinx-json`, `androidx-activity-compose`, `androidx-lifecycle-viewmodel`, `androidx-lifecycle-runtime-compose`.
- Root `build.gradle.kts`: `apply(false)` for the three new plugins.

## Tasks

### Task 1 — Save spec documentation
`agent-os/specs/2026-04-23-1852-sample-android/` with `plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/`.

### Task 2 — Version catalog + root registration
See "Repo-level changes" above.

### Task 3 — Module `build.gradle.kts`
KMP + `com.android.application` + Compose Multiplatform, `androidTarget()` only, sourceset dependencies including `androidDebug.dependencies { implementation(project(":argus-core")) }`.

### Task 4 — AndroidManifest, theme, strings
Manifest wires `.SampleApp` + `.MainActivity` with LAUNCHER. Theme based on `Theme.Material3.DayNight.NoActionBar`.

### Task 5 — DebugTools, SampleApp, MainActivity, EventLogBuffer
As specified above.

### Task 6 — androidDebug: DebugToolsImpl + ConsoleEventBus
As specified above.

### Task 7 — androidRelease: no-op DebugToolsImpl
`HttpClient(CIO)` + `ContentNegotiation { json() }`; `Logger.add(DebugLoggerImplementation())`; empty `observeEventLog()`. Zero `com.lynxal.argus.*` imports.

### Task 8 — Compose UI (`commonMain`)
As specified above.

### Task 9 — Validation
**Debug build**
- `./gradlew :sample-android:assembleDebug`.
- Install on emulator or device.
- Tap each of 4 HTTP buttons → `adb logcat -s Argus:D` shows 4 `HttpEvent` lines; 3 have `response`, 1 has `error`.
- Tap each of 5 log buttons → 5 `LogEvent` lines at correct levels; ERROR has `throwable` with nested cause chain.
- In-app tail reflects the same.

**Release build**
- `./gradlew :sample-android:assembleRelease`.
- Informal APK check: `apkanalyzer dex packages sample-android/build/outputs/apk/release/*.apk | grep com.lynxal.argus` → zero matches.

**Acceptance**
- Both variants build.
- Debug: every button emits a correctly serialized event on `Argus` tag.
- Release APK: `apkanalyzer` finds no `com.lynxal.argus.*` packages.
- < 30s cold-launch → first event.

## Upgrade path (not this prompt)
- **Prompt 10** replaces `ConsoleEventBus` with `ArgusServer`'s `ChannelEventBus`; sample becomes mDNS-discoverable, curl-inspectable.
- **Prompt 7** adds the webui for browser inspection.
- **Prompt 11** promotes the `apkanalyzer` release check to a CI gate.
