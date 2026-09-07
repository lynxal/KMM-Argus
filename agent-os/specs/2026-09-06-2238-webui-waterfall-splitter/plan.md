# Issue #31 — Draggable waterfall splitter + rows that degrade at any width

## Context

In the Web UI's **waterfall** view the event list on the left is pinned to `w-80` (320px) with no
way to change it (`argus-webui/src/components/SplitView/SplitView.ts:32-33`). Two things go wrong
at that width:

- Long paths and log messages truncate to nothing.
- Rows carrying the `↳ REDIRECTED` pill push their trailing cells past the pane's right edge, where
  `overflow-x-hidden` clips them — the timestamp disappears.

Trading waterfall width for list width is free (the waterfall scrolls horizontally anyway), so the
fix is a **draggable splitter** plus a row that stops overflowing at the narrow end.

### What I verified in the code

| Claim | Verdict |
| --- | --- |
| No `flex-none` on any fixed cell | ✅ `Row.ts:105,114,118,122,131,287` — every one defaults to `flex: 0 1 auto` |
| Rows clip rather than scroll | ✅ rows are `left:0; right:0` absolute (`virtual.ts:164-168`) inside an `overflow-x-hidden` viewport (`virtual.ts:52`) |
| Waterfall canvas ignores its container width | ✅ `computeScale`'s `_viewportPx` is unused (`Waterfall.ts:226-240`) — **no redraw on drag** |
| List viewport already re-pins on resize | ✅ `ResizeObserver` at `virtual.ts:196-200` |
| Design reference wants 34%, not 320px | ✅ `design_handoff_argus_inspector/argus/Inspector.jsx:73` |

Two things the issue did not mention that change the implementation:

1. **`npm run lint` rejects raw px literals.** `argus-webui/scripts/lint-tokens.ts:26` fails the
   build on `/\b\d+(\.\d+)?px\b/` in any `src/**` `.ts`/`.css` file except `src/design/**`,
   `src/styles/globals.css`, `src/assets/**`. So: narrow-mode CSS goes in `globals.css` (exempt),
   and TS carries bare numbers — the `GUTTER_W = 240` pattern already used in `Waterfall.ts:15`.
   Comments are stripped before scanning, so px in a comment is safe.
2. ~~`text-xxs` resolves to nothing.~~ **Wrong, corrected during implementation.** `globals.css`
   defines only `--fs-xs` upward, but `build-tokens.ts` reads the handoff source
   (`design_handoff_argus_inspector/ds/colors_and_type.css:445`, `--fs-xxs: 10px`), so the scale
   does carry `xxs` and the pill and chip render at 10px as intended. Full row min-content is
   ~402px rather than ~413px; the 440px threshold still clears it, so no constant changed.

### Width budget

Estimated at ~0.6em per JetBrains Mono glyph — 11px for row text, 10px for the two `text-xxs`
pills. **The probe measures the real numbers; the two constants below are starting values and get
tuned if measurement disagrees.**

- **Full row min-content** ≈ 402px: `px-2` 16 + 6 gaps 48 + badge 34 + method 40 + `OKHTTP` chip 46
  + status 40 + full pill 82 + path 0 + timestamp 96.
- **Narrow row min-content** ≈ 284px: chip hidden (−46 −8 gap), pill collapsed to `↳` (−64).

