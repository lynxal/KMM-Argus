import { type ArgusEvent, type HttpEvent, isHttpEvent } from '../transport/schema';

/**
 * Redirect-chain derivation over the event list.
 *
 * A Ktor redirect emits one event per hop, each with its own id, url and timing,
 * all sharing a `requestGroupId` (see HttpEvent.requestGroupId). The hops are NOT
 * adjacent: unrelated traffic is emitted between them, so nothing here may rely on
 * position within the group.
 *
 * Ordering comes from ARRIVAL order, not timestamps. `store.events` is oldest-first
 * because `ingest` appends, and both delivery paths are chronological — the WS stream
 * is live, and the backfill is `GET /api/events?limit=500` oldest-first
 * (websocketSource.ts). So within a group the origin hop is the FIRST occurrence in
 * the array, and a group is already in hop order. Timestamps can't do this job:
 * `hopTiming` in the Ktor plugin falls back to the request-scoped start when an engine
 * leaves requestTime/responseTime unset, so two hops can legitimately report the same
 * millisecond.
 */

/** HTTP events of one group, oldest-first (i.e. in `events` order). */
function groupsOf(events: readonly ArgusEvent[]): Map<string, HttpEvent[]> {
  const groups = new Map<string, HttpEvent[]>();
  for (const e of events) {
    if (!isHttpEvent(e)) continue;
    const gid = e.requestGroupId;
    if (gid == null) continue;
    const bucket = groups.get(gid);
    if (bucket) bucket.push(e);
    else groups.set(gid, [e]);
  }
  return groups;
}

/**
 * Maps each continuation hop's event id to the origin hop of its chain — the first
 * request that ran, before any redirect was followed.
 *
 * Only continuation hops appear as keys: the origin maps to nothing, and a group of
 * one (every non-redirected request) contributes no entries at all. Callers can
 * therefore treat "has an entry" as "this hop resulted from a redirect".
 */
export function buildRedirectOrigins(
  events: readonly ArgusEvent[],
): ReadonlyMap<string, HttpEvent> {
  const origins = new Map<string, HttpEvent>();
  for (const hops of groupsOf(events).values()) {
    if (hops.length < 2) continue;
    // hops is oldest-first, so the first entry arrived first.
    const origin = hops[0]!;
    for (let i = 1; i < hops.length; i++) {
      origins.set(hops[i]!.id, origin);
    }
  }
  return origins;
}

/**
 * Every hop of `event`'s chain, oldest-first, including `event` itself. Empty when
 * the event has no group id or its group holds a single hop — callers use that to
 * skip chain UI entirely rather than render a one-row list.
 */
export function redirectChain(
  events: readonly ArgusEvent[],
  event: HttpEvent,
): HttpEvent[] {
  const gid = event.requestGroupId;
  if (gid == null) return [];
  const hops = groupsOf(events).get(gid);
  if (hops == null || hops.length < 2) return [];
  return hops;
}
