# Argus Phase 2 — Correlation IDs, Persistence, Full-Body Bypass

## Context

Argus Phase 1 ships an on-device Ktor + log inspector with a unified HTTP/log timeline. Two known limitations are explicit non-goals of v1: HTTP↔log pairing relies on a time-window heuristic (`agent-os/product/roadmap.md:16,49`), and the timeline evaporates on app restart (line 46). Phase 2 closes both gaps and adds a per-host escape hatch for body capture so engineers can debug endpoints whose payloads exceed the global `maxBodyBytes` cap. HAR replay was originally on the table but has been dropped from this phase.

The intended outcome: an engineer triaging a flow can (a) tell exactly which `LogEvent`s came from which `HttpEvent` via a propagated correlation id, (b) survive a process restart without losing the previous session's timeline, and (c) capture full bodies for a curated set of hosts without raising the cap globally.

## Decisions (confirmed during shaping)

- **Correlation IDs** live in `:argus-core` as a `CoroutineContext.Element` (no upstream KMMLogging dependency).
- **Persistence** is Android-only this phase via SQLDelight in `:argus-core` + `AndroidSqliteDriver` actual in `:argus-android`. iOS driver waits for Phase 4 alongside `:argus-ios`.
- **Retention** is whichever-fires-first: prune events older than `maxAgeDays` (default 7) **or** when total stored size exceeds `maxSizeMb` (default 100).
- **Session model**: each `Argus.start()` writes a session marker. On next start, only the previous session's events rehydrate into the ring buffer (capped at `maxEvents`). Older sessions remain in the DB until retention prunes them.
- **HAR replay**: dropped from Phase 2.
- **`fullBodyHosts`**: `Set<String>`, exact case-insensitive host match. Matching hosts capture the full body, ignoring `maxBodyBytes`. No safety ceiling.
- **UI scope**: optional `correlationId` column in `EventList`, off by default. No exact-pairing visual links, no group-by-correlation view mode this phase.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-04-30-1004-argus-phase2/` containing:

- `plan.md` — copy of this plan
- `shape.md` — scope, decisions, conversation context (template at end of this file)
- `standards.md` — full bodies of relevant standards (see "Standards applied" below)
- `references.md` — pointers to existing implementations to reuse

No visuals were provided.

## Task 2 — `ArgusCorrelationId` coroutine context element (`:argus-core`)

**New file:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/correlation/ArgusCorrelationId.kt`

```kotlin
public class ArgusCorrelationId(public val value: String) : AbstractCoroutineContextElement(Key) {
    public companion object Key : CoroutineContext.Key<ArgusCorrelationId>
    public companion object Factory {
        public fun new(): ArgusCorrelationId = ArgusCorrelationId(Uuid.random().toString().take(16))
    }
}

public suspend fun currentCorrelationId(): String? =
    coroutineContext[ArgusCorrelationId]?.value
```

Convenience: a `withCorrelation { ... }` inline helper that wraps `withContext(ArgusCorrelationId.new() + coroutineContext) { block() }` — not strictly required, but lowers call-site friction (one of the few places a comment-free helper earns its weight).

Tests: `argus-core/src/commonTest/.../correlation/ArgusCorrelationIdTest.kt` — verify propagation through `launch`, `async`, and `withContext`.

## Task 3 — Stamp `correlationId` on `HttpEvent` and `LogEvent`

