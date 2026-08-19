import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebsocketSource } from '../websocketSource';
import type { ArgusEvent } from '../schema';

/** Minimal stand-in for the browser WebSocket — tests drive the callbacks. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.onclose?.();
  }

  static get last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('no WebSocket was opened');
    return ws;
  }
}

const APP_INFO = { pkg: 'com.example.app', versionName: '1.0', device: 'Pixel', argusVersion: '1.0.0' };

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

/** Let queued microtasks (the awaits inside connect()) run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function makeSource() {
  // `scheme` is passed so the source never reads window.location — no DOM needed.
  return createWebsocketSource({ device: 'device.local:8787', scheme: 'http' });
}

describe('createWebsocketSource connection state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts in connecting, not disconnected', () => {
    vi.stubGlobal('fetch', vi.fn());

    expect(makeSource().connection.value).toBe('connecting');
  });

  it('stays connecting through the info + backfill round trips', async () => {
    let releaseBackfill: () => void = () => {};
    const backfillPending = new Promise<void>((resolve) => {
      releaseBackfill = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/info')) return jsonResponse(APP_INFO);
        await backfillPending;
        return jsonResponse([]);
      }),
    );

    const source = makeSource();
    void source.connect();
    await flush();

    // /api/info has landed, /api/events is still in flight.
    expect(source.device.value?.pkg).toBe('com.example.app');
    expect(source.connection.value).toBe('connecting');
    expect(FakeWebSocket.instances).toHaveLength(0);

    releaseBackfill();
    await flush();
    expect(source.connection.value).toBe('connecting');

    FakeWebSocket.last.onopen?.();
    expect(source.connection.value).toBe('connected');
    expect(source.lastSeenAt.value).not.toBeNull();
  });

  it('goes to reconnecting — never disconnected — when the cold attempt fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('unreachable'))));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const source = makeSource();
    void source.connect();
    await flush();

    expect(source.connection.value).toBe('connecting');

    FakeWebSocket.last.onclose?.();
    expect(source.connection.value).toBe('reconnecting');
    expect(source.retryAt.value).not.toBeNull();
  });

  it('reports disconnected only on an explicit teardown, keeping subscribers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => jsonResponse(url.includes('/api/info') ? APP_INFO : [])),
    );

    const source = makeSource();
    const seen: ArgusEvent[] = [];
    source.onEvent((e) => seen.push(e));

    void source.connect();
    await flush();
    FakeWebSocket.last.onopen?.();
    expect(source.connection.value).toBe('connected');

    source.disconnect();
    expect(source.connection.value).toBe('disconnected');

    // "Retry now" path: the store subscribed once at mount, so ingest must survive.
    void source.connect();
    await flush();
    expect(source.connection.value).toBe('connecting');
    FakeWebSocket.last.onopen?.();
    FakeWebSocket.last.onmessage?.({
      data: JSON.stringify({ type: 'event', event: { id: 'e1' } }),
    });

    expect(seen).toHaveLength(1);
    expect(source.connection.value).toBe('connected');
  });
});
