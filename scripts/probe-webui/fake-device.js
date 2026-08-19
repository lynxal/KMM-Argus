// A fake Argus device, in-process: the static UI plus the three endpoints the
// websocketSource speaks. Shared by the probes that need to drive the real UI
// without a phone attached.
//
// Serving the built bundle from the same origin as the API is what makes this
// useful rather than convenient: app.ts resolves the device to whatever origin
// served the page, so the real mountApp and the real websocketSource are what
// run — no test seam in shipped code, and app-shell bugs stay reachable.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Must match ARGUS_SCHEMA_VERSION in argus-webui/src/transport/schema.ts. The UI
// disconnects silently on a mismatch, so a missed bump here looks like a
// connection failure rather than a version problem. No static check ties them
// together — bump both when the wire schema changes.
const EXPECTED_SCHEMA = 2;

const DIST = path.join(__dirname, '..', '..', 'argus-webui', 'dist');

const APP_INFO = {
    pkg: 'com.lynxal.argus.probe',
    versionName: '0.0.0-probe',
    device: 'Probe Device',
    argusVersion: '0.0.0',
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
};

/** Throws with the fix rather than a stack trace when the UI has not been built. */
function requireBuiltUi() {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error(`${DIST}/index.html missing. Run: cd argus-webui && npm run build`);
    }
}

/**
 * Serves `events` as the backfill and returns a handle that can push more over
 * the WebSocket at any time. Listens on an ephemeral port so probes can run
 * concurrently.
 */
function startFakeDevice(events = []) {
    requireBuiltUi();

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/info') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(APP_INFO));
            return;
        }
        if (url.pathname === '/api/events') {
            if (req.method === 'DELETE') {
                res.writeHead(204);
                res.end();
                return;
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(events));
            return;
        }
        const rel = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        fs.readFile(file, (err, body) => {
            if (err) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        });
    });

    const wss = new WebSocketServer({ server, path: '/ws' });
    const clients = new Set();
    wss.on('connection', (socket) => {
        clients.add(socket);
        socket.on('close', () => clients.delete(socket));
        socket.send(JSON.stringify({ type: 'hello', info: APP_INFO, schemaVersion: EXPECTED_SCHEMA }));
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                port: server.address().port,
                url: `http://127.0.0.1:${server.address().port}/`,
                push(event) {
                    const frame = JSON.stringify({ type: 'event', event });
                    for (const c of clients) c.send(frame);
                },
                close() {
                    for (const c of clients) c.terminate();
                    wss.close();
                    server.close();
                },
            });
        });
    });
}

module.exports = { startFakeDevice, EXPECTED_SCHEMA, APP_INFO, DIST };
