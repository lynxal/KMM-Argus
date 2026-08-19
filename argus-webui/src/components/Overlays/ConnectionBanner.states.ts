import type { ConnectionState } from '../../transport/eventSource';

export type BannerDot = 'wait' | 'reco' | 'off';
export type BannerIcon = 'refresh' | 'wifiOff';

export interface BannerInput {
  readonly connection: ConnectionState;
  readonly lastSeenAt: number | null;
  readonly retryAt: number | null;
  /** True once /api/info has landed — i.e. the backfill is the step in flight. */
  readonly hasDevice: boolean;
  readonly now: number;
}

export interface BannerState {
  readonly hidden: boolean;
  readonly className: string;
  readonly dot: BannerDot | null;
  readonly icon: BannerIcon | null;
  readonly message: string;
  readonly meta: string;
  readonly showRetry: boolean;
}

const BASE = 'ds-banner flex items-center gap-2 px-3 border-b text-xs font-ui';

const TONES: Record<Exclude<ConnectionState, 'connected'>, string> = {
  // Neutral: connecting is progress, not a failure.
  connecting: 'border-border-default bg-bg-overlay text-fg-2',
  reconnecting: 'border-status-4xx-dot bg-status-4xx-bg text-status-4xx-fg',
  disconnected: 'border-status-5xx-dot bg-status-5xx-bg text-status-5xx-fg',
};

/** "last seen 14:22:10 · retry in 2s" — each part independent, both optional. */
function formatMeta(lastSeenAt: number | null, retryAt: number | null, now: number): string {
  const parts: string[] = [];
  if (lastSeenAt) parts.push(`last seen ${new Date(lastSeenAt).toLocaleTimeString()}`);
  if (retryAt) parts.push(`retry in ${Math.max(0, Math.round((retryAt - now) / 1000))}s`);
  return parts.join(' · ');
}

/**
 * Pure presentation map for the connection banner. Split out so it can be
 * unit-tested without a DOM (Vitest runs in the node environment here).
 */
export function bannerState(input: BannerInput): BannerState {
  const { connection, lastSeenAt, retryAt, hasDevice, now } = input;

  if (connection === 'connected') {
    return {
      hidden: true,
      className: BASE,
      dot: null,
      icon: null,
      message: '',
      meta: '',
      showRetry: false,
    };
  }

  const className = `${BASE} ${TONES[connection]}`;

  if (connection === 'connecting') {
    return {
      hidden: false,
      className,
      dot: 'wait',
      icon: null,
      message: hasDevice ? 'Loading recent events…' : 'Connecting…',
      meta: '',
      showRetry: false,
    };
  }

  if (connection === 'reconnecting') {
    return {
      hidden: false,
      className,
      dot: null,
      icon: 'refresh',
      message: 'Reconnecting…',
      meta: formatMeta(lastSeenAt, retryAt, now),
      showRetry: true,
    };
  }

  return {
    hidden: false,
    className,
    dot: null,
    icon: 'wifiOff',
    message: lastSeenAt
      ? 'Disconnected. Reconnect to resume the stream.'
      : 'Disconnected. Could not reach the device.',
    meta: formatMeta(lastSeenAt, retryAt, now),
    showRetry: true,
  };
}
