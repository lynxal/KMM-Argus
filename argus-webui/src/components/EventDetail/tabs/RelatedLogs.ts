import type { EventStore } from '../../../store/eventStore';
import {
  isHttpEvent,
  statusClass,
  type ArgusEvent,
  type HttpEvent,
  type LogEvent,
} from '../../../transport/schema';
import { correlationGroup } from '../../../store/related';
import { STATUS_BUCKET_TEXT } from '../../FilterBar/FilterBar.states';

/**
 * The "Related Logs" panel, shared by the HTTP and LOG tab sets.
 *
 * correlationId is symmetric — a log carries the same one as the call it was
 * emitted under — so the panel belongs to every member of a group, not just the
 * call. Without it on logs, following a related event from this list landed on an
 * event that could not answer the question you were asking, and the way back to
 * the rest of the group disappeared with the tab.
 *
 * It lists the whole group, calls included and the selected event in place, even
 * though the tab is still labelled "Related Logs": a `withCorrelation { … }` scope
 * is one unit of work, and hiding its calls meant a log could never lead back to
 * the request it ran under. The label is deliberate, not an oversight — leave it be.
 */
export function renderRelatedLogs(event: HttpEvent | LogEvent, store: EventStore): HTMLElement {
  const group = correlationGroup(store.events.value, event);
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 font-mono text-xs';
  box.dataset['relatedLogs'] = '';

  // No correlation id means there is nothing to relate — say that, and say how to
  // get one. Guessing from timestamps would only look like an answer.
  if (group.correlationId == null) {
    box.appendChild(textRow('No correlation id on this event.'));
    box.appendChild(
      textRow('Wrap the call in withCorrelation { … } to tie its log lines to it.'),
    );
    return box;
  }

  const caption = document.createElement('div');
  caption.className = 'text-fg-3 text-xs font-ui';
  caption.textContent = `Correlation id ${group.correlationId}`;
  box.appendChild(caption);

  // One member is the selected event itself, so a group of one is a group of none.
  if (group.events.length <= 1) {
    box.appendChild(textRow('No other events share this correlation id.'));
    return box;
  }

  for (const e of group.events) {
    box.appendChild(relatedRow(e, store, e.id === event.id));
  }
  return box;
}

/**
 * One group member. The kind marker is load-bearing now the list is mixed — a bare
 * line of text gives no clue whether clicking it lands on a call or a log.
 *
 * The row for the event being inspected is rendered as a plain element, not a
 * button: it is there to show position in the group, and clicking it would be a
 * no-op that still looks like a control. Bold plus the accent colour rather than a
 * selected-row background — this marks where you are, it is not a second selection
 * control competing with the event list's.
 */
function relatedRow(event: ArgusEvent, store: EventStore, current: boolean): HTMLElement {
  const line = document.createElement(current ? 'div' : 'button');
  if (!current) (line as HTMLButtonElement).type = 'button';
  line.className = current
    ? 'flex items-center gap-2 text-left px-1 h-5 rounded-sm text-accent-fg font-bold'
    : 'flex items-center gap-2 text-left px-1 h-5 rounded-sm hover:bg-bg-hover cursor-pointer text-fg-2';
  line.dataset['relatedKind'] = event.source;
  if (current) {
    line.dataset['relatedCurrent'] = '';
    line.setAttribute('aria-current', 'true');
  }

  const kind = document.createElement('span');
  kind.className = `${current ? '' : 'text-fg-3'} w-9 flex-none`;
  kind.textContent = event.source === 'HTTP' ? 'HTTP' : 'LOG';
  line.appendChild(kind);

  const label = document.createElement('span');
  label.className = 'truncate';
  line.appendChild(label);

  if (isHttpEvent(event)) {
    label.textContent = `${event.request.method} ${event.request.path}`;
    const status = document.createElement('span');
    const code = event.response?.statusCode;
    status.className = current ? 'flex-none' : `flex-none ${STATUS_BUCKET_TEXT[statusClass(code)]}`;
    status.textContent = code != null ? String(code) : 'ERR';
    line.appendChild(status);
  } else if (event.source === 'LOG') {
    const log = event as LogEvent;
    label.textContent = `${log.level} [${log.tag ?? ''}] ${log.message}`;
  } else {
    label.textContent = event.label;
  }

  if (current) return line;

  line.addEventListener('click', () => {
    store.selectionSource.value = 'mouse';
    store.selectedId.value = event.id;
    // Stay on the tab the click came from. Walking a correlation group is the
    // whole point of this list, and landing on the target's default tab every hop
    // means re-opening this one to take the next step. Keyed by the target's kind,
    // since detailTab is tracked per kind.
    store.detailTab.value = { ...store.detailTab.value, [event.source]: 'Related Logs' };
  });
  return line;
}

function textRow(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-fg-3 text-xs font-ui';
  el.textContent = text;
  return el;
}
