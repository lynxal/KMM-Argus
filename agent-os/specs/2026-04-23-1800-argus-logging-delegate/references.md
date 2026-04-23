# References for Argus Logging Delegate

## Authoritative KMMLogging API

### `LoggerImplementation` — the delegate contract

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LoggerImplementation.kt`
- **Relevance:** Single-method interface `{ fun log(logDetails: LogDetails, loggerExtras: LoggerExtras) }` that `ArgusLoggerDelegate` implements. Confirms the draft spec's `: LoggerInterface` was incorrect.

### `LogDetails` / `LoggerExtras` / `LogLevel`

- **Location:**
  - `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LogDetails.kt`
  - `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LoggerExtras.kt`
  - `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LogLevel.kt`
- **Relevance:** Canonical field list and types for the mapping contract. `LogDetails.timestamp: Instant`, `LoggerExtras.tag: String = ""` (not null), `LogLevel` cases are **Verbose/Debug/Info/Warning/Error** (not Warn).

### `LoggerInterfaceImpl` — dispatcher behavior

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/commonMain/kotlin/com/lynxal/logging/LoggerInterfaceImpl.kt`
- **Relevance:** Confirms that `Logger.minLevel` is checked by the dispatcher *before* each delegate's `log()` is invoked. Our `config.minLevel` is therefore a *stricter* delegate-local filter, not a replacement.

### `DebugLoggerImplementation.android.kt` — reference pattern

- **Location:** `/Users/vardan.kurkchiyan/AndroidStudioProjects/KMMLogging/logging/src/androidMain/kotlin/com/lynxal/logging/DebugLoggerImplementation.android.kt`
- **Relevance:** The library's built-in delegate. Shows the idiomatic `log(logDetails, loggerExtras)` override shape.

## Sibling Argus specs

### `agent-os/specs/2026-04-23-1430-argus-event-model/`

- **Relevance:** Defines the `LogEvent`, `ThrowableInfo`, `ArgusEventBus`, and `NoopEventBus` types this delegate produces/consumes. Read `plan.md` for the model shapes; this spec is the next link in the chain.

### `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/`

- **Relevance:** Parallel producer emitting `HttpEvent`s to the same bus. Shares the `Uuid.random()` id strategy and the `Throwable`-to-serializable-form pattern. Any inconsistency between the two producers would show up as noise on the unified timeline, so the delegate mirrors its conventions.

## Existing Argus code

### `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/LogEvent.kt`

- **Key fields:** `id: String`, `timestamp: Long`, `source: EventSource = LOG`, `level: LogLevel`, `tag: String?`, `message: String`, `payload: Map<String, String>`, `throwable: ThrowableInfo?`
- **Relevance:** The target DTO.

### `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ThrowableInfo.kt`

- **Key fields:** `className`, `message`, `stackTrace`, `cause: ThrowableInfo?` (recursive)
- **Relevance:** The target type for cause-chain capture. No existing factory — this spec adds `internal fun Throwable.toThrowableInfo(captureStackTraces: Boolean)` in the same package.

### `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEventBus.kt` + `NoopEventBus.kt`

- **Key shape:** `interface ArgusEventBus { fun publish(event: ArgusEvent) }` and `object NoopEventBus : ArgusEventBus { override fun publish(event: ArgusEvent) = Unit }`
- **Relevance:** Publish sink. `NoopEventBus.publish` is `Unit = Unit` — the delegate's "safe under NoopEventBus" acceptance test constructs a real delegate around it.

### `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`

- **Line 32:** `val id = Uuid.random().toString()` — the id-generation pattern this delegate reuses.
- **Line 206:** `Throwable.toHttpError()` — structural parallel to `Throwable.toThrowableInfo()`.

### `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/RecordingEventBus.kt`

- **Key pattern:** `internal open class RecordingEventBus : ArgusEventBus` with a `mutableListOf` backing store.
- **Relevance:** Reused directly by `ArgusLoggerDelegateTest` — `internal` visibility is module-wide, so cross-package access from `commonTest/.../logging/` works without refactoring.

### `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/EventFactories.kt`

- **Key factories:** `createTestLogEvent`, `createTestThrowableInfo`.
- **Relevance:** Test-data factories for assertion comparisons; particularly useful for `ThrowableInfoConversionsTest` equality checks.

## Standards cross-links

Full content inlined in `standards.md`. Short pointers:

- `agent-os/standards/kmp/module-boundaries.md`
- `agent-os/standards/naming/class-suffixes.md`
- `agent-os/standards/naming/package-structure.md`
- `agent-os/standards/naming/code-documentation.md`
- `agent-os/standards/testing/test-structure.md`
- `agent-os/standards/testing/test-data-factories.md`
