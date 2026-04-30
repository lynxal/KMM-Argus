import {
  type ArgusEvent,
  isCustomEvent,
  isHttpEvent,
  isLogEvent,
  LOG_LEVEL_LABELS,
  statusClass,
} from '../../transport/schema';
import { createSrcBadge } from '../Primitives/Primitives';
import {
  LEVEL_TONES,
  METHOD_COLORS,
  STATUS_BUCKET_DOTS,
  STATUS_BUCKET_TEXT,
} from '../FilterBar/FilterBar.states';

export interface RowContext {
  readonly selectedId: string | null;
  readonly selectionSource: 'keyboard' | 'mouse';
  readonly textQuery: string;
  readonly showCorrelationId: boolean;
  readonly onClick: (event: ArgusEvent) => void;
}

const ROW_CLASS_BASE = 'flex items-center gap-2 px-2 cursor-pointer border-b border-border-subtle text-xs font-ui';
const ROW_CLASS_HOVER = 'hover:bg-bg-hover';
const ROW_CLASS_SELECTED = 'bg-bg-selected';
const ROW_CLASS_SELECTED_KB = 'bg-bg-selected-kb ds-row-rail';

export function createEventRow(event: ArgusEvent, ctx: RowContext): HTMLElement {
  const row = document.createElement('div');
  row.dataset['eventId'] = event.id;
  row.appendChild(createSrcBadge(event.source));

  if (ctx.showCorrelationId) {
    row.appendChild(createCorrelationCell(event));
  }

  if (isHttpEvent(event)) {
    const method = document.createElement('span');
    const m = (event.request.method.toUpperCase() as keyof typeof METHOD_COLORS) ?? 'OTHER';
    method.className = `${METHOD_COLORS[m] ?? 'text-fg-2'} font-mono w-10`;
    method.textContent = event.request.method.toUpperCase().slice(0, 6);
    row.appendChild(method);

    row.appendChild(createEngineChip(event.engine));

    const bucket = statusClass(event.response?.statusCode ?? null);
    const statusEl = document.createElement('span');
    statusEl.className = `flex items-center gap-1 ${STATUS_BUCKET_TEXT[bucket]} font-mono w-10`;
    const dot = document.createElement('span');
    dot.className = `ds-conn-dot ${STATUS_BUCKET_DOTS[bucket]}`;
    statusEl.append(dot);
    const statusText = document.createElement('span');
    statusText.textContent = event.response?.statusCode != null ? String(event.response.statusCode) : 'ERR';
    statusEl.appendChild(statusText);
    row.appendChild(statusEl);

    const text = document.createElement('span');
    text.className = 'flex-1 font-mono truncate';
    const host = document.createElement('span');
    host.className = 'text-fg-3';
    host.textContent = event.request.host;
    const sep = document.createElement('span');
    sep.className = 'text-fg-3';
    sep.textContent = ' ';
    const path = document.createElement('span');
    path.className = 'text-fg-1';
    renderHighlighted(path, event.request.path, ctx.textQuery);
    text.append(host, sep, path);
    row.appendChild(text);

    const meta = document.createElement('span');
    meta.className = 'text-fg-3 font-mono text-xs w-24 text-right tabular-nums';
    meta.textContent = event.durationMs != null ? `${event.durationMs} ms` : '—';
    row.appendChild(meta);
  } else if (isLogEvent(event)) {
    const level = document.createElement('span');
    const tone = LEVEL_TONES[event.level];
    level.className = `${tone.fg} font-mono w-10 uppercase`;
    level.textContent = LOG_LEVEL_LABELS[event.level];
    row.appendChild(level);

    const spacer = document.createElement('span');
    spacer.className = 'w-10';
    row.appendChild(spacer);

    const text = document.createElement('span');
    text.className = 'flex-1 font-mono truncate';
    const tagEl = document.createElement('span');
    tagEl.className = 'text-fg-3';
    tagEl.textContent = event.tag ? `[${event.tag}] ` : '';
    const msgEl = document.createElement('span');
    msgEl.className = 'text-fg-1';
    renderHighlighted(msgEl, event.message, ctx.textQuery);
    text.append(tagEl, msgEl);
    row.appendChild(text);

    const meta = document.createElement('span');
    meta.className = 'text-fg-3 font-mono text-xs w-24 text-right tabular-nums';
    meta.textContent = formatTime(event.timestamp);
    row.appendChild(meta);
  } else if (isCustomEvent(event)) {
    const label = document.createElement('span');
    label.className = 'text-fg-2 font-mono w-10 truncate';
    label.textContent = event.sourceLabel.slice(0, 8);
    row.appendChild(label);

    const spacer = document.createElement('span');
    spacer.className = 'w-10';
    row.appendChild(spacer);

    const text = document.createElement('span');
    text.className = 'flex-1 font-mono truncate';
    const nameEl = document.createElement('span');
    nameEl.className = 'text-fg-1';
    nameEl.textContent = event.label + ' ';
    const payEl = document.createElement('span');
    payEl.className = 'text-fg-3';
    renderHighlighted(payEl, event.payload, ctx.textQuery);
    text.append(nameEl, payEl);
    row.appendChild(text);

    const meta = document.createElement('span');
    meta.className = 'text-fg-3 font-mono text-xs w-24 text-right tabular-nums';
    meta.textContent = formatTime(event.timestamp);
    row.appendChild(meta);
  }

  const selected = ctx.selectedId === event.id;
  const classes = [ROW_CLASS_BASE, ROW_CLASS_HOVER];
  if (selected) {
    classes.push(ctx.selectionSource === 'keyboard' ? ROW_CLASS_SELECTED_KB : ROW_CLASS_SELECTED);
  }
  row.className = classes.join(' ');
  row.addEventListener('click', () => ctx.onClick(event));
  return row;
}

