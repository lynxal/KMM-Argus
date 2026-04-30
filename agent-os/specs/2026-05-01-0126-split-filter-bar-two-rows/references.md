# References for Split FilterBar into two rows

## Similar Implementations

### Existing FilterBar (the only reference)

- **Location:** `argus-webui/src/components/FilterBar/FilterBar.ts`, `argus-webui/src/components/FilterBar/FilterBar.styles.ts`
- **Relevance:** This is the component being changed. The current single-row layout, chip/divider construction, and `effect()`-based binders are the patterns to preserve.
- **Key patterns to keep:**
  - `binders` array push order must mirror iteration order in the membership-binding `effect()` (sources → methods → statuses → levels).
  - `spacerDivider()` helper for vertical-pixel dividers between groups.
  - `makeInput()` factory with 120 ms debounce.
  - `SourceLabelDropdown` is portaled to `document.body`; only its trigger lives inline.
  - Tailwind classes resolve from `argus-webui/src/design/tokens.json`.
