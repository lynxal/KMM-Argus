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
const AXIS_H = 20;
/**
 * ms-per-pixel at zoom=1. Anchors the time scale so existing bars stay put
 * when new events extend the timeline — the canvas grows to the right
 * instead of squeezing every prior bar leftward.
 */
const BASE_MS_PER_PX = 8;
/** Browsers fail or crash on very large canvases; cap and let msPerPx grow above the base when the timeline gets too long. */
const MAX_CANVAS_W = 16384;

/**
 * Waterfall view — canvas for bars + ticks, DOM for the hovered tooltip and
 * selection rail. Canvas redraw keyed to (filteredEvents, zoom, selectedId,
 * scrollTop); re-renders skip when nothing changes.
 *
 * @see design_handoff_argus_inspector/argus/Waterfall.jsx
 */
export function createWaterfall({ store }: WaterfallProps): HTMLElement {
  const wrapper = document.createElement('div');
  // `min-w-0` is critical: without it, a flex item's default min-width is its
  // content's intrinsic size, so a wide canvas inside `body` would push the
  // whole row (and the page) horizontally.
  wrapper.className =
    'flex-1 min-h-0 min-w-0 flex flex-col bg-bg-panel rounded-md border border-border-default overflow-hidden';

  // Header: count + zoom controls. The time-axis lives inside the scroll
  // container so it stays aligned with the bars when scrolled horizontally.
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between h-7 px-2 gap-2 border-b border-border-default text-fg-3 text-xs font-mono';
  wrapper.appendChild(header);

  const colLabel = document.createElement('span');
  colLabel.className = 'text-fg-2';
  header.appendChild(colLabel);

  const zoomGroup = document.createElement('div');
  zoomGroup.className = 'flex items-center gap-2';
  const zoomOut = iconButton('minus', 'Zoom out');
  const zoomIn = iconButton('plus', 'Zoom in');
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'text-fg-2 w-12 text-right';
  zoomGroup.append(zoomOut, zoomIn, zoomLabel);
  header.appendChild(zoomGroup);

  // Body — canvas sits beneath a viewport div that handles clicks.
  const body = document.createElement('div');
  body.className = 'relative flex-1 min-h-0 overflow-auto';
  body.style.scrollbarGutter = 'stable';
  wrapper.appendChild(body);

  // Sticky axis row — pinned to the top of the body, scrolls horizontally with
  // the bar canvas so labels stay aligned at any zoom level.
  const axisRow = document.createElement('div');
  axisRow.className = 'sticky top-0 z-10 bg-bg-panel border-b border-border-subtle';
  axisRow.style.height = `${AXIS_H}px`;
  body.appendChild(axisRow);

  const axisCanvas = document.createElement('canvas');
  axisCanvas.style.display = 'block';
  axisCanvas.style.height = `${AXIS_H}px`;
  axisRow.appendChild(axisCanvas);

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
  // Set when the body's own click drives the selection — suppresses the
  // auto-scroll-to-selected step so clicking a visible bar doesn't jump.
  let selfTriggered = false;
  // Tracks the last selection we scrolled to. Auto-scroll fires only when
  // `selectedId` actually changes — not on every redraw, so rapid event
  // ingestion doesn't keep re-centering the canvas under the user.
  let lastScrolledId: string | null = null;

  // Click → selection
  body.addEventListener('click', (e) => {
    const rect = body.getBoundingClientRect();
    const y = e.clientY - rect.top + body.scrollTop - AXIS_H;
    if (y < 0) return; // click landed on the sticky axis row
    const idx = Math.floor(y / ROW_HEIGHT);
    const list = events.value;
    if (idx < 0 || idx >= list.length) return;
    const evt = list[idx]!;
    selfTriggered = true;
    store.selectionSource.value = 'mouse';
    store.selectedId.value = evt.id;
  });

  body.addEventListener('mousemove', (e) => {
    const rect = body.getBoundingClientRect();
    const y = e.clientY - rect.top + body.scrollTop - AXIS_H;
    const idx = Math.floor(y / ROW_HEIGHT);
    const list = events.value;
    if (y < 0 || idx < 0 || idx >= list.length) {
      tooltip.style.display = 'none';
      return;
    }
    const evt = list[idx]!;
    tooltip.style.display = '';
    tooltip.style.left = `${Math.min(rect.width - 220, e.clientX - rect.left + 12)}px`;
    tooltip.style.top = `${AXIS_H + idx * ROW_HEIGHT - body.scrollTop + 4}px`;
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
    const selectedId = store.selectedId.value;
    const z = zoom.value;
    drawHeader(axisCanvas, body, list, z);
    drawBody(canvas, body, list, z, selectedId);
    colLabel.textContent = `Event · ${list.length}`;
    zoomLabel.textContent = `${z.toFixed(2)}×`;

    if (selectedId && selectedId !== lastScrolledId && !selfTriggered) {
      const i = list.findIndex((e) => e.id === selectedId);
      if (i >= 0) {
        scrollSelectionIntoView(body, list, i, z);
      }
    }
    lastScrolledId = selectedId;
    selfTriggered = false;
  });

  return wrapper;
}

