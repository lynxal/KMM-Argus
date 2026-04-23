import { signal } from '@preact/signals-core';
import type { ArgusEvent, DeviceInfo } from './schema';
import type { ConnectionState, EventListener, EventSource } from './eventSource';
import { FIXTURE_DEVICE, FIXTURE_EVENTS } from '../dev/fixtures/events';

export interface MockSourceOptions {
  /** Replay speed multiplier vs fixture deltas. 1 = real-time, 8 = snappy dev. */
  readonly speed?: number;
  /**
   * `off`: stay connected the whole time.
   * `once`: drop the stream once, ~3s after start, reconnecting for 4s.
   * `double`: drop twice (once briefly, once > 15s to trigger `disconnected`).
   */
  readonly simulate?: 'off' | 'once' | 'double';
}

/**
 * Replays FIXTURE_EVENTS with deltas rebased to "now". `simulate` scripts a
 * few connection transitions so every state has a visible trigger during dev.
 *
 * @see design_handoff_argus_inspector/argus/data.js — original fixture.
 */
export function createMockSource(opts: MockSourceOptions = {}): EventSource {
  const speed = opts.speed ?? 8;
  const simulate = opts.simulate ?? 'off';

  const connection = signal<ConnectionState>('disconnected');
  const device = signal<DeviceInfo | null>(null);
  const lastSeenAt = signal<number | null>(null);
  const retryAt = signal<number | null>(null);

  const listeners = new Set<EventListener>();
  const timers: ReturnType<typeof setTimeout>[] = [];

  function emit(event: ArgusEvent): void {
    lastSeenAt.value = Date.now();
    for (const listener of listeners) listener(event);
  }

  async function connect(): Promise<void> {
    device.value = FIXTURE_DEVICE;
    connection.value = 'connected';
    lastSeenAt.value = Date.now();

    const firstTs = FIXTURE_EVENTS[0]?.timestamp ?? Date.now();
    const now = Date.now();
    const rebase = (e: ArgusEvent): ArgusEvent => ({
      ...e,
      timestamp: now + (e.timestamp - firstTs) / speed,
    });

    for (const raw of FIXTURE_EVENTS) {
      const rebased = rebase(raw);
      const delay = Math.max(0, rebased.timestamp - Date.now());
      timers.push(
        setTimeout(() => {
          if (connection.value === 'disconnected') return;
          emit(rebased);
        }, delay),
      );
    }

    if (simulate === 'once' || simulate === 'double') {
      timers.push(
        setTimeout(() => {
          connection.value = 'reconnecting';
          retryAt.value = Date.now() + 4000;
        }, 3000),
      );
      timers.push(
        setTimeout(() => {
          connection.value = 'connected';
          retryAt.value = null;
          lastSeenAt.value = Date.now();
        }, 7000),
      );
    }
    if (simulate === 'double') {
      timers.push(
        setTimeout(() => {
          connection.value = 'reconnecting';
          retryAt.value = Date.now() + 16000;
        }, 12000),
      );
      timers.push(
        setTimeout(() => {
          connection.value = 'disconnected';
        }, 28000),
      );
    }
  }

  function disconnect(): void {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    listeners.clear();
    connection.value = 'disconnected';
    retryAt.value = null;
  }

  async function clear(): Promise<void> {
    // Mock has no server-side buffer; UI store handles local clear.
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
