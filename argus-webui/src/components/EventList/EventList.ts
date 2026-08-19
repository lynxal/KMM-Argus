import { effect, signal } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { ArgusEvent } from '../../transport/schema';
import { createVirtualList } from './virtual';
import { applyRowSelection, createEventRow } from './Row';
import { unseenCount } from './EventList.states';
import { createIconEl } from '../Primitives/Primitives';

export interface EventListProps {
  readonly store: EventStore;
}

const ROW_HEIGHT_COMPACT = 28;
const ROW_HEIGHT_COMFY = 32;

/**
 * Virtualized event list. Reads `store.filteredEvents`; feeds the shared
 * Row component. Newest event sits at the bottom. Jump-to-latest pill appears
 * when the user scrolls away from the tail; click or `g` (future — for now
 * button only) snaps back.
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

  // Auto-scroll model: `following` mirrors "the newest row is still visible".
  // While it is, new events append below and the list keeps itself pinned so they
  // stay in view. The moment the user scrolls the newest row off screen,
  // following flips to false and the list is left alone entirely: appended rows
  // never move the ones above them, so the reading position holds with no
  // anchoring. `virtual.ts` owns the pinning; this signal drives the pill (shown
  // exactly when the newest row is off screen) and the unseen count.
  const following = signal(true);
  const unseen = signal(0);
  let lastSeenTailId: string | null = null;
  list.onScroll(() => {
    following.value = list.isNewestRowVisible();
  });

  // "Follow latest" pill — visible whenever the user has scrolled away from the
  // tail, so the way back to live tail is always discoverable (count appears only
  // when there's something new to catch up on). Icon and label are built once:
  // `textContent` on the button would wipe the SVG on every update.
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className =
    'absolute bottom-2 left-1/2 -translate-x-1/2 px-3 h-7 rounded-pill bg-bg-overlay text-fg-1 shadow-md border border-border-default text-xs font-ui cursor-pointer flex items-center gap-2 transition-opacity duration-base';
  const pillLabel = document.createElement('span');
  pill.append(createIconEl('arrowDown', 12), pillLabel);
  pill.addEventListener('click', () => {
    list.scrollToEnd();
    following.value = true;
  });
  wrapper.appendChild(pill);

  // Effects

  // Items effect — fires only when filteredEvents change (NOT on scroll).
  effect(() => {
    list.setItems(store.filteredEvents.value);
  });

  // Unseen-count effect — runs when filteredEvents or `following` changes. Does
  // NOT touch the list, keeping scroll-state mutation out of the hot path for
  // scroll events. While following, the newest event is by definition seen, so
  // remember it as the marker to count forward from later.
  effect(() => {
    const events = store.filteredEvents.value;
    if (following.value) {
      unseen.value = 0;
      lastSeenTailId = events[events.length - 1]?.id ?? null;
    } else {
      unseen.value = unseenCount(events, lastSeenTailId);
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
    pill.style.display = following.value ? 'none' : '';
    pillLabel.textContent = unseen.value > 0
      ? `Jump to latest · ${unseen.value} new`
      : 'Jump to latest';
  });

  return wrapper;
}
