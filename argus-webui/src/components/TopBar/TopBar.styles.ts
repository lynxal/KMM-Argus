/**
 * Tailwind class strings for TopBar. All tokens resolve through
 * src/design/tokens.json; no raw hex or px.
 */
export const styles = {
  bar: 'h-10 flex items-center gap-3 px-3 bg-bg-panel border-b border-border-default',
  brand: 'flex items-center gap-2 pr-3 h-7 border-r border-border-default',
  wordmark: 'text-sm font-semibold font-ui',
  appBadge: 'px-1.5 py-0.5 rounded-xs bg-bg-subtle text-fg-2 font-mono text-xs truncate max-w-2xl',
  connPill: 'flex items-center gap-2 px-2 h-6 rounded-md bg-bg-subtle text-fg-2 font-ui text-xs',
  viewSwitcher: 'flex items-center rounded-md bg-bg-subtle p-1 gap-1',
  viewSegment: 'flex items-center justify-center px-2 h-5 rounded-sm text-fg-2 text-xs font-medium font-ui cursor-pointer transition-colors duration-base',
  viewSegmentActive: 'bg-bg-panel text-fg-1 shadow-sm',
  spacer: 'flex-1',
  search: 'h-6 w-60 px-2 rounded-md bg-bg-subtle text-fg-1 placeholder:text-fg-3 font-mono text-xs outline-none border border-border-default focus:border-border-focus',
  iconBtn: 'flex items-center justify-center w-6 h-6 rounded-sm text-fg-2 hover:bg-bg-hover hover:text-fg-1 transition-colors duration-base cursor-pointer',
  iconBtnActive: 'bg-bg-active text-fg-1',
} as const;
