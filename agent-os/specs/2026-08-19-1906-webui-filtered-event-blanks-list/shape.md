# Web UI filtered-out event blanks the list — Shaping Notes

## Scope

Fix [issue #15](https://github.com/lynxal/KMM-Argus/issues/15): with the LOG source chip deselected
and the event list following the tail, a log event arriving is correctly hidden from the list but
leaves the list **visually blank**. `scrollTop` collapses to 0 while the rendered row window stays
where it was, so every pooled row sits below the viewport. Scrolling by hand brings them back.

## Decisions

- **The issue's diagnosis was wrong, and that changed which file gets fixed.** #15 attributes the
  zeroing to a Chromium scroll-position revert winning a race against the `pinLocked` rAF release in
  `virtual.ts`, and explicitly flags that as unconfirmed. It is not the cause. `app.ts` mounts the
  content host inside an effect that reads `store.events.value` — the whole array, when the only
  question it asks is whether the array is empty. Every ingested event therefore re-runs it, and
  `contentHost.innerHTML = ''` detaches the EventList's scroll viewport and re-appends it. Detaching a
  scroll container drops its offset to 0; the pooled rows keep their inline `transform`s. No scroll
  event is involved, which is exactly why nothing re-rendered and why the console stayed clean.

- **Why the bug is filter-shaped, given a cause that has nothing to do with filters.** The content-host
  effect runs *after* the items effect, so `pinIfNeeded()` has already written `scrollTop` by the time
  the detach happens. For a visible event that write **changes** the value, which fires a real scroll
  event; the handler in `virtual.ts` then re-asserts the bottom and re-renders, repairing the damage
  before anyone sees it. For a filtered-out event `filteredEvents` re-emits a new array with identical
  contents, so the write is a clamped no-op, **no scroll event fires**, and nothing repairs it. The
  issue's own generalisation — "any `setItems` that does not change the item count while pinned" — is
  right; it just describes the condition under which the repair is missing, not the condition that
  causes the zeroing.

- **Not a regression from #13, despite bisecting cleanly to it.** Pre-#13 the newest event sat at the
  top, so following the tail meant `scrollTop ≈ 0` and the detach was a no-op. #13 exposed a
  pre-existing shell bug by moving the follow position to the bottom. Worth recording, because the
  bisect result reads as an indictment of #13's pinning code and it is not one.

- **`computed`, not a manual dirty check.** signals-core only bumps a computed's version when its value
  actually changes, so wrapping the condition in a boolean `computed` makes the effect re-run **only
  when the answer flips** — the invariant is enforced by the reactive graph rather than by a
  hand-rolled `if (next === mounted) return`. This is why the computed must not be "simplified" back
  out later, and the comment says so.

- **Harden `virtual.ts` as well, even though `app.ts` is sufficient.** The deeper defect is that
  `scrollTop` can end up somewhere no `render()` has run for and nothing notices until the next scroll
  event. `lastRenderedScrollTop` plus a repair in the pin release makes that state unreachable
  regardless of which write caused it — #15's second suggested direction. Proven load-bearing by
  reverting the `app.ts` fix with it in place and re-running the probe.

- **The `pinLocked` guard stays.** #13's spec records the Chromium revert as *measured* in a real
  browser, so the guard defends something real. The drift repair covers the silent case the guard
  cannot see; it does not replace it.

- **#15's first suggestion — skip arming the pin for a no-op write — was dropped.** With the drift
  repair in place the rAF is what fixes things, so removing it would work against the fix.

- **Nothing in the store changes.** `applyFilters` returning a fresh array is correct. Suppressing the
  identical-contents re-emit would hide the bug, as the issue itself notes.

- **The probe is committed, not throwaway.** #13 used a scratchpad harness that mounted `EventList`
  alone; that harness **cannot** reproduce this bug, because the cause is in the app shell above it.
  So the probe drives the real `mountApp` and the real `websocketSource` against a fake device server
  in the same process, same-origin — production topology. It lives in `scripts/probe-webui/`, which
  already exists for exactly this and already carries `playwright` and `ws`.

- **The probe does not gate CI, and the PR says so.** `.github/workflows/verify.yml` has no Node or
  webui job at all. Both existing probes are documented as manual for the same reason. Wiring the
  webui into CI is a separate change; a committed test that implies coverage it does not have is worse
  than no test.

## Context

- **Visuals:** None. The bug is a scroll-position state, not a layout or styling question.
- **References:** `argus-webui/src/app.ts`, `src/components/EventList/{virtual,EventList}.ts`,
  `src/store/{eventStore,filters}.ts`, `src/transport/{websocketSource,schema}.ts`,
  `scripts/probe-webui/{ui-probe.js,ws-probe.js}`, and the #13 spec
  (`agent-os/specs/2026-08-19-1715-webui-newest-at-bottom/`). See `references.md`.
- **Product alignment:** N/A — bug fix, no roadmap impact.

## Standards Applied

- `naming/code-documentation` — both touched files carry long explanatory comments, and one of them
  (`virtual.ts:77-88`) attributes the pin guard entirely to the Chromium revert. Documenting the *why*
  is what stops the `computed` and the drift repair being removed as redundant later.
- `testing/test-structure` — governs the probe's shape: one named scenario per assertion block, the
  failing case proven red before the fix.
- `workflow/commit-conventions` — commit format for the fix.
