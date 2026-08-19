# Selected event row highlight — Shaping Notes

## Scope

GitHub issue #3: selecting a row in the argus-webui event list leaves no visible mark, so the user
loses track of which event the detail pane is showing. Fix the highlight, and the two adjacent
defects that share its root cause or its symptom.

## The five suspects from the issue

| Suspect | Verdict |
| --- | --- |
| Row pooling | **Root cause.** `virtual.ts:99-109` invokes `renderRow` only on a pool miss; rows are keyed by `event.id`, which does not change on selection. `Row.ts` set the selected class once, at construction. The `setItems` call in the selection effect (`EventList.ts:97-102`) was therefore a no-op. |
| Hover class wins | **Real, secondary.** `.hover\:bg-bg-hover:hover` is (0,2,0) vs `.bg-bg-selected` at (0,1,0), and the hover class was applied to every row including the selected one — so the tint vanished under the cursor that had just clicked it. |
| Token contrast | Ruled out. `--bg-selected` / `--bg-selected-kb` match `design_handoff_argus_inspector/ds/colors_and_type.css` verbatim in both themes. Left alone. |
| Append flash | Ruled out. `.ds-row-flash` (`globals.css:586-593`) is dead code — no `classList.add` anywhere in `src/`. |
| Row rail only on keyboard | Working as designed, but the design was changed (see Decisions). |

## Decisions

- **Rail on both selection modes, thicker for keyboard** — 2 px for mouse, 3 px for keyboard, both in
  `--border-focus`. The issue's "Expected" asked for a rail on every selected row; the handoff said
  mouse gets no rail (`README.md:147-150`). Chose the issue, so the handoff is updated in the same
  change rather than left contradicting the code. The keyboard/mouse distinction survives as rail
  thickness plus the stronger `bg-selected-kb` tint.
- **Patch classes, don't rebuild rows** — the selection effect now toggles classes on the live row
  elements via an exported `applyRowSelection`. `invalidateAll()` would also have worked (that is how
  the correlation-id toggle fixed the same bug) but it rebuilds the whole window on every j/k press,
  and it needlessly arms `virtual.ts`'s scroll lock each time.
- **`textQuery` fixed in the same pass** — it sat in the same broken effect with the same cause
  (pooled rows keep stale `<mark>` spans). It genuinely changes row content, so it gets
  `invalidateAll()` in its own effect.
- **Scroll-into-view for keyboard selection** — j/k could walk the selection off-screen, which
  produces the same "where was I" symptom the issue describes. Only moves when the row is outside
  the viewport, and only for keyboard selection, so a click never yanks the list.
- **Duplicate event ids are real, and they surfaced once the highlight worked** — the fix exposed a
  second bug: a redirected Ktor request emits one event per hop, and every hop carries the id minted
  for hop 1 (`ArgusClientPlugin.kt:61-64` mints in `onRequest`, which redirect resends bypass —
  `HttpRedirect` rebuilds the request with `takeFrom`, copying the attribute entries). Evidence from a
  Pixel 6 running the sample: 27 events, 22 unique ids, 5 duplicated; each duplicate pair is one
  `picsum.photos/200` image call with `status 302, 508 ms` and `status 200, 864 ms` under one id, both
  reporting hop 1's url. `virtual.ts` gives a repeated id a second DOM slot (`id#1`), so both rows
  rendered and both got marked, and `keyboard.ts`'s `findIndex` resolved the selection to the first
  copy — which is exactly the "two rows highlighted, `j` jumps back" report.
- **The store collapses a repeated id by REPLACING in place, not dropping** — first implemented as a
  drop, which was wrong: it kept the 302 and discarded the 200. Replacing keeps the later hop (the
  real status and body), and because `durationMs` is measured from the original `startMs` and the url
  comes from hop 1, the surviving event reads correctly as "this logical request, its final response,
  total elapsed time". Position is preserved so rows don't jump.
- **The row pool compares item identity** — replacing an event in place changes nothing about its id,
  so the pooled row would have kept rendering the 302. `virtual.ts` now stores the item alongside the
  element and rebuilds when the reference changes; `setItems` hands back the same references for
  untouched events, so only genuinely replaced rows rebuild.
- **The library-side redirect bug is fixed too** — `argus-core` now mints the event id per emitted
  event rather than per request, and builds each event's url/headers from the hop that actually ran,
  so a redirect shows as two events with their own urls and their own timings. The webui collapse
  stays as a safety net for apps on an older library version. Note this makes the Ktor path show
  redirect hops while `argus-okhttp` (application-level interceptor, by design) and
  `argus-urlconnection` (`instanceFollowRedirects`) still report one event per logical request.
- **No DOM unit test, no new devDependency** — argus-webui's vitest runs in the default `node`
  environment with no jsdom. Verified by hand in the browser against the mock source; existing
  store/input suites must stay green.
- **No version bump** — deferred until fixes accumulate.

## Context

- **Visuals:** None. `design_handoff_argus_inspector/argus/EventList.jsx:17-23` is the reference
  implementation of the row's selected state.
- **References:** `agent-os/specs/2026-04-30-1136-webui-small-bugs/` — the same pooling bug, fixed
  there for the correlation-id column toggle. That fix is why `invalidateAll()` exists.
- **Product alignment:** N/A — bug fix, no roadmap implication.

## Standards Applied

None. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it governs the webui
DOM layer. `workflow/commit-conventions` applies, as it does to every commit.
