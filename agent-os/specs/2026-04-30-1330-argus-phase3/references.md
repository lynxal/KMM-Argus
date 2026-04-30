# References for Argus Phase 3

## Similar Implementations

### Existing Ktor plugin — pattern to mirror for OkHttp/HttpURLConnection

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/`
- **Files:** `ArgusClientPlugin.kt`, `ArgusClientConfig.kt`, `BodyCapture.kt`, `Redaction.kt`, `CapturedBody.kt`, `CapturedRequest.kt`, `ArgusAttributes.kt`
- **Relevance:** The Ktor plugin establishes the canonical capture pattern: redact headers, cap body bytes (or bypass for full-body hosts), encode text vs. base64, build `HttpRequest` / `HttpResponse` snapshots, emit `HttpEvent` to `ArgusEventBus`. Both new modules must produce events that look identical to a Ktor-emitted event modulo `engine`.
- **Key patterns to borrow:**
  - `effectiveMaxBytes(host, cfg)` — host-bypass logic to be lifted into `:argus-core/.../capture/`.
  - `buildRedactedHeaders` — header redaction list and `***redacted***` placeholder.
  - `encodeCapturedBytes` — text-vs-base64 detection and truncation marker math.
  - Correlation read at request start, stamped on the emitted event.

### Phase 2 spec — formatting and conventions

- **Location:** `agent-os/specs/2026-04-30-1004-argus-phase2/`
- **Relevance:** Formatting model for `plan.md`, `shape.md`, `standards.md`, `references.md`. Also documents the `NoopEvent*` pattern, `ArgusJson`, the `ArgusAttributes` key idiom, and the `withCorrelation` / `ArgusCorrelationId` / `CorrelationThreadLocal` triad that Phase 3's two new interceptors read from.

### OkHttp's HttpLoggingInterceptor — request body re-read pattern

- **Location:** Upstream OkHttp source — `okhttp3.logging.HttpLoggingInterceptor`.
- **Relevance:** OkHttp's own logging interceptor faces the same challenge: capture request bodies without consuming the underlying source. Reference for the `body.isOneShot()` check and the `okio.Buffer` clone-then-rebuild approach.
- **Key patterns:**
  - `if (body == null || body.isOneShot()) skip` — never consume one-shot bodies.
  - Write into `Buffer`, then rebuild request: `RequestBody.create(body.contentType(), buffer.readByteString())`.
  - Use `response.peekBody(byteCount)` for non-consuming response capture.

### Android's DelegatingHttpsURLConnection — HttpURLConnection override checklist

- **Location:** Android open-source — `android.net.http.X509TrustManagerExtensions` neighbor (or AOSP `okhttp.internal.huc.DelegatingHttpsURLConnection`).
- **Relevance:** The canonical list of `HttpURLConnection` properties and methods that a delegating subclass must forward. `HttpURLConnection` has dozens of methods; missing a forwarder lands on the abstract base and breaks consumers.
- **Key patterns:**
  - All property setters/getters delegate.
  - `connect()`, `disconnect()`, `getInputStream()`, `getOutputStream()`, `getErrorStream()`, `getResponseCode()`, `getResponseMessage()`, `getHeaderFields()`, `usingProxy()` overridden.
  - Lazy state (e.g., response code) cached on first access.

### Sample app — debug-only Argus install precedent

- **Location:** `sample-android/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt`
- **Relevance:** Phase 3's three new debug buttons follow the same pattern: `androidMain` defines a `DebugTools` interface; `androidDebug` provides the real implementation that touches Argus libraries; `androidRelease` provides no-op stubs so release builds never see Argus classes.
- **Verification gate:** `verifyReleaseHasNoArgus` task in `:sample-android/build.gradle.kts` dexdumps the release APK and rejects any `Lcom/lynxal/argus/` classes. Both new module packages (`com.lynxal.argus.okhttp`, `com.lynxal.argus.urlconnection`) are already covered by this prefix check.

### WebUI filter store — pattern for `sourceLabels` slice

- **Location:** `argus-webui/src/store/filters.ts`
- **Relevance:** `Filters` interface, `applyFilters()` function, `DEFAULT_FILTERS`, `cloneFilters`, `isDefaultFilters` — Phase 3 extends this with a new `sourceLabels: ReadonlySet<string> | null` field.

### WebUI persistence helpers — for `sourceLabels` only

- **Location:** `argus-webui/src/store/persistence.ts`
- **Relevance:** `loadJson` / `saveJson` helpers used today for the correlation-column toggle. Phase 3 adds a single new key `'filters.sourceLabels'` (other filters intentionally remain non-persistent).

## Reuse Summary

| Phase 3 deliverable | Reuses |
|---|---|
| `:argus-okhttp` interceptor | Lifted `capture/` helpers; `activeCorrelationId()` reader |
| `:argus-urlconnection` wrapper | Same as above |
| `engine` field | `HttpEvent` data class (additive change with default) |
| `publishCustom` | Existing `CustomEvent` model + `ArgusEventBus.publish` |
| WebUI engine badge | Existing `Row.ts` chip rendering pattern |
| WebUI source-label dropdown | Existing `FilterBar` chip wrapper, `persistence.ts`, `filters.ts` |
| Sample app buttons | Existing `DebugTools` debug/release split |
