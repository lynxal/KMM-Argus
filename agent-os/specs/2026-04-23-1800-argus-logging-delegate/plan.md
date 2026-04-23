# Argus Logging Delegate — Plan

## Context

Argus captures HTTP traffic (via the Ktor client plugin spec) and application logs (this spec) onto a single on-device timeline. The event schema already exists in `:argus-core/.../model/` (from the `2026-04-23-1430-argus-event-model` spec), including `LogEvent`, `ThrowableInfo`, `ArgusEventBus`, and `NoopEventBus`. What's missing is the bridge from KMMLogging's dispatcher into that event stream. Without this delegate, app-level `Logger.debug(...)` / `Logger.error(...)` calls never reach the Argus event bus and the unified timeline is HTTP-only.

This spec ships the bridge: a `LoggerImplementation` that maps each `LogDetails` + `LoggerExtras` from KMMLogging into an `ArgusEvent.LogEvent` and publishes it to an `ArgusEventBus`. It does not ship `:argus-android` bootstrap wiring — that module doesn't exist yet (deferred alongside `ArgusServer` to a later spec). The delegate is usable today with any `ArgusEventBus` instance (including `NoopEventBus` for tests and release builds, where `publish()` is `Unit = Unit` and the JIT elides it).

## Shaping decisions (confirmed with user)

1. **Implement `LoggerImplementation`, not `LoggerInterface`.** KMMLogging's delegate contract is the single-method `LoggerImplementation { fun log(logDetails: LogDetails, loggerExtras: LoggerExtras) }`. `LoggerInterface` is the public `Logger` API with ~11 methods — consumers of the library, not delegates, implement that. The original draft spec had this wrong; corrected here.
2. **`config.minLevel` is a delegate-local override on top of global `Logger.minLevel`.** KMMLogging's dispatcher already filters by `Logger.minLevel` before calling `log()`. `ArgusLoggerConfig.minLevel` (default `Verbose` = pass-through) lets Argus be *stricter* than the global logger — e.g., logcat at Verbose, Argus only Info+ to reduce bus traffic.
3. **Scope: delegate class + config + internal `ThrowableInfo` factory + tests only.** No `:argus-android`, no `ArgusServer`, no bootstrap wiring. KDoc on `ArgusLoggerDelegate` documents the intended `Logger.add(...)` integration as a forward reference for the future `:argus-android` spec.
4. **Stack traces via `Throwable.stackTraceToString()` (commonMain).** Matches the existing `Throwable.toHttpError()` pattern at `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:206`. Works across JVM / Android / Native; gated by `config.captureStackTraces` (returns `""` when disabled).
5. **ID/timestamp**: `Uuid.random().toString()` for `LogEvent.id` (same pattern as `ArgusClientPlugin.kt:32`); `logDetails.timestamp.toEpochMilliseconds()` for `LogEvent.timestamp`.

## Source-of-truth KMMLogging API

Verified against `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain`:

```kotlin
// com.lynxal.logging
interface LoggerImplementation {
    fun log(logDetails: LogDetails, loggerExtras: LoggerExtras)
}

data class LogDetails(
    val logLevel: LogLevel,
    val message: String,
    val cause: Throwable? = null,
    val payload: Map<String, String> = emptyMap(),
    val timestamp: Instant = Clock.System.now(),
)

data class LoggerExtras(val tag: String = "")

enum class LogLevel(val level: Int) { Verbose(2), Debug(3), Info(4), Warning(5), Error(6) }
```

Note: enum case is **`Warning`**, not `Warn` (original draft was loose on spelling).

---

## Task 1 — Save spec documentation

Populate `agent-os/specs/2026-04-23-1800-argus-logging-delegate/`:

- `plan.md` — this file
- `shape.md` — scope + five shaping decisions + context
- `standards.md` — verbatim content of the six standards listed under "Standards applied"
- `references.md` — pointers to KMMLogging source, sibling specs, and existing event-model files
- `visuals/` — empty (no UI)

## Task 2 — `ArgusLoggerConfig` (commonMain)

Path: `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerConfig.kt`

```kotlin
public data class ArgusLoggerConfig(
    public val minLevel: LogLevel = LogLevel.Verbose,
    public val maxMessageLength: Int = 10_000,
    public val maxPayloadEntries: Int = 50,
    public val captureStackTraces: Boolean = true,
)
```

KDoc on the class explains **why** `minLevel` coexists with `Logger.minLevel` (delegate-local stricter filter).

## Task 3 — Internal `Throwable → ThrowableInfo` conversion (commonMain)

Path: `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ThrowableInfoConversions.kt`

```kotlin
internal fun Throwable.toThrowableInfo(captureStackTraces: Boolean): ThrowableInfo =
    ThrowableInfo(
        className = this::class.simpleName ?: this::class.toString(),
        message = message,
        stackTrace = if (captureStackTraces) stackTraceToString() else "",
        cause = cause?.toThrowableInfo(captureStackTraces),
    )
```

`internal` — scoped to the module. Lives with `ThrowableInfo` in the `model` package for reuse.

## Task 4 — `ArgusLoggerDelegate` (commonMain)

Path: `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt`

