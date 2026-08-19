import type { EventStore } from '../../../store/eventStore';
import { isLogEvent, type HttpEvent, type LogEvent } from '../../../transport/schema';
import { relatedLogEvents } from '../../../store/related';

/**
 * The "Related Logs" panel, shared by the HTTP and LOG tab sets.
 *
 * correlationId is symmetric — a log carries the same one as the call it was
 * emitted under — so the panel belongs to every member of a group, not just the
 * call. Without it on logs, following a related log from this list landed on an
 * event that could not answer the question you were asking, and the way back to
 * the rest of the group disappeared with the tab.
 */
export function renderRelatedLogs(event: HttpEvent | LogEvent, store: EventStore): HTMLElement {
  const related = relatedLogEvents(store.events.value, event);
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

  if (related.logs.length === 0) {
    // "other" only when the selection is itself one of them, or the sentence
    // contradicts the log the user is looking at.
    box.appendChild(
      textRow(
        isLogEvent(event)
          ? 'No other log events share this correlation id.'
          : 'No log events share this correlation id.',
      ),
    );
    return box;
  }

  for (const e of related.logs) {
    const line = document.createElement('button');
    line.type = 'button';
    line.className =
      'text-fg-2 truncate text-left px-1 h-5 rounded-sm hover:bg-bg-hover cursor-pointer';
    line.textContent = `${e.level} [${e.tag ?? ''}] ${e.message}`;
    line.addEventListener('click', () => {
      store.selectionSource.value = 'mouse';
      store.selectedId.value = e.id;
      // Stay on the tab the click came from. Walking a correlation group is the
      // whole point of this list, and landing on Message every hop means
      // re-opening the tab to take the next step.
      store.detailTab.value = { ...store.detailTab.value, LOG: 'Related Logs' };
    });
    box.appendChild(line);
  }
  return box;
}

function textRow(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-fg-3 text-xs font-ui';
  el.textContent = text;
  return el;
}
