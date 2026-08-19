# Fix #15 — filtered-out event blanks the event list while following the tail

## Context

[Issue #15](https://github.com/lynxal/KMM-Argus/issues/15): with the LOG source chip deselected and the
list following the tail, emitting a log event correctly hides it from the list — but the list goes
**visually blank**. Rows return only on a manual scroll. Reported on a device, reproduced headlessly
6/6 by the issue author. Branch is level with `origin/main` (`fb0203e`) — no rebase needed.

Observed state: `scrollTop` drops 1091 → 0 while the rendered row window stays at `784..1652px`, so
every pooled row sits below a viewport showing `0..589px`. Nothing re-renders, because nothing
notices the scroll position moved.

### Root cause — different from the issue's hypothesis

The issue blames a Chromium scroll-position revert racing the `pinLocked` rAF release in
`virtual.ts:105-113`, and says the guard's exact failure is "worth confirming rather than assuming".
Reading the code, the zeroing comes from somewhere else entirely:

`argus-webui/src/app.ts:63-67` mounts the content host inside an effect that reads
`store.events.value` — the whole array, when all it needs is "is it empty". **Every** ingested event
re-runs that effect, and `contentHost.innerHTML = ''` detaches the EventList's scroll viewport and
re-appends it. Detaching drops `scrollTop` to 0; the pooled rows keep their inline `transform`s.

That accounts for every constraint in the issue that the `pinLocked` theory has to strain for:

- **Why only a filtered-out event.** Effects run after the items effect, so `pinIfNeeded()` has
  already written `scrollTop`. For a *visible* event that write **changes** the value (1091 → 1119),
  which fires a real scroll event; the handler at `virtual.ts:166-175` then repairs the window. For a
  hidden event `filteredEvents` re-emits a new array with identical contents, so the write is a
  clamped no-op, **no scroll event fires**, and the detach's zeroing is never repaired.
- **Why only when content is taller than the viewport.** Otherwise `scrollTop` is 0 anyway and the
  detach is invisible.
- **Why it bisects to #13.** Pre-#13 the newest event was at the *top*, so following the tail meant
  `scrollTop ≈ 0` — the detach was a no-op there too. #13 exposed a pre-existing shell bug rather
  than introducing one.
- **Why there is no scroll event and no console error.** A silent DOM re-insertion, not an event.

Confidence is high but the mechanism is **unconfirmed until the probe in Task 2 proves it**. The plan
is ordered so the probe lands first and is instrumented to discriminate the two candidates.

Beyond the blanking, that effect tears down the whole content area — list, detail, waterfall — on
every single event, so scroll positions and text selection anywhere in it are lost, and on-device
this is real per-event work.

## Fix

### 1. `argus-webui/src/app.ts` — stop rebuilding the content host on every event

Wrap the condition in a `computed`. signals-core bumps a computed's version only when its value
changes, so a boolean computed makes the effect re-run **only when the answer flips**:

```ts
const showWaiting = computed(
  () => store.events.value.length === 0 && source.connection.value === 'connected',
);
effect(() => {
  contentHost.replaceChildren(showWaiting.value ? waiting : split);
});
```

Import `computed` next to the existing `effect` import (line 13). `replaceChildren` replaces the
`innerHTML = ''` + `appendChild` pair. Comment the *why* — a future reader will otherwise "simplify"
the computed back out.

### 2. `argus-webui/src/components/EventList/virtual.ts` — notice a `scrollTop` we never rendered for

Defence in depth, and what the issue asks for in its second suggestion: the stranded-window state
should be unreachable regardless of which write caused it.

- Track `lastRenderedScrollTop`, assigned in `render()` (line 119 already reads `viewport.scrollTop`).
- In `pinIfNeeded()`'s `release` (line 110), after clearing `pinLocked`: re-assert the bottom if
  `pinned && !newestRowVisible()`, then `render()` if `viewport.scrollTop !== lastRenderedScrollTop`.
  Idempotent by construction, which matters because `release` runs twice (rAF **and** the 250 ms
  timeout), and it cannot fight a genuine user scroll — the scroll handler recomputes `pinned` first.

Keep the `pinLocked` guard. #13's spec records the Chromium revert as *measured*, so it is defending
something real; this adds the silent case it cannot see.

Correct the comment at `virtual.ts:77-88` to describe what the probe actually establishes — it
currently attributes the whole guard to the Chromium revert.

### 3. Paths the issue flagged as worth checking

`invalidateAll()` + `setItems` on a `textQuery` change (`EventList.ts:140-144`) and on the
correlation-column toggle (`EventList.ts:148-152`) re-set identical items, so they hit the same
no-op-write case *and* drop the pool. Fix 1 removes the trigger and fix 2 the consequence; both get
probe coverage rather than an argument.

## Files

| File | Change |
| --- | --- |
| `argus-webui/src/app.ts` | `computed` boolean + `replaceChildren`; the actual fix |
| `argus-webui/src/components/EventList/virtual.ts` | `lastRenderedScrollTop` + repair in `release`; comment correction |
| `scripts/probe-webui/follow-tail-probe.js` | new committed regression probe |
| `scripts/probe-webui/README.md` | probe usage section |

No changes to `eventStore.ts`, `filters.ts`, or `EventList.ts` — `applyFilters` returning a fresh
array (`filters.ts:95`) is correct, and suppressing the identical-contents re-emit would mask the bug
rather than fix it, as the issue notes.

## Tasks

1. **Save spec documentation** — `agent-os/specs/2026-08-19-1906-webui-filtered-event-blanks-list/`
   with `plan.md` (this), `shape.md`, `standards.md` (`naming/code-documentation`,
   `workflow/commit-conventions`, `testing`), `references.md`. Matches the #13 spec layout.
2. **Write the probe and confirm the mechanism.** `npm install` in `argus-webui` (no `node_modules`
   present) and in `scripts/probe-webui`. Build the probe; run it against the **unfixed** tree and
   confirm 6/6 red. Instrument it to discriminate: log content-host effect runs, scroll events, and
   `scrollTop` immediately before/after each, so the plan's diagnosis is proven and not assumed. If
   the detach is *not* the cause, stop and re-plan before touching either file.
3. **Fix `app.ts`** (fix 1). Re-run the probe: expected green.
4. **Harden `virtual.ts`** (fix 2) and correct the stale comment. Prove it load-bearing by reverting
   fix 1 with fix 2 in place — the probe should still pass.
5. **Verify** (below).
6. **Commit and PR** — Lynxal commit style, no AI attribution.

## The probe

`scripts/probe-webui/` is the repo's existing home for committed browser checks and already carries
`playwright` and `ws` as dependencies, so nothing new is added to `argus-webui/package.json`. Its
README already documents these as manual, not CI-wired.

`follow-tail-probe.js` is self-contained — it mirrors production topology instead of the bundled mock
(which the issue rightly rejects: a finite ~19-event burst that cannot emit on demand):

- Node `http` server serving `argus-webui/dist/` plus `GET /api/info`, `GET /api/events?limit=500`
  (60 HTTP events, oldest-first), `DELETE /api/events`; a `ws` server on `/ws` sending
  `{ type: 'hello', schemaVersion: 2, info }` then event frames on command. Same-origin, so
  `app.ts`'s `sameOrigin` branch resolves the device to the fake server — the real `mountApp` and the
  real `websocketSource` are under test, which is what makes this able to catch a shell-level bug.
  Mounting `EventList` alone (as #13's throwaway harness did) would **not** reproduce this.
- Playwright at a 900×600 viewport so 60 rows overflow. Deselect the LOG chip (selector to be read
  out of `FilterBar/FilterBar.ts`), snapshot `scrollTop` and the count of `[data-event-id]` rows
  intersecting the viewport, push one LOG event, settle, re-measure. Fail if `scrollTop` collapses to
  0 or the visible count hits 0. **6 injections**, matching the issue's determinism claim.
- Complement assertions: a *visible* HTTP event still advances the tail by one row; a `textQuery`
  change and the `c` column toggle each leave the window intact (Task 3 above).
- `EXPECTED_SCHEMA` constant with the same drift warning `ws-probe.js` carries — `ARGUS_SCHEMA_VERSION`
  is 2 (`transport/schema.ts:9`) and there is no static check tying them together.
- Exit 0/1, screenshot + browser console on failure, matching `ui-probe.js`.

**CI caveat, stated rather than glossed:** `.github/workflows/verify.yml` has no Node or webui job at
all, so this probe will not gate PRs — same as the two probes already there. Wiring the webui into CI
is a separate change; say so in the PR rather than let a committed test imply coverage it does not
have.

## Verification

```bash
cd argus-webui && npm install && npm run lint && npm test && npm run build
cd ../scripts/probe-webui && npm install && npx playwright install chromium
node follow-tail-probe.js          # red before Task 3, green after
```

- Existing vitest suites (`store/__tests__`, `EventList/__tests__`) must stay green — nothing here
  touches what they cover, so a failure means the fix reached further than intended.
- Real-app sanity at `?simulate=off`: the fixture burst still follows the tail, the "Jump to latest"
  pill still appears when scrolled away and clears on click, and the waiting → list transition still
  happens on the first event (the one flip the `computed` must still deliver).
- Both empty-state directions: first event mounts the split view; `Shift+X` clear returns to
  `WaitingForEvents`.
