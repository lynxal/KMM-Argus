import { effect } from '@preact/signals-core';
import type { EventSource } from '../../transport/eventSource';
import { createConnDot, createIconEl } from '../Primitives/Primitives';
import { bannerState } from './ConnectionBanner.states';

/**
 * 32px full-width banner, visible when connection !== 'connected'. Neutral
 * while connecting, amber for reconnecting, red for disconnected (per README).
 * Tone and copy come from `bannerState` so they can be tested without a DOM.
 */
export function createConnectionBanner({ source }: { source: EventSource }): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ds-banner flex items-center gap-2 px-3 border-b border-border-default text-xs font-ui';

  const icon = document.createElement('span');
  icon.className = 'flex items-center';
  const msg = document.createElement('span');
  msg.className = 'flex-1 truncate';
  const meta = document.createElement('span');
  meta.className = 'font-mono text-xs';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'px-2 h-5 rounded-sm bg-bg-overlay border border-border-default text-fg-1 cursor-pointer hover:bg-bg-hover';
  retryBtn.textContent = 'Retry now';
  retryBtn.addEventListener('click', () => {
    source.disconnect();
    void source.connect();
  });

  root.append(icon, msg, meta, retryBtn);

  effect(() => {
    const state = bannerState({
      connection: source.connection.value,
      lastSeenAt: source.lastSeenAt.value,
      retryAt: source.retryAt.value,
      hasDevice: source.device.value !== null,
      now: Date.now(),
    });

    // `hidden` is how ui-probe.js detects the connected state — keep the toggle.
    root.classList.toggle('hidden', state.hidden);
    if (state.hidden) {
      root.classList.remove('flex');
      return;
    }
    root.className = state.className;

    if (state.dot) icon.replaceChildren(createConnDot(state.dot));
    else if (state.icon) icon.replaceChildren(createIconEl(state.icon, 12));
    else icon.replaceChildren();

    msg.textContent = state.message;
    meta.textContent = state.meta;
    retryBtn.classList.toggle('hidden', !state.showRetry);
  });

  return root;
}
