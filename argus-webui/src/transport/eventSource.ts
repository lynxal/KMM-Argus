import type { Signal } from '@preact/signals-core';
import type { ArgusEvent, DeviceInfo } from './schema';

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export type EventListener = (event: ArgusEvent) => void;

/**
 * Abstraction over the event stream. Two implementations:
 *  - websocketSource — real device via REST + WebSocket (used when ?device= is set).
 *  - mockSource — fixture replay for local dev (default).
 *
 * Connection-shape signals (connection, device, lastSeenAt, retryAt) live on
 * the source because they're tied to the transport. Events flow through a
 * listener callback — the store owns all display-side state (ring buffer,
 * pause, filters) so the source never needs to know about pausing.
 */
export interface EventSource {
  readonly connection: Signal<ConnectionState>;
  readonly device: Signal<DeviceInfo | null>;
  readonly lastSeenAt: Signal<number | null>;
  readonly retryAt: Signal<number | null>;

  /** Subscribe to events. Returns an unsubscribe function. */
  onEvent(listener: EventListener): () => void;

  connect(): Promise<void>;
  disconnect(): void;
  /** Clear the device-side ring buffer (and emit no echo; UI clears locally). */
  clear(): Promise<void>;
}
