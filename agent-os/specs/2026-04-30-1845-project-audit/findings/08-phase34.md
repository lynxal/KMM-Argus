# Phase 3 / Phase 4 Modules Audit

User decision: these are in-scope, audit as first-class. Spec §7 marks them
deferred but they ship on `main` and the audit treats them as canonical
engines. Drift-against-spec is therefore not flagged here.

Reference Ktor plugin (the parity baseline):
`argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:33`.
Shared capture primitives reused by all three engines:
`argus-core/src/commonMain/kotlin/com/lynxal/argus/capture/CaptureDefaults.kt:1`,
`HeaderRedaction.kt:5`, `BodyEncoding.kt:23`, `CapturedRequest.kt:7`.

---

## :argus-okhttp

### Module structure
- Pure JVM module (`alias(libs.plugins.kotlinJvm)`, no KMP), at
  `argus-okhttp/build.gradle.kts:1`. `explicitApi()` enabled
  (`argus-okhttp/build.gradle.kts:9`).
- `api(projects.argusCore)` and `compileOnly(libs.okhttp)` so consumers bring
  their own OkHttp version (`argus-okhttp/build.gradle.kts:19-20`). Test scope
  pulls in `okhttp` + `okhttp.mockwebserver`.
- Layout uses standard JVM source set: `src/main/kotlin/...`,
  `src/test/kotlin/...` (no `commonMain`/platform splits — JVM-only).
- Maven coordinates `com.lynxal.argus:argus-okhttp:0.0.1`
  (`argus-okhttp/build.gradle.kts:35`).
- Opt-ins for `kotlin.time.ExperimentalTime`, `kotlin.uuid.ExperimentalUuidApi`,
  and `InternalArgusApi` via `freeCompilerArgs`
  (`argus-okhttp/build.gradle.kts:11-15`).

### Public API surface
- `ArgusOkHttpInterceptor(eventBus, config = ArgusOkHttpConfig())` — single
  entry point implementing `okhttp3.Interceptor`
  (`argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpInterceptor.kt:38`).
- `ArgusOkHttpConfig` — POKO with `maxBodyBytes`, `redactHeaders`,
  `captureRequestBody`, `captureResponseBody`, `fullBodyHosts`
  (`argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpConfig.kt:5`).
  Defaults pulled from `ArgusCaptureDefaults`
  (`argus-okhttp/src/main/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpConfig.kt:6-7`).
