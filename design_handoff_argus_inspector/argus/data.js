// Mock event stream. Deterministic.
const DATA = [
  { id: 1, kind: 'HTTP', method: 'GET', status: 200, url: '/v1/users/self', host: 'api.example.com', ts: '14:22:07.412', dur: 124, size: 1820, offset: 2, width: 12 },
  { id: 2, kind: 'LOG', level: 'INFO', msg: 'Session refreshed · id=9f2c', ts: '14:22:07.418', tag: 'auth', offset: 14, width: 0 },
  { id: 3, kind: 'HTTP', method: 'POST', status: 204, url: '/v1/events/batch', host: 'api.example.com', ts: '14:22:07.520', dur: 312, size: 4096, offset: 18, width: 22 },
  { id: 4, kind: 'HTTP', method: 'GET', status: 200, url: '/v1/orders?page=2&status=paid', host: 'api.example.com', ts: '14:22:07.802', dur: 186, size: 12480, offset: 26, width: 15 },
  { id: 5, kind: 'CUSTOM', name: 'cart.item_added', msg: 'sku=SKU-8821 · qty=2 · price=24.50', ts: '14:22:07.850', offset: 32, width: 0 },
  { id: 6, kind: 'LOG', level: 'DEBUG', msg: 'Cache hit · key=user/9f2c · ttl=285s', ts: '14:22:07.960', tag: 'cache', offset: 34, width: 0 },
  { id: 7, kind: 'HTTP', method: 'POST', status: 401, url: '/v1/auth/refresh', host: 'auth.example.com', ts: '14:22:08.012', dur: 89, size: 312, offset: 36, width: 6 },
  { id: 8, kind: 'LOG', level: 'WARN', msg: 'Retrying publish after 2 failed attempts', ts: '14:22:08.140', tag: 'publisher', offset: 42, width: 0 },
  { id: 9, kind: 'HTTP', method: 'GET', status: 304, url: '/v1/config', host: 'api.example.com', ts: '14:22:08.200', dur: 42, size: 0, offset: 44, width: 3 },
  { id: 10, kind: 'HTTP', method: 'DELETE', status: 500, url: '/v1/orders/98213', host: 'api.example.com', ts: '14:22:08.250', dur: 2400, size: 512, offset: 46, width: 40 },
  { id: 11, kind: 'LOG', level: 'ERROR', msg: 'NullPointerException at OrderRepo.save:42', ts: '14:22:08.251', tag: 'orders', offset: 46, width: 0 },
  { id: 12, kind: 'HTTP', method: 'PATCH', status: 200, url: '/v1/users/self/prefs', host: 'api.example.com', ts: '14:22:09.010', dur: 94, size: 412, offset: 72, width: 7 },
  { id: 13, kind: 'CUSTOM', name: 'analytics.page_view', msg: 'path=/checkout · ref=/cart', ts: '14:22:09.120', offset: 74, width: 0 },
  { id: 14, kind: 'HTTP', method: 'GET', status: 200, url: '/v1/products/SKU-8821', host: 'api.example.com', ts: '14:22:09.300', dur: 76, size: 2048, offset: 78, width: 5 },
  { id: 15, kind: 'HTTP', method: 'PUT', status: 422, url: '/v1/cart/items/a12', host: 'api.example.com', ts: '14:22:09.520', dur: 110, size: 240, offset: 84, width: 8 },
  { id: 16, kind: 'LOG', level: 'VERB', msg: 'Tick · scheduler=events · queue=0', ts: '14:22:09.900', tag: 'sched', offset: 92, width: 0 },
  { id: 17, kind: 'HTTP', method: 'OPTIONS', status: null, err: 'CONNECT_TIMEOUT', url: '/v1/stream', host: 'realtime.example.com', ts: '14:22:10.100', dur: null, size: 0, offset: 96, width: 2 },
];

const HEADERS_REQ = [
  ['Accept', 'application/json, text/plain, */*'],
  ['Accept-Encoding', 'gzip, deflate, br'],
  ['Accept-Language', 'en-US,en;q=0.9'],
  ['Authorization', '***redacted***', true],
  ['Connection', 'keep-alive'],
  ['Host', 'api.example.com'],
  ['User-Agent', 'Argus/1.0 (Android 14; Pixel 8)'],
  ['X-Request-Id', 'req_9f2c31aa'],
  ['X-Trace-Id', 'trace_8821bb'],
];
const HEADERS_RES = [
  ['Cache-Control', 'private, max-age=60'],
  ['Content-Encoding', 'gzip'],
  ['Content-Type', 'application/json; charset=utf-8'],
  ['Date', 'Mon, 14 Apr 2026 14:22:07 GMT'],
  ['ETag', 'W/"6f82-9f2c31aa"'],
  ['Server', 'nginx/1.25'],
  ['Set-Cookie', '***redacted***', true],
  ['X-Request-Id', 'req_9f2c31aa'],
  ['X-RateLimit-Remaining', '942'],
];
const BODY_JSON = {
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
};
const PAYLOAD_KV = [
  ['event', 'cart.item_added'],
  ['sku', 'SKU-8821'],
  ['qty', '2'],
  ['price', '24.50'],
  ['currency', 'USD'],
  ['cart_id', 'cart_9f2c31aa'],
  ['user_id', 'cus_8821b'],
];
const RELATED_LOGS = [
  { id: 2, level: 'INFO', tag: 'auth', msg: 'Session refreshed · id=9f2c', ts: '14:22:07.418', delta: '+6 ms' },
  { id: 6, level: 'DEBUG', tag: 'cache', msg: 'Cache hit · key=user/9f2c · ttl=285s', ts: '14:22:07.960', delta: '+548 ms' },
];
const STACK = `java.lang.NullPointerException: Attempt to invoke virtual method on a null object reference
    at com.example.orders.OrderRepo.save(OrderRepo.kt:42)
    at com.example.orders.OrderService.place(OrderService.kt:128)
    at com.example.api.OrdersHandler.handle(OrdersHandler.kt:74)
    at io.argus.server.Router.dispatch(Router.kt:91)
    at io.argus.server.Server$requestLoop.invoke(Server.kt:214)
Caused by: java.lang.IllegalStateException: DB connection pool exhausted
    at com.example.db.Pool.acquire(Pool.kt:58)
    at com.example.orders.OrderRepo.save(OrderRepo.kt:38)
    ... 4 more`;

window.ARGUS_DATA = { DATA, HEADERS_REQ, HEADERS_RES, BODY_JSON, PAYLOAD_KV, RELATED_LOGS, STACK };
