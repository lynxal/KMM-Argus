# Argus Phase 3 — OkHttp & HttpURLConnection modules, custom event API, source-label filter

## Context

Phase 2 closed the correlation, persistence, and per-host body-bypass gaps. Apps that mix transports — say a Ktor client for the main API and OkHttp for a third-party SDK — still can't see all of their HTTP traffic in Argus because the only emitter is the Ktor plugin. Phase 3 broadens HTTP coverage to OkHttp and `HttpURLConnection`, formalises the public API for emitting custom (non-HTTP, non-log) events, and gives the WebUI a way to filter the timeline by the dynamic `sourceLabel` set that custom emitters produce.

Intended outcome: in a mixed-source app, Ktor + OkHttp + `HttpURLConnection` traffic appears in a single timeline with engine badges, custom events emit via a one-line `eventBus.publishCustom(...)` call, and engineers can narrow the timeline to one or more `sourceLabel`s discovered live from the stream.

## Decisions (confirmed during shaping)

- **Engine tagging**: add `engine: String = "ktor"` to `HttpEvent`. New first-class field; bumps the wire schema version.
- **New module shape**: `:argus-okhttp` and `:argus-urlconnection` are pure-JVM (`kotlin("jvm")`), JVM 17. OkHttp and `HttpURLConnection` are JVM-only — no KMP ceremony needed.
- **Source-label filter UI**: dropdown multi-select beside the source chips, populated dynamically from `CustomEvent.sourceLabel` values observed in the live event buffer.
- **`publishCustom` parameter name**: `source` (per the user's spec) maps internally to `CustomEvent.sourceLabel`.
- **Sample app**: three new debug-only buttons — emit-custom, OkHttp call, `HttpURLConnection` call.
- **Shared body capture**: lift the transport-agnostic helpers (body encoding, header redaction, host-bypass logic) out of `:argus-core/.../ktor/` into a new `com.lynxal.argus.capture` package so all three engines reuse one implementation. Ktor-specific stream draining (`ByteReadChannel`, `OutgoingContent`) stays where it is.
- **Visibility**: shared helpers exposed via a `@RequiresOptIn` `@InternalArgusApi` annotation (lighter than friend-modules, matches Kotlin's existing `ExperimentalEncodingApi` precedent).

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-30-1330-argus-phase3/` with:

- `plan.md` — copy of this plan (everything from "# Argus Phase 3 …" through "## Reuse")
- `shape.md` — scope, decisions, conversation context (template at end of this file)
- `standards.md` — full bodies of the standards listed under "Standards applied"
- `references.md` — pointers to the existing Ktor plugin and Phase 2 spec to mirror

No visuals were provided.

## Task 2 — Lift body-capture & redaction into a transport-agnostic package

**Why first**: `:argus-okhttp` and `:argus-urlconnection` cannot depend on Ktor types but must share the same redaction list, body-cap math, host-bypass rule, and `CapturedBody` model the Ktor plugin already uses. Extract once, then both new modules consume it.

**New package** `com.lynxal.argus.capture` under `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/`:

- `InternalArgusApi.kt` — `@RequiresOptIn(level = RequiresOptIn.Level.ERROR) public annotation class InternalArgusApi`. Documented as "internal SPI for Argus engine modules; consumers should not annotate their own code with this."
- `CapturedBody.kt` — promote the existing internal data class from `argus-core/src/commonMain/.../ktor/CapturedBody.kt`. Same fields, public + `@InternalArgusApi`. Delete the old file.
- `BodyEncoding.kt` — pull `isTextContent(mime: String?): Boolean` and `encodeCapturedBytes(bytes: ByteArray, contentType: String?, totalSize: Long, maxBytes: Long): CapturedBody` from `argus-core/.../ktor/BodyCapture.kt`. The signature takes a `String?` mime instead of Ktor's `ContentType?`; existing Ktor caller passes `contentType?.toString()`.
- `HeaderRedaction.kt` — `public fun buildRedactedHeaders(pairs: Iterable<Pair<String, String>>, redactSet: Set<String>): List<Header>` and `public fun redactHeader(name: String, value: String, redactSet: Set<String>): Header`. The existing Ktor extension `Headers.toArgusHeaders` (in `argus-core/.../ktor/Redaction.kt`) collapses to a thin call into `buildRedactedHeaders`.
- `CaptureConfig.kt` — `public data class CaptureConfig(maxBodyBytes: Long, fullBodyHosts: Set<String>, redactHeaders: Set<String>, captureRequestBody: Boolean, captureResponseBody: Boolean)` and `public fun effectiveMaxBytesFor(host: String, cfg: CaptureConfig): Long` (returns `Long.MAX_VALUE` if host case-insensitively matches any entry in `fullBodyHosts`, else `cfg.maxBodyBytes`).
- `CaptureDefaults.kt` — `public object ArgusCaptureDefaults { public const val MAX_BODY_BYTES: Long = 1_000_000L; public val REDACT_HEADERS: Set<String> = setOf("Authorization", "Cookie", "Set-Cookie", "Proxy-Authorization"); public const val REDACTED_PLACEHOLDER: String = "***redacted***" }`. Migrate `ArgusClientConfig` companion constants to delegate here (keep current public names for ABI).

**Update** `argus-core/.../ktor/ArgusClientPlugin.kt` and `ArgusClientConfig.kt`: replace inlined helpers with calls into the new package; opt in via `@OptIn(InternalArgusApi::class)` at file level. Keep `ByteReadChannel.drainWithCap` and `captureRequestPayload(content: Any?, ContentType?, ...)` in the `ktor` package — they require Ktor types.

Tests: `argus-core/src/commonTest/.../capture/CaptureTest.kt` — host bypass, redaction, encoding (text vs binary), truncation marker math.

## Task 3 — Add `engine` field to `HttpEvent`, bump schema

**Edit** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/HttpEvent.kt:8` — append after `correlationId`:

```kotlin
val engine: String = "ktor",
```

Default keeps existing positional callers (the Ktor plugin) compiling unchanged. Update the three `HttpEvent(...)` construction sites in `ArgusClientPlugin.kt` to pass `engine = "ktor"` explicitly, for grep-ability.

**JSON wire**: confirm `argus-core/.../model/ArgusJson.kt` has `encodeDefaults = true` (the field always serialises so the WebUI sees a non-undefined value). Bump:

- `argus-core/.../model/Schema.kt:12` — `ARGUS_SCHEMA_VERSION = 2`
- `argus-webui/src/transport/schema.ts:9` — `ARGUS_SCHEMA_VERSION = 2 as const`
- `argus-webui/src/transport/schema.ts` — add `engine: string` to `HttpEvent`.

**Mismatched-version handling** is already in place at `argus-webui/src/transport/websocketSource.ts:93–95` (hard-rejects on Hello mismatch). Document the bump in the spec's `shape.md`.

**Backfill fixtures**: search for HttpEvent literals in `argus-webui/src/dev/fixtures/`, mock sources, and any test JSON. Add `engine: 'ktor'` everywhere.

## Task 4 — `:argus-okhttp` module

**Module setup**:

- `settings.gradle.kts` — add `include(":argus-okhttp")`.
- `argus-okhttp/build.gradle.kts` — `kotlin("jvm")`, `kotlin.jvmToolchain(17)`, plus Maven publishing plugin matching other modules. Dependencies: `api(projects.argusCore)`; `compileOnly("com.squareup.okhttp3:okhttp:<libs.versions>")`; `testImplementation` for `okhttp` + `okhttp-mockwebserver` + `kotlin("test")`. Add `okhttp` and `okhttp-mockwebserver` versions to `gradle/libs.versions.toml`.

**Files** under `argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/`:

- `ArgusOkHttpConfig.kt` — public class with `var maxBodyBytes`, `var redactHeaders`, `var fullBodyHosts`, `var captureRequestBody`, `var captureResponseBody`. Defaults read from `ArgusCaptureDefaults`.
- `ArgusOkHttpInterceptor.kt`:

  ```kotlin
  public class ArgusOkHttpInterceptor(
      private val eventBus: ArgusEventBus,
      private val config: ArgusOkHttpConfig = ArgusOkHttpConfig(),
  ) : Interceptor {
      override fun intercept(chain: Interceptor.Chain): Response { /* ... */ }
  }
  ```

  Inside `intercept`:
  1. Generate `id` (`Uuid.random().toString()`) and `startMs`.
  2. Read correlation: `val correlationId = activeCorrelationId()` — see Task 2's helper note. Add a new public function `argus-core/.../correlation/ActiveCorrelationId.kt` exposing the JVM thread-local that the Ktor plugin's `CorrelationThreadLocal` already populates. JVM-only `actual`; common stub returns `null`.
  3. Build captured request: redact headers via `buildRedactedHeaders(request.headers.toPairs(), config.redactHeaders)`, capture body subject to `effectiveMaxBytesFor(request.url.host, captureConfig)`.
     - **Body capture rule**: if `request.body == null || request.body!!.isOneShot()`, skip capture (record content-type only); otherwise write `body.writeTo(buffer)` into a fresh `okio.Buffer`, take up to the cap, rebuild the request with a `RequestBody.create(body.contentType(), buffer.readByteString())` so chain still sees an unconsumed body. Mirror OkHttp's own `HttpLoggingInterceptor` pattern.
  4. `val response = try { chain.proceed(builtRequest) } catch (t: IOException) { emitError(t); throw t }`.
  5. If response body capture is on: `val peeked = response.peekBody(effectiveMax)` (`peekBody` is non-consuming). Encode via `encodeCapturedBytes(peeked.bytes(), response.body?.contentType()?.toString(), totalSize = response.body?.contentLength() ?: peeked.bytes().size.toLong(), maxBytes = effectiveMax)`. When `contentLength()` is `-1`, set `truncatedTotalBytes` only if peeked bytes hit the cap exactly; otherwise leave null and document the caveat in KDoc.
  6. `eventBus.publish(HttpEvent(id, startMs, request = capturedReq, response = capturedResp, durationMs = now - startMs, correlationId = correlationId, engine = "okhttp"))`. Return original `response`.

**Tests** in `argus-okhttp/src/test/kotlin/...` using `MockWebServer`:

- 200 GET → event has `engine = "okhttp"`, status 200, captured body preview matches fixture.
- Header redaction → `Authorization: Bearer xyz` → `***redacted***`, `redacted = true`.
- Body cap → 5 MB response with `maxBodyBytes = 1_000_000` → `truncatedTotalBytes = 5_000_000`.
- Full-body bypass → host in `fullBodyHosts` → entire body captured.
- IOException path → `error` populated, `response = null`.
- Correlation → wrap call in code that sets the JVM thread-local correlation; event has `correlationId`.

## Task 5 — `:argus-urlconnection` module

**Module setup** mirrors `:argus-okhttp`. `argus-urlconnection/build.gradle.kts` depends on `api(projects.argusCore)`; `testImplementation` includes OkHttp's `mockwebserver` (works fine for `HttpURLConnection`).

**Files** under `argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/`:

- `ArgusUrlConnectionConfig.kt` — same fields as `ArgusOkHttpConfig`.
- `ArgusUrlConnection.kt`:

  ```kotlin
  public object ArgusUrlConnection {
      public fun wrap(
          connection: HttpURLConnection,
          eventBus: ArgusEventBus,
          config: ArgusUrlConnectionConfig = ArgusUrlConnectionConfig(),
      ): HttpURLConnection = ArgusHttpURLConnection(connection, eventBus, config)
  }
  ```

- `ArgusHttpURLConnection.kt` — `internal class ArgusHttpURLConnection(private val delegate: HttpURLConnection, private val eventBus: ArgusEventBus, private val config: ArgusUrlConnectionConfig) : HttpURLConnection(delegate.url)`.
  - State: `id`, `startMs` (set on first `connect()`), `correlationId = activeCorrelationId()` captured at construction, `requestBodyTee: TeeOutputStream?`, `responseBodyTee: TeeInputStream?`, `emitted = AtomicBoolean(false)`.
  - Forward all property setters (`requestMethod`, timeouts, `doOutput`, `doInput`, `instanceFollowRedirects`, `useCaches`, `setRequestProperty`, `addRequestProperty`, `setIfModifiedSince`, etc.) to `delegate`.
  - Override `connect()` to record start time idempotently then `delegate.connect()`.
  - Override `getOutputStream()` → wrap delegate stream in `TeeOutputStream` that copies up to `effectiveMaxBytes(host, captureConfig)` into a capture buffer (silently drops overflow, tracks total bytes written).
  - Override `getInputStream()` / `getErrorStream()` → wrap in `TeeInputStream` that captures up to the cap. Trigger emission lazily (on EOF or on `disconnect()`, whichever first).
  - Override `getResponseCode()`, `getResponseMessage()`, `getHeaderFields()`, `getContentType()`, `getContentLengthLong()`, `usingProxy()` → forward.
  - Override `disconnect()` → emit if not yet emitted (covers GET-no-body callers who never read the stream), then `delegate.disconnect()`.
  - Emission helper builds `HttpEvent(..., engine = "urlconnection")`. Catches `IOException` from `getResponseCode()` → emit with `error`.
- `TeeStreams.kt` — `internal class TeeOutputStream(...)` and `internal class TeeInputStream(...)` — cap-aware copy-on-write streams.

Reference Android's `okhttp.internal.huc.DelegatingHttpsURLConnection` for the canonical override list. Document in KDoc that `instanceFollowRedirects = true` (the JDK default) hides the redirect chain — only the final URL is observable.

**Tests** with `MockWebServer`:
- GET no body — disconnect path emits the event.
- POST with `getOutputStream()` body — request body preview captured.
- 4xx response with `getErrorStream()` — body captured, status correct.
- IOException on connect — `error` populated.
- Body cap, full-body bypass, redaction — same matrix as OkHttp.

## Task 6 — `publishCustom` extension API

**New file** `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/PublishCustom.kt`:

```kotlin
@OptIn(ExperimentalUuidApi::class, ExperimentalTime::class)
public fun ArgusEventBus.publishCustom(
    source: String,
    label: String,
    direction: Direction,
    payload: String,
    metadata: Map<String, String> = emptyMap(),
) {
    publish(
        CustomEvent(
            id = Uuid.random().toString(),
            timestamp = Clock.System.now().toEpochMilliseconds(),
            sourceLabel = source,
            label = label,
            direction = direction,
            payload = payload,
            metadata = metadata,
        ),
    )
}
```

The `source` parameter name (per the user's spec) is intentional and maps to `CustomEvent.sourceLabel` internally. Tests in `argus-core/src/commonTest/.../model/PublishCustomTest.kt` — recording `ArgusEventBus` captures one call; assert every field maps as documented (especially `source` → `sourceLabel`), default `metadata = emptyMap()`.

## Task 7 — WebUI: engine badges + sourceLabel multi-select dropdown

**Engine badge**:

- Edit `argus-webui/src/components/EventList/Row.ts` — in the HTTP branch, after the method span, append a small chip with the engine name (`KTOR` / `OKHTTP` / `URLCONN`). Add an `ENGINE_TONES: Record<string, string>` map (e.g., a new `argus-webui/src/components/EventList/badges.ts`); use distinct foreground colours.
- Edit `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts` `renderOverview` to show the engine pill next to the method.

**Source-label dropdown**:

- Edit `argus-webui/src/store/filters.ts`:
  - Add to `Filters`: `sourceLabels: ReadonlySet<string> | null` (`null` = "all", non-null = whitelist). Mirror in `MutableFilters`, `cloneFilters`, `DEFAULT_FILTERS` (`sourceLabels: null`), `isDefaultFilters`.
  - In `applyFilters`, in the `isCustomEvent` branch, after `tagQuery`: `if (f.sourceLabels && !f.sourceLabels.has(e.sourceLabel)) continue;`. AND-composes naturally with the source chip — if CUSTOM is off, custom events drop earlier.
- New component `argus-webui/src/components/FilterBar/SourceLabelDropdown.ts`:
  - `createSourceLabelDropdown(store: EventStore): HTMLElement` — popover with checkbox list. Driven by `computed(() => uniqueSourceLabels(store.events.value))` (Set over events; cap to first 50 to bound DOM).
  - "All" / "None" links; click-outside / Esc closes; checkbox toggle mutates `filters.sourceLabels`. Empty state: "No CUSTOM events yet".
  - Auto-updates on signal change; preserves checked state across rerenders.
- Wire into `argus-webui/src/components/FilterBar/FilterBar.ts` between source chips and method chips.
- Persistence: filters today are not persisted. The user's spec asks for source-label filter persistence — add scoped persistence only for `sourceLabels` via the existing `argus-webui/src/store/persistence.ts` helpers (`loadJson<string[] | null>('filters.sourceLabels', null)` + `effect()` on changes). Comment the asymmetry next to the load/save calls. Orphaned labels (selected but not present in current buffer) are preserved silently so the user's intent survives reconnects.

**Tests** in `argus-webui/src/store/__tests__/filters.test.ts` — `sourceLabels = null` (all pass), set with two labels (only matching pass), empty set (all CUSTOM excluded), AND-with-source-chips.

## Task 8 — Sample app updates

**Module deps** in `sample-android/build.gradle.kts`:

- `dependencies { debugImplementation(projects.argusOkhttp); debugImplementation(projects.argusUrlconnection); debugImplementation(libs.okhttp) }`. Add `okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version = "4.12.0" }` to the version catalog.
- The existing `verifyReleaseHasNoArgus` task already rejects `Lcom/lynxal/argus/`, which covers `com.lynxal.argus.okhttp.*` and `com.lynxal.argus.urlconnection.*`. No new exclusion. OkHttp itself only enters via `debugImplementation` so it stays out of release dex.

**Extend `DebugTools` interface** at `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt`:

```kotlin
fun publishCustom(source: String, label: String, payload: String)
fun fireOkHttpCall(url: String)
fun fireUrlConnectionCall(url: String)
```

Keeps the `androidMain` source set free of Argus library imports — only `androidDebug` sees them.

**Implement** in `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`:

- Lazily build an `OkHttpClient` with `ArgusOkHttpInterceptor(argus.eventBus, ArgusOkHttpConfig().apply { maxBodyBytes = 262_144L })`.
- `publishCustom` → `argus.eventBus.publishCustom(source, label, Direction.NONE, payload)`.
- `fireOkHttpCall(url)` runs on `Dispatchers.IO`: `okHttpClient.newCall(Request.Builder().url(url).build()).execute().use { it.body?.string() }`.
- `fireUrlConnectionCall(url)` runs on `Dispatchers.IO`: `val c = ArgusUrlConnection.wrap(URL(url).openConnection() as HttpURLConnection, argus.eventBus); try { c.connect(); c.inputStream.use { it.readBytes() } } finally { c.disconnect() }`.

**Stub** in `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` — empty no-op overrides for the three new methods.

**Wire UI** — pass three new lambdas into `SampleActions` (`onPublishCustom`, `onOkHttpCall`, `onUrlConnectionCall`) from `MainActivity` / `SampleApp`. Add three buttons in `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleScreen.kt`:

- "Emit custom event" → `actions.onPublishCustom()` calling `publishCustom("sample", "demo-event", "Hello from the sample app")`.
- "OkHttp call (jsonplaceholder /users/1)" → `actions.onOkHttpCall(...)`.
- "HttpURLConnection call (jsonplaceholder /posts)" → `actions.onUrlConnectionCall(...)`.

## Task 9 — Verification

End-to-end on `:sample-android`:

1. `./gradlew :sample-android:installDebug` and launch.
2. Tap each of the three new buttons; open the Argus browser UI at `http://<device>:8787`.
3. Confirm: a Ktor row, an OkHttp row, and a UrlConnection row appear with three distinct engine badges. Confirm the custom event appears and the source-label dropdown lists `sample`. Toggle the dropdown checkbox to confirm filtering works.
4. Run `./gradlew :sample-android:assembleRelease` — `verifyReleaseHasNoArgus` must still pass.

Tests:

- `./gradlew :argus-core:allTests` — capture helpers + `publishCustom`.
- `./gradlew :argus-okhttp:test` — interceptor matrix.
- `./gradlew :argus-urlconnection:test` — wrapper matrix.
- `./gradlew :argus-webui:test` — `sourceLabels` filter cases.
- `./gradlew :sample-android:assembleRelease` — dex verification.

---

## Critical files to modify or create

- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/InternalArgusApi.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/CapturedBody.kt` (move + promote from `ktor/`)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/BodyEncoding.kt` (new, lifted from `ktor/BodyCapture.kt`)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/HeaderRedaction.kt` (new, lifted from `ktor/Redaction.kt`)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/CaptureConfig.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/CaptureDefaults.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/correlation/ActiveCorrelationId.kt` (new — public JVM-thread-local read)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/HttpEvent.kt:8` (`engine` field)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt:12` (version bump)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/PublishCustom.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt` (consume shared helpers, pass `engine = "ktor"`)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt` (delegate defaults to `ArgusCaptureDefaults`)
- `argus-okhttp/build.gradle.kts` (new)
- `argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpInterceptor.kt` (new)
- `argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpConfig.kt` (new)
- `argus-okhttp/src/test/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpInterceptorTest.kt` (new)
- `argus-urlconnection/build.gradle.kts` (new)
- `argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/ArgusUrlConnection.kt` (new)
- `argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/ArgusHttpURLConnection.kt` (new)
- `argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/ArgusUrlConnectionConfig.kt` (new)
- `argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/TeeStreams.kt` (new)
- `argus-urlconnection/src/test/kotlin/com/lynxal/argus/urlconnection/ArgusHttpURLConnectionTest.kt` (new)
- `argus-webui/src/transport/schema.ts` (engine field, schema version bump)
- `argus-webui/src/components/EventList/Row.ts` (engine badge)
- `argus-webui/src/components/EventList/badges.ts` (new — engine tones)
- `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts` (engine pill)
- `argus-webui/src/components/FilterBar/SourceLabelDropdown.ts` (new)
- `argus-webui/src/components/FilterBar/FilterBar.ts` (mount dropdown)
- `argus-webui/src/store/filters.ts` (`sourceLabels` filter)
- `argus-webui/src/store/eventStore.ts` (persist `sourceLabels`)
- `settings.gradle.kts` (include new modules)
- `gradle/libs.versions.toml` (okhttp, mockwebserver versions)
- `sample-android/build.gradle.kts` (debug deps)
- `sample-android/src/androidMain/kotlin/com/lynxal/argus/sample/debug/DebugTools.kt` (interface extension)
- `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (impls)
- `sample-android/src/androidRelease/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt` (no-op stubs)
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleScreen.kt` (three buttons)
- `sample-android/src/commonMain/kotlin/com/lynxal/argus/sample/ui/SampleActions.kt` (lambdas)

## Reuse

- `argus-core/.../ktor/CapturedBody.kt`, `BodyCapture.kt`, `Redaction.kt` — extracted into the new `capture` package; the Ktor plugin becomes the first consumer of the shared helpers.
- `argus-core/.../correlation/CorrelationThreadLocal.kt` — already populated by `withCorrelation`; expose a new public reader (`activeCorrelationId()`) so OkHttp + UrlConnection interceptors can read without touching `internal`.
- `argus-core/.../model/CustomEvent.kt` — already has every field `publishCustom` needs; the new extension is pure ergonomics.
- OkHttp's `peekBody(byteCount)` and `Buffer` patterns — preferred over hand-rolled tee streams for the OkHttp module. Reference: `okhttp3.logging.HttpLoggingInterceptor`.
- WebUI persistence helpers in `argus-webui/src/store/persistence.ts` — reused for the `sourceLabels` slice.

## Standards applied

- `agent-os/standards/kmp/module-build-conventions.md` — version catalog usage, JVM 17 toolchain on the new pure-JVM modules.
- `agent-os/standards/kmp/module-boundaries.md` — `:argus-okhttp` and `:argus-urlconnection` depend down on `:argus-core`; no upward edges.
- `agent-os/standards/naming/package-structure.md` — `com.lynxal.argus.capture`, `com.lynxal.argus.okhttp`, `com.lynxal.argus.urlconnection` (singular folder names, one top-level decl per file).
- `agent-os/standards/naming/class-suffixes.md` — `Interceptor`, `Config`, `Plugin`-equivalent naming preserved.
- `agent-os/standards/coroutines/job-lifecycle.md` — sample app's OkHttp / `HttpURLConnection` calls run on `Dispatchers.IO`, never the main thread.
- `agent-os/standards/workflow/commit-conventions.md` — `feat:` prefix for the new modules and the engine badge; `refactor:` for the capture-helper lift; `chore:` for the schema version bump if landed alone.

## Cross-cutting risks

1. **Wire schema bump**: `ARGUS_SCHEMA_VERSION 1 → 2` will hard-reject mismatched WebUI clients on Hello. Acceptable since Argus is debug-only and ships in lockstep with the SPA bundle, but flag in `shape.md`.
2. **OkHttp request-body re-read**: capturing must not consume the original body. Detect `body.isOneShot()` and skip in that case; otherwise use `okio.Buffer` and rebuild the request with `RequestBody.create(body.contentType(), buffer.readByteString())`.
3. **`HttpURLConnection` override surface**: missing a forwarder hits the abstract base. Compare against Android's `DelegatingHttpsURLConnection` for the canonical method list.
4. **Auto-followed redirects** in `HttpURLConnection`: only the final URL is observable. Document and accept for Phase 3.
5. **`InternalArgusApi` opt-in** is a new public-surface concept. Document as "engine SPI; consumers should not annotate their own code with this."
6. **Body capture parity for OkHttp**: when `Content-Length` is `-1` (chunked), `truncatedTotalBytes` cannot be set accurately without consuming the full body — flag in KDoc.
7. **WebUI persistence asymmetry**: only `sourceLabels` persists; other filters do not. Comment next to the persistence call.

## Open implementation question

Confirm during Task 4 implementation whether `argus-core`'s existing `CorrelationThreadLocal` (currently `internal`) should be:
(a) re-exposed via a new public `activeCorrelationId(): String?` function (recommended, lighter), or
(b) made public + `@InternalArgusApi`-gated (consistent with the capture helpers).

Either is fine; (a) is the smaller blast radius for code outside the SPI lane.

---

## shape.md template (write into the spec folder during Task 1)

```markdown
# Argus Phase 3 — Shaping Notes

## Scope

Three Phase 3 deliverables:
1. New `:argus-okhttp` module — `okhttp3.Interceptor` (application-level) publishing `HttpEvent` to the same `ArgusEventBus` with consistent redaction and body caps.
2. New `:argus-urlconnection` module — `ArgusUrlConnection.wrap(HttpURLConnection)` capturing requests/responses on `HttpURLConnection`.
3. Public `ArgusEventBus.publishCustom(source, label, direction, payload, metadata)` extension — formal API for emitting custom events, replacing direct `eventBus.publish(CustomEvent(...))` boilerplate at call sites.
4. WebUI source-label filter — dropdown multi-select that discovers `sourceLabel`s dynamically from the live stream.
5. Sample app updates — three buttons (emit custom, OkHttp call, HttpURLConnection call) demonstrating mixed-source unified timeline.

## Decisions

- HttpEvent gets a new first-class `engine: String = "ktor"` field; wire schema bumps to v2.
- `:argus-okhttp` and `:argus-urlconnection` are pure-JVM (`kotlin("jvm")`), JVM 17 — OkHttp & HttpURLConnection are JVM-only.
- Source-label filter UI is a dropdown multi-select with auto-discovery from the live event buffer; selection persisted, other filters intentionally not persisted.
- Body-capture & redaction helpers extracted from `:argus-core/.../ktor/` into a new `com.lynxal.argus.capture` package and exposed via `@InternalArgusApi` opt-in.
- `publishCustom` parameter named `source` per spec (maps to `CustomEvent.sourceLabel`).
- Sample app: emit-custom + OkHttp + HttpURLConnection buttons (debug-only).

## Context

- **Visuals:** None.
- **References:** Phase 2 spec (`agent-os/specs/2026-04-30-1004-argus-phase2/`) for the file/feature layout convention, Ktor `ArgusClientPlugin.kt` for the interceptor pattern to mirror, OkHttp's `HttpLoggingInterceptor` for request-body re-read pattern, Android's `DelegatingHttpsURLConnection` for the `HttpURLConnection` override list.
- **Product alignment:** Closes the "third-party SDK using OkHttp/HttpURLConnection is invisible to Argus" gap that's been blocking unified-timeline use cases.

## Standards Applied

- kmp/module-build-conventions — JVM 17 toolchain, version catalog.
- kmp/module-boundaries — new modules depend down on `:argus-core`.
- naming/package-structure — new packages `capture`, `okhttp`, `urlconnection`.
- naming/class-suffixes — `Interceptor`, `Config`.
- coroutines/job-lifecycle — sample app's HTTP calls on `Dispatchers.IO`.
- workflow/commit-conventions — `feat:`, `refactor:`, `chore:` prefixes.
```
