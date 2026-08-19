# Fix #3 — selected event row is not visibly highlighted

## Context

GitHub issue #3 (`bug`): after selecting a row in the event list, the highlight never appears, so the user loses track of which event the detail pane is showing.

The issue lists five suspects. Four are ruled out by reading the code; the root cause is the fifth (row pooling):

- **Root cause — pooled rows are never re-rendered.** `virtual.ts:99-109` calls `opts.renderRow` **only on a pool miss**; a pool hit reuses the element and rewrites just its `transform`. Rows are keyed by `event.id` (`EventList.ts:39`), which does not change when selection changes. `Row.ts:130-135` computes `selected` once, at construction. So the effect at `EventList.ts:97-102` — commented "Re-render all rows when selection or textQuery changes" — calls `setItems`, gets all pool hits, and changes nothing. The highlight appears only if the row happens to be evicted and rebuilt (scrolled out and back, or a correlation-id toggle). The identical bug was already fixed once for column visibility two effects down (`EventList.ts:105-110` calls `invalidateAll()` first); the selection effect was missed.
- **Secondary — hover beats selected.** `hover:bg-bg-hover` compiles to `.hover\:bg-bg-hover:hover` (0,2,0) versus `.bg-bg-selected` (0,1,0), and `Row.ts:131` pushes the hover class onto every row including the selected one. After a click the pointer is by definition still on that row, so even a correctly-classed row shows `--bg-hover` instead of the selection tint. The design handoff already says hover applies to **non-selected** rows only (`design_handoff_argus_inspector/README.md:56`).
- **Tokens are fine.** `--bg-selected` / `--bg-selected-kb` in `globals.css:149-150, 259-260, 369-370` match `design_handoff_argus_inspector/ds/colors_and_type.css` verbatim. Not changing them.
- **Append flash is not involved.** `.ds-row-flash` (`globals.css:586-593`) is defined but never applied anywhere in `src/` — dead code. Out of scope.
- **Same bug hits `textQuery`.** Pooled rows also keep stale `<mark>` highlight spans, for the same reason and in the same effect.

Outcome: the selected row is unambiguously marked the moment it is selected — background tint plus a left accent rail — stays marked while events append, filters change, and the pointer hovers it or other rows; keyboard selection also scrolls itself into view.

**Decisions taken during shaping:**
- Rail on **both** mouse and keyboard selection, thicker for keyboard (2 px mouse / 3 px keyboard). This deviates from the handoff (`README.md:147-150` says mouse gets no rail), so the handoff is updated in the same change.
- Fix the `textQuery` staleness in the same pass (same effect, same cause).
- Add scroll-into-view for keyboard selection.
- **No new devDependency and no DOM unit test.** argus-webui's vitest runs in the default `node` environment with no jsdom; verification is by hand in the browser against the mock source. Existing store/input tests must still pass.
- Version bump deliberately excluded — it happens later, once fixes accumulate.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`:

- `plan.md` — copy of this plan
- `shape.md` — scope, the five suspects and which were ruled out, the four decisions above
- `references.md` — the files touched plus `agent-os/specs/2026-04-30-1136-webui-small-bugs/` (prior art: same pooling bug, fixed for the correlation-id toggle)

No `standards.md` — `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it governs the webui DOM layer. Only `workflow/commit-conventions` applies, and it applies to every commit.

## Task 2 — Make row selection classes patchable (`argus-webui/src/components/EventList/Row.ts`)

Today the class list is built once and assigned with `row.className = classes.join(' ')` (`Row.ts:135`), so there is no way to update a live row. Centralise the selection classes in one exported function and call it from both `createEventRow` and the new effect.

- Replace the constants at `Row.ts:26-28` with:
  - `ROW_CLASS_HOVER = 'hover:bg-bg-hover'` — kept, but applied **only to non-selected rows**.
  - `ROW_CLASS_SELECTED = 'bg-bg-selected ds-row-rail'` — mouse selection now gets the rail.
  - `ROW_CLASS_SELECTED_KB = 'bg-bg-selected-kb ds-row-rail-kb'` — keyboard keeps the stronger tint and gets the thicker rail.
- Add and export:

```ts
export function applyRowSelection(
  row: HTMLElement,
  selected: boolean,
  source: 'keyboard' | 'mouse',
): void {
  row.classList.toggle('hover:bg-bg-hover', !selected);
  const kb = selected && source === 'keyboard';
  row.classList.toggle('bg-bg-selected', selected && !kb);
  row.classList.toggle('ds-row-rail', selected && !kb);
  row.classList.toggle('bg-bg-selected-kb', kb);
  row.classList.toggle('ds-row-rail-kb', kb);
}
```

  Toggling every class in both directions is what makes it safe on a pooled row that carries stale state.
- In `createEventRow`, set `row.className = ROW_CLASS_BASE` and then call `applyRowSelection(row, ctx.selectedId === event.id, ctx.selectionSource)` in place of the current `Row.ts:130-135` block. One code path builds and updates the classes.

Keep the class-name strings as literals inside `Row.ts` so Tailwind's content scanner (`tailwind.config.ts:31`) still emits the utilities — no safelist exists.

## Task 3 — Add the keyboard rail variant (`argus-webui/src/styles/globals.css`)

Next to `.ds-row-rail` (`globals.css:541-544`), which stays at 2 px:

```css
/* Keyboard-selected row rail — thicker than the mouse rail so the two selection
   modes read differently at a glance. */
.ds-row-rail-kb {
  box-shadow: inset 3px 0 0 0 var(--border-focus);
}
```

