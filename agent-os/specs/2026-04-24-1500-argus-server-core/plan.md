# `:argus-server-core` — Implementation Plan

## Context

Argus is a Kotlin Multiplatform on-device Ktor + log inspector (see `agent-os/product/mission.md` and `agent-os/product/roadmap.md`). Phase 1 ships four KMP modules: `:argus-core` (event model + capture), `:argus-webui` (SPA source), `:argus-webui-bundle` (SPA-as-bytes), and this spec's `:argus-server-core` — the embedded Ktor server that serves the SPA and exposes REST + WebSocket over the LAN. A fifth module `:argus-android` will wire this into host Android apps with mDNS discovery later in Phase 1; iOS lands in Phase 4.

`:argus-server-core` is the **first** module in the repo to run an embedded Ktor server rather than a Ktor client. It provides:

- The `ArgusEventBus` implementation (`ChannelEventBus`) that the already-shipped Ktor client plugin and KMMLogging delegate publish into.
- The single ring buffer that fans out to REST snapshot queries and live WebSocket subscribers.
- All REST + WS routes and the SPA serving logic, identical across targets.
- The `expect class ArgusServer` that binds to a concrete engine per target.

Outcome: a consumer can construct `ArgusServer(ArgusConfig(appInfo = ...))`, pass its `eventBus` to `ArgusClientPlugin` and `ArgusLoggerDelegate`, call `server.start()`, and point any browser on the same LAN at `http://<device>:<boundPort>/` to inspect live HTTP + log traffic.

---

## Task 1: Save spec documentation

Before touching code, create `agent-os/specs/2026-04-24-1500-argus-server-core/` containing:

- `plan.md` — this full plan
- `shape.md` — shaping notes (scope, decisions captured via AskUserQuestion, design critiques from the Plan agent)
- `standards.md` — full text of relevant standards (see "Standards applied" below)
- `references.md` — pointers to the reference files studied while shaping
- `visuals/` — empty (no visuals supplied for this spec; kept for folder symmetry with prior specs)

Prior specs in `agent-os/specs/` follow this exact structure (see `2026-04-24-1030-argus-webui-bundle/` for the immediate precedent).

---

## Task 2: Add `AppInfo` to `:argus-core`

New file `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/AppInfo.kt`:

```kotlin
package com.lynxal.argus.model

import kotlinx.serialization.Serializable

@Serializable
public data class AppInfo(
    val pkg: String,
    val versionName: String,
    val device: String,
    val argusVersion: String,
)
```

Also extend `HelloPayload` in `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt` to nest the app info used at `/ws` handshake time:

```kotlin
@Serializable
public data class HelloPayload(
    val schemaVersion: Int = ARGUS_SCHEMA_VERSION,
    val serverName: String = "argus",
    val serverVersion: String? = null,
    val appInfo: AppInfo? = null,  // NEW — nullable keeps wire compat with any v0 test fixtures
)
```

`schemaVersion` stays at 1 — we're **adding** a nullable field, which is backwards-compatible decode (old payloads without `appInfo` decode fine with default `null`). If stricter policy wants a bump, the gate is `ARGUS_SCHEMA_VERSION` in `Schema.kt:12`.

Update `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/HelloPayloadSerializationTest.kt` to cover the new field; add an `AppInfoSerializationTest` alongside it; extend `EventFactories.kt` with `createTestAppInfo()`.

---

## Task 3: Register `:argus-server-core` in `settings.gradle.kts`

Add `include(":argus-server-core")` to `settings.gradle.kts` alongside the existing four includes (`:argus-core`, `:argus-webui`, `:argus-webui-bundle`, `:sample-android`). Typesafe accessors will resolve it as `projects.argusServerCore`.

---

## Task 4: Extend `gradle/libs.versions.toml` with Ktor server aliases

Add under `[libraries]`, reusing the existing `ktor = "3.2.0"` version ref:

