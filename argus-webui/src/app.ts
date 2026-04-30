import { bindSource, createEventStore } from './store/eventStore';
import type { EventSource } from './transport/eventSource';
import { createMockSource, type MockSourceOptions } from './transport/mockSource';
import { createWebsocketSource } from './transport/websocketSource';
import { createShortcutBus, installKeyboard } from './input/keyboard';
import { createTopBar } from './components/TopBar/TopBar';
import { createFilterBar } from './components/FilterBar/FilterBar';
import { createSplitView } from './components/SplitView/SplitView';
import { createShortcutsModal } from './components/Overlays/ShortcutsModal';
import { createToast } from './components/Overlays/Toast';
import { createConnectionBanner } from './components/Overlays/ConnectionBanner';
import { createWaitingForEvents } from './components/EmptyStates/WaitingForEvents';
import { effect } from '@preact/signals-core';

/**
 * App shell. Resolves the event source from `?device=` / `?simulate=` / the
 * current page origin (when the webui is served by the Argus server itself),
 * builds the store, binds them, and mounts the shell.
 */
export function mountApp(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const deviceParam = params.get('device');
  const simulate = params.get('simulate');
  // Default to the current origin when the page is itself served by an Argus server
  // (e.g. http://<ip>:<port>/ served via argus-server-core's UI route). Falls back
  // to mock only when the page isn't served over http(s) or ?simulate= is explicit.
  const sameOrigin =
    simulate == null &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
    window.location.host.length > 0
      ? window.location.host
      : null;
  const device = deviceParam ?? sameOrigin;

  const store = createEventStore();
  const source: EventSource = device
    ? createWebsocketSource({ device })
    : createMockSource(resolveMockOpts(simulate));

  bindSource(store, source);
  const bus = createShortcutBus();
  installKeyboard(store, source, bus);

  void source.connect();

  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'min-h-screen flex flex-col bg-bg-app text-fg-1 font-ui';

  const topBar = createTopBar({ store, source, bus });
  const connectionBanner = createConnectionBanner({ source });
  const filterBar = createFilterBar({ store, bus });
  shell.append(topBar, connectionBanner, filterBar);

  const contentHost = document.createElement('div');
  contentHost.className = 'flex-1 min-h-0 flex';
  shell.appendChild(contentHost);

  const split = createSplitView({ store, bus });
  const waiting = createWaitingForEvents({ source });
  waiting.classList.add('flex-1');

  effect(() => {
    const empty = store.events.value.length === 0 && source.connection.value === 'connected';
    contentHost.innerHTML = '';
    contentHost.appendChild(empty ? waiting : split);
  });

  const shortcuts = createShortcutsModal({ bus });
  const toast = createToast({ bus });
  root.appendChild(shell);
  root.appendChild(shortcuts);
  root.appendChild(toast);
}

function resolveMockOpts(simulate: string | null): MockSourceOptions {
  if (simulate === 'reconnect') return { simulate: 'double', speed: 1 };
  if (simulate === 'once') return { simulate: 'once', speed: 1 };
  return { simulate: 'off', speed: 4 };
}