Add nullable `correlationId: String? = null` to both data classes (Kotlin's default value preserves the on-wire schema for older clients):

- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/HttpEvent.kt:8`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/LogEvent.kt:12`

**Ktor plugin** (`argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt`):

- In `onRequest` (line 31), capture `coroutineContext[ArgusCorrelationId]?.value` and stash it on `request.attributes` under a new `ArgusCorrelationKey` (defined in `ArgusAttributes.kt`).
- Read it back in `emitSuccess` / `emitError` / `emitNetworkError` and pass to the `HttpEvent` constructor.

**Logger delegate** (`argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt:40`):

- KMMLogging's `LoggerImplementation.log` is non-suspend — read correlation id from `LoggerExtras` if KMMLogging exposes a context bag there, otherwise from a thread-local-style holder updated by an outer `withCorrelation` helper.
- **Open question for implementation**: confirm whether `LoggerExtras` is extensible. If not, the cleanest fallback is a `CoroutineContext`-aware bridge: a small `ArgusContextHolder` updated via `ThreadContextElement` so synchronous loggers can read the active correlation id. Decide during Task 2.

Drop the line 27–29 comment in `ArgusLoggerDelegate.kt` ("Phase 2 will introduce…") since this task implements it.

## Task 4 — Persistence layer (SQLDelight)

**Schema** in `argus-core/src/commonMain/sqldelight/com/lynxal/argus/db/Argus.sq`:

```
CREATE TABLE event (
    id TEXT NOT NULL PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp_ms INTEGER NOT NULL,
    source TEXT NOT NULL,             -- HTTP / LOG / CUSTOM
    correlation_id TEXT,
    size_bytes INTEGER NOT NULL,      -- payload size for retention math
    payload TEXT NOT NULL             -- ArgusJson-serialized ArgusEvent
);
CREATE INDEX event_session_idx ON event(session_id, timestamp_ms);
CREATE INDEX event_timestamp_idx ON event(timestamp_ms);

CREATE TABLE session (
    id TEXT NOT NULL PRIMARY KEY,
    started_at_ms INTEGER NOT NULL,
    ended_at_ms INTEGER
);
```

Follows `agent-os/standards/persistence/sqldelight-conventions.md` (snake_case columns, TEXT AS for serialized payload).

**Driver `expect/actual`** per `agent-os/standards/kmp/expect-actual-conventions.md`:

- `argus-core/src/commonMain/.../db/ArgusDatabaseFactory.kt` — `expect class ArgusDatabaseFactory { fun create(): ArgusDatabase }`.
- `argus-android/src/androidMain/.../db/ArgusDatabaseFactory.android.kt` — `actual` using `AndroidSqliteDriver`.
- iOS actual is **not** added this phase (Phase 4 with `:argus-ios`).

**Storage abstraction** `argus-core/src/commonMain/.../persistence/EventStore.kt`:

```kotlin
public interface EventStore {
    suspend fun openSession(): String              // returns sessionId
    suspend fun closeSession(sessionId: String)
    suspend fun append(event: ArgusEvent, sessionId: String, sizeBytes: Long)
    suspend fun previousSessionEvents(maxEvents: Int): List<ArgusEvent>
    suspend fun pruneByRetention(maxSizeMb: Long, maxAgeDays: Int)
}
```

`SqlDelightEventStore` implements it; `NoopEventStore` is the default when persistence is off (matches the `NoopEventBus` pattern at `argus-core/src/commonMain/.../model/NoopEventBus.kt`).

Background pruning runs on a `SupervisorJob` scope tied to the server lifecycle; trigger on each `append` past a small batching threshold (e.g. every 50 events) — avoids a polling loop per `agent-os/standards/coroutines/job-lifecycle.md`.

## Task 5 — Wire persistence into config + ring buffer

**`ArgusConfig`** (`argus-server-core/src/commonMain/.../server/ArgusConfig.kt:27`) — add:

```kotlin
val persist: Boolean = false,
val persistMaxSizeMb: Long = 100,
val persistMaxAgeDays: Int = 7,
```

**`ArgusConfigBuilder`** (`argus-android/src/androidMain/.../android/ArgusConfigBuilder.kt:7`) — mirror the three knobs.

**`EventRingBuffer`** (`argus-server-core/src/commonMain/.../server/buffer/EventRingBuffer.kt:47`) — wire an optional `EventStore`:

- On `Op.Publish`, persist before the `events.addLast(...)` happens (or asynchronously off the actor with care). The actor is single-threaded; persistence I/O must not block it. Cleanest path: persist on a separate dispatcher (`Dispatchers.IO`) launched from the actor as fire-and-forget — failures log but don't drop the in-memory event.
- On Argus startup, before `init`'s actor launch, hydrate `events` with `eventStore.previousSessionEvents(maxEvents)` so the ring is warm before subscribers connect.

**`ArgusServer`** (Android actual at `argus-android` and the JVM common path) — instantiate `SqlDelightEventStore` only when `config.persist` is true; pass `NoopEventStore` otherwise. Call `eventStore.openSession()` in `start()`, `closeSession()` in `stop()`.

## Task 6 — Per-host full-body bypass

**`ArgusClientConfig`** (`argus-core/src/commonMain/.../ktor/ArgusClientConfig.kt:6`) — add:

```kotlin
public var fullBodyHosts: Set<String> = emptySet()
```

**`ArgusClientPlugin`** (`argus-core/src/commonMain/.../ktor/ArgusClientPlugin.kt`):

- Lines 43–48 (request body capture) and the `captureSide.drainWithCap(cfg.maxBodyBytes)` call at line 75: replace the cap with `effectiveMaxBytes(host, cfg)`, a new private helper that returns `Long.MAX_VALUE` when the lowercased host is in `cfg.fullBodyHosts`, else `cfg.maxBodyBytes`.
- Match host case-insensitively (`fullBodyHosts.any { it.equals(host, ignoreCase = true) }`).

Test: `argus-core/src/commonTest/.../ktor/FullBodyHostsTest.kt` — request to a matched host captures > `maxBodyBytes`; request to a non-matched host respects the cap.

## Task 7 — UI: optional correlationId column

**Schema** (`argus-webui/src/transport/schema.ts`) — add `correlationId?: string` on `HttpEvent` and `LogEvent`.

**EventList** (`argus-webui/src/components/EventList/Row.ts` and `EventList.ts`) — render a togglable column showing the first 8 chars of `correlationId` when present. Toggle lives in `TopBar` (existing column-toggle pattern if any; otherwise a small dropdown next to the existing filter chips).

**Filter persistence** — store the column-visible flag in `argus-webui/src/store/persistence.ts` so it sticks across reloads.

Off by default. No exact-pair visual links, no group-by view this phase.

## Task 8 — Verification

End-to-end on `:sample-android`:

1. `./gradlew :sample-android:installDebug` and launch.
2. Trigger an HTTP call from inside `withContext(ArgusCorrelationId.new()) { ... }` and emit a `Logger.i(...)` in the same scope. Open the Argus browser UI, enable the correlationId column, confirm both rows show the same id.
3. Set `argusConfig { persist = true }` in the sample app. Generate ~50 events, kill the process, relaunch. Confirm those events appear in the ring buffer immediately on UI connect (no live event needed to populate).
4. Lower `persistMaxSizeMb = 1` in the sample, generate enough traffic to exceed it, confirm DB size stays under the cap (instrument via `adb shell run-as <pkg> stat databases/argus.db`).
5. Set `fullBodyHosts = setOf("api.example.com")`, send a 5 MB request to that host with `maxBodyBytes = 1_000_000`. Confirm the captured body is full size (not truncated). Send the same request to a non-matched host; confirm truncation marker.

Tests:

- `./gradlew :argus-core:allTests` (correlation propagation, full-body bypass).
- `./gradlew :argus-server-core:allTests` (ring buffer hydration on startup).
- `./gradlew :argus-android:testDebugUnitTest` (config builder accepts new knobs).
- `./gradlew :argus-webui:test` (schema + column toggle).

---

## Critical files to modify

- `argus-core/src/commonMain/kotlin/com/lynxal/argus/correlation/ArgusCorrelationId.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/HttpEvent.kt:8`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/model/LogEvent.kt:12`
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:31` (correlation + bypass)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientConfig.kt:6` (`fullBodyHosts`)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusAttributes.kt` (new attribute key)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/logging/ArgusLoggerDelegate.kt:40`
- `argus-core/src/commonMain/sqldelight/com/lynxal/argus/db/Argus.sq` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/persistence/EventStore.kt` (new)
- `argus-core/src/commonMain/kotlin/com/lynxal/argus/db/ArgusDatabaseFactory.kt` (new expect)
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/db/ArgusDatabaseFactory.android.kt` (new actual)
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/ArgusConfig.kt:27`
- `argus-server-core/src/commonMain/kotlin/com/lynxal/argus/server/buffer/EventRingBuffer.kt:47`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/ArgusConfigBuilder.kt:7`
- `argus-android/src/androidMain/kotlin/com/lynxal/argus/android/Argus.kt` (session lifecycle)
- `argus-webui/src/transport/schema.ts`
- `argus-webui/src/components/EventList/Row.ts`
- `argus-webui/src/components/EventList/EventList.ts`
- `argus-webui/src/store/persistence.ts`

## Reuse

- `NoopEventBus` pattern (`argus-core/src/commonMain/.../model/NoopEventBus.kt`) — mirror for `NoopEventStore`.
- `ArgusJson` serialization (`argus-server-core/src/commonMain/.../routes/ArgusJson.kt`) — single source of truth for the persisted `payload TEXT` column. Do not re-introduce a parallel `Json {}` instance.
- Attribute-key pattern (`argus-core/src/commonMain/.../ktor/ArgusAttributes.kt`) for the new `ArgusCorrelationKey`.
- `EventRingBuffer`'s actor model — keep all event state mutation on the existing single-threaded actor; persistence I/O dispatches off it.

## Standards applied

- `agent-os/standards/kmp/module-boundaries.md` — `:argus-core` stays at the base; the SQLDelight schema lives there but the driver `actual` is in `:argus-android`. No upward dependencies.
- `agent-os/standards/kmp/expect-actual-conventions.md` — file naming for the database factory (`ArgusDatabaseFactory.kt` expect, `ArgusDatabaseFactory.android.kt` actual).
- `agent-os/standards/persistence/sqldelight-conventions.md` — snake_case columns, TEXT AS payloads, transaction wrappers, platform expect/actual drivers.
- `agent-os/standards/coroutines/job-lifecycle.md` — pruning runs on a `SupervisorJob`-scoped flow, not a polling loop.
- `agent-os/standards/naming/package-structure.md` — `com.lynxal.argus.correlation`, `com.lynxal.argus.persistence`, `com.lynxal.argus.db` (singular folder names, one top-level decl per file).
- `agent-os/standards/workflow/commit-conventions.md` — `feat:` for the correlation, persistence, full-body bypass commits; `feat:` or `chore:` for schema scaffolding.

## Open implementation question (Task 3)

Confirm during implementation whether KMMLogging's `LoggerExtras` exposes a context bag the delegate can read. If not, fall back to a `ThreadContextElement` bridge in `:argus-core` so the synchronous `LoggerImplementation.log` callback can still see the active correlation id.

---

## shape.md template (write this into the spec folder)

```markdown
# Argus Phase 2 — Shaping Notes

## Scope

Three Phase 2 features from `agent-os/product/roadmap.md:53-57`:
1. Proper request↔log correlation via propagated correlation IDs.
2. Session persistence across app restarts.
3. Per-host full-body capture bypass.

HAR replay was originally part of this phase but has been dropped during shaping.

## Decisions

- Correlation IDs: `CoroutineContext.Element` in `:argus-core` (no upstream KMMLogging dependency).
- Persistence: Android-only this phase (SQLDelight + AndroidSqliteDriver). iOS waits for Phase 4.
- Retention: whichever-fires-first — 7 days OR 100 MB defaults.
- Session model: each `Argus.start()` writes a session marker; previous session rehydrates on next start.
- HAR replay: dropped from Phase 2.
- `fullBodyHosts: Set<String>`: hard bypass of `maxBodyBytes`, no safety ceiling.
- UI: optional correlationId column (off by default). No exact-pair links, no group-by view.

## Context

- **Visuals:** None.
- **References:** `NoopEventBus` (sink pattern), `ArgusJson` (serialization), `EventRingBuffer` actor model, `ArgusAttributes` key pattern.
- **Product alignment:** Directly delivers Phase 2 roadmap items at `agent-os/product/roadmap.md:53-57`. Persistence retention defaults align with the on-device IoT use case (7d/100MB fits a Canvas Hub disk budget).

## Standards Applied

- kmp/module-boundaries — schema in :argus-core, drivers in platform modules.
- kmp/expect-actual-conventions — database factory file naming.
- persistence/sqldelight-conventions — schema style.
- coroutines/job-lifecycle — pruning via scoped flow not polling.
- naming/package-structure — new packages: correlation, persistence, db.
- workflow/commit-conventions — feat: prefix.
```
