// Regenerates the four README images in docs/ui/ from the real Web UI.
//
// They used to be exports of the design canvas
// (design_handoff_argus_inspector/Argus Inspector.html) — the artboard labels and
// the 1360x860 / 1360x720 sizes gave it away, and waterfall.png still carried the
// artboard chrome. The canvas has no splitter, so it could not show what #31
// shipped. These come from the built bundle instead, so they cannot drift from
// what the library actually serves.
//
// Data is the UI's OWN mock source, not fake-device.js: `?simulate=off` makes
// app.ts pick createMockSource (see app.ts's sameOrigin check — an explicit
// ?simulate= wins over the page origin), which replays FIXTURE_EVENTS as
// FIXTURE_DEVICE, `com.example.app 1.4.2 on Pixel 8`. fake-device.js advertises
// `com.lynxal.argus.probe 0.0.0-probe on Probe Device`, which is fine in a probe
// and wrong in a README. No API server is needed at all on this path.
//
// Not a probe: this WRITES FILES and has no pass/fail verdict, so it is
// deliberately absent from the `probes` script that CI runs. Run it by hand when
// the UI changes shape, then look at all four before committing.
//
// Usage:  node docs-shots.js
// Requires a built UI:  cd argus-webui && npm run build

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', '..', 'argus-webui', 'dist');
const OUT = path.join(__dirname, '..', '..', 'docs', 'ui');

// Existing sizes, kept exactly: README references these four filenames, and a
// changed aspect ratio would reflow every section that embeds one. Shot at 2x,
// which is what makes the on-disk files 2720px wide.
const TALL = { width: 1360, height: 860 };
const SHORT = { width: 1360, height: 720 };
const SCALE = 2;

const SETTLE_MS = 500;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
};

const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(3) + 's', ...a);

/** Static server over dist/ on an ephemeral port. No API routes: the mock source needs none. */
function startStatic() {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error(`${DIST}/index.html missing. Run: cd argus-webui && npm run build`);
    }
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
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
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ url: `http://127.0.0.1:${server.address().port}/?simulate=off`, close: () => server.close() });
        });
    });
}

/** The mock replays at speed 4, so the list fills over time. Wait for the whole fixture. */
async function waitForBackfill(page) {
    await page.waitForFunction(
        () => document.querySelectorAll('[data-event-id]').length > 0,
        { timeout: 15_000 },
    );
    let last = -1;
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(250);
        const n = await page.evaluate(() => document.querySelectorAll('[data-event-id]').length);
        if (n === last) return n;
        last = n;
    }
    return last;
}

async function setView(page, view) {
    await page.click(`[data-view="${view}"]`);
    await page.waitForTimeout(SETTLE_MS);
}

/** Widens the list pane by dragging the splitter to an absolute x, as splitter-probe.js does. */
async function dragSplitterTo(page, x) {
    const sep = await page.waitForSelector('[role="separator"]', { timeout: 5_000 });
    const box = await sep.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(SETTLE_MS);
}

async function shot(page, name) {
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
    log(`wrote docs/ui/${name}`);
}

(async () => {
    const site = await startStatic();
    const browser = await chromium.launch();
    const problems = [];

    try {
        // --- hero.png + waterfall.png: the tall pair -------------------------
        {
            const ctx = await browser.newContext({ viewport: TALL, deviceScaleFactor: SCALE });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
            await page.goto(site.url, { waitUntil: 'domcontentloaded' });
            const n = await waitForBackfill(page);
            log(`backfill settled at ${n} events`);

            // Hero: split view with a JSON response open. It has to be THIS row —
            // fixtures/events.ts gives a bodyPreview to exactly one event
            // (`withBody` is hardcoded to GET /v1/orders?page=2&status=paid), so
            // any other selection renders "No body" and a mostly empty pane.
            await setView(page, 'split');
            await page.click('[data-event-id]:has-text("/v1/orders?page=2&status=paid")');
            await page.waitForTimeout(SETTLE_MS);
            await page.getByRole('button', { name: 'Response' }).click();
            await page.waitForTimeout(SETTLE_MS);
            const expand = page.getByRole('button', { name: 'Expand all' });
            if (await expand.count()) {
                await expand.first().click();
                await page.waitForTimeout(SETTLE_MS);
            }
            await shot(page, 'hero.png');

            // Waterfall: pane dragged past its 320px default so the image shows
            // the resize #31 added. 560px leaves the timeline its own minimum.
            await setView(page, 'waterfall');
            await dragSplitterTo(page, 576);
            await shot(page, 'waterfall.png');

            await ctx.close();
        }

        // --- event-list.png + filters.png: the short pair --------------------
        {
            const ctx = await browser.newContext({ viewport: SHORT, deviceScaleFactor: SCALE });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
            await page.goto(site.url, { waitUntil: 'domcontentloaded' });
            await waitForBackfill(page);

            // Event list: the full-width single-column stream, nothing selected.
            await setView(page, 'list');
            await shot(page, 'event-list.png');

            // Filters: every chip starts active (filters.ts DEFAULTS is
            // new Set(ALL_*)), so the useful image is one where some are OFF —
            // that is what shows the active/inactive tint difference the README
            // caption describes, and makes the x/y counter read as a narrowed
            // stream rather than 20/20. Status chips are `<button><dot/><span>4XX`,
            // so their accessible name is uppercase.
            for (const name of ['2XX', '3XX']) {
                await page.getByRole('button', { name, exact: true }).first().click();
            }
            // input.type = 'search', so the role is searchbox, not textbox.
            await page.getByRole('searchbox', { name: 'host-contains' }).fill('api.example');
            await page.waitForTimeout(SETTLE_MS);
            await shot(page, 'filters.png');

            await ctx.close();
        }
    } finally {
        await browser.close();
        site.close();
    }

    if (problems.length) {
        console.error('\npage errors while shooting:');
        problems.forEach((p) => console.error(`  ${p}`));
        process.exit(1);
    }
    log('done — open all four before committing');
})();
