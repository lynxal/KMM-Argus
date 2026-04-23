import { effect } from '@preact/signals-core';
import { BINDINGS, type ShortcutBus } from '../../input/keyboard';
import { createKbd } from '../Primitives/Primitives';

export interface ShortcutsModalProps {
  readonly bus: ShortcutBus;
}

/**
 * Renders a modal with the full shortcut table, grouped by group. Reads from
 * the same BINDINGS array the keyboard handler uses — so the modal can't
 * drift from the handler.
 */
export function createShortcutsModal({ bus }: ShortcutsModalProps): HTMLElement {
  const root = document.createElement('div');
  root.className = 'fixed inset-0 z-50 hidden items-center justify-center ds-scrim';
  root.addEventListener('click', (e) => {
    if (e.target === root) bus.openShortcuts.value = false;
  });

  const panel = document.createElement('div');
  panel.className =
    'ds-modal-shortcuts bg-bg-overlay border border-border-default rounded-md shadow-lg flex flex-col';
  root.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-3 h-10 border-b border-border-default';
  const title = document.createElement('div');
  title.className = 'text-fg-1 font-semibold text-base font-ui';
  title.textContent = 'Shortcuts';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-fg-2 hover:text-fg-1 text-base leading-none cursor-pointer';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => {
    bus.openShortcuts.value = false;
  });
  header.append(title, close);
  panel.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-xs font-ui';
  panel.appendChild(grid);

  const groups = new Map<string, typeof BINDINGS[number][]>();
  for (const b of BINDINGS) {
    const arr = groups.get(b.group) ?? [];
    arr.push(b);
    groups.set(b.group, arr);
  }

  for (const [group, entries] of groups) {
    const col = document.createElement('div');
    col.className = 'flex flex-col gap-1';
    const label = document.createElement('div');
    label.className = 'text-fg-3 font-ui uppercase tracking-wider text-xs mb-1';
    label.textContent = group;
    col.appendChild(label);
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-3';
      const desc = document.createElement('span');
      desc.className = 'text-fg-1 truncate';
      desc.textContent = e.description;
      const kbdWrap = document.createElement('span');
      kbdWrap.className = 'flex items-center gap-1';
      for (const part of e.label.split(' ')) {
        kbdWrap.appendChild(createKbd(part));
      }
      row.append(desc, kbdWrap);
      col.appendChild(row);
    }
    grid.appendChild(col);
  }

  effect(() => {
    root.classList.toggle('hidden', !bus.openShortcuts.value);
    root.classList.toggle('flex', bus.openShortcuts.value);
  });

  return root;
}
