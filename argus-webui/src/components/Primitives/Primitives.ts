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

/** Connection status dot — 8px circle, optional pulse. */
export function createConnDot(tone: 'ok' | 'reco' | 'off'): HTMLElement {
  const el = document.createElement('span');
  const color =
    tone === 'ok' ? 'bg-conn-ok-dot' : tone === 'reco' ? 'bg-conn-reco-dot' : 'bg-conn-off-dot';
  const pulse = tone === 'reco' ? 'ds-conn-dot--pulse' : '';
  el.className = ['ds-conn-dot', color, pulse].filter(Boolean).join(' ');
  return el;
}
