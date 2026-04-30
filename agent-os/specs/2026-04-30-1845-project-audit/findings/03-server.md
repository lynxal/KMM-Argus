# Server & Ring Buffer Audit (§6.4, §6.5)

Scope: static analysis of `:argus-server-core/src/commonMain/` and the platform
hosts in `:argus-android/src/androidMain/` and `:argus-ios/src/iosMain/`.
No runtime measurements — §6.5.3 throughput is marked `unverified`.

## §6.4 Server behavior

| Item | Status | Evidence |
| --- | --- | --- |
| 6.4.1 `boundPort` property | PASS | `ArgusServer.kt:55-57` exposes `public val boundPort: Int`, throws `IllegalStateException` until `start()` resolves. Set in `start()` at line 76 from `server.engine.resolvedConnectors().first().port`. |
| 6.4.2 `/api/info` shape | PASS | `routes/Info.kt:11-32` — `InfoResponse(pkg, versionName, device, argusVersion, schemaVersion)`. All five fields present, schemaVersion sourced from `ARGUS_SCHEMA_VERSION` (currently `2`, see `argus-core/.../model/Schema.kt:12`). |
| 6.4.3 `/api/events` filter params | PASS | `routes/Events.kt:19-35` reads `limit`, `before`. `EventFilter.fromParameters` (`filter/EventFilter.kt:63-74`) parses `source, method, statusClass, host, urlContains, logLevel, tag` — all 7 spec fields covered. `before` is event-id-keyed (line 26-29), `limit` is `takeLast` after filtering. |
| 6.4.4 raw-bytes Content-Type | PASS | `routes/Events.kt:74-98` `respondBody` uses `respondBytes(bytes, parsedType ?: ContentType.Application.OctetStream)`. Textual types decoded from the UTF-8 preview, binary types Base64-decoded with a UTF-8 fallback. Adds `X-Argus-Truncated` header when payload was clipped. |
| 6.4.5 DELETE clears + WS `cleared` broadcast | PASS | `routes/Events.kt:63-66` — `delete("/api/events") { buffer.clear(); respond(NoContent) }`. `EventRingBuffer.clear()` (line 92-94) enqueues `Op.Clear`; the actor (`apply`, line 124-128) empties the deque, publishes `_snapshot.value = emptyList()`, broadcasts `OutboundMessage.Cleared` to every subscriber. |
| 6.4.6 WS hello on connect, live event frames | PASS | `routes/Ws.kt:21-22` sends `OutboundMessage.Hello(appInfo, ARGUS_SCHEMA_VERSION)` as the first frame. `streamOutbound` (line 43-54) drains the per-subscriber `ReceiveChannel<OutboundMessage>` to live `Frame.Text` writes. |
| 6.4.7 WS reconnect dedup (id-based) | PARTIAL | Server emits each event once with stable `id` (events carry `id` per the model layer; `before` parameter at `Events.kt:26` is id-keyed for backfill). No server-side replay/dedup beyond stable ids — the spec language ("dedup") is satisfied by id-stability + client logic in webui (`features/events/eventStore.ts` is responsible). Confirmed routes give the client what it needs; explicit dedup is client-side, not server-side. |
| 6.4.8 CORS allowlist (debug-only, no wildcard) | PASS | `routes/InstallArgusRoutes.kt:34-47` — CORS only installed when `corsOrigins.isNotEmpty()`; for each origin it parses scheme + hostPort and calls `allowHost(hostPort, schemes = listOf(scheme))`. **No `anyHost()` call.** Default value comes from `ArgusConfig.corsDevOrigins = listOf("http://localhost:5173")` (`ArgusConfig.kt:32`). Allows DELETE method + Content-Type header only. Note: the "debug-only" gating is configuration-driven, not build-type-driven — a release build that keeps the default config still allows `localhost:5173`. Acceptable because localhost can't be reached from outside the device, but worth flagging. |
| 6.4.9 Graceful port release on `stop()` | PASS | `ArgusServer.kt:79-85` — `engine?.stop(gracePeriodMillis = 100, timeoutMillis = 1_000)`, then nulls engine, resets `resolvedPort = -1`, closes the buffer, closes the event store. `start()` guards against double-start at line 64. |

## §6.5 Ring buffer

