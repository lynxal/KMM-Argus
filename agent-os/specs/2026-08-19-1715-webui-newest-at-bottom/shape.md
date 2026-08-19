# Web UI newest-at-bottom — Shaping Notes

## Scope

Fix [issue #4](https://github.com/lynxal/KMM-Argus/issues/4): `eventStore.ingest` prepends every new event, so the newest event sits at index 0 and each arrival shifts every existing row down. That forced the virtual list to compensate to keep the user's reading position — commit `559ab2b` added ~94 lines of viewport-anchor machinery to `virtual.ts` purely to survive prepending.

Flip the append direction so the newest event is at the **bottom**, and delete the compensation machinery rather than inverting it.

## Decisions

- **Hard flip, no direction setting.** The design handoff specs a toggle defaulting to newest-first; issue #4 supersedes it. A toggle would keep both ingest paths and the whole anchor machinery alive, roughly doubling the surface and the test matrix for a mode nobody asked for.
- **Appending removes an inversion rather than adding one.** The wire is already oldest-first: `argus-server-core` serves `takeLast(limit)` over an oldest-first deque and `websocketSource.backfill()` re-emits in that order. Prepending was reversing it on the way in.
- **Follow-tail is the one piece of scroll compensation that survives, and it lives in `virtual.ts`.** Appending grows content *below* the viewport, so a plain scroll container drifts away from the bottom; `scrollTop = scrollHeight` when already pinned replaces the anchor apparatus. It runs from both `setItems` and the `ResizeObserver` — the latter is what pins the first paint, since `clientHeight` is 0 until layout runs.
- **The Chromium scrollTop stomp is NOT specific to prepending — a guard is still required.** The issue's premise was that appending makes the compensation unnecessary because content grows below the viewport. That is only half true, and the half that is false was caught in a real browser, not in review. Measured in Chromium: after `pinIfNeeded()` wrote `scrollTop = 39`, the browser reverted it to `0` one frame later and fired a scroll event carrying the reverted value; read literally, that event says "the user scrolled to the top", which cleared the pin permanently and left the list frozen mid-history while events streamed in. This is the same behavior `559ab2b`'s commit message documents.

  What appending *does* remove is the expensive half — the anchor snapshot (`ScrollAnchor`, `peekAnchor()`, restoring an arbitrary item plus its sub-row pixel offset, `lastSetScrollTop`). Only one target needs defending now, the bottom, so the guard collapses to a single `pinLocked` boolean: inside the window, re-assert the bottom and swallow the event. rAF releases it normally; a 250 ms `setTimeout` is the safety net for backgrounded tabs where rAF throttles and a stuck lock would fight real scrolling. Net effect on `virtual.ts` is still a simplification (210 → ~180 lines) but not the clean deletion the issue anticipated.

- **`overflow-anchor: none` was tried and dropped.** Set on the inner content and then on the scroll container itself (where the spec says it disables anchoring for that container); neither stopped the revert, which confirms this is not CSS scroll anchoring. Left out rather than kept as unexplained code.

- **"Following" means the newest row is VISIBLE, not that scrollTop is exactly at the bottom.** The threshold is one `rowHeight`, not a 4 px epsilon: the last row occupies the final `rowHeight` px of content, so it is on screen exactly while the gap below the viewport is under one row. A list resting a few px short of the end is still showing live events, so it should keep streaming and keep the pill hidden. The pill's visibility is the exact complement — it appears the moment the newest row leaves the viewport. The Waterfall uses the same rule against its own `ROW_HEIGHT`.
- **Waterfall gets follow-tail too.** It renders `filteredEvents` positionally, so newest moves to its bottom for free — but it opens at `scrollTop = 0`, which would then show the *oldest* events. Today `scrollTop = 0` happens to show the newest, so leaving it alone would be a visible regression.
- **j/k with nothing selected lands on the top row (oldest).** This is what the existing index math already does, so `keyboard.ts` needed no behavioral change — only the extraction of `nextSelectionIndex` so the arithmetic is finally covered by a test.
- **Ordering arithmetic extracted to pure functions.** Vitest runs on defaults with no jsdom, so `virtual.ts` and the DOM wiring are untestable. `unseenCount` moved to `EventList.states.ts`, matching the `ConnectionBanner.states.ts` / `TopBar.states.ts` convention.
- **Built on a stale base; rebased mid-flight.** The branch was cut from `e2987b5`, which predates PR #10 (`443e9fe`) plus three commits that rewrote the very files this change touches: id-based dedup with in-place `replace()` in `eventStore.ingest`, identity-keyed row pooling and `scrollIndexIntoView` in `virtual.ts`, and `applyRowSelection` in `Row.ts`. The first implementation pass silently discarded all of it. Work was reverted, the branch fast-forwarded to `origin/main`, and the flip re-applied on top — so `forget()` now evicts from the front, and the dedup, selection-highlight and keyboard-scroll behavior are preserved. Verified by the 6 inherited dedup tests plus a browser assertion that keyboard selection still paints a row.

- **Diverges from the design handoff, and the handoff was updated to match.** `design_handoff_argus_inspector/README.md:154` said "New events append to the top (newest first) OR bottom (oldest first) based on a setting. Default: newest first." Issue #4 supersedes that; the handoff prose was corrected so the design source of truth and the code agree.

## Scope corrections to the issue

Issue #4 named several things that turned out not to exist or to be already done:

- The pill was **already** bottom-center (`absolute bottom-2 left-1/2 -translate-x-1/2`). Only the `↑` glyph needed to change.
- There are **no** Home/End or `g` bindings and **no** `selectNewest` action in `BINDINGS`. The only ordering-sensitive keyboard code is the `selectNext`/`selectPrev` index math.
- `docs/ui/*.png` are captures of the **design prototype**, not the app (`scripts/capture-ui.mjs`), so they did not go stale and needed no regeneration.

## Context

- **Visuals:** None. `design_handoff_argus_inspector/argus/EventList.jsx:26-31,106` was used as the pill spec — it already specified an `arrowDown` icon and a bottom-center anchor, so the shipped `↑` text glyph was a pre-existing divergence.
- **References:** `argus-webui/src/store/eventStore.ts`, `src/components/EventList/{virtual,EventList}.ts`, `src/components/Waterfall/Waterfall.ts`, `src/input/keyboard.ts`, commit `559ab2b`. See `references.md`.
- **Product alignment:** N/A — UI behavior fix, no roadmap impact. `agent-os/product/roadmap.md` calls for "HTTP and Log events interleaved in a single chronological stream", which this satisfies either direction.

## Verification

Vitest cannot reach any of this — no jsdom — so the DOM behavior was verified in real Chromium via Playwright from the scratchpad, against a throwaway harness (`__harness.html` / `__harness.ts`, deleted after the run) that mounted a real `EventList` and `Waterfall` over a real store in fixed-height boxes and drove `store.ingest` directly. The app's own mock source is a finite ~19-event fixture replay spanning ~725 ms at `speed: 4`, which never overflows a normal viewport and cannot exercise sustained appending, so the harness was necessary rather than convenient.

38 browser assertions passed across four scripts: append order and front-eviction at the cap; pinned on load, across appends, across eviction, and across a viewport resize; row offsets and `scrollTop` provably unchanged while scrolled away; the one-row follow boundary in both directions; pill visibility, `arrowDown` path data, exact unseen count, and jump-to-newest; waterfall follow-tail; and — as a rebase regression guard — that keyboard and mouse selection still highlight rows.

The store flip was also proven load-bearing by reverting `eventStore.ts` to prepend with the new assertions in place: all 4 ordering tests failed, then passed again with the fix restored.

## Standards Applied

Only `naming/code-documentation` and `workflow/commit-conventions`; see `standards.md`.
