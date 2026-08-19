// Regression probe for issue #15 — "filtered-out event blanks the list while
// following the tail". Boots a fake Argus device (static UI + /api/info +
// /api/events + WS /ws) in-process, drives the real UI in headless Chromium,
// and asserts the rendered row window survives every update that leaves the
// filtered item count unchanged.
//
// The fake device rather than the bundled mock source is deliberate: the mock
// replays a finite ~19-event fixture and cannot emit on demand after a filter is
// applied, and the whole point here is an event that arrives *while* filtered.
// Serving the built UI same-origin also means app.ts resolves the device to this
// server, so the real mountApp and the real websocketSource are under test — the
// bug lived in the app shell, above the EventList, and a harness that mounted
// EventList alone could not see it.
//
// Usage:  node follow-tail-probe.js [--diagnose]
//         --diagnose dumps a scrollTop/DOM-mutation timeline around each
//         injection instead of only pass/fail. Exits 0 on success.
//
// Requires a built UI:  cd argus-webui && npm run build

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');

// Must match ARGUS_SCHEMA_VERSION in argus-webui/src/transport/schema.ts. The UI
// disconnects silently on a mismatch, so a missed bump here looks like a
// connection failure rather than a version problem. No static check ties them
// together — bump both when the wire schema changes.
const EXPECTED_SCHEMA = 2;

const DIST = path.join(__dirname, '..', '..', 'argus-webui', 'dist');
// 60 rows overflows the ~590 px list viewport at either density. Content taller
// than the viewport is a precondition of the bug: with a short list the pin
// early-returns and scrollTop is 0 anyway, so nothing can be stranded.
const BACKFILL_COUNT = 60;
const INJECTIONS = 6;
const SETTLE_MS = 400;
const VIEWPORT = { width: 900, height: 600 };

const diagnose = process.argv.includes('--diagnose');

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
};

const APP_INFO = {
    pkg: 'com.lynxal.argus.probe',
    versionName: '0.0.0-probe',
    device: 'Probe Device',
    argusVersion: '0.0.0',
};

let seq = 0;
function httpEvent(i) {
    const id = `http-${i}`;
    return {
        type: 'HttpEvent',
        id,
        timestamp: Date.now() - (BACKFILL_COUNT - i) * 1000,
        source: 'HTTP',
        request: {
            method: 'GET',
            url: `https://probe.example/api/item/${i}`,
            host: 'probe.example',
            path: `/api/item/${i}`,
            headers: [{ name: 'accept', value: 'application/json' }],
        },
        response: {
            statusCode: 200,
            statusText: 'OK',
            headers: [{ name: 'content-type', value: 'application/json' }],
            sizeBytes: 128,
        },
        durationMs: 12 + (i % 7),
        engine: 'ktor',
    };
}

function logEvent() {
    const n = seq++;
    return {
        type: 'LogEvent',
        id: `log-${n}`,
        timestamp: Date.now(),
        source: 'LOG',
        level: 'Debug',
        tag: 'Probe',
        message: `probe debug log ${n}`,
        payload: {},
    };
}

function startFakeDevice() {
    const backfill = [];
    for (let i = 0; i < BACKFILL_COUNT; i++) backfill.push(httpEvent(i));

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
            res.end(JSON.stringify(backfill));
            return;
        }
        // Static UI. Anything without an extension falls back to index.html.
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

// --- in-page helpers -------------------------------------------------------
// Serialized into the browser, so they must be self-contained.

/** Locate the EventList scroll viewport via a row rather than by class name. */
function pageMeasure() {
    const row = document.querySelector('[data-event-id]');
    if (!row) return { rows: 0 };
    const inner = row.parentElement;
    const viewport = inner.parentElement;
    const vb = viewport.getBoundingClientRect();
    let visible = 0;
    let windowTop = Infinity;
    let windowBottom = -Infinity;
    for (const el of inner.children) {
        const b = el.getBoundingClientRect();
        windowTop = Math.min(windowTop, b.top - vb.top + viewport.scrollTop);
        windowBottom = Math.max(windowBottom, b.bottom - vb.top + viewport.scrollTop);
        if (b.bottom > vb.top && b.top < vb.bottom) visible++;
    }
    return {
        rows: inner.children.length,
        visible,
        scrollTop: Math.round(viewport.scrollTop),
        scrollHeight: Math.round(viewport.scrollHeight),
        clientHeight: Math.round(viewport.clientHeight),
        rowHeight: Math.round(row.getBoundingClientRect().height),
        windowTop: Math.round(windowTop),
        windowBottom: Math.round(windowBottom),
        distanceFromTail: Math.round(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight),
    };
}

