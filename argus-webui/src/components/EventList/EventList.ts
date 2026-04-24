import { effect, signal } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { ArgusEvent } from '../../transport/schema';
import { createVirtualList } from './virtual';
import { createEventRow } from './Row';

export interface EventListProps {
  readonly store: EventStore;
}

const ROW_HEIGHT_COMPACT = 28;
const ROW_HEIGHT_COMFY = 32;

/**
 * Virtualized event list. Reads `store.filteredEvents`; feeds the shared
 * Row component. Jump-to-latest pill appears when the user scrolls away
 * from the head; click or `g` (future — for now button only) snaps back.
 *
 * @see design_handoff_argus_inspector/argus/EventList.jsx
 */
export function createEventList({ store }: EventListProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'relative flex-1 min-h-0 flex flex-col bg-bg-panel rounded-md border border-border-default overflow-hidden';

  const list = createVirtualList<ArgusEvent>({
    rowHeight: store.density.value === 'comfy' ? ROW_HEIGHT_COMFY : ROW_HEIGHT_COMPACT,
    renderRow: (event) =>
      createEventRow(event, {
        selectedId: store.selectedId.value,
        selectionSource: store.selectionSource.value,
        textQuery: store.filters.value.textQuery,
        onClick: (e) => {
          store.selectionSource.value = 'mouse';
          store.selectedId.value = e.id;
        },
      }),
    keyFor: (e) => e.id,
  });
  wrapper.appendChild(list.root);

  // Jump-to-latest pill — shows when user scrolls away from the head and new events have arrived.
  const atHead = signal(true);
  const hiddenCount = signal(0);
  let lastHeadId: string | null = null;
  list.onScroll(() => {
    atHead.value = list.isAtHead();
  });

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className =
    'absolute bottom-2 left-1/2 -translate-x-1/2 px-3 h-7 rounded-pill bg-bg-overlay text-fg-1 shadow-md border border-border-default text-xs font-ui cursor-pointer flex items-center gap-2 transition-opacity duration-base';
  pill.innerHTML = '';
  pill.addEventListener('click', () => {
    list.scrollToIndex(0);
    atHead.value = true;
  });
  wrapper.appendChild(pill);

  // Effects

  effect(() => {
    const events = store.filteredEvents.value;
    list.setItems(events);
    // Track hidden-since-scrolled-away count.
    if (atHead.value) {
      hiddenCount.value = 0;
      lastHeadId = events[0]?.id ?? null;
    } else {
      const prev = lastHeadId;
      if (prev == null) {
        hiddenCount.value = events.length;
      } else {
        const idx = events.findIndex((e) => e.id === prev);
        hiddenCount.value = idx === -1 ? events.length : idx;
      }
    }
  });

  // Re-render all rows when selection or textQuery changes.
  effect(() => {
    void store.selectedId.value;
    void store.selectionSource.value;
    void store.filters.value.textQuery;
    list.setItems(store.filteredEvents.peek());
  });

  effect(() => {
    const show = !atHead.value && hiddenCount.value > 0;
    pill.style.display = show ? '' : 'none';
    pill.textContent = `↑ Jump to latest · ${hiddenCount.value} new`;
  });

  return wrapper;
}
