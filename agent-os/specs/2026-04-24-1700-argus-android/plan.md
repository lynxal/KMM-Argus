# `:argus-android` — Implementation Plan

## Context

`:argus-android` is the Android-facing facade over the already-shipped `:argus-server-core` embedded Ktor server. It exposes a non-suspending `Argus.start(context)` entry point, an `ArgusHandle` that owns the server lifecycle on a module-owned coroutine scope, and an `AppInfo` auto-derived from the Android `Context`. The `:sample-android` app is upgraded in place to consume the facade so engineers can verify the server end-to-end.

This replaces the scaffold `ConsoleEventBus` currently standing in for real capture in the sample's debug variant. The release variant remains argus-free.

### Locked decisions (confirmed via AskUserQuestion)

1. **No `actual class ArgusServer` in `:argus-android`.** It already lives at `argus-server-core/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`. The facade only wraps it.
2. **No `ChannelEventBus` re-declaration.** It lives in `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/bus/ChannelEventBus.kt` and is bound to `ArgusServer.eventBus` by server-core's actual.
3. **mDNS discovery dropped from this spec.** `com.lynxal.lantern:lantern-android:0.0.1` is discovery-only per its README and cannot register/advertise. No `:lantern-android` dependency, no `NsdManager`, no `NetworkCallback`. Acceptance criteria about `dns-sd -B _argus._tcp` and Wi-Fi-drop re-registration are removed. Engineers discover the URL via logcat and an in-app Compose `Text`.
4. **URL display via Compose `Text`** inside `SampleScreen` (the sample uses Compose Multiplatform; a `TextView` would break convention).
5. **No AI attribution in commits** (per `MEMORY.md`).

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-04-24-1700-argus-android/` with the canonical quintet matching `agent-os/specs/2026-04-24-1500-argus-server-core/`:

- `plan.md` — this full plan.
- `shape.md` — scope + locked decisions + open risks.
- `standards.md` — full text of the standards listed under "Standards applied" below.
- `references.md` — pointers to reference files studied.
- `visuals/` — empty for folder symmetry.

---

## Task 2: Register the module

Add to `settings.gradle.kts`:

```kotlin
include(":argus-android")
```

Typesafe accessor: `projects.argusAndroid`.

---

## Task 3: `argus-android/build.gradle.kts`

KMP with `androidTarget()` only — Android-only by design. Mirrors `argus-core/build.gradle.kts` shape minus the JVM/iOS targets.

```kotlin
plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
}

kotlin {
    androidTarget()
    sourceSets {
        androidMain.dependencies {
            api(projects.argusCore)
            api(projects.argusServerCore)
            implementation(libs.kotlinx.coroutines.core)
        }
        androidUnitTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.robolectric)
        }
    }
    compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }
}