```toml
ktor-server-core = { group = "io.ktor", name = "ktor-server-core", version.ref = "ktor" }
ktor-server-cio = { group = "io.ktor", name = "ktor-server-cio", version.ref = "ktor" }
ktor-server-websockets = { group = "io.ktor", name = "ktor-server-websockets", version.ref = "ktor" }
ktor-server-content-negotiation = { group = "io.ktor", name = "ktor-server-content-negotiation", version.ref = "ktor" }
ktor-server-cors = { group = "io.ktor", name = "ktor-server-cors", version.ref = "ktor" }
ktor-server-test-host = { group = "io.ktor", name = "ktor-server-test-host", version.ref = "ktor" }
```

No new version pins — Ktor 3.2.0 is the existing catalog value.

---

## Task 5: Author `argus-server-core/build.gradle.kts`

Mirror `argus-core/build.gradle.kts` with a `jvmAndAndroidMain` intermediate source set (matching the pattern already used in `argus-webui-bundle/build.gradle.kts` lines 37-39). Plugins: `kotlinMultiplatform`, `kotlinSerialization`, `androidLibrary`.

Targets: `androidTarget()`, `jvm()`, `iosX64()`, `iosArm64()`, `iosSimulatorArm64()` with framework `baseName = "argus-server-core"` and `isStatic = useStaticFramework`.

Source set wiring:

- `commonMain`: `implementation(projects.argusCore)`, `implementation(projects.argusWebuiBundle)`, `libs.kotlinx.coroutines.core`, `libs.kotlinx.serialization.json`, `libs.ktor.server.core`, `libs.ktor.server.cio`, `libs.ktor.server.websockets`, `libs.ktor.server.content.negotiation`, `libs.ktor.server.cors`, `libs.ktor.serialization.kotlinx.json`.
- `commonTest`: `kotlin("test")`, `libs.kotlinx.coroutines.test`.
- `jvmAndAndroidMain by creating { dependsOn(commonMain) }` (empty source set today — reserved for any shared JVM-only helpers if needed).
- `jvmMain.dependsOn(jvmAndAndroidMain)`, `androidMain.dependsOn(jvmAndAndroidMain)`.
- `jvmTest`: `libs.ktor.server.test.host`, `libs.ktor.client.core`, `libs.ktor.client.content.negotiation`, `libs.kotlinx.coroutines.test`.

`compilerOptions { freeCompilerArgs.add("-opt-in=kotlin.time.ExperimentalTime") }`. Android block: `namespace = "com.lynxal.argus.server"`, compileSdk/minSdk from version catalog, JVM 17 toolchain — identical shape to the other two modules.

**Ktor 3.2 CIO native availability is a build-time verification.** Task 5's first compile (`./gradlew :argus-server-core:compileKotlinIosArm64`) confirms `io.ktor:ktor-server-cio` publishes iOS klibs. If it does not resolve, fall back to making the iOS `actual` a stub that throws `NotImplementedError` until the Phase 4 `:argus-ios` spec picks the real engine — document this in the open-risks section of `shape.md`. JVM + Android ship correctly with CIO regardless.

---

## Task 6: `commonMain` — ring buffer, event bus, outbound messages

Package root: **`com.lynxal.argus.server`**.

### `buffer/EventRingBuffer.kt`

Single-writer actor model, non-suspend public API (critical — `ArgusEventBus.publish` is non-suspend per `argus-core/.../ArgusEventBus.kt:14`):

```kotlin
class EventRingBuffer internal constructor(
    private val maxEvents: Int,
    scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default.limitedParallelism(1)),
) {
    private val inbox: Channel<Op> = Channel(capacity = Channel.UNLIMITED)
    private val events = ArrayDeque<ArgusEvent>()
    private val snapshot = atomic(persistentListOf<ArgusEvent>())  // kotlinx.atomicfu
    private val subscribers = atomic(persistentListOf<SendChannel<OutboundMessage>>())

    init { scope.launch { for (op in inbox) apply(op) } }

    fun offer(event: ArgusEvent) { inbox.trySend(Op.Publish(event)) }
    fun clear() { inbox.trySend(Op.Clear) }
    fun snapshot(): List<ArgusEvent> = snapshot.value

    fun subscribe(): ReceiveChannel<OutboundMessage> { /* allocate Channel(1024), CAS-add, return */ }
    internal fun unsubscribe(ch: SendChannel<OutboundMessage>) { /* CAS-remove */ }

    private fun apply(op: Op) { /* see semantics below */ }

    private sealed interface Op {
        data class Publish(val event: ArgusEvent): Op
        data object Clear: Op
    }
}
```

