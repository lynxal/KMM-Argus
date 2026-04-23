import { signal } from '@preact/signals-core';
import {
  ARGUS_SCHEMA_VERSION,
  type ArgusEvent,
  type DeviceInfo,
  type HelloFrame,
  type PingFrame,
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
 *   1. GET /argus/api/device → populate `device` signal.
 *   2. GET /argus/api/events?limit=500 → backfill (newest-first per spec).
 *   3. Open WS /argus/api/stream → first frame must be `Hello` with matching
 *      schemaVersion; subsequent frames are `ArgusEvent` or `Ping`.
 *
 * Heartbeat (from handoff README): gap > 3s flips to `reconnecting`; gap > 15s
 * flips to `disconnected`. Reconnect backs off exponentially capped at 10s.
 *
 * Not yet exercised end-to-end — `:argus-server-core` lands next prompt.
 */
export function createWebsocketSource(opts: WebsocketSourceOptions): EventSource {
  const { device: host } = opts;
  const scheme = opts.scheme ?? (window.location.protocol === 'https:' ? 'https' : 'http');
  const wsScheme = scheme === 'https' ? 'wss' : 'ws';
  const base = `${scheme}://${host}/argus/api`;
  const wsUrl = `${wsScheme}://${host}/argus/api/stream`;

  const connection = signal<ConnectionState>('disconnected');
  const device = signal<DeviceInfo | null>(null);
  const lastSeenAt = signal<number | null>(null);
  const retryAt = signal<number | null>(null);
  const listeners = new Set<EventListener>();

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectDelay = 500;

  function markSeen(): void {
    lastSeenAt.value = Date.now();
    if (connection.value !== 'connected') {
      connection.value = 'connected';
      retryAt.value = null;
      reconnectDelay = 500;
    }
  }

  function startHeartbeat(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      const last = lastSeenAt.value;
      if (last == null) return;
      const gap = Date.now() - last;
      if (gap > 15_000) connection.value = 'disconnected';
      else if (gap > 3_000 && connection.value === 'connected') {
        connection.value = 'reconnecting';
        retryAt.value = Date.now() + reconnectDelay;
      }
    }, 1_000);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function emitEvent(event: ArgusEvent): void {
    for (const listener of listeners) listener(event);
  }

  async function fetchDevice(): Promise<void> {
    const res = await fetch(`${base}/device`);
    if (!res.ok) throw new Error(`device fetch failed: ${res.status}`);
    device.value = (await res.json()) as DeviceInfo;
  }

  async function backfill(): Promise<void> {
    const res = await fetch(`${base}/events?limit=500`);
    if (!res.ok) return;
    const events = (await res.json()) as ArgusEvent[];
    for (const e of events) emitEvent(e);
  }

  function handleFrame(frame: StreamFrame): void {
    markSeen();
    if (frame.type === 'Hello') {
      const hello = frame as HelloFrame;
      if (hello.schemaVersion !== ARGUS_SCHEMA_VERSION) {
        console.error(
          `Argus schema mismatch: UI=${ARGUS_SCHEMA_VERSION}, server=${hello.schemaVersion}. Disconnecting.`,
        );
        disconnect();
      }
      return;
    }
    if (frame.type === 'Ping') {
      void (frame as PingFrame);
      return;
    }
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
      if (connection.value !== 'disconnected') scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose will fire next; let it handle retry.
    };
  }

  function scheduleReconnect(): void {
    connection.value = 'reconnecting';
    retryAt.value = Date.now() + reconnectDelay;
    setTimeout(() => {
      if (connection.value === 'disconnected') return;
      openStream();
      reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
    }, reconnectDelay);
  }

  async function connect(): Promise<void> {
    try {
      await fetchDevice();
      await backfill();
    } catch (err) {
      console.error('argus device handshake failed', err);
    }
    openStream();
    startHeartbeat();
  }

  function disconnect(): void {
    stopHeartbeat();
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
      await fetch(`${base}/clear`, { method: 'POST' });
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
