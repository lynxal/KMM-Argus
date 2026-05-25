# probe-webui

Manual probes against a running argus server (default `http://localhost:8787`). Not part of CI — there is no consumer app in CI to host the server.

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