/**
 * Records what actually moves scrollTop. Distinguishes the two candidate causes:
 * a scroll event carrying a reverted position (the browser stomp the pin guard
 * defends against) versus the viewport being detached and re-appended by an
 * ancestor rebuild, which drops the offset with no event at all.
 */
function pageInstall() {
    const row = document.querySelector('[data-event-id]');
    const viewport = row.parentElement.parentElement;
    const timeline = [];
    window.__probeTimeline = timeline;
    window.__probeViewport = viewport;
    viewport.addEventListener('scroll', () => {
        timeline.push({ kind: 'scroll', scrollTop: Math.round(viewport.scrollTop) });
    });
    new MutationObserver((records) => {
        for (const r of records) {
            for (const n of r.removedNodes) {
                if (n.nodeType === 1 && (n === viewport || n.contains(viewport))) {
                    timeline.push({
                        kind: 'detach',
                        parent: r.target.className,
                        scrollTop: Math.round(viewport.scrollTop),
                    });
                }
            }
            for (const n of r.addedNodes) {
                if (n.nodeType === 1 && (n === viewport || n.contains(viewport))) {
                    timeline.push({
                        kind: 'reattach',
                        parent: r.target.className,
                        scrollTop: Math.round(viewport.scrollTop),
                    });
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
}

// --- assertions ------------------------------------------------------------

const failures = [];
function check(name, ok, detail) {
    if (ok) {
        log(`  ok   ${name}`);
    } else {
        log(`  FAIL ${name} — ${detail}`);
        failures.push(`${name} — ${detail}`);
    }
}

(async () => {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        console.error(`FAIL: ${DIST}/index.html missing. Run: cd argus-webui && npm run build`);
        process.exit(1);
    }

    const device = await startFakeDevice();
    const url = `http://127.0.0.1:${device.port}/`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    const consoleLines = [];
    page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    try {
        log(`fake device on ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            (n) => document.querySelectorAll('[data-event-id]').length > 0 &&
                   document.querySelector('[data-event-id]').parentElement.parentElement.scrollHeight >
                   document.querySelector('[data-event-id]').parentElement.parentElement.clientHeight,
            BACKFILL_COUNT,
            { timeout: 10_000 },
        );
        await page.waitForTimeout(SETTLE_MS);
        await page.evaluate(pageInstall);

        // --- following the tail on arrival ---
        let m = await page.evaluate(pageMeasure);
        log(`baseline ${JSON.stringify(m)}`);
        check(
            'backfill overflows the viewport (bug precondition)',
            m.scrollHeight > m.clientHeight,
            `scrollHeight=${m.scrollHeight} clientHeight=${m.clientHeight} — raise BACKFILL_COUNT`,
        );
        check('list opens following the tail', m.distanceFromTail < m.rowHeight, JSON.stringify(m));
        check('rows are on screen', m.visible > 0, JSON.stringify(m));

        // --- issue #15: a filtered-out event must not move the viewport ---
        log('deselecting the LOG source chip');
        await page.click('button:text-is("LOG")');
        await page.waitForTimeout(SETTLE_MS);
        const filtered = await page.evaluate(pageMeasure);
        check('list still followed after filtering', filtered.visible > 0, JSON.stringify(filtered));

        let before = filtered;
        for (let i = 1; i <= INJECTIONS; i++) {
            await page.evaluate(() => { window.__probeTimeline.length = 0; });
            device.push(logEvent());
            await page.waitForTimeout(SETTLE_MS);
            const after = await page.evaluate(pageMeasure);
            if (diagnose) {
                const timeline = await page.evaluate(() => window.__probeTimeline);
                log(`  timeline ${JSON.stringify(timeline)}`);
            }
            check(
                `injection ${i}/${INJECTIONS}: filtered-out event keeps rows on screen`,
                after.visible > 0,
                `scrollTop ${before.scrollTop}→${after.scrollTop}, rendered window ` +
                    `${after.windowTop}..${after.windowBottom}px, viewport 0..${after.clientHeight}px`,
            );
            check(
                `injection ${i}/${INJECTIONS}: filtered-out event does not move scrollTop`,
                Math.abs(after.scrollTop - before.scrollTop) <= 1,
                `${before.scrollTop} → ${after.scrollTop}`,
            );
            check(
                `injection ${i}/${INJECTIONS}: filtered-out event stays hidden`,
                after.rows === before.rows,
                `rendered rows ${before.rows} → ${after.rows}`,
            );
            before = after;
        }

        // --- complement: a visible event must still advance the tail ---
        device.push(httpEvent(BACKFILL_COUNT + seq++));
        await page.waitForTimeout(SETTLE_MS);
        let after = await page.evaluate(pageMeasure);
        check(
            'visible event advances the tail by one row',
            Math.abs(after.scrollTop - before.scrollTop - after.rowHeight) <= 2,
            `${before.scrollTop} → ${after.scrollTop} (rowHeight ${after.rowHeight})`,
        );
        check('visible event keeps rows on screen', after.visible > 0, JSON.stringify(after));

        // --- the other same-count setItems paths #15 flagged ---
        // Both drop the row pool and re-set identical items, so they hit the same
        // no-op scrollTop write as a filtered-out event.
        before = after;
        await page.fill('input[aria-label="url/message contains"]', 'item');
        await page.waitForTimeout(SETTLE_MS);
        after = await page.evaluate(pageMeasure);
        check('search query keeps rows on screen', after.visible > 0, JSON.stringify(after));

        await page.fill('input[aria-label="url/message contains"]', '');
        await page.waitForTimeout(SETTLE_MS);
        await page.locator('body').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('c');
        await page.waitForTimeout(SETTLE_MS);
        after = await page.evaluate(pageMeasure);
        check('correlation-column toggle keeps rows on screen', after.visible > 0, JSON.stringify(after));

        // --- the empty-state flip the fix must still deliver ---
        // app.ts swaps the content host through a boolean `computed` so it no
        // longer re-runs per event. Guard the other direction: if that ever stops
        // re-running at all, the waiting screen sticks and no list is ever shown.
        const waitingVisible = () =>
            page.evaluate(() => !!Array.from(document.querySelectorAll('*'))
                .find((e) => e.textContent === 'Waiting for events'));
        await page.keyboard.press('Shift+X');
        await page.waitForTimeout(SETTLE_MS);
        check('clearing all events shows the waiting screen', await waitingVisible(), 'still on the list');

        device.push(httpEvent(BACKFILL_COUNT + seq++));
        await page.waitForTimeout(SETTLE_MS);
        check('the next event mounts the list again', !(await waitingVisible()), 'stuck on the waiting screen');
        after = await page.evaluate(pageMeasure);
        check('the remounted list renders its row', after.rows > 0, JSON.stringify(after));

        if (failures.length) throw new Error(`${failures.length} assertion(s) failed`);
        log(`OK — ${INJECTIONS} filtered injections and 8 companion checks passed`);
        await browser.close();
        device.close();
        process.exit(0);
    } catch (e) {
        const out = path.join(__dirname, 'last-failure.png');
        try { await page.screenshot({ path: out, fullPage: true }); } catch {}
        console.error(`FAIL ${ts()}: ${e.message}`);
        for (const f of failures) console.error(`  - ${f}`);
        if (consoleLines.length) {
            console.error('--- browser console ---');
            for (const line of consoleLines) console.error(line);
        }
        console.error(`screenshot: ${out}`);
        await browser.close();
        device.close();
        process.exit(1);
    }
})();
