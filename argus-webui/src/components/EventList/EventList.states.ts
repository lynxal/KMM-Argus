/**
 * Pure presentation logic for the EventList, kept out of the DOM wiring so it
 * can be tested — Vitest runs in the default node environment here, so nothing
 * that touches `document` is reachable from a test.
 */

/** Minimal shape the count needs; the real callers pass ArgusEvent. */
interface Identified {
  readonly id: string;
}

/**
 * How many events arrived after the newest one the user actually saw.
 *
 * Events are oldest-first, so the marker is the last id seen while following
 * the tail and everything after its index is unseen. A marker that is no
 * longer present has been evicted by the ring buffer or filtered out, so the
 * whole list counts as unseen.
 */
export function unseenCount(events: readonly Identified[], lastSeenId: string | null): number {
  if (lastSeenId == null) return events.length;
  const idx = events.findIndex((e) => e.id === lastSeenId);
  return idx === -1 ? events.length : events.length - 1 - idx;
}
