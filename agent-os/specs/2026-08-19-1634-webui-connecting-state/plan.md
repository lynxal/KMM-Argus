# Fix: Web UI shows "Disconnected" while it is still connecting (issue #5)

## Context

On a cold load the Argus web UI paints the red **Disconnected** banner ("Disconnected. Last seen just now.") plus a red top-bar pill while the handshake is still in progress — first impression is a broken tool.

Root cause, confirmed in the code: there is no "connecting" state. `ConnectionState` is `'connected' | 'reconnecting' | 'disconnected'` (`argus-webui/src/transport/eventSource.ts:4`) and `websocketSource` initialises the signal to `'disconnected'` (`websocketSource.ts:42`). Nothing moves it off that value until `markSeen()` runs on `ws.onopen` (`websocketSource.ts:117`), which is two network round trips later — `GET /api/info` then `GET /api/events?limit=500` (`connect()`, `websocketSource.ts:153-162`). Both consumers render straight off the raw signal: `ConnectionBanner.ts:44-49` treats anything that isn't `connected`/`reconnecting` as the red branch, and `CONN_TONE` (`TopBar.states.ts:4-8`) maps `disconnected` to the off pill. The "Last seen just now" copy is also wrong on a cold start — `lastSeenAt` is `null`.

Outcome: a neutral "Connecting…" state covers the whole initial handshake and backfill; red is reserved for a real dead connection.

## Decisions (from shaping)

- **A failed cold attempt shows amber "Reconnecting…"**, not red. The source retries forever, so amber is the honest state; red `disconnected` stays reserved for an explicit `disconnect()` (Retry-now teardown, schema mismatch).
- **Backfill gets its own copy, with no new API**: while state is `connecting`, the banner reads "Connecting…" when `source.device` is still null and "Loading recent events…" once `/api/info` has landed (i.e. `/api/events` is in flight). `device` is already a signal on the source.
- **No new design tokens.** `--conn-off-*` is already neutral gray, and `.ds-conn-dot--pulse` already exists. `src/design/tokens.json` is generated from `design_handoff_argus_inspector/ds/colors_and_type.css` by `scripts/build-tokens.ts`, so inventing a token means editing the design source of truth — not warranted here. The handoff has no `connecting` artboard; note that in the spec.

## Tasks

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1634-webui-connecting-state/` with `plan.md` (this plan), `shape.md` (scope, the two decisions above, issue link), `standards.md` (same conclusion as the `2026-05-01-0126-split-filter-bar-two-rows` spec: nothing in `agent-os/standards/index.yml` covers the TS/Tailwind webui; only `workflow/commit-conventions` applies at commit time), `references.md` (files listed below). No `visuals/` — none provided.

### Task 2 — Add the `connecting` state to the transport

- `src/transport/eventSource.ts`: `ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'`; document that `connecting` means "no attempt has resolved yet" and `disconnected` means "torn down, not retrying".
- `src/transport/websocketSource.ts`: initialise the signal to `'connecting'`; set `connection.value = 'connecting'` at the top of `connect()` so the Retry-now path re-enters it too. `scheduleReconnect()` keeps setting `'reconnecting'` — no change.
- `src/transport/mockSource.ts`: initialise to `'connecting'` for parity. The `simulate` timers already guard on `=== 'disconnected'`; leave them.

### Task 3 — Fix the Retry-now dead-listener bug

`disconnect()` in both sources calls `listeners.clear()`, but `bindSource` (`src/store/eventStore.ts:190`) subscribes exactly once at mount. The banner's Retry button (`ConnectionBanner.ts:23`) is the only external caller, so clicking it silently kills event ingest for the rest of the session. Drop `listeners.clear()` from `disconnect()` in `websocketSource.ts` and `mockSource.ts` — the subscription must outlive a transport teardown. In scope because the banner's retry path is the connecting-state UI.

### Task 4 — Neutral presentation

