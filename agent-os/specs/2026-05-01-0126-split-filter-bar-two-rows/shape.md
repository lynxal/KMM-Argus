# Split FilterBar into two rows — Shaping Notes

## Scope

The single-row FilterBar in `argus-webui` is too crowded and relies on horizontal scroll. Split it into two stacked rows, keeping all existing controls and behavior. Purely a layout/CSS change.

## Decisions

- Two rows, not three: minimal disruption, still solves the crowding.
- Split is **categorical / numeric+text**:
  - Row 1: source chips, source-label dropdown, method chips.
  - Row 2: status chips, level chips, host/tag/contains inputs, count, clear.
- Outer container becomes `flex flex-col` and keeps the panel background + bottom border. Each inner row keeps the existing `h-9` styling (36 px) — total bar height ≈ 72 px.
- Each row keeps its own `overflow-x-auto` so very narrow viewports degrade row-by-row instead of dropping the whole inspector layout.
- No new design tokens; reuse existing Tailwind classes from the file.
- No new visuals required; no product-doc alignment needed.

## Context

- **Visuals:** None.
- **References:** Existing `FilterBar.ts` / `FilterBar.styles.ts` are the only reference — the change is local to those two files.
- **Product alignment:** N/A (cosmetic UX polish).

## Standards Applied

None of the standards in `agent-os/standards/index.yml` apply directly. The index is dominated by KMP / Kotlin / mesh / architecture topics; the webui module is vanilla TS + Tailwind and has no indexed UI standards. The only loosely related entry is `workflow/commit-conventions` (feat/fix/refactor types, no AI attribution trailers), which applies at commit time per repo memory.