android {
    namespace = "com.lynxal.argus.android"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
        buildConfigField("String", "ARGUS_VERSION", "\"0.1.0\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests { isIncludeAndroidResources = true } }
    kotlin { jvmToolchain((findProperty("jvm.version") as String).toInt()) }
}
```

`api(projects.argusCore)` + `api(projects.argusServerCore)` so consumers (sample-android) can resolve the types returned by the facade (`ArgusEventBus`, `AppInfo`, `ArgusConfig`) transitively.

Also add to `gradle/libs.versions.toml`:

```toml
[versions]
robolectric = "4.12.2"

[libraries]
robolectric = { group = "org.robolectric", name = "robolectric", version.ref = "robolectric" }
```

---

## Task 4: Facade API (all under `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/`)

### `Argus.kt`

```kotlin
public object Argus {
    public fun start(
        context: Context,
        configure: ArgusConfigBuilder.() -> Unit = {},
    ): ArgusHandle {
        val appInfo = AppInfoBuilder.from(context)
        val config = ArgusConfigBuilder(appInfo).apply(configure).build()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val server = ArgusServer(config)
        val handle = ArgusHandle(server, scope)
        scope.launch { server.start(); handle.onStarted() }
        return handle
    }
}
```

Non-suspending — returns immediately. Consumers access `handle.eventBus` synchronously because `ArgusServer.eventBus` is property-initialised in the `ArgusServer` constructor (see `argus-server-core/src/jvmAndAndroidMain/.../ArgusServer.kt:16`). Events published before bind land in the ring buffer and are replayed via `/api/events`.

### `ArgusHandle.kt`

```kotlin
public class ArgusHandle internal constructor(
    private val server: ArgusServer,
    private val scope: CoroutineScope,
) {
    public val eventBus: ArgusEventBus get() = server.eventBus

    private val _url = MutableStateFlow<String?>(null)
    public val url: StateFlow<String?> = _url.asStateFlow()

    internal fun onStarted() {
        val ip = LocalIp.firstIPv4() ?: "0.0.0.0"
        val u = "http://$ip:${server.boundPort}"
        _url.value = u
        Log.i("Argus", "Argus listening on $u")
    }

    public fun stop() {
        server.stop()
        scope.cancel()
        _url.value = null
    }
}
```

Decisions baked in:
- **Scope ownership**: module-owned `SupervisorJob + Dispatchers.Default`, not `ProcessLifecycleOwner`. Keeps dep surface minimal; `stop()` is explicit, matches `ArgusServer`'s contract.
- **URL as `StateFlow<String?>`**: starts `null`, flips once the port resolves. Sample renders it reactively.
- **Logcat via `android.util.Log.i`, not `Logger.tag("Argus").info`**: `Argus.start()` runs during `Application.onCreate()` *before* `installLogging()` wires KMMLogging delegates in the sample's flow. `Log` is infra-side and always works.

### `ArgusConfigBuilder.kt`

Builder lives only in `:argus-android`. Rationale: `ArgusConfig` in `:argus-server-core` is a pure data class with sensible defaults; Android specifically needs a builder because `appInfo` is auto-derived from `Context` and must not be caller-settable via this DSL.

```kotlin
public class ArgusConfigBuilder internal constructor(private val appInfo: AppInfo) {
    public var maxEvents: Int = 500
    public var maxBodyBytes: Long = 1_000_000L
    public var redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS
    public var corsDevOrigins: List<String> = listOf("http://localhost:5173")
    internal fun build(): ArgusConfig = ArgusConfig(
        appInfo, maxEvents, maxBodyBytes, redactHeaders, corsDevOrigins,
    )
}
```

### `AppInfoBuilder.kt`

```kotlin
internal object AppInfoBuilder {
    fun from(context: Context): AppInfo = AppInfo(
        pkg = context.packageName,
        versionName = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        }.getOrNull() ?: "unknown",
        device = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
        argusVersion = BuildConfig.ARGUS_VERSION,
    )
}
```

### `LocalIp.kt`

Startup snapshot, not observed. `NetworkInterface.getNetworkInterfaces()` → first non-loopback IPv4 that `isSiteLocalAddress`. No `ConnectivityManager`, no `NetworkCallback`. Wi-Fi change mid-session → restart the sample.

```kotlin
internal object LocalIp {
    fun firstIPv4(): String? {
        val ifaces = NetworkInterface.getNetworkInterfaces() ?: return null
        for (nif in ifaces) {
            if (nif.isLoopback || !nif.isUp) continue
            for (addr in nif.inetAddresses) {
                if (addr is Inet4Address && !addr.isLoopbackAddress && addr.isSiteLocalAddress)
                    return addr.hostAddress
            }
        }
        return null
    }
}
```

---

## Task 5: `:sample-android` upgrade

### 5a. `DebugTools` interface — swap `observeEventLog` → `observeArgusUrl`

```kotlin
interface DebugTools {
    fun buildHttpClient(): HttpClient
    fun installLogging()
    fun observeArgusUrl(): StateFlow<String?>
}
```

### 5b. `src/androidDebug/.../DebugToolsImpl.kt` (rewrite)

```kotlin
import com.lynxal.argus.android.Argus
import com.lynxal.argus.android.ArgusHandle
import com.lynxal.argus.ktor.Argus as ArgusPlugin  // avoids clash with facade object

class DebugToolsImpl(private val app: Application) : DebugTools {
    private val argus: ArgusHandle = Argus.start(app) { maxBodyBytes = 262_144L }

    override fun buildHttpClient(): HttpClient = HttpClient(CIO) {
        install(ArgusPlugin) {
            eventBus = argus.eventBus
            maxBodyBytes = 262_144L
        }
        install(ContentNegotiation) { json() }
    }

    override fun installLogging() {
        Logger.minLevel = LogLevel.Verbose
        Logger.add(DebugLoggerImplementation())
        Logger.add(ArgusLoggerDelegate(argus.eventBus))
    }

    override fun observeArgusUrl(): StateFlow<String?> = argus.url
}
```

### 5c. `src/androidRelease/.../DebugToolsImpl.kt` (update for new interface — must stay argus-free)

```kotlin
// Invariant: this file must not import anything from com.lynxal.argus.*
class DebugToolsImpl(@Suppress("unused") private val app: Application) : DebugTools {
    private val empty: StateFlow<String?> = MutableStateFlow(null).asStateFlow()
    override fun buildHttpClient(): HttpClient = HttpClient(CIO) { install(ContentNegotiation) { json() } }
    override fun installLogging() { Logger.add(DebugLoggerImplementation()) }
    override fun observeArgusUrl(): StateFlow<String?> = empty
}
```

### 5d. Delete scaffolds

- `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/ConsoleEventBus.kt`
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/debug/EventLogBuffer.kt`

### 5e. `MainActivity.kt` + `ui/App.kt` + `ui/SampleScreen.kt`

- `MainActivity.onCreate`: `App(httpClient = app.httpClient, argusUrl = app.debugTools.observeArgusUrl())`.
- `App(...)` signature: `(httpClient: HttpClient, argusUrl: StateFlow<String?>)`.
- `SampleScreen` adds an item at the top rendering `SelectionContainer { Text("Argus: $url", style = MaterialTheme.typography.bodySmall) }` when non-null.
- Remove the `EventTail` composable and the "Captured events (N)" header.

### 5f. `sample-android/build.gradle.kts`

