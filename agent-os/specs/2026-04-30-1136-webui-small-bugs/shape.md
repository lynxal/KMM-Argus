# Webui small bugs — Shaping Notes

## Scope

Three small UX bugs in `argus-webui`, scoped together because they share two files (`EventList/virtual.ts`, `EventList/Row.ts`) and one nearby surface (`Waterfall/Waterfall.ts`):

1. Selecting an event from outside the waterfall does not scroll it into view.
2. List view's timestamp column clips the trailing `.ms` (too-narrow column + scrollbar overlap).
3. Correlation-id toggle in TopBar mutates the signal but never rebuilds pooled rows in the virtual list, so the column visually never changes.

## Decisions

- **Waterfall scroll axis** — both vertical and horizontal, only when the selection is offscreen, only on **external** selection (not when the user clicked inside the waterfall body itself). External-vs-self detected via a `selfTriggered` flag in the body click handler — `store.selectionSource` ('mouse' | 'keyboard') can't be used because `EventList.onClick` also sets it to `'mouse'`.
- **Horizontal scroll requires canvas widening** — currently canvas is fitted to viewport width and `spanMs` is divided by zoom, so events past the visible window are drawn off-canvas with no recourse. Switch to canvas width = `viewport.clientWidth * zoom` and full-resolution `msPerPx`. Move the time axis into the body as `position: sticky; top: 0` so it scrolls horizontally with the bars and stays pinned vertically.
- **Timestamp column** — widen `w-14` → `w-24` and add `tabular-nums` for monospaced digit alignment. Also set `scrollbar-gutter: stable` on the virtual viewport so the right edge of the row is never under the scrollbar.
- **Correlation toggle** — add `invalidateAll()` to the virtual-list API (clears the row pool) rather than encoding column state into `keyFor`. Cleaner and reusable for future column/density toggles.

## Context

- **Visuals:** None.
- **References:** No close prior art in the codebase — these are spot fixes to existing components.
- **Product alignment:** N/A — small bug fixes, no roadmap implications.

## Standards Applied

None. `agent-os/standards/index.yml` is Android/cloud-flavoured; no entries cover the webui DOM/canvas layer.
