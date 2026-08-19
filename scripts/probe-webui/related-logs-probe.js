// Regression probe: the Related Logs panel is reachable from every member of a
// correlation group, not only from the HTTP call.
//
// Before this, LOG_TABS had no Related Logs entry. Following a log out of an HTTP
// call's Related Logs list therefore selected an event that could not answer the
// question being asked — the tab vanished mid-walk and the rest of the group
// became unreachable without going back to the call.
//
// Usage:  node related-logs-probe.js
//
// Requires a built UI:  cd argus-webui && npm run build

const path = require('path');
const { chromium } = require('playwright');
const { startFakeDevice } = require('./fake-device');

const SETTLE_MS = 250;
const VIEWPORT = { width: 1400, height: 800 };
const CID = 'trace-probe';

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);

// One call plus three logs in its scope, and one log outside any scope. The
// group is deliberately larger than two so "the group minus me" is a distinct
// answer from "the whole group".
const CORRELATED_LOGS = ['alpha', 'beta', 'gamma'];
const EVENTS = [
    {
        type: 'HttpEvent',
        id: 'call-1',
        timestamp: 1_000,
        source: 'HTTP',
        engine: 'ktor',
        durationMs: 5,
        correlationId: CID,
        request: { method: 'GET', url: 'https://probe.example/users/1', host: 'probe.example', path: '/users/1', headers: [] },
        response: { statusCode: 200, statusText: 'OK', headers: [] },
    },
    ...CORRELATED_LOGS.map((name, i) => ({
        type: 'LogEvent',
        id: `log-${name}`,
        timestamp: 1_001 + i,
        source: 'LOG',
        level: 'Debug',
        tag: 'Probe',
        message: `correlated line ${name}`,
        payload: {},
        correlationId: CID,
    })),
    {
        type: 'LogEvent',
        id: 'log-uncorrelated',
        timestamp: 1_100,
        source: 'LOG',
        level: 'Info',
        tag: 'Probe',
        message: 'line outside any correlation scope',
        payload: {},
        correlationId: null,
    },
];

// --- in-page helpers -------------------------------------------------------
// The detail tab strip is the row of buttons in the panel header; the active tab
// is the one carrying the selected background. Both are found structurally so a
// class rename shows up as a probe failure rather than a silent false pass.

function pageTabNames() {
    const strip = document.querySelector('[data-detail-tabs]');
    return strip ? [...strip.children].map((b) => b.textContent) : [];
}

function pageActiveTab() {
    const strip = document.querySelector('[data-detail-tabs]');
    if (!strip) return null;
    const active = [...strip.children].find((b) => b.className.includes('bg-bg-subtle'));
    return active ? active.textContent : null;
}

function pageRelatedLines() {
    const panel = document.querySelector('[data-related-logs]');
    return panel ? [...panel.querySelectorAll('button')].map((b) => b.textContent.trim()) : [];
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
    let device;
    try {
        device = await startFakeDevice(EVENTS);
    } catch (e) {
        console.error(`FAIL: ${e.message}`);
        process.exit(1);
    }

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const consoleLines = [];
    page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    const select = (id) => page.click(`[data-event-id="${id}"]`);
    const clickRelated = (text) =>
        page.evaluate((t) => {
            const panel = document.querySelector('[data-related-logs]');
            [...panel.querySelectorAll('button')].find((b) => b.textContent.includes(t)).click();
        }, text);

    try {
        log(`fake device on ${device.url}`);
        await page.goto(device.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-event-id="call-1"]', { timeout: 10_000 });
        // detailTab persists to localStorage, so a previous run would otherwise
        // decide which tab this one starts on.
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-event-id="call-1"]', { timeout: 10_000 });

        // --- the call's own panel, unchanged ---
        await select('call-1');
        await page.waitForTimeout(SETTLE_MS);
        let tabs = await page.evaluate(pageTabNames);
        // Told apart from a real failure on purpose: with no strip found, every
        // assertion below reads as an empty list and the run looks like the bug
        // it is meant to catch.
        if (tabs.length === 0) {
            throw new Error('no [data-detail-tabs] strip — stale dist/? run: cd argus-webui && npm run build');
        }
        check('HTTP detail offers Related Logs', tabs.includes('Related Logs'), JSON.stringify(tabs));

        await page.click('button:text-is("Related Logs")');
        await page.waitForTimeout(SETTLE_MS);
        let lines = await page.evaluate(pageRelatedLines);
        check(
            'the call lists every log in its scope',
            lines.length === CORRELATED_LOGS.length,
            JSON.stringify(lines),
        );

        // --- walking into a log: the tab has to survive the hop ---
        await clickRelated('correlated line alpha');
        await page.waitForTimeout(SETTLE_MS);
        tabs = await page.evaluate(pageTabNames);
        check('the selected log offers Related Logs', tabs.includes('Related Logs'), JSON.stringify(tabs));
        check(
            'the log keeps its own tabs',
            tabs.includes('Message') && tabs.includes('Stack Trace'),
            JSON.stringify(tabs),
        );
        check(
            'the tab is still the active one after the hop',
            (await page.evaluate(pageActiveTab)) === 'Related Logs',
            await page.evaluate(pageActiveTab),
        );

        lines = await page.evaluate(pageRelatedLines);
        check(
            'the log lists its group minus itself',
            lines.length === CORRELATED_LOGS.length - 1 && !lines.some((l) => l.includes('alpha')),
            JSON.stringify(lines),
        );

        // --- and again, so a group is walkable end to end ---
        await clickRelated('correlated line beta');
        await page.waitForTimeout(SETTLE_MS);
        lines = await page.evaluate(pageRelatedLines);
        check(
            'a second hop works the same way',
            (await page.evaluate(pageActiveTab)) === 'Related Logs' &&
                lines.length === CORRELATED_LOGS.length - 1 &&
                !lines.some((l) => l.includes('beta')),
            JSON.stringify(lines),
        );

        // --- a log outside any scope explains itself rather than showing a dead tab ---
        await select('log-uncorrelated');
        await page.waitForTimeout(SETTLE_MS);
        const text = await page.evaluate(() => document.body.innerText);
        check(
            'an uncorrelated log says why the panel is empty',
            text.includes('No correlation id on this event.'),
            JSON.stringify(await page.evaluate(pageRelatedLines)),
        );

        if (failures.length) throw new Error(`${failures.length} assertion(s) failed`);
        log('OK — 8 assertions passed');
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