Swap the existing `debugImplementation(project(":argus-core"))` line to:

```kotlin
dependencies {
    debugImplementation(compose.uiTooling)
    debugImplementation(projects.argusAndroid)
}
```

`debugImplementation` only — release cannot link the facade. Transitively brings `:argus-core` and `:argus-server-core` through the `api` declarations in Task 3.

### 5g. `AndroidManifest.xml`

No change. `INTERNET` + `ACCESS_NETWORK_STATE` already declared. If CIO bind-to-`0.0.0.0` triggers a cleartext warning in debug, add `android:usesCleartextTraffic="true"` to a debug-specific manifest at `sample-android/src/androidDebug/AndroidManifest.xml`; defer unless observed.

---

## Task 6: Tests

Minimum-viable. Server-core's existing `RoutesTest` and `WsTest` already prove the routes.

- `argus-android/src/androidUnitTest/kotlin/com/lynxal/argus/android/AppInfoBuilderTest.kt` — Robolectric `Application` context, assert pkg/versionName/device/argusVersion population.
- `argus-android/src/androidUnitTest/kotlin/com/lynxal/argus/android/ArgusConfigBuilderTest.kt` — defaults + overrides round-trip through `build()`.

No instrumentation tests in this spec.

---

## Critical files (new or modified)

**New in `:argus-android`:**
- `argus-android/build.gradle.kts`
- `argus-android/src/androidMain/AndroidManifest.xml`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/Argus.kt`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusHandle.kt`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusConfigBuilder.kt`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/AppInfoBuilder.kt`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/LocalIp.kt`
- `argus-android/src/androidUnitTest/kotlin/com/lynxal/argus/android/AppInfoBuilderTest.kt`
- `argus-android/src/androidUnitTest/kotlin/com/lynxal/argus/android/ArgusConfigBuilderTest.kt`

**Modified:**
- `settings.gradle.kts`
- `gradle/libs.versions.toml`
- `sample-android/build.gradle.kts`
- `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt`
- `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
- `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
- `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/MainActivity.kt`
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/ui/App.kt`
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleScreen.kt`

**Deleted:**
- `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/ConsoleEventBus.kt`
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/debug/EventLogBuffer.kt`

---

## Standards applied

- `kmp/module-boundaries` — `:argus-android` sits above `:argus-core` + `:argus-server-core`; one-way.
- `kmp/module-build-conventions` — version catalog, KTS, JVM 17 toolchain, `androidTarget()` KMP lib.
- `naming/package-structure` — `com.lynxal.argus.android`, one top-level declaration per file.
- `platform/init-and-di` — `Application.onCreate()` auto-init (sample already follows).
- `validation/logging-conventions` — KMMLogging for app code; `Log.i` only for the one bootstrap line where `Logger` isn't ready yet.
- `workflow/commit-conventions` — `feat:` prefix, imperative ≤72 chars, **no AI attribution**.

---

## Verification plan

```bash
./gradlew projects                                           # :argus-android appears
./gradlew :argus-android:assembleRelease
ls -lh argus-android/build/outputs/aar/                      # expect < 2.5 MB
./gradlew :argus-android:testDebugUnitTest
./gradlew :sample-android:installDebug
adb logcat -d -s Argus:I | tail -5                           # "Argus listening on http://<ip>:<port>"
URL=$(adb logcat -d -s Argus:I | grep 'Argus listening' | tail -1 | sed 's/.*listening on //')
curl -s "$URL/api/info" | jq .                               # AppInfo + schemaVersion:1
curl -s "$URL/api/events" | jq '.events | length'            # >0 after tapping actions
npx wscat -c "${URL/http:/ws:}/ws"                           # hello + live events
./gradlew :sample-android:assembleRelease
grep -r "import com.lynxal.argus\." sample-android/src/androidRelease sample-android/src/commonMain sample-android/src/androidMain --include='*.kt'  # empty
./gradlew build
```

---

## Open risks / deviations

1. **mDNS dropped** (lantern discovery-only; user confirmed "skip for now"). URL = IP:port.
2. **`actual class ArgusServer` NOT in `:argus-android`** — lives in server-core. The facade wraps.
3. **`ChannelEventBus` NOT re-declared** — exposed via `ArgusHandle.eventBus`.
4. **IP is a startup snapshot, not observed**. Wi-Fi change → restart.
5. **`Log.i` over `Logger.tag("Argus")`** for the one bootstrap line.
6. **`argusVersion` via local `BuildConfig.ARGUS_VERSION = "0.1.0"`.** Follow-up: promote to repo-root.
7. **Name clash**: `com.lynxal.argus.android.Argus` vs `com.lynxal.argus.ktor.Argus`. Mitigated with `import … as ArgusPlugin` in sample.
8. **`DebugTools.observeEventLog()` removed**; `EventLogBuffer` + `ConsoleEventBus` + `EventTail` deleted. Dogfood via web UI.
9. **Acceptance criteria changed**: dropped `dns-sd -B _argus._tcp` and Wi-Fi-drop recovery; added URL-in-logcat, URL-in-app, AAR-size gate, release-grep gate.
