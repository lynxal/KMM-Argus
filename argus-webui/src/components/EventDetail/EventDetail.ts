import { effect } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import {
  type ArgusEvent,
  isCustomEvent,
  isHttpEvent,
  isLogEvent,
} from '../../transport/schema';
import { createHttpTabs, HTTP_TABS } from './tabs/HttpTabs';
import { createLogTabs, LOG_TABS } from './tabs/LogTabs';
import { createCustomTabs, CUSTOM_TABS } from './tabs/CustomTabs';

export interface EventDetailProps {
  readonly store: EventStore;
}

/**
 * Tab router. Switches on the selected event's kind; routes to the
 * corresponding tab view. Empty state when nothing is selected.
 */
export function createEventDetail({ store }: EventDetailProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'flex-1 min-h-0 flex flex-col bg-bg-panel rounded-md border border-border-default overflow-hidden';

  const header = document.createElement('div');
  header.className = 'h-7 flex items-center gap-1 px-2 border-b border-border-default text-fg-2 text-xs font-ui';
  wrapper.appendChild(header);

  const content = document.createElement('div');
  content.className = 'flex-1 min-h-0 overflow-hidden';
  wrapper.appendChild(content);

  effect(() => {
    const id = store.selectedId.value;
    const evt = id ? store.events.value.find((e) => e.id === id) ?? null : null;
    if (!evt) {
      header.innerHTML = '';
      header.append(createEmptyHeader());
      content.innerHTML = '';
      content.appendChild(createNothingSelected());
      return;
    }
    renderSelected(evt);
  });

  function renderSelected(evt: ArgusEvent): void {
    const kind: 'HTTP' | 'LOG' | 'CUSTOM' = evt.source;
    const tabs =
      kind === 'HTTP' ? HTTP_TABS : kind === 'LOG' ? LOG_TABS : CUSTOM_TABS;

    header.innerHTML = '';
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `px-2 h-6 rounded-sm text-xs font-ui ${
        store.detailTab.value[kind] === t ? 'bg-bg-subtle text-fg-1' : 'text-fg-2 hover:text-fg-1'
      } cursor-pointer transition-colors duration-base`;
      btn.textContent = t;
      btn.addEventListener('click', () => {
        store.detailTab.value = { ...store.detailTab.value, [kind]: t };
      });
      header.appendChild(btn);
    }

    const active = store.detailTab.value[kind];
    content.innerHTML = '';
    if (isHttpEvent(evt)) content.appendChild(createHttpTabs({ event: evt, active, store }));
    else if (isLogEvent(evt)) content.appendChild(createLogTabs({ event: evt, active }));
    else if (isCustomEvent(evt)) content.appendChild(createCustomTabs({ event: evt, active }));
  }

  return wrapper;
}

function createEmptyHeader(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'text-fg-3 px-1';
  el.textContent = 'No event selected';
  return el;
}

function createNothingSelected(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'h-full flex flex-col items-center justify-center gap-2 text-fg-3 text-xs font-ui';
  const title = document.createElement('div');
  title.className = 'text-fg-2 font-semibold';
  title.textContent = 'Nothing selected';
  const hint = document.createElement('div');
  hint.textContent = 'Click a row or press j / k to pick one.';
  el.append(title, hint);
  return el;
}
