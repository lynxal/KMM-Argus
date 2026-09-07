import { effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { ShortcutBus } from '../../input/keyboard';
import { createEventList } from '../EventList/EventList';
import { createEventDetail } from '../EventDetail/EventDetail';
import { createWaterfall } from '../Waterfall/Waterfall';
import { createSplitter } from './Splitter';
import { clampListWidth } from './SplitView.states';

export interface SplitViewProps {
  readonly store: EventStore;
  readonly bus: ShortcutBus;
}

/** Mirrors the root's `p-2`, so `available()` reports the flex row's content width. */
const ROOT_PADDING = 16;

/**
 * Content area that switches layout between List / Split / Waterfall. Panels
 * are built lazily on first entry to each view, then reused. Selection syncs
 * across all three because every child reads the same `store.selectedId`.
 *
 * @see design_handoff_argus_inspector/argus/Inspector.jsx — the shell that
 *      composes these in the React reference.
 */
export function createSplitView({ store, bus }: SplitViewProps): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flex-1 p-2 flex gap-2 min-h-0 min-w-0 overflow-hidden';

  const list = createEventList({ store });
  list.classList.add('flex-1');
  const detail = createEventDetail({ store, bus });
  detail.classList.add('flex-1');
  const waterfall = createWaterfall({ store });
  waterfall.classList.add('flex-[2]');

  // Width comes from the signal, not a utility class: `flex-none` wins over the
  // `flex-1` createEventList ships with (Tailwind emits it later in the flex
  // group), so the inline width is what the pane actually gets.
  const narrowList = createEventList({ store });
  narrowList.classList.add('flex-none');

  const available = (): number => root.clientWidth - ROOT_PADDING;
  const splitter = createSplitter({ width: store.waterfallListWidth, available });

  effect(() => {
    narrowList.style.width = `${store.waterfallListWidth.value}px`;
  });

  // Shrinking the window can leave a stored width wider than the container. Read
  // through `peek()` — taking `.value` here would make this observer respond to
  // the signal it writes. There is no layout loop either: resizing a child does
  // not change the root's own box, so this cannot re-trigger itself.
  const ro = new ResizeObserver(() => {
    store.waterfallListWidth.value = clampListWidth(store.waterfallListWidth.peek(), available());
  });
  ro.observe(root);

  effect(() => {
    root.innerHTML = '';
    // The splitter is the gutter in waterfall mode, so the flex gap would double it.
    root.classList.toggle('gap-2', store.view.value !== 'waterfall');
    switch (store.view.value) {
      case 'list':
        root.appendChild(list);
        break;
      case 'split':
        root.append(list, detail);
        break;
      case 'waterfall':
        root.append(narrowList, splitter, waterfall);
        break;
    }
  });

  return root;
}
