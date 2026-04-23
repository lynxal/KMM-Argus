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
 * App shell. Resolves the event source from `?device=` / `?simulate=`,
 * builds the store, binds them, and mounts the shell. Remaining tasks
 * flesh out FilterBar, EventList, EventDetail, Waterfall, and Overlays.
 */
export function mountApp(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const device = params.get('device');
  const simulate = params.get('simulate');

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
  const filterBar = createFilterBar({ store });
  shell.append(topBar, connectionBanner, filterBar);

  const contentHost = document.createElement('div');
  contentHost.className = 'flex-1 min-h-0 flex';
  shell.appendChild(contentHost);

  const split = createSplitView({ store });
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
