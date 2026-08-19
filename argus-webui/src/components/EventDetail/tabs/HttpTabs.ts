import type { EventStore } from '../../../store/eventStore';
import {
  type Header,
  type HttpEvent,
  statusClass,
} from '../../../transport/schema';
import { createBodyViewer } from '../../BodyViewer/BodyViewer';
import { buildCurl, type ShortcutBus } from '../../../input/keyboard';
import { redirectChain } from '../../../store/redirects';
import { relatedLogEvents } from '../../../store/related';
import {
  STATUS_BUCKET_DOTS,
  STATUS_BUCKET_TEXT,
} from '../../FilterBar/FilterBar.states';

export const HTTP_TABS = ['Headers', 'Request', 'Response', 'Timing', 'Related Logs', 'Raw'] as const;

export interface HttpTabsProps {
  readonly event: HttpEvent;
  readonly active: string;
  readonly store: EventStore;
  readonly bus: ShortcutBus;
}

export function createHttpTabs({ event, active, store, bus }: HttpTabsProps): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'h-full overflow-auto p-3 flex flex-col gap-3';

  panel.appendChild(renderOverview(event, store));

  switch (active) {
    case 'Headers':
      panel.appendChild(renderHeaders('Request', event.request.headers));
      if (event.response) panel.appendChild(renderHeaders('Response', event.response.headers));
      break;
    case 'Request':
      panel.appendChild(
        createBodyViewer({
          body: event.request.bodyPreview,
          contentType: event.request.contentType,
          sizeBytes: event.request.sizeBytes,
          truncatedTotalBytes: event.request.bodyTruncatedTotalBytes,
          downloadName: `argus-http-${event.id}-request`,
          bus,
        }),
      );
      panel.appendChild(curlBlock(event));
      break;
    case 'Response':
      if (event.response) {
        panel.appendChild(
          createBodyViewer({
            body: event.response.bodyPreview,
            contentType: event.response.contentType,
            sizeBytes: event.response.sizeBytes,
            truncatedTotalBytes: event.response.bodyTruncatedTotalBytes,
            downloadName: `argus-http-${event.id}-response`,
            bus,
          }),
        );
      } else {
        panel.appendChild(textRow('No response — see Error in Raw.'));
      }
      break;
    case 'Timing':
      panel.appendChild(renderTiming(event));
      break;
    case 'Related Logs':
      panel.appendChild(renderRelatedLogs(event, store));
      break;
    case 'Raw':
      panel.appendChild(
        createBodyViewer({
          mode: 'json',
          body: JSON.stringify(event, null, 2),
          contentType: 'application/json',
          downloadName: `argus-http-${event.id}-raw`,
          bus,
        }),
      );
      break;
  }

  return panel;
}

function renderOverview(event: HttpEvent, store: EventStore): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1';
  const title = document.createElement('div');
  title.className = 'text-fg-1 font-semibold text-base font-ui flex items-center gap-2';
  const method = document.createElement('span');
  method.className = 'font-mono text-fg-2';
  method.textContent = event.request.method.toUpperCase();
  const enginePill = document.createElement('span');
  enginePill.className = 'inline-flex items-center px-1.5 h-5 rounded-xs border border-border-default text-xxs font-mono leading-none text-fg-3 uppercase';
  enginePill.textContent = event.engine;
  enginePill.title = `engine: ${event.engine}`;
  const path = document.createElement('span');
  path.className = 'font-mono truncate';
  path.textContent = event.request.path;
  title.append(method, enginePill, path);

  const meta = document.createElement('div');
  meta.className = 'flex items-center gap-2 text-fg-3 text-xs font-mono';
  if (event.response) {
    const bucket = statusClass(event.response.statusCode);
    const pill = document.createElement('span');
    pill.className = `flex items-center gap-1 px-2 h-5 rounded-sm bg-bg-subtle ${STATUS_BUCKET_TEXT[bucket]}`;
    const dot = document.createElement('span');
    dot.className = `ds-conn-dot ${STATUS_BUCKET_DOTS[bucket]}`;
    pill.append(dot, document.createTextNode(`${event.response.statusCode} ${event.response.statusText}`));
    meta.appendChild(pill);
  } else if (event.error) {
    const pill = document.createElement('span');
    pill.className = 'px-2 h-5 flex items-center rounded-sm bg-status-err-bg text-status-err-fg';
    pill.textContent = event.error.throwableClass;
    meta.appendChild(pill);
  }
  const host = document.createElement('span');
  host.textContent = event.request.host;
  const dur = document.createElement('span');
  dur.textContent = event.durationMs != null ? `${event.durationMs} ms` : '—';
  meta.append(host, dur);

  box.append(title, meta);

  // Only for a real chain — a single-hop request gets nothing rather than a
  // one-row list. Lives in the overview, which renders on every tab, because the
  // hops are not adjacent in the event list and this is the only place the whole
  // chain is visible at once.
  const chain = redirectChain(store.events.value, event);
  if (chain.length > 1) box.appendChild(renderRedirectChain(event, chain, store));

  return box;
}

