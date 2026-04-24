import { signal } from '@preact/signals-core';
import {
  ARGUS_SCHEMA_VERSION,
  type ArgusEvent,
  type DeviceInfo,
  type EventFrame,
  type HelloFrame,
  type ServerAppInfo,
  type StreamFrame,
} from './schema';
import type { ConnectionState, EventListener, EventSource } from './eventSource';

export interface WebsocketSourceOptions {
  /** e.g. "192.168.1.42:9090" — the device's Ktor server. */
  readonly device: string;
  /**
   * Override `http` / `ws` scheme. Defaults to window.location.protocol on
   * production, `http`/`ws` on localhost dev.
   */
  readonly scheme?: 'http' | 'https';
}

/**
 * Real transport. On `connect()`:
 *   1. GET /api/info → populate `device` signal (mapped from ServerAppInfo).
 *   2. GET /api/events?limit=500 → backfill (oldest-first as stored).
 *   3. Open WS /ws → first frame must be `hello` with matching schemaVersion;
 *      subsequent frames are `event` envelopes or `cleared`.
 *
 * Connection state is driven by ws.onopen / ws.onclose; no idle timeout since
 * the server sends no keepalive Ping frames (Ktor's WebSocket protocol-level
 * ping/pong keeps the TCP connection alive without surfacing a JS event).
 * Reconnect backs off exponentially capped at 10s.
 */
export function createWebsocketSource(opts: WebsocketSourceOptions): EventSource {
  const { device: host } = opts;
  const scheme = opts.scheme ?? (window.location.protocol === 'https:' ? 'https' : 'http');
  const wsScheme = scheme === 'https' ? 'wss' : 'ws';
  const base = `${scheme}://${host}`;
  const wsUrl = `${wsScheme}://${host}/ws`;

  const connection = signal<ConnectionState>('disconnected');
  const device = signal<DeviceInfo | null>(null);
  const lastSeenAt = signal<number | null>(null);
  const retryAt = signal<number | null>(null);
  const listeners = new Set<EventListener>();

  let ws: WebSocket | null = null;
  let reconnectDelay = 500;
  let shutdown = false;

  function markSeen(): void {
    lastSeenAt.value = Date.now();
    if (connection.value !== 'connected') {
      connection.value = 'connected';
      retryAt.value = null;
      reconnectDelay = 500;
    }
  }

  function emitEvent(event: ArgusEvent): void {
    for (const listener of listeners) listener(event);
  }

  function mapAppInfo(info: ServerAppInfo): DeviceInfo {
    return {
      name: info.device || info.pkg,
      address: host,
      platform: 'android',
      version: info.versionName,
      pkg: info.pkg,
    };
  }

  async function fetchDevice(): Promise<void> {
    const res = await fetch(`${base}/api/info`);
    if (!res.ok) throw new Error(`info fetch failed: ${res.status}`);
    const info = (await res.json()) as ServerAppInfo;
    device.value = mapAppInfo(info);
  }

  async function backfill(): Promise<void> {
    const res = await fetch(`${base}/api/events?limit=500`);
    if (!res.ok) return;
    const events = (await res.json()) as ArgusEvent[];
    for (const e of events) emitEvent(e);
  }

  function handleFrame(frame: StreamFrame): void {
    markSeen();
    if (frame.type === 'hello') {
      const hello = frame as HelloFrame;
      if (hello.schemaVersion !== ARGUS_SCHEMA_VERSION) {
        console.error(
          `Argus schema mismatch: UI=${ARGUS_SCHEMA_VERSION}, server=${hello.schemaVersion}. Disconnecting.`,
        );
        disconnect();
      } else {
        device.value = mapAppInfo(hello.info);
      }
      return;
    }
    if (frame.type === 'event') {
      emitEvent((frame as EventFrame).event);
      return;
    }
    if (frame.type === 'cleared') {
      // UI store owns clear semantics locally; nothing to do here besides the lastSeen update above.
      return;
    }
    // Back-compat: if a future server ever sends flat events, handle them too.
    emitEvent(frame);
  }

  function openStream(): void {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => markSeen();
    ws.onmessage = (e) => {
      try {
        handleFrame(JSON.parse(e.data) as StreamFrame);
      } catch (err) {
        console.error('stream frame decode failed', err);
      }
    };
    ws.onclose = () => {
      ws = null;
      if (!shutdown) scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose will fire next; let it handle retry.
    };
  }

  function scheduleReconnect(): void {
    connection.value = 'reconnecting';
    retryAt.value = Date.now() + reconnectDelay;
    setTimeout(() => {
      if (shutdown) return;
      openStream();
      reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
    }, reconnectDelay);
  }

  async function connect(): Promise<void> {
    shutdown = false;
    try {
      await fetchDevice();
      await backfill();
    } catch (err) {
      console.error('argus device handshake failed', err);
    }
    openStream();
  }

  function disconnect(): void {
    shutdown = true;
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    listeners.clear();
    connection.value = 'disconnected';
    retryAt.value = null;
  }

  async function clear(): Promise<void> {
    try {
      await fetch(`${base}/api/events`, { method: 'DELETE' });
    } catch (err) {
      console.error('argus clear failed', err);
    }
  }

  return {
    connection,
    device,
    lastSeenAt,
    retryAt,
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    disconnect,
    clear,
  };
}
