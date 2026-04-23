import type { LogEvent } from '../../../transport/schema';
import { LOG_LEVEL_LABELS } from '../../../transport/schema';
import { createBodyViewer } from '../../BodyViewer/BodyViewer';
import { LEVEL_TONES } from '../../FilterBar/FilterBar.states';

export const LOG_TABS = ['Message', 'Payload', 'Stack Trace', 'Raw'] as const;

export interface LogTabsProps {
  readonly event: LogEvent;
  readonly active: string;
}

export function createLogTabs({ event, active }: LogTabsProps): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'h-full overflow-auto p-3 flex flex-col gap-3';

  panel.appendChild(renderHeader(event));

  switch (active) {
    case 'Message': {
      const msg = document.createElement('pre');
      msg.className = 'font-mono text-sm text-fg-1 whitespace-pre-wrap break-words';
      msg.textContent = event.message;
      panel.appendChild(msg);
      break;
    }
    case 'Payload': {
      if (Object.keys(event.payload).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-fg-3 text-xs font-ui';
        empty.textContent = 'No payload.';
        panel.appendChild(empty);
      } else {
        const table = document.createElement('div');
        table.className = 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 font-mono text-xs';
        for (const [k, v] of Object.entries(event.payload)) {
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
    case 'Stack Trace': {
      if (!event.throwable) {
        const empty = document.createElement('div');
        empty.className = 'text-fg-3 text-xs font-ui';
        empty.textContent = 'No stack trace.';
        panel.appendChild(empty);
      } else {
        panel.appendChild(renderThrowable(event.throwable));
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

function renderHeader(event: LogEvent): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex items-center gap-2 text-fg-3 text-xs font-mono';
  const tone = LEVEL_TONES[event.level];
  const pill = document.createElement('span');
  pill.className = `px-2 h-5 flex items-center rounded-sm ${tone.fg} ${tone.bg} font-semibold`;
  pill.textContent = LOG_LEVEL_LABELS[event.level];
  box.appendChild(pill);
  if (event.tag) {
    const tag = document.createElement('span');
    tag.textContent = `[${event.tag}]`;
    box.appendChild(tag);
  }
  const ts = document.createElement('span');
  ts.textContent = new Date(event.timestamp).toISOString();
  box.appendChild(ts);
  return box;
}

function renderThrowable(t: import('../../../transport/schema').ThrowableInfo): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-2';
  const header = document.createElement('div');
  header.className = 'font-mono text-sm text-log-error-fg';
  header.textContent = `${t.className}${t.message ? ': ' + t.message : ''}`;
  box.appendChild(header);
  const pre = document.createElement('pre');
  pre.className = 'font-mono text-xs text-fg-1 whitespace-pre-wrap';
  pre.textContent = t.stackTrace;
  box.appendChild(pre);
  if (t.cause) {
    const sep = document.createElement('div');
    sep.className = 'text-fg-3 text-xs font-ui';
    sep.textContent = 'Caused by:';
    box.append(sep, renderThrowable(t.cause));
  }
  return box;
}
