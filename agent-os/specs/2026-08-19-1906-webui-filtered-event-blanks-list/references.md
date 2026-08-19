# References — filtered-out event blanks the event list

## The defect

### App shell mount effect — the actual cause

- **Location:** `argus-webui/src/app.ts:63-67`
- **Relevance:** reads `store.events.value` to answer a question about `store.events.value.length`,
  so every ingested event re-runs the effect and `contentHost.innerHTML = ''` detaches and re-appends
  the EventList's scroll viewport.
- **Key patterns:** the effect's only real job is a two-state mount (waiting ↔ split). Any effect whose
  body rebuilds DOM must depend on a value that changes exactly as often as the DOM needs to.

### Virtual list pinning

- **Location:** `argus-webui/src/components/EventList/virtual.ts:105-113` (`pinIfNeeded`),
  `:166-175` (scroll handler), `:188-194` (`setItems`)
- **Relevance:** where the damage becomes visible. `render()` only ever runs for the `scrollTop` it
  reads at call time, so a `scrollTop` changed by anything other than a scroll event strands the
  rendered window until the user scrolls.
- **Key patterns:** the `pinLocked` boolean and its rAF + 250 ms double release; `newestRowVisible()`
  as the one-`rowHeight` follow threshold; identity-keyed row pooling with a per-pass occurrence
  counter.

### Effect ordering

- **Location:** `argus-webui/src/components/EventList/EventList.ts:86-88` (items effect),
  `:140-152` (the two `invalidateAll()` + `setItems` effects)
- **Relevance:** the items effect runs before the app-shell effect, which is why `pinIfNeeded`'s write
  lands first and the detach gets the last word. The two `invalidateAll()` effects re-set identical
  items, so they hit the same no-op-write condition — both are covered by the probe.

## Similar implementations

### #13 — newest event at the bottom

- **Location:** `agent-os/specs/2026-08-19-1715-webui-newest-at-bottom/`, commit `d11ff9d`
- **Relevance:** introduced the pinning this bug was blamed on, and records the Chromium scrollTop
  revert as *measured* (scrollTop 39 → 0 one frame after the write, delivered as a scroll event). That
  is why the `pinLocked` guard stays.
- **Key patterns:** its verification section is the model for this one — prove the fix load-bearing by
  reverting it with the assertions in place. Its throwaway harness mounted `EventList` alone, which is
  precisely why it could not have caught a shell-level bug.

### probe-webui — committed browser checks

- **Location:** `scripts/probe-webui/{ui-probe.js,ws-probe.js,README.md}`
- **Relevance:** the repo's existing home for browser-level probes. Already depends on `playwright` and
  `ws`, already documented as manual rather than CI-wired, already establishes the conventions the new
  probe follows.
- **Key patterns:** CommonJS, plain node script, `process.exit(0|1)`, timestamped log lines, browser
  console + `last-failure.png` dumped on failure, base URL as `process.argv[2]`, and an
  `EXPECTED_SCHEMA` constant carrying an explicit drift warning against
  `argus-webui/src/transport/schema.ts`.

### Wire contract the fake device has to satisfy

- **Location:** `argus-webui/src/transport/websocketSource.ts:74-112`, `src/transport/schema.ts:9,58-146`
- **Relevance:** `GET /api/info` → `ServerAppInfo`; `GET /api/events?limit=500` → `ArgusEvent[]`
  oldest-first; `WS /ws` → `hello` frame with `schemaVersion` matching `ARGUS_SCHEMA_VERSION` (2), then
  `{ type: 'event', event }` envelopes. A mismatched `schemaVersion` makes the UI disconnect rather
  than fail loudly, so getting it wrong looks like a connection problem.

### Filter chips the probe drives

- **Location:** `argus-webui/src/components/FilterBar/FilterBar.ts:52-68`
- **Relevance:** source chips are plain `<button>` elements whose `textContent` is exactly `HTTP`,
  `LOG`, or `CUSTOM`, so `button:text-is("LOG")` is unambiguous — no level or method chip collides.
