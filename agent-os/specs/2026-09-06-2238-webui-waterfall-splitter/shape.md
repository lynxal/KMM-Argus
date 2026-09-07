# Waterfall Splitter — Shaping Notes

Issue: [lynxal/KMM-Argus#31](https://github.com/lynxal/KMM-Argus/issues/31) — "Web UI: waterfall
list pane is a fixed 320px, so long rows clip with no way to widen it".

## Scope

Two changes to `argus-webui`, both in service of the same complaint:

1. **A draggable splitter** between the event list and the waterfall canvas, with the pane width
   persisted across reloads.
2. **Rows that stop overflowing** their pane — no fixed cell shrinks into its neighbour, and the
   row sheds two cells when the pane is narrow.

Out of scope: changing the waterfall panel itself, the split view's 50/50 divide, or the design
reference's 34%-of-shell sizing (a fixed px width that the user can drag is strictly more useful
than a percentage they cannot).

## Decisions

- **Floor is 320px, not the 240px the issue proposed.** A row's min-content is ~402px today; even
  with `flex-none` on every cell and the redirect pill collapsed, the fixed cells still total
  ~284px. A 240px floor would have kept clipping — the very thing the issue asks to end. 320px is
  today's width, so the splitter only ever widens and nobody ends up worse off.
- **Two drops in narrow mode, not five.** Below 440px the engine chip is hidden and
  `↳ REDIRECTED` collapses to `↳`. Timestamps keep their milliseconds. Both dropped cells stay
  recoverable — the chip has a `title`, the pill's `title` names the origin hop, and the detail
  pane carries both.
- **`EventList` observes its own width**, rather than `SplitView` toggling a class on the waterfall
  list. Deviates from the issue, and is better: the *split* view's list on a 900px window is
  equally cramped, and every list instance now degrades the same way for free.
- **Committed probe, not a scratchpad run.** `scripts/probe-webui/` is the established home for
  real-DOM assertions and CI runs `npm run probes`. A throwaway harness would verify this once and
  guard nothing.
- **The correlation cell stays shrinkable, on purpose.** It is the one cell that must *not* get
  `flex-none`: it already carries `truncate`, and because the path cell's flex basis is `0%` it
  absorbs none of any shortfall, so all of it lands on the correlation cell, which truncates
  cleanly. Making it `flex-none` would push the row past the right edge whenever that optional
  column is on at the floor width.

## Width budget

Estimated at ~0.6em per JetBrains Mono glyph — 11px for row text, 10px for the two `text-xxs`
pills — then verified by the probe.

| | px |
| --- | --- |
| `px-2` row padding | 16 |
| 6 × `gap-2` | 48 |
| source badge | ~34 |
| method `w-10` | 40 |
| engine chip (`OKHTTP`) | ~46 |
| status + dot `w-10` | 40 |
| `↳ REDIRECTED` pill | ~82 |
| path / message | 0 (flex basis) |
| timestamp `w-24` | 96 |
| **full row min-content** | **~402** |
| **narrow row min-content** | **~284** (chip −46 −8 gap, pill −64) |

That is why the narrow threshold is 440px and not the ~420px the issue suggested: at 420 there
would be a band where the full row still overflows. These are estimates at ~0.6em per mono glyph;
the probe measures the real boxes.

## Two findings that changed the implementation

1. **`npm run lint` rejects raw px literals.** `argus-webui/scripts/lint-tokens.ts:26` fails on
   `/\b\d+(\.\d+)?px\b/` in any `src/**` `.ts`/`.css` file outside `src/design/**`,
   `src/styles/globals.css`, `src/assets/**`. Narrow-mode rules therefore live in `globals.css`
   (exempt) and TypeScript carries bare numbers — the `GUTTER_W = 240` pattern already in
   `Waterfall.ts:15`. Template literals (`` `${w}px` ``) pass, since the regex needs a digit
   immediately before `px`; comments are stripped before scanning.
2. **The 10px pill classes do resolve.** An early read of `globals.css` suggested `text-xxs` was
   dead, since that file defines only `--fs-xs` upward. It is not: `build-tokens.ts` reads the
   handoff source (`design_handoff_argus_inspector/ds/colors_and_type.css:445`, `--fs-xxs: 10px`),
   and the generated scale carries `xxs`. So the redirect pill and the engine chip do render at
   10px as intended, and the full row's min-content is ~402px rather than the ~413px first
   estimated. The 440px narrow threshold still clears it, so no constant changed.

## Verified, not assumed

Measured by `scripts/probe-webui/splitter-probe.js` (30 assertions, all passing):

- The pre-fix build really does clip. At 320px on a pill row the timestamp cell overflowed its row
  by **40px** and the path cell was squeezed to **0px** wide. That is the measurement the probe's
  `overflowRight` check now guards.
- The full redirect pill measures **82px**, matching the estimate above.
- Nothing overflows at 320px, at 432px (narrow), or at 448px (wide) — including with the optional
  correlationId column switched on, which is the case the shrinkable-correlation-cell reasoning
  turns on.
- A drag leaves the waterfall canvas's `style.width` byte-identical, confirming the `computeScale`
  reading.

## Known trade-off

At the 320px floor the path cell gets ~35px — roughly five characters plus an ellipsis. That is the
honest cost of keeping full timestamps and a 96px meta cell. The win is that nothing clips at any
width and one drag makes the pane 600px. If more path is wanted at the floor later, the cheapest
next step is tightening the row gap from 8px to 4px in narrow mode (+20px); deliberately not done
here, because it changes row rhythm beyond the two agreed drops.

## Context

- **Visuals:** none provided. `design_handoff_argus_inspector/` is a code reference, not a mockup.
- **References:** see `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md:15` scopes the MVP to a "simple waterfall
  view"; this is ergonomics on the existing view, not the phased waterfall listed as a non-goal.

## Standards applied

- `workflow/commit-conventions` — commit type, issue reference, no agent attribution.
- `naming/code-documentation` — document *why*, matching this codebase's existing comment density.
- `testing/test-structure` — AAA shape for the new Vitest cases (Kotlin specifics do not transfer).

See `standards.md`, which also records that no existing standard covers `argus-webui` at all.
