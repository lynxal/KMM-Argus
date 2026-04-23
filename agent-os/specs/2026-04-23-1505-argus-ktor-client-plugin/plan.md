# Argus Ktor Client Plugin — Plan

## Context

Argus is a debug-only, Ktor-native, KMP-ready on-device HTTP + log inspector
for Canvas Control apps (see `agent-os/product/mission.md`). Phase 1 of the
roadmap explicitly calls for a **Ktor `HttpClient` plugin capturing full
request/response metadata and bodies** (`agent-os/product/roadmap.md` §1), and
`agent-os/product/tech-stack.md` pins the plugin to `:argus-core` with Ktor
client core listed as a dep (module matrix row 1).

The data-model substrate already exists — the previous spec
(`2026-04-23-1430-argus-event-model`) shipped `HttpEvent`, `HttpRequest`,
`HttpResponse`, `HttpError`, `Header(redacted)`, `ArgusEventBus`, and
`NoopEventBus` in `com.lynxal.argus.model`. What's missing is the capture
layer that actually *produces* those events. This spec defines that layer.

## Acceptance

- Public API: `HttpClient(CIO) { install(Argus) { … } }` with a typed config
  (`eventBus`, `maxBodyBytes`, `redactHeaders`, `captureRequestBody`,
  `captureResponseBody`).
- 100 concurrent requests captured with per-request ordering preserved.
- Added latency < 2 ms p99 on JVM against `MockEngine`.
- Streaming responses continue to stream to the real consumer uninterrupted.
- Body cap works: overflow populates `bodyTruncatedTotalBytes`, relay
  continues.
- Redaction is case-insensitive; value becomes `***redacted***`;
  `Header.redacted = true`.
- `commonTest` passes against `MockEngine` with no Android deps.
- Installing with `eventBus = NoopEventBus` is a zero-cost no-op.

## Tasks

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/` with
`plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/` (empty).

### Task 2 — Add Ktor client deps to `:argus-core`

- Add `libs.ktor.client.core` to `commonMain.dependencies`.
- Add `libs.ktor.client.mock` to `commonTest.dependencies`.
- Update `gradle/libs.versions.toml` if Ktor entries are missing.

### Task 3 — Config + attribute keys

In `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/`:

- `ArgusClientConfig.kt` — typed config class with the 5 fields above and
  sensible defaults (`NoopEventBus`, `1_000_000`, the 4 standard auth/cookie
  header names, `true`, `true`).
- `ArgusAttributes.kt` — `internal val ArgusIdKey = AttributeKey<String>(...)`
  and `ArgusStartMsKey = AttributeKey<Long>(...)`.

### Task 4 — Redaction helper

`Redaction.kt`: `internal fun Headers.toArgusHeaders(redactSet: Set<String>): List<Header>`.
Lowercase the redact set once; for each header name, case-insensitive match
→ `Header(name, "***redacted***", redacted = true)`, else
`Header(name, value, redacted = false)`. Pure function, no deps.

### Task 5 — Body-capture helper

`BodyCapture.kt`:

- `internal data class CapturedBody(preview: String?, truncatedTotalBytes: Long?, contentType: String?, sizeBytes: Long?)`.
- Tee function that splits a source `ByteReadChannel` into `(consumer, captured)`
  — consumer relays bytes unchanged, captured buffers up to `maxBytes`. On
  overflow: record `truncatedTotalBytes`, stop buffering, keep draining.
- Encoding rules:
  - `text/*`, `application/*+json`, `application/json`, `application/xml`,
    `application/javascript` → UTF-8 string preview.
  - Everything else (`image/*`, `multipart/*`, `application/octet-stream`,
    unknown binary, `br`/`zstd` opaque) → base64 preview, still capped.
  - Ktor handles `gzip`/`deflate` upstream; we capture post-decompression.

### Task 6 — The plugin

`ArgusClientPlugin.kt` — `public val Argus = createClientPlugin("Argus", ::ArgusClientConfig) { … }`
with `onRequest`, `onResponse`, and an error hook (phase names pinned to the
real Ktor API at implementation time). On the error path, emit an `HttpEvent`
carrying the captured `HttpRequest` plus `HttpError(throwableClass, message, stackTrace)`
and a `null` response. Always publish through `cfg.eventBus` — the plugin must
never throw out of a hook.

### Task 7 — `commonTest` suite

Under `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/`:

- `RecordingEventBus.kt` — test-only `ArgusEventBus` collecting events in a
  `MutableList`.
- `ArgusClientPluginTest.kt` — backticked names, AAA structure, covering:
  - happy-path GET emits method, url-split, status, `durationMs`;
  - request body capture: text, json, binary→base64, streaming;
  - response body capture: same encoding rules;
  - streaming response still reaches real consumer byte-for-byte;
  - overflow populates `bodyTruncatedTotalBytes` and continues;
  - case-insensitive redaction sets value + flag;
  - network failure emits `HttpEvent` with `error` populated;
  - `NoopEventBus` install is a no-op;
  - 100 concurrent requests — unique ids, ordering preserved per request.

### Task 8 — JVM latency test

`argus-core/src/jvmTest/kotlin/com/lynxal/argus/ktor/ArgusClientPluginLatencyTest.kt`:

- Warm up, then run ≥ 1000 MockEngine calls with and without the plugin.
- Assert p99 overhead < 2 ms.
- Gate behind `-DargusLatencyTest=true` if CI proves flaky.

### Task 9 — Public API surface check

Run `./gradlew :argus-core:compileCommonMainKotlinMetadata`; confirm only
`com.lynxal.argus.ktor.Argus` and `com.lynxal.argus.ktor.ArgusClientConfig`
are public. Everything else must be `internal`.

## Verification

- `./gradlew :argus-core:allTests` green.
- `./gradlew :argus-core:check` green across JVM / Android / iOS simulator.
- Wire into a scratch consumer: `HttpClient(CIO) { install(Argus) { eventBus = recorder } }`,
  run a few requests, visually inspect captured `HttpEvent`s.

## Files touched

- `argus-core/build.gradle.kts` (+ `gradle/libs.versions.toml` if needed)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusAttributes.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/Redaction.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/BodyCapture.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt` (new)
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/RecordingEventBus.kt` (new)
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/ktor/ArgusClientPluginTest.kt` (new)
- `argus-core/src/jvmTest/kotlin/com/lynxal/argus/ktor/ArgusClientPluginLatencyTest.kt` (new)
- `agent-os/specs/2026-04-23-1505-argus-ktor-client-plugin/*` (new)

## Out of scope

- OkHttp / HttpURLConnection / Retrofit hooks (Phase 3).
- WebSocket frame inspection (Phase 2).
- Request replay / blocking / throttling (Phase 3 candidate).
- MDC-style correlation ID propagation for log↔http linking (Phase 2 — the
  plugin emits only the per-request UUID).
- iOS-specific actuals — plugin is `commonMain`-only; iOS validation happens
  alongside the rest of `:argus-core` in Phase 4.
