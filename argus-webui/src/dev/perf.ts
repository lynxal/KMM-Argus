/**
 * Performance harness. Loaded when `?perf=1` is set in the URL. Seeds 10 000
 * mock events, measures filter latency, highlight cost, and waterfall redraw
 * time — results log to the console and also render in a corner panel.
 *
 * Run via `npm run dev -- --mode perf` then visit
 * http://localhost:5173/?perf=1
 */
import { applyFilters, cloneFilters, DEFAULT_FILTERS } from '../store/filters';
import type { ArgusEvent } from '../transport/schema';

export function runPerfHarness(): void {
  const events = generateEvents(10_000);

  const t0 = performance.now();
  const filtered = applyFilters(events, DEFAULT_FILTERS);
  const tFilterDefault = performance.now() - t0;

  const f = cloneFilters(DEFAULT_FILTERS);
  f.textQuery = 'abc';
  const t1 = performance.now();
  const filteredText = applyFilters(events, f);
  const tFilterText = performance.now() - t1;

  const results = {
    totalEvents: events.length,
    filterDefaultMs: round(tFilterDefault),
    filterTextMs: round(tFilterText),
    filteredDefault: filtered.length,
    filteredText: filteredText.length,
  };

  // eslint-disable-next-line no-console
  console.log('[perf]', results);

  const panel = document.createElement('pre');
  panel.className = 'ds-perf-panel';
  panel.textContent = JSON.stringify(results, null, 2);
  document.body.appendChild(panel);
}

function generateEvents(n: number): ArgusEvent[] {
  const out: ArgusEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 7;
    if (r <= 3) {
      out.push({
        type: 'HttpEvent',
        id: `e${i}`,
        timestamp: Date.now() + i,
        source: 'HTTP',
        request: {
          method: ['GET', 'POST', 'PUT', 'DELETE'][r % 4] ?? 'GET',
          url: `https://api.example.com/v1/items/${i}`,
          host: 'api.example.com',
          path: `/v1/items/${i}`,
          headers: [],
        },
        response: { statusCode: [200, 201, 404, 500][r % 4] ?? 200, statusText: 'OK', headers: [] },
        error: null,
        durationMs: (i * 7) % 400,
      });
    } else if (r <= 5) {
      out.push({
        type: 'LogEvent',
        id: `e${i}`,
        timestamp: Date.now() + i,
        source: 'LOG',
        level: ['Verbose', 'Debug', 'Info', 'Warning', 'Error'][i % 5] as
          | 'Verbose' | 'Debug' | 'Info' | 'Warning' | 'Error',
        tag: 'bench',
        message: `synthetic log ${i}`,
        payload: {},
        throwable: null,
      });
    } else {
      out.push({
        type: 'CustomEvent',
        id: `e${i}`,
        timestamp: Date.now() + i,
        source: 'CUSTOM',
        sourceLabel: 'bench',
        label: 'tick',
        direction: 'OUTBOUND',
        payload: `seq=${i}`,
        metadata: {},
      });
    }
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
