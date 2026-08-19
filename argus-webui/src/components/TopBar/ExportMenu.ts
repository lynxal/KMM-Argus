/**
 * Export CTA with a two-option menu: the whole capture, or exactly what the
 * filters currently leave visible.
 *
 * The popover is portaled to `document.body` with `position: fixed` and
 * positioned off the trigger's rect, the same approach
 * FilterBar/SourceLabelDropdown.ts uses — an absolutely positioned child would
 * be clipped by the 40 px top bar.
 */
import { effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import type { EventSource } from '../../transport/eventSource';
import type { ShortcutBus } from '../../input/keyboard';
import type { ArgusEvent } from '../../transport/schema';
import { buildEventsExport, downloadFile, eventsFileName } from '../../export/exportFile';
import { styles } from './TopBar.styles';

export interface ExportMenuProps {
  readonly store: EventStore;
  readonly source: EventSource;
  readonly bus: ShortcutBus;
}

export function createExportMenu({ store, source, bus }: ExportMenuProps): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = styles.textBtn;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.title = 'Export events as JSON';
  const triggerLabel = document.createElement('span');
  triggerLabel.textContent = 'Export';
  const caret = document.createElement('span');
  caret.className = 'text-fg-3 text-xxs pl-1';
  caret.textContent = '▾';
  trigger.append(triggerLabel, caret);
  wrap.appendChild(trigger);

  const popover = document.createElement('div');
  popover.className =
    'fixed z-popover bg-bg-panel border border-border-default rounded-sm shadow-md p-1 min-w-44 flex-col gap-1';
  popover.style.display = 'none';
  popover.setAttribute('role', 'menu');

  const allItem = menuItem('Export all');
  const filteredItem = menuItem('Export filtered');
  popover.append(allItem.row, filteredItem.row);

  // Counts live in the labels so the choice is obvious before clicking, and an
  // option is disabled when its set is empty.
  effect(() => {
    const all = store.events.value.length;
    const shown = store.filteredEvents.value.length;
    allItem.setCount(all);
    filteredItem.setCount(shown);
    allItem.setEnabled(all > 0);
    filteredItem.setEnabled(shown > 0);
  });

  allItem.row.addEventListener('click', () => {
    setOpen(false);
    run(store.events.peek(), 'events');
  });
  filteredItem.row.addEventListener('click', () => {
    setOpen(false);
    run(store.filteredEvents.peek(), 'filtered events');
  });

  function run(events: readonly ArgusEvent[], noun: string): void {
    const at = Date.now();
    if (events.length === 0) {
      bus.toast.value = { msg: `No ${noun} to export`, at };
      return;
    }
    const device = source.device.value;
    const name = eventsFileName(device, at);
    try {
      downloadFile(name, 'application/json', buildEventsExport(events, device, at));
      bus.toast.value = { msg: `Exported ${events.length} ${noun} · ${name}`, at };
    } catch {
      bus.toast.value = { msg: 'Export failed', at };
    }
  }

  let open = false;
  const positionPopover = (): void => {
    const rect = trigger.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 4}px`;
    // Right-align with the trigger — the menu is wider than the button, which
    // sits near the right edge of the bar.
    popover.style.left = `${Math.max(0, rect.right - popover.offsetWidth)}px`;
  };
  const onScroll = (): void => {
    if (open) positionPopover();
  };
  const onResize = (): void => {
    if (open) positionPopover();
  };

  function setOpen(next: boolean): void {
    open = next;
    if (open) {
      if (!popover.isConnected) document.body.appendChild(popover);
      popover.style.display = 'flex';
      positionPopover();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
    } else {
      popover.style.display = 'none';
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    }
    trigger.setAttribute('aria-expanded', String(open));
  }

  trigger.addEventListener('click', () => setOpen(!open));

  document.addEventListener('click', (e) => {
    if (!open) return;
    const target = e.target as Node;
    if (wrap.contains(target) || popover.contains(target)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false);
  });

  return wrap;
}

function menuItem(label: string): {
  row: HTMLButtonElement;
  setCount: (n: number) => void;
  setEnabled: (on: boolean) => void;
} {
  const row = document.createElement('button');
  row.type = 'button';
  row.setAttribute('role', 'menuitem');
  const text = document.createElement('span');
  text.textContent = label;
  const count = document.createElement('span');
  count.className = 'text-fg-3 font-mono';
  row.append(text, count);
  const setEnabled = (on: boolean): void => {
    row.disabled = !on;
    row.className = on
      ? 'flex items-center justify-between gap-3 w-full px-2 h-6 rounded-xs text-fg-1 text-xs font-ui text-left hover:bg-bg-hover cursor-pointer'
      : 'flex items-center justify-between gap-3 w-full px-2 h-6 rounded-xs text-fg-3 text-xs font-ui text-left cursor-not-allowed';
  };
  setEnabled(true);
  return {
    row,
    setCount: (n: number) => {
      count.textContent = String(n);
    },
    setEnabled,
  };
}