function renderHighlighted(host: HTMLElement, text: string, query: string): void {
  host.textContent = '';
  const q = query.trim();
  if (!q) {
    host.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      host.appendChild(document.createTextNode(text.slice(i)));
      break;
    }
    if (idx > i) host.appendChild(document.createTextNode(text.slice(i, idx)));
    const hit = document.createElement('mark');
    hit.className = 'bg-syn-match text-fg-1 rounded-xs';
    hit.textContent = text.slice(idx, idx + needle.length);
    host.appendChild(hit);
    i = idx + needle.length;
  }
}

/** Engine pill for HTTP rows: distinguishes ktor / okhttp / urlconnection. */
const ENGINE_LABELS: Record<string, string> = {
  ktor: 'KTOR',
  okhttp: 'OKHTTP',
  urlconnection: 'URLCONN',
};
const ENGINE_TONES: Record<string, string> = {
  ktor: 'text-method-get-fg border-method-get-fg/30',
  okhttp: 'text-method-post-fg border-method-post-fg/30',
  urlconnection: 'text-method-put-fg border-method-put-fg/30',
};

function createEngineChip(engine: string): HTMLElement {
  const span = document.createElement('span');
  const label = ENGINE_LABELS[engine] ?? engine.toUpperCase();
  const tone = ENGINE_TONES[engine] ?? 'text-fg-3 border-border-default';
  span.className = `inline-flex items-center px-1 h-4 rounded-xs border text-[10px] font-mono leading-none ${tone}`;
  span.textContent = label;
  span.title = `engine: ${engine}`;
  return span;
}

function createCorrelationCell(event: ArgusEvent): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'text-fg-3 font-mono w-16 truncate';
  const id = (isHttpEvent(event) || isLogEvent(event)) ? event.correlationId : null;
  if (id) {
    cell.textContent = id.slice(0, 8);
    cell.title = id;
  } else {
    cell.textContent = '—';
  }
  return cell;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}
