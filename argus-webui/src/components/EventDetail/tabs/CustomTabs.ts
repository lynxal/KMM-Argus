import type { CustomEvent as ArgusCustomEvent } from '../../../transport/schema';
import { createBodyViewer } from '../../BodyViewer/BodyViewer';

export const CUSTOM_TABS = ['Payload', 'Metadata', 'Raw'] as const;

export interface CustomTabsProps {
  readonly event: ArgusCustomEvent;
  readonly active: string;
}

/** Deliberately minimal. */
export function createCustomTabs({ event, active }: CustomTabsProps): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'h-full overflow-auto p-3 flex flex-col gap-3';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-2 text-fg-3 text-xs font-mono';
  const label = document.createElement('span');
  label.className = 'text-fg-2';
  label.textContent = `${event.sourceLabel}.${event.label}`;
  header.append(label, document.createTextNode(event.direction));
  panel.appendChild(header);

  switch (active) {
    case 'Payload':
      panel.appendChild(createBodyViewer({ mode: 'auto', body: event.payload }));
      break;
    case 'Metadata': {
      if (Object.keys(event.metadata).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-fg-3 text-xs font-ui';
        empty.textContent = 'No metadata.';
        panel.appendChild(empty);
      } else {
        const table = document.createElement('div');
        table.className = 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 font-mono text-xs';
        for (const [k, v] of Object.entries(event.metadata)) {
          const kEl = document.createElement('div');
          kEl.className = 'text-fg-2 truncate';
          kEl.textContent = k;
          const vEl = document.createElement('div');
          vEl.className = 'text-fg-1 truncate';
          vEl.textContent = v;
          table.append(kEl, vEl);
        }
        panel.appendChild(table);
      }
      break;
    }
    case 'Raw':
      panel.appendChild(
        createBodyViewer({ mode: 'json', body: JSON.stringify(event, null, 2), contentType: 'application/json' }),
      );
      break;
  }

  return panel;
}
