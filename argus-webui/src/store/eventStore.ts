import { computed, effect, signal, type Signal } from '@preact/signals-core';
import type { ArgusEvent } from '../transport/schema';
import type { EventSource } from '../transport/eventSource';
import { applyFilters, cloneFilters, DEFAULT_FILTERS, type Filters } from './filters';
import { loadJson, loadString, saveJson, saveString } from './persistence';

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

  readonly paused: Signal<boolean>;
  readonly view: Signal<View>;
  readonly theme: Signal<Theme>;
  readonly density: Signal<Density>;

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

  const selectedId = signal<string | null>(null);
  const selectionSource = signal<SelectionSource>('mouse');

  const filters = signal<Filters>(cloneFilters(DEFAULT_FILTERS));
  const detailTab = signal<DetailTabs>(
    loadJson<DetailTabs>('detailTab', { HTTP: 'Headers', LOG: 'Message', CUSTOM: 'Payload' }),
  );

  const filteredEvents = computed(() => applyFilters(events.value, filters.value));

  // Undo snapshot for Shift+X clear. Expires on next write.
  let lastClearSnapshot: readonly ArgusEvent[] | null = null;
  let lastClearAt = 0;
  const UNDO_WINDOW_MS = 6_000;

  function ingest(event: ArgusEvent): void {
    if (paused.value) {
      const buf = pausedBuffer.value;
      pausedBuffer.value = buf.length >= maxEvents ? [event, ...buf.slice(0, maxEvents - 1)] : [event, ...buf];
      return;
    }
    const next = events.value;
    events.value = next.length >= maxEvents ? [event, ...next.slice(0, maxEvents - 1)] : [event, ...next];
  }

  function pause(): void {
    paused.value = true;
  }

  function resume(): void {
    if (!paused.value) return;
    const buf = pausedBuffer.value;
    if (buf.length > 0) {
      const merged = [...buf, ...events.value];
      events.value = merged.length > maxEvents ? merged.slice(0, maxEvents) : merged;
      pausedBuffer.value = [];
    }
    paused.value = false;
  }

  function clearLocal(): void {
    lastClearSnapshot = events.value;
    lastClearAt = Date.now();
    events.value = [];
    pausedBuffer.value = [];
    selectedId.value = null;
  }

  function undoClear(): boolean {
    if (!lastClearSnapshot) return false;
    if (Date.now() - lastClearAt > UNDO_WINDOW_MS) {
      lastClearSnapshot = null;
      return false;
    }
    events.value = [...lastClearSnapshot];
    lastClearSnapshot = null;
    return true;
  }

  // Persistence — single effect per key keeps storage writes minimal.
  effect(() => saveString('view', view.value));
  effect(() => saveString('theme', theme.value));
  effect(() => saveString('density', density.value));
  effect(() => saveJson('detailTab', detailTab.value));

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
    paused,
    view,
    theme,
    density,
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