Semantics inside the actor (single-threaded, no locks needed on `events`):
- `Op.Publish`: if `events.size == maxEvents` drop head; `events.addLast(event)`; `snapshot.value = events.toPersistentList()`; for each subscriber call `trySend(OutboundMessage.Event(event))`; if `trySend` fails (channel full) **close the subscriber with code = lagging** — the WS route observes the close and shuts the socket with 1011 + reason `"lagging"`. Per Plan-review, silent drop is wrong; disconnect preserves correctness.
- `Op.Clear`: clear deque, publish empty snapshot, `trySend` `OutboundMessage.Cleared` to every subscriber (same disconnect-on-fail policy).

Atomicfu is already transitively available through `kotlinx-coroutines-core`; no new dependency. If adding `kotlinx-atomicfu` as a direct alias is preferred, add it in Task 4.

### `bus/ChannelEventBus.kt`

```kotlin
class ChannelEventBus internal constructor(private val buffer: EventRingBuffer) : ArgusEventBus {
    override fun publish(event: ArgusEvent) { buffer.offer(event) }
}
```

Non-suspend — satisfies the `ArgusEventBus` contract — delegates straight to the buffer's unbounded inbox channel.

### `protocol/OutboundMessage.kt`

WS envelope as a `@Serializable sealed interface` with `@JsonClassDiscriminator("type")` matching the spec exactly:

```kotlin
@Serializable sealed interface OutboundMessage {
    @Serializable @SerialName("hello") data class Hello(val info: AppInfo, val schemaVersion: Int): OutboundMessage
    @Serializable @SerialName("event") data class Event(val event: ArgusEvent): OutboundMessage
    @Serializable @SerialName("cleared") data object Cleared: OutboundMessage
}

@Serializable sealed interface InboundMessage {
    @Serializable @SerialName("subscribe") data class Subscribe(val filter: EventFilter): InboundMessage
}
```

`kotlinx.serialization` handles the polymorphic encoding via the existing `Json { classDiscriminator = "type" }` config used already by `ArgusEvent` (see `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEvent.kt`).

### `filter/EventFilter.kt`

Shared between `GET /api/events` query parsing and the WS `subscribe` message:

```kotlin
@Serializable
data class EventFilter(
    val source: EventSource? = null,
    val method: String? = null,
    val statusClass: Int? = null,   // 1..5 → 1xx..5xx
    val host: String? = null,
    val urlContains: String? = null,
    val logLevel: LogLevel? = null,
    val tag: String? = null,
) {
    fun matches(event: ArgusEvent): Boolean { /* pure predicate */ }

    companion object {
        fun fromParameters(params: Parameters): EventFilter { /* null-when-absent */ }
    }
}
```

`limit` and `before` are pagination params parsed by the events route itself, not part of the filter.

---

## Task 7: `commonMain` — routes

### `routes/InstallArgusRoutes.kt`

```kotlin
fun Application.installArgusRoutes(
    buffer: EventRingBuffer,
    appInfo: AppInfo,
    corsOrigins: List<String>,
) {
    install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true; explicitNulls = false }) }
    install(WebSockets)
    if (corsOrigins.isNotEmpty()) install(CORS) {
        corsOrigins.forEach { origin ->
            val (scheme, hostPort) = origin.removePrefix("http://").let { "http" to it }
                .takeIf { origin.startsWith("http://") }
                ?: (origin.removePrefix("https://").let { "https" to it })
            val (host, port) = hostPort.split(":").let { it[0] to it.getOrNull(1) }
            allowHost(host, schemes = listOf(scheme), subDomains = emptyList())
        }
        allowMethod(HttpMethod.Delete)
        allowHeader(HttpHeaders.ContentType)
    }

    routing {
        installInfoRoute(appInfo)
        installEventsRoutes(buffer)
        installWsRoute(buffer, appInfo)
        installUiRoutes()  // must come last — catch-all for /{path...}
    }
}
```

