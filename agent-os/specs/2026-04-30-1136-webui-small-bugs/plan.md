# Three small argus-webui bugs

## Context

Three small bugs in argus-webui, scoped together because they all touch the EventList/Waterfall surface area:

1. **Waterfall doesn't scroll to selection.** When an event is selected from the EventList (or by keyboard), the waterfall body never scrolls — the selected row's bar can be off-viewport (vertically, or horizontally when zoom > 1) with no feedback.
2. **List timestamp gets clipped.** LOG/Custom rows show `HH:MM:SS.ms` (12 chars in monospace ≈ 90 px) inside a `w-14` (56 px) box, and the row's right edge sits under the vertical scrollbar. The trailing milliseconds get cropped.
3. **Correlation-id toggle is a no-op.** The TopBar button updates `store.showCorrelationId` correctly and EventList's effect calls `list.setItems(...)`, but `virtual.ts` keys row elements by event id and reuses pooled DOM (`virtual.ts:57`) — so a toggle never rebuilds rows to add/remove the correlation cell.

Outcome: clicking a row in the list scrolls the waterfall into view (centered, only when offscreen, only on external selection); the timestamp's tail is fully visible in list view; the correlation-id toggle actually shows/hides the column.

---

## Spec folder

Save shaping artifacts at `agent-os/specs/2026-04-30-1136-webui-small-bugs/`:
- `plan.md` (copy of this plan)
- `shape.md` (scope, decisions, ambiguity resolutions)
- `references.md` (pointers to the four files touched)

No `standards.md` — `agent-os/standards/index.yml` is Android/cloud-flavoured; nothing in there governs the webui DOM/canvas layer.

---

## Bug 1 — Waterfall auto-scroll on external selection

**File:** `argus-webui/src/components/Waterfall/Waterfall.ts`

### 1a. Make body horizontally scrollable when zoom > 1

Today the canvas is sized to `viewport.clientWidth` and `spanMs` is divided by zoom (`drawBody:200-203`, `drawHeader:167-168`). So zooming in just compresses the visible window and pushes events past `start + spanMs` off-canvas with no way to reach them. To enable horizontal scroll:

- In `drawBody` (`Waterfall.ts:180-252`):
  - Replace `const w = viewport.clientWidth` with `const visibleW = viewport.clientWidth; const w = visibleW * Math.max(1, zoom);`
  - Keep `canvas.width = Math.floor(w * dpr)` and `canvas.style.width = ${w}px` — canvas now extends past the viewport when zoomed.
  - Compute `const spanMs = end - start` (drop the `/ zoom`) and `msPerPx = spanMs / Math.max(1, trackW)`. Bars now span the full canvas width at full resolution; horizontal panning happens via `body.scrollLeft`.
- In `drawHeader` (`Waterfall.ts:148-178`): the axis must scroll with the body, not stay above it. Move `axisCanvas` out of `header` and into `body` (sticky-top inside the scroll container) so it shares horizontal scroll. Concretely:
  - Wrap `axisCanvas` in a `div` with `position: sticky; top: 0; z-index: 1; background: var(--bg-panel);` and append that wrapper as the **first child of `body`** instead of `header`.
  - In `drawHeader`, mirror the body sizing: `const w = body.clientWidth * Math.max(1, zoom)` and remove `/ zoom` so labels span the full timeline at full resolution.
  - Adjust the body's click/mousemove handlers to subtract the axis-row height from `y` so row index math still lands on the right event (current code at `Waterfall.ts:73,84` uses `y = e.clientY - rect.top + body.scrollTop`).

> Tradeoff acknowledged: the count label and zoom controls stay in the existing `header` div above body. Only the time-axis moves into the scroll container. This is the smallest change that gets correct horizontal scroll + sticky axis.

### 1b. Auto-scroll the selected event into view on external selection

Add to the closure of `createWaterfall`:

```ts
let selfTriggered = false;
```

In `body.addEventListener('click', ...)` (`Waterfall.ts:71-80`): set `selfTriggered = true` immediately before mutating `store.selectedId.value`.

In the redraw `effect(...)` at `Waterfall.ts:109-117`, after the `drawBody(...)` call, add a step that scrolls only when `!selfTriggered && store.selectedId.value`:

```ts
const selectedId = store.selectedId.value;
if (selectedId && !selfTriggered) {
  const i = list.findIndex((e) => e.id === selectedId);
  if (i >= 0) {
    const e = list[i]!;
    const rowTop = i * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const visibleTop = body.scrollTop;
    const visibleBottom = visibleTop + body.clientHeight;
    if (rowTop < visibleTop || rowBottom > visibleBottom) {
      body.scrollTop = Math.max(0, rowTop - body.clientHeight / 2 + ROW_HEIGHT / 2);
    }

    // Horizontal: only meaningful when zoomed (canvas wider than viewport).
    const trackW = w_total - GUTTER_W - DUR_W - 8; // recompute from current zoom
    const msPerPx = (end - start) / Math.max(1, trackW);
    const xStart = GUTTER_W + (e.timestamp - start) / msPerPx;
    const barW = isHttpEvent(e) ? Math.max(1, (e.durationMs ?? 0) / msPerPx) : 2;
    const visibleLeft = body.scrollLeft;
    const visibleRight = visibleLeft + body.clientWidth;
    if (xStart < visibleLeft || xStart + barW > visibleRight) {
      body.scrollLeft = Math.max(0, xStart - body.clientWidth / 2 + barW / 2);
    }
  }
}
selfTriggered = false;
```

