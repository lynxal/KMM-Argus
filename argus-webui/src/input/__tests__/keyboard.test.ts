import { describe, expect, it } from 'vitest';
import { buildCurl, nextSelectionIndex } from '../keyboard';
import type { HttpEvent } from '../../transport/schema';

describe('buildCurl', () => {
  const evt: HttpEvent = {
    type: 'HttpEvent',
    id: 'e1',
    timestamp: 0,
    source: 'HTTP',
    engine: 'ktor',
    durationMs: 1,
    request: {
      method: 'POST',
      url: 'https://api.example.com/v1/orders',
      host: 'api.example.com',
      path: '/v1/orders',
      headers: [
        { name: 'Authorization', value: 'Bearer secret', redacted: true },
        { name: 'Content-Type', value: 'application/json' },
      ],
      bodyPreview: '{"total":10}',
    },
    response: null,
    error: null,
  };

  it('emits one header per -H line and redacts secrets', () => {
    const out = buildCurl(evt);
    expect(out).toContain("curl -X POST 'https://api.example.com/v1/orders'");
    expect(out).toContain("-H 'Authorization: ***redacted***'");
    expect(out).toContain("-H 'Content-Type: application/json'");
    expect(out).toContain(`--data-binary $'{"total":10}'`);
  });

  it('omits --data-binary when there is no body', () => {
    const plain: HttpEvent = {
      ...evt,
      request: { ...evt.request, bodyPreview: null },
    };
    expect(buildCurl(plain)).not.toContain('--data-binary');
  });
});

describe('nextSelectionIndex', () => {
  it('lands on the top row when nothing is selected', () => {
    expect(nextSelectionIndex(-1, 5, 'selectNext')).toBe(0);
    expect(nextSelectionIndex(-1, 5, 'selectPrev')).toBe(0);
  });

  it('moves one row down for next and one up for prev', () => {
    expect(nextSelectionIndex(2, 5, 'selectNext')).toBe(3);
    expect(nextSelectionIndex(2, 5, 'selectPrev')).toBe(1);
  });

  it('clamps at both ends without wrapping', () => {
    expect(nextSelectionIndex(4, 5, 'selectNext')).toBe(4);
    expect(nextSelectionIndex(0, 5, 'selectPrev')).toBe(0);
  });

  it('stays put on a single-element list', () => {
    expect(nextSelectionIndex(0, 1, 'selectNext')).toBe(0);
    expect(nextSelectionIndex(0, 1, 'selectPrev')).toBe(0);
  });
});
