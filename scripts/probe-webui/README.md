# probe-webui

Manual probes against a running argus server (default `http://localhost:8787`). Not part of CI — there is no consumer app in CI to host the server. `follow-tail-probe.js` is the exception: it fakes the device in-process and needs no server, but it is still run by hand for the same reason there is no Node job in `verify.yml` at all.

## Setup

```bash
cd scripts/probe-webui
npm install
# Playwright browsers (only needed for ui-probe.js):
npx playwright install chromium
```

## ws-probe.js — raw WebSocket frame check

Opens `/ws`, asserts a `hello` frame within 2 s with the expected `schemaVersion`, then idles 25 s expecting at least one server-driven ping. Exits 0 on success.

```bash
node ws-probe.js                       # ws://localhost:8787/ws
node ws-probe.js ws://device.lan:8787/ws
```

**Schema-version drift:** the `EXPECTED_SCHEMA` constant at the top of
`ws-probe.js` must be kept in sync with `argus-webui/src/transport/schema.ts`.
Bump both together when the wire schema changes — there is no static check
that catches a missed update here.

## ui-probe.js — Playwright headless UI check

Loads the UI in headless Chromium and waits for the `.ds-banner` ConnectionBanner element to be hidden (it self-hides only when the WS connection state is `connected`). Dumps console + a screenshot to `last-failure.png` on timeout.

```bash
node ui-probe.js                       # http://localhost:8787/
node ui-probe.js http://device.lan:8787/
```

## follow-tail-probe.js — event-list follow-tail regression probe

Regression cover for [#15](https://github.com/lynxal/KMM-Argus/issues/15): with a filter active and
the list following the tail, an event the filter hides used to blank the list — the rows stayed in the
DOM at their old offsets while `scrollTop` dropped to 0, and nothing re-rendered until the user
scrolled.

Self-contained via `fake-device.js` (below), so unlike the two probes above it needs **no device and
no host app** — only a built UI. That matters here: the bug lived in the app shell above the
EventList, and a harness mounting `EventList` alone could not have seen it.

```bash
cd argus-webui && npm run build     # required — the probe serves dist/
cd ../scripts/probe-webui
node follow-tail-probe.js
node follow-tail-probe.js --diagnose   # + a scrollTop/DOM-mutation timeline per injection
```

Asserts, at a 900×600 viewport with 60 backfilled events: the list opens following the tail; six
consecutive filtered-out events each leave `scrollTop` and the rendered window untouched; a visible
event still advances the tail by one row; the search query and the correlation-column toggle (both of
which re-set identical items) keep rows on screen; and the empty ↔ non-empty content-host swap still
happens in both directions.

`--diagnose` is what identified the cause — it distinguishes a scroll event carrying a reverted
position from the viewport being detached and re-appended, which moves `scrollTop` with no event at
all.

## related-logs-probe.js — Related Logs reachable from every group member

Regression cover for the Related Logs tab being HTTP-only. Following a log out of a call's Related
Logs list selected an event whose tab set had no Related Logs entry, so the tab vanished mid-walk and
the rest of the correlation group became unreachable without going back to the call.

```bash
cd argus-webui && npm run build     # required — the probes serve dist/
cd ../scripts/probe-webui
node related-logs-probe.js
```

Backfills one call and three logs sharing a correlation id, plus one log outside any scope. Asserts
the call still lists its whole scope; that hopping to a log keeps the tab present, active, and listing
the group minus itself; that a second hop behaves the same; and that a log with no correlation id
explains the empty panel instead of showing a dead tab.

It reads the tab strip through `[data-detail-tabs]` and the panel through `[data-related-logs]`,
structurally rather than by Tailwind class, so a restyle cannot turn a real failure into a silent
pass. A missing strip is reported as a stale `dist/` rather than counted as a failed assertion.

## fake-device.js — the in-process device both probes share

Serves the built `argus-webui/dist/` plus `/api/info`, `/api/events`, and `WS /ws` on an ephemeral
port, and hands back a `push(event)` for emitting over the socket mid-run. Serving the bundle
**same-origin** with the API is the point: `app.ts` resolves the device to whatever origin served the
page, so the real `mountApp` and the real `websocketSource` run, with no test seam in shipped code.

Not usable as a stand-in for the bundled mock source, which replays a finite fixture and cannot emit
on demand — several of these assertions need an event to arrive *after* the UI is in a particular
state.

**Schema-version drift:** same caveat as `ws-probe.js` — `EXPECTED_SCHEMA` in `fake-device.js` must
track `ARGUS_SCHEMA_VERSION` in `argus-webui/src/transport/schema.ts`. A mismatch makes the UI
disconnect silently, which reads as a connection failure rather than a version problem.