(`w_total`, `start`, `end` derived the same way as `drawBody` — extract a small helper or inline.) Reset `selfTriggered = false` at the end of the effect so the next external change re-enables the behavior.

`store.selectionSource` ('mouse' | 'keyboard') can't be used to gate this because EventList also sets it to `'mouse'` (`EventList.ts:35`). The `selfTriggered` flag set inside the body click handler is the only reliable in-component signal.

---

## Bug 2 — Timestamp visible in list view

**File:** `argus-webui/src/components/EventList/Row.ts`

The `meta` span at lines 71-74, 97-100, 122-125 is `w-14 text-right` — 56 px is far too narrow for `HH:MM:SS.ms` rendered in JetBrains Mono at `text-xs`. With `text-right`, the right edge stays anchored, but the whole right edge of the row also lives under the `overflow-y-auto` scrollbar.

Fixes (both files):

- `Row.ts`: change all three `meta.className` strings from `... w-14 text-right` to `... w-24 text-right tabular-nums` (96 px — fits 12 chars of mono comfortably; HTTP `1234 ms` still right-aligns fine).
- `argus-webui/src/components/EventList/virtual.ts:32`: add `scrollbar-gutter: stable;` to viewport so the scrollbar reserves space and never overlaps the timestamp. Either inline (`viewport.style.scrollbarGutter = 'stable'`) or add to the className via a Tailwind arbitrary variant.

No other layout changes needed — `flex-1` on the message column will absorb the extra width for `meta`.

---

## Bug 3 — Correlation-id toggle actually shows/hides column

**Files:**
- `argus-webui/src/components/EventList/virtual.ts`
- `argus-webui/src/components/EventList/EventList.ts`

Root cause: `virtual.ts:53-67` reuses pooled rows whenever `keyFor(item)` matches, so toggling `showCorrelationId` never rebuilds existing rows. The new column visibility only takes effect for rows that scroll into view fresh.

### Change 1: add `invalidateAll()` to the virtual list API

`virtual.ts`:

- Add to `VirtualList<T>` interface (`virtual.ts:14-23`):
  ```ts
  /** Drop all pooled row elements; next render rebuilds them from scratch. */
  invalidateAll(): void;
  ```
- Implement in the returned object (alongside `setItems` at `virtual.ts:90-93`):
  ```ts
  invalidateAll() {
    for (const el of pool.values()) el.remove();
    pool.clear();
  },
  ```

### Change 2: call it from EventList's column-visibility effect

`EventList.ts:83-89` — the existing effect that watches `showCorrelationId` should drop pooled rows before re-rendering:

```ts
effect(() => {
  void store.selectedId.value;
  void store.selectionSource.value;
  void store.filters.value.textQuery;
  const _showCorr = store.showCorrelationId.value;
  list.invalidateAll(); // structure may have changed
  list.setItems(store.filteredEvents.peek());
});
```

(Or split: only `invalidateAll()` when `showCorrelationId` changes — cheaper, but a single combined effect is fine since selection/textQuery changes already force re-paint via row recreation; the small extra cost is acceptable for the size of this list.)

> Alternative considered: include `showCorrelationId` in `keyFor`. Rejected because it conflates row identity with rendering state — `invalidateAll()` is more honest and reusable for future structure-changing toggles (density, columns).

---

## Critical files

- `argus-webui/src/components/Waterfall/Waterfall.ts` — bug 1
- `argus-webui/src/components/EventList/Row.ts` — bug 2
- `argus-webui/src/components/EventList/virtual.ts` — bugs 2 & 3
- `argus-webui/src/components/EventList/EventList.ts` — bug 3

## Verification

Run dev server: `cd argus-webui && npm run dev` (or whatever script the README documents — check `package.json`). Drive sample-android (already in repo) to emit events, or use the seeded data path if there's one.

- **Bug 1**:
  - List view → click an event far down the list → switch to waterfall → verify selected row is vertically centered.
  - Waterfall view + zoom in (>1×) → click an event in the EventList that falls outside the visible time window → verify the bar scrolls into horizontal center.
  - Inside waterfall, click on a bar that's already visible → verify no scroll jump.
  - Use j/k keyboard nav (if wired) → verify waterfall follows.
- **Bug 2**: Filter to LOG events in list view → verify the trailing `.ms` is fully visible at the right edge, no scrollbar overlap.
- **Bug 3**: Toggle the link/correlation icon in TopBar → verify the column appears/disappears immediately for all visible rows (not only newly-scrolled-in ones). Refresh the page → verify the persisted state still applies.

Type-check: `npm run typecheck` (or `tsc --noEmit`) in `argus-webui`. No tests exist for these components today; not adding any since each fix is small and visually verifiable.
