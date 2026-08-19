# References for the Web UI connecting state

## Transport

### `argus-webui/src/transport/eventSource.ts`

- **Relevance:** Declares `ConnectionState` and the `EventSource` interface both sources implement.
- **Key patterns:** Connection-shape state lives on the source as `@preact/signals-core` signals (`connection`, `device`, `lastSeenAt`, `retryAt`); events flow through a listener callback so the store owns display state.

### `argus-webui/src/transport/websocketSource.ts`

- **Relevance:** The source that exhibits the bug — `connect()` does two REST round trips before `openStream()`, and nothing moved the signal off `disconnected` until `ws.onopen`.
- **Key patterns:** `markSeen()` is the single place that flips to `connected`; `scheduleReconnect()` owns the amber state and exponential backoff capped at 10 s.

### `argus-webui/src/transport/mockSource.ts`

- **Relevance:** Fixture source kept at parity with the real one; `?simulate=` scripts connection transitions for local dev.

## Presentation

### `argus-webui/src/components/TopBar/TopBar.states.ts`

- **Relevance:** The `*.states.ts` convention this change follows — a token-backed `Record<ConnectionState, …>` map separate from the DOM builder. Being an exhaustive `Record`, it turns a new state into a compile error until it is handled.

### `argus-webui/src/components/FilterBar/FilterBar.states.ts`

- **Relevance:** Second example of the same convention (`SOURCE_TONES`, `METHOD_COLORS`).

### `argus-webui/src/components/Primitives/Primitives.ts`

- **Relevance:** `createConnDot(tone)` — shared 8 px status dot, with `ds-conn-dot--pulse` already wired to the `argusPulse` keyframe in `globals.css`. Extended with a `wait` tone rather than adding a new element.

## Verification

### `scripts/probe-webui/ui-probe.js`

- **Relevance:** Headless Playwright probe that asserts "connected" by checking that `.ds-banner` carries the `hidden` class. Constrains the fix: the banner must keep the `.ds-banner` class and the `hidden` toggle.
