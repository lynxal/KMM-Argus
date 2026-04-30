# Capture Correctness Audit (§6.2)

Scope: static review of `:argus-core/src/commonMain/` (and corresponding `commonTest/`).
Spec contract: §3.6 (streaming-safe), §3.7 (header redaction), §5.1/5.2/5.3 (event model), §6.2 (capture correctness checklist).

## §6.2 Verification

| Item | Status | Evidence |
| --- | --- | --- |
| 6.2.1 Plugin captures method/URL split host+path/headers/req body cap/status+text/resp headers/resp body cap/start ts/duration | pass | `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:45-71` (request side: method, url, host, path, headers, reqBody snapshot + start ms attribute); `:147-158` (response side: statusCode, statusText, headers, body fields, durationMs computed from `startMs`) |
| 6.2.2 Errors captured (class + message + stack trace) | pass | `ArgusClientPlugin.kt:230-234` — `Throwable.toHttpError()` populates `throwableClass = simpleName ?: toString()`, `message`, `stackTrace = stackTraceToString()`. Wired into both `emitError` (capture-time failure) and `emitNetworkError` (`Send` interceptor `:112-119`). |
| 6.2.3 Body cap + truncation marker | pass | Default `MAX_BODY_BYTES = 1_000_000L` at `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/CaptureDefaults.kt:4`; cap applied in `BodyCapture.kt:34-56` (request) and `ArgusClientPlugin.kt:84-93` (response via `drainWithCap` + `encodeCapturedBytes`); `bodyTruncatedTotalBytes` stamped only when `totalSize > maxBytes` at `capture/BodyEncoding.kt:30,38`. |
| 6.2.4 Streaming-safe (no original-channel consumption) | pass | `ArgusClientPlugin.kt:75-104` uses `HttpReceivePipeline.After` + `response.rawContent.split(response)` (Ktor `io.ktor.util.split`, line 24 import) to tee into `(captureSide, relaySide)`; relay is reattached via `replaceResponse { relaySide }` and propagated with `proceedWith(wrappedResponse)`. Capture drains its half asynchronously inside `response.launch { ... }`. See analysis below. |
| 6.2.5 Header redaction (case-insensitive, symmetric, defaults, placeholder, flag) | pass | `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/HeaderRedaction.kt:6-19` lowercases both sides; `CaptureDefaults.kt:6-13` lists `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization` and `REDACTED_PLACEHOLDER = "***redacted***"`; `Header.redacted: Boolean` flag at `model/Header.kt:9`. Symmetric application: request `ArgusClientPlugin.kt:49`, response `:149` both call the same `Headers.toArgusHeaders(cfg.redactHeaders)` (`ktor/Redaction.kt:10-17`). |
| 6.2.6 Log delegate captures all 5 levels with payload + throwable | pass | `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt:42-57` forwards every `LogDetails` (level, tag, message, payload, cause) into `LogEvent` regardless of level (only the per-delegate `minLevel` filter applies at `:43`). Verified by test `commonTest/.../logging/ArgusLoggerDelegateTest.kt:27-43` which exercises Verbose/Debug/Info/Warning/Error round-trip. |
| 6.2.7 Cause chain recursed | pass | `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ThrowableInfoConversions.kt:14-20` — `cause = cause?.toThrowableInfo(captureStackTraces)` recurses; `ThrowableInfo.cause: ThrowableInfo?` field at `model/ThrowableInfo.kt:10`. Test at `ArgusLoggerDelegateTest.kt:136-153` covers depth-3 chain. |
| 6.2.8 NoopEventBus is the default `eventBus` | pass | `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt:8` — `public var eventBus: ArgusEventBus = NoopEventBus`. `NoopEventBus.publish` is a no-op object at `model/NoopEventBus.kt:3-5`. (Note: `ArgusLoggerDelegate` requires the bus as a constructor arg — no default — but the spec only requires the Ktor config default, which holds.) |

## Streaming-safe analysis (§3.6)

`ArgusClientPlugin.kt:75-104`:

