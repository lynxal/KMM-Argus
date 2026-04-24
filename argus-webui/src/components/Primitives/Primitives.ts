import type { EventSource } from '../../transport/schema';
import { createIcon, type IconName } from '../../design/icons';

/** Render an Argus source badge (HTTP / LOG / CUSTOM). */
export function createSrcBadge(kind: EventSource, size: 'sm' | 'md' = 'sm'): HTMLElement {
  const el = document.createElement('span');
  const bg = kind === 'HTTP' ? 'bg-src-http-bg' : kind === 'LOG' ? 'bg-src-log-bg' : 'bg-src-custom-bg';
  const fg = kind === 'HTTP' ? 'text-src-http-fg' : kind === 'LOG' ? 'text-src-log-fg' : 'text-src-custom-fg';
  const brd = kind === 'HTTP' ? 'border-src-http-brd' : kind === 'LOG' ? 'border-src-log-brd' : 'border-src-custom-brd';
  el.className = ['ds-src-badge', size === 'md' ? 'ds-src-badge--md' : '', bg, fg, brd].join(' ');
  el.textContent = kind;
  return el;
}

/** Keyboard key chip — thin wrapper over globals.css's `kbd.ds-kbd` style. */
export function createKbd(label: string): HTMLElement {
  const el = document.createElement('kbd');
  el.className = 'ds-kbd';
  el.textContent = label;
  return el;
}

/** Icon element backed by src/design/icons.ts. */
export function createIconEl(name: IconName, size = 14, stroke = 1.75, className?: string): SVGSVGElement {
  const cls = ['flex-none block', className].filter(Boolean).join(' ');
  return createIcon({ name, size, stroke, className: cls });
}

/**
 * Argus logomark (radar-dish "eye" glyph from `ds/logo-mark.svg`). Uses
 * `currentColor` for both strokes and the pupil, so the caller colors it via
 * Tailwind text classes on the returned element.
 */
export function createLogoMark(size = 20): SVGSVGElement {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 240 240');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '5.4');
  svg.setAttribute('stroke-linecap', 'butt');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', 'argus-logo-mark-eye');
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  const maskBg = document.createElementNS(SVG_NS, 'rect');
  maskBg.setAttribute('x', '0');
  maskBg.setAttribute('y', '0');
  maskBg.setAttribute('width', '240');
  maskBg.setAttribute('height', '240');
  maskBg.setAttribute('fill', 'white');
  const maskEye = document.createElementNS(SVG_NS, 'path');
  maskEye.setAttribute(
    'd',
    'M 20 120 A 181.67 181.67 0 0 1 220 120 A 181.67 181.67 0 0 1 20 120 Z',
  );
  maskEye.setAttribute('fill', 'black');
  mask.append(maskBg, maskEye);
  defs.append(mask);
  svg.append(defs);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('mask', 'url(#argus-logo-mark-eye)');
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const x1 = 120 + Math.cos(a) * 114;
    const y1 = 120 + Math.sin(a) * 114;
    const x2 = 120 + Math.cos(a) * 70;
    const y2 = 120 + Math.sin(a) * 70;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    g.appendChild(line);
  }
  svg.appendChild(g);

  const pupil = document.createElementNS(SVG_NS, 'circle');
  pupil.setAttribute('cx', '120');
  pupil.setAttribute('cy', '120');
  pupil.setAttribute('r', '18');
  pupil.setAttribute('fill', 'currentColor');
  pupil.setAttribute('stroke', 'none');
  svg.appendChild(pupil);

  return svg;
}

/** Connection status dot — 8px circle, optional pulse. */
export function createConnDot(tone: 'ok' | 'reco' | 'off'): HTMLElement {
  const el = document.createElement('span');
  const color =
    tone === 'ok' ? 'bg-conn-ok-dot' : tone === 'reco' ? 'bg-conn-reco-dot' : 'bg-conn-off-dot';
  const pulse = tone === 'reco' ? 'ds-conn-dot--pulse' : '';
  el.className = ['ds-conn-dot', color, pulse].filter(Boolean).join(' ');
  return el;
}
