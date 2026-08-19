import {
  type ArgusEvent,
  type HttpEvent,
  type LogEvent,
  isHttpEvent,
  isLogEvent,
} from '../transport/schema';
import { redirectChain } from './redirects';

/**
 * "What else belongs with this event" — the two relationships the stream carries:
 *
 * - **`requestGroupId`** ties the hops of one redirect chain together (see redirects.ts).
 * - **`correlationId`** ties everything emitted inside one `withCorrelation { … }`
 *   scope together, HTTP calls and log lines alike. Stamped by the Ktor plugin from
 *   the coroutine context and by ArgusLoggerDelegate from its thread local, so it is
 *   present only for traffic emitted inside such a scope.
 *
 * Neither relationship implies adjacency: unrelated events are emitted in between, so
 * everything here matches on the id, never on position.
 */

/** Events sharing a non-null id with `event`, excluding `event` itself. */
function sameCorrelation(
  events: readonly ArgusEvent[],
  correlationId: string,
  selfId: string,
): ArgusEvent[] {
  return events.filter(
    (e) =>
      e.id !== selfId &&
      (isHttpEvent(e) || isLogEvent(e)) &&
      e.correlationId === correlationId,
  );
}

/**
 * Ids of the events related to `selectedId` — redirect chain-mates plus anything
 * sharing its correlationId — excluding the selection itself.
 *
 * Drives the linked-row highlight in the event list, which is how a related event
 * stays findable when it sits far from the selected row.
 */
export function linkedEventIds(
  events: readonly ArgusEvent[],
  selectedId: string | null,
): ReadonlySet<string> {
  if (selectedId == null) return new Set();
  const selected = events.find((e) => e.id === selectedId);
  if (selected == null) return new Set();

  const ids = new Set<string>();

  if (isHttpEvent(selected)) {
    for (const hop of redirectChain(events, selected)) {
      if (hop.id !== selectedId) ids.add(hop.id);
    }
  }

  const correlationId = (isHttpEvent(selected) || isLogEvent(selected))
    ? selected.correlationId
    : null;
  if (correlationId != null) {
    for (const e of sameCorrelation(events, correlationId, selectedId)) ids.add(e.id);
  }

  return ids;
}

export interface RelatedEvents {
  /** Group members other than the event asked about, in arrival order. */
  readonly events: ArgusEvent[];
  /**
   * The scope they were matched on, or null when the event carries none — in
   * which case there is nothing to relate and `events` is empty.
   */
  readonly correlationId: string | null;
}

/**
 * The rest of `event`'s correlation group — everything stamped with the same
 * correlationId, however far apart in time, minus `event` itself.
 *
 * Calls as well as logs. A group is a `withCorrelation { … }` scope, and the calls
 * made inside one are as much a part of what happened as the lines logged around
 * them; listing only the logs meant a log could never lead back to the call it ran
 * under, which is usually the more useful direction. Takes a log as readily as a
 * call — correlationId is stamped on both, so asking from any member is the same
 * question from a different starting point.
 *
 * There is deliberately no time-based fallback. This previously matched a ±500 ms
 * window centred on the event and never read correlationId at all, which invented
 * relationships (any log that happened to land in the window) and missed real ones
 * (a log from the same scope emitted while a slow call was still in flight). A
 * window answers "what else happened around now", which the event list already shows
 * — logs and HTTP calls share it — so guessing here only added a false signal.
 */
export function relatedEvents(
  events: readonly ArgusEvent[],
  event: HttpEvent | LogEvent,
): RelatedEvents {
  const correlationId = event.correlationId ?? null;
  if (correlationId == null) return { events: [], correlationId: null };
  return {
    events: sameCorrelation(events, correlationId, event.id),
    correlationId,
  };
}
