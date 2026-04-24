import { effect } from '@preact/signals-core';
import type { EventSource } from '../../transport/eventSource';
import { createLogoMark } from '../Primitives/Primitives';

/**
 * Full-bleed empty state shown when the event list is empty and we're
 * connected — "Waiting for events". Shows the device address as a mono
 * chip that updates reactively once the /api/info handshake resolves.
 */
export function createWaitingForEvents({ source }: { source: EventSource }): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'self-stretch flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-fg-3 font-ui text-xs';

  const icon = createLogoMark(40);
  icon.classList.add('text-fg-muted', 'flex-none', 'block');
  icon.style.width = '40px';
  icon.style.height = '40px';

  const title = document.createElement('div');
  title.className = 'text-fg-1 text-base font-semibold';
  title.textContent = 'Waiting for events';

  const body = document.createElement('div');
  body.className = 'text-fg-2 text-xs max-w-md text-center';
  const bodyPrefix = document.createTextNode('Argus is listening on ');
  const addrChip = document.createElement('code');
  addrChip.className = 'font-mono px-1 rounded-xs bg-bg-subtle';
  addrChip.textContent = '…';
  const bodySuffix = document.createTextNode('. Make a request from your app to see it here.');
  body.append(bodyPrefix, addrChip, bodySuffix);

  // Reactive: update the chip text as soon as /api/info lands.
  effect(() => {
    const d = source.device.value;
    addrChip.textContent = d?.address ?? '…';
  });

  const hint = document.createElement('div');
  hint.className = 'text-fg-3 text-xs';
  hint.textContent = 'Press ? for shortcuts.';

  el.append(icon, title, body, hint);
  return el;
}
