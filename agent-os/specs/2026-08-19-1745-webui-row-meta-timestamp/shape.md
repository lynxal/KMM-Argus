# Event-list meta column — Shaping Notes

## Scope

GitHub issue #6: the trailing meta column of the argus-webui event list meant two different things
depending on row kind — call duration on HTTP rows, wall-clock time on log and custom rows — in one
right-aligned mono column with no header row to tell them apart. Make it a timestamp for every row
kind, and bring the design handoff and the top-level README along with the code.

## The defect

| Row kind | Old meta cell | Source |
| --- | --- | --- |
| HTTP | `${event.durationMs} ms`, or `—` when null | `Row.ts:100` (pre-fix) |
| LOG | `formatTime(event.timestamp)` | `Row.ts:126` (pre-fix) |
| CUSTOM | `formatTime(event.timestamp)` | `Row.ts:151` (pre-fix) |

All three used the identical class string `text-fg-3 font-mono text-xs w-24 text-right tabular-nums`,
and `EventList` renders no header row, so nothing marked the unit change. Two consequences: `142 ms`
scanned as a time, and there was no way to see *when* an HTTP call happened from the list at all —
which is exactly what is wanted when correlating a request against the log lines around it.

## Decisions

- **One hoisted meta cell, not three copies.** All three branches now build an identical cell, so it
  moved into `createMetaCell(timestamp)` called once after the `if / else if / else if` chain.
  `ArgusEvent` is a closed three-member union (`transport/schema.ts:98`), so appending after the
  chain is behaviourally identical to appending inside each branch — there is no reachable fourth
  case that would silently lose its cell. Keeping three copies is what invites this drift back.
- **Duration was already reachable, so nothing was added to preserve it.** HTTP detail pane
  (`EventDetail/tabs/HttpTabs.ts:111`), Waterfall bar width (`Waterfall.ts:185,326`), Waterfall
  hover tooltip (`Waterfall.ts:353`).
- **`design_handoff_argus_inspector/README.md:76` left alone.** The issue listed it, but that line
  sits under `### View: Waterfall` and describes the Waterfall row's own duration column — unrelated
  to the event list. Striking it would have deleted a design intent this change does not touch. The
  issue's own "Duration is not lost" section says the Waterfall keeps showing duration, so the two
  bullets contradicted each other; the Waterfall one is the mistake.
- **`docs/ui/event-list.png` is now stale.** `README.md:637` embeds it and it still shows `142 ms` in
  the meta column. Not regenerated here — that needs the app running against a device or the mock
  stream, and it belongs in a docs-screenshot pass rather than in this fix. **Left for a follow-up.**
- **No headed duration column.** That is the issue's own deferred Note, and the handoff's reference
  JSX already sketches the shape it should take (`argus/EventList.jsx:6-13` has a header row with
  separate `Time` / `Size` / `Dur` columns that the implementation never built). Recorded in
  `references.md`, not built.
- **No new test, no new devDependency.** argus-webui's vitest runs in the default `node` environment
  with no jsdom, so a built row cannot be asserted on without adding one. Same call as spec
  `2026-08-19-1623-webui-selected-row-highlight`. Existing suites stay green; verification is by hand
  in the browser against the mock source.
- **No version bump.** Deferred until fixes accumulate, matching the two prior webui bug specs.

## Pre-existing drift noticed, not fixed

`Waterfall.ts` reserves `DUR_W = 70` in its width maths (`Waterfall.ts:16,219`) but never draws the
duration text the handoff's line 76 specifies — duration only reaches the user through bar width and
the hover tooltip. That gap predates this issue and is out of scope. Worth filing separately.

## Context

- **Visuals:** None. `design_handoff_argus_inspector/argus/EventList.jsx` is the reference
  implementation of the row.
- **References:** see `references.md`.
- **Product alignment:** N/A — bug fix, no roadmap implication.

## Standards Applied

None. `agent-os/standards/index.yml` is Kotlin/KMP/cloud-flavoured; nothing in it governs the webui
DOM layer. `workflow/commit-conventions` applies, as it does to every commit.
