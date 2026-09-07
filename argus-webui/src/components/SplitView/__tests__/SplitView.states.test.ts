import { describe, expect, it } from 'vitest';
import { DEFAULT_WATERFALL_LIST_WIDTH } from '../../../store/eventStore';
import {
  clampListWidth,
  MIN_LIST_WIDTH,
  MIN_WATERFALL_WIDTH,
  SPLITTER_WIDTH,
} from '../SplitView.states';

describe('clampListWidth', () => {
  // Wide enough that the ceiling never bites, so each case tests one thing.
  const ROOMY = 2000;

  it('passes a width that fits through untouched', () => {
    expect(clampListWidth(600, ROOMY)).toBe(600);
  });

  it('raises anything below the minimum to the minimum', () => {
    expect(clampListWidth(0, ROOMY)).toBe(MIN_LIST_WIDTH);
    expect(clampListWidth(-500, ROOMY)).toBe(MIN_LIST_WIDTH);
    expect(clampListWidth(MIN_LIST_WIDTH - 1, ROOMY)).toBe(MIN_LIST_WIDTH);
  });

  it('leaves the waterfall pane its minimum at the wide end', () => {
    const available = 1000;
    const ceiling = available - SPLITTER_WIDTH - MIN_WATERFALL_WIDTH;
    expect(clampListWidth(9999, available)).toBe(ceiling);
    expect(clampListWidth(ceiling, available)).toBe(ceiling);
  });

  it('falls back to the default when the stored value is not a number', () => {
    expect(clampListWidth(Number.NaN, ROOMY)).toBe(DEFAULT_WATERFALL_LIST_WIDTH);
    expect(clampListWidth(Number.POSITIVE_INFINITY, ROOMY)).toBe(DEFAULT_WATERFALL_LIST_WIDTH);
  });

  it('applies no ceiling before the container has been laid out', () => {
    // clientWidth is 0 until the first layout pass. Clamping there would collapse a
    // restored wide pane to the minimum on every reload.
    expect(clampListWidth(600, 0)).toBe(600);
    expect(clampListWidth(600, -1)).toBe(600);
    // The floor still applies — an unmeasured container is no reason to go narrower.
    expect(clampListWidth(100, 0)).toBe(MIN_LIST_WIDTH);
  });

  it('gives the list its minimum when the container cannot fit both panes', () => {
    expect(clampListWidth(500, 400)).toBe(MIN_LIST_WIDTH);
    expect(clampListWidth(MIN_LIST_WIDTH, 100)).toBe(MIN_LIST_WIDTH);
  });

  it('rounds to whole pixels', () => {
    expect(clampListWidth(600.4, ROOMY)).toBe(600);
    expect(clampListWidth(600.6, ROOMY)).toBe(601);
  });
});
