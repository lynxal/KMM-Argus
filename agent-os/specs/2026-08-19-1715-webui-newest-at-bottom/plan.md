# Flip the event list to newest-at-bottom

Fixes [lynxal/KMM-Argus#4](https://github.com/lynxal/KMM-Argus/issues/4).

## Context

`eventStore.ingest` prepends every new event (`argus-webui/src/store/eventStore.ts:101,105`), so the newest event sits at index 0 and each arrival shifts every existing row down. That forces the virtual list to fight for a stable reading position: commit `559ab2b` added ~94 lines of viewport-anchor machinery to `virtual.ts` purely to survive prepending — `ScrollAnchor`, `peekAnchor()`, `expectedScrollTop`/`lastSetScrollTop`, a scroll-handler stomp-swallow, and an rAF + 250 ms `setTimeout` re-pin lock — all because Chromium resets `scrollTop` to 0 when content grows *above* the viewport.

Appending removes the cause instead of compensating for it. Existing rows keep their pixel offsets, so `scrollTop` only needs touching when we actually want to follow the tail. The wire is already oldest-first — the server sends `takeLast(limit)` over an oldest-first deque and `websocketSource.backfill()` re-emits in that order (`argus-webui/src/transport/websocketSource.ts:26,86`) — so appending removes an inversion from the pipeline rather than adding one.

Outcome: newest event at the bottom, the list holds still while the user reads history, and the anchor machinery is deleted rather than inverted.

### Decisions (confirmed)

- **Hard flip, no direction setting.** The design handoff specs a toggle defaulting to newest-first; #4 supersedes it. A toggle would keep both code paths and the anchor machinery alive.
- **Waterfall gets follow-tail.** It renders `filteredEvents` positionally, so newest moves to its bottom for free — but it opens at `scrollTop = 0`, which would then show the *oldest* events.
- **j/k with nothing selected lands on the top row (oldest).** This is what the current index math already does, so `keyboard.ts` needs no behavioral change.
- **Update `design_handoff_argus_inspector/README.md`** so the design doc and code agree.

### Scope corrections to the issue

The issue names a few things that don't exist or are already done:

- The pill is **already** bottom-center (`EventList.ts:60-61`: `absolute bottom-2 left-1/2 -translate-x-1/2`). Only the `↑` glyph changes.
- There are **no** Home/End or `g` bindings and **no** `selectNewest` action in `BINDINGS` (`keyboard.ts:36-53`). The only ordering-sensitive keyboard code is the `selectNext`/`selectPrev` index math.
- `hiddenCount` is at `EventList.ts:80-94`, not 88-92; the pill is at 58-66 + 112-117, not 113-117.
- `docs/ui/*.png` are captures of the **design prototype**, not the app (`scripts/capture-ui.mjs:3,20`), so they don't go stale. No screenshot regeneration.

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1745-webui-newest-at-bottom/` following the `2026-08-19-1634-webui-connecting-state` precedent:

- `shape.md` — scope, the four decisions above with their reasoning, the scope corrections.
- `plan.md` — this plan.
- `standards.md` — only `naming/code-documentation` and `workflow/commit-conventions` apply; `agent-os/standards/index.yml` is entirely Kotlin/KMP/Compose with no TypeScript or web entry. Record that explicitly so the next reader doesn't re-derive it.
- `references.md` — `design_handoff_argus_inspector/argus/EventList.jsx:26-31,106` (pill structure the implementation should match), commit `559ab2b` (what's being deleted and why), `ConnectionBanner.states.ts` (the pure-function + test convention this change follows).
- No `visuals/` — no mockups provided.

## Task 2 — Append in the store

`argus-webui/src/store/eventStore.ts` — append, and move the `maxEvents` eviction from the tail to the front. `slice(len - maxEvents + 1)` keeps the cap exact when `len === maxEvents`.

```ts
function ingest(event: ArgusEvent): void {
  if (paused.value) {
    const buf = pausedBuffer.value;
    pausedBuffer.value =
      buf.length >= maxEvents ? [...buf.slice(buf.length - maxEvents + 1), event] : [...buf, event];
    return;
  }
  const next = events.value;
  events.value =
    next.length >= maxEvents ? [...next.slice(next.length - maxEvents + 1), event] : [...next, event];
}
```

`resume()` (`eventStore.ts:112-121`) — buffered events are newer, so they go *after*, and the trim drops from the front:

```ts
const merged = [...events.value, ...buf];
events.value = merged.length > maxEvents ? merged.slice(merged.length - maxEvents) : merged;
```

`filteredEvents` needs no change — `applyFilters` (`store/filters.ts:95-135`) is a forward loop and order-preserving.

## Task 3 — Delete the anchor machinery from `virtual.ts`

`argus-webui/src/components/EventList/virtual.ts`. **Remove:** the `ScrollAnchor` interface, `setItems`' `options` parameter, `peekAnchor()`, `expectedScrollTop`, `lastSetScrollTop`, the stomp-swallow branch in the scroll handler (`:125-129`), and the rAF + `setTimeout(releaseLock, 250)` lock (`:160-172`). Nothing outside this file imports `ScrollAnchor`, and `EventList.ts` is the only consumer of the whole API.

**Replace `isAtHead` with `isAtTail`** and add `scrollToEnd()`:

```ts
function distanceFromTail(): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}
```
`isAtTail(threshold = 4)` returns `distanceFromTail() <= threshold`. Keep `scrollToIndex` as-is.

**Follow-tail lives here**, as the one piece of scroll compensation that survives. Appending grows content *below* the viewport, so a plain container drifts away from the bottom — one `scrollTop = scrollHeight` when already pinned replaces all of `559ab2b`:

```ts
let pinned = true;
function pinIfNeeded(): void {
  if (pinned) viewport.scrollTop = viewport.scrollHeight;
}
```
- scroll handler: `pinned = distanceFromTail() <= 4;` then `render()` and notify listeners — no early return any more.
- `setItems(next)`: set `items`, set `innerContent.style.height`, `pinIfNeeded()`, `render()`.
- the `ResizeObserver`: `pinIfNeeded(); render();` — this is what keeps the first paint pinned, since `clientHeight` is 0 until layout runs.
- `scrollToEnd()`: `pinned = true; viewport.scrollTop = viewport.scrollHeight; render();`

Also set `innerContent.style.overflowAnchor = 'none'`. The virtualizer recycles absolutely-positioned rows during `render()`; browser scroll anchoring could latch onto one that then gets pooled away. One line, prevents a class of jitter the old lock used to mask.

Rewrite the now-false comments at `:1-5`, `:26-33`, `:35`, `:63-74` — `naming/code-documentation` forbids stale comments, and these describe the prepend model explicitly.

## Task 4 — Flip `EventList.ts`

`argus-webui/src/components/EventList/EventList.ts`:

- Rename `atHead` → `following`, `hiddenCount` → `unseen`, `lastHeadId` → `lastSeenTailId`. Rewrite the auto-scroll comment at `:43-47`.
- `list.onScroll(() => { following.value = list.isAtTail(); })`.
- Items effect (`:71-75`) collapses to `list.setItems(store.filteredEvents.value)` — no anchor peek, since `virtual.ts` now owns pinning.
- Unseen-count effect (`:80-94`): the marker becomes the **last** element and the count becomes the number of items *after* it.
- Pill click (`:62-65`): `list.scrollToEnd()` instead of `list.scrollToIndex(0)`.
- Pill contents: build the icon and label **once**, then only update the label text. `pill.textContent = …` would wipe the SVG on every count change, and the existing `flex items-center gap-2` classes were already designed for an icon + text pair:

```ts
const pillIcon = createIconEl('arrowDown', 12);
const pillLabel = document.createElement('span');
pill.append(pillIcon, pillLabel);
```
via `createIconEl` from `../Primitives/Primitives` (`Primitives.ts:24`) — the same call shape as `TopBar.ts:137`. Label copy stays `Jump to latest · N new` / `Jump to latest`; #4 only asked for the arrow.

Extract the count arithmetic into a new `EventList.states.ts` so it's testable under the node-environment Vitest setup, matching the `ConnectionBanner.states.ts` convention:

```ts
/** How many events arrived after the newest one the user has actually seen. */
export function unseenCount(events: readonly { id: string }[], lastSeenId: string | null): number {
  if (lastSeenId == null) return events.length;
  const idx = events.findIndex((e) => e.id === lastSeenId);
  return idx === -1 ? events.length : events.length - 1 - idx;
}
```

`SplitView.ts:25,32` builds **two** `createEventList` instances (`list` and `narrowList`) — both inherit this automatically, but check both in the manual pass.

## Task 5 — Follow-tail for the Waterfall

`argus-webui/src/components/Waterfall/Waterfall.ts` redraw effect (`:141-158`). Measure **before** `drawBody` changes the content height, and pin **before** the existing scroll-to-selected block so an actual selection change still wins:

```ts
const wasAtTail = body.scrollHeight - body.scrollTop - body.clientHeight <= 4;
drawHeader(axisCanvas, body, list, z);
drawBody(canvas, body, list, z, selectedId);
if (wasAtTail) body.scrollTop = body.scrollHeight;
// ...existing `if (selectedId && selectedId !== lastScrolledId && !selfTriggered)` block
```

No index math changes — click (`:101-112`), hover (`:114-128`) and draw (`:305-348`) are all positional `index * ROW_HEIGHT`, and `rangeMs()` (`:228-238`) is a full min/max scan. Update the stale ordering comment at `:19-24`.

Free improvement worth noting in the PR: bars currently step *leftward* going down (newest first against a left-to-right time axis). Oldest-first makes them cascade rightward — the conventional waterfall diagonal.

## Task 6 — Verify keyboard nav, add the missing coverage

`argus-webui/src/input/keyboard.ts:96-110` needs **no behavioral change**: `selectNext` is `idx + 1` (down, now toward newer), `selectPrev` is `idx - 1` (up, toward older), and with nothing selected both resolve to index 0 — the top row, which is the chosen default. `BINDINGS` descriptions ("Next event" / "Previous event") are positional and stay accurate, so `ShortcutsModal` needs nothing.

There is currently **zero** coverage of this arithmetic (`keyboard.test.ts` tests only `buildCurl`), and it's the one place the flip could silently invert. Extract and export the pure helper so it can be pinned by a test:

```ts
export function nextSelectionIndex(idx: number, len: number, action: 'selectNext' | 'selectPrev'): number {
  if (idx < 0) return 0;
  return action === 'selectNext' ? Math.min(len - 1, idx + 1) : Math.max(0, idx - 1);
}
```

## Task 7 — Tests

`argus-webui/src/store/__tests__/eventStore.test.ts` — three assertions invert, plus one new case:

- `:47-50` cap test → `[0]` is `'e5'`, `[4]` is `'e9'`; comment becomes `// oldest-first`. This is the assertion that proves the trim drops the oldest.
- `:64` resume → `['e1', 'e2', 'e3']`.
- `:74` undo → `['e1', 'e2']`.
- **New:** the paused buffer also caps and drops from the front — `eventStore.ts:101` is a separate code path from `:105` and currently has no cap coverage.

