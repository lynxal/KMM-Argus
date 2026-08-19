import type { EventStore } from '../../../store/eventStore';
import {
  isHttpEvent,
  statusClass,
  type ArgusEvent,
  type HttpEvent,
  type LogEvent,
} from '../../../transport/schema';
import { relatedEvents } from '../../../store/related';
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
 * It lists the whole group, calls included, even though the tab is still labelled
 * "Related Logs": a `withCorrelation { … }` scope is one unit of work, and hiding
 * its calls meant a log could never lead back to the request it ran under. The
 * label is deliberate, not an oversight — leave it be.
 */
export function renderRelatedLogs(event: HttpEvent | LogEvent, store: EventStore): HTMLElement {
  const related = relatedEvents(store.events.value, event);
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 font-mono text-xs';
  box.dataset['relatedLogs'] = '';

  // No correlation id means there is nothing to relate — say that, and say how to
  // get one. Guessing from timestamps would only look like an answer.
  if (related.correlationId == null) {
    box.appendChild(textRow('No correlation id on this event.'));
    box.appendChild(
      textRow('Wrap the call in withCorrelation { … } to tie its log lines to it.'),
    );
    return box;
  }

  const caption = document.createElement('div');
  caption.className = 'text-fg-3 text-xs font-ui';
  caption.textContent = `Correlation id ${related.correlationId}`;
  box.appendChild(caption);

  if (related.events.length === 0) {
    box.appendChild(textRow('No other events share this correlation id.'));
    return box;
  }

  for (const e of related.events) {
    box.appendChild(relatedRow(e, store));
  }
  return box;
}

/**
 * One group member. The kind marker is load-bearing now the list is mixed — a
 * bare line of text gives no clue whether clicking it lands on a call or a log.
 */
function relatedRow(event: ArgusEvent, store: EventStore): HTMLElement {
  const line = document.createElement('button');
  line.type = 'button';
  line.className =
    'flex items-center gap-2 text-left px-1 h-5 rounded-sm hover:bg-bg-hover cursor-pointer text-fg-2';
  line.dataset['relatedKind'] = event.source;

  const kind = document.createElement('span');
  kind.className = 'text-fg-3 w-9 flex-none';
  kind.textContent = event.source === 'HTTP' ? 'HTTP' : 'LOG';
  line.appendChild(kind);

  const label = document.createElement('span');
  label.className = 'truncate';
  line.appendChild(label);

  if (isHttpEvent(event)) {
    label.textContent = `${event.request.method} ${event.request.path}`;
    const status = document.createElement('span');
    const code = event.response?.statusCode;
    status.className = `flex-none ${STATUS_BUCKET_TEXT[statusClass(code)]}`;
    status.textContent = code != null ? String(code) : 'ERR';
    line.appendChild(status);
  } else if (event.source === 'LOG') {
    const log = event as LogEvent;
    label.textContent = `${log.level} [${log.tag ?? ''}] ${log.message}`;
  } else {
    label.textContent = event.label;
  }

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
