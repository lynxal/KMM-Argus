import type { EventSource } from '../../transport/eventSource';
import { createIconEl } from '../Primitives/Primitives';

/**
 * Full-bleed empty state shown when the event list is empty and we're
 * connected — "Waiting for events". Shows the device address as a mono chip
 * and a hint to press `?` for shortcuts.
 */
export function createWaitingForEvents({ source }: { source: EventSource }): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'h-full flex flex-col items-center justify-center gap-3 text-fg-3 font-ui text-xs';

  const icon = createIconEl('zap', 40, 1.25, 'text-fg-muted');
  const title = document.createElement('div');
  title.className = 'text-fg-1 text-base font-semibold';
  title.textContent = 'Waiting for events';

  const body = document.createElement('div');
  body.className = 'text-fg-2 text-xs max-w-md text-center';
  const dev = source.device.value;
  const addr = dev?.address ?? '…';
  body.innerHTML = `Argus is listening on <code class="font-mono px-1 rounded-xs bg-bg-subtle">${addr}</code>. Make a request from your app to see it here.`;

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-2';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'px-3 h-6 rounded-sm bg-accent-bg text-fg-on-accent text-xs font-ui cursor-pointer';
  copyBtn.textContent = 'Copy address';
  copyBtn.addEventListener('click', () => {
    if (dev?.address) void navigator.clipboard.writeText(dev.address).catch(() => undefined);
  });
  const docsBtn = document.createElement('button');
  docsBtn.type = 'button';
  docsBtn.className = 'px-3 h-6 rounded-sm bg-bg-subtle text-fg-1 text-xs font-ui cursor-pointer';
  docsBtn.textContent = 'Docs';
  actions.append(copyBtn, docsBtn);

  const hint = document.createElement('div');
  hint.className = 'text-fg-3 text-xs';
  hint.textContent = 'Press ? for shortcuts.';

  el.append(icon, title, body, actions, hint);
  return el;
}