Per Plan review: `installArgusRoutes` owns feature installation because `ArgusServer` controls the whole `Application` — no third party contributes to it in v1. CORS is skipped entirely when origins is empty (installing CORS with no allowed hosts is a footgun). If a consumer ever wants to mount Argus into their own Ktor app in the future, we'll split this into `installArgusFeatures` + `installArgusRoutes` then — out of scope for v1.

### `routes/Info.kt`

```kotlin
@Serializable
data class InfoResponse(
    val pkg: String,
    val versionName: String,
    val device: String,
    val argusVersion: String,
    val schemaVersion: Int,
)

fun Route.installInfoRoute(appInfo: AppInfo) {
    get("/api/info") {
        call.respond(InfoResponse(
            pkg = appInfo.pkg,
            versionName = appInfo.versionName,
            device = appInfo.device,
            argusVersion = appInfo.argusVersion,
            schemaVersion = ARGUS_SCHEMA_VERSION,
        ))
    }
}
```

### `routes/Events.kt`

- `GET /api/events` — parse `limit` (default 500, clamp ≤ maxEvents), `before` (event id cursor — events with id < `before` in snapshot order), plus `EventFilter.fromParameters(call.parameters)`; return `buffer.snapshot()` filtered and truncated. For v1 with `maxEvents = 500` returning a full list is acceptable; noted as a streaming improvement in open risks.
- `GET /api/events/{id}` — `buffer.snapshot().firstOrNull { it.id == id } ?: call.respond(HttpStatusCode.NotFound)`.
- `GET /api/events/{id}/request-body` and `GET /api/events/{id}/response-body`:
  1. Fetch event; cast to `HttpEvent` (else 404).
  2. Pull `bodyPreview: String?` and `contentType: String?` from the request or response. If `bodyPreview` is null → 404.
  3. If `contentType` indicates text (`text/*`, `application/json`, `application/xml`, `application/javascript`, `application/*+json`, no content-type) → respond `bodyPreview.toByteArray(Charsets.UTF_8)` with that content type.
  4. Otherwise → `Base64.getDecoder().decode(bodyPreview)` and respond as bytes with the given content type (or `application/octet-stream`).
  5. If `bodyTruncatedTotalBytes != null` add response header `X-Argus-Truncated: <totalBytes>`.
- `DELETE /api/events` — `buffer.clear(); call.respond(HttpStatusCode.NoContent)`.

Base64 decoding uses `kotlin.io.encoding.Base64.Default` (multiplatform, already opted-in for `:argus-webui-bundle`).

### `routes/Ws.kt`

```kotlin
fun Route.installWsRoute(buffer: EventRingBuffer, appInfo: AppInfo) {
    webSocket("/ws") {
        send(Frame.Text(json.encodeToString(OutboundMessage.Hello(appInfo, ARGUS_SCHEMA_VERSION))))

        val sub = buffer.subscribe()
        try {
            val outboundJob = launch {
                for (msg in sub) {
                    // apply current filter (default = match-all); upgrade on subscribe messages
                    if (currentFilter.matchesOutbound(msg)) send(Frame.Text(json.encodeToString(msg)))
                }
                close(CloseReason(1011, "lagging"))  // sub closed → lagging consumer disconnect
            }
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val inbound = runCatching { json.decodeFromString<InboundMessage>(frame.readText()) }.getOrNull()
                    if (inbound is InboundMessage.Subscribe) currentFilter = inbound.filter
                }
            }
            outboundJob.cancel()
        } finally {
            buffer.unsubscribe(sub)
        }
    }
}
```

