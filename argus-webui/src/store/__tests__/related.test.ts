import { describe, expect, it } from 'vitest';
import { linkedEventIds, relatedLogEvents, RELATED_LOG_WINDOW_MS } from '../related';
import type { ArgusEvent, HttpEvent, LogEvent } from '../../transport/schema';

/** `events` is oldest-first (ingest appends), so fixtures are written in arrival order. */
function http(
  id: string,
  statusCode: number,
  opts: { group?: string | null; correlation?: string | null; timestamp?: number } = {},
): HttpEvent {
  return {
    type: 'HttpEvent',
    id,
    timestamp: opts.timestamp ?? 1_000,
    source: 'HTTP',
    engine: 'ktor',
    durationMs: 1,
    correlationId: opts.correlation ?? null,
    requestGroupId: opts.group ?? null,
    request: { method: 'GET', url: `https://h/${id}`, host: 'h', path: `/${id}`, headers: [] },
    response: { statusCode, statusText: '', headers: [] },
    error: null,
  };
}

function log(
  id: string,
  opts: { correlation?: string | null; timestamp?: number } = {},
): LogEvent {
  return {
    type: 'LogEvent',
    id,
    timestamp: opts.timestamp ?? 1_000,
    source: 'LOG',
    level: 'Info',
    tag: 't',
    message: `m-${id}`,
    payload: {},
    throwable: null,
    correlationId: opts.correlation ?? null,
  };
}

describe('linkedEventIds', () => {
  it('is the redirect chain minus the selection, in both directions', () => {
    const origin = http('a', 302, { group: 'g1' });
    const final = http('b', 200, { group: 'g1' });
    const events: ArgusEvent[] = [origin, http('z', 200), final];

    expect([...linkedEventIds(events, 'a')]).toEqual(['b']);
    expect([...linkedEventIds(events, 'b')]).toEqual(['a']);
  });

  it('links everything sharing a correlationId, HTTP and log alike', () => {
    const events: ArgusEvent[] = [
      log('l1', { correlation: 'trace-1' }),
      http('h1', 200, { correlation: 'trace-1' }),
      log('l2', { correlation: 'other' }),
      http('h2', 200),
      log('l3', { correlation: 'trace-1' }),
    ];

    expect([...linkedEventIds(events, 'h1')].sort()).toEqual(['l1', 'l3']);
    // Selecting a log links back to the call and the scope's other logs.
    expect([...linkedEventIds(events, 'l1')].sort()).toEqual(['h1', 'l3']);
  });

  it('unions the redirect chain with the correlation scope', () => {
    const origin = http('a', 302, { group: 'g1', correlation: 'trace-1' });
    const final = http('b', 200, { group: 'g1', correlation: 'trace-1' });
    const events: ArgusEvent[] = [origin, log('l1', { correlation: 'trace-1' }), final];

    expect([...linkedEventIds(events, 'a')].sort()).toEqual(['b', 'l1']);
  });

  it('never links an event to itself', () => {
    const events: ArgusEvent[] = [http('a', 200, { correlation: 'trace-1' })];
    expect(linkedEventIds(events, 'a').size).toBe(0);
  });

  it('links nothing without a selection, for an unknown id, or with no relationship', () => {
    const events: ArgusEvent[] = [http('a', 200, { group: 'g1' }), log('l1')];
    expect(linkedEventIds(events, null).size).toBe(0);
    expect(linkedEventIds(events, 'nope').size).toBe(0);
    expect(linkedEventIds(events, 'a').size).toBe(0);
    expect(linkedEventIds(events, 'l1').size).toBe(0);
  });

  it('does not treat a null correlationId as a shared one', () => {
    const events: ArgusEvent[] = [http('a', 200), log('l1'), log('l2')];
    expect(linkedEventIds(events, 'a').size).toBe(0);
  });
});

describe('relatedLogEvents', () => {
  it('matches on correlationId regardless of how far apart in time', () => {
    const call = http('h1', 200, { correlation: 'trace-1', timestamp: 1_000 });
    const events: ArgusEvent[] = [
      call,
      log('near-but-unrelated', { timestamp: 1_010 }),
      log('far-but-correlated', { correlation: 'trace-1', timestamp: 90_000 }),
    ];

    const related = relatedLogEvents(events, call);

    expect(related.matchedBy).toBe('correlationId');
    expect(related.correlationId).toBe('trace-1');
    expect(related.logs.map((l) => l.id)).toEqual(['far-but-correlated']);
  });

  it('reports no logs rather than falling back when a correlated call has none', () => {
    const call = http('h1', 200, { correlation: 'trace-1' });
    const events: ArgusEvent[] = [call, log('l1', { timestamp: 1_000 })];

    const related = relatedLogEvents(events, call);

    expect(related.matchedBy).toBe('correlationId');
    expect(related.logs).toEqual([]);
  });

  it('falls back to the time window only when the call has no correlationId', () => {
    const call = http('h1', 200, { timestamp: 1_000 });
    const events: ArgusEvent[] = [
      call,
      log('inside', { timestamp: 1_000 + RELATED_LOG_WINDOW_MS }),
      log('outside', { timestamp: 1_000 + RELATED_LOG_WINDOW_MS + 1 }),
      log('before', { timestamp: 1_000 - RELATED_LOG_WINDOW_MS }),
    ];

    const related = relatedLogEvents(events, call);

    expect(related.matchedBy).toBe('time');
    expect(related.correlationId).toBeNull();
    expect(related.logs.map((l) => l.id)).toEqual(['inside', 'before']);
  });
});
