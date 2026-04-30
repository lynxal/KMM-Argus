import { describe, expect, it } from 'vitest';
import { buildCurl } from '../keyboard';
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