/** Walkable redirect chain: one clickable line per hop, oldest first. */
function renderRedirectChain(
  current: HttpEvent,
  chain: readonly HttpEvent[],
  store: EventStore,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 mt-1';

  const h = document.createElement('div');
  h.className = 'text-fg-3 text-xs font-ui uppercase tracking-wider';
  h.textContent = `Redirect chain · ${chain.length} hops`;
  box.appendChild(h);

  chain.forEach((hop, i) => {
    const isCurrent = hop.id === current.id;
    const line = document.createElement('button');
    line.type = 'button';
    line.className = `flex items-center gap-2 px-1 h-6 rounded-sm font-mono text-xs text-left ${
      isCurrent ? 'bg-bg-subtle text-fg-1' : 'text-fg-2 hover:bg-bg-hover cursor-pointer'
    }`;
    line.disabled = isCurrent;

    const index = document.createElement('span');
    index.className = 'text-fg-3 w-4';
    index.textContent = String(i + 1);

    const bucket = statusClass(hop.response?.statusCode ?? null);
    const status = document.createElement('span');
    status.className = `flex items-center gap-1 ${STATUS_BUCKET_TEXT[bucket]} w-10`;
    const dot = document.createElement('span');
    dot.className = `ds-conn-dot ${STATUS_BUCKET_DOTS[bucket]}`;
    const statusText = document.createElement('span');
    statusText.textContent = hop.response?.statusCode != null ? String(hop.response.statusCode) : 'ERR';
    status.append(dot, statusText);

    const target = document.createElement('span');
    target.className = 'flex-1 truncate';
    target.textContent = `${hop.request.method.toUpperCase()} ${hop.request.host}${hop.request.path}`;

    const dur = document.createElement('span');
    dur.className = 'text-fg-3 w-16 text-right tabular-nums';
    dur.textContent = hop.durationMs != null ? `${hop.durationMs} ms` : '—';

    line.append(index, status, target, dur);
    line.addEventListener('click', () => {
      store.selectionSource.value = 'mouse';
      store.selectedId.value = hop.id;
    });
    box.appendChild(line);
  });

  return box;
}

function renderHeaders(label: string, headers: readonly Header[]): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1';
  const h = document.createElement('div');
  h.className = 'text-fg-3 text-xs font-ui uppercase tracking-wider';
  h.textContent = label;
  box.appendChild(h);

  const table = document.createElement('div');
  table.className = 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 font-mono text-xs';
  for (const header of headers) {
    const k = document.createElement('div');
    k.className = 'text-fg-2 truncate';
    k.textContent = header.name;
    const v = document.createElement('div');
    v.className = `${header.redacted ? 'text-fg-3 italic' : 'text-fg-1'} truncate`;
    v.textContent = header.value;
    table.append(k, v);
  }
  box.appendChild(table);
  return box;
}

function renderTiming(event: HttpEvent): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-2';
  const h = document.createElement('div');
  h.className = 'text-fg-3 text-xs font-ui uppercase tracking-wider';
  h.textContent = 'Timing';
  box.appendChild(h);
  const dur = event.durationMs ?? 0;
  const bar = document.createElement('div');
  bar.className = 'h-3 rounded-sm bg-bg-subtle overflow-hidden flex';
  const connect = segment('Connect', 0.15, 'bg-wf-connect');
  const wait = segment('Wait', 0.55, 'bg-wf-wait');
  const download = segment('Download', 0.3, 'bg-wf-receive');
  bar.append(connect, wait, download);

  const total = document.createElement('div');
  total.className = 'text-fg-3 text-xs font-mono';
  total.textContent = `total ${dur} ms`;

  const legend = document.createElement('div');
  legend.className = 'flex flex-wrap gap-3 text-fg-2 text-xs font-ui';
  legend.append(
    legendItem('Connect', 'bg-wf-connect'),
    legendItem('Wait', 'bg-wf-wait'),
    legendItem('Download', 'bg-wf-receive'),
  );

  box.append(bar, total, legend);
  return box;
}

function segment(label: string, weight: number, color: string): HTMLElement {
  const el = document.createElement('div');
  el.className = color;
  el.style.flexGrow = String(weight);
  el.title = label;
  return el;
}

function legendItem(label: string, color: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'flex items-center gap-1';
  const swatch = document.createElement('span');
  swatch.className = `inline-block w-2 h-2 rounded-xs ${color}`;
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(swatch, text);
  return wrapper;
}

function renderRelatedLogs(event: HttpEvent, store: EventStore): HTMLElement {
  const related = relatedLogEvents(store.events.value, event);
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 font-mono text-xs';

  // No correlation id means there is nothing to relate — say that, and say how to
  // get one. Guessing from timestamps would only look like an answer.
  if (related.correlationId == null) {
    box.appendChild(textRow('No correlation id on this call.'));
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
    box.appendChild(textRow('No log events share this correlation id.'));
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
    });
    box.appendChild(line);
  }
  return box;
}

/**
 * The cURL command as selectable text rather than behind a Copy button.
 *
 * `navigator.clipboard` only exists in a secure context, and the UI is normally
 * served by the device over plain http on a LAN address — so the old button's
 * `navigator.clipboard.writeText` threw on the property access and copied
 * nothing. Showing the command sidesteps the API entirely: `select-all` means
 * one click selects the whole command, then ⌘C is the browser's own copy.
 */
function curlBlock(event: HttpEvent): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-2 min-h-0';

  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-2 h-6 text-fg-2 text-xs font-mono';
  const badge = document.createElement('span');
  badge.className = 'px-2 h-5 flex items-center rounded-sm bg-bg-subtle text-fg-2';
  badge.textContent = 'CURL';
  const hint = document.createElement('span');
  hint.className = 'text-fg-3';
  hint.textContent = 'click to select · ⌘C to copy';
  toolbar.append(badge, hint);
  box.appendChild(toolbar);

  const pre = document.createElement('pre');
  pre.className =
    'select-all cursor-text overflow-auto bg-bg-sunken rounded-md border border-border-subtle p-3 font-mono text-xs text-fg-1 whitespace-pre-wrap break-all';
  pre.textContent = buildCurl(event);
  box.appendChild(pre);
  return box;
}

function textRow(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-fg-3 text-xs font-ui';
  el.textContent = text;
  return el;
}
