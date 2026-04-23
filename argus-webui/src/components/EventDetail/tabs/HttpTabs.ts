import type { EventStore } from '../../../store/eventStore';
import {
  type Header,
  type HttpEvent,
  isLogEvent,
  statusClass,
} from '../../../transport/schema';
import { createBodyViewer } from '../../BodyViewer/BodyViewer';
import { buildCurl } from '../../../input/keyboard';
import {
  STATUS_BUCKET_DOTS,
  STATUS_BUCKET_TEXT,
} from '../../FilterBar/FilterBar.states';

export const HTTP_TABS = ['Headers', 'Request', 'Response', 'Timing', 'Related Logs', 'Raw'] as const;

export interface HttpTabsProps {
  readonly event: HttpEvent;
  readonly active: string;
  readonly store: EventStore;
}

export function createHttpTabs({ event, active, store }: HttpTabsProps): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'h-full overflow-auto p-3 flex flex-col gap-3';

  panel.appendChild(renderOverview(event));

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
        }),
      );
      panel.appendChild(copyCurlRow(event));
      break;
    case 'Response':
      if (event.response) {
        panel.appendChild(
          createBodyViewer({
            body: event.response.bodyPreview,
            contentType: event.response.contentType,
            sizeBytes: event.response.sizeBytes,
            truncatedTotalBytes: event.response.bodyTruncatedTotalBytes,
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
        createBodyViewer({ mode: 'json', body: JSON.stringify(event, null, 2), contentType: 'application/json' }),
      );
      break;
  }

  return panel;
}

function renderOverview(event: HttpEvent): HTMLElement {
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1';
  const title = document.createElement('div');
  title.className = 'text-fg-1 font-semibold text-base font-ui flex items-center gap-2';
  const method = document.createElement('span');
  method.className = 'font-mono text-fg-2';
  method.textContent = event.request.method.toUpperCase();
  const path = document.createElement('span');
  path.className = 'font-mono truncate';
  path.textContent = event.request.path;
  title.append(method, path);

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
  const legend = document.createElement('div');
  legend.className = 'text-fg-3 text-xs font-mono';
  legend.textContent = `total ${dur} ms`;
  box.append(bar, legend);
  return box;
}

function segment(_label: string, weight: number, color: string): HTMLElement {
  const el = document.createElement('div');
  el.className = color;
  el.style.flexGrow = String(weight);
  return el;
}

function renderRelatedLogs(event: HttpEvent, store: EventStore): HTMLElement {
  const window = 500; // ± 500ms heuristic until Phase 2 correlation lands.
  const center = event.timestamp;
  const related = store.events.value.filter(
    (e) => isLogEvent(e) && Math.abs(e.timestamp - center) <= window,
  );
  const box = document.createElement('div');
  box.className = 'flex flex-col gap-1 font-mono text-xs';
  if (related.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-fg-3';
    empty.textContent = 'No correlated log events within ±500 ms.';
    box.appendChild(empty);
    return box;
  }
  for (const e of related) {
    const line = document.createElement('div');
    line.className = 'text-fg-2 truncate';
    if (isLogEvent(e)) {
      line.textContent = `${e.level} [${e.tag ?? ''}] ${e.message}`;
    }
    box.appendChild(line);
  }
  return box;
}

function copyCurlRow(event: HttpEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'px-2 h-6 rounded-sm bg-bg-subtle text-fg-1 text-xs font-ui hover:bg-bg-active cursor-pointer';
  btn.textContent = 'Copy as cURL';
  btn.addEventListener('click', () => {
    void navigator.clipboard.writeText(buildCurl(event)).catch(() => undefined);
  });
  const har = document.createElement('button');
  har.type = 'button';
  har.className = 'px-2 h-6 rounded-sm bg-bg-subtle text-fg-1 text-xs font-ui hover:bg-bg-active cursor-pointer';
  har.textContent = 'Download HAR';
  har.addEventListener('click', () => downloadHar(event));
  row.append(btn, har);
  return row;
}

function textRow(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-fg-3 text-xs font-ui';
  el.textContent = text;
  return el;
}

function downloadHar(event: HttpEvent): void {
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Argus', version: '1.0' },
      entries: [
        {
          startedDateTime: new Date(event.timestamp).toISOString(),
          time: event.durationMs ?? 0,
          request: {
            method: event.request.method,
            url: event.request.url,
            httpVersion: 'HTTP/1.1',
            headers: event.request.headers.map((h) => ({ name: h.name, value: h.value })),
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: event.request.sizeBytes ?? -1,
            postData: event.request.bodyPreview
              ? { mimeType: event.request.contentType ?? 'application/octet-stream', text: event.request.bodyPreview }
              : undefined,
          },
          response: event.response
            ? {
                status: event.response.statusCode,
                statusText: event.response.statusText,
                httpVersion: 'HTTP/1.1',
                headers: event.response.headers.map((h) => ({ name: h.name, value: h.value })),
                cookies: [],
                content: {
                  size: event.response.sizeBytes ?? -1,
                  mimeType: event.response.contentType ?? 'application/octet-stream',
                  text: event.response.bodyPreview ?? '',
                },
                redirectURL: '',
                headersSize: -1,
                bodySize: event.response.sizeBytes ?? -1,
              }
            : undefined,
          cache: {},
          timings: {
            send: 0,
            wait: event.durationMs ?? 0,
            receive: 0,
          },
        },
      ],
    },
  };
  const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${event.id}.har`;
  a.click();
  URL.revokeObjectURL(a.href);
}
