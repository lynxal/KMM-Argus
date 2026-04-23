# Argus Event Model — Plan

## Context

Argus is a Kotlin Multiplatform, Ktor-native, on-device HTTP + log inspector. The repo is currently a pure spec/planning project — `agent-os/` is populated but no Kotlin code, Gradle files, or modules exist yet. This spec delivers the foundational **event schema** that everything else in Argus consumes: the Ktor client plugin will emit `HttpEvent`s, the KMMLogging delegate will emit `LogEvent`s, `ArgusEventBus` will transport them, and `:argus-server-core` will serialize them over WebSocket to the web UI. Nothing in the system can land until this model is defined, stable, and wire-tested.

Per `agent-os/product/tech-stack.md`, the event schema lives in `:argus-core` — the base KMP module with targets `jvm, androidTarget, iosArm64, iosSimulatorArm64, iosX64` and zero internal dependencies. Because the module itself doesn't exist yet, this spec also bootstraps the minimum Gradle scaffolding needed to compile and test `:argus-core` standalone. Later specs will add the Ktor client plugin, the logging delegate, and the server modules on top.

Wire compatibility is tracked by a `schemaVersion` constant (`ARGUS_SCHEMA_VERSION = 1`), carried in a `HelloPayload` handshake DTO that the WS server will eventually send on connect. Defining the constant and the DTO here (not at the server layer) keeps the version bound to the schema it describes.

## Shaping decisions (confirmed with user)

1. **`LogLevel` source**: reuse from `com.lynxal.logging:logging` (KMMLogging). Do **not** define a local enum.
2. **Module scope**: scaffold `:argus-core` (Gradle + version catalog + build script) **and** add the event model in one landable spec.
3. **WS hello scope**: expose `ARGUS_SCHEMA_VERSION` **and** define a `HelloPayload` `@Serializable` DTO in `:argus-core`. Actual WS-route wiring is deferred to a later `:argus-server-core` spec.
4. **Polymorphic JSON discriminator**: default kotlinx.serialization `type` field (`{"type":"HttpEvent",...}`). Each sealed subclass carries a stable `@SerialName("HttpEvent" | "LogEvent" | "CustomEvent")` so renames don't break the wire.

## Spec folder

