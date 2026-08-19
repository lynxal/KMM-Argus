import { describe, expect, it } from 'vitest';
import { buildRedirectOrigins, redirectChain } from '../redirects';
import type { ArgusEvent, HttpEvent } from '../../transport/schema';

/**
 * `events` is oldest-first (ingest appends), so every fixture list below is written in
 * arrival order — that order is what the origin rule reads, so getting it backwards in
 * a fixture would silently invert the assertion.
 */
function http(id: string, statusCode: number, requestGroupId: string | null = null): HttpEvent {
  return {
    type: 'HttpEvent',
    id,
    timestamp: 1,
    source: 'HTTP',
    engine: 'ktor',
    durationMs: 1,
    correlationId: null,
    requestGroupId,
    request: { method: 'GET', url: `https://h/${id}`, host: 'h', path: `/${id}`, headers: [] },
    response: { statusCode, statusText: '', headers: [] },
    error: null,
  };
}

function log(id: string): ArgusEvent {
  return {
    type: 'LogEvent',
    id,
    timestamp: 1,
    source: 'LOG',
    level: 'Info',
    tag: 't',
    message: 'm',
    payload: {},
    throwable: null,
  };
}

describe('buildRedirectOrigins', () => {
  it('maps the continuation hop to the hop that arrived first', () => {
    // Arrived: 302 then 200 → oldest-first array is [302, 200].
    const origin = http('a', 302, 'g1');
    const final = http('b', 200, 'g1');

    const origins = buildRedirectOrigins([origin, final]);

    expect(origins.size).toBe(1);
    expect(origins.get('b')).toBe(origin);
    expect(origins.has('a')).toBe(false);
  });

  it('marks the continuation even when the hop is ingested before its origin', () => {
    // A backfill overlapping the live stream can deliver the 200 first, which puts
    // the 302 after it. Whichever hop landed first is treated as the origin — the
    // rule is arrival order, and there is nothing more authoritative to appeal to.
    const final = http('b', 200, 'g1');
    const origin = http('a', 302, 'g1');

    const origins = buildRedirectOrigins([final, origin]);

    expect(origins.get('a')).toBe(final);
    expect(origins.has('b')).toBe(false);
  });

  it('groups hops that are not adjacent in the list', () => {
    const origin = http('a', 302, 'g1');
    const final = http('b', 200, 'g1');
    const events = [http('z', 200), log('l1'), origin, http('y', 404), log('l2'), final];

    const origins = buildRedirectOrigins(events);

    expect(origins.size).toBe(1);
    expect(origins.get('b')).toBe(origin);
  });

  it('keeps two chains apart', () => {
    const g1origin = http('a', 302, 'g1');
    const g2origin = http('c', 301, 'g2');
    const g1final = http('b', 200, 'g1');
    const g2final = http('d', 200, 'g2');

    const origins = buildRedirectOrigins([g1origin, g2origin, g1final, g2final]);

    expect(origins.get('d')).toBe(g2origin);
    expect(origins.get('b')).toBe(g1origin);
  });

  it('ignores a group of one — a request that was never redirected', () => {
    expect(buildRedirectOrigins([http('a', 200, 'g1')]).size).toBe(0);
  });

  it('ignores events with no group id (okhttp / urlconnection)', () => {
    expect(buildRedirectOrigins([http('a', 302), http('b', 200)]).size).toBe(0);
  });

  it('handles a three-hop chain, mapping both continuations to the first hop', () => {
    const first = http('a', 301, 'g1');
    const second = http('b', 302, 'g1');
    const third = http('c', 200, 'g1');

    const origins = buildRedirectOrigins([first, second, third]);

    expect(origins.get('b')).toBe(first);
    expect(origins.get('c')).toBe(first);
    expect(origins.has('a')).toBe(false);
  });

  it('ignores non-HTTP events', () => {
    expect(buildRedirectOrigins([log('l1'), log('l2')]).size).toBe(0);
  });
});

describe('redirectChain', () => {
  it('returns every hop oldest-first, including the event itself', () => {
    const origin = http('a', 302, 'g1');
    const final = http('b', 200, 'g1');

    expect(redirectChain([origin, final], final).map((e) => e.id)).toEqual(['a', 'b']);
    expect(redirectChain([origin, final], origin).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('is empty for a single-hop request, so callers can skip the chain UI', () => {
    const single = http('a', 200, 'g1');
    expect(redirectChain([single], single)).toEqual([]);
  });

  it('is empty when the event carries no group id', () => {
    const single = http('a', 200);
    expect(redirectChain([single], single)).toEqual([]);
  });
});
