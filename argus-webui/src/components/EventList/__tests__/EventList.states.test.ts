import { describe, expect, it } from 'vitest';
import { isNarrowList, NARROW_LIST_WIDTH, unseenCount } from '../EventList.states';

describe('unseenCount', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];

  it('counts everything when there is no marker yet', () => {
    expect(unseenCount(events, null)).toBe(5);
  });

  it('counts nothing when the marker is the newest event', () => {
    expect(unseenCount(events, 'e')).toBe(0);
  });

  it('counts the events after the marker', () => {
    expect(unseenCount(events, 'c')).toBe(2);
    expect(unseenCount(events, 'a')).toBe(4);
  });

  it('counts everything when the marker has been evicted or filtered out', () => {
    expect(unseenCount(events, 'gone')).toBe(5);
  });

  it('handles an empty list', () => {
    expect(unseenCount([], null)).toBe(0);
    expect(unseenCount([], 'a')).toBe(0);
  });
});

describe('isNarrowList', () => {
  it('is narrow below the threshold', () => {
    expect(isNarrowList(320)).toBe(true);
    expect(isNarrowList(NARROW_LIST_WIDTH - 1)).toBe(true);
  });

  it('is not narrow at or above the threshold', () => {
    expect(isNarrowList(NARROW_LIST_WIDTH)).toBe(false);
    expect(isNarrowList(900)).toBe(false);
  });

  it('is not narrow before the first layout pass', () => {
    // clientWidth is 0 until then; calling that narrow flashes a collapsed row.
    expect(isNarrowList(0)).toBe(false);
    expect(isNarrowList(-1)).toBe(false);
  });
});
