// Manual probe: drives the argus web UI in headless Chromium and asserts it
// reaches the "connected" state within a fixed timeout. On failure, dumps
// console + screenshot to last-failure.png. Exits 0 on success.
//
// Usage:  node ui-probe.js [base-url]
// Default: http://localhost:8787/

const { chromium } = require('playwright');
const path = require('path');

const CONNECTED_TIMEOUT_MS = 8_000;
const SETTLE_WINDOW_MS = 5_000;

(async () => {
    const url = process.argv[2] || 'http://localhost:8787/';
    const t0 = Date.now();
    const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
    const log = (...a) => console.log(ts(), ...a);

    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const consoleLines = [];
    page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
    page.on('websocket', (ws) => {
        log(`WS opened: ${ws.url()}`);
        ws.on('framereceived', (f) => log(`  WS<- ${String(f.payload).slice(0, 200)}`));
        ws.on('close', () => log(`WS closed: ${ws.url()}`));
    });

    log(`navigating to ${url}`);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        // The ConnectionBanner element (`.ds-banner`) hides itself (adds `hidden`
        // class) only when connection state is 'connected'. While the banner is
        // visible, its text is "Reconnecting…" or "Disconnected. …".
        const isConnected = () => {
            const el = document.querySelector('.ds-banner');
            return !!el && el.classList.contains('hidden');
        };
        await page.waitForFunction(isConnected, null, { timeout: CONNECTED_TIMEOUT_MS });
        log('banner hidden → connection state = connected');

        // Stay connected for the settle window.
        await new Promise((r) => setTimeout(r, SETTLE_WINDOW_MS));
        const stillConnected = await page.evaluate(isConnected);
        if (!stillConnected) throw new Error(`fell out of connected state within ${SETTLE_WINDOW_MS / 1000} s`);

        log('OK — stayed connected through settle window');
        await browser.close();
        process.exit(0);
    } catch (e) {
        const out = path.join(__dirname, 'last-failure.png');
        try { await page.screenshot({ path: out, fullPage: true }); } catch {}
        console.error(`FAIL ${ts()}: ${e.message}`);
        if (consoleLines.length) {
            console.error('--- browser console ---');
            for (const line of consoleLines) console.error(line);
        }
        console.error(`screenshot: ${out}`);
        await browser.close();
        process.exit(1);
    }
})();
