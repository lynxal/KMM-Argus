import { computed, effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import { cloneFilters } from '../../store/filters';
import { isCustomEvent } from '../../transport/schema';

const MAX_LABELS = 50;

/**
 * Phase 3: dropdown that lists every CustomEvent.sourceLabel currently in the
 * event buffer, with checkboxes that AND-compose with the source chips. `null`
 * `filters.sourceLabels` means "no restriction"; selecting at least one label
 * switches to a whitelist.
 *
 * The popover is portaled to `document.body` with `position: fixed` rather than
 * absolutely positioned inside the FilterBar — the bar has `overflow-x-auto`,
 * which (per CSS spec) promotes y-overflow to clipping too and would otherwise
 * truncate the popover to the bar's 36px height.
 */
export function createSourceLabelDropdown(store: EventStore): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className =
    'flex items-center gap-1 px-2 h-6 rounded-sm border border-border-default text-fg-2 text-xs font-ui hover:bg-bg-hover';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerLabel = document.createElement('span');
  trigger.appendChild(triggerLabel);
  const caret = document.createElement('span');
  caret.className = 'text-fg-3 text-[10px]';
  caret.textContent = '▾';
  trigger.appendChild(caret);
  wrap.appendChild(trigger);

  const popover = document.createElement('div');
  popover.className =
    'fixed z-popover bg-bg-panel border border-border-default rounded-sm shadow-md p-2 min-w-44 max-h-72 overflow-auto flex-col gap-1';
  popover.style.display = 'none';
  popover.setAttribute('role', 'listbox');

  const observedLabels = computed(() => {
    const set = new Set<string>();
    for (const e of store.events.value) {
      if (isCustomEvent(e)) {
        set.add(e.sourceLabel);
        if (set.size >= MAX_LABELS) break;
      }
    }
    return [...set].sort();
  });

  // Trigger label reflects current selection state.
  effect(() => {
    const labels = store.filters.value.sourceLabels;
    const observed = observedLabels.value.length;
    if (labels === null) {
      triggerLabel.textContent = `Labels: all${observed ? ` (${observed})` : ''}`;
    } else if (labels.size === 0) {
      triggerLabel.textContent = 'Labels: none';
    } else {
      triggerLabel.textContent = `Labels: ${labels.size} of ${observed}`;
    }
  });

  // Build / rebuild popover list when observedLabels or selection changes.
  effect(() => {
    const labels = observedLabels.value;
    const selection = store.filters.value.sourceLabels;
    popover.replaceChildren();

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 pb-1 border-b border-border-subtle text-xs font-ui';
    const allLink = document.createElement('a');
    allLink.className = 'text-fg-link cursor-pointer hover:underline';
    allLink.textContent = 'All';
    allLink.addEventListener('click', (e) => {
      e.preventDefault();
      const mut = cloneFilters(store.filters.value);
      mut.sourceLabels = null;
      store.filters.value = mut;
    });
    const noneLink = document.createElement('a');
    noneLink.className = 'text-fg-link cursor-pointer hover:underline';
    noneLink.textContent = 'None';
    noneLink.addEventListener('click', (e) => {
      e.preventDefault();
      const mut = cloneFilters(store.filters.value);
      mut.sourceLabels = new Set();
      store.filters.value = mut;
    });
    actions.append(allLink, noneLink);
    popover.appendChild(actions);

    if (labels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-fg-3 text-xs font-ui italic px-1 py-2';
      empty.textContent = 'No CUSTOM events yet';
      popover.appendChild(empty);
      return;
    }

    for (const label of labels) {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-xs font-mono text-fg-1 px-1 py-1 rounded-xs hover:bg-bg-hover cursor-pointer';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'accent-fg-link';
      cb.checked = selection === null ? true : selection.has(label);
      cb.addEventListener('change', () => {
        const mut = cloneFilters(store.filters.value);
        const set = mut.sourceLabels === null ? new Set<string>(labels) : new Set(mut.sourceLabels);
        if (cb.checked) set.add(label);
        else set.delete(label);
        // If user landed back on "all observed labels checked", collapse to null.
        const observedNow = new Set(labels);
        const allObservedChecked = [...observedNow].every((l) => set.has(l));
        const onlyObserved = [...set].every((l) => observedNow.has(l));
        mut.sourceLabels = allObservedChecked && onlyObserved ? null : set;
        store.filters.value = mut;
      });
      const text = document.createElement('span');
      text.textContent = label;
      row.append(cb, text);
      popover.appendChild(row);
    }
  });

  let open = false;
  const positionPopover = () => {
    const rect = trigger.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 4}px`;
  };
  const onScroll = () => { if (open) positionPopover(); };
  const onResize = () => { if (open) positionPopover(); };

  const setOpen = (next: boolean) => {
    open = next;
    if (open) {
      if (!popover.isConnected) document.body.appendChild(popover);
      positionPopover();
      popover.style.display = 'flex';
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
    } else {
      popover.style.display = 'none';
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    }
    trigger.setAttribute('aria-expanded', String(open));
  };

  trigger.addEventListener('click', () => setOpen(!open));

  // Click-outside / Escape closes.
  const onDocClick = (e: MouseEvent) => {
    if (!open) return;
    const target = e.target as Node;
    if (wrap.contains(target) || popover.contains(target)) return;
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') setOpen(false);
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  return wrap;
}
