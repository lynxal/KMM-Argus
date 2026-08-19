/**
 * File-download helpers shared by the top bar's "Export" CTA and the
 * BodyViewer's "Download" button — the two features of GitHub issues #1 and #2.
 *
 * Everything except `downloadFile` is pure, so the decisions that matter
 * (envelope shape, filename, extension, base64 decode) are unit-testable in
 * vitest's default node environment. The project has no jsdom.
 */
import type { BodyMode } from '../components/BodyViewer/BodyViewer';
import { ARGUS_SCHEMA_VERSION, type ArgusEvent, type DeviceInfo } from '../transport/schema';

/** Shape written to a bulk export file. `events` is chronological (oldest first). */
export interface EventsExport {
  readonly argusSchemaVersion: number;
  readonly exportedAt: string;
  readonly device: DeviceInfo | null;
  readonly eventCount: number;
  readonly events: readonly ArgusEvent[];
}

/**
 * Pretty-printed export envelope. The array is reversed because the store keeps
 * events newest-first; a file that reads oldest-first reads like a log. Feeding
 * `.events` back through `store.ingest` restores newest-first, since it prepends.
 */
export function buildEventsExport(
  events: readonly ArgusEvent[],
  device: DeviceInfo | null,
  exportedAt: number,
): string {
  const payload: EventsExport = {
    argusSchemaVersion: ARGUS_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    device,
    eventCount: events.length,
    events: [...events].reverse(),
  };
  return JSON.stringify(payload, null, 2);
}

/** `argus-<pkg>-<yyyyMMdd-HHmmss>.json`, local time. Falls back when no device is known. */
export function eventsFileName(device: DeviceInfo | null, at: number): string {
  const who = device?.pkg ? safeSegment(device.pkg) : 'events';
  return `argus-${who}-${localStamp(at)}.json`;
}

/** Base name + a `-truncated` marker + the extension matching the resolved body mode. */
export function bodyFileName(
  base: string,
  mode: BodyMode,
  contentType: string | null,
  truncated: boolean,
): string {
  return `${safeSegment(base)}${truncated ? '-truncated' : ''}${bodyExtension(mode, contentType)}`;
}

/**
 * What actually gets written. Image bodies arrive as base64 (or a `data:` URL)
 * because that is what BodyViewer renders into an `<img>`, so they are decoded
 * back to bytes — otherwise the saved ".png" would be a text file.
 *
 * `hex` needs no special case: BodyViewer hexdumps the UTF-8 bytes of the same
 * string, so writing the string writes exactly those bytes.
 */
export function bodyDownloadPayload(
  body: string,
  mode: BodyMode,
  contentType: string | null,
): { mime: string; data: string | Uint8Array } {
  if (mode === 'image') {
    const comma = body.startsWith('data:') ? body.indexOf(',') : -1;
    const base64 = comma >= 0 ? body.slice(comma + 1) : body;
    const declared = comma >= 0 ? body.slice(5, body.indexOf(';') >= 0 ? body.indexOf(';') : comma) : '';
    return {
      mime: declared || contentType || 'application/octet-stream',
      data: base64ToBytes(base64),
    };
  }
  return { mime: contentType || defaultMime(mode), data: body };
}

/**
 * Blob + object URL + a synthetic `<a download>` click. The only DOM-touching
 * export in this module; tests never call it.
 */
export function downloadFile(fileName: string, mime: string, data: string | Uint8Array): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari cancels an in-flight download if the URL
  // dies in the same task as the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Filename-safe: anything outside [A-Za-z0-9._-] collapses to a hyphen. */
function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

function localStamp(at: number): string {
  const d = new Date(at);
  const p = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: '.png',
  jpeg: '.jpg',
  jpg: '.jpg',
  gif: '.gif',
  webp: '.webp',
  bmp: '.bmp',
  svg: '.svg',
  'svg+xml': '.svg',
};

function bodyExtension(mode: BodyMode, contentType: string | null): string {
  if (mode === 'image') {
    const subtype = /^image\/([\w.+-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
    return (subtype && IMAGE_EXTENSIONS[subtype]) || '.bin';
  }
  if (mode === 'json') return '.json';
  if (mode === 'hex') return '.bin';
  return '.txt';
}

function defaultMime(mode: BodyMode): string {
  if (mode === 'json') return 'application/json';
  if (mode === 'hex') return 'application/octet-stream';
  return 'text/plain';
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
