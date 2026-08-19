import { effect, signal } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { ArgusEvent } from '../../transport/schema';
import { createVirtualList } from './virtual';
import { applyRowSelection, createEventRow } from './Row';

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
    // peek(), not value(): renderRow runs inside whichever effect happened to
    // trigger the render, and tracking these here would make that effect depend
    // on state it doesn't manage — a selection change would re-run the items
    // effect and re-anchor the scroll position. Each of these signals already
    // has an effect below that rebuilds or patches the rows it affects.
    renderRow: (event) =>
      createEventRow(event, {
        selectedId: store.selectedId.peek(),
        selectionSource: store.selectionSource.peek(),
        textQuery: store.filters.peek().textQuery,
        showCorrelationId: store.showCorrelationId.peek(),
        onClick: (e) => {
          store.selectionSource.value = 'mouse';
          store.selectedId.value = e.id;
        },
      }),
    keyFor: (e) => e.id,
  });
  wrapper.appendChild(list.root);

  // Auto-scroll model: `atHead` doubles as the "follow tail" flag. True by
  // default → new events are visible as they arrive (they prepend at index 0
  // and scrollTop=0 keeps showing them). User scrolls away → atHead flips to
  // false → the list is anchored to the event they were looking at until they
  // tap the pill or scroll back to the top.
  const atHead = signal(true);
  const hiddenCount = signal(0);
  let lastHeadId: string | null = null;
  list.onScroll(() => {
    atHead.value = list.isAtHead();
  });

  // "Follow latest" pill — visible whenever the user has scrolled away from
  // the head, so the way back to live tail is always discoverable (count
  // appears only when there's something new to catch up on).
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className =
    'absolute bottom-2 left-1/2 -translate-x-1/2 px-3 h-7 rounded-pill bg-bg-overlay text-fg-1 shadow-md border border-border-default text-xs font-ui cursor-pointer flex items-center gap-2 transition-opacity duration-base';
  pill.addEventListener('click', () => {
    list.scrollToIndex(0);
    atHead.value = true;
  });
  wrapper.appendChild(pill);

  // Effects

  // Items effect — fires only when filteredEvents change (NOT on scroll).
  effect(() => {
    const events = store.filteredEvents.value;
    const anchor = atHead.peek() ? undefined : list.peekAnchor();
    list.setItems(events, anchor != null ? { anchor } : undefined);
  });

  // Hidden-count effect — runs when filteredEvents or atHead changes. Does
  // NOT touch the list (keeping scroll-state mutation out of the hot path
  // for scroll events, which otherwise re-anchor on every drag tick).
  effect(() => {
    const events = store.filteredEvents.value;
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

  // Selection is a class-only change, so patch the live rows in place. Calling
  // setItems here would do nothing: the virtual list reuses pooled rows keyed by
  // event id and only re-invokes renderRow on a pool miss. Rows built later by a
  // scroll-driven render are born correct — renderRow reads selectedId fresh.
  effect(() => {
    const id = store.selectedId.value;
    const source = store.selectionSource.value;
    for (const child of Array.from(list.innerContent.children)) {
      const row = child as HTMLElement;
      applyRowSelection(row, id != null && row.dataset['eventId'] === id, source);
    }
    // Keyboard nav can walk the selection past either edge of the viewport;
    // mouse selection is by definition already visible, so leave scroll alone.
    if (id != null && source === 'keyboard') {
      const idx = store.filteredEvents.peek().findIndex((e) => e.id === id);
      if (idx >= 0) list.scrollIndexIntoView(idx);
    }
  });

  // Search highlighting is baked into the row's DOM by renderHighlighted, so the
  // pool has to be dropped for the new query to take effect.
  effect(() => {
    void store.filters.value.textQuery;
    list.invalidateAll();
    list.setItems(store.filteredEvents.peek());
  });

  // Column visibility changes the row's structure — drop pooled rows so they
  // get rebuilt with the new layout, not reused from the cache.
  effect(() => {
    void store.showCorrelationId.value;
    list.invalidateAll();
    list.setItems(store.filteredEvents.peek());
  });

  effect(() => {
    pill.style.display = atHead.value ? 'none' : '';
    pill.textContent = hiddenCount.value > 0
      ? `↑ Jump to latest · ${hiddenCount.value} new`
      : '↑ Jump to latest';
  });

  return wrapper;
}
