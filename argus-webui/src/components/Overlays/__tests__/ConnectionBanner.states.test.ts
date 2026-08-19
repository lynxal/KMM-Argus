import { describe, expect, it } from 'vitest';
import { bannerState } from '../ConnectionBanner.states';

const NOW = 1_700_000_000_000;

function state(over: Partial<Parameters<typeof bannerState>[0]> = {}) {
  return bannerState({
    connection: 'connecting',
    lastSeenAt: null,
    retryAt: null,
    hasDevice: false,
    now: NOW,
    ...over,
  });
}

describe('bannerState', () => {
  it('hides the banner when connected', () => {
    const s = state({ connection: 'connected' });

    expect(s.hidden).toBe(true);
    expect(s.message).toBe('');
  });

  it('shows a neutral connecting state before the handshake resolves', () => {
    const s = state({ connection: 'connecting' });

    expect(s.hidden).toBe(false);
    expect(s.message).toBe('Connecting…');
    expect(s.dot).toBe('wait');
    expect(s.className).not.toContain('status-5xx');
    expect(s.className).not.toContain('status-4xx');
    expect(s.showRetry).toBe(false);
  });

  it('names the backfill once device info has landed', () => {
    const s = state({ connection: 'connecting', hasDevice: true });

    expect(s.message).toBe('Loading recent events…');
    expect(s.className).not.toContain('status-5xx');
  });

  it('claims no last-seen time on a cold-start failure but still counts down', () => {
    const s = state({ connection: 'disconnected', lastSeenAt: null, retryAt: NOW + 2000 });

    expect(s.message).toBe('Disconnected. Could not reach the device.');
    expect(s.meta).not.toContain('last seen');
    expect(s.meta).toBe('retry in 2s');
  });

  it('reports the last-seen time once there has been a connection', () => {
    const s = state({ connection: 'disconnected', lastSeenAt: NOW - 5000 });

    expect(s.message).toBe('Disconnected. Reconnect to resume the stream.');
    expect(s.meta).toContain('last seen');
    expect(s.className).toContain('status-5xx');
  });

  it('keeps reconnecting amber with the retry countdown', () => {
    const s = state({ connection: 'reconnecting', lastSeenAt: NOW - 5000, retryAt: NOW + 4000 });

    expect(s.message).toBe('Reconnecting…');
    expect(s.icon).toBe('refresh');
    expect(s.className).toContain('status-4xx');
    expect(s.meta).toContain('retry in 4s');
    expect(s.showRetry).toBe(true);
  });
});
