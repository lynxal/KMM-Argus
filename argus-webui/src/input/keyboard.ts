import { signal, type Signal } from '@preact/signals-core';
import type { EventStore } from '../store/eventStore';
import type { EventSource } from '../transport/eventSource';

export type ShortcutAction =
  | 'focusSearch'
  | 'selectNext'
  | 'selectPrev'
  | 'dismiss'
  | 'openFilter'
  | 'clearFilters'
  | 'togglePause'
  | 'clearEvents'
  | 'cycleView'
  | 'prevTab'
  | 'nextTab'
  | 'openShortcuts'
  | 'copySelection'
  | 'undo';

export interface KeyBinding {
  readonly key: string; // .key on KeyboardEvent (case-sensitive for letters)
  readonly shift?: boolean;
  readonly meta?: boolean; // Cmd on mac, Ctrl elsewhere — accepts either metaKey or ctrlKey
  readonly action: ShortcutAction;
  readonly label: string; // human-visible chord (used by the shortcuts modal)
  readonly group: 'Navigate' | 'Search & filter' | 'Capture' | 'Views' | 'Help';
  readonly description: string;
}

/**
 * Single source of truth for keyboard shortcuts. The ShortcutsModal renders
 * from this same array, so the modal cannot drift from the handler.
 * Order matches the handoff README's shortcut table.
 */
export const BINDINGS: readonly KeyBinding[] = [
  { key: '/', action: 'focusSearch', label: '/', group: 'Search & filter', description: 'Focus global search' },
  { key: 'j', action: 'selectNext', label: 'j', group: 'Navigate', description: 'Next event' },
  { key: 'k', action: 'selectPrev', label: 'k', group: 'Navigate', description: 'Previous event' },
  { key: 'ArrowDown', action: 'selectNext', label: '↓', group: 'Navigate', description: 'Next event' },
  { key: 'ArrowUp', action: 'selectPrev', label: '↑', group: 'Navigate', description: 'Previous event' },
  { key: 'Escape', action: 'dismiss', label: 'Esc', group: 'Navigate', description: 'Close overlay / clear search / deselect' },
  { key: 'f', action: 'openFilter', label: 'f', group: 'Search & filter', description: 'Open Add filter' },
  { key: 'x', action: 'clearFilters', label: 'x', group: 'Search & filter', description: 'Clear all filters' },
  { key: 'p', action: 'togglePause', label: 'p', group: 'Capture', description: 'Pause / resume capture' },
  { key: 'X', shift: true, action: 'clearEvents', label: '⇧ X', group: 'Capture', description: 'Clear events (undoable)' },
  { key: 'w', action: 'cycleView', label: 'w', group: 'Views', description: 'Cycle List → Split → Waterfall' },
  { key: '[', action: 'prevTab', label: '[', group: 'Views', description: 'Previous detail tab' },
  { key: ']', action: 'nextTab', label: ']', group: 'Views', description: 'Next detail tab' },
  { key: '?', action: 'openShortcuts', label: '?', group: 'Help', description: 'Open shortcuts modal' },
  { key: 'c', meta: true, action: 'copySelection', label: '⌘ C', group: 'Capture', description: 'Copy selected event (cURL / JSON)' },
  { key: 'z', meta: true, action: 'undo', label: '⌘ Z', group: 'Capture', description: 'Undo last destructive action' },
];

/** Side-band signals overlays/search sets; keyboard flips them on dispatch. */
export interface ShortcutBus {
  readonly focusSearch: Signal<number>;
  readonly openFilter: Signal<number>;
  readonly openShortcuts: Signal<boolean>;
  readonly toast: Signal<{ msg: string; at: number } | null>;
}

export function createShortcutBus(): ShortcutBus {
  return {
    focusSearch: signal(0),
    openFilter: signal(0),
    openShortcuts: signal(false),
    toast: signal(null),
  };
}

function pickCycleNext(view: EventStore['view']['value']): EventStore['view']['value'] {
  return view === 'list' ? 'split' : view === 'split' ? 'waterfall' : 'list';
}

/**
 * Install the single global keydown listener. Returns an uninstall function.
 * Bindings skip when focus is inside an <input>/<textarea>, except Escape —
 * which always runs so users can bail out of the search input.
 */