- KDoc on the interceptor (lines 24-37) explicitly tells users to install at
  *application* level (so OkHttp redirects/retries don't duplicate captures)
  and documents the chunked-encoding `truncatedTotalBytes = null` limitation.
- Sample integration:
  `sample/src/androidDebug/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt:43-50`.

### Capture parity table (vs Ktor plugin)

| Field                              | Ktor plugin (commonMain)                                    | :argus-okhttp                                                                              | Match? |
|------------------------------------|-------------------------------------------------------------|--------------------------------------------------------------------------------------------|--------|
| `id` (UUID v4)                     | `Uuid.random()` (`ArgusClientPlugin.kt:38`)                 | `Uuid.random()` (`ArgusOkHttpInterceptor.kt:45`)                                            | ✅     |
| `timestamp` (start, ms epoch)      | `Clock.System.now()` (`ArgusClientPlugin.kt:39`)            | `Clock.System.now()` (`ArgusOkHttpInterceptor.kt:46`)                                       | ✅     |
| `durationMs`                       | `now - startMs` (`ArgusClientPlugin.kt:147`)                | `now - startMs` (`ArgusOkHttpInterceptor.kt:72`)                                            | ✅     |
| Method                             | `request.method.value` (`ArgusClientPlugin.kt:45`)          | `request.method` (`ArgusOkHttpInterceptor.kt:151`)                                          | ✅     |
| Full URL                           | `request.url.buildString()` (`ArgusClientPlugin.kt:46`)     | `url.toString()` (`ArgusOkHttpInterceptor.kt:161,205`)                                      | ✅     |
| Host                               | `request.url.host` (`ArgusClientPlugin.kt:47`)              | `url.host` (`ArgusOkHttpInterceptor.kt:162,206`)                                            | ✅     |
| Path (with query)                  | `encodedPath`, `"/"` if empty (`ArgusClientPlugin.kt:48`)   | `encodedPath` + `?encodedQuery` (`ArgusOkHttpInterceptor.kt:153-154`)                       | ✅ (richer: ktor drops query) |
| Request headers + redaction        | `toArgusHeaders` via `buildRedactedHeaders`                 | `Headers.toRedactedHeaders` → `buildRedactedHeaders` (`ArgusOkHttpInterceptor.kt:133-138`)  | ✅     |
| Request body (cap)                 | `captureRequestPayload` w/ `effectiveMaxBytes`              | Buffer → `peek().readByteArray(min(size,cap))` → `encodeCapturedBytes` (lines 187-198)      | ✅     |
| Request body — one-shot            | n/a (Ktor abstracts)                                        | Skipped to avoid consuming (lines 170-185); only metadata captured                          | ✅ safe handling |
| Status code + text                 | `response.status.value/.description`                        | `response.code/.message` (`ArgusOkHttpInterceptor.kt:74-75`)                                | ✅     |
| Response headers + redaction       | `response.headers.toArgusHeaders`                           | `response.headers.toRedactedHeaders` (line 76)                                              | ✅     |
| Response body (cap)                | `captureSide.drainWithCap(maxBytes)` (channel split)        | `response.peekBody(readLimit)` then `encodeCapturedBytes` (lines 214-228)                   | ✅     |
| Body content-type                  | `wrappedResponse.contentTypeOrNull()`                       | `body.contentType()?.toString()` (line 79)                                                  | ✅     |
| Body size                          | `body?.sizeBytes`                                           | `body?.sizeBytes ?: contentLength` (line 80)                                                | ✅     |
| Truncation marker                  | `bodyTruncatedTotalBytes` from `encodeCapturedBytes`        | Same helper; same field (line 78)                                                           | ✅ for known length / ⚠ for chunked (`-1` content-length → `null` per KDoc) |
| Error → `HttpError`                | `toHttpError()` (`ArgusClientPlugin.kt:230`)                | `HttpError(simpleName, message, stackTraceToString)` (lines 112-115)                        | ✅     |
| `correlationId`                    | `coroutineContext[ArgusCorrelationId]` (line 42-43)         | `activeCorrelationId()` (line 47)                                                           | ✅     |
| `engine` discriminator             | `"ktor"` (line 169)                                         | `"okhttp"` (lines 92, 119)                                                                  | ✅     |

### Redaction
- Goes through the shared `buildRedactedHeaders`
  (`HeaderRedaction.kt:5`) so it inherits case-insensitive matching, the
  `***redacted***` placeholder constant, and the `Header.redacted = true`
  flag. Default set is `Authorization`, `Cookie`, `Set-Cookie`,
  `Proxy-Authorization` (`ArgusOkHttpConfig.kt:7` → `ArgusCaptureDefaults.REDACT_HEADERS`).
- Symmetric: applied to both request (line 155) and response (line 76) headers.
- Test asserts `Authorization` is redacted, value is `***redacted***`, flag is
  `true`
  (`argus-okhttp/src/test/kotlin/com/lynxal/argus/okhttp/ArgusOkHttpInterceptorTest.kt:73-87`).

### Streaming safety
- Application-level interceptor, so it sees pre-network requests (lines 32-36
  KDoc).
- Response body is captured via `response.peekBody(readLimit)` (line 218),
  which is OkHttp's idiomatic non-consuming peek — the original consumer still
  receives the full body untouched. ✅
- Request body: when non-`isOneShot`, the interceptor writes the body to a
  `Buffer`, peeks the prefix, then **rebuilds the request** with
  `buffer.readByteString().toRequestBody()` so the chain still sees the bytes
  (lines 187-201). When `isOneShot()`, the interceptor *skips* body capture
  and forwards the original request unmodified (lines 170-185). ✅
- Test verifies the chain still receives the body
  (`ArgusOkHttpInterceptorTest.kt:125-142`: `server.takeRequest().body.readUtf8()`
  matches the payload).
- **Risk (minor):** `body.writeTo(buffer)` materialises the entire request
  body in memory regardless of `effectiveMax`, even though only `cap` bytes
  are kept for capture. For a 200 MB upload with `maxBodyBytes = 1 MB` this
  costs 200 MB of transient heap. The Ktor plugin uses channel teeing and
  doesn't have this issue. Not a correctness bug, but a memory ceiling worth
  documenting.

### KDoc / tests
- KDoc on `ArgusOkHttpInterceptor` (lines 24-37) — install location, chunked
  caveat. KDoc on `ArgusOkHttpConfig.fullBodyHosts` (lines 11-14). The
  interceptor's primary constructor has no KDoc on individual params (minor).
- Tests (`ArgusOkHttpInterceptorTest.kt:31`): six tests covering 200 happy
  path, redaction, oversized body truncation, `fullBodyHosts` bypass, request
  body POST round-trip, and IOException (via failing `SocketFactory`). Uses
  MockWebServer. ✅

### Notes & risks
- `okhttp` is `compileOnly`; consumers must depend on OkHttp themselves. POM
  doesn't declare it as a runtime dep, which is correct for an interceptor lib
  but worth a README mention.
- The request-body-buffering memory cost noted above.
- Application-level interceptor placement misses redirects/retries — that's
  documented in KDoc and is the right trade-off (matches the user's mental
  model of what they sent), but the README should say the same.
- No KDoc on `ArgusOkHttpConfig` properties other than `fullBodyHosts`.

---

## :argus-urlconnection

### Module structure
- JVM-only module (`alias(libs.plugins.kotlinJvm)`),
  `argus-urlconnection/build.gradle.kts:1`. `explicitApi()` enabled (line 9).
- `api(projects.argusCore)`, no compile dep on OkHttp; tests use mockwebserver
  for a real HTTP server (lines 19-23).
- Layout: `src/main/kotlin/...`, `src/test/kotlin/...`.
- Maven coordinates `com.lynxal.argus:argus-urlconnection:0.0.1` (line 33).

### Public API surface
- `ArgusUrlConnection.wrap(connection, eventBus, config = ArgusUrlConnectionConfig())`
  — `object`-style entry point returning a `HttpURLConnection`
  (`argus-urlconnection/src/main/kotlin/com/lynxal/argus/urlconnection/ArgusUrlConnection.kt:23-29`).
- `ArgusHttpURLConnection` — the wrapping implementation,
  marked `internal class`
  (`ArgusHttpURLConnection.kt:25`).
- `ArgusUrlConnectionConfig` — same shape as the OkHttp config:
  `maxBodyBytes`, `redactHeaders`, `captureRequestBody`,
  `captureResponseBody`, `fullBodyHosts`
  (`ArgusUrlConnectionConfig.kt:5`).
- KDoc on `ArgusUrlConnection` includes a usage example (lines 6-22) and
  notes that `instanceFollowRedirects` means only the final URL is observable
  (lines 20-22).

### Capture parity table (vs Ktor plugin)

| Field                         | Ktor plugin                                    | :argus-urlconnection                                                           | Match? |
|-------------------------------|-----------------------------------------------|--------------------------------------------------------------------------------|--------|
| `id`                          | `Uuid.random()`                                | `Uuid.random()` (`ArgusHttpURLConnection.kt:31`)                                | ✅     |
| `timestamp`                   | `Clock.System.now().toEpochMilliseconds()`     | same (line 32)                                                                  | ✅     |
| `durationMs`                  | now − start                                    | now − start (lines 209, 269)                                                    | ✅     |
| Method                        | request.method.value                            | `delegate.requestMethod` (line 290)                                             | ✅     |
| URL                           | `buildString()`                                 | `delegate.url.toString()` (line 304)                                            | ✅     |
| Host                          | `request.url.host`                              | `delegate.url.host` (line 305)                                                  | ✅     |
| Path (+ query)                | `encodedPath`, `"/"` if empty                   | `u.path.ifEmpty{"/"}` + `?$query` (line 306)                                    | ✅     |
| Request headers + redaction   | `buildRedactedHeaders`                          | `buildRequestHeaders` → `buildRedactedHeaders` (lines 312-316)                  | ✅     |
| Request body                  | `captureRequestPayload`                         | `TeeOutputStream` → `encodeCapturedBytes` (lines 153-159, 293-301)              | ✅     |
| Status code                   | `response.status.value`                         | `delegate.responseCode` (line 245)                                              | ✅     |
| Status text                   | `response.status.description`                   | `delegate.responseMessage ?: ""` (line 246)                                     | ✅     |
| Response headers              | `toArgusHeaders`                                | `delegate.headerFields` → `buildRedactedHeaders` (lines 318-327)                | ⚠ Includes the HTTP/1.1 "status line" entry — `headerFields` returns it under a `null` key, which is filtered (line 322), so output should be clean |
| Response body (cap)           | `captureSide.drainWithCap(maxBytes)`            | `TeeInputStream` (lines 161-175, 41-91)                                         | ✅     |
| Truncation marker             | `bodyTruncatedTotalBytes`                       | `encodeCapturedBytes` (lines 232-242)                                           | ✅     |
| Error → `HttpError`           | `toHttpError()`                                 | Built inline (lines 277-281)                                                    | ✅ same shape |
| `correlationId`               | from CoroutineContext                           | `activeCorrelationId()` (line 33)                                               | ✅     |
| `engine` discriminator        | `"ktor"`                                        | `"urlconnection"` (lines 227, 262, 284)                                         | ✅     |

### Redaction
- Same `buildRedactedHeaders` helper (`ArgusHttpURLConnection.kt:315`, 326)
  → identical case-insensitive matching, placeholder, and `redacted` flag.
- Default redaction set inherited from `ArgusCaptureDefaults`
  (`ArgusUrlConnectionConfig.kt:7`).
- Symmetric to req/resp.
- Test asserts `Authorization` redaction
  (`ArgusHttpURLConnectionTest.kt:71-89`).

### Streaming safety
- Request side: `TeeOutputStream` writes to *both* the delegate stream and a
  bounded `ByteArrayOutputStream`, capping the in-memory capture at `cap` but
  always forwarding every byte to the network
  (`TeeStreams.kt:12-39`). `totalWritten` tracks the full size for the
  truncation marker. ✅
- Response side: `TeeInputStream` is a `FilterInputStream` that returns each
  byte to the consumer first, then captures into the bounded buffer
  (`TeeStreams.kt:41-91`). ✅
- **Risk (medium):** the response tee emits the `HttpEvent` via the
  `onComplete` callback only when EOF (`-1`) is reached or `close()` is
  called (lines 51-91). If the consumer reads partway and abandons the stream
  without closing it (no `use{}`), the event is never emitted. Mitigation:
  `disconnect()` calls `emitIfNeeded()` which emits a *zero-body* event
  (`ArgusHttpURLConnection.kt:63-66`, `196-205`). So consumers that always
  call `disconnect()` are fine, but those who skip both close and disconnect
  will silently lose the capture.
- **Risk (high):** `emitIfNeeded()` (lines 196-205) emits an event with an
  **empty body** (`ByteArray(0)`) and `totalRead = 0` even when the tee did
  capture data, because the `tee` value is *not* read out — the `if (tee !=
  null)` branch and the `else` branch are identical (both pass empty bytes).
  This means: consumer reads response bytes one-by-one then calls
  `disconnect()` *before* the stream is closed → event missing the response
  body entirely. Test `ArgusHttpURLConnectionTest.kt` happens to always close
  via `use{}` so this latent bug is not exercised.
- **Risk (medium):** When the consumer calls `disconnect()` *after* the
  stream's `close()` (the standard pattern), the `TeeInputStream.onComplete`
  callback already fired and the second `emitIfNeeded()` is a no-op via
  `emitted.compareAndSet(false, true)` — that path is safe.
- **Risk (low):** `TeeInputStream.read(b, off, len)` on partial-read of `n`
  bytes records exactly `n` bytes but copies from `b[off..off+toCopy)`
  (`TeeStreams.kt:73-77`) — the slice may be only the first portion of the
  read, but since the bounded buffer is monotonic this is fine.

### KDoc / tests
- KDoc on `ArgusUrlConnection` (lines 6-22) with usage example. None on the
  internal wrapper or on `ArgusUrlConnectionConfig` properties beyond
  `fullBodyHosts`.
- Tests (`ArgusHttpURLConnectionTest.kt`): seven tests including 200 happy
  path, redaction, truncation, fullBodyHosts bypass, POST request body, 4xx
  error stream surfacing, and IOException at `responseCode`.

### Notes & risks
- The "abandoned input stream" + "disconnect-before-close" path drops the
  response body capture (see streaming risks above). Consider always reading
  `tee.captureBuffer` in `emitIfNeeded()` so a partial capture survives.
- `ArgusHttpURLConnection` overrides ~30 methods of `HttpURLConnection`
  (lines 59-149). Any future JDK addition to that surface will be silently
  forwarded only if defaulted on the abstract base; methods like
  `setAuthenticator`, `getRequestProperties` modifications via reflection,
  etc., aren't intercepted. Acceptable for v1.
- No coverage of HTTPS-specific paths (`HttpsURLConnection`); wrapping a
  HttpsURLConnection downcasts back to plain `HttpURLConnection`, losing
  `getCipherSuite()` etc. for the consumer. Document or extend.

---

## :argus-ios

### Module structure
- KMP module, iOS targets only (`iosX64`, `iosArm64`, `iosSimulatorArm64`)
  (`argus-ios/build.gradle.kts:10-19`). All three required by the audit
  task — present.
- `applyDefaultHierarchyTemplate()` (line 21) so `iosMain` aggregates the
  three platform source sets.
- Source layout:
  `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/{Argus,ArgusHandle,AppInfoBuilder,LocalIp}.kt`
  and `argus-ios/src/iosMain/kotlin/com/lynxal/argus/db/IosArgusDriverFactory.kt`.
  Tests under `argus-ios/src/iosTest/kotlin/...`.
- Dependencies (lines 24-31): `api(projects.argusCore)`,
  `api(projects.argusServerCore)`, kotlinx-coroutines-core,
  sqldelight-native-driver. ✅
- Framework wiring (lines 15-19):
  ```
  baseName = "argus-ios"
  isStatic = useStaticFramework  // default true via property
  ```
  Per-target `binaries.framework` rather than an `XCFramework` aggregate task.
  The sample app links the `:argus-ios` module Gradle-side via Cocoapods/SPM
  is **not** the path used — the sample uses `implementation(projects.argusIos)`
  inside `iosMain` (`sample/build.gradle.kts:65-67`), so the consumer module
  pulls the kotlin metadata directly. The test gate
  `verifyIosReleaseHasNoArgus` (`sample/build.gradle.kts:206-270`)
  validates the seam by `strings`-grepping the produced `Sample.framework`
  binary for any `com.lynxal.argus.*` or Ktor-server symbol — the gate is in
  place and added to `check`
  (`sample/build.gradle.kts:272-275`).
- Maven coordinates `com.lynxal.argus:argus-ios:0.0.1`. POM description
  states the module is debug-only (line 54).

### Public API surface
- `Argus.start(configure: ArgusConfigBuilder.() -> Unit = {}): ArgusHandle`
  — `object` entry point in `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/Argus.kt:19`.
- `ArgusHandle` (`ArgusHandle.kt:12`) exposes:
  - `eventBus: ArgusEventBus` (line 16)
  - `url: StateFlow<String?>` (line 19) — the listening URL becomes non-null
    once `server.start()` resumes (line 25).
  - `stop()` (line 28) — stops server, cancels scope, clears URL.
- `IosArgusDriverFactory` (`IosArgusDriverFactory.kt:11`) — public, used by
  `Argus.start` to build a `SqlDelightEventStore` when persistence is enabled.
  Has KDoc (lines 7-10).
- `AppInfoBuilder` is `internal object` — fine.
- `LocalIp` is `internal object` — fine, with KDoc (lines 23-29).

### actual class ArgusServer? — does not apply
The audit task expects an `actual class ArgusServer`. **There is no
`expect`/`actual` split** in the codebase. `ArgusServer` is a single
`public class` in `argus-server-core/src/commonMain/...`
(`argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusServer.kt:30`).
The KDoc explicitly says (lines 27-29):

> The Ktor CIO engine is multiplatform (JVM, Android, iOS), so the
> implementation lives in commonMain with no expect/actual split.

This contradicts spec §3.3 ("Only platform binding and lifecycle are
platform-specific (`expect class ArgusServer`)") and the audit checklist.
**Pragmatic reality:** Ktor 3.x CIO server engine *does* compile for Apple
targets, so the unified-commonMain approach works. The spec is stale rather
than the implementation being wrong, but the audit deliverable should call
this out as a deliberate design decision, not a missing piece.

### Engine
- `ArgusServer` uses `io.ktor.server.cio.CIO`
  (`argus-server-core/.../ArgusServer.kt:9, 71`). Confirmed CIO, not Darwin/NIO.
  The audit task said "Darwin/NIO" — Ktor server doesn't have a Darwin engine
  (only the *client* does). CIO is the right choice and is Apple-target
  compatible in Ktor 3.x.

### iOS sample app
- `sample/iosApp/iosApp.xcodeproj` exists; `sample/iosApp/iosApp/iOSApp.swift`
  is the entry. Source-set-driven seam:
  `sample/src/iosArgusEnabledMain/.../DebugToolsImpl.kt` wires `Argus.start{}`,
  `ArgusLoggerDelegate`, and the Ktor `ArgusPlugin`
  (`sample/src/iosArgusEnabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt:25-83`).
  `sample/src/iosArgusDisabledMain/.../DebugToolsImpl.kt` is the no-op release
  twin, with a header comment forbidding `com.lynxal.argus.*` imports
  (`sample/src/iosArgusDisabledMain/kotlin/com/lynxal/argus/sample/debug/DebugToolsImpl.kt:1-5`).
- The toggle is the Gradle property `argusEnabled` (default `false`),
  switching the `iosMain` srcDir between the two
  (`sample/build.gradle.kts:15-16, 58-69`). The Xcode build phase script is
  expected to set `-PargusEnabled=true` for Debug and `false` for Release.
  This is the "Android debug source set" pattern reproduced for iOS — clever
  and CI-verifiable. ✅
- iOS-side `fireOkHttpCall` and `fireUrlConnectionCall` are deliberate no-ops
  (lines 63-69) since both engines are JVM-only. Acceptable.

### Source sets configured
- `iosX64`, `iosArm64`, `iosSimulatorArm64` in both `:argus-ios`
  (`argus-ios/build.gradle.kts:10-19`) and `:sample`
  (`sample/build.gradle.kts:25-34`). ✅

### Framework wiring
- `isStatic = useStaticFramework` (default true) means a static framework per
  target. **There is no `XCFramework` aggregate task** in `argus-ios` —
  consumers must use Gradle/Kotlin Multiplatform's `embedAndSignAppleFrameworkForXcode`-style
  wiring (which is implicit when the consumer is itself a KMP project as
  `:sample` is). For non-KMP iOS consumers (Swift-only Xcode project),
  there's no published `.xcframework` artifact. Worth flagging as a
  limitation if anyone wants to consume `:argus-ios` from a non-KMP iOS app.
- The agent-os standards reference (per audit prompt) calls for "Static
  framework or XCFramework wiring per
  agent-os/standards/kmp/module-build-conventions". The static-framework path
  is taken, no XCFramework. Pass-with-note.

### `Dispatchers.IO` / `kotlinx.coroutines.IO` import smell
- `argus-ios/src/iosMain/kotlin/com/lynxal/argus/ios/Argus.kt:13` —
  `import kotlinx.coroutines.IO` is **present** alongside
  `import kotlinx.coroutines.Dispatchers` (line 12). Usage at line 31
  (`SupervisorJob() + Dispatchers.IO`). ✅ matches the user's auto-memory
  guidance.
- This is the only use of `Dispatchers.IO` in `:argus-ios`'s commonMain (no
  commonMain in `:argus-ios` — it's iosMain only, but the rule still applies
  for Native targets).
- Note: `argus-server-core/src/commonMain/.../EventRingBuffer.kt:147,153`
  *also* uses `scope.launch(Dispatchers.IO)`, but that file (line 10)
  imports only `kotlinx.coroutines.Dispatchers` — no `kotlinx.coroutines.IO`.
  Per the user's note, that is the K/N gotcha. **Smell flagged in
  `:argus-server-core`, not in `:argus-ios`.** This is outside this audit
  slice but is the kind of issue the iOS Native build will surface; mention
  to the parent audit.

### KDoc / tests
- KDoc:
  - `Argus` object: no class-level KDoc (smell — public entry point with no
    docstring).
  - `ArgusHandle`: no class-level KDoc; `url`/`eventBus`/`stop` undocumented.
  - `IosArgusDriverFactory`: KDoc present.
  - `LocalIp`: KDoc present (internal).
  - `AppInfoBuilder`: no KDoc (internal).
- Tests: only `AppInfoBuilderTest`
  (`argus-ios/src/iosTest/kotlin/com/lynxal/argus/ios/AppInfoBuilderTest.kt`),
  4 lines of assertion. **No test for `Argus.start()` start/stop**, no test
  for `LocalIp.firstIPv4()`, no smoke test for `ArgusHandle.url` populating.
  Spec §6.10 requires that `:argus-android` includes "at least a smoke test
  for ArgusServer.start() and stop()"; the symmetric expectation for
  `:argus-ios` is absent.

### Notes & risks
- Spec drift: spec says `expect class ArgusServer`, code uses one
  commonMain class (deliberate; CIO engine is multiplatform). Update the
  spec to match.
- No XCFramework artifact for non-KMP Swift consumers.
- Test coverage is thin (one trivial test).
- No KDoc on the `Argus` entry point or `ArgusHandle`.
- `Argus.start` returns the handle synchronously while the server starts in
  a launched coroutine (`Argus.kt:34-37`). `handle.url` will be `null` until
  `onStarted()` runs. Consumers must observe the `StateFlow`. KDoc should say
  this loudly.
- No way to observe `start()` failure: if `server.start()` throws inside the
  launched coroutine (`Argus.kt:35`), the exception is swallowed by the
  `SupervisorJob` and `handle.url` stays `null` forever with no surfaced
  error.

---

## Cross-module summary

Engine parity table consolidating all three engines vs the canonical Ktor
plugin (HTTP-capture engines only — `:argus-ios` is a server module, not a
capture engine).

| Capability                          | Ktor (canonical) | OkHttp | UrlConnection |
|-------------------------------------|------------------|--------|---------------|
| Engine discriminator                | `"ktor"`         | `"okhttp"` | `"urlconnection"` |
| UUID v4 id, ms-epoch start ts       | ✅               | ✅      | ✅             |
| Method, URL, host, path             | ✅               | ✅ (path includes query) | ✅ (path includes query) |
| Full headers, default redaction set | ✅               | ✅ (shared helper)        | ✅ (shared helper)        |
| `Header.redacted` flag              | ✅               | ✅      | ✅             |
| Request body cap, truncation marker | ✅               | ✅ (full-body buffered then trimmed) | ✅ (TeeOutputStream, monotonic) |
| Streaming-safe request capture      | ✅ (channel split) | ⚠ buffers entire body before send | ✅ (tee) |
| Response status code + text         | ✅               | ✅      | ✅             |
| Response body cap, truncation       | ✅               | ✅ (peekBody, contentLength=-1 → null total) | ✅ (TeeInputStream)            |
| Streaming-safe response capture     | ✅               | ✅ (peekBody) | ⚠ relies on close()/disconnect(); `emitIfNeeded` discards captured tee bytes (latent bug) |
| Error capture                       | ✅               | ✅      | ✅             |
| `correlationId` plumbed             | ✅ (CoroutineContext) | ✅ (activeCorrelationId()) | ✅ (activeCorrelationId()) |
| `fullBodyHosts` per-host bypass     | ✅               | ✅      | ✅             |
| KDoc on entry point                 | ✅               | ✅      | ✅             |
| Tests in `commonTest` / `test`      | ✅ (commonTest)  | ✅ (test/, JUnit + MockWebServer) | ✅ (test/, JUnit + MockWebServer) |

`:argus-ios` separately delivers:

| iOS deliverable                              | Status  |
|----------------------------------------------|---------|
| `iosX64` / `iosArm64` / `iosSimulatorArm64`  | ✅      |
| Static framework wiring                      | ✅ (no XCFramework — flag) |
| `actual class ArgusServer`                   | n/a — single commonMain class (spec drift) |
| Server engine                                | Ktor CIO (works on Apple targets) |
| iOS sample wired via Argus-enabled/disabled source-set seam | ✅ |
| Release-clean gate (`verifyIosReleaseHasNoArgus`) | ✅ |
| `Dispatchers.IO` + explicit `kotlinx.coroutines.IO` import | ✅ |
| KDoc on `Argus` / `ArgusHandle`              | ❌ (missing) |
| Tests beyond `AppInfoBuilder`                | ❌ (no smoke test) |

---

## Recommendation

| Module                   | Verdict        | Rationale |
|--------------------------|----------------|-----------|
| `:argus-okhttp`          | **ready**      | Field-parity with Ktor plugin, streaming-safe via OkHttp's `peekBody`, explicit one-shot handling, decent tests. Two minor follow-ups: doc the request-body buffering memory cost, doc the chunked-encoding `truncatedTotalBytes = null` limitation in the README (it's already in KDoc). |
| `:argus-urlconnection`   | **needs-work** | Latent bug in `emitIfNeeded()` (`ArgusHttpURLConnection.kt:196-205`): when `disconnect()` fires before the response stream is closed, the captured tee bytes are *discarded* and the event ships with an empty body. Fix: read `requestTee?.capturedBytes` and any captured response bytes (need to expose those from `TeeInputStream`) before publishing the empty-body record. Add a regression test that asserts a full body capture after `disconnect()` without `close()`. |
| `:argus-ios`             | **needs-work** | Ships a working iOS server, sample, and release-clean gate, but: (a) no smoke test for `Argus.start()`/`stop()` (spec §6.10 calls this out for `:argus-android`; symmetric expectation for iOS is unmet), (b) `Argus.start` swallows server-start failures inside its launched coroutine — surface them, (c) no KDoc on the `Argus` object or `ArgusHandle`, (d) update spec §3.3 to acknowledge the deliberate decision to keep `ArgusServer` in commonMain (no expect/actual). Also: `:argus-server-core/EventRingBuffer.kt:147,153` uses `Dispatchers.IO` *without* the `kotlinx.coroutines.IO` import — that's outside this slice but is the K/N gotcha you've been bitten by; the iOS Native build will need this fixed. |