function scrollSelectionIntoView(
  body: HTMLElement,
  list: readonly ArgusEvent[],
  index: number,
  zoom: number,
): void {
  const e = list[index]!;
  // Vertical: bar `index` lives at content y = AXIS_H + index*ROW_HEIGHT.
  // Visible bars area is [scrollTop + AXIS_H, scrollTop + clientHeight] —
  // the sticky axis row eats the top AXIS_H of the viewport.
  const rowTop = AXIS_H + index * ROW_HEIGHT;
  const rowBottom = rowTop + ROW_HEIGHT;
  const viewTop = body.scrollTop + AXIS_H;
  const viewBottom = body.scrollTop + body.clientHeight;
  if (rowTop < viewTop || rowBottom > viewBottom) {
    body.scrollTop = Math.max(0, rowTop - (body.clientHeight + AXIS_H) / 2 + ROW_HEIGHT / 2);
  }

  // Horizontal: only meaningful when canvas is wider than the viewport.
  const { start, end } = rangeMs(list);
  const { msPerPx } = computeScale(end - start, body.clientWidth, zoom);
  const xStart = GUTTER_W + (e.timestamp - start) / msPerPx;
  const barW = isHttpEvent(e) ? Math.max(1, (e.durationMs ?? 0) / msPerPx) : 2;
  const visibleLeft = body.scrollLeft;
  const visibleRight = visibleLeft + body.clientWidth;
  if (xStart < visibleLeft || xStart + barW > visibleRight) {
    body.scrollLeft = Math.max(0, xStart - body.clientWidth / 2 + barW / 2);
  }
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

/**
 * Pick the ms-per-pixel and resulting canvas width. msPerPx is anchored to
 * `BASE_MS_PER_PX / zoom` so a given timestamp always lands at the same pixel
 * position — bars don't drift when new events extend the timeline; the canvas
 * grows rightward instead. Zoom always changes msPerPx (and so canvas width),
 * never gets swallowed by a viewport clamp. For absurdly long timelines we let
 * msPerPx grow above the base to keep the canvas under `MAX_CANVAS_W` since
 * browsers struggle past that.
 */
function computeScale(
  spanMs: number,
  _viewportPx: number,
  zoom: number,
): { msPerPx: number; canvasW: number; trackW: number } {
  const z = Math.max(0.0001, zoom);
  const baseMs = BASE_MS_PER_PX / z;
  const fixedSidesPx = GUTTER_W + DUR_W + 8;
  const maxTrackPx = Math.max(1, MAX_CANVAS_W - fixedSidesPx);
  const minMsForCap = spanMs / maxTrackPx;
  const msPerPx = Math.max(baseMs, minMsForCap);
  const canvasW = fixedSidesPx + Math.max(1, spanMs / msPerPx);
  const trackW = canvasW - fixedSidesPx;
  return { msPerPx, canvasW, trackW };
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

function drawHeader(canvas: HTMLCanvasElement, body: HTMLElement, list: readonly ArgusEvent[], zoom: number): void {
  const dpr = window.devicePixelRatio || 1;
  const { start, end } = rangeMs(list);
  const spanMs = end - start;
  const { msPerPx, canvasW: w } = computeScale(spanMs, body.clientWidth, zoom);
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.floor(AXIS_H * dpr);
  canvas.style.width = `${w}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, AXIS_H);

  const axis = readCssVar('--wf-axis');
  const tick = readCssVar('--wf-tick');
  ctx.strokeStyle = axis;
  ctx.fillStyle = tick;
  const axisFontPx = 10;
  ctx.font = `${axisFontPx}px JetBrains Mono, monospace`;
  ctx.textBaseline = 'top';

  // One tick roughly every 200 px so the axis stays readable at any zoom.
  const ticks = Math.max(4, Math.round(w / 200));
  for (let i = 0; i <= ticks; i++) {
    const x = (i / ticks) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 6);
    ctx.stroke();
    const ms = Math.round((x - GUTTER_W) * msPerPx);
    if (ms < 0) continue;
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
  const { start, end } = rangeMs(list);
  const spanMs = end - start;
  const { msPerPx, canvasW: w } = computeScale(spanMs, viewport.clientWidth, zoom);
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
