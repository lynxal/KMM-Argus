import type { ArgusEvent, Header, HttpEvent, LogEvent, LogLevel, CustomEvent } from '../../transport/schema';

/**
 * Port of design_handoff_argus_inspector/argus/data.js reshaped to the real
 * ArgusEvent polymorphic JSON. Timestamps are baked against a fixed epoch so
 * snapshots stay stable; mockSource.ts can optionally rebase them to "now".
 */

const BASE = Date.parse('2026-04-23T14:22:07.000Z');
const ts = (msOffset: number): number => BASE + msOffset;

const REQUEST_HEADERS: Header[] = [
  { name: 'Accept', value: 'application/json, text/plain, */*' },
  { name: 'Accept-Encoding', value: 'gzip, deflate, br' },
  { name: 'Accept-Language', value: 'en-US,en;q=0.9' },
  { name: 'Authorization', value: '***redacted***', redacted: true },
  { name: 'Connection', value: 'keep-alive' },
  { name: 'Host', value: 'api.example.com' },
  { name: 'User-Agent', value: 'Argus/1.0 (Android 14; Pixel 8)' },
  { name: 'X-Request-Id', value: 'req_9f2c31aa' },
  { name: 'X-Trace-Id', value: 'trace_8821bb' },
];

const RESPONSE_HEADERS: Header[] = [
  { name: 'Cache-Control', value: 'private, max-age=60' },
  { name: 'Content-Encoding', value: 'gzip' },
  { name: 'Content-Type', value: 'application/json; charset=utf-8' },
  { name: 'Date', value: 'Mon, 14 Apr 2026 14:22:07 GMT' },
  { name: 'ETag', value: 'W/"6f82-9f2c31aa"' },
  { name: 'Server', value: 'nginx/1.25' },
  { name: 'Set-Cookie', value: '***redacted***', redacted: true },
  { name: 'X-Request-Id', value: 'req_9f2c31aa' },
  { name: 'X-RateLimit-Remaining', value: '942' },
];

const ORDER_JSON = JSON.stringify(
  {
    order: {
      id: 'ord_9f2c31',
      customer_id: 'cus_8821b',
      total: 124.5,
      currency: 'USD',
      paid: true,
      items: [
        { sku: 'SKU-8821', name: 'Wireless Keyboard', qty: 1, price: 99.0 },
        { sku: 'SKU-2201', name: 'USB-C Cable 1m', qty: 2, price: 12.75 },
      ],
      shipped_at: null,
      created_at: '2026-04-14T14:22:07.412Z',
    },
  },
  null,
  2,
);

const STACK_500 = `java.lang.NullPointerException: Attempt to invoke virtual method on a null object reference
    at com.example.orders.OrderRepo.save(OrderRepo.kt:42)
    at com.example.orders.OrderService.place(OrderService.kt:128)
    at com.example.api.OrdersHandler.handle(OrdersHandler.kt:74)
    at io.argus.server.Router.dispatch(Router.kt:91)
    at io.argus.server.Server$requestLoop.invoke(Server.kt:214)
Caused by: java.lang.IllegalStateException: DB connection pool exhausted
    at com.example.db.Pool.acquire(Pool.kt:58)
    at com.example.orders.OrderRepo.save(OrderRepo.kt:38)
    ... 4 more`;

function http(
  id: number,
  offset: number,
  duration: number | null,
  method: string,
  status: number | null,
  host: string,
  path: string,
  sizeBytes: number | null,
  extra: Partial<HttpEvent> = {},
): HttpEvent {
  const url = `https://${host}${path}`;
  const withBody = status === 200 && method === 'GET' && path === '/v1/orders?page=2&status=paid';
  return {
    type: 'HttpEvent',
    id: `evt_${id}`,
    timestamp: ts(offset),
    source: 'HTTP',
    durationMs: duration,
    request: {
      method,
      url,
      host,
      path,
      headers: REQUEST_HEADERS,
    },
    response:
      status == null
        ? null
        : {
            statusCode: status,
            statusText:
              status === 200
                ? 'OK'
                : status === 204
                  ? 'No Content'
                  : status === 304
                    ? 'Not Modified'
                    : status === 401
                      ? 'Unauthorized'
                      : status === 422
                        ? 'Unprocessable Entity'
                        : status === 500
                          ? 'Internal Server Error'
                          : '',
            headers: RESPONSE_HEADERS,
            bodyPreview: withBody ? ORDER_JSON : null,
            sizeBytes,
            contentType: 'application/json; charset=utf-8',
          },
    error: null,
    ...extra,
  };
}

