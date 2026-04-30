import {
  type ArgusEvent,
  type EventSource as WireEventSource,
  isCustomEvent,
  isHttpEvent,
  isLogEvent,
  type LogLevel,
  statusClass,
} from '../transport/schema';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'OTHER';
export type StatusBucket = '2xx' | '3xx' | '4xx' | '5xx' | 'err';

/**
 * All filter state as one object — the README flags this as load-bearing:
 * a single applyFilters() keeps the list, waterfall, and count in lockstep
 * and makes `clear all filters` trivial.
 */
export interface Filters {
  sources: ReadonlySet<WireEventSource>;
  methods: ReadonlySet<HttpMethod>;
  statuses: ReadonlySet<StatusBucket>;
  levels: ReadonlySet<LogLevel>;
  hostQuery: string;
  tagQuery: string;
  textQuery: string;
  /**
   * Optional whitelist of CustomEvent.sourceLabel values. `null` means "no
   * source-label restriction" — every CUSTOM event passes (subject to other
   * filters). A non-null Set restricts CUSTOM events to entries whose
   * sourceLabel is in the set.
   */
  sourceLabels: ReadonlySet<string> | null;
}

export const ALL_SOURCES: readonly WireEventSource[] = ['HTTP', 'LOG', 'CUSTOM'];
export const ALL_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'OTHER',
];
export const ALL_STATUSES: readonly StatusBucket[] = ['2xx', '3xx', '4xx', '5xx', 'err'];
export const ALL_LEVELS: readonly LogLevel[] = ['Verbose', 'Debug', 'Info', 'Warning', 'Error'];

export const DEFAULT_FILTERS: Filters = {
  sources: new Set(ALL_SOURCES),
  methods: new Set(ALL_METHODS),
  statuses: new Set(ALL_STATUSES),
  levels: new Set(ALL_LEVELS),
  hostQuery: '',
  tagQuery: '',
  textQuery: '',
  sourceLabels: null,
};

export function isDefaultFilters(f: Filters): boolean {
  return (
    f.sources.size === ALL_SOURCES.length &&
    f.methods.size === ALL_METHODS.length &&
    f.statuses.size === ALL_STATUSES.length &&
    f.levels.size === ALL_LEVELS.length &&
    f.hostQuery === '' &&
    f.tagQuery === '' &&
    f.textQuery === '' &&
    f.sourceLabels === null
  );
}

function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (
    upper === 'GET' ||
    upper === 'POST' ||
    upper === 'PUT' ||
    upper === 'PATCH' ||
    upper === 'DELETE' ||
    upper === 'HEAD' ||
    upper === 'OPTIONS'
  ) {
    return upper;
  }
  return 'OTHER';
}

/**
 * Pure filter. Single function intentional — README calls out this pattern:
 * everything that reads the filtered stream goes through here, so a single
 * keystroke on a text input recomputes every view atomically.
 */
export function applyFilters(events: readonly ArgusEvent[], f: Filters): ArgusEvent[] {
  if (isDefaultFilters(f)) return events as ArgusEvent[];

  const hostQ = f.hostQuery.trim().toLowerCase();
  const tagQ = f.tagQuery.trim().toLowerCase();
  const textQ = f.textQuery.trim().toLowerCase();

  const out: ArgusEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!f.sources.has(e.source)) continue;

    if (isHttpEvent(e)) {
      const method = normalizeMethod(e.request.method);
      if (!f.methods.has(method)) continue;
      const bucket = statusClass(e.response?.statusCode ?? null);
      if (!f.statuses.has(bucket)) continue;
      if (hostQ && !e.request.host.toLowerCase().includes(hostQ)) continue;
      if (textQ) {
        const hay = `${e.request.url} ${e.request.path}`.toLowerCase();
        if (!hay.includes(textQ)) continue;
      }
    } else if (isLogEvent(e)) {
      if (!f.levels.has(e.level)) continue;
      if (tagQ) {
        if (!e.tag || !e.tag.toLowerCase().includes(tagQ)) continue;
      }
      if (textQ && !e.message.toLowerCase().includes(textQ)) continue;
    } else if (isCustomEvent(e)) {
      if (f.sourceLabels && !f.sourceLabels.has(e.sourceLabel)) continue;
      if (tagQ && !e.sourceLabel.toLowerCase().includes(tagQ)) continue;
      if (textQ) {
        const hay = `${e.label} ${e.payload}`.toLowerCase();
        if (!hay.includes(textQ)) continue;
      }
    }

    out.push(e);
  }
  return out;
}

/** Mutable shape used when building up a new filter set — callers mutate the Sets in place. */
export interface MutableFilters {
  sources: Set<WireEventSource>;
  methods: Set<HttpMethod>;
  statuses: Set<StatusBucket>;
  levels: Set<LogLevel>;
  hostQuery: string;
  tagQuery: string;
  textQuery: string;
  sourceLabels: Set<string> | null;
}

export function cloneFilters(f: Filters): MutableFilters {
  return {
    sources: new Set(f.sources),
    methods: new Set(f.methods),
    statuses: new Set(f.statuses),
    levels: new Set(f.levels),
    hostQuery: f.hostQuery,
    tagQuery: f.tagQuery,
    textQuery: f.textQuery,
    sourceLabels: f.sourceLabels === null ? null : new Set(f.sourceLabels),
  };
}
