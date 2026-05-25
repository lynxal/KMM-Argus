// Manual probe: opens /ws, asserts Hello within 2 s with the expected schema version,
// then idles 25 s and asserts at least one server-driven ping. Exits 0 on success.
//
// Usage:  node ws-probe.js [ws-url]
// Default: ws://localhost:8787/ws

const WebSocket = require('ws');

const EXPECTED_SCHEMA = 2;            // mirrors argus-webui/src/transport/schema.ts
const HELLO_TIMEOUT_MS = 2_000;
const IDLE_WINDOW_MS = 25_000;        // server pings every 20 s by default

const url = process.argv[2] || 'ws://localhost:8787/ws';
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);
const fail = (msg) => { console.error(`FAIL ${ts()}: ${msg}`); process.exit(1); };

log(`connecting to ${url}`);
const ws = new WebSocket(url, { handshakeTimeout: 5_000, perMessageDeflate: false });

let helloSeen = false;
let pingSeen = false;

const helloTimer = setTimeout(() => {
    if (!helloSeen) fail(`no hello frame within ${HELLO_TIMEOUT_MS} ms`);
}, HELLO_TIMEOUT_MS);

const idleTimer = setTimeout(() => {
    clearTimeout(helloTimer);
    if (!pingSeen) {
        fail(`no server-driven ping within ${IDLE_WINDOW_MS / 1000} s (server should send one every ~20 s)`);
    }
    log('OK — hello received, ping received, no unexpected close');
    ws.close();
    process.exit(0);
}, IDLE_WINDOW_MS);

ws.on('upgrade', (res) => log(`UPGRADE ${res.statusCode}`));

ws.on('open', () => log(`OPEN (readyState=${ws.readyState})`));

ws.on('message', (data, isBinary) => {
    if (isBinary) { log(`MSG <binary ${data.length}b>`); return; }
    const text = data.toString();
    log(`MSG ${text.slice(0, 300)}`);
    let parsed;
    try { parsed = JSON.parse(text); } catch { return; }
    if (parsed && parsed.type === 'hello') {
        helloSeen = true;
        clearTimeout(helloTimer);
        if (parsed.schemaVersion !== EXPECTED_SCHEMA) {
            fail(`schemaVersion mismatch: expected ${EXPECTED_SCHEMA}, got ${parsed.schemaVersion}`);
        }
        log(`hello OK (schemaVersion=${parsed.schemaVersion}, argusVersion=${parsed.info && parsed.info.argusVersion})`);
    }
});

ws.on('ping', (data) => { pingSeen = true; log(`PING ${data.length}b`); });
ws.on('pong', () => log('PONG'));

ws.on('close', (code, reason) => {
    log(`CLOSE code=${code} reason="${reason.toString().slice(0, 200)}"`);
    if (!helloSeen) fail(`closed before hello (code ${code}) — this is the reconnect-loop symptom`);
    if (!pingSeen) fail(`closed before any server ping (code ${code})`);
    process.exit(0);
});

ws.on('error', (e) => log(`ERR ${e.code || ''} ${e.message}`));