function log(
  id: number,
  offset: number,
  level: LogLevel,
  tag: string,
  message: string,
  throwable?: LogEvent['throwable'],
): LogEvent {
  const evt: LogEvent = {
    type: 'LogEvent',
    id: `evt_${id}`,
    timestamp: ts(offset),
    source: 'LOG',
    level,
    tag,
    message,
    payload: {},
    throwable: null,
  };
  if (throwable !== undefined) {
    evt.throwable = throwable;
  }
  return evt;
}

function custom(id: number, offset: number, label: string, payload: string): CustomEvent {
  return {
    type: 'CustomEvent',
    id: `evt_${id}`,
    timestamp: ts(offset),
    source: 'CUSTOM',
    sourceLabel: 'analytics',
    label,
    direction: 'OUTBOUND',
    payload,
    metadata: {},
  };
}

export const FIXTURE_EVENTS: ArgusEvent[] = [
  http(1, 412, 124, 'GET', 200, 'api.example.com', '/v1/users/self', 1820),
  log(2, 418, 'Info', 'auth', 'Session refreshed · id=9f2c'),
  http(3, 520, 312, 'POST', 204, 'api.example.com', '/v1/events/batch', 4096),
  http(4, 802, 186, 'GET', 200, 'api.example.com', '/v1/orders?page=2&status=paid', 12480),
  custom(5, 850, 'cart.item_added', 'sku=SKU-8821 · qty=2 · price=24.50'),
  log(6, 960, 'Debug', 'cache', 'Cache hit · key=user/9f2c · ttl=285s'),
  http(7, 1012, 89, 'POST', 401, 'auth.example.com', '/v1/auth/refresh', 312),
  log(8, 1140, 'Warning', 'publisher', 'Retrying publish after 2 failed attempts'),
  http(9, 1200, 42, 'GET', 304, 'api.example.com', '/v1/config', 0),
  http(10, 1250, 2400, 'DELETE', 500, 'api.example.com', '/v1/orders/98213', 512),
  log(11, 1251, 'Error', 'orders', 'NullPointerException at OrderRepo.save:42', {
    className: 'java.lang.NullPointerException',
    message: 'Attempt to invoke virtual method on a null object reference',
    stackTrace: STACK_500,
    cause: {
      className: 'java.lang.IllegalStateException',
      message: 'DB connection pool exhausted',
      stackTrace: STACK_500,
      cause: null,
    },
  }),
  http(12, 2010, 94, 'PATCH', 200, 'api.example.com', '/v1/users/self/prefs', 412),
  custom(13, 2120, 'analytics.page_view', 'path=/checkout · ref=/cart'),
  http(14, 2300, 76, 'GET', 200, 'api.example.com', '/v1/products/SKU-8821', 2048),
  http(15, 2520, 110, 'PUT', 422, 'api.example.com', '/v1/cart/items/a12', 240),
  log(16, 2900, 'Verbose', 'sched', 'Tick · scheduler=events · queue=0'),
  http(17, 3100, null, 'OPTIONS', null, 'realtime.example.com', '/v1/stream', 0, {
    error: {
      throwableClass: 'java.net.SocketTimeoutException',
      message: 'CONNECT_TIMEOUT',
      stackTrace: '',
    },
  }),
];

export const FIXTURE_DEVICE = {
  name: 'Pixel 8',
  address: '192.168.1.42:9090',
  platform: 'android' as const,
  version: '1.4.2',
  pkg: 'com.example.app',
};
