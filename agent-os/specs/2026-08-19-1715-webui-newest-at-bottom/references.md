# References for Web UI newest-at-bottom

## Commit 559ab2b — "viewport anchor restore across EventList setItems"

- **Location:** touched only `argus-webui/src/components/EventList/{EventList.ts,virtual.ts}` (+113/−10).
- **Relevance:** this is the code issue #4 asks to delete. Its message documents the exact browser behavior being worked around: "When new events prepend while the user has scrolled away from the head, Chromium fires a spurious scroll event that resets `scrollTop` to 0 between the synchronous innerContent.height grow and the next paint."
- **Key patterns:** what got removed — `ScrollAnchor` + `peekAnchor()` (snapshot topmost visible key + sub-row offset), `setItems(items, { anchor })`, the `expectedScrollTop` lock with an rAF re-pin and a 250 ms `setTimeout` fallback for backgrounded tabs, and the scroll-handler early-return that swallowed transient stomps so `atHead` never saw the spurious 0.
- **Why deletion is safe rather than inversion:** the whole mechanism compensates for content growing *above* the viewport. Appending grows it below, so existing rows keep their pixel offsets and there is nothing to compensate for.

## Pill spec — design handoff

- **Location:** `design_handoff_argus_inspector/argus/EventList.jsx:26-31` and the `els.jump` style at `:106`.
- **Relevance:** the normative spec for the jump pill, blessed transitively by `agent-os/product/tech-stack.md` (which names `EventList.jsx` as the spec for the TS component).
- **Key patterns:** the mock already used `<Icon name="arrowDown" size={11} />` plus a `<span>`, and already anchored bottom-center (`position:absolute, left:'50%', bottom:14, transform:'translateX(-50%)'`). The shipped implementation's top-pointing `↑` text glyph was therefore a pre-existing divergence, not something the flip introduced. The icon + `<span>` structure is why the implementation builds both children once and updates only the span's text — `textContent` would wipe the SVG.

## Pure-state + test convention

- **Location:** `argus-webui/src/components/Overlays/ConnectionBanner.states.ts` and `__tests__/ConnectionBanner.states.test.ts`; also `TopBar.states.ts`, `FilterBar.states.ts`.
- **Relevance:** the project's established way to make component logic testable. Vitest runs on defaults — no `vitest.config.ts`, no `test` block in `vite.config.ts`, no jsdom dependency — so anything touching the DOM cannot be tested at all.
- **Key patterns:** extract the arithmetic to a pure function in a sibling `*.states.ts`, test that, leave the DOM wiring to the manual pass. `unseenCount` in `EventList.states.ts` follows this exactly.

## Reactive icon swap

- **Location:** `argus-webui/src/components/TopBar/TopBar.ts:137,145`; helper at `src/components/Primitives/Primitives.ts:24-27`.
- **Relevance:** the precedent for changing an icon inside a signals `effect`.
- **Key patterns:** always go through `createIconEl(name, size)` rather than `design/icons.ts` directly — the wrapper adds `flex-none block`, which is what makes an icon safe inside the pill's `flex items-center gap-2`.

## Ordering in the transport, for context

- **Location:** `argus-webui/src/transport/websocketSource.ts:26,86`; server side `argus-server-core/.../routes/Events.kt` (`takeLast(limit)` over an oldest-first deque).
- **Relevance:** proves the wire was already oldest-first, so appending removes a transformation from the pipeline. Also `websocketSource.ts:139-141` documents that the store has no id-based dedup, which is why reconnect deliberately skips backfill — unchanged by this work, but its comment wording referenced prepending.
