import { effect, signal } from '@preact/signals-core';
import type { EventStore } from '../../store/eventStore';
import {
  type ArgusEvent,
  isHttpEvent,
  statusClass,
} from '../../transport/schema';
import { createIconEl } from '../Primitives/Primitives';

export interface WaterfallProps {
  readonly store: EventStore;
}

const ROW_HEIGHT = 28;
const GUTTER_W = 240;
const DUR_W = 70;
const HEADER_H = 28;

/**
 * Waterfall view — canvas for bars + ticks, DOM for the hovered tooltip and
 * selection rail. Canvas redraw keyed to (filteredEvents, zoom, selectedId,
 * scrollTop); re-renders skip when nothing changes.
 *
 * @see design_handoff_argus_inspector/argus/Waterfall.jsx
 */
export function createWaterfall({ store }: WaterfallProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'flex-1 min-h-0 flex flex-col bg-bg-panel rounded-md border border-border-default overflow-hidden';

  // Header: count + time axis + zoom
  const header = document.createElement('div');
  header.className = 'flex items-center h-7 px-2 gap-2 border-b border-border-default text-fg-3 text-xs font-mono';
  wrapper.appendChild(header);

  const colLabel = document.createElement('span');
  colLabel.className = 'text-fg-2 w-28';
  header.appendChild(colLabel);

  const axisCanvas = document.createElement('canvas');
  axisCanvas.style.flex = '1';
  const AXIS_H = 20;
  axisCanvas.style.height = `${AXIS_H}px`;
  header.appendChild(axisCanvas);

  const zoomOut = iconButton('minus', 'Zoom out');
  const zoomIn = iconButton('plus', 'Zoom in');
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'text-fg-2 w-12 text-right';
  header.append(zoomOut, zoomIn, zoomLabel);

  // Body — canvas sits beneath a viewport div that handles clicks.
  const body = document.createElement('div');
  body.className = 'relative flex-1 min-h-0 overflow-auto';
  wrapper.appendChild(body);

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  body.appendChild(canvas);

  const tooltip = document.createElement('div');
  tooltip.className = 'absolute pointer-events-none px-2 py-1 rounded-sm bg-bg-overlay text-fg-1 border border-border-default shadow-md text-xs font-ui';
  tooltip.style.display = 'none';
  body.appendChild(tooltip);

  // State
  const zoom = signal(1);
  const events = store.filteredEvents;

  // Click → selection
  body.addEventListener('click', (e) => {
    const rect = body.getBoundingClientRect();
    const y = e.clientY - rect.top + body.scrollTop;
    const idx = Math.floor(y / ROW_HEIGHT);
    const list = events.value;
    if (idx < 0 || idx >= list.length) return;
    const evt = list[idx]!;
    store.selectionSource.value = 'mouse';
    store.selectedId.value = evt.id;
  });

  body.addEventListener('mousemove', (e) => {
    const rect = body.getBoundingClientRect();
    const y = e.clientY - rect.top + body.scrollTop;
    const idx = Math.floor(y / ROW_HEIGHT);
    const list = events.value;
    if (idx < 0 || idx >= list.length) {
      tooltip.style.display = 'none';
      return;
    }
    const evt = list[idx]!;
    tooltip.style.display = '';
    tooltip.style.left = `${Math.min(rect.width - 220, e.clientX - rect.left + 12)}px`;
    tooltip.style.top = `${idx * ROW_HEIGHT - body.scrollTop + 4}px`;
    tooltip.textContent = describeEvent(evt);
  });
  body.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  zoomIn.addEventListener('click', () => {
    zoom.value = Math.min(16, zoom.value * 2);
  });
  zoomOut.addEventListener('click', () => {
    zoom.value = Math.max(0.25, zoom.value / 2);
  });

  // Redraw
  effect(() => {
    const list = events.value;
    void store.selectedId.value;
    void zoom.value;
    drawHeader(axisCanvas, list, zoom.value);
    drawBody(canvas, body, list, zoom.value, store.selectedId.value);
    colLabel.textContent = `Event · ${list.length}`;
    zoomLabel.textContent = `${zoom.value.toFixed(2)}×`;
  });

  return wrapper;
}

function iconButton(icon: 'plus' | 'minus', aria: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'w-6 h-6 flex items-center justify-center rounded-sm text-fg-2 hover:bg-bg-hover hover:text-fg-1 cursor-pointer';
  btn.setAttribute('aria-label', aria);
  btn.title = aria;
  btn.appendChild(createIconEl(icon, 12));
  return btn;
}

