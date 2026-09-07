# References for the Waterfall Splitter

## Design reference

### Waterfall layout in the React handoff

- **Location:** `design_handoff_argus_inspector/argus/Inspector.jsx:72-75`,
  `design_handoff_argus_inspector/README.md:74-86`
- **Relevance:** the source of the "narrow list on the left" layout the implementation copies.
- **Key patterns:** the reference sizes the list at `flex: '0 0 34%'`, not a fixed 320px. Not
  adopted — a user-draggable px width is strictly more useful than a percentage they cannot change,
  and 320px stays the default so the view opens exactly as it does today.

## Implementation patterns to copy

### Pure presentation logic + its test

- **Location:** `argus-webui/src/components/EventList/EventList.states.ts` and
  `argus-webui/src/components/EventList/__tests__/EventList.states.test.ts`
- **Relevance:** the template for `SplitView.states.ts` and its test.
- **Key patterns:** the module touches no `document` at all — Vitest runs in the default node
  environment with no jsdom, so anything reaching for the DOM is untestable. The test imports only
  `vitest` and the module under test, builds minimal literal fixtures, asserts plain values, and
  uses no mocks or `beforeEach`.

### Persisted preference

- **Location:** `argus-webui/src/store/persistence.ts` (all 41 lines),
  `argus-webui/src/store/eventStore.ts:97-101` (load) and `:251-256` (save)
- **Relevance:** exactly the shape `waterfallListWidth` follows.
- **Key patterns:** `loadString`/`saveString` swallow storage failures, and `PREFIX =
  'argus.webui.'` supplies the key namespace. One `effect` per key. Those effects fire once at
  creation, so a fresh store writes its own defaults back to storage — expected, not a bug.

### Rows are pooled, so patch rather than rebuild

- **Location:** `argus-webui/src/components/EventList/virtual.ts:145-181`,
  and the patch helpers `Row.ts:55-100`
- **Relevance:** why narrow mode is an attribute on an ancestor instead of classes on the row.
- **Key patterns:** `renderRow` only runs on a pool miss, so per-row state has to be patchable
  after the row exists. Toggling one attribute on the list root restyles every live row and every
  future one with no pool churn — important when the trigger fires on each drag frame.

### Canvas scale is independent of container width

- **Location:** `argus-webui/src/components/Waterfall/Waterfall.ts:226-240`, callers at `:262,303`
- **Relevance:** proves the splitter needs no waterfall redraw.
- **Key patterns:** `computeScale(spanMs, _viewportPx, zoom)` never reads `_viewportPx`; canvas
  width is a function of time span and zoom only, and the pane scrolls horizontally. Asserted by
  the probe rather than assumed.

## Probe harness

### The fake device

- **Location:** `scripts/probe-webui/fake-device.js`
- **Relevance:** the base every committed probe builds on; `splitter-probe.js` is no different.
- **Key patterns:** serves the built `argus-webui/dist/` **same-origin** with `/api/info`,
  `/api/events` and `WS /ws`, on an ephemeral port. Same-origin is the point: `app.ts` resolves the
  device to whatever origin served the page, so the real `mountApp` and the real `websocketSource`
  run with no test seam in shipped code. Requires `cd argus-webui && npm run build` first.

### Assert computed style, not attributes

- **Location:** `scripts/probe-webui/version-probe.js:68-77` and its file header
- **Relevance:** directly applicable — the narrow-mode assertions are display checks on elements
  that also carry a `hidden` attribute.
- **Key patterns:** `getComputedStyle(el).display`, because a Tailwind display utility beats the
  UA's `[hidden] { display: none }`. Same trap `applyRowRedirect` works around at `Row.ts:91-95`.
  Also measures `getBoundingClientRect()` boxes rather than trusting class names.

### Driving the real list, and `--diagnose`

- **Location:** `scripts/probe-webui/follow-tail-probe.js`
- **Relevance:** the structure `splitter-probe.js` mirrors — backfill, drive, measure.
- **Key patterns:** rows are addressed as `[data-event-id]` and the viewport found by walking up
  from a row, "structurally rather than by Tailwind class, so a restyle cannot turn a real failure
  into a silent pass". In-page helpers are serialized into the browser and must be self-contained.
  Every probe takes `--diagnose` for a timeline dump instead of pass/fail.

### Redirect chains in fixture data

- **Location:** `argus-webui/src/store/redirects.ts:44-56`
- **Relevance:** how the probe produces a row that actually shows the pill.
- **Key patterns:** two HTTP events sharing a `requestGroupId`; the first arrival is the origin and
  every later hop in the group gets an entry, which is what `applyRowRedirect` renders.

## Constraints discovered

### Token lint

- **Location:** `argus-webui/scripts/lint-tokens.ts:19-26`
- **Relevance:** decides where the new CSS can live.
- **Key patterns:** `PX = /\b\d+(?:\.\d+)?px\b/` over every `src/**` `.ts`/`.css`/`.html`, exempting
  only `src/design`, `src/styles/globals.css`, `src/assets`. `Waterfall.ts:15` (`GUTTER_W = 240`)
  is the precedent for bare numeric constants in TypeScript.

### Keyboard bindings

- **Location:** `argus-webui/src/input/keyboard.ts:38-55`, handler at `:209-222`
- **Relevance:** confirms the splitter's keys are free.
- **Key patterns:** `ArrowUp`/`ArrowDown` are bound to `selectPrev`/`selectNext`; `ArrowLeft`,
  `ArrowRight` and `Home` are not bound at all. The handler's `isTypingTarget` guard only exempts
  inputs, textareas and contenteditable — a `tabindex="0"` div is not exempt, which is why the
  splitter must avoid the bound keys rather than rely on focus.
