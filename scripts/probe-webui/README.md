# probe-webui

Probes for the argus Web UI, in two groups.

**Run in CI** (`.github/workflows/verify-webui.yml`, via `npm run probes`) — `version-probe.js`,
`related-logs-probe.js`, `follow-tail-probe.js`, `json-expand-probe.js`, `splitter-probe.js`. All
five fake the device in-process through `fake-device.js`, so they need no device and no host app,
only a built `argus-webui/dist/`.

**Manual only** — `ws-probe.js` and `ui-probe.js`. Both need a real argus server on
`http://localhost:8787`, which in CI would mean an Android emulator job running the sample app.
That is a project rather than a task, which is why they were written as manual probes and why
[#17](https://github.com/lynxal/KMM-Argus/issues/17) left them out of scope.

## Setup

```bash
cd scripts/probe-webui
npm ci
# Playwright browsers (needed by every probe except ws-probe.js):
npx playwright install chromium
```

Then, for the five self-contained probes:

```bash
cd ../../argus-webui && npm ci && npm run build   # they serve dist/
cd ../scripts/probe-webui && npm run probes       # cheapest first, so a stale dist/ fails in 1s
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

## related-logs-probe.js — Related Logs across a correlation group

Regression cover for two things the Related Logs tab used to get wrong. It was HTTP-only, so
following a log out of a call's list selected an event whose tab set had no Related Logs entry — the
tab vanished mid-walk and the rest of the group became unreachable without going back to the call.
And the panel filtered to log events — so a log could never lead back to the request it ran under —
while also omitting the event being inspected, so a five-event scope read as four rows with no
indication of where in the group you were standing.

```bash
cd argus-webui && npm run build     # required — the probes serve dist/
cd ../scripts/probe-webui
node related-logs-probe.js
```

Backfills two calls and three logs sharing a correlation id — interleaved the way the sample app's
"Correlated pair" button emits them — plus one log outside any scope. Asserts that every member lists
the whole group with itself marked in its arrival slot and not clickable; that hopping to a log or to
a call keeps the tab present, active, and correct; that a second hop behaves the same; and that an
event with no correlation id explains the empty panel instead of showing a dead tab.

Both fixture properties are load-bearing: a logs-only panel passes a same-kind fixture, and a panel
that marked the wrong row passes one where the calls sit adjacent.

It reads the tab strip through `[data-detail-tabs]` and the panel through `[data-related-logs]`,
structurally rather than by Tailwind class, so a restyle cannot turn a real failure into a silent
pass. A missing strip is reported as a stale `dist/` rather than counted as a failed assertion.

## version-probe.js — TopBar reports the Argus version off the wire

Cover for [#8](https://github.com/lynxal/KMM-Argus/issues/8): the Web UI used to
drop `AppInfo.argusVersion` on the floor, so nothing on screen could contradict
the hardcoded `0.1.0` the server was reporting. Asserts the TopBar renders
exactly the `argusVersion` the fake device sent, plus its tooltip and computed
`display` (a Tailwind display utility beats the `hidden` attribute, so assert
what the browser resolved rather than the attribute).

Deliberately compares against `fake-device.js`'s `APP_INFO.argusVersion`, not
against `gradle.properties` — pinning the real release version here would pass
even if the UI painted a literal, which is the bug.

Also asserts the connection dot measures 8×8 and the pill's padding is symmetric.
`.ds-conn-dot` is a bare `<span>`, and `display: inline` ignores `width`/`height`,
so the TopBar's dot rendered 0×0 and the pill's `gap-2` read as off-centre text.
The five other dots in the app survived only because they are direct flex
children, which blockifies them. The class list was always correct, so assert the
measured box.

```bash
node version-probe.js
```

Self-contained via `fake-device.js`; needs a built UI but no device.

## json-expand-probe.js — expanded JSON nodes survive the stream

Cover for [#28](https://github.com/lynxal/KMM-Argus/issues/28). The detail pane used to subscribe to the whole `store.events` array, so every ingested event — a log
from elsewhere in the app, nothing to do with the call being inspected — re-ran its effect and
rebuilt the tab body via `content.innerHTML = ''`. Expansion lived only in the `<details>` elements
that wipe destroyed, so every JSON node the reader had opened snapped back to the `depth < 2`
default, along with the pane's scroll offset and any text selection. On a live stream the tree was
unusable unless you hit Pause first.

Fixed in two places, and the probe covers them separately because either alone leaves the bug
half-present: `store.selectedEvent` is a `computed`, so the pane's effect runs on selection changes
rather than per ingest; and `BodyViewer.states.ts` remembers expansion per pane and path, so the
rebuilds that legitimately still happen — a tab switch, a reselect — also come back as they were
left.

Asserts, against one HTTP event with a deeply nested JSON body:

- the tree arrives with deep nodes collapsed, and a key containing `/` gets its own path;
- an expanded node is still open after three unrelated logs arrive, and **no** node changed state;
- the pane was not rebuilt at all — by DOM element identity *and* by the body box's scroll offset,
  since a rebuild that restored expansion would be indistinguishable by open state alone, and the
  offset is the reader's place in a long body, which no amount of state restoration brings back;
- a deliberately *collapsed* default-open node does not spring back open;
- expansion survives a tab switch away and back, and reselecting the row;
- the Request and Response panes of one event keep separate state, on a fixture whose two bodies
  share their top-level shape so a single shared key would leak one into the other;
- and the layout invariant those scroll assertions rest on: the document itself does not scroll, a
  body too tall for the pane scrolls *inside* it, and the box takes an offset at all. Asserted
  rather than assumed — without it the offset checks would pass vacuously on `0 === 0`.

```bash
npm run probe:json-expand
node json-expand-probe.js --diagnose   # + the per-node open-state dump before and after
```

Self-contained via `fake-device.js` — necessarily so: the mock source schedules its whole fixture up
front inside `connect()` and has no push API, so it cannot make an event arrive *after* a node has
been expanded. Addresses the tree through `[data-json-node]`, whose value is the node's path, rather
than by Tailwind class. A missing tab strip is reported as a stale `dist/` rather than counted as a
failed assertion.

That last group exists because it was briefly untrue. The app shell was `min-h-screen` — a
*minimum*, so it grew past the window rather than holding to it, and the `flex-1 min-h-0` chain
below inherited that freedom. No inner box ever ran out of room, so none overflowed: this same
fixture stretched the detail pane to ~5x the window height and scrolled the whole document,
carrying the top bar and filter bar off screen, while `scrollTop` stayed 0 whatever you set it to.
The shell is `h-dvh` now. If a scroll assertion here ever starts reading 0, check that before
suspecting the probe.

## splitter-probe.js — the waterfall pane resizes, and rows fit inside it

Regression probe for [#31](https://github.com/lynxal/KMM-Argus/issues/31) — "waterfall list pane is
a fixed 320px, so long rows clip with no way to widen it". Covers both halves of that fix together,
because either one alone is insufficient: a splitter that can reach a width where rows still clip is
not a fix, and rows that fit at 320px are no use if 320px is all you can have.

Backfills 20 HTTP events, 8 logs, and one pair of hops sharing a `requestGroupId` so the second gets
a real redirect pill — the widest cell in the row, and the one that broke the layout. Its path is
deliberately ~140 characters. The engine is `okhttp`, not the fixtures' usual `ktor`: `OKHTTP` is the
longest engine label, so it is what decides whether the wide row fits.

Asserts, at several widths:

- The pane opens at the 320px default, tracks a pointer drag, and clamps at both ends — narrow to
  `MIN_LIST_WIDTH`, wide to `available − SPLITTER_WIDTH − MIN_WATERFALL_WIDTH`.
- **No cell escapes its row**, horizontally or vertically, at the floor and on both sides of the
  narrow-mode threshold. This is the actual bug: rows are absolutely positioned `left:0; right:0`
  inside an `overflow-x-hidden` viewport, so a cell past the row's right edge is not drawn at all.
  Before the fix the timestamp on a pill row overflowed by 40px and the path cell was squeezed to
  0px wide. The vertical half catches the other failure mode — an un-`nowrap`'d pill label wrapping
  inside its fixed-height box and spilling onto the neighbouring rows.
- Narrow mode is asserted by **computed `display`**, never by `textContent` or a class: a
  `display: none` child still contributes its text to `textContent`, so only the measured box says
  whether the redirect label was really dropped. Same reason `version-probe.js` measures rather
  than reads.
- The long path truncates with a real ellipsis and keeps its full value in a `title`.
- With the optional correlationId column switched on at the floor width, still nothing overflows.
  That column's cell is the one cell deliberately left shrinkable, so that it soaks up the whole
  shortfall and truncates rather than shoving the trailing cells off the edge — a claim about flex
  behaviour, measured here rather than asserted in a comment.
- The drag does **not** rescale the waterfall canvas — `computeScale` ignores its viewport argument,
  and this asserts that rather than trusting it.
- The width persists to `argus.webui.waterfallListWidth` and survives a reload.
- The handle is keyboard-operable: `ArrowLeft` nudges, `Home` resets.

The three width constants at the top of the file mirror `SplitView.states.ts` and
`EventList.states.ts`. They are duplicated on purpose — if the source constants move somewhere the
row no longer fits, this probe is what says so.

## fake-device.js — the in-process device the CI probes share

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
