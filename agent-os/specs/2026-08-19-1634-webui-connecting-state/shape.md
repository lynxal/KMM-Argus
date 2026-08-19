# Web UI connecting state — Shaping Notes

## Scope

Fix [issue #5](https://github.com/lynxal/KMM-Argus/issues/5): the web UI paints the red "Disconnected" banner and pill during the initial handshake, because `ConnectionState` has no value for "an attempt is in flight". Add a neutral `connecting` state, give it a muted presentation, and correct the banner copy when there has never been a connection.

## Decisions

- **A failed cold attempt shows amber "Reconnecting…", not red.** The source retries forever with exponential backoff, so amber is the honest state. Red `disconnected` stays reserved for an explicit `disconnect()` — the Retry-now teardown and the schema-mismatch path.
- **Backfill copy without widening the API.** While the state is `connecting`, the banner reads "Connecting…" when `source.device` is still null and "Loading recent events…" once `/api/info` has landed and `/api/events` is in flight. `device` is already a signal on `EventSource`; no new field needed.
- **No new design tokens.** `--conn-off-*` is already neutral gray and `.ds-conn-dot--pulse` already exists. `src/design/tokens.json` is generated from `design_handoff_argus_inspector/ds/colors_and_type.css` by `scripts/build-tokens.ts`, so a new token would mean editing the design source of truth. The handoff has no `connecting` artboard — this state is new UI, built from existing tokens.
- **Retry-now dead-listener bug fixed alongside.** `disconnect()` called `listeners.clear()`, but `bindSource` subscribes exactly once at mount, so clicking "Retry now" silently killed event ingest for the rest of the session. In scope because the retry button is part of the banner being reworked.
- **Presentation extracted to a pure function** (`ConnectionBanner.states.ts`), matching the existing `TopBar.states.ts` / `FilterBar.states.ts` convention — and testable under Vitest's default node environment, since the project has no jsdom dependency.

## Context

- **Visuals:** None. The design handoff has no connecting state.
- **References:** `argus-webui/src/transport/{eventSource,websocketSource,mockSource}.ts`, `src/components/Overlays/ConnectionBanner.ts`, `src/components/TopBar/TopBar.states.ts`, `src/components/Primitives/Primitives.ts`. See `references.md`.
- **Product alignment:** N/A — bug fix, no roadmap impact.

## Standards Applied

None from the index; see `standards.md`.
