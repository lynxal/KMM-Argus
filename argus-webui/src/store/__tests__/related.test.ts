import { describe, expect, it } from 'vitest';
import { correlationGroup, linkedEventIds } from '../related';
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

describe('correlationGroup', () => {
  it('matches on correlationId regardless of how far apart in time', () => {
    const call = http('h1', 200, { correlation: 'trace-1', timestamp: 1_000 });
    const events: ArgusEvent[] = [
      call,
      log('near-but-unrelated', { timestamp: 1_010 }),
      log('far-but-correlated', { correlation: 'trace-1', timestamp: 90_000 }),
    ];

    const group = correlationGroup(events, call);

    expect(group.correlationId).toBe('trace-1');
    expect(group.events.map((e) => e.id)).toEqual(['h1', 'far-but-correlated']);
  });

  it('includes the calls in the scope, not only its logs', () => {
    // A withCorrelation { … } scope is one unit of work. Listing only its logs
    // meant a log could never lead back to the request it ran under.
    const first = http('h1', 200, { correlation: 'trace-1', timestamp: 1_000 });
    const second = http('h2', 200, { correlation: 'trace-1', timestamp: 1_003 });
    const line = log('l1', { correlation: 'trace-1', timestamp: 1_002 });
    const events: ArgusEvent[] = [first, line, second];

    expect(correlationGroup(events, line).events.map((e) => e.id)).toEqual(['h1', 'l1', 'h2']);
  });

  it('keeps the asking event, in arrival order, so its position is visible', () => {
    // The panel marks this one in place. Dropping it would leave the reader to
    // work out where they are in a list with a hole in it.
    const events: ArgusEvent[] = [
      http('h1', 200, { correlation: 'trace-1', timestamp: 1_000 }),
      log('l1', { correlation: 'trace-1', timestamp: 1_001 }),
      http('h2', 500, { correlation: 'trace-1', timestamp: 1_002 }),
      log('l2', { correlation: 'trace-1', timestamp: 1_003 }),
    ];
    const asking = events[1] as ArgusEvent;

    const group = correlationGroup(events, asking as never);

    expect(group.events.map((e) => e.id)).toEqual(['h1', 'l1', 'h2', 'l2']);
    expect(group.events.indexOf(asking)).toBe(1);
  });

  it('returns the event alone when nothing else shares its scope', () => {
    const call = http('h1', 200, { correlation: 'trace-1' });
    const events: ArgusEvent[] = [call, log('l1', { timestamp: 1_000 })];

    const group = correlationGroup(events, call);

    expect(group.correlationId).toBe('trace-1');
    expect(group.events.map((e) => e.id)).toEqual(['h1']);
  });

  it('answers for a log the same way it answers for a call', () => {
    // The relationship is symmetric, so a log can walk its own correlation group.
    // Selecting one member used to be a dead end: only calls could ask this.
    const call = http('h1', 200, { correlation: 'trace-1' });
    const first = log('l1', { correlation: 'trace-1', timestamp: 1_001 });
    const second = log('l2', { correlation: 'trace-1', timestamp: 1_002 });
    const events: ArgusEvent[] = [call, first, second, log('l3', { correlation: 'trace-9' })];

    expect(correlationGroup(events, first).events.map((e) => e.id)).toEqual(['h1', 'l1', 'l2']);
    expect(correlationGroup(events, call).events.map((e) => e.id)).toEqual(['h1', 'l1', 'l2']);
  });

  it('reports none for a log with no correlationId', () => {
    const orphan = log('l1', { timestamp: 1_000 });
    const events: ArgusEvent[] = [orphan, log('l2', { correlation: 'trace-1', timestamp: 1_000 })];

    const group = correlationGroup(events, orphan);

    expect(group.correlationId).toBeNull();
    expect(group.events).toEqual([]);
  });

  it('relates nothing without a correlationId — no time-window guessing', () => {
    // The events below are as close in time as they could be. Before correlationId
    // was read at all, a ±500 ms window would have reported every one of them.
    const call = http('h1', 200, { timestamp: 1_000 });
    const events: ArgusEvent[] = [
      call,
      log('same-ms', { timestamp: 1_000 }),
      log('1ms-later', { timestamp: 1_001 }),
      log('correlated-but-not-to-this-call', { correlation: 'trace-9', timestamp: 1_000 }),
    ];

    const group = correlationGroup(events, call);

    expect(group.correlationId).toBeNull();
    expect(group.events).toEqual([]);
  });
});