Use the `--border-focus` token, not a raw colour — `npm run lint` runs a custom token lint that rejects raw hex/px colour values.

## Task 4 — Patch live rows on selection change (`argus-webui/src/components/EventList/EventList.ts`)

Split the broken effect at `EventList.ts:96-102` into two, because the two triggers need different treatment:

- **Selection** — no `setItems` at all. Iterate the live rows and patch their classes. `list.innerContent` is already part of the `VirtualList` interface (`virtual.ts:25`), and every row carries `data-event-id` (`Row.ts:32`):

```ts
// Selection is a class-only change: patch the live rows instead of rebuilding
// them. `setItems` would be a no-op anyway — virtual.ts reuses pooled rows and
// never re-invokes renderRow for a key it already has.
effect(() => {
  const id = store.selectedId.value;
  const source = store.selectionSource.value;
  for (const el of Array.from(list.innerContent.children) as HTMLElement[]) {
    applyRowSelection(el, el.dataset['eventId'] === id && id != null, source);
  }
});
```

  This also drops a side effect nobody wanted: the old `setItems` call armed `virtual.ts`'s `expectedScrollTop` scroll lock on every j/k keypress (`virtual.ts:157-172`).

- **Text query** — genuinely rebuilds row content (the `<mark>` spans in `renderHighlighted`), so it needs the pool dropped, exactly like the `showCorrelationId` effect below it:

```ts
// Highlight spans are baked into the row's DOM — drop pooled rows so
// renderHighlighted runs again with the new query.
effect(() => {
  void store.filters.value.textQuery;
  list.invalidateAll();
  list.setItems(store.filteredEvents.peek());
});
```

Rows built later by a scroll-driven `render()` are unaffected: `renderRow` reads `store.selectedId.value` fresh (`EventList.ts:30-31`), so a newly-pooled row is born with the right classes.

`createSplitView` mounts two independent `createEventList` instances (`SplitView.ts:25,32`), each with its own pool; both are fixed by this change with no extra work.

## Task 5 — Scroll the selected row into view on keyboard selection

`scrollToIndex` (`virtual.ts:175-180`) top-aligns unconditionally, which would jerk the list on every j/k press. Add a neighbour that only moves when the row is outside the viewport:

- In `virtual.ts`, add to the interface and implementation:

```ts
/** Scroll only if the row at `index` is outside the viewport; otherwise no-op. */
scrollIndexIntoView(index: number): void;
```

  Implementation: compute `top = index * opts.rowHeight`; if `top < viewport.scrollTop` set `scrollTop = top`; else if `top + rowHeight > scrollTop + viewport.clientHeight` set `scrollTop = top + rowHeight - viewport.clientHeight`; else return early. On a move, mirror `lastSetScrollTop` and call `render()`, matching `scrollToIndex`.
- In `EventList.ts`, extend the selection effect from Task 4: after patching classes, when `source === 'keyboard'` and `id != null`, find the index in `store.filteredEvents.peek()` and call `list.scrollIndexIntoView(idx)`. Gate on `'keyboard'` so a click on a partly-visible row does not yank the list.

## Task 6 — Record the handoff deviation (`design_handoff_argus_inspector/`)

The handoff is the design source of truth, and it currently states the opposite of what we are shipping. Update it so the two do not silently disagree:

- `README.md:55-56` and `README.md:147-150` — mouse selection now gets a 2 px `border-focus` rail; keyboard gets 3 px plus the `bg-selected-kb` tint. Keep the "this distinction is intentional" note, restated for thickness rather than presence.
- `README.md:56` — reaffirm that hover applies to non-selected rows only (already correct; the implementation was the part that drifted).
- `argus/EventList.jsx:17-23` — the reference snippet's `boxShadow` line, so the reference and the implementation match.

Do not touch `ds/colors_and_type.css` — no token values change.

---

## Verification

Manual, in the browser — this is the agreed path (no jsdom, no new devDependency).

```bash
cd argus-webui
npm ci
npm run lint      # tsc --noEmit + the token lint (catches a raw hex in the new CSS rule)
npm test          # existing store/input vitest suites must stay green
npm run dev       # then open http://localhost:5173/?simulate=off  → mock event stream
```

`?simulate=off` forces `createMockSource` (`app.ts:22-38`) so the fixture stream replays without a device.

Check, in both light and dark (theme toggle in the TopBar):

1. **Click a row** → tint appears immediately, 2 px rail on the left. Move the pointer onto it → tint stays (the hover class is gone from the selected row). Move onto a neighbour → neighbour hovers, selection stays marked.
2. **j / k** → tint switches to the stronger `bg-selected-kb` with the 3 px rail, follows the selection on every press, and the list scrolls when the selection reaches either edge. Hold j to walk past the viewport bottom — the row stays visible.
3. **Scroll the selected row out of view and back** → it comes back still marked (rebuilt-row path).
4. **Let new events append** while a row is selected, at the head and scrolled away → selection stays put and stays marked.
5. **Change a filter / type in the search box** → selection survives if the event is still in the filtered set, and search hits are highlighted on rows that were already on screen (the `textQuery` fix).
6. **Toggle the correlation-id column** with a row selected → column changes, selection still marked.
7. **Esc** → selection clears; no row is left with a stale tint or rail.
8. Re-check 1–2 in the narrow layout (shrink the window until `SplitView` swaps to `narrowList`).

A screenshot of the selected row in each theme, attached to issue #3, is the closing evidence.
