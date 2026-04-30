import { effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { ShortcutBus } from '../../input/keyboard';
import {
  ALL_LEVELS,
  ALL_METHODS,
  ALL_SOURCES,
  ALL_STATUSES,
  cloneFilters,
  type HttpMethod,
  type StatusBucket,
} from '../../store/filters';
import type { EventSource, LogLevel } from '../../transport/schema';
import { LOG_LEVEL_LABELS } from '../../transport/schema';
import { styles } from './FilterBar.styles';
import {
  LEVEL_TONES,
  METHOD_COLORS,
  SOURCE_TONES,
  STATUS_BUCKET_DOTS,
  STATUS_BUCKET_TEXT,
} from './FilterBar.states';
import { createSourceLabelDropdown } from './SourceLabelDropdown';

export interface FilterBarProps {
  readonly store: EventStore;
  readonly bus: ShortcutBus;
}

type ChipBinder = (active: boolean) => void;

/**
 * Filter bar: source chips, HTTP method / status, log level, text inputs.
 * Text inputs debounce 120ms; chips toggle on left-click; right-click
 * ("only this") deselects siblings. Clear link resets to DEFAULT_FILTERS.
 *
 * @see design_handoff_argus_inspector/argus/FilterBar.jsx
 */
export function createFilterBar({ store, bus }: FilterBarProps): HTMLElement {
  const bar = document.createElement('div');
  bar.className = styles.bar;

  const binders: ChipBinder[] = [];

  // Source chips
  const srcGroup = document.createElement('div');
  srcGroup.className = styles.group;
  for (const src of ALL_SOURCES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = src;
    const tone = SOURCE_TONES[src];
    const base = [styles.chip, tone.fg, tone.brd].join(' ');
    chip.className = base;
    chip.addEventListener('click', () => toggleMembership(src, 'sources'));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onlyThis(src, 'sources', ALL_SOURCES);
    });
    srcGroup.appendChild(chip);
    binders.push((active) => {
      chip.className = active ? `${base} ${tone.bg} ${styles.chipActive}` : `${base} ${styles.chipInactive}`;
    });
  }

  // Source-label dropdown — auto-discovers CustomEvent.sourceLabels from the
  // live stream.
  const sourceLabelDropdown = createSourceLabelDropdown(store);

  const div1 = spacerDivider();

  // Method chips
  const methodGroup = document.createElement('div');
  methodGroup.className = styles.group;
  for (const m of ALL_METHODS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = m;
    const base = [styles.chip, METHOD_COLORS[m], 'font-mono'].join(' ');
    chip.className = base;
    chip.addEventListener('click', () => toggleMembership(m, 'methods'));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onlyThis(m, 'methods', ALL_METHODS);
    });
    methodGroup.appendChild(chip);
    binders.push((active) => {
      chip.className = active ? `${base} ${styles.chipActive}` : `${base} ${styles.chipInactive}`;
    });
  }

  const div2 = spacerDivider();

  // Status chips (2xx / 3xx / 4xx / 5xx / ERR with dots)
  const statusGroup = document.createElement('div');
  statusGroup.className = styles.group;
  for (const b of ALL_STATUSES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    const dot = document.createElement('span');
    dot.className = `${styles.statusDot} ${STATUS_BUCKET_DOTS[b]}`;
    const label = document.createElement('span');
    label.textContent = b.toUpperCase();
    const base = [styles.statusChip, STATUS_BUCKET_TEXT[b]].join(' ');
    chip.className = base;
    chip.append(dot, label);
    chip.addEventListener('click', () => toggleMembership(b, 'statuses'));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onlyThis(b, 'statuses', ALL_STATUSES);
    });
    statusGroup.appendChild(chip);
    binders.push((active) => {
      chip.className = active ? `${base} ${styles.chipActive}` : `${base} ${styles.chipInactive}`;
    });
  }

  const div3 = spacerDivider();

  // Level chips
  const levelGroup = document.createElement('div');
  levelGroup.className = styles.group;
  for (const l of ALL_LEVELS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = LOG_LEVEL_LABELS[l];
    const tone = LEVEL_TONES[l];
    const base = [styles.chip, tone.fg, 'font-mono'].join(' ');
    chip.className = base;
    chip.addEventListener('click', () => toggleMembership(l, 'levels'));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onlyThis(l, 'levels', ALL_LEVELS);
    });
    levelGroup.appendChild(chip);
    binders.push((active) => {
      chip.className = active ? `${base} ${tone.bg} ${styles.chipActive}` : `${base} ${styles.chipInactive}`;
    });
  }

  const div4 = spacerDivider();

  // Text inputs
  const hostInput = makeInput('host', 'host-contains', store, 'hostQuery');
  const tagInput = makeInput('tag', 'tag-contains', store, 'tagQuery');
  const textInput = makeInput('contains', 'url/message contains', store, 'textQuery');

  const spacer = document.createElement('div');
  spacer.className = styles.spacer;

  const count = document.createElement('span');
  count.className = styles.count;

  const clearLink = document.createElement('a');
  clearLink.className = styles.clearLink;
  clearLink.textContent = 'Clear filters';
  clearLink.addEventListener('click', (e) => {
    e.preventDefault();
    store.filters.value = cloneFilters({
      sources: new Set(ALL_SOURCES),
      methods: new Set(ALL_METHODS),
      statuses: new Set(ALL_STATUSES),
      levels: new Set(ALL_LEVELS),
      hostQuery: '',
      tagQuery: '',
      textQuery: '',
      sourceLabels: null,
    });
    hostInput.value = '';
    tagInput.value = '';
    textInput.value = '';
  });

  bar.append(
    srcGroup,
    sourceLabelDropdown,
    div1,
    methodGroup,
    div2,
    statusGroup,
    div3,
    levelGroup,
    div4,
    hostInput,
    tagInput,
    textInput,
    spacer,
    count,
    clearLink,
  );

  // Bind membership states
  effect(() => {
    const f = store.filters.value;
    let i = 0;
    for (const s of ALL_SOURCES) binders[i++]?.(f.sources.has(s));
    for (const m of ALL_METHODS) binders[i++]?.(f.methods.has(m));
    for (const b of ALL_STATUSES) binders[i++]?.(f.statuses.has(b));
    for (const l of ALL_LEVELS) binders[i++]?.(f.levels.has(l));
  });

  // Count
  effect(() => {
    count.textContent = `${store.filteredEvents.value.length} / ${store.events.value.length}`;
  });

  // Sync text inputs when external changes (e.g., Clear shortcut) happen.
  effect(() => {
    const f = store.filters.value;
    if (hostInput.value !== f.hostQuery) hostInput.value = f.hostQuery;
    if (tagInput.value !== f.tagQuery) tagInput.value = f.tagQuery;
    if (textInput.value !== f.textQuery) textInput.value = f.textQuery;
  });

  // `f` shortcut: focus the first text filter input so the user can start
  // typing a host query immediately.
  effect(() => {
    if (bus.openFilter.value > 0) {
      hostInput.focus();
      hostInput.select();
    }
  });

  return bar;

  function spacerDivider(): HTMLElement {
    const d = document.createElement('span');
    d.className = styles.divider;
    return d;
  }

  function toggleMembership<K extends 'sources' | 'methods' | 'statuses' | 'levels'>(
    value: K extends 'sources' ? EventSource : K extends 'methods' ? HttpMethod : K extends 'statuses' ? StatusBucket : LogLevel,
    key: K,
  ): void {
    const mut = cloneFilters(store.filters.value);
    const set = mut[key] as Set<typeof value>;
    if (set.has(value)) set.delete(value);
    else set.add(value);
    store.filters.value = mut;
  }

  function onlyThis<K extends 'sources' | 'methods' | 'statuses' | 'levels'>(
    value: K extends 'sources' ? EventSource : K extends 'methods' ? HttpMethod : K extends 'statuses' ? StatusBucket : LogLevel,
    key: K,
    all: readonly (typeof value)[],
  ): void {
    const mut = cloneFilters(store.filters.value);
    const allSet = mut[key] as Set<typeof value>;
    allSet.clear();
    allSet.add(value);
    void all; // unused; kept for API symmetry
    store.filters.value = mut;
  }
}

function makeInput(
  placeholder: string,
  ariaLabel: string,
  store: EventStore,
  key: 'hostQuery' | 'tagQuery' | 'textQuery',
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.className = styles.input;
  input.setAttribute('aria-label', ariaLabel);
  let debounce: ReturnType<typeof setTimeout> | null = null;
  input.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    const value = input.value;
    debounce = setTimeout(() => {
      store.filters.value = { ...store.filters.value, [key]: value };
    }, 120);
  });
  return input;
}
