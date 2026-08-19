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

/** Fallback window when an event carries no correlationId. */
export const RELATED_LOG_WINDOW_MS = 500;

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

export interface RelatedLogs {
  readonly logs: LogEvent[];
  /**
   * How the match was made. `correlationId` is exact; `time` is the heuristic used
   * when the event was emitted outside any correlation scope.
   */
  readonly matchedBy: 'correlationId' | 'time';
  /** The id matched on, when `matchedBy` is `correlationId`. */
  readonly correlationId: string | null;
}

/**
 * Log events belonging to `event`.
 *
 * Prefers the exact relationship: when the event carries a correlationId, only logs
 * stamped with the same id count, however far apart in time they are. The ±500 ms
 * window is the fallback for traffic emitted outside any `withCorrelation` scope —
 * it was previously the *only* rule, which both invented relationships (any log that
 * happened to land in the window) and missed real ones (a log from the same scope
 * emitted while a slow call was still in flight).
 */
export function relatedLogEvents(
  events: readonly ArgusEvent[],
  event: HttpEvent,
): RelatedLogs {
  const correlationId = event.correlationId ?? null;
  if (correlationId != null) {
    const logs = sameCorrelation(events, correlationId, event.id).filter(isLogEvent);
    return { logs, matchedBy: 'correlationId', correlationId };
  }
  const logs = events.filter(
    (e): e is LogEvent =>
      isLogEvent(e) && Math.abs(e.timestamp - event.timestamp) <= RELATED_LOG_WINDOW_MS,
  );
  return { logs, matchedBy: 'time', correlationId: null };
}
