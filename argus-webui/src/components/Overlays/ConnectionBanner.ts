import { effect } from '@preact/signals-core';
import type { EventSource } from '../../transport/eventSource';
import { createIconEl } from '../Primitives/Primitives';

/**
 * 32px full-width banner, visible when connection !== 'connected'. Tinted
 * amber for reconnecting, red for disconnected (per README).
 */
export function createConnectionBanner({ source }: { source: EventSource }): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ds-banner flex items-center gap-2 px-3 border-b border-border-default text-xs font-ui';

  const icon = document.createElement('span');
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
    const c = source.connection.value;
    if (c === 'connected') {
      root.classList.add('hidden');
      root.classList.remove('flex');
      return;
    }
    root.classList.remove('hidden');
    root.classList.add('flex');
    icon.innerHTML = '';
    if (c === 'reconnecting') {
      root.className =
        'ds-banner flex items-center gap-2 px-3 border-b border-status-4xx-dot bg-status-4xx-bg text-status-4xx-fg text-xs font-ui';
      icon.appendChild(createIconEl('refresh', 12));
      msg.textContent = 'Reconnecting…';
    } else {
      root.className =
        'ds-banner flex items-center gap-2 px-3 border-b border-status-5xx-dot bg-status-5xx-bg text-status-5xx-fg text-xs font-ui';
      icon.appendChild(createIconEl('wifiOff', 12));
      msg.textContent = 'Disconnected. Last seen just now.';
    }
    const last = source.lastSeenAt.value;
    const retry = source.retryAt.value;
    meta.textContent = last
      ? `last seen ${new Date(last).toLocaleTimeString()}${retry ? ` · retry in ${Math.max(0, Math.round((retry - Date.now()) / 1000))}s` : ''}`
      : '';
  });

  return root;
}
