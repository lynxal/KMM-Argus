import type { ConnectionState } from '../../transport/eventSource';

/** Token-backed tone map for the connection pill — text + dot per state. */
export const CONN_TONE: Record<
  ConnectionState,
  { dot: 'ok' | 'reco' | 'off' | 'wait'; text: string; className: string }
> = {
  connecting: { dot: 'wait', text: 'Connecting…', className: 'text-conn-off-fg' },
  connected: { dot: 'ok', text: 'Connected', className: 'text-conn-ok-fg' },
  reconnecting: { dot: 'reco', text: 'Reconnecting…', className: 'text-conn-reco-fg' },
  disconnected: { dot: 'off', text: 'Disconnected', className: 'text-conn-off-fg' },
};

export const VIEW_LABELS = [
  ['list', 'List'],
  ['split', 'Split'],
  ['waterfall', 'Waterfall'],
] as const;
