import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventStore } from '../eventStore';
import type { ArgusEvent } from '../../transport/schema';

function http(
  id: string,
  statusCode: number,
  durationMs: number,
  requestGroupId: string | null = null,
): ArgusEvent {
  return {
    type: 'HttpEvent',
    id,
    timestamp: 1,
    source: 'HTTP',
    engine: 'ktor',
    durationMs,
    correlationId: null,
    requestGroupId,
    request: { method: 'GET', url: 'https://h/200', host: 'h', path: '/200', headers: [], body: null },
    response: { statusCode, statusText: '', headers: [], bodyPreview: null, bodyTruncatedTotalBytes: null, contentType: null, sizeBytes: 0 },
    error: null,
  } as unknown as ArgusEvent;
}

function log(id: number): ArgusEvent {
  return {
    type: 'LogEvent',
    id: `e${id}`,
    timestamp: id,
    source: 'LOG',
    level: 'Info',
    tag: 't',
    message: `m${id}`,
    payload: {},
    throwable: null,
  };
}

beforeEach(() => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    length: 0,
    key: () => null,
  } as Storage;
  (globalThis as unknown as { matchMedia: typeof matchMedia }).matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof matchMedia;
  globalThis.document = {
    documentElement: { classList: { toggle: vi.fn() } },
  } as unknown as Document;
});

describe('createEventStore', () => {
  it('caps the ring buffer at maxEvents', () => {
    const store = createEventStore({ maxEvents: 5 });
    for (let i = 0; i < 10; i++) store.ingest(log(i));
    expect(store.events.value).toHaveLength(5);
    // oldest-first: the cap evicts from the front, so the OLDEST five are gone
    expect(store.events.value[0]!.id).toBe('e5');
    expect(store.events.value[4]!.id).toBe('e9');
  });

  it('caps the paused buffer at maxEvents, dropping the oldest', () => {
    const store = createEventStore({ maxEvents: 3 });
    store.pause();
    for (let i = 0; i < 6; i++) store.ingest(log(i));
    expect(store.pausedBuffer.value.map((e) => e.id)).toEqual(['e3', 'e4', 'e5']);
    store.resume();
    expect(store.events.value.map((e) => e.id)).toEqual(['e3', 'e4', 'e5']);
  });

  it('buffers while paused and drains on resume preserving order', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.pause();
    store.ingest(log(2));
    store.ingest(log(3));
    expect(store.events.value).toHaveLength(1);
    expect(store.pausedBuffer.value).toHaveLength(2);
    store.resume();
    expect(store.paused.value).toBe(false);
    expect(store.pausedBuffer.value).toHaveLength(0);
    expect(store.events.value.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('collapses a repeat of an id it already holds into one entry', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.ingest(log(2));
    // Same event redelivered — backfill GET overlapping the live WS stream.
    store.ingest(log(1));
    expect(store.events.value.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('keeps the later copy when one id arrives twice, in its original position', () => {
    // A redirected Ktor request emits one event per hop, both carrying the id
    // minted for the first hop: 302 then the real 200.
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(http('r1', 302, 500));
    store.ingest(log(9));
    store.ingest(http('r1', 200, 900));
    const ids = store.events.value.map((e) => e.id);
    expect(ids).toEqual(['r1', 'e9']);
    const kept = store.events.value.find((e) => e.id === 'r1') as unknown as {
      response: { statusCode: number };
      durationMs: number;
    };
    expect(kept.response.statusCode).toBe(200);
    expect(kept.durationMs).toBe(900);
  });

  it('dedupes across the paused buffer', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.pause();
    store.ingest(log(1));
    store.ingest(log(2));
    expect(store.pausedBuffer.value.map((e) => e.id)).toEqual(['e2']);
    store.resume();
    expect(store.events.value.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('replaces inside the paused buffer while paused', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.pause();
    store.ingest(http('r1', 302, 500));
    store.ingest(http('r1', 200, 900));
    expect(store.pausedBuffer.value.map((e) => e.id)).toEqual(['r1']);
    expect((store.pausedBuffer.value[0] as unknown as { durationMs: number }).durationMs).toBe(900);
  });

  it('accepts an id again once it has been evicted by the cap', () => {
    const store = createEventStore({ maxEvents: 3 });
    for (let i = 0; i < 3; i++) store.ingest(log(i));
    store.ingest(log(3)); // evicts e0
    expect(store.events.value.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    store.ingest(log(0)); // e0 is no longer held, so it is a new event again
    expect(store.events.value.map((e) => e.id)).toEqual(['e2', 'e3', 'e0']);
  });

  it('re-ingests after a clear, and undo restores dedup state', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.clearLocal();
    store.ingest(log(1));
    expect(store.events.value.map((e) => e.id)).toEqual(['e1']);

    const store2 = createEventStore({ maxEvents: 100 });
    store2.ingest(log(1));
    store2.clearLocal();
    expect(store2.undoClear()).toBe(true);
    store2.ingest(log(1));
    expect(store2.events.value.map((e) => e.id)).toEqual(['e1']);
  });

  it('clears locally and supports undo within the window', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.ingest(log(2));
    store.clearLocal();
    expect(store.events.value).toHaveLength(0);
    expect(store.undoClear()).toBe(true);
    expect(store.events.value.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

function httpWith(id: string, statusCode: number, extra: Record<string, unknown>): ArgusEvent {
  return { ...http(id, statusCode, 1), ...extra } as unknown as ArgusEvent;
}

function logWith(id: string, correlationId: string): ArgusEvent {
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
    correlationId,
  } as ArgusEvent;
}

describe('redirect chains', () => {
  /** Ingested in arrival order: the 302 hop, an unrelated call, then the 200 hop. */
  function storeWithChain() {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(http('a', 302, 508, 'g1'));
    store.ingest(http('unrelated', 200, 42));
    store.ingest(http('b', 200, 356, 'g1'));
    return store;
  }

  it('marks the continuation hop and not the origin', () => {
    const store = storeWithChain();
    expect(store.redirectOrigins.value.get('b')?.id).toBe('a');
    expect(store.redirectOrigins.value.has('a')).toBe(false);
    expect(store.redirectOrigins.value.has('unrelated')).toBe(false);
  });

  it('links the chain in both directions, excluding the selection itself', () => {
    const store = storeWithChain();

    store.selectedId.value = 'a';
    expect([...store.linkedIds.value]).toEqual(['b']);

    store.selectedId.value = 'b';
    expect([...store.linkedIds.value]).toEqual(['a']);
  });

  it('links nothing when there is no selection or the selection has no chain', () => {
    const store = storeWithChain();

    expect(store.linkedIds.value.size).toBe(0);

    store.selectedId.value = 'unrelated';
    expect(store.linkedIds.value.size).toBe(0);
  });

  it('links events sharing a correlationId, in both directions', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(httpWith('call', 200, { correlationId: 'trace-1' }));
    store.ingest(log(1));
    store.ingest(logWith('scoped', 'trace-1'));

    store.selectedId.value = 'call';
    expect([...store.linkedIds.value]).toEqual(['scoped']);

    store.selectedId.value = 'scoped';
    expect([...store.linkedIds.value]).toEqual(['call']);
  });

  it('forgets the chain when the list is cleared', () => {
    const store = storeWithChain();
    store.selectedId.value = 'b';
    store.clearLocal();

    expect(store.redirectOrigins.value.size).toBe(0);
    expect(store.linkedIds.value.size).toBe(0);
  });
});