1. Intercept happens at `HttpReceivePipeline.After` so the Ktor pipeline is fully assembled with the engine's raw `ByteReadChannel` exposed as `response.rawContent`.
2. `response.rawContent.split(response)` (Ktor stdlib `io.ktor.util.split`, imported line 24) returns two independent `ByteReadChannel`s — `captureSide` and `relaySide` — that share a single source via internal teeing. The original channel is never directly consumed by Argus.
3. The downstream consumer is rebuilt via `response.call.replaceResponse { relaySide }` and propagated with `proceedWith(wrappedResponse)`; the application call site reads bytes from `relaySide` exactly as it would have from the raw channel.
4. The capture half is drained inside `response.launch { ... }` (a coroutine on the response's scope) by `captureSide.drainWithCap(maxBytes)` (`BodyCapture.kt:15-32`), which uses `readAvailable` into an 8 KB buffer and only retains up to `maxBytes` while continuing to consume — and counting — the rest into `total` so `bodyTruncatedTotalBytes` is accurate.
5. Failure of either drain or emit is caught with `runCatching` and routed to `emitError` (capture-time fault) without re-throwing into the consumer's pipeline. No blind `readBytes()` / `bodyAsText()` anywhere on the original channel.

Test coverage: `ArgusClientPluginTest.kt:147-162` (`streaming response still reaches real consumer byte-for-byte`) confirms relay path; `:165-187` confirms cap + truncation marker.

## Redaction analysis (§3.7)

- Defaults: `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization` (`CaptureDefaults.kt:6-11`).
- Case-insensitivity: both the configured set and incoming header names are `.lowercase()`'d into a `HashSet` lookup at `HeaderRedaction.kt:10-12`.
- Symmetry: same `toArgusHeaders(cfg.redactHeaders)` extension applied to request headers (`ArgusClientPlugin.kt:49`) and response headers (`:149`).
- Placeholder: `REDACTED_PLACEHOLDER = "***redacted***"` substituted at `HeaderRedaction.kt:15`.
- Flag: `Header.redacted` set on each header (`HeaderRedaction.kt:16`, default `false`).
- Test: `ArgusClientPluginTest.kt:189-220` exercises lowercase `authorization` request header + capitalized `Set-Cookie` response header + non-redacted `X-Trace`.

## Event model

- Sealed root: `ArgusEvent.kt:16-20` — `@Serializable public sealed interface ArgusEvent { id, timestamp, source }`.
- `EventSource.kt:6-10` — `enum { HTTP, LOG, CUSTOM }`.
- Subclasses (`@Serializable @SerialName(...)`):
  - `HttpEvent.kt` — request/response/error/durationMs/correlationId/engine.
  - `LogEvent.kt` — level/tag/message/payload/throwable/correlationId.
  - `CustomEvent.kt` — sourceLabel/label/direction/payload/metadata.
- `Header.kt:6-10` — `data class Header(name, value, redacted = false)` with `@Serializable`.
- `ThrowableInfo.kt:6-11` — `className/message/stackTrace/cause: ThrowableInfo?`.
- Schema constant: `Schema.kt:12` — `public const val ARGUS_SCHEMA_VERSION: Int = 2` (also embedded in `HelloPayload`).
- Per-request UUID: generated via `Uuid.random().toString()` (`ArgusClientPlugin.kt:38`), stashed on `request.attributes` at `ArgusIdKey` (`ArgusAttributes.kt:9`). v4 randomness comes from Kotlin stdlib `kotlin.uuid.Uuid.random()`.
- Logger config defaults: `ArgusLoggerConfig.kt:18-21` — `minLevel = Verbose`, `maxMessageLength = 10_000`, `maxPayloadEntries = 50`, `captureStackTraces = true`. All match spec.

## Test coverage (`commonTest`)

Strong:
- `ktor/ArgusClientPluginTest.kt` covers GET URL-split, POST text/JSON/binary, response text/binary preview, streaming relay, body cap + truncation, redaction (case + symmetry), error emission, NoopEventBus install.
- `logging/ArgusLoggerDelegateTest.kt` covers all 5 levels, tag handling, payload cap, message truncation, level filter, cause-chain depth 3, `captureStackTraces=false`, timestamp conversion, NoopEventBus zero-work.
- `logging/ThrowableInfoConversionsTest.kt`, `model/*SerializationTest.kt`, `model/SchemaVersionTest.kt`, correlation tests, factories.
- JVM-only: `ArgusClientPluginConcurrencyTest.kt`, `ArgusClientPluginLatencyTest.kt`, `ArgusLoggerDelegateJvmTest.kt`.

Gaps / things not covered statically:
- No explicit assertion that response capture preserves a multi-MB stream byte-for-byte under a tight cap (current test uses 4 KB payload, 2 KB partial cap test). A larger streaming test would harden §3.6 against future regressions.
- No test for a `OutgoingContent` request body that is *not* `ByteArrayContent` (e.g. `ChannelWriterContent`/`OutputStreamContent`). The plugin code path `BodyCapture.kt:73-79` returns a body record with `preview = null, sizeBytes = length` — i.e. it intentionally does *not* tee streaming request bodies. This is a documented design choice but is uncovered by tests; if §6.2.1 is read strictly as "captures req body cap", a streaming request body produces no preview at all (only contentType + sizeBytes when contentLength is known). Worth flagging.
- No test that `Proxy-Authorization` (one of the four defaults) is redacted; only `Authorization`/`Set-Cookie` are exercised.
- No test that headers with multiple values get all values redacted (the loop at `Redaction.kt:12-14` flattens entries to pairs, so each value emits its own `Header` with the flag — this works but is unverified).

## Notes & risks

- **Streaming request bodies are not teed.** `BodyCapture.kt:73-79` deliberately returns a metadata-only `CapturedBody` for non-`ByteArrayContent`/non-`NoContent` `OutgoingContent`. This avoids consuming a write channel that Ktor only gives us once, but it means `bodyPreview` is null for `ChannelWriterContent` style uploads. Acceptable design (and consistent with §3.6 "must never consume the original channel"), but worth calling out: response bodies are tee'd; request bodies are *not* — they're snapshotted only when materialized as `String`/`ByteArray`/`ByteArrayContent`.
- **Capture buffer uses `ArrayList<Byte>`.** `BodyCapture.kt:18,27` builds the captured prefix as `ArrayList<Byte>` with per-byte `add()`. For caps near `Int.MAX_VALUE` or `fullBodyHosts` use, this is O(N) auto-boxing and will be a memory hot spot. Consider `Buffer`/`ByteArrayOutputStream`-equivalent (kotlinx-io `Buffer`). Not a correctness issue, but a perf/footprint risk per §3.10.
- **`Long.MAX_VALUE` cap clamped to `Int.MAX_VALUE`.** `drainWithCap` clamps the cap to `Int.MAX_VALUE` (line 17) since `ArrayList` is `Int`-indexed. `fullBodyHosts` uses `Long.MAX_VALUE` (`ArgusClientPlugin.kt:130`), so any host body over ~2.1 GB silently truncates at 2.1 GB despite the "full body" marker. The doc on `fullBodyHosts` warns about multi-GB bodies but doesn't mention this 2 GB ceiling. Document or fix.
- **`Send` interceptor placement.** The `on(Send) { proceed(...) }` block is registered *after* the `onRequest`/`receivePipeline.intercept` blocks (`ArgusClientPlugin.kt:112-119`). Ktor `createClientPlugin` registration order doesn't affect runtime phase ordering, but a network-level throw (e.g. DNS failure) is caught here and emits via `emitNetworkError`. The `ArgusEmittedKey` guard (line 141, 180, 208) prevents double-emit between `emitSuccess` / `emitError` / `emitNetworkError`. Looks correct.
- **Throwable class fidelity.** `toHttpError()` and `toThrowableInfo()` both use `this::class.simpleName ?: this::class.toString()`. On Kotlin/Native with stripped symbols, `simpleName` may be null and `toString()` falls back; on JVM/Android always produces the simple class name. Spec §6.2.2 says "throwable class" — fully qualified name is *not* captured anywhere. Minor: if two app classes share a `simpleName`, they're indistinguishable in the captured stream. `qualifiedName` is JVM-only and would need an `expect/actual`.
- **`HttpEvent.engine = "ktor"` hard-coded.** Both `emitSuccess` and `emitError(s)` set `engine = "ktor"` (lines 169, 197, 225). The other engine modules (`:argus-okhttp`, `:argus-urlconnection`) presumably set their own; not a defect for this slice but worth confirming the tag is wired correctly in those modules.
- **No coverage of correlation-stamping under coroutine context loss.** `coroutineContext[ArgusCorrelationId]?.value` (line 42) reads the request-time context; `CorrelationThreadLocal.get()` reads the log-time thread-local. There are correlation tests, but the interaction between thread-local correlation and the `response.launch { ... }` capture coroutine on iOS is an area to spot-check (the launch inherits the response scope, not the original request scope, so a correlationId is captured into the snapshot earlier — that's fine).

Overall: §6.2.1–§6.2.8 all pass on static review; tests in `commonTest` provide good coverage for the items the spec calls out. The risks above are quality observations, not blockers.