```
agent-os/specs/2026-04-23-1430-argus-event-model/
├── plan.md         # This file
├── shape.md        # Shaping notes + decisions above
├── standards.md    # Full content of the standards cited below
├── references.md   # Pointers to design fixture + tech-stack
└── visuals/        # (empty — no mockups for a model spec)
```

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-23-1430-argus-event-model/` and populate `plan.md`, `shape.md`, `standards.md`, `references.md`, and an empty `visuals/`.

## Task 2 — Bootstrap Gradle + `:argus-core` module

Create the following (none exist yet):

**Root files**
- `settings.gradle.kts`
  - Enable `TYPESAFE_PROJECT_ACCESSORS` feature preview
  - `rootProject.name = "argus"`
  - `include(":argus-core")`
  - `pluginManagement` + `dependencyResolutionManagement` with `gradlePluginPortal()`, `google()`, `mavenCentral()`, and the internal Lynxal Maven repo (for `com.lynxal.logging:logging`)
- `build.gradle.kts` (root) — declare all plugins with `apply false`: `kotlin.multiplatform`, `kotlin.plugin.serialization`, `android.library`
- `gradle.properties`
  - `jvm.version=17`
  - `android.compileSdk=36`, `android.targetSdk=36`, `android.minSdk=24` (per `tech-stack.md` divergence — **not** 26)
  - `useStaticFramework=true`
  - Standard memory args: `org.gradle.jvmargs=-Xmx8192M`, max workers 16
  - `kotlin.code.style=official`
- `gradle/libs.versions.toml`
  - `[versions]` — `kotlin`, `kotlinxCoroutines` (≥ 1.8), `kotlinxSerialization`, `agp`, `kmmLogging` (pin to the current published KMMLogging version; confirm at execution time)
  - `[libraries]` — `kotlinx-coroutines-core`, `kotlinx-serialization-json`, `lynxal-logging`
  - `[plugins]` — `kotlinMultiplatform`, `kotlinSerialization`, `androidLibrary`

**`argus-core/build.gradle.kts`**
- Plugins: `alias(libs.plugins.kotlinMultiplatform)`, `alias(libs.plugins.kotlinSerialization)`, `alias(libs.plugins.androidLibrary)`
- Targets: `jvm()`, `androidTarget { publishLibraryVariants("release") }`, `iosArm64()`, `iosSimulatorArm64()`, `iosX64()`
- iOS framework: `baseName = "argus-core"`, `isStatic = findProperty("useStaticFramework")?.toString()?.toBoolean() ?: true`
- `jvmToolchain(providers.gradleProperty("jvm.version").get().toInt())`
- `kotlin.compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }`
- Dependencies (commonMain only): `kotlinx-coroutines-core`, `kotlinx-serialization-json`, `com.lynxal.logging:logging`
- Dependencies (commonTest): `kotlin("test")`
- `android { namespace = "com.lynxal.argus.core"; compileSdk = 36; defaultConfig.minSdk = 24 }`

**Placeholder manifest** `argus-core/src/androidMain/AndroidManifest.xml` — empty shell required by `android.library`.

**Do not** add Ktor client, KMMLogging delegate wiring, or any other `:argus-core` concerns — those land in later specs.

## Task 3 — Event model files (commonMain)

Path: `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`

One file per top-level declaration. All types annotated `@Serializable`.

| File | Declaration |
|---|---|
| `Schema.kt` | `const val ARGUS_SCHEMA_VERSION = 1` + `@Serializable data class HelloPayload(schemaVersion = ARGUS_SCHEMA_VERSION, serverName = "argus", serverVersion: String? = null)` |
| `ArgusEvent.kt` | `sealed interface ArgusEvent { val id: String; val timestamp: Long; val source: EventSource }` |
| `EventSource.kt` | `@Serializable enum class EventSource { HTTP, LOG, CUSTOM }` |
| `Direction.kt` | `@Serializable enum class Direction { INBOUND, OUTBOUND, NONE }` |
| `HttpEvent.kt` | `@SerialName("HttpEvent") data class HttpEvent(...) : ArgusEvent` with `request`, `response?`, `error?`, `durationMs?` |
| `LogEvent.kt` | `@SerialName("LogEvent") data class LogEvent(...) : ArgusEvent` with `level: LogLevel` (from KMMLogging), `tag?`, `message`, `payload`, `throwable?` |
| `CustomEvent.kt` | `@SerialName("CustomEvent") data class CustomEvent(...) : ArgusEvent` with `sourceLabel`, `label`, `direction`, `payload`, `metadata` |
| `HttpRequest.kt` | `@Serializable data class HttpRequest(method, url, host, path, headers, bodyPreview?, bodyTruncatedTotalBytes?, contentType?, sizeBytes?)` |
| `HttpResponse.kt` | `@Serializable data class HttpResponse(statusCode, statusText, headers, bodyPreview?, bodyTruncatedTotalBytes?, contentType?, sizeBytes?)` |
| `HttpError.kt` | `@Serializable data class HttpError(throwableClass, message?, stackTrace)` |
| `ThrowableInfo.kt` | `@Serializable data class ThrowableInfo(className, message?, stackTrace, cause: ThrowableInfo? = null)` — recursive |
| `Header.kt` | `@Serializable data class Header(name, value, redacted: Boolean = false)` |

**KDoc** on `ArgusEvent`, `HelloPayload`, and `ARGUS_SCHEMA_VERSION`. The `why` for redaction, schema versioning, and the sealed hierarchy goes in KDoc; data fields get no comments.

## Task 4 — Event bus

Path: `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/`

- `ArgusEventBus.kt` — `interface ArgusEventBus { fun publish(event: ArgusEvent) }` with KDoc.
- `NoopEventBus.kt` — `object NoopEventBus : ArgusEventBus { override fun publish(event: ArgusEvent) = Unit }`.

No `@Serializable` here — the bus is a service, not a wire type.

## Task 5 — Serialization round-trip tests

Path: `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/`

| File | Coverage |
|---|---|
| `EventFactories.kt` | `createTestHttpEvent/LogEvent/CustomEvent/Header/ThrowableInfo` with defaulted params |
| `ArgusEventSerializationTest.kt` | Polymorphic round-trip for all three subtypes; `"type":"HttpEvent"` discriminator present; HttpEvent with `response=null/error=non-null` and vice versa; nested `ThrowableInfo.cause` round-trips; redacted Header preserves flag |
| `HelloPayloadSerializationTest.kt` | Default-constructed HelloPayload round-trips; schemaVersion defaults to ARGUS_SCHEMA_VERSION; explicit override also round-trips |
| `SchemaVersionTest.kt` | `assertEquals(1, ARGUS_SCHEMA_VERSION)` — guard against accidental bumps |

Shared `Json { encodeDefaults = true; classDiscriminator = "type" }`. No custom `SerializersModule` needed.

## Task 6 — Verify (acceptance)

```
./gradlew :argus-core:jvmTest
./gradlew :argus-core:iosSimulatorArm64Test
./gradlew :argus-core:testDebugUnitTest
```

All three pass → round-trip holds on JVM and native.

Manual checks:
- `ls argus-core/src/jvmMain argus-core/src/iosMain 2>/dev/null` → nothing (no platform-specific source sets)
- `grep -c ARGUS_SCHEMA_VERSION argus-core/src/commonMain` → ≥ 2
- `./gradlew :argus-core:assemble` → no internal-API warnings

## Out of scope

- Ktor client plugin (later spec)
- KMMLogging `ArgusLogDelegate` (later spec)
- `:argus-server-core`, WebSocket route, `expect class ArgusServer` (later spec)
- Ring buffer / query / filter logic (later spec)
- `:argus-android`, `:argus-webui`, `:argus-webui-bundle` (later specs)
- Publishing config, Maven coords, CI (later ops spec)
- Additional event subtypes beyond HTTP / Log / Custom
- Moving the event bus out of `com.lynxal.argus.model`

## Open risks (verify during implementation)

1. **KMMLogging `LogLevel` `@Serializable`?** If the library's enum isn't `@Serializable`, `LogEvent` won't compile. Fallback: `@Serializable(with = LogLevelSerializer::class) val level: LogLevel` mapping to `.name`.
2. **KMMLogging artifact availability** — confirm internal Lynxal Maven repo reachable and the `logging` artifact has matching KMP targets (especially iOS).
3. **`type` discriminator + `source` field redundancy** is intentional. `type` is the decoding discriminator; `source` is a domain-level tag for filter UIs. Don't collapse them.
