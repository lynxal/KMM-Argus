import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventStore } from '../eventStore';
import type { ArgusEvent } from '../../transport/schema';

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
    // newest-first
    expect(store.events.value[0]!.id).toBe('e9');
    expect(store.events.value[4]!.id).toBe('e5');
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
    expect(store.events.value.map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('clears locally and supports undo within the window', () => {
    const store = createEventStore({ maxEvents: 100 });
    store.ingest(log(1));
    store.ingest(log(2));
    store.clearLocal();
    expect(store.events.value).toHaveLength(0);
    expect(store.undoClear()).toBe(true);
    expect(store.events.value.map((e) => e.id)).toEqual(['e2', 'e1']);
  });
});