So the floor is 320px (today's width — the splitter only ever widens, per the chosen scope) and
narrow mode engages below 440px, leaving no band where the full row overflows.

## Decisions

- **Floor 320px, two drops.** Below 440px: hide the engine chip, collapse `↳ REDIRECTED` to `↳`.
  Timestamps keep their milliseconds. Nobody ends up narrower than today.
- **`EventList` observes its own width**, not `SplitView` — so the split view's list on a small
  window degrades too, and every list instance behaves the same. (Deviates from the issue, which
  had `SplitView` drive it.)
- **Committed probe**, not a scratchpad run: `scripts/probe-webui/` is the established home and CI
  runs `npm run probes` (`.github/workflows/verify-webui.yml`).
- **The correlation cell stays shrinkable on purpose** — see Task 5.

### Known trade-off

At the 320px floor the path cell gets ~35px (≈5 chars + `…`). That is the honest consequence of
keeping full timestamps and a 96px meta cell; the win is that one drag makes the pane 600px wide,
and nothing clips at any width. If more path is wanted at the floor later, the cheapest further
step is tightening the row gap from 8px to 4px in narrow mode (+20px) — deliberately not done here,
since it changes row rhythm beyond the two agreed drops.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-09-06-2238-webui-waterfall-splitter/` containing:

- `plan.md` — this file.
- `shape.md` — scope, the four shaping decisions above, the width budget, the two code findings
  (token lint, and the corrected `text-xxs` reading), and the known trade-off.
- `standards.md` — full text of `agent-os/standards/workflow/commit-conventions`,
  `naming/code-documentation`, `testing/test-structure`, each with a line on how it applies.
  Also record that **no existing standard covers `argus-webui`**; the package's own conventions
  (`*.states.ts` purity, token lint, probe harness) are what actually govern.
- `references.md` — `Inspector.jsx:72-75` (34% reference), `version-probe.js` (computed-style
  assertion idiom), `follow-tail-probe.js` (fake-device + `[data-event-id]` addressing),
  `EventList.states.ts` + its test (pure-logic test convention), `persistence.ts` +
  `eventStore.ts:251-256` (pref load/save shape).
- No `visuals/` — none provided; the design handoff is a code reference, not a mockup.

## Task 2 — Persist the width in the store

`argus-webui/src/store/eventStore.ts`

- Export `DEFAULT_WATERFALL_LIST_WIDTH = 320` beside `DEFAULT_MAX_EVENTS` (line 10).
- Add `readonly waterfallListWidth: Signal<number>` to the `EventStore` interface next to
  `showCorrelationId` (line 51), plus the field in the returned object (line ~284).
- Load beside the other prefs (line ~101), parsing defensively — `loadString` returns strings and a
  corrupt value must not become `NaN`:

  ```ts
  const waterfallListWidth = signal<number>(readListWidth());
  ```
  with a module-level `readListWidth()` that does `Number.parseInt(loadString('waterfallListWidth', ''), 10)`
  and falls back to the default unless the result is finite and positive.
- Save with one more effect beside the existing block (line ~255):
  `effect(() => saveString('waterfallListWidth', String(waterfallListWidth.value)));`

Key: `argus.webui.waterfallListWidth` (the `PREFIX` in `store/persistence.ts:6` supplies the
prefix). Reuse `loadString`/`saveString` as-is — no new persistence helper.

The store deliberately does **not** clamp: clamping needs a measured container, and
`SplitView`'s `ResizeObserver` does it on the first layout pass (Task 4). Keeping the constant here
also keeps the store free of any import from a component.

## Task 3 — Pure clamp logic + its test

**New** `argus-webui/src/components/SplitView/SplitView.states.ts` — follows the
`*.states.ts` convention (`EventList.states.ts`, `FilterBar.states.ts`, …): no `document`, so
Vitest can reach it in the default node environment.

```ts
export const MIN_LIST_WIDTH = 320;      // today's w-80 — the splitter only widens
export const MIN_WATERFALL_WIDTH = 320; // the waterfall pane can't be squeezed out either
export const SPLITTER_WIDTH = 8;        // matches the p-2 gutter it replaces
export const WIDTH_STEP = 16;           // arrow-key nudge

export function clampListWidth(desired: number, availablePx: number): number
```

Behaviour, all covered by **new** `__tests__/SplitView.states.test.ts` (mirroring
`EventList.states.test.ts` — imports only `vitest` + the module, asserts numbers, no mocks):

- non-finite `desired` → `DEFAULT_WATERFALL_LIST_WIDTH`
- below `MIN_LIST_WIDTH` → `MIN_LIST_WIDTH`
- `availablePx <= 0` → the desired value, min-clamped only. **This case matters**: before the first
  layout pass `clientWidth` is 0, and applying the max there would collapse a stored 600px pane to
  320px on every reload.
- otherwise `min(desired, max(MIN_LIST_WIDTH, availablePx - SPLITTER_WIDTH - MIN_WATERFALL_WIDTH))`
- result is rounded (sub-pixel widths make the probe's edge comparisons flaky)

## Task 4 — The splitter

**New** `argus-webui/src/components/SplitView/Splitter.ts`

```ts
export function createSplitter(props: {
  width: Signal<number>;
  available: () => number;
}): HTMLElement
```

- Root `div`: `w-2 flex-none cursor-col-resize flex items-center justify-center ds-splitter`,
  `style.touchAction = 'none'`, `role="separator"`, `aria-orientation="vertical"`, `tabindex="0"`,
  `aria-label`, and `title="Drag to resize · double-click to reset"`.
- Child rule: `div` with `w-px h-full bg-border-default ds-splitter-rule` — same shape as the
  existing decorative divider, `FilterBar/FilterBar.styles.ts:15`.
- Drag: `pointerdown` → `setPointerCapture(e.pointerId)`, set `data-dragging`, snapshot
  `e.clientX` and `width.peek()`, set `document.body.style.userSelect = 'none'`. `pointermove` →
  `width.value = clampListWidth(startWidth + (e.clientX - startX), available())`. `pointerup` /
  `pointercancel` release capture, drop the attribute and restore `userSelect`. Pointer capture is
  what lets the drag continue over the canvas and outside the window.
- Keyboard: `ArrowLeft`/`ArrowRight` ± `WIDTH_STEP` (±4× with Shift), `Home` and `dblclick` reset to
  `DEFAULT_WATERFALL_LIST_WIDTH`. `preventDefault()` only on keys actually handled.
  **No conflict**: `input/keyboard.ts:38-55` binds `ArrowUp`/`ArrowDown` but not left/right or Home.
- `aria-valuenow` / `aria-valuemin` / `aria-valuemax` refreshed in an `effect`.

`argus-webui/src/components/SplitView/SplitView.ts`

- Drop `w-80` from `narrowList` (line 33), keep `flex-none`; drive the width from the signal:
  `effect(() => { narrowList.style.width = `${store.waterfallListWidth.value}px`; })`.
  (`flex-none` is emitted after `flex-1` in Tailwind's flex group, which is why today's `w-80`
  works over `createEventList`'s `flex-1` — that ordering is unchanged.)
- Build the splitter once with `available: () => root.clientWidth - ROOT_PADDING` where
  `ROOT_PADDING = 16` mirrors the root's `p-2` (line 23).
- `waterfall` branch appends `[narrowList, splitter, waterfall]`; toggle the root's `gap-2` off in
  that branch (`root.classList.toggle('gap-2', view !== 'waterfall')`) so the 8px splitter *is* the
  gutter rather than adding a third one.
- A `ResizeObserver` on `root` re-clamps on window resize:
  `store.waterfallListWidth.value = clampListWidth(store.waterfallListWidth.peek(), available())`.
  `peek()`, not `.value` — reading the signal it writes would make the observer self-triggering.
  No loop via layout either: setting the child's width doesn't change `root`'s own box.
- Remove the now-dead `classList.remove('w-80', ...)` calls at lines 40 and 44 — `w-80` no longer
  exists anywhere, and `list` and `narrowList` are separate elements.

## Task 5 — Rows that fit

`argus-webui/src/components/EventList/Row.ts`

- Add `flex-none` to every fixed cell so they stop shrinking into each other: method (`:114`),
  status (`:122`), log level (`:149`), both `w-10` spacers (`:154,175`), custom label (`:169`),
  the redirect pill (`:213`, plus `whitespace-nowrap`), the engine chip (`:260`), and the meta cell
  (`:287`).
- **Leave the correlation cell (`:268`) shrinkable, deliberately, with a comment.** It already
  carries `truncate`, so `overflow: hidden` makes its automatic minimum size 0; because the path
  cell's basis is `0%` it absorbs none of any shortfall, so all of it lands on the correlation cell,
  which truncates. `flex-none` there would instead push the row past the right edge whenever the
  optional column is on at the floor width.
- Add `min-w-0` to the three flexible text cells (`:134,158,178`) — explicit rather than relying on
  `truncate`'s `overflow: hidden` to zero the automatic minimum.
- Add `ds-event-row` to `ROW_CLASS_BASE` (`:33`) as the narrow-mode CSS hook.
- Wrap the pill's label so CSS can drop it: `↳` as a text node plus
  `<span class="ds-row-redirect-label"> REDIRECTED</span>`. `applyRowRedirect` (`:88-100`) only
  touches `hidden`/`style.display`/`title`, so nothing there needs changing.
- Tag the engine chip `ds-row-engine`; it already carries a `title` (`:262`), so hiding it loses
  nothing recoverable.
- Set a `title` on each text cell (full `host + path`, full message, `label + payload`) so truncated
  text stays readable at any width.

`argus-webui/src/components/Primitives/Primitives.ts:10` — add `flex-none` to the src badge's class
list. It is a flex child in both callers (row and detail header) and should never shrink in either.

## Task 6 — Narrow mode

`argus-webui/src/components/EventList/EventList.states.ts`

```ts
export const NARROW_LIST_WIDTH = 440;   // just above the full row's ~402px min-content
export function isNarrowList(widthPx: number): boolean  // widthPx > 0 && widthPx < NARROW_LIST_WIDTH
```
The `widthPx > 0` guard matters: `clientWidth` is 0 before the first layout pass, and treating that
as narrow would flash the collapsed row on mount. Add cases to the existing
`__tests__/EventList.states.test.ts`.

`argus-webui/src/components/EventList/EventList.ts` — after `wrapper` is built, observe it:

```ts
const ro = new ResizeObserver(() => {
  wrapper.toggleAttribute('data-list-narrow', isNarrowList(wrapper.clientWidth));
});
ro.observe(wrapper);
```
Attribute on an ancestor, not classes on the row: rows are pooled and only rebuilt on a pool miss
(`virtual.ts:157-172`), so anything per-row would need `invalidateAll()` on every drag frame. An
ancestor attribute restyles live and future rows for free.

`argus-webui/src/styles/globals.css` (token-lint exempt, and the home for every `ds-` rule):

```css
[data-list-narrow] .ds-row-engine,
[data-list-narrow] .ds-row-redirect-label { display: none; }

.ds-splitter:hover .ds-splitter-rule,
.ds-splitter:focus-visible .ds-splitter-rule,
.ds-splitter[data-dragging] .ds-splitter-rule { background: var(--border-focus); }
```
`[data-list-narrow] .x` is specificity (0,2,0) against a utility's (0,1,0), and custom rules are
emitted after `@tailwind utilities` (line 3), so it wins on both counts. Hiding the chip with
`display: none` also removes its flex gap — items that aren't rendered get no gap. Comment the
block with *why* each drop is safe (both survive in tooltips and the detail pane).

Side effect worth noting: with the chip hidden, HTTP rows show `method + status` = 80px of fixed
cells and log rows show `level + spacer` = 80px, so the text columns line up in narrow mode —
better alignment than the wide row has.

## Task 7 — Committed probe

**New** `scripts/probe-webui/splitter-probe.js`, built on `fake-device.js` + `playwright` exactly
like `follow-tail-probe.js`, with the same `--diagnose` flag convention. Backfill ~40 HTTP events
including **two sharing a `requestGroupId`** so the second one gets a real redirect pill
(`store/redirects.ts:44-56` keys continuation hops off the group), plus some log events and one very
long path.

Press `w` once to reach waterfall (`view` defaults to `'split'`, and the cycle is
list → split → waterfall), then assert:

1. **Drag tracks.** `page.mouse` down on the `[role=separator]` box centre, move +200px, up →
   list pane `getBoundingClientRect().width` ≈ 520.
2. **Clamped both ends.** Drag far left → exactly 320. Far right → `available - 8 - 320`.
3. **Nothing clips.** At 320px, every row child's `right` ≤ the row's `right` and its `left` ≥ the
   row's `left`. Run it on a pill row, a log row and the long-path row. Repeat just below and just
   above `NARROW_LIST_WIDTH` — the band above the threshold is where a mis-set constant shows up.
4. **Nothing overlaps vertically.** Each row child's `bottom` ≤ its row's `bottom` — this is what
   the pill's un-`nowrap`'d text broke.
5. **Truncation is visible.** The long-path row's text cell has `scrollWidth > clientWidth` and a
   non-empty `title`.
6. **Narrow mode by computed style, not attributes.** `getComputedStyle(chip).display === 'none'`
   and the same for `.ds-row-redirect-label`, while the pill itself is **not** `none`. (A Tailwind
   display utility beats the `hidden` attribute — the trap `version-probe.js` documents at its
   line 68.)
7. **Persistence.** Set 520px, reload, assert the pane comes back 520px and
   `localStorage['argus.webui.waterfallListWidth'] === '520'`.
8. **Waterfall unaffected.** Canvas `style.width` is byte-identical before and after a drag — the
   `computeScale` claim, asserted rather than assumed.

Register it in `scripts/probe-webui/package.json`: add `"probe:splitter": "node splitter-probe.js"`
and append it to the `probes` chain. CI picks it up automatically —
`.github/workflows/verify-webui.yml` runs `npm run probes`. Document it in
`scripts/probe-webui/README.md` alongside the other four.

---

## Verification

```bash
cd argus-webui
npm run lint          # tsc + token lint — catches any px literal that slipped into .ts
npm test              # vitest: new SplitView.states + extended EventList.states
npm run build         # required by the probes, which serve dist/

cd ../scripts/probe-webui
npm ci && npx playwright install chromium   # first run only
npm run probe:splitter                      # then: npm run probes
```

Manual eyeball, since the numbers above are estimates:
`cd argus-webui && npm run dev`, open `http://localhost:5173/?simulate=off`, press `w`, and drag the
handle from the floor to the ceiling. Check the pill rows and the longest log message at both ends,
in light and dark theme.

If probe assertion 3 fails, the fix is to raise `MIN_LIST_WIDTH` and/or `NARROW_LIST_WIDTH` to the
measured min-content and re-run — the constants are budget estimates, the probe is the authority.

Note for whoever ships this: `:argus-webui-bundle` embeds the built SPA, so a release needs a Gradle
rebuild of that module. The `verify-webui` CI job is npm-only and won't cover it.