function rangeMs(list: readonly ArgusEvent[]): { start: number; end: number } {
  if (list.length === 0) return { start: 0, end: 1 };
  let start = Infinity;
  let end = -Infinity;
  for (const e of list) {
    if (e.timestamp < start) start = e.timestamp;
    const durEnd = e.timestamp + (isHttpEvent(e) ? e.durationMs ?? 0 : 0);
    if (durEnd > end) end = durEnd;
  }
  return { start, end: Math.max(end, start + 1) };
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'rgb(136, 136, 136)';
}

function drawHeader(canvas: HTMLCanvasElement, list: readonly ArgusEvent[], zoom: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement?.clientWidth ?? 600;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.floor(20 * dpr);
  canvas.style.width = `${w}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, 20);

  const axis = readCssVar('--wf-axis');
  const tick = readCssVar('--wf-tick');
  ctx.strokeStyle = axis;
  ctx.fillStyle = tick;
  const axisFontPx = 10;
  ctx.font = `${axisFontPx}px JetBrains Mono, monospace`;
  ctx.textBaseline = 'top';

  const { start, end } = rangeMs(list);
  const spanMs = (end - start) / zoom;
  for (let i = 0; i <= 4; i++) {
    const x = (i / 4) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 6);
    ctx.stroke();
    const ms = Math.round((i / 4) * spanMs);
    ctx.fillText(`${ms} ms`, x + 2, 8);
  }
}

function drawBody(
  canvas: HTMLCanvasElement,
  viewport: HTMLElement,
  list: readonly ArgusEvent[],
  zoom: number,
  selectedId: string | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = viewport.clientWidth;
  const totalH = list.length * ROW_HEIGHT;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(totalH * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${totalH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, totalH);

  const trackX = GUTTER_W;
  const trackW = w - GUTTER_W - DUR_W - 8;
  const { start, end } = rangeMs(list);
  const spanMs = (end - start) / zoom;
  const msPerPx = spanMs / Math.max(1, trackW);

  const axis = readCssVar('--wf-axis');
  ctx.strokeStyle = axis;

  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    const y = i * ROW_HEIGHT;
    // Row divider
    ctx.strokeStyle = readCssVar('--border-subtle');
    ctx.beginPath();
    ctx.moveTo(0, y + ROW_HEIGHT);
    ctx.lineTo(w, y + ROW_HEIGHT);
    ctx.stroke();

    // Selection highlight
    if (e.id === selectedId) {
      ctx.fillStyle = readCssVar('--bg-selected');
      ctx.fillRect(0, y, w, ROW_HEIGHT);
      ctx.fillStyle = readCssVar('--border-focus');
      ctx.fillRect(0, y, 2, ROW_HEIGHT);
    }

    // Bar / tick
    const xStart = trackX + (e.timestamp - start) / msPerPx;
    if (isHttpEvent(e)) {
      const dur = e.durationMs ?? 0;
      const width = Math.max(1, dur / msPerPx);
      const connectW = width * 0.15;
      const waitW = width * 0.55;
      const downloadW = width - connectW - waitW;
      ctx.fillStyle = readCssVar('--wf-connect');
      ctx.fillRect(xStart, y + 8, connectW, 12);
      ctx.fillStyle = readCssVar('--wf-wait');
      ctx.fillRect(xStart + connectW, y + 8, waitW, 12);
      const bucket = statusClass(e.response?.statusCode ?? null);
      ctx.fillStyle = readCssVar(`--status-${bucket}-dot`);
      ctx.fillRect(xStart + connectW + waitW, y + 8, downloadW, 12);
      if (e.error) {
        ctx.setLineDash([4, 2]);
        ctx.strokeStyle = readCssVar('--status-5xx-dot');
        ctx.strokeRect(xStart, y + 8, Math.max(6, width), 12);
        ctx.setLineDash([]);
      }
    } else {
      ctx.fillStyle = readCssVar(e.source === 'LOG' ? '--src-log-fg' : '--src-custom-fg');
      ctx.fillRect(xStart, y + 4, 2, ROW_HEIGHT - 8);
    }
  }
}

function describeEvent(e: ArgusEvent): string {
  if (isHttpEvent(e)) {
    return `${e.request.method} ${e.response?.statusCode ?? 'ERR'} ${e.request.path} · ${e.durationMs ?? '—'} ms`;
  }
  if (e.source === 'LOG') {
    const l = e as import('../../transport/schema').LogEvent;
    return `${l.level} [${l.tag ?? ''}] ${l.message}`;
  }
  const c = e as import('../../transport/schema').CustomEvent;
  return `${c.sourceLabel}.${c.label} ${c.payload}`;
}

/** Exposed for perf harness: seed-then-measure. */
export const WATERFALL_ROW_HEIGHT = ROW_HEIGHT;
export const WATERFALL_HEADER_H = HEADER_H;
