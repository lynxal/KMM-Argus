# Argus Logging Delegate — Shaping Notes

## Scope

Ship the KMMLogging → Argus event-bus bridge in `:argus-core` (`com.lynxal.argus.logging`):

- `ArgusLoggerDelegate : LoggerImplementation` — maps `LogDetails` + `LoggerExtras` into a `LogEvent` and publishes to an `ArgusEventBus`
- `ArgusLoggerConfig` — data class with `minLevel`, `maxMessageLength`, `maxPayloadEntries`, `captureStackTraces` defaults
- `internal fun Throwable.toThrowableInfo(captureStackTraces: Boolean)` — recursive cause-chain conversion, placed next to `ThrowableInfo` in the `model` package
- commonTest: round-trip of all five levels, tag/payload/message caps, cause-chain depth, NoopEventBus safety
- jvmTest: real JVM `"at "` frames in captured stack traces

Out of scope: `:argus-android`, `ArgusServer`, bootstrap `Logger.add(...)` wiring, correlation-id capture from `CoroutineContext`, bus-impl ring buffer.

## Decisions

1. **Delegate implements `LoggerImplementation`, not `LoggerInterface`.** Verified from KMMLogging source at `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LoggerImplementation.kt`. `LoggerInterface` is the 11-method public `Logger` API consumers use; `LoggerImplementation` is the single-method `log(LogDetails, LoggerExtras)` contract for delegates. Built-in `DebugLoggerImplementation` uses this pattern on every platform. The draft spec wrote `: LoggerInterface`, which was wrong.

2. **`ArgusLoggerConfig.minLevel` is a delegate-local filter, not a global replacement.** KMMLogging's dispatcher (`LoggerInterfaceImpl.log`) already gates by `Logger.minLevel` before calling each delegate's `log()`. `config.minLevel` defaults to `Verbose` (pass-through) and only kicks in when the consumer wants Argus to be *stricter* than logcat — e.g., logcat at Verbose, Argus at Info+ to reduce bus load.

3. **Delegate class + tests only; no app-bootstrap wiring.** The `:argus-android` module and `ArgusServer` both belong to later specs. KDoc on `ArgusLoggerDelegate` shows the intended `Logger.add(ArgusLoggerDelegate(argusServer.eventBus))` call as a forward reference. Nothing to wire until `ArgusServer` exists.

4. **Stack traces via `Throwable.stackTraceToString()` in commonMain.** The existing `Throwable.toHttpError()` at `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:206` already uses this pattern. Works on JVM/Android/Native (Native trace fidelity depends on debug symbols — acceptance asserts "non-blank on JVM" only). Gated by `config.captureStackTraces` (returns `""` when disabled, for all frames including cause chain).

5. **ID via `Uuid.random().toString()`; timestamp via `Instant.toEpochMilliseconds()`.** Matches the existing Ktor plugin's id strategy (`ArgusClientPlugin.kt:32`). `LogDetails.timestamp` is a `kotlin.time.Instant` from KMMLogging; `LogEvent.timestamp` is a `Long`.

## Context

- **Visuals:** None. This is a library/wire-format feature.
- **References:**
  - `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/` — authoritative KMMLogging API (`LoggerImplementation.kt`, `LogDetails.kt`, `LoggerExtras.kt`, `LogLevel.kt`, `LoggerInterfaceImpl.kt`)
  - `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/androidMain/kotlin/com/lynxal/logging/DebugLoggerImplementation.android.kt` — reference delegate implementation pattern
  - `agent-os/specs/2026-04-23-1430-argus-event-model/` — sibling spec defining `LogEvent`, `ThrowableInfo`, `ArgusEventBus`, `NoopEventBus` (the types this delegate consumes)
  - `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt` — sibling producer emitting `HttpEvent`s to the same bus; source of the `Uuid.random()` id pattern and `Throwable.toHttpError()` stack-capture pattern
  - `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/RecordingEventBus.kt` — test recorder, reused cross-package via `internal`-in-same-module visibility
- **Product alignment:** `agent-os/product/roadmap.md` Phase 1 (MVP) lists "KMMLogging delegate" as one of the three in-app capture sources alongside the Ktor client plugin and custom events.

## Divergences from synced standards

None. The delegate fits cleanly inside `:argus-core` with no new module, no new dependency, no expect/actual surface.

## Standards applied

- `kmp/module-boundaries` — `:argus-core` stays the base of the dependency graph
- `naming/class-suffixes` — `Delegate` is a listed domain-layer suffix
- `naming/package-structure` — new `com.lynxal.argus.logging` subpackage; one top-level declaration per file
- `naming/code-documentation` — KDoc on `ArgusLoggerDelegate` and `ArgusLoggerConfig`; inline comments only where non-obvious
- `testing/test-structure` — `kotlin.test`, `commonTest` default, backticked names, AAA
- `testing/test-data-factories` — reuse `EventFactories.createTestLogEvent` / `createTestThrowableInfo` where a factory already fits; construct `LogDetails` directly for delegate tests (it's a small data class with defaults)
