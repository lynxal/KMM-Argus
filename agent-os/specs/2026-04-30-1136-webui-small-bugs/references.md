# References for Webui small bugs

## Files touched

### Waterfall.ts
- **Location:** `argus-webui/src/components/Waterfall/Waterfall.ts`
- **Relevance:** Bug 1 — canvas sizing, `drawHeader` / `drawBody`, redraw effect, click handler.
- **Key existing patterns:**
  - `effect(() => { ... drawHeader(...); drawBody(...); ... })` — single redraw effect keyed off `events.value`, `selectedId.value`, `zoom.value`.
  - Canvas sized once per draw inside `drawBody` from `viewport.clientWidth`.

### EventList Row.ts
- **Location:** `argus-webui/src/components/EventList/Row.ts`
- **Relevance:** Bug 2 — `meta` span (timestamp/duration column) class strings at lines 71-74, 97-100, 122-125.
- **Key existing patterns:** Row is a flex container of fixed-width spans; tail meta is `w-14 text-right`.

### EventList virtual.ts
- **Location:** `argus-webui/src/components/EventList/virtual.ts`
- **Relevance:** Bugs 2 & 3 — viewport overflow class (bug 2 scrollbar gutter), row pool reuse (bug 3 root cause).
- **Key existing patterns:**
  - `pool: Map<string, HTMLElement>` keyed by `keyFor(item)`.
  - `setItems()` calls `render()` which reuses pooled rows; only ResizeObserver and scroll trigger re-render.

### EventList EventList.ts
- **Location:** `argus-webui/src/components/EventList/EventList.ts`
- **Relevance:** Bug 3 — column-visibility effect at lines 83-89 already runs but is ineffective without pool invalidation.
- **Key existing patterns:** Two `effect(...)` blocks — one for items, one for "force re-paint" via re-running `setItems` on selection/text/column changes.
