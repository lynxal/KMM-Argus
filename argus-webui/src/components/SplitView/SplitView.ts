import { effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import { createEventList } from '../EventList/EventList';
import { createEventDetail } from '../EventDetail/EventDetail';
import { createWaterfall } from '../Waterfall/Waterfall';

export interface SplitViewProps {
  readonly store: EventStore;
}

/**
 * Content area that switches layout between List / Split / Waterfall. Panels
 * are built lazily on first entry to each view, then reused. Selection syncs
 * across all three because every child reads the same `store.selectedId`.
 *
 * @see design_handoff_argus_inspector/argus/Inspector.jsx — the shell that
 *      composes these in the React reference.
 */
export function createSplitView({ store }: SplitViewProps): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flex-1 p-2 flex gap-2 min-h-0';

  const list = createEventList({ store });
  list.classList.add('flex-1');
  const detail = createEventDetail({ store });
  detail.classList.add('flex-1');
  const waterfall = createWaterfall({ store });
  waterfall.classList.add('flex-[2]');

  const narrowList = createEventList({ store });
  narrowList.classList.add('w-80', 'flex-none');

  effect(() => {
    root.innerHTML = '';
    switch (store.view.value) {
      case 'list':
        root.appendChild(list);
        list.classList.remove('w-80', 'flex-none');
        list.classList.add('flex-1');
        break;
      case 'split':
        list.classList.remove('w-80', 'flex-none');
        list.classList.add('flex-1');
        root.append(list, detail);
        break;
      case 'waterfall':
        root.append(narrowList, waterfall);
        break;
    }
  });

  return root;
}
