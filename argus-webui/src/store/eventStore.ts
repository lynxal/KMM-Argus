import { computed, effect, signal, type Signal } from '@preact/signals-core';
import type { ArgusEvent, HttpEvent } from '../transport/schema';
import type { EventSource } from '../transport/eventSource';
import { applyFilters, cloneFilters, DEFAULT_FILTERS, type Filters } from './filters';
import { loadJson, loadString, saveJson, saveString } from './persistence';
import { buildRedirectOrigins } from './redirects';
import { linkedEventIds } from './related';

/** Ring-buffer cap. README default; configurable at store creation. */
export const DEFAULT_MAX_EVENTS = 10_000;

export type View = 'list' | 'split' | 'waterfall';
export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfy';
export type SelectionSource = 'keyboard' | 'mouse';
export type EventKind = 'HTTP' | 'LOG' | 'CUSTOM';

/**
 * Last-used detail tab per event kind, persisted. The keys match the tab
 * arrays in EventDetail/tabs/*Tabs.ts.
 */
export type DetailTabs = Record<EventKind, string>;

export interface EventStore {
  readonly events: Signal<ArgusEvent[]>;
  readonly pausedBuffer: Signal<ArgusEvent[]>;
  readonly filteredEvents: Signal<ArgusEvent[]>;

  /**
   * Continuation hop id → the origin hop of its redirect chain. Derived from the
   * unfiltered list on purpose: a hop stays marked as redirected even when the 3xx
   * that produced it is filtered out, which is the informative behaviour.
   */
  readonly redirectOrigins: Signal<ReadonlyMap<string, HttpEvent>>;
  /**
   * Events related to the current selection — redirect chain-mates plus anything
   * sharing its correlationId — excluding the selection itself.
   */
  readonly linkedIds: Signal<ReadonlySet<string>>;

  readonly paused: Signal<boolean>;
  readonly view: Signal<View>;
  readonly theme: Signal<Theme>;
  readonly density: Signal<Density>;
  /** Show the optional correlationId column in the EventList. */
  readonly showCorrelationId: Signal<boolean>;

  readonly selectedId: Signal<string | null>;
  readonly selectionSource: Signal<SelectionSource>;

  readonly filters: Signal<Filters>;
  readonly detailTab: Signal<DetailTabs>;

  readonly maxEvents: number;

  ingest(event: ArgusEvent): void;
  /** Manual clear — local + returns so caller can chain device clear(). */
  clearLocal(): void;
  /** Drain pausedBuffer into events and unpause. */
  resume(): void;
  /** Start pausing (new events go to pausedBuffer). */
  pause(): void;
  /** Undo last clear if its toast is still live. */
  undoClear(): boolean;
}

export interface EventStoreOptions {
  readonly maxEvents?: number;
}

function restoreFilters(): Filters {
  const base = cloneFilters(DEFAULT_FILTERS);
  const persisted = loadJson<string[] | null>('filters.sourceLabels', null);
  if (persisted && persisted.length > 0) {
    base.sourceLabels = new Set(persisted);
  }
  return base;
}

/**
 * Build a fresh signal-backed store. One store per app — if you need a new
 * scenario (tests, Storybook), create a new store rather than resetting a
 * shared one.
 */