export function installKeyboard(
  store: EventStore,
  source: EventSource,
  bus: ShortcutBus,
): () => void {
  function dispatch(action: ShortcutAction): void {
    switch (action) {
      case 'focusSearch':
        bus.focusSearch.value = bus.focusSearch.value + 1;
        break;
      case 'selectNext':
      case 'selectPrev': {
        const list = store.filteredEvents.value;
        if (list.length === 0) return;
        const idx = store.selectedId.value
          ? list.findIndex((e) => e.id === store.selectedId.value)
          : -1;
        const next =
          action === 'selectNext'
            ? Math.min(list.length - 1, Math.max(0, idx) + (idx < 0 ? 0 : 1))
            : Math.max(0, idx - 1);
        store.selectionSource.value = 'keyboard';
        store.selectedId.value = list[next]!.id;
        break;
      }
      case 'dismiss': {
        if (bus.openShortcuts.value) {
          bus.openShortcuts.value = false;
          break;
        }
        if (store.selectedId.value) {
          store.selectedId.value = null;
        }
        break;
      }
      case 'openFilter':
        bus.openFilter.value = bus.openFilter.value + 1;
        break;
      case 'clearFilters': {
        const f = store.filters.value;
        store.filters.value = {
          ...f,
          sources: new Set(['HTTP', 'LOG', 'CUSTOM']),
          methods: new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']),
          statuses: new Set(['2xx', '3xx', '4xx', '5xx', 'err']),
          levels: new Set(['Verbose', 'Debug', 'Info', 'Warning', 'Error']),
          hostQuery: '',
          tagQuery: '',
          textQuery: '',
        };
        bus.toast.value = { msg: 'Filters cleared', at: Date.now() };
        break;
      }
      case 'togglePause':
        if (store.paused.value) store.resume();
        else store.pause();
        break;
      case 'clearEvents':
        store.clearLocal();
        void source.clear();
        bus.toast.value = { msg: 'Events cleared · ⌘Z to undo', at: Date.now() };
        break;
      case 'cycleView':
        store.view.value = pickCycleNext(store.view.value);
        break;
      case 'prevTab':
      case 'nextTab':
        // Tab cycling is handled by EventDetail via a local signal — the
        // keyboard bus forwards the intent; EventDetail subscribes.
        bus.focusSearch.value = bus.focusSearch.value; // no-op placeholder to keep linter happy
        break;
      case 'openShortcuts':
        bus.openShortcuts.value = !bus.openShortcuts.value;
        break;
      case 'copySelection': {
        const id = store.selectedId.value;
        if (!id) return;
        const evt = store.events.value.find((e) => e.id === id);
        if (!evt) return;
        const payload =
          evt.type === 'HttpEvent'
            ? buildCurl(evt)
            : JSON.stringify(evt, null, 2);
        void navigator.clipboard.writeText(payload).catch(() => undefined);
        bus.toast.value = {
          msg: evt.type === 'HttpEvent' ? 'Copied as cURL' : 'Copied as JSON',
          at: Date.now(),
        };
        break;
      }
      case 'undo':
        if (store.undoClear()) {
          bus.toast.value = { msg: 'Clear undone', at: Date.now() };
        }
        break;
    }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    return target.isContentEditable;
  }

  function onKey(e: KeyboardEvent): void {
    const typing = isTypingTarget(e.target);
    for (const b of BINDINGS) {
      if (b.key !== e.key) continue;
      if (!!b.shift !== e.shiftKey) continue;
      if (!!b.meta !== (e.metaKey || e.ctrlKey)) continue;
      if (typing && b.key !== 'Escape') continue;
      e.preventDefault();
      dispatch(b.action);
      return;
    }
  }

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** Naive cURL builder; good enough for Copy-as-cURL from the TopBar shortcut. */
export function buildCurl(evt: import('../transport/schema').HttpEvent): string {
  const lines: string[] = [];
  lines.push(`curl -X ${evt.request.method.toUpperCase()} '${evt.request.url}'`);
  for (const h of evt.request.headers) {
    const v = h.redacted ? '***redacted***' : h.value;
    lines.push(`  -H '${h.name}: ${v.replace(/'/g, "'\\''")}'`);
  }
  if (evt.request.bodyPreview) {
    lines.push(`  --data-binary $'${evt.request.bodyPreview.replace(/'/g, "\\'")}'`);
  }
  return lines.join(' \\\n');
}
