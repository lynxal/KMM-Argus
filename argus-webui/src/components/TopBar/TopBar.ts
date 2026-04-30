import { effect } from '@preact/signals-core';
import type { EventStore, View } from '../../store/eventStore';
import type { EventSource } from '../../transport/eventSource';
import type { ShortcutBus } from '../../input/keyboard';
import { createConnDot, createIconEl, createLogoMark } from '../Primitives/Primitives';
import { styles } from './TopBar.styles';
import { CONN_TONE, VIEW_LABELS } from './TopBar.states';

export interface TopBarProps {
  readonly store: EventStore;
  readonly source: EventSource;
  readonly bus: ShortcutBus;
}

/**
 * Top bar: device info, clear, pause/resume, theme toggle, connection status,
 * view switcher, global search. Buttons emit the same ShortcutActions the
 * keyboard bus dispatches — shortcut and click are the same path.
 *
 * @see design_handoff_argus_inspector/argus/TopBar.jsx
 */
export function createTopBar({ store, source, bus }: TopBarProps): HTMLElement {
  const bar = document.createElement('div');
  bar.className = styles.bar;

  // Brand
  const brand = document.createElement('div');
  brand.className = styles.brand;
  const logo = createLogoMark(20);
  logo.classList.add('text-fg-1', 'flex-none', 'block');
  const wordmark = document.createElement('span');
  wordmark.className = styles.wordmark;
  wordmark.textContent = 'Argus';
  const appBadge = document.createElement('span');
  appBadge.className = styles.appBadge;
  appBadge.textContent = '—';
  brand.append(logo, wordmark, appBadge);

  // Connection pill
  const connPill = document.createElement('div');
  connPill.className = styles.connPill;
  const connDotSlot = document.createElement('span');
  const connText = document.createElement('span');
  connPill.append(connDotSlot, connText);

  // View switcher
  const viewSwitcher = document.createElement('div');
  viewSwitcher.className = styles.viewSwitcher;
  const viewButtons: Partial<Record<View, HTMLButtonElement>> = {};
  for (const [value, label] of VIEW_LABELS) {
    const btn = document.createElement('button');
    btn.className = styles.viewSegment;
    btn.type = 'button';
    btn.dataset['view'] = value;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      store.view.value = value;
    });
    viewSwitcher.appendChild(btn);
    viewButtons[value] = btn;
  }

  const spacer = document.createElement('div');
  spacer.className = styles.spacer;

  // Search
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'search…';
  search.className = styles.search;
  search.setAttribute('aria-label', 'Global search');
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  search.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const value = search.value;
    searchDebounce = setTimeout(() => {
      store.filters.value = { ...store.filters.value, textQuery: value };
    }, 120);
  });

  // Icon buttons — pause, clear, theme, help
  function iconBtn(
    icon: Parameters<typeof createIconEl>[0],
    aria: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = styles.iconBtn;
    btn.type = 'button';
    btn.setAttribute('aria-label', aria);
    btn.title = aria;
    btn.appendChild(createIconEl(icon, 14));
    btn.addEventListener('click', onClick);
    return btn;
  }

  const pauseBtn = iconBtn('pause', 'Pause', () => {
    if (store.paused.value) store.resume();
    else store.pause();
  });
  const clearBtn = iconBtn('trash', 'Clear events', () => {
    store.clearLocal();
    void source.clear();
    bus.toast.value = { msg: 'Events cleared · ⌘Z to undo', at: Date.now() };
  });
  const themeBtn = iconBtn('sun', 'Toggle theme', () => {
    store.theme.value = store.theme.value === 'dark' ? 'light' : 'dark';
  });
  const helpBtn = iconBtn('keyboard', 'Shortcuts', () => {
    bus.openShortcuts.value = true;
  });
  const corrIdBtn = iconBtn('link', 'Toggle correlation id column', () => {
    store.showCorrelationId.value = !store.showCorrelationId.value;
  });

  bar.append(brand, connPill, viewSwitcher, spacer, search, corrIdBtn, pauseBtn, clearBtn, themeBtn, helpBtn);

  // Signals → DOM bindings
  effect(() => {
    const tone = CONN_TONE[source.connection.value];
    connPill.className = `${styles.connPill} ${tone.className}`;
    connText.textContent = tone.text;
    connDotSlot.replaceChildren(createConnDot(tone.dot));
  });

  effect(() => {
    const v = store.view.value;
    for (const [value] of VIEW_LABELS) {
      const btn = viewButtons[value];
      if (!btn) continue;
      btn.className =
        value === v ? `${styles.viewSegment} ${styles.viewSegmentActive}` : styles.viewSegment;
    }
  });

  effect(() => {
    pauseBtn.replaceChildren(createIconEl(store.paused.value ? 'play' : 'pause', 14));
    pauseBtn.setAttribute('aria-label', store.paused.value ? 'Resume' : 'Pause');
    pauseBtn.className = store.paused.value
      ? `${styles.iconBtn} ${styles.iconBtnActive}`
      : styles.iconBtn;
  });

  effect(() => {
    themeBtn.replaceChildren(createIconEl(store.theme.value === 'dark' ? 'sun' : 'moon', 14));
  });

  effect(() => {
    corrIdBtn.className = store.showCorrelationId.value
      ? `${styles.iconBtn} ${styles.iconBtnActive}`
      : styles.iconBtn;
  });

  effect(() => {
    if (bus.focusSearch.value > 0) {
      search.focus();
      search.select();
    }
  });

  // App identity badge — "<pkg> · <versionName> · <device>" from the server's AppInfo.
  effect(() => {
    const d = source.device.value;
    if (!d) {
      appBadge.textContent = '—';
      appBadge.title = 'Waiting for device info…';
      return;
    }
    const parts = [d.pkg, d.version, d.name].filter((s) => s && s.length > 0);
    appBadge.textContent = parts.join(' · ');
    appBadge.title = `${d.pkg} ${d.version} on ${d.name} (${d.address})`;
  });

  return bar;
}
