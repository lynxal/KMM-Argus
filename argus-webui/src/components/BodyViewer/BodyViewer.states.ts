/**
 * JSON-tree node identity and expansion state — the DOM-free half of BodyViewer,
 * so it can be unit-tested the way EventList.states.ts and FilterBar.states.ts are.
 *
 * A `<details>` element's `open` flag used to be the only record of what the
 * reader had opened (#28), and the detail pane rebuilds its whole body from scratch on
 * a tab switch, a reselect, and (before the store fix) on every ingested event.
 * Every rebuild therefore threw the reader's expansion away. Keeping the state
 * out here, keyed by a stable path, is what lets a rebuilt tree come back the way
 * it was left.
 */

/** Levels that start expanded when the reader has not said otherwise. */
export const DEFAULT_OPEN_DEPTH = 2;

/** Panes remembered at once, oldest evicted first. Bounds the map over a long session. */
export const MAX_TRACKED_PANES = 32;

/** The path of a tree's outermost node. */
export const JSON_ROOT_PATH = '';

/**
 * Path of `segment` inside `parent`.
 *
 * `~` and `/` are escaped JSON-Pointer style (`~0`, `~1`) so a key that contains
 * a slash cannot be mistaken for a nesting level, and the two escapes cannot
 * collide with each other: keys `a/b` and `a~1b` get distinct paths.
 */
export function jsonChildPath(parent: string, segment: string): string {
  return `${parent}/${segment.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

/**
 * paneKey → path → a state that DEVIATES from the depth default.
 *
 * Only deviations are held, never a node's current state. That is what makes a
 * deliberately *collapsed* default-open node stay collapsed while untouched nodes
 * keep following `DEFAULT_OPEN_DEPTH`, and it keeps the map proportional to what
 * the reader actually changed rather than to body size.
 *
 * It has to be deviations rather than "whatever we were told" because a `<details>`
 * fires a `toggle` for a programmatic `open = true` as well as for a click, and the
 * task it queues runs after the listener is attached — so every default-open node
 * reports itself on render. Dropping writes that match the default absorbs those,
 * and makes the record self-healing: toggling a node back to its default forgets
 * it rather than pinning today's default forever.
 */
const deviations = new Map<string, Map<string, boolean>>();

/** What this node opens as by default, before the reader has touched it. */
export function defaultOpen(depth: number): boolean {
  return depth < DEFAULT_OPEN_DEPTH;
}

/** Should this node render expanded? The reader's choice, else the depth default. */
export function isNodeOpen(
  paneKey: string | undefined,
  path: string,
  depth: number,
): boolean {
  if (paneKey == null) return defaultOpen(depth);
  return deviations.get(paneKey)?.get(path) ?? defaultOpen(depth);
}

/** Record a toggle. No-op without a paneKey — that caller opted out of persistence. */
export function setNodeOpen(
  paneKey: string | undefined,
  path: string,
  open: boolean,
  depth: number,
): void {
  if (paneKey == null) return;
  const pane = deviations.get(paneKey) ?? new Map<string, boolean>();
  // Re-insert so the Map's insertion order doubles as recency.
  deviations.delete(paneKey);
  if (open === defaultOpen(depth)) pane.delete(path);
  else pane.set(path, open);
  deviations.set(paneKey, pane);
  while (deviations.size > MAX_TRACKED_PANES) {
    const oldest = deviations.keys().next();
    if (oldest.done) break;
    deviations.delete(oldest.value);
  }
}

/** Nodes currently remembered for a pane. For tests — nothing renders off this. */
export function trackedNodeCount(paneKey: string): number {
  return deviations.get(paneKey)?.size ?? 0;
}

/** Test seam — module state would otherwise leak between cases. */
export function resetJsonExpandState(): void {
  deviations.clear();
}
