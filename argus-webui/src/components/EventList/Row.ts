import {
  type ArgusEvent,
  type HttpEvent,
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
  /** Origin hop when this event resulted from a redirect; null otherwise. */
  readonly redirectOrigin: HttpEvent | null;
  /**
   * True when this event is related to the current selection — a hop of the same
   * redirect chain, or emitted inside the same correlation scope.
   */
  readonly linked: boolean;
  readonly onClick: (event: ArgusEvent) => void;
}

const ROW_CLASS_BASE = 'flex items-center gap-2 px-2 cursor-pointer border-b border-border-subtle text-xs font-ui';
// Hover is applied to non-selected rows only: `.hover\:bg-bg-hover:hover` has
// higher specificity than the flat `.bg-bg-selected*` utility, so leaving it on
// a selected row wipes the selection tint out from under the cursor that just
// clicked it.
const ROW_CLASS_HOVER = 'hover:bg-bg-hover';
const ROW_CLASS_SELECTED = 'bg-bg-selected';
const ROW_CLASS_SELECTED_RAIL = 'ds-row-rail';
const ROW_CLASS_SELECTED_KB = 'bg-bg-selected-kb';
const ROW_CLASS_SELECTED_KB_RAIL = 'ds-row-rail-kb';
// Linked (related to the selection — same redirect chain or same correlation scope)
// differs from selected on BOTH axes: dashed rail instead of solid, faint wash instead
// of the strong selection tint, so it can never be misread as the selected row. A
// linked row is by definition not the selection, so the two fills never stack.
const ROW_CLASS_LINKED = 'bg-accent-subtle';
const ROW_CLASS_LINKED_RAIL = 'ds-row-linked';

/**
 * Applies (or clears) the selection classes on a row. Every class is toggled in
 * both directions so this is safe on a pooled row carrying stale state — the
 * virtual list reuses row elements across renders.
 */
export function applyRowSelection(
  row: HTMLElement,
  selected: boolean,
  source: 'keyboard' | 'mouse',
): void {
  const kb = selected && source === 'keyboard';
  const mouse = selected && !kb;
  row.classList.toggle(ROW_CLASS_HOVER, !selected);
  row.classList.toggle(ROW_CLASS_SELECTED, mouse);
  row.classList.toggle(ROW_CLASS_SELECTED_RAIL, mouse);
  row.classList.toggle(ROW_CLASS_SELECTED_KB, kb);
  row.classList.toggle(ROW_CLASS_SELECTED_KB_RAIL, kb);
}

/**
 * Toggles the linked-row styling. Separate from [applyRowSelection] because
 * the two are driven by different state, but both are patched onto live pooled rows
 * for the same reason: the virtual list only rebuilds a row on a pool miss.
 *
 * Note `hover:bg-bg-hover` outranks the flat `bg-accent-subtle` (see the hover note
 * above), so hovering a linked row replaces its wash — the dashed rail survives, and
 * that's the cue that matters.
 */
export function applyRowLinked(row: HTMLElement, linked: boolean): void {
  row.classList.toggle(ROW_CLASS_LINKED, linked);
  row.classList.toggle(ROW_CLASS_LINKED_RAIL, linked);
}

/**
 * Shows or hides the row's redirect pill and refreshes its tooltip. A hop can be
 * ingested before the origin it belongs to (a backfill overlapping the live stream),
 * so this has to be patchable after the row exists rather than decided at build time.
 */
export function applyRowRedirect(row: HTMLElement, origin: HttpEvent | null): void {
  const pill = row.querySelector<HTMLElement>('[data-redirect-pill]');
  if (!pill) return;
  // display, not just the `hidden` attribute: the UA's `[hidden] { display: none }`
  // loses to the pill's own `inline-flex` utility class, so the attribute alone would
  // leave the pill visible on every HTTP row.
  pill.hidden = origin == null;
  pill.style.display = origin == null ? 'none' : '';
  pill.title = origin
    ? `continuation of ${origin.request.method.toUpperCase()} ${origin.request.host}${origin.request.path}`
      + (origin.response ? ` — ${origin.response.statusCode}` : '')
    : '';
}

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

    row.appendChild(createRedirectPill());

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
  }

  row.appendChild(createMetaCell(event.timestamp));

  row.className = ROW_CLASS_BASE;
  applyRowSelection(row, ctx.selectedId === event.id, ctx.selectionSource);
  applyRowLinked(row, ctx.linked);
  applyRowRedirect(row, ctx.redirectOrigin);
  row.addEventListener('click', () => ctx.onClick(event));
  return row;
}

/**
 * "Redirected" marker for a hop that resulted from a redirect. Deliberately a
 * label and not a positional glyph: hops of one chain are not adjacent in the list,
 * so anything reading as "continuation of the row above" would be wrong. The origin
 * it continues is named in the tooltip, set by [applyRowRedirect].
 *
 * Built on every HTTP row and hidden by default so the state can be patched without
 * dropping the virtual list's row pool.
 */
function createRedirectPill(): HTMLElement {
  const span = document.createElement('span');
  span.dataset['redirectPill'] = '';
  span.hidden = true;
  span.style.display = 'none';
  span.className =
    'inline-flex items-center px-1 h-4 rounded-xs border text-xxs font-mono leading-none text-status-3xx-fg border-status-3xx-fg/30';
  span.textContent = '↳ REDIRECTED';
  return span;
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
  span.className = `inline-flex items-center px-1 h-4 rounded-xs border text-xxs font-mono leading-none ${tone}`;
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

/**
 * Trailing meta cell — the event's wall-clock time, for every row kind. HTTP rows
 * used to print `durationMs` here instead; one column carrying two units with no
 * header to tell them apart reads as a time and hides when the call happened.
 * Duration lives in the HTTP detail pane and the Waterfall.
 */
function createMetaCell(timestamp: number): HTMLElement {
  const cell = document.createElement('span');
  cell.className = 'text-fg-3 font-mono text-xs w-24 text-right tabular-nums';
  cell.textContent = formatTime(timestamp);
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