| Item | Status | Evidence |
| --- | --- | --- |
| 6.5.1 oldest-evicted-first | PASS | `buffer/EventRingBuffer.kt:117-119` — `if (events.size >= maxEvents) events.removeFirst(); events.addLast(op.event)`. ArrayDeque, FIFO eviction. |
| 6.5.2 capacity configurable via `ArgusConfig` | PASS | `ArgusConfig.kt:29` `maxEvents: Int = 500`. Threaded through `ArgusServer.kt:36-42` into the buffer constructor. `init` block at line 73 requires `maxEvents > 0`. |
| 6.5.3 500/sec throughput | UNVERIFIED — requires runtime | Static structure looks fit-for-purpose: unbounded inbox `Channel(UNLIMITED)` (line 61), single-actor on `Dispatchers.Default.limitedParallelism(1)`, non-suspending `trySend` from publishers (`offer`, line 88-90). A `LoadTest.kt` exists in `jvmTest` but was not executed for this audit. |

## Routes inventory

All routes mounted via `installArgusRoutes` in `routes/InstallArgusRoutes.kt:49-54`.

- `GET /` → `ArgusUiBundle.get("/index.html")` bytes — `routes/Ui.kt:12-19`. Matches spec.
- `GET /{path...}` → static asset; SPA fallback to `index.html` for non-`/api*`/non-`/ws*` paths — `routes/Ui.kt:21-35`. `/api*` and `/ws*` short-circuit to 404 instead of falling back. Matches spec.
- `GET /api/info` → `InfoResponse{pkg, versionName, device, argusVersion, schemaVersion}` — `routes/Info.kt:21-31`. Matches spec exactly.
- `GET /api/events` → JSON list of `ArgusEvent`. Query params: `limit, before, source, method, statusClass, host, urlContains, logLevel, tag` — `routes/Events.kt:19-35` + `filter/EventFilter.kt:63-74`. Matches spec.
- `GET /api/events/{id}` → single `ArgusEvent` or 404 — `routes/Events.kt:37-42`.
- `GET /api/events/{id}/request-body` → raw bytes (text or Base64-decoded), `X-Argus-Truncated` header — `routes/Events.kt:44-51`.
- `GET /api/events/{id}/response-body` → same shape; 404 if event has no response — `routes/Events.kt:53-61`.
- `DELETE /api/events` → `204 NoContent`, broadcasts `Cleared` over WS — `routes/Events.kt:63-66`.
- `WS /ws` → see next section. `routes/Ws.kt:21-41`.

No unexpected routes; no obvious gaps versus §5.4.

## WS protocol

File: `routes/Ws.kt`. JSON encoding via `ArgusJson` with `classDiscriminator = "type"` (per `OutboundMessage.kt` doc).

Server → client (`OutboundMessage`, `protocol/OutboundMessage.kt`):
- `{"type":"hello","info":AppInfo,"schemaVersion":Int}` — sent immediately on connect (`Ws.kt:22`).
- `{"type":"event","event":ArgusEvent}` — emitted per ring-buffer publish, filtered through current `EventFilter`.
- `{"type":"cleared"}` — emitted when `DELETE /api/events` (or any `buffer.clear()`) fires.

Client → server (`InboundMessage`, `protocol/InboundMessage.kt`):
- `{"type":"subscribe","filter":EventFilter}` — replaces the per-session filter (`Ws.kt:33`). Optional; the default `EventFilter()` matches everything.

Error handling:
- Malformed inbound JSON: `runCatching { ... }.getOrNull()` (Ws.kt:32) silently drops the message — defensive, no crash, no error frame back.
- Lagging subscriber: ring buffer closes the bounded `Channel<OutboundMessage>` (`EventRingBuffer.kt:165-170`); `streamOutbound` exits its `for` loop and calls `session.close(CloseReason(INTERNAL_ERROR, "lagging"))` (`Ws.kt:53`). Spec-aligned: the client is expected to reconnect, GET `/api/events`, then resubscribe.
- Subscriber bounded capacity: `EventRingBuffer.DEFAULT_SUBSCRIBER_CAPACITY = 1024` (line 180).
- `finally` at `Ws.kt:37-39` always calls `buffer.unsubscribe(sub)` so the ring's subscriber list and channel are cleaned up even on abnormal close.

## Ring buffer impl

File: `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt`.

- Backing store: `ArrayDeque<ArgusEvent>` (line 62), pre-sized to `maxEvents`.
- Concurrency: single-actor model. All mutations happen inside `apply(op)` (line 115-140) running on `Dispatchers.Default.limitedParallelism(1)` (line 57). Public mutators (`offer`, `clear`, `hydrate`) are non-suspending and call `inbox.trySend(...)` on an unbounded channel (line 61).
- Eviction (oldest-first): `EventRingBuffer.kt:117-119`.
  ```
  is Op.Publish -> {
      if (events.size >= maxEvents) events.removeFirst()
      events.addLast(op.event)
  ```
  Hydrate path mirrors this at line 130-134, additionally clipping the seed to `takeLast(maxEvents)`.