**New** `argus-webui/src/components/EventList/__tests__/EventList.states.test.ts` for `unseenCount`: `null` marker → `events.length`; marker is the last element → `0`; marker at index 2 of 5 → `2`; marker trimmed out of the buffer → `events.length`.

**New** case in `argus-webui/src/input/__tests__/keyboard.test.ts` for `nextSelectionIndex`: no selection → `0`; clamps at both ends; single-element list.

`virtual.ts` and the DOM wiring stay untested — Vitest runs on defaults with **no jsdom** (no `vitest.config.ts`, no `test` block in `vite.config.ts`, no jsdom dependency), which is why the arithmetic is extracted into pure helpers instead.

## Task 8 — Docs

- `design_handoff_argus_inspector/README.md:154` — replace the setting-based wording with newest-at-bottom, no setting, and note it supersedes the original design.
- `design_handoff_argus_inspector/README.md:155` — "scrolled away from the head" → away from the tail/bottom.

Leave alone: root `README.md:635,651` make no ordering claim (`:651` is separately stale about `1`/`2`/`3` view keys — pre-existing, not this change's business), `README.md:668` is about persistence pruning, and the historical `agent-os/specs/2026-04-23-2345-argus-webui/plan.md:44` inaccuracy stays as-is.

## Verification

From `argus-webui/`:

1. `npm test` — 5 existing files plus 2 new. The inverted `eventStore` assertions are the primary proof of the flip.
2. `npm run lint` — `lint-tokens.ts` + `tsc --noEmit`. `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters`, so it catches any anchor leftovers the deletion missed.
3. `npm run build` — full typecheck + Vite bundle.

Manual pass — `npm run dev`, then open **`http://localhost:5173/?simulate=off`**. The `simulate` param is required: on `localhost` the app otherwise resolves same-origin and tries a real WebSocket (`app.ts:26-38`). Mock streams at `speed: 4`, so follow-tail is directly observable. Check:

- Newest event at the bottom; the view stays pinned as events stream in.
- Scroll up mid-history: rows **do not move** while new events arrive. This is the regression `559ab2b` existed to prevent — confirm it's now structural.
- The pill appears only when scrolled off the bottom, points **down**, and its count matches the events that arrived while scrolled away. Clicking it returns to the tail and hides the pill.
- Resize the window while pinned — stays pinned (the `ResizeObserver` path).
- Press `w` for Waterfall and Split: newest at the bottom, opens pinned to the bottom, bars cascade rightward going down. Check the narrow list in Split too.
- `j`/`k` and arrows walk the visible list in the direction their names imply; first keypress with nothing selected lands on the top row.
- `p` to pause, let events buffer, then resume — order is continuous with newest last.
- `Shift+X` then `⌘Z` — undo restores in the same order.

Verify in Chrome specifically: the deleted lock existed for a Chromium-only `scrollTop` stomp. Appending shouldn't trigger it (growth is below the viewport, not above), but that's the one claim in this change that only a real browser can settle.

---

# Deviations from the approved plan

The plan above is the version approved before implementation. Three things changed while executing it; `shape.md` carries the full reasoning.

1. **The branch was built on a stale base.** `origin/main` had already merged PR #10 plus three commits rewriting `eventStore.ts`, `virtual.ts` and `Row.ts` (id dedup with in-place replace, identity-keyed row pooling, `scrollIndexIntoView`, `applyRowSelection`). The first pass discarded all of it. The work was reverted, the branch fast-forwarded to `origin/main`, and the flip re-applied on top. Consequences for the plan: `forget()` in the store now evicts from the front, `virtual.ts` keeps `scrollIndexIntoView` and the `{el, item}` pool, and the store test file gained 6 inherited dedup tests whose ordering assertions also had to flip.

2. **Task 3 could not delete all the compensation.** The plan asserted that appending is immune to the Chromium `scrollTop` reset because content grows below the viewport. Measured in Chromium, it is not: after the pin wrote `scrollTop = 39` the browser reverted it to `0` a frame later and fired a scroll event for it, which read as "user scrolled to top" and killed the pin for the rest of the session. `overflow-anchor: none` on the inner content and on the scroll container both failed to stop it, ruling out CSS scroll anchoring. A minimal guard stayed: one `pinLocked` boolean with an rAF release and a 250 ms fallback, defending a single target (the bottom) instead of an arbitrary anchor. The anchor snapshot machinery — `ScrollAnchor`, `peekAnchor()`, `lastSetScrollTop`, `expectedScrollTop` — is still gone.

3. **The follow threshold is one row, not 4 px.** Requested during implementation and it is the more correct rule: auto-scroll follows while the newest row is *visible*, and the pill appears exactly when it is not. `isAtTail(thresholdPx)` became `isNewestRowVisible()`, tested against `opts.rowHeight`; the Waterfall uses its own `ROW_HEIGHT` the same way.

Task 8 needed less work than planned: `55f3604` on main had already corrected the `websocketSource.ts` reconnect comment, so only the two `design_handoff_argus_inspector/README.md` lines changed.
