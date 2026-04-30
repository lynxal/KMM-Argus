# Split FilterBar into two rows

## Context

The FilterBar in `argus-webui` is a single horizontal flex row (`h-9`) holding a lot of controls: source chips, source-label dropdown, method chips, status chips, level chips, three text inputs, count display, and clear link. On typical viewports the row gets crowded and relies on horizontal scroll (`overflow-x-auto`), which hides controls. Splitting the bar into two stacked rows reduces crowding and removes the need to scroll horizontally for normal usage.

User-chosen layout (confirmed):

- **Row 1:** source chips · source-label dropdown · `|` · method chips
- **Row 2:** status chips · `|` · level chips · `|` · host / tag / contains inputs · _spacer_ · count · clear

No visual mockups; match the existing tokens/styling system. No product-doc alignment needed (purely cosmetic).

## Plan

### Task 1 — Save spec documentation

Create `agent-os/specs/2026-05-01-0126-split-filter-bar-two-rows/` containing:

- `plan.md` — copy of this file
- `shape.md` — shaping notes (scope, decision, context)
- `standards.md` — none of the indexed standards apply (KMP/architecture-focused); record this explicitly
- `references.md` — pointer to existing `FilterBar.ts` / `FilterBar.styles.ts` as the only reference
- `visuals/` — empty (no mockups)

### Task 2 — Restructure FilterBar layout into two rows

**Files to modify**

- `argus-webui/src/components/FilterBar/FilterBar.styles.ts`
- `argus-webui/src/components/FilterBar/FilterBar.ts`

**Style changes** (`FilterBar.styles.ts`)

- Repurpose `bar` from a single flex row to a vertical container; the bottom border and panel background stay on the outer element so the bar still reads as one block:
  - **Before:** `'h-9 flex items-center gap-3 px-2 bg-bg-panel border-b border-border-default overflow-x-auto'`
  - **After:** `'flex flex-col bg-bg-panel border-b border-border-default'`
- Add `row: 'h-9 flex items-center gap-3 px-2 overflow-x-auto'` — reuses the original row styling so each row keeps the existing 36 px height, 12 px gap, 8 px padding, and per-row horizontal scroll fallback for very narrow viewports.

**Markup changes** (`FilterBar.ts`, lines 39–190 in `createFilterBar`)

- Create two row containers near the top:
  ```ts
  const row1 = document.createElement('div');
  row1.className = styles.row;
  const row2 = document.createElement('div');
  row2.className = styles.row;
  ```
- Replace the single `bar.append(...)` block at lines 174–190 with per-row appends:
  - **Row 1:** `srcGroup`, `sourceLabelDropdown`, `spacerDivider()`, `methodGroup`
  - **Row 2:** `statusGroup`, `spacerDivider()`, `levelGroup`, `spacerDivider()`, `hostInput`, `tagInput`, `textInput`, `spacer`, `count`, `clearLink`
  - Then `bar.append(row1, row2)`
- The four pre-built dividers (`div1`–`div4` at lines 70/92/118/141) are no longer all needed. Construct dividers inline via the existing `spacerDivider()` helper at the points listed above and drop the now-unused locals.

**What does not change**

- The `binders` array push order still mirrors the iteration order in the `effect()` at lines 193–200 (sources → methods → statuses → levels), so chip active/inactive binding keeps working without modification.
- `SourceLabelDropdown` is portaled to `document.body` with `position: fixed`; its trigger element still lives inline in row 1, so dropdown positioning is unaffected.
- The `spacer` (`flex-1`) sits inside row 2 only, keeping count + clear right-aligned within that row.
- Text-input debounce, focus shortcut (`f`), and clear-filters reset logic are untouched.

### Verification

1. Build/serve the webui as usual and open the inspector.
2. Confirm two stacked rows replace the single filter row; total height ≈ 72 px.
3. Confirm Row 1 = source chips + source-label dropdown + divider + method chips.
4. Confirm Row 2 = status chips + divider + level chips + divider + three text inputs + count + clear (right-aligned).
5. Functional regressions: chip toggle / right-click only-this, dropdown positioning, `f` shortcut focus, debounced filter, Clear filters reset.
6. Run typecheck/lint for `argus-webui`.

### Critical files

- `argus-webui/src/components/FilterBar/FilterBar.ts`
- `argus-webui/src/components/FilterBar/FilterBar.styles.ts`
