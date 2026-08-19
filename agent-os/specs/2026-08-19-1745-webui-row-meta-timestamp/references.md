# References for the event-list meta column

## Files changed

### `argus-webui/src/components/EventList/Row.ts`

- **Relevance:** the whole fix. The three per-branch meta blocks collapsed into one
  `createMetaCell(timestamp)` helper, appended once after the branch chain.
- **Key patterns:** `createMetaCell` sits with the file's existing cell factories
  (`createCorrelationCell`, `createEngineChip`) and uses the file-local `formatTime`. The Tailwind
  class string stays a literal in this file — `tailwind.config.ts:31`'s content scanner is what emits
  these utilities and there is no safelist, so a computed class name would not be generated.

### `design_handoff_argus_inspector/README.md:53`

- **Relevance:** design source of truth for the row layout; it specified the behaviour being removed.
- **Change:** `[meta: duration or timestamp]` → `[meta: timestamp]`, plus a note on why duration is
  deliberately absent from the list and where it lives instead.

### `README.md:635`

- **Relevance:** §8 UI walkthrough describes the same row layout to end users.
- **Change:** "and meta (duration or timestamp)" → "and meta (timestamp)".

## Where duration still surfaces (nothing needed adding)

- `argus-webui/src/components/EventDetail/tabs/HttpTabs.ts:111` — Overview grid, `duration <n> ms`.
- `argus-webui/src/components/Waterfall/Waterfall.ts:185,326` — bar width is duration / msPerPx.
- `argus-webui/src/components/Waterfall/Waterfall.ts:353` — `describeEvent` tooltip ends `· <n> ms`.

## Reference for a future headed duration column

### `design_handoff_argus_inspector/argus/EventList.jsx:6-13`

- **Relevance:** the issue's closing Note says that if duration returns to the list it needs its own
  column with its own header. This snippet already has that shape — a header row with `Src` /
  `Method` / `Status` / `Path / message` / `Time` (82 px) / `Size` (58 px) / `Dur` (62 px), all
  right-aligned numerics — and the implementation never built it.
- **Key patterns:** `els.ts` for the time cell, `els.num` for size and duration, `formatDur(ev.dur)`
  (`EventList.jsx:57-59`). Note the handoff's prose (line 53) never describes this header row, so the
  handoff's own README and JSX already disagree on it. Independent of this fix.

## Prior art

### `agent-os/specs/2026-08-19-1623-webui-selected-row-highlight/`

- **Relevance:** the previous change to this same file, and the source of the no-jsdom /
  browser-verification convention this spec follows.
- **Key patterns:** `applyRowSelection` is the class-only selection path that the new
  `row.appendChild(createMetaCell(...))` call sits directly above — worth re-checking j/k selection
  after touching `createEventRow`.