```kotlin
@OptIn(ExperimentalUuidApi::class)
public class ArgusLoggerDelegate(
    private val bus: ArgusEventBus,
    private val config: ArgusLoggerConfig = ArgusLoggerConfig(),
) : LoggerImplementation {
    override fun log(logDetails: LogDetails, loggerExtras: LoggerExtras) {
        if (logDetails.logLevel.level < config.minLevel.level) return
        bus.publish(
            LogEvent(
                id = Uuid.random().toString(),
                timestamp = logDetails.timestamp.toEpochMilliseconds(),
                level = logDetails.logLevel,
                tag = loggerExtras.tag.ifBlank { null },
                message = truncate(logDetails.message),
                payload = capPayload(logDetails.payload),
                throwable = logDetails.cause?.toThrowableInfo(config.captureStackTraces),
            )
        )
    }
    // truncate / capPayload helpers elided
}
```

KDoc documents the forward-reference wiring (`Logger.add(ArgusLoggerDelegate(argusServer.eventBus))`) and the Phase 2 `CoroutineContext.Element` correlation extension point.

## Task 5 — commonTest coverage

Path: `argus-core/src/commonTest/kotlin/com/lynxal/argus/logging/`

`ArgusLoggerDelegateTest.kt` (reuses existing `RecordingEventBus` from `.../ktor/`):
- all five LogLevels round-trip
- tag: non-blank → LogEvent.tag; blank → null
- payload below/at/above cap
- message below/above maxMessageLength (suffix format `...<+N chars>`)
- logLevel below `config.minLevel` is dropped
- nested cause chain of depth 3 captured recursively
- `captureStackTraces = false` yields empty stackTrace
- timestamp converted to epoch ms
- NoopEventBus sink — construct `ArgusLoggerDelegate(NoopEventBus)`, invoke `log(...)` 100x, no exception

`ThrowableInfoConversionsTest.kt`:
- simple throwable → className/message preserved
- cause chain recurses
- `captureStackTraces = false` → empty at every level

## Task 6 — jvmTest coverage

Path: `argus-core/src/jvmTest/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegateJvmTest.kt`

- Real caught JVM throwable → stackTrace contains `"at "`
- Nested cause → both levels' stackTrace contain `"at "`

## Task 7 — Verify (acceptance)

```bash
./gradlew :argus-core:jvmTest
./gradlew :argus-core:testDebugUnitTest
./gradlew :argus-core:iosSimulatorArm64Test
./gradlew :argus-core:assemble
```

All pass → acceptance met:
- All five levels round-trip (commonTest)
- Nested cause chains captured fully (commonTest depth-3 test)
- Stack traces non-null on JVM (jvmTest)
- Stack traces non-null on Native (iosSimulatorArm64Test exercises the captureStackTraces=true path)
- Safe under NoopEventBus (`Unit = Unit` sink)

Manual check: `grep -r "LoggerInterface" argus-core/src/commonMain/kotlin/com/lynxal/argus/logging` → no matches (confirms correct interface).

## Out of scope

- `:argus-android` module creation and `Application.onCreate()` wiring
- `expect class ArgusServer` + platform actuals
- `CoroutineContext.Element` correlation-id extraction (Phase 2)
- Ring buffer / drop policy in the event bus (lives in a future `ArgusEventBus` impl, not the delegate)
- Making `Throwable.toThrowableInfo` public API
- Mutating `Logger.minLevel` from `ArgusLoggerConfig`

## Critical files

**New (this spec):**
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerConfig.kt`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ThrowableInfoConversions.kt`
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegateTest.kt`
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/logging/ThrowableInfoConversionsTest.kt`
- `argus-core/src/jvmTest/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegateJvmTest.kt`

**Read-only references:**
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/LogEvent.kt`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ThrowableInfo.kt`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEventBus.kt` + `NoopEventBus.kt`
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/RecordingEventBus.kt`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:32` (Uuid pattern)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:206` (Throwable stack capture pattern)
- `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/*`
- `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/androidMain/kotlin/com/lynxal/logging/DebugLoggerImplementation.android.kt`

## Standards applied

- `kmp/module-boundaries` — delegate stays in `:argus-core`; publishes to the `ArgusEventBus` interface
- `naming/class-suffixes` — `Delegate` is a documented domain-layer suffix
- `naming/package-structure` — one top-level declaration per file; new `com.lynxal.argus.logging` subpackage mirrors `.ktor` / `.model`
- `naming/code-documentation` — KDoc on public API; inline comments only for non-obvious "why"
- `testing/test-structure` — `kotlin.test`, `commonTest`, backticked names, AAA
- `testing/test-data-factories` — reuse existing `EventFactories.createTestLogEvent` / `createTestThrowableInfo`; delegate tests construct `LogDetails` directly (small data class, no factory needed)

## Open risks

1. **`kotlin.time.Instant.toEpochMilliseconds()` availability on all KMP targets.** KMMLogging uses `kotlin.time.Instant` in commonMain (Kotlin 2.2), so it's available. Confirm on first `:argus-core:compileKotlinMetadata`.
2. **`Uuid.random()` opt-in.** `kotlin.uuid.Uuid` requires `@OptIn(ExperimentalUuidApi::class)` — scoped to `ArgusLoggerDelegate`.
3. **Native (iOS) stack trace quality** is runtime-dependent. Acceptance asserts only "non-blank on JVM"; iOS test asserts round-trip correctness, not trace fidelity.