- Capacity wiring: `ArgusConfig.maxEvents` → `ArgusServer` constructor (line 36-42) → `EventRingBuffer(maxEvents = ...)`. `init` (line 73) enforces `maxEvents > 0`.
- Snapshot: `_snapshot: MutableStateFlow<List<ArgusEvent>>` (line 64), republished after every `Publish/Clear/Hydrate` (lines 120, 126, 135). `events.toList()` clones to give readers an immutable view; this allocation per write is an O(n) cost worth noting under high write rates (relevant to §6.5.3).
- Persistence: when `eventStore !== NoopEventStore`, each publish triggers `persistAsync` (line 142-157) which encodes JSON, fires-and-forgets `eventStore.append` on `Dispatchers.IO`, and runs `pruneByRetention` every 50 inserts.
- `close()` (line 108-113) closes the inbox channel, closes every subscriber channel, and cancels the actor scope.

## CORS posture

- Plugin install: `routes/InstallArgusRoutes.kt:34-47` (inside `installArgusRoutes`).
- Origin source: parameter `corsOrigins: List<String>` passed through from `ArgusServer.start()` (`ArgusServer.kt:72`, value is `config.corsDevOrigins`).
- Default origins: `ArgusConfig.corsDevOrigins = listOf("http://localhost:5173")` (`ArgusConfig.kt:32`).
- Handling:
  - Empty list → CORS plugin not installed at all (`InstallArgusRoutes.kt:34`).
  - Non-empty → for each origin, parse scheme prefix; entries that don't start with `http://` or `https://` are silently skipped (`continue`); otherwise `allowHost(hostPort, schemes = listOf(scheme))`.
  - `allowMethod(HttpMethod.Delete)` + `allowHeader(HttpHeaders.ContentType)` only.
  - **No `anyHost()` call anywhere in commonMain — verified by inspection.**
- Debug-vs-release branching: there is **no** build-type or BuildConfig.DEBUG check in commonMain. The "debug-only" property is enforced socially by the default origin (`localhost:5173`, the Vite dev server), and operationally by the fact that `localhost` cannot be reached cross-host. A release build that does not override `corsDevOrigins` will still respond to CORS preflights from `http://localhost:5173`. This is acceptable but consider documenting that hosts who flip on a non-loopback origin are taking on responsibility themselves.

## Notes & risks

1. **`ArgusServer` is not expect/actual.** The class is declared once in commonMain (`ArgusServer.kt:30`) and uses Ktor CIO directly. The header comment (lines 27-28) explicitly documents this: "The Ktor CIO engine is multiplatform (JVM, Android, iOS), so the implementation lives in `commonMain` with no expect/actual split." The audit checklist's expectation of an `expect class ArgusServer` does not match the codebase — but the design is sound: CIO already supports all three targets, so the platform hosts (`argus-android/.../Argus.kt:34`, `argus-ios/.../Argus.kt`) directly construct the common `ArgusServer`. No platform-specific server actuals exist.
2. **`/api/events` cost.** `Events.kt:25` reads `buffer.snapshot.value` (a fresh `List` published by the actor) and runs `indexOfFirst` + `filter` over it. Linear in `maxEvents`. Fine at default 500 but could become noticeable for very high `maxEvents`.
3. **Snapshot allocation per write.** `_snapshot.value = events.toList()` (line 120) allocates a full copy on every published event. Under sustained 500/s this is 500 list copies/sec of up to `maxEvents` elements. Material for §6.5.3 verification work.
4. **CORS release-mode posture.** As above: defaults still allow `localhost:5173` in release. Suggest adding a doc note (or release-mode default of `emptyList()`) to the `ArgusConfig` KDoc — mostly a hygiene call, not a security finding given loopback.
5. **WS client→server `subscribe` is fire-and-forget.** No ack frame back, no error frame on malformed JSON (`Ws.kt:32`). The webui currently treats it as fire-and-forget (consistent with the spec wording "optional"), so this is fine, but it means the client never learns its filter was rejected.
6. **`schemaVersion = 2`** in `ARGUS_SCHEMA_VERSION` — note for cross-checking webui schema-mismatch banner.
7. **Throughput (§6.5.3) marked unverified.** Static design appears compatible with the 500/sec target (unbounded inbox, single actor, `trySend`). A runtime run of `argus-server-core/src/jvmTest/.../LoadTest.kt` is required to confirm.
