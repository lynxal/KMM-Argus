/**
 * Pure sizing logic for the waterfall view's splitter, kept out of the DOM wiring
 * so it can be tested — Vitest runs in the default node environment here, so
 * nothing that touches `document` is reachable from a test.
 */
import { DEFAULT_WATERFALL_LIST_WIDTH } from '../../store/eventStore';

/**
 * Narrowest the event-list pane may get. This is the width it has today, so the
 * splitter only ever widens it and no existing layout regresses. It is also above
 * the row's narrow-mode min-content (~283 px measured), which is what keeps the
 * trailing cells inside the pane instead of clipped against its right edge.
 */
export const MIN_LIST_WIDTH = 320;

/** The waterfall pane can't be squeezed out of existence either. */
export const MIN_WATERFALL_WIDTH = 320;

/** Width of the handle, which stands in for the `gap-2` gutter it replaces. */
export const SPLITTER_WIDTH = 8;

/** How far one arrow-key press moves the handle. */
export const WIDTH_STEP = 16;

/**
 * Fit `desired` into what the container can actually give, in whole pixels.
 *
 * `availablePx` is the flex row's content width — both panes plus the handle. A
 * value of 0 means the container has not been laid out yet, and there is no
 * meaningful ceiling to apply: clamping against it would collapse a restored
 * 600 px pane to the minimum on every page load, which is the one bug this
 * function exists to avoid.
 *
 * Sub-pixel widths are rounded away. Nothing here needs the precision, and a
 * fractional pane width makes the probe's edge-vs-edge comparisons flaky.
 */
export function clampListWidth(desired: number, availablePx: number): number {
  const want = Number.isFinite(desired) ? Math.round(desired) : DEFAULT_WATERFALL_LIST_WIDTH;
  if (want < MIN_LIST_WIDTH) return MIN_LIST_WIDTH;
  if (availablePx <= 0) return want;
  // A container too small for both minimums still yields the list its minimum —
  // the waterfall gives first, because it scrolls horizontally and the list does not.
  const max = Math.max(MIN_LIST_WIDTH, Math.round(availablePx) - SPLITTER_WIDTH - MIN_WATERFALL_WIDTH);
  return Math.min(want, max);
}
