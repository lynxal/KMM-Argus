/**
 * Body viewer with six variants — JSON tree, plain text, image, hex, empty,
 * truncated banner. Caller picks a variant via `mode`; BodyViewer infers
 * "Empty" when no body is available.
 *
 * @see design_handoff_argus_inspector/argus/BodyViewer.jsx
 */
export type BodyMode = 'auto' | 'json' | 'text' | 'image' | 'hex' | 'empty';

export interface BodyViewerProps {
  readonly mode?: BodyMode | undefined;
  readonly body: string | null | undefined;
  readonly contentType?: string | null | undefined;
  readonly sizeBytes?: number | null | undefined;
  readonly truncatedTotalBytes?: number | null | undefined;
}

export function createBodyViewer(p: BodyViewerProps): HTMLElement {
  const root = document.createElement('div');
  root.className = 'flex flex-col gap-2 min-h-0';

  if (p.body == null || p.body === '') {
    root.appendChild(emptyCard());
    return root;
  }

  const mode = p.mode === 'auto' || p.mode == null ? inferMode(p.contentType ?? null, p.body) : p.mode;

  if (mode === 'empty') {
    root.appendChild(emptyCard());
    return root;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-2 h-6 text-fg-2 text-xs font-mono';
  const badge = document.createElement('span');
  badge.className = 'px-2 h-5 flex items-center rounded-sm bg-bg-subtle text-fg-2';
  badge.textContent = mode.toUpperCase();
  toolbar.appendChild(badge);
  if (p.sizeBytes != null) {
    const size = document.createElement('span');
    size.className = 'text-fg-3';
    size.textContent = `${p.sizeBytes} B`;
    toolbar.appendChild(size);
  }
  if (p.contentType) {
    const ct = document.createElement('span');
    ct.className = 'text-fg-3';
    ct.textContent = p.contentType;
    toolbar.appendChild(ct);
  }
  root.appendChild(toolbar);

  const body = document.createElement('div');
  body.className = 'flex-1 min-h-0 overflow-auto bg-bg-sunken rounded-md border border-border-subtle p-3 font-mono text-sm';
  root.appendChild(body);

  if (mode === 'json') body.appendChild(renderJson(p.body));
  else if (mode === 'image') body.appendChild(renderImage(p.body, p.contentType ?? ''));
  else if (mode === 'hex') body.appendChild(renderHex(p.body));
  else body.appendChild(renderText(p.body));

  if (p.truncatedTotalBytes && p.truncatedTotalBytes > (p.sizeBytes ?? 0)) {
    const banner = document.createElement('div');
    banner.className =
      'flex items-center gap-2 px-3 h-8 bg-bg-subtle border border-dashed border-border-strong rounded-md text-fg-2 text-xs';
    banner.textContent = `Body truncated at ${p.sizeBytes ?? 0} of ${p.truncatedTotalBytes} B`;
    root.appendChild(banner);
  }

  return root;
}

function emptyCard(): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'flex-1 flex items-center justify-center min-h-20 bg-bg-sunken rounded-md border border-dashed border-border-subtle text-fg-3 text-xs font-ui';
  el.textContent = 'No body';
  return el;
}

function inferMode(contentType: string | null, body: string): BodyMode {
  if (contentType) {
    if (/image\//i.test(contentType)) return 'image';
    if (/json|\+json/i.test(contentType)) return 'json';
    if (/text|xml|html|javascript|css/i.test(contentType)) return 'text';
  }
  // Heuristic fallback.
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'text';
}

function renderText(body: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'text-fg-1 whitespace-pre-wrap break-words';
  pre.textContent = body;
  return pre;
}

function renderImage(body: string, contentType: string): HTMLElement {
  const img = document.createElement('img');
  // Caller is expected to pass a data:... URL or raw base64 prefixed by type.
  img.src = body.startsWith('data:') ? body : `data:${contentType || 'image/png'};base64,${body}`;
  img.className = 'max-w-full max-h-96 mx-auto';
  return img;
}

function renderHex(body: string): HTMLElement {
  const bytes = new TextEncoder().encode(body);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const off = i.toString(16).padStart(8, '0');
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
    lines.push(`${off}  ${hex}  ${ascii}`);
  }
  const pre = document.createElement('pre');
  pre.className = 'text-fg-1 whitespace-pre';
  pre.textContent = lines.join('\n');
  return pre;
}

function renderJson(body: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'text-fg-1';
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const pre = document.createElement('pre');
    pre.className = 'text-fg-1 whitespace-pre-wrap';
    pre.textContent = body;
    return pre;
  }
  root.appendChild(renderJsonValue(parsed, 0));
  return root;
}

function renderJsonValue(value: unknown, depth: number): HTMLElement {
  if (value === null) return jsonLeaf('null', 'text-syn-null');
  if (typeof value === 'boolean') return jsonLeaf(String(value), 'text-syn-bool');
  if (typeof value === 'number') return jsonLeaf(String(value), 'text-syn-number');
  if (typeof value === 'string') return jsonLeaf(JSON.stringify(value), 'text-syn-string');
  if (Array.isArray(value)) return renderJsonArray(value, depth);
  if (typeof value === 'object') return renderJsonObject(value as Record<string, unknown>, depth);
  return jsonLeaf(String(value), 'text-fg-1');
}

function jsonLeaf(text: string, color: string): HTMLElement {
  const span = document.createElement('span');
  span.className = color;
  span.textContent = text;
  return span;
}

function renderJsonObject(obj: Record<string, unknown>, depth: number): HTMLElement {
  const keys = Object.keys(obj);
  if (keys.length === 0) return jsonLeaf('{}', 'text-syn-punct');
  const details = document.createElement('details');
  details.open = depth < 2;
  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer text-syn-punct';
  summary.textContent = `{${keys.length} keys}`;
  details.appendChild(summary);
  const ul = document.createElement('ul');
  ul.className = 'ml-4 border-l border-border-subtle pl-2';
  for (const k of keys) {
    const li = document.createElement('li');
    const key = document.createElement('span');
    key.className = 'text-syn-key font-semibold';
    key.textContent = `${JSON.stringify(k)}: `;
    li.append(key, renderJsonValue(obj[k], depth + 1));
    ul.appendChild(li);
  }
  details.appendChild(ul);
  return details;
}

function renderJsonArray(arr: unknown[], depth: number): HTMLElement {
  if (arr.length === 0) return jsonLeaf('[]', 'text-syn-punct');
  const details = document.createElement('details');
  details.open = depth < 2;
  const summary = document.createElement('summary');
  summary.className = 'cursor-pointer text-syn-punct';
  summary.textContent = `[${arr.length} items]`;
  details.appendChild(summary);
  const ul = document.createElement('ul');
  ul.className = 'ml-4 border-l border-border-subtle pl-2';
  for (let i = 0; i < arr.length; i++) {
    const li = document.createElement('li');
    const idx = document.createElement('span');
    idx.className = 'text-fg-3 text-xs mr-2';
    idx.textContent = String(i);
    li.append(idx, renderJsonValue(arr[i], depth + 1));
    ul.appendChild(li);
  }
  details.appendChild(ul);
  return details;
}