- `src/components/Primitives/Primitives.ts`: extend `createConnDot` with a `'wait'` tone → `bg-conn-off-dot` plus `ds-conn-dot--pulse` (same pulse the `reco` dot uses).
- `src/components/TopBar/TopBar.states.ts`: add `connecting: { dot: 'wait', text: 'Connecting…', className: 'text-conn-off-fg' }`. `Record<ConnectionState, …>` makes the new key a compile error until it's added, so nothing else in TopBar needs touching.
- New `src/components/Overlays/ConnectionBanner.states.ts` — pure presentation function, matching the existing `*.states.ts` convention (`TopBar.states.ts`, `FilterBar.states.ts`):
  ```ts
  bannerState({ connection, lastSeenAt, retryAt, hasDevice, now })
    → { hidden, className, dot: 'wait' | 'reco' | 'off' | null, icon: 'refresh' | 'wifiOff' | null,
        message, meta, showRetry }
  ```
  Rules: `connected` → hidden. `connecting` → neutral (`border-border-default bg-bg-overlay text-fg-2`), pulsing `wait` dot, message `hasDevice ? 'Loading recent events…' : 'Connecting…'`, no retry button, empty meta. `reconnecting` → unchanged amber `status-4xx-*` + `refresh` icon. `disconnected` → red `status-5xx-*` + `wifiOff` icon, message `lastSeenAt ? 'Disconnected. Reconnect to resume the stream.' : 'Disconnected. Could not reach the device.'` — the "Last seen just now" string goes away entirely; the timestamp already lives in `meta`. Meta is assembled from independent parts so a retry countdown renders even when `lastSeenAt` is null (today it is gated on `last` being truthy, `ConnectionBanner.ts:52-54`).
- `src/components/Overlays/ConnectionBanner.ts`: keep the single `effect`, drive icon/dot/message/meta/retry-visibility from `bannerState(...)`. Keep `.ds-banner` and the `hidden` toggle exactly as-is — `scripts/probe-webui/ui-probe.js` detects "connected" by `.ds-banner` having the `hidden` class.

### Task 5 — Tests

Vitest runs in the default node environment (no jsdom dependency), so tests target pure logic only:

- `src/components/Overlays/__tests__/ConnectionBanner.states.test.ts` — connecting with/without device gives the two messages and never a red class; connected is hidden; disconnected with `lastSeenAt === null` produces no "last seen" text but still shows the retry countdown; reconnecting is unchanged amber.
- `src/transport/__tests__/websocketSource.test.ts` — construct with `{ device: 'x:1', scheme: 'http' }` (passing `scheme` avoids the `window.location` read, so no DOM is needed), stub `globalThis.fetch` and `globalThis.WebSocket`, use `vi.useFakeTimers()`. Assert: initial value is `connecting`; still `connecting` while `/api/info` and `/api/events` are pending; `connected` on `ws.onopen`; a failed cold handshake plus a WS close lands on `reconnecting`, never `disconnected`; `disconnect()` sets `disconnected` and leaves registered listeners intact (Task 3).

## Verification

From `argus-webui/`:

```bash
npm run lint    # tsc --noEmit + token lint (no raw hex/px in components)
npm test        # vitest run — existing suites plus the two new ones
npm run build   # tokens + tsc + vite build
```

`npm run lint` is the real gate on Tasks 2 and 4: the `Record<ConnectionState, …>` map and every `switch` on the state fail to compile until the new member is handled.

Manual (optional, needs a device or the sample app): `npm run dev` → `http://localhost:5173/?device=<host:port>` and watch the cold-start sequence — neutral "Connecting…" → "Loading recent events…" → banner hidden. Point at a dead host to confirm it settles on amber "Reconnecting…" with a countdown and never flashes red.

## Files

| File | Change |
| --- | --- |
| `argus-webui/src/transport/eventSource.ts` | add `connecting` to the union |
| `argus-webui/src/transport/websocketSource.ts` | initial + `connect()` state; drop `listeners.clear()` |
| `argus-webui/src/transport/mockSource.ts` | initial state; drop `listeners.clear()` |
| `argus-webui/src/components/Primitives/Primitives.ts` | `wait` dot tone |
| `argus-webui/src/components/TopBar/TopBar.states.ts` | `connecting` pill tone |
| `argus-webui/src/components/Overlays/ConnectionBanner.states.ts` | new — pure presentation map |
| `argus-webui/src/components/Overlays/ConnectionBanner.ts` | render from `bannerState` |
| `argus-webui/src/components/Overlays/__tests__/ConnectionBanner.states.test.ts` | new |
| `argus-webui/src/transport/__tests__/websocketSource.test.ts` | new |
| `agent-os/specs/2026-08-19-1634-webui-connecting-state/*` | new spec docs |

Untouched: `app.ts` (the "Waiting for events" empty state stays gated on `connected`, which is still correct), `globals.css` and `src/design/tokens.json` (generated), the design handoff.
