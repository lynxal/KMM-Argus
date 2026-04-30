# Argus Phase 2 — Shaping Notes

## Scope

Three Phase 2 features from `agent-os/product/roadmap.md:53-57`:

1. Proper request↔log correlation via propagated correlation IDs.
2. Session persistence across app restarts.
3. Per-host full-body capture bypass.

HAR replay was originally part of this phase but was dropped during shaping.

## Decisions

- Correlation IDs: `CoroutineContext.Element` in `:argus-core` (no upstream KMMLogging dependency).
- Persistence: Android-only this phase (SQLDelight schema in `:argus-core` + `AndroidSqliteDriver` actual in `:argus-android`). iOS waits for Phase 4.
- Retention: whichever-fires-first — `persistMaxAgeDays = 7` OR `persistMaxSizeMb = 100`.
- Session model: each `Argus.start()` writes a session marker. On next start, only the previous session's events rehydrate into the ring buffer, capped at `maxEvents`.
- HAR replay: dropped from Phase 2.
- `fullBodyHosts: Set<String>`: case-insensitive exact host match; matching hosts capture full body, ignoring `maxBodyBytes`. No safety ceiling.
- UI: optional `correlationId` column in `EventList`, off by default. No exact-pair links, no group-by-correlation view this phase.

## Context

- **Visuals:** None.
- **References:** `NoopEventBus` (sink pattern), `ArgusJson` (serialization), `EventRingBuffer` actor model, `ArgusAttributes` key pattern. See `references.md`.
- **Product alignment:** Directly delivers Phase 2 roadmap items at `agent-os/product/roadmap.md:53-57`. Persistence retention defaults align with the on-device IoT use case (7 days × 100 MB fits a Canvas Hub disk budget with headroom).

## Open implementation question

Confirm during Task 3 whether KMMLogging's `LoggerExtras` exposes a context bag the delegate can read. If not, fall back to a `ThreadContextElement` bridge in `:argus-core` so the synchronous `LoggerImplementation.log` callback can still see the active correlation id propagated by an outer `withCorrelation` block.

## Standards Applied

- `kmp/module-boundaries` — schema in `:argus-core`, drivers in platform modules.
- `kmp/expect-actual-conventions` — database factory file naming.
- `persistence/sqldelight-conventions` — schema style, transaction wrappers.
- `coroutines/job-lifecycle` — pruning via scoped flow not polling.
- `naming/package-structure` — new packages: `correlation`, `persistence`, `db`.
- `workflow/commit-conventions` — `feat:` prefix, no agent attribution trailers.
