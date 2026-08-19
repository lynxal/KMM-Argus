# Fix #6 — HTTP rows show call duration where log rows show a timestamp

## Context

GitHub issue [#6](https://github.com/lynxal/KMM-Argus/issues/6) (`bug`): the trailing meta column of
the event list means two different things depending on row kind.

- HTTP rows print `${event.durationMs} ms` — `argus-webui/src/components/EventList/Row.ts:100`
- Log rows print `formatTime(event.timestamp)` — `Row.ts:126`
- Custom rows print the same timestamp — `Row.ts:151`

All three cells share one class string (`text-fg-3 font-mono text-xs w-24 text-right tabular-nums`)
and the list has no header row, so `142 ms` and `14:22:07.318` land in the same right-aligned mono
column with nothing to tell them apart. Two consequences: durations get misread as times, and there
is no way to see *when* an HTTP call happened from the list — which is the one thing you want when
correlating a request against the log lines around it.

**Outcome:** the meta column is a timestamp for every row kind. Duration leaves the list.

Duration is not lost. It is already in the HTTP detail pane (`EventDetail/tabs/HttpTabs.ts:111`), in
the Waterfall bar width (`Waterfall.ts:185,326`) and in the Waterfall tooltip (`Waterfall.ts:353`).

**Decisions taken during shaping:**

- **Hoist the meta cell out of the branch chain.** With all three branches building an identical
  cell, keeping three copies invites the same drift back. `ArgusEvent` is a closed three-member
  union (`transport/schema.ts:98`), so appending after the chain is behaviourally identical to
  appending inside each branch — no reachable fourth case loses its cell.
- **Do not touch `design_handoff_argus_inspector/README.md:76`.** The issue lists it, but that line
  is under `### View: Waterfall` and describes the Waterfall row's own duration column, which this
  change does not affect. Striking it would delete a design intent unrelated to the fix.
- **Do not regenerate `docs/ui/event-list.png`.** `README.md:637` embeds it and it will show `142 ms`
  after this change. Flagged as stale in the spec, left for a later docs pass.
- **No duration column with its own header.** That is the issue's own deferred Note. Worth knowing:
  the handoff's reference JSX already sketches it — `design_handoff_argus_inspector/argus/EventList.jsx:6-13`
  has a header row with separate `Time` / `Size` / `Dur` columns that the implementation never built.
  Recorded in `references.md` as the shape a future change should take, not built here.
- **No new test and no new devDependency.** argus-webui's vitest runs in the default `node`
  environment with no jsdom, so there is no way to assert on a built row without adding one. Same
  call as spec `2026-08-19-1623-webui-selected-row-highlight`. Existing store/input/transport suites
  must stay green.
- **No version bump.** Deferred until fixes accumulate, matching the two prior webui bug specs.

---

## Task 1 — Save spec documentation

Create `agent-os/specs/2026-08-19-1745-webui-row-meta-timestamp/`:

- `plan.md` — copy of this plan
- `shape.md` — scope, the decisions above, why handoff line 76 and the screenshot are out of scope
- `references.md` — `Row.ts` and the two doc files touched; the three places duration still surfaces
  (`HttpTabs.ts:111`, `Waterfall.ts:326,353`); `design_handoff_argus_inspector/argus/EventList.jsx:6-13`
  as the reference for a future headered duration column; prior art
  `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/` (same file, same no-jsdom verification path)

No `standards.md`. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured — nothing in it
governs the webui DOM layer. `workflow/commit-conventions` applies, as it does to every commit.

## Task 2 — One meta cell for every row kind (`argus-webui/src/components/EventList/Row.ts`)

Add a factory next to the existing `createCorrelationCell` / `createEngineChip` helpers:

```ts
/**
 * Trailing meta cell — the event's wall-clock time, for every row kind. HTTP rows
 * used to print `durationMs` here instead; one column with two units and no header
 * to disambiguate reads as a time and hides when the call actually happened.
 * Duration lives in the HTTP detail pane and the Waterfall.
 */
function createMetaCell(timestamp: number): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'text-fg-3 font-mono text-xs w-24 text-right tabular-nums';
  cell.textContent = formatTime(timestamp);
  return cell;
}
```

Then in `createEventRow`:

- Delete the three-line meta block from the HTTP branch (`Row.ts:98-101`), the log branch
  (`Row.ts:124-127`) and the custom branch (`Row.ts:149-152`).
- After the `if / else if / else if` chain closes and before `row.className = ROW_CLASS_BASE`
  (`Row.ts:153-155`), append once:

```ts
  row.appendChild(createMetaCell(event.timestamp));
```

Keep the class string a literal inside `Row.ts` — Tailwind's content scanner
(`argus-webui/tailwind.config.ts:31`) is what emits these utilities and there is no safelist.

`event.durationMs` becomes unused in this file; `isHttpEvent` is still needed (method, engine chip,
status, host/path) so no import changes.

## Task 3 — Update the design handoff (`design_handoff_argus_inspector/README.md`)

The handoff is the design source of truth and currently specifies the behaviour being removed.

- Line 53 — `[meta: duration or timestamp]` becomes `[meta: timestamp]`, with a short trailing note
  that duration is deliberately not in the list because one unheaded column cannot carry two units,
  and that it lives in the detail pane and the Waterfall instead.
- Line 76 — unchanged. Waterfall duration is out of scope.

## Task 4 — Update the top-level README (`README.md`)

- Line 635 — "and meta (duration or timestamp)" becomes "and meta (timestamp)".
- Line 637's `docs/ui/event-list.png` is left as-is; the staleness is recorded in `shape.md`.

---

## Verification

```bash
cd argus-webui
npm ci
npm run lint      # tsx scripts/lint-tokens.ts + tsc --noEmit
npm test          # vitest run — store / input / transport / overlays suites
npm run build     # tokens + tsc --noEmit + vite build
npm run dev       # then http://localhost:5173/?simulate=off
```

`?simulate=off` forces `createMockSource` (`argus-webui/src/app.ts:22-38`), so the fixture stream in
`src/dev/fixtures/events.ts` replays without a device.

Then, in the browser:

1. **Mixed stream, split view.** Every row's trailing column reads `HH:MM:SS.mmm`. No row shows
   `… ms`, and no row shows `—` where a timestamp belongs (the old HTTP fallback for a null
   `durationMs`).
2. **Timestamps are monotonic down the column** — that is the whole point of the fix: an HTTP row's
   time now sits in sequence with the log rows around it. Pick an HTTP row and confirm its time falls
   between its neighbours'.
3. **Column alignment holds.** `w-24` + `tabular-nums` was already carrying a 12-character timestamp
   on log rows, so HTTP rows must line up with them exactly — no ragged right edge, no truncation.
4. **Duration still reachable.** Select an HTTP row → the detail pane's Overview shows `duration
   <n> ms` (`HttpTabs.ts:111`). Switch to the Waterfall view → bars still scale by duration and the
   hover tooltip still ends `· <n> ms`.
5. **Correlation-id column toggled on** (`c`) → meta cell stays last in the row and stays aligned.
6. **Regressions in the shared row path**: click a row and press `j`/`k` — selection tint and left
   rail still work (the meta cell now appends after `applyRowSelection`'s sibling code, so confirm
   the class-only selection path is untouched). Type in the search box — `<mark>` highlighting still
   renders on host/path/message.
7. **Narrow layout** — shrink the window until `SplitView` swaps to `narrowList`, re-check 1 and 3.
8. Re-check 1 and 3 in **both themes** via the TopBar toggle.

Closing evidence for issue #6: a screenshot of a mixed HTTP + log stretch of the list showing one
timestamp column throughout.