export function createEventStore(opts: EventStoreOptions = {}): EventStore {
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS;

  const events = signal<ArgusEvent[]>([]);
  const pausedBuffer = signal<ArgusEvent[]>([]);

  const paused = signal(false);
  const view = signal<View>(loadString('view', 'split') as View);
  const theme = signal<Theme>(loadString('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as Theme);
  const density = signal<Density>(loadString('density', 'compact') as Density);
  const showCorrelationId = signal<boolean>(loadString<string>('showCorrelationId', 'false') === 'true');

  const selectedId = signal<string | null>(null);
  const selectionSource = signal<SelectionSource>('mouse');

  const filters = signal<Filters>(restoreFilters());
  const detailTab = signal<DetailTabs>(
    loadJson<DetailTabs>('detailTab', { HTTP: 'Headers', LOG: 'Message', CUSTOM: 'Payload' }),
  );

  const filteredEvents = computed(() => applyFilters(events.value, filters.value));

  // Derived rather than maintained incrementally, so replace-in-place, ring-buffer
  // eviction, clearLocal and undoClear all stay correct with no extra bookkeeping.
  const redirectOrigins = computed(() => buildRedirectOrigins(events.value));
  const linkedIds = computed(() => linkedEventIds(events.value, selectedId.value));

  // Undo snapshot for Shift+X clear. Expires on next write.
  let lastClearSnapshot: readonly ArgusEvent[] | null = null;
  let lastClearAt = 0;
  const UNDO_WINDOW_MS = 6_000;

  // Ids currently held by `events` + `pausedBuffer`. One id can arrive more than
  // once when the backfill GET overlaps the live WS stream, and against an older
  // library version that minted one id per request instead of per hop, where a
  // redirect's 302 and 200 arrive under the same id. Two entries with one id
  // rendered as two rows, both highlighted, and keyboard nav (which resolves the
  // selection with findIndex) jumped back to the first copy.
  //
  // The repeat REPLACES the entry it collides with, in place, rather than being
  // dropped: a re-delivered event's two copies are identical so replacing is a
  // no-op, and on the old-library path the later hop is the meaningful one (the
  // real status and body). Keeping the position stops rows from jumping.
  const seenIds = new Set<string>();

  /** Forget ids that fell off the front of a capped list so the set can't grow unbounded. */
  function forget(dropped: readonly ArgusEvent[]): void {
    for (const e of dropped) seenIds.delete(e.id);
  }

  /** Replace an already-held event with a later copy of itself. */
  function replace(event: ArgusEvent): void {
    const inEvents = events.value.findIndex((e) => e.id === event.id);
    if (inEvents >= 0) {
      const next = events.value.slice();
      next[inEvents] = event;
      events.value = next;
      return;
    }
    const inBuffer = pausedBuffer.value.findIndex((e) => e.id === event.id);
    if (inBuffer >= 0) {
      const next = pausedBuffer.value.slice();
      next[inBuffer] = event;
      pausedBuffer.value = next;
    }
  }

  // Newest event goes last. Appending never moves an existing row, which is what
  // lets the virtual list hold the user's reading position with no scroll
  // compensation, so the ring-buffer cap evicts from the FRONT (oldest).
  function ingest(event: ArgusEvent): void {
    if (seenIds.has(event.id)) {
      replace(event);
      return;
    }
    seenIds.add(event.id);
    if (paused.value) {
      const buf = pausedBuffer.value;
      if (buf.length >= maxEvents) {
        const cut = buf.length - maxEvents + 1;
        forget(buf.slice(0, cut));
        pausedBuffer.value = [...buf.slice(cut), event];
      } else {
        pausedBuffer.value = [...buf, event];
      }
      return;
    }
    const next = events.value;
    if (next.length >= maxEvents) {
      const cut = next.length - maxEvents + 1;
      forget(next.slice(0, cut));
      events.value = [...next.slice(cut), event];
    } else {
      events.value = [...next, event];
    }
  }

  function pause(): void {
    paused.value = true;
  }

  function resume(): void {
    if (!paused.value) return;
    const buf = pausedBuffer.value;
    if (buf.length > 0) {
      // Buffered events are newer than everything already in the list, so they
      // go after it; the cap drops from the front.
      const merged = [...events.value, ...buf];
      if (merged.length > maxEvents) {
        const cut = merged.length - maxEvents;
        forget(merged.slice(0, cut));
        events.value = merged.slice(cut);
      } else {
        events.value = merged;
      }
      pausedBuffer.value = [];
    }
    paused.value = false;
  }

  function clearLocal(): void {
    lastClearSnapshot = events.value;
    lastClearAt = Date.now();
    events.value = [];
    pausedBuffer.value = [];
    seenIds.clear();
    selectedId.value = null;
  }

  function undoClear(): boolean {
    if (!lastClearSnapshot) return false;
    if (Date.now() - lastClearAt > UNDO_WINDOW_MS) {
      lastClearSnapshot = null;
      return false;
    }
    events.value = [...lastClearSnapshot];
    for (const e of lastClearSnapshot) seenIds.add(e.id);
    lastClearSnapshot = null;
    return true;
  }

  // Persistence — single effect per key keeps storage writes minimal.
  effect(() => saveString('view', view.value));
  effect(() => saveString('theme', theme.value));
  effect(() => saveString('density', density.value));
  effect(() => saveString('showCorrelationId', String(showCorrelationId.value)));
  effect(() => saveJson('detailTab', detailTab.value));

  // Persist sourceLabels filter only — other filters intentionally remain
  // non-persistent so reloads don't carry forward incidental state.
  effect(() => {
    const labels = filters.value.sourceLabels;
    saveJson('filters.sourceLabels', labels === null ? null : [...labels]);
  });

  // Theme class on <html>. Lets components react via CSS vars alone.
  effect(() => {
    const cls = document.documentElement.classList;
    cls.toggle('theme-dark', theme.value === 'dark');
    cls.toggle('theme-light', theme.value === 'light');
  });

  return {
    events,
    pausedBuffer,
    filteredEvents,
    redirectOrigins,
    linkedIds,
    paused,
    view,
    theme,
    density,
    showCorrelationId,
    selectedId,
    selectionSource,
    filters,
    detailTab,
    maxEvents,
    ingest,
    pause,
    resume,
    clearLocal,
    undoClear,
  };
}

/**
 * Bind an event source to the store. Returns an unbind function that removes
 * the event listener; connection signals live on the source, not the store,
 * so they don't need rebinding.
 */
export function bindSource(store: EventStore, source: EventSource): () => void {
  return source.onEvent(store.ingest);
}
