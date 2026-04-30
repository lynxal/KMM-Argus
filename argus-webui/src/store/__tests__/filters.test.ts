import { describe, it, expect } from 'vitest';
import { applyFilters, cloneFilters, DEFAULT_FILTERS } from '../filters';
import type { ArgusEvent } from '../../transport/schema';

function http(id: string, method: string, status: number, host: string, path: string): ArgusEvent {
  return {
    type: 'HttpEvent',
    id,
    timestamp: 0,
    source: 'HTTP',
    engine: 'ktor',
    request: { method, url: `https://${host}${path}`, host, path, headers: [] },
    response: { statusCode: status, statusText: '', headers: [] },
    error: null,
    durationMs: 0,
  };
}

function log(id: string, tag: string, message: string, level: 'Info' | 'Error' = 'Info'): ArgusEvent {
  return {
    type: 'LogEvent',
    id,
    timestamp: 0,
    source: 'LOG',
    level,
    tag,
    message,
    payload: {},
    throwable: null,
  };
}

describe('applyFilters', () => {
  const sample: ArgusEvent[] = [
    http('1', 'GET', 200, 'api.example.com', '/users'),
    http('2', 'POST', 500, 'api.example.com', '/orders'),
    http('3', 'GET', 404, 'cdn.example.com', '/missing'),
    log('4', 'auth', 'Session refreshed'),
    log('5', 'orders', 'Null pointer', 'Error'),
  ];

  it('returns the input untouched when filters are the defaults', () => {
    const out = applyFilters(sample, DEFAULT_FILTERS);
    expect(out).toHaveLength(sample.length);
  });

  it('hides a source when deselected', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.sources.delete('LOG');
    expect(applyFilters(sample, f).every((e) => e.source !== 'LOG')).toBe(true);
  });

  it('filters HTTP by status bucket', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.statuses = new Set(['5xx']);
    const out = applyFilters(sample, f);
    expect(out.map((e) => e.id)).toEqual(['2', '4', '5']); // logs pass; only 5xx http passes
  });

  it('host substring filter is case-insensitive and scopes to HTTP', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.hostQuery = 'CDN';
    const out = applyFilters(sample, f);
    // HTTP requires host match; logs/custom are untouched by hostQuery.
    expect(out.map((e) => e.id).sort()).toEqual(['3', '4', '5']);
  });

  it('textQuery matches HTTP url but not LOG tag', () => {
    // textQuery scans HTTP url/path and LOG message, not LOG tag. Log 5's tag
    // is 'orders' but its message is 'Null pointer' — so it stays filtered out.
    const f = cloneFilters(DEFAULT_FILTERS);
    f.textQuery = 'orders';
    expect(applyFilters(sample, f).map((e) => e.id)).toEqual(['2']);
  });

  it('textQuery matches LOG message', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.textQuery = 'session';
    expect(applyFilters(sample, f).map((e) => e.id)).toContain('4');
  });

  it('tagQuery filters LOG by tag and CUSTOM by sourceLabel', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.tagQuery = 'auth';
    const out = applyFilters(sample, f).map((e) => e.id);
    // HTTP events are unaffected by tagQuery in the current impl — kept.
    expect(out).toContain('4');
    expect(out).not.toContain('5');
  });

  it('levels filter excludes deselected LogLevels', () => {
    const f = cloneFilters(DEFAULT_FILTERS);
    f.levels = new Set(['Error']);
    const out = applyFilters(sample, f).map((e) => e.id);
    expect(out).toContain('5');
    expect(out).not.toContain('4');
  });
});