`currentFilter` starts at `EventFilter()` (match-all). `matchesOutbound` returns true for `Cleared` regardless of filter (it's a control message), and routes `Event` through `filter.matches(event.event)`.

Per Plan review, the client is responsible for WS reconnect — on disconnect, the client re-issues `GET /api/events` for the current snapshot and re-opens `/ws` for live. No server-side cursor is needed in v1; document this as open in `shape.md` for the eventual Phase 2 correlation IDs work.

### `routes/Ui.kt`

```kotlin
fun Route.installUiRoutes() {
    get("/") {
        val entry = ArgusUiBundle.get("/index.html") ?: return@get call.respond(HttpStatusCode.NotFound)
        call.respondBytes(entry.bytes, ContentType.parse(entry.contentType))
    }
    get("/{path...}") {
        val raw = "/" + (call.parameters.getAll("path")?.joinToString("/") ?: "")
        // block /api and /ws prefixes (already claimed; 404 rather than SPA fallback so errors surface)
        if (raw.startsWith("/api/") || raw == "/api" || raw == "/ws") return@get call.respond(HttpStatusCode.NotFound)
        val entry = ArgusUiBundle.get(raw) ?: ArgusUiBundle.get("/index.html")!!
        call.respondBytes(entry.bytes, ContentType.parse(entry.contentType))
    }
}
```

`ArgusUiBundle.get(raw)` already handles the SPA fallback for trailing-slash / extensionless paths (see `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/ArgusUiBundle.kt:24`). The explicit `/api` guard here prevents accidental SPA responses for typoed API routes, which would be a confusing client-side error.

---

## Task 8: `commonMain` — `ArgusServer` expect + `ArgusConfig`

### `ArgusConfig.kt`

```kotlin
public data class ArgusConfig(
    val appInfo: AppInfo,
    val maxEvents: Int = 500,
    val maxBodyBytes: Long = 1_000_000L,
    val redactHeaders: Set<String> = DEFAULT_REDACTED_HEADERS,
    val corsDevOrigins: List<String> = listOf("http://localhost:5173"),
)

public val DEFAULT_REDACTED_HEADERS: Set<String> = ArgusClientConfig.DEFAULT_REDACT_HEADERS
```

Per-spec the name is `DEFAULT_REDACTED_HEADERS`; the existing header set lives at `argus-core/src/commonMain/.../ArgusClientConfig.kt:16` as `DEFAULT_REDACT_HEADERS` — we re-export it under the spec's name rather than duplicate the list. `maxBodyBytes` and `redactHeaders` are carried on the config but not consumed inside `:argus-server-core` — they're passed to the `ArgusClientPlugin` by the caller wiring. Document this explicitly in `shape.md`.

### `ArgusServer.kt` (expect)

```kotlin
public expect class ArgusServer(config: ArgusConfig) {
    public val eventBus: ArgusEventBus
    public val boundPort: Int          // populated once start() returns; reads before start() throw IllegalStateException
    public suspend fun start()          // SUSPEND — deviates from spec for correctness (see below)
    public fun stop()
}
```

**Deviation from the literal spec:** `start()` is `suspend`. Per Plan review, `engine.resolvedConnectors()` is suspend on both JVM and Native CIO; a non-suspend `start()` would force `runBlocking` or return `boundPort = 0` — both worse outcomes than making the caller `await`. If preserving the exact non-suspend signature is required, fall back to `val boundPortDeferred: Deferred<Int>` + non-suspend `start()`; flag the choice in `shape.md` open decisions. Recommending suspend because callers already have a coroutine scope (Android host uses `lifecycleScope`; tests use `runTest`).

---

## Task 9: `jvmAndAndroidMain` — `ArgusServer` JVM + Android actual

New file `argus-server-core/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt`:

```kotlin
public actual class ArgusServer public actual constructor(private val config: ArgusConfig) {
    private val buffer = EventRingBuffer(maxEvents = config.maxEvents)
    public actual val eventBus: ArgusEventBus = ChannelEventBus(buffer)
    private var engine: EmbeddedServer<*, *>? = null

    @Volatile private var _boundPort: Int = -1
    public actual val boundPort: Int
        get() = _boundPort.takeIf { it != -1 } ?: error("ArgusServer.start() has not completed")

    public actual suspend fun start() {
        val e = embeddedServer(CIO, port = 0) {
            installArgusRoutes(buffer, config.appInfo, config.corsDevOrigins)
        }
        engine = e
        e.start(wait = false)
        _boundPort = e.engine.resolvedConnectors().first().port
    }

    public actual fun stop() {
        engine?.stop(gracePeriodMillis = 100, timeoutMillis = 1_000)
        engine = null
    }
}
```

`port = 0` requests an OS-assigned free port; `resolvedConnectors()` returns the actual port post-bind. Using the `jvmAndAndroidMain` intermediate source set means one actual file covers both JVM and Android targets (Android runs on a JVM runtime).

---

## Task 10: `iosMain` — `ArgusServer` iOS actual

Attempt the identical CIO-based implementation in `argus-server-core/src/iosMain/kotlin/com/lynxal/argus/server/ArgusServer.kt` — Ktor 3.2 publishes `io.ktor:ktor-server-cio` for native targets, so the code shape is nearly identical.

**If `./gradlew :argus-server-core:compileKotlinIosArm64` fails to resolve the CIO native artifact**, ship a stub:

```kotlin
public actual class ArgusServer public actual constructor(config: ArgusConfig) {
    public actual val eventBus: ArgusEventBus = NoopEventBus
    public actual val boundPort: Int get() = error("iOS server lands in Phase 4 (:argus-ios)")
    public actual suspend fun start(): Unit = error("iOS server lands in Phase 4 (:argus-ios)")
    public actual fun stop() { }
}
```

Record the outcome (real impl vs. stub) in `shape.md` under "open risks".

---

## Task 11: Tests — `commonTest`

Reuse the factory pattern in `argus-core/src/commonTest/.../EventFactories.kt`; add a local `ServerTestFactories.kt` with `createTestAppInfo()`, `createTestArgusConfig()`, `createTestEventFilter()`.

- **`EventRingBufferTest.kt`** (runs on JVM + iOS via `runTest`):
  - `offer and snapshot preserves insertion order`
  - `evicts oldest once cap reached`
  - `clear empties snapshot and signals subscribers with Cleared`
  - `subscriber receives events published after subscribe`
  - `slow subscriber channel overflow closes channel for disconnect`
  - `two subscribers receive same event independently`
  - Use `StandardTestDispatcher` to drive the actor's single-threaded consumer deterministically.

- **`EventFilterTest.kt`**:
  - Predicate tests for each field (source/method/statusClass/host/urlContains/logLevel/tag) against synthetic events.
  - `fromParameters` parses nullable-on-absent; `statusClass=5` matches 5xx only; unknown values (`source=BOGUS`) fail gracefully (return `null` on that field, not throw).

- **`OutboundMessageSerializationTest.kt`**:
  - Hello → JSON contains `"type":"hello"`, `"info":{...}`, `"schemaVersion":1`.
  - Event → `"type":"event","event":{...}`.
  - Cleared → `"type":"cleared"` with no extra fields.
  - Round-trip for each.

---

## Task 12: Tests — `jvmTest` (Ktor `testApplication`)

Ktor's `testApplication` lives in `ktor-server-test-host`, which is JVM-only. The feature-spec's "commonTest using Ktor test client" is imprecise — route tests go in `jvmTest`. Pure-logic tests (Task 11) already live in `commonTest`.

- **`RoutesTest.kt`** — one `testApplication { }` block per endpoint; install routes against a `EventRingBuffer` seeded with `createTestHttpEvent()` / `createTestLogEvent()` fixtures:
  - `GET /api/info returns app info + schema version`
  - `GET /api/events returns snapshot`
  - `GET /api/events?source=HTTP filters by source` (and one assertion per filter field)
  - `GET /api/events?limit=2` truncates
  - `GET /api/events?before=<id>` paginates
  - `GET /api/events/{id} returns single`
  - `GET /api/events/{id}/request-body text returns UTF-8 bytes`
  - `GET /api/events/{id}/response-body binary returns base64-decoded bytes`
  - `GET /api/events/{id}/request-body missing returns 404`
  - `DELETE /api/events clears buffer and returns 204`
  - `GET / returns index.html from ArgusUiBundle`
  - `GET /some/spa/path falls back to index.html`
  - `GET /missing-asset.png returns 404` (has extension, not in bundle)
  - `GET /api/unknown returns 404 not SPA fallback`

- **`WsTest.kt`** — `testApplication { client.webSocket("/ws") { ... } }`:
  - `first frame is hello with schemaVersion 1 and app info`
  - `publishing event after connect delivers event frame`
  - `DELETE /api/events delivers cleared frame`
  - `subscribe filter limits subsequent events`
  - `two concurrent sockets receive the same event`

- **`LoadTest.kt`** (JVM only, tagged slow so CI can gate):
  - Seed buffer, start `testApplication`, in parallel coroutines publish 500 HTTP events + 500 log events per second for 10s; assert `snapshot.size == maxEvents` (oldest-evicted), the actor inbox never blocks the publishers, and at least one always-connected WS subscriber receives events continuously with no closed sockets. This satisfies the "500 req/s + 500 log/s sustained" acceptance criterion.

---

## Critical files to modify or create

**Modified:**
- `settings.gradle.kts` — add one `include(":argus-server-core")` line.
- `gradle/libs.versions.toml` — add Ktor server aliases (Task 4).
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt` — extend `HelloPayload` with `appInfo`.
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/HelloPayloadSerializationTest.kt` — cover new field.
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/EventFactories.kt` — add `createTestAppInfo()`.

**Created in `:argus-core`:**
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/AppInfo.kt`
- `argus-core/src/commonTest/kotlin/com/lynxal/argus/model/AppInfoSerializationTest.kt`

**Created in `:argus-server-core`:**
- `argus-server-core/build.gradle.kts`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfig.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusServer.kt` (expect)
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/bus/ChannelEventBus.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/protocol/OutboundMessage.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/protocol/InboundMessage.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/filter/EventFilter.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/InstallArgusRoutes.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Info.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Events.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Ws.kt`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/routes/Ui.kt`
- `argus-server-core/src/jvmAndAndroidMain/kotlin/com/lynxal/argus/server/ArgusServer.kt` (actual)
- `argus-server-core/src/iosMain/kotlin/com/lynxal/argus/server/ArgusServer.kt` (actual or stub — see Task 10)
- `argus-server-core/src/commonTest/kotlin/com/lynxal/argus/server/ServerTestFactories.kt`
- `argus-server-core/src/commonTest/kotlin/com/lynxal/argus/server/buffer/EventRingBufferTest.kt`
- `argus-server-core/src/commonTest/kotlin/com/lynxal/argus/server/filter/EventFilterTest.kt`
- `argus-server-core/src/commonTest/kotlin/com/lynxal/argus/server/protocol/OutboundMessageSerializationTest.kt`
- `argus-server-core/src/jvmTest/kotlin/com/lynxal/argus/server/routes/RoutesTest.kt`
- `argus-server-core/src/jvmTest/kotlin/com/lynxal/argus/server/routes/WsTest.kt`
- `argus-server-core/src/jvmTest/kotlin/com/lynxal/argus/server/LoadTest.kt`

**Created in `agent-os/specs/`:**
- `agent-os/specs/2026-04-24-1500-argus-server-core/plan.md`
- `agent-os/specs/2026-04-24-1500-argus-server-core/shape.md`
- `agent-os/specs/2026-04-24-1500-argus-server-core/standards.md`
- `agent-os/specs/2026-04-24-1500-argus-server-core/references.md`
- `agent-os/specs/2026-04-24-1500-argus-server-core/visuals/` (empty)

**Reference files studied (not modified):**
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEventBus.kt` — interface shape for publish.
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEvent.kt` — sealed polymorphic JSON envelope.
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/HttpEvent.kt`, `HttpRequest.kt`, `HttpResponse.kt` — body preview shape drives the `/request-body` + `/response-body` decode logic.
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt:16` — source of truth for `DEFAULT_REDACT_HEADERS` re-exported by this module.
- `argus-webui-bundle/src/commonMain/kotlin/com/lynxal/argus/webui/ArgusUiBundle.kt:24` — SPA fallback semantics already handled.
- `argus-webui-bundle/build.gradle.kts` — intermediate `jvmAndAndroidMain` source set pattern mirrored here.
- `argus-core/build.gradle.kts` — KMP module convention mirrored here.
- `agent-os/specs/2026-04-24-1030-argus-webui-bundle/plan.md` — immediate predecessor spec, folder-structure precedent.

---

## Standards applied

Read the full text of each standard into `standards.md` as part of Task 1:

- `kmp/module-boundaries` — `:argus-server-core` depends one-way on `:argus-core` and `:argus-webui-bundle`; nothing above depends back.
- `kmp/expect-actual-conventions` — `ArgusServer.kt` in `commonMain/`; actuals in `jvmAndAndroidMain/` and `iosMain/` with the `.android.kt` / `.ios.kt` naming convention replaced by a single file per source set (matches the repo precedent).
- `kmp/module-build-conventions` — Kotlin 2.2.0, Gradle KTS, version catalog, JVM 17, iOS static framework default.
- `naming/package-structure` — package root `com.lynxal.argus.server`; subpackages `buffer`, `bus`, `protocol`, `filter`, `routes`; one top-level declaration per file.
- `testing/test-structure` — `kotlin.test`, `runTest` for coroutines, backtick test names, AAA.
- `testing/test-data-factories` — `createTest<Type>()` factory pattern for fixtures.
- `coroutines/suspend-vs-flow` — suspend for one-shot start/stop; channel for many-to-many fan-out. SharedFlow intentionally **not** used here per Plan-review (silent drop hazard).
- `coroutines/job-lifecycle` — cancel engine in `stop()`; scope owned by `EventRingBuffer`, supervised so a single subscriber's failure doesn't kill the actor.
- `workflow/commit-conventions` — `feat: add :argus-server-core embedded Ktor server + ring buffer`. Per user memory, no Co-Authored-By Claude trailer.

---

## Verification plan (end-to-end)

Run from repo root after implementation:

1. **Settings registers module:** `./gradlew projects` — `:argus-server-core` appears.
2. **Catalog aliases resolve:** `./gradlew :argus-server-core:dependencies` — no unresolved Ktor server deps.
3. **All KMP targets compile (JVM + Android):** `./gradlew :argus-server-core:compileKotlinJvm :argus-server-core:compileKotlinAndroid`.
4. **iOS compile gate:** `./gradlew :argus-server-core:compileKotlinIosArm64 :argus-server-core:compileKotlinIosSimulatorArm64`. If CIO native fails to resolve, fall back to Task 10 stub and re-run.
5. **`commonTest` passes on JVM and iOS:** `./gradlew :argus-server-core:jvmTest :argus-server-core:iosSimulatorArm64Test`. Ring buffer + filter + serialization tests are target-agnostic.
6. **`jvmTest` Ktor route suite passes:** `./gradlew :argus-server-core:jvmTest --tests "*RoutesTest" --tests "*WsTest"`.
7. **Load test passes (gated, JVM only):** `./gradlew :argus-server-core:jvmTest --tests "*LoadTest"` — sustained 500+500 ev/s for 10s, no publisher backpressure, no WS subscriber closes.
8. **Downstream compiles still work:** `./gradlew build` — no regressions in `:argus-core`, `:argus-webui-bundle`, `:sample-android`.
9. **Manual local run (JVM smoke):** ad-hoc main in a scratch JVM target or a throwaway test that constructs `ArgusServer(ArgusConfig(createTestAppInfo()))`, calls `start()`, hits `curl http://localhost:$boundPort/api/info` — returns the expected JSON; open the same URL in a browser — the SPA loads (blank until wired to events, which this module doesn't do). Report the captured port + HTTP status in the implementation commit message.

---

## Open risks / follow-ups

- **Ktor 3.2 CIO native iOS availability** is the load-bearing unknown. Task 10 defines both branches; gate at build time.
- **Streaming JSON for large snapshots** — v1 builds the full list and serializes whole; acceptable at `maxEvents = 500` but noted as an easy Phase 2 improvement (`respondTextWriter` + array streaming).
- **`start()` signature deviation** — suspend rather than blocking. Caller-visible change from the literal spec; captured explicitly in `shape.md` decisions so the `:argus-android` spec that follows can plan around it.
- **WS reconnect uses client-side cursor** — no server-side resume in v1. Clients re-snapshot via REST then re-subscribe. Phase 2 correlation IDs may change this.
- **`maxBodyBytes` and `redactHeaders` pass-through** — carried on `ArgusConfig` for caller convenience but consumed by the already-shipped `ArgusClientPlugin`, not by this module. Document in `shape.md` to avoid surprise.
- **Commit hygiene:** per `workflow/commit-conventions` and user memory, no `Co-Authored-By` Claude trailer on any commit in this repo.
