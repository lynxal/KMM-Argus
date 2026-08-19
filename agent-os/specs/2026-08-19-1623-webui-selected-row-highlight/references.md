# References — selected event row highlight

## Prior art in this repo

### Correlation-id toggle was the same bug

- **Location:** `agent-os/specs/2026-04-30-1136-webui-small-bugs/` (bug 3), implemented at
  `argus-webui/src/components/EventList/EventList.ts:105-110`
- **Relevance:** identical root cause — `virtual.ts` pools row elements by `event.id`, so a
  `setItems` call after a state change that alters row appearance reuses stale DOM.
- **Key patterns:** `invalidateAll()` was added to the virtual-list API for exactly this. Reused here
  for `textQuery`; the selection path patches classes instead, because it changes no row content.

### Viewport anchor restore

- **Location:** commit `559ab2b`, `argus-webui/src/components/EventList/virtual.ts:63-74, 143-174`
- **Relevance:** `setItems` arms an `expectedScrollTop` scroll lock for a frame. The old selection
  effect called `setItems` on every j/k press and so armed it needlessly; the new effect does not
  call `setItems` at all.
- **Key patterns:** `scrollIndexIntoView` follows `scrollToIndex` (`virtual.ts:175-180`) in mirroring
  `lastSetScrollTop` and calling `render()` after moving `scrollTop`.

## Design source of truth

### Row selected state

- **Location:** `design_handoff_argus_inspector/README.md:55-56, 147-150, 262`;
  `design_handoff_argus_inspector/argus/EventList.jsx:17-23`
- **Relevance:** defines the keyboard/mouse selection distinction and states that hover applies to
  non-selected rows only.
- **Key patterns:** tokens `--bg-selected`, `--bg-selected-kb`, `--border-focus`. Updated in this
  change to record the rail-on-both deviation.

## Upstream defect found while verifying

### Redirect hops share one event id

- **Location:** `argus-core/src/commonMain/kotlin/com/lynxal/argus/ktor/ArgusClientPlugin.kt:61-64`
  (`onRequest` mints the id) and `:107-190` (the receive interceptor emits per hop)
- **Relevance:** produced the duplicate rows that made the selection highlight look broken even after
  it was fixed. Ktor's `HttpRedirect` resend goes through `Send`, not the request pipeline, and
  `HttpRequestBuilder.takeFrom` (ktor-client-core `HttpRequest.kt:184-193`) copies attribute entries
  into a new `Attributes`, so the id travels to the next hop while the `ArgusEmittedKey` guard does
  not stop it.
- **Key patterns:** per-hop identity should come from the call being emitted — `call.request.url` for
  the hop's own url, and `response.requestTime` / `responseTime` for its own timing.

## Files touched

- `argus-webui/src/components/EventList/Row.ts` — class constants, exported `applyRowSelection`
- `argus-webui/src/components/EventList/EventList.ts` — split the selection/textQuery effect
- `argus-webui/src/components/EventList/virtual.ts` — `scrollIndexIntoView`, item-identity row pool
- `argus-webui/src/store/eventStore.ts` — id-based collapse (replace in place) in `ingest`
- `argus-webui/src/store/__tests__/eventStore.test.ts` — collapse + redirect-pair coverage
- `argus-webui/src/styles/globals.css` — `.ds-row-rail-kb`
- `design_handoff_argus_inspector/README.md`, `design_handoff_argus_inspector/argus/EventList.jsx`
