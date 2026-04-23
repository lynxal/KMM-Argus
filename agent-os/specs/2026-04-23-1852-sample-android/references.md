# References for `:sample-android`

## Similar Implementations

### KmmPermissions `:exampleApp`

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KmmPermissions/exampleApp/`
- **Relevance:** The user explicitly pointed to this as the module-shape reference.
- **Key patterns to borrow:**
  - Plugin block: `alias(libs.plugins.kotlinMultiplatform) + androidApplication + composeMultiplatform + composeCompiler`.
  - KMP source layout: `commonMain/`, `androidMain/` (no `iosMain/` for this module — Android only here).
  - `kotlin { androidTarget { compilerOptions { jvmTarget.set(JvmTarget.JVM_11) } } }` — we use `JVM_17` to match `:argus-core`.
  - `android { namespace; compileSdk from catalog; defaultConfig { applicationId, minSdk, targetSdk }; buildTypes { release { isMinifyEnabled = false } }; compileOptions { sourceCompatibility/targetCompatibility } }`.
  - `dependencies { debugImplementation(compose.uiTooling) }`.
  - `Application` class in `androidMain/kotlin/.../app/App.android.kt`.
  - `MainActivity : ComponentActivity` → `setContent { App() }`.
  - `AndroidManifest.xml` declares `android:name=".app.AndroidApp"` for the Application.
- **Key patterns we diverge from:**
  - KmmPermissions uses `expect val appInfoInstance: AppInfo` for platform seams. We use Android **build-variant** source sets (`androidDebug/`, `androidRelease/`) instead, because we need debug-vs-release isolation, not android-vs-ios isolation.
  - KmmPermissions has no debug-only dependency. We wire `androidDebug.dependencies { implementation(project(":argus-core")) }`.

## Consumed Argus APIs

### `ArgusEventBus` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEventBus.kt`

```kotlin
public interface ArgusEventBus {
    public fun publish(event: ArgusEvent)   // non-suspend
}
```

### `ArgusEvent` sealed hierarchy — `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`

- `@Serializable sealed interface ArgusEvent { id; timestamp; source }`.
- Subclasses (`@SerialName`-stamped, polymorphic `type` discriminator): `HttpEvent`, `LogEvent`, `CustomEvent`.
- Serialization: `Json.encodeToString(ArgusEvent.serializer(), event)`.

### Argus Ktor client plugin — `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`

```kotlin
install(Argus) {
    eventBus = bus
    maxBodyBytes = 262_144L    // Long, default 1_000_000L
    // redactHeaders, captureRequestBody, captureResponseBody available but left at defaults
}
```

### `ArgusLoggerDelegate` — `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt`

```kotlin
Logger.add(ArgusLoggerDelegate(bus))
```

## Consumed KMMLogging APIs (`com.lynxal.logging:logging:0.0.6`)

- `val Logger: LoggerInterface` — lazy singleton.
- Methods: `verbose/debug/info/warning/error { message = "..."; cause = ...; payload = mapOf(...) }`.
- `Logger.tag("<area>").debug(...)` for scoped tagging.
- `Logger.add(DebugLoggerImplementation())` — logcat sink shipped by the library.
- `Logger.minLevel: LogLevel` — defaults to `Debug`; sample sets to `Verbose` during install so the VERBOSE button fires.

## Related Argus Specs

- `agent-os/specs/2026-04-23-1430-argus-event-model/` — `ArgusEvent` schema (v1), `EventSource`, `Direction`, `HttpEvent/LogEvent/CustomEvent` fields.
- `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/` — plugin config surface and acceptance (p99 < 2 ms, 100-concurrent-request uniqueness, streaming safety).
- `agent-os/specs/2026-04-23-1800-argus-logging-delegate/` — delegate config (`minLevel`, `maxMessageLength`, `maxPayloadEntries`, `captureStackTraces`) and `LogDetails` -> `LogEvent` mapping.
