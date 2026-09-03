// Regression probe for [#28](https://github.com/lynxal/KMM-Argus/issues/28): an
// expanded JSON node in the body viewer survives events arriving on the stream.
//
// The detail pane used to subscribe to the whole `store.events` array, so every
// ingested event — a log from elsewhere in the app, nothing to do with the call
// being inspected — re-ran the effect and rebuilt the tab body from scratch via
// `content.innerHTML = ''`. Expansion lived only in the `<details>` elements that
// wipe destroyed, so every node the reader had opened snapped back to the
// `depth < 2` default and the pane's scroll offset went with it. On a busy stream
// the JSON tree was unusable unless you hit Pause first.
//
// Three things are asserted separately because three things were wrong: that a
// push no longer rebuilds the pane at all — checked by DOM element identity, not
// by open state, since a restored rebuild would look identical either way — that
// expansion is remembered per pane so it also survives the rebuilds that DO still
// happen (tab switch, reselect), and that a deliberate COLLAPSE is remembered too
// rather than springing back to the default.
//
// Self-contained via fake-device.js: the mock source schedules its whole fixture
// up front inside connect() and has no push API, so it cannot make an event
// arrive after a node has been expanded.
//
// Usage:  node json-expand-probe.js
//         node json-expand-probe.js --diagnose   # + a per-node open-state dump
//
// Requires a built UI:  cd argus-webui && npm run build

const path = require('path');
const { chromium } = require('playwright');
const { startFakeDevice } = require('./fake-device');

const SETTLE_MS = 250;
const VIEWPORT = { width: 1400, height: 800 };
const DIAGNOSE = process.argv.includes('--diagnose');

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);

// Nested past depth 2 on purpose: the top two levels open by default, so only a
// deeper node can show that a MANUAL expansion was lost rather than a default
// being re-applied. Padded with enough keys that the pane overflows — the scroll
// assertion needs somewhere to scroll to.
const RESPONSE_BODY = JSON.stringify({
    meta: { requestId: 'req-42', page: 1, total: 3 },
    data: {
        user: {
            id: 7,
            name: 'Ada Lovelace',
            address: { street: '12 Analytical Way', city: 'London', geo: { lat: 51.5, lng: -0.12 } },
            roles: ['admin', 'engineer', 'author'],
            settings: { theme: 'dark', density: 'compact', notify: { email: true, push: false } },
        },
        // A key with a slash and one with a tilde: path escaping has to keep these
        // from colliding with a nesting level or with each other.
        'a/b': { nested: { deep: true } },
        'a~1b': { nested: { deep: false } },
    },
    padding: Object.fromEntries(
        Array.from({ length: 120 }, (_, i) => [`filler_${i}`, `value ${i}`]),
    ),
});

// Deliberately shares its top-level shape with the response so the two panes'
// paths overlap. A single shared expansion key would leak one tree's state into
// the other, where the same path means something else.
const REQUEST_BODY = JSON.stringify({
    meta: { draft: true },
    data: { user: { id: 7, patch: { name: 'Ada L.' } } },
});

const CALL_ID = 'call-json';

const CALL = {
    type: 'HttpEvent',
    id: CALL_ID,
    timestamp: 1_000,
    source: 'HTTP',
    engine: 'ktor',
    durationMs: 12,
    correlationId: null,
    request: {
        method: 'POST',
        url: 'https://probe.example/users/7',
        host: 'probe.example',
        path: '/users/7',
        headers: [{ name: 'content-type', value: 'application/json' }],
        bodyPreview: REQUEST_BODY,
        contentType: 'application/json',
        sizeBytes: REQUEST_BODY.length,
    },
    response: {
        statusCode: 200,
        statusText: 'OK',
        headers: [{ name: 'content-type', value: 'application/json' }],
        bodyPreview: RESPONSE_BODY,
        contentType: 'application/json',
        sizeBytes: RESPONSE_BODY.length,
    },
};

// A little company in the list, so the selected row is not also the newest — the
// shape a real session has.
const FILLER = Array.from({ length: 4 }, (_, i) => ({
    type: 'LogEvent',
    id: `log-backfill-${i}`,
    timestamp: 1_100 + i,
    source: 'LOG',
    level: 'Debug',
    tag: 'Probe',
    message: `backfilled line ${i}`,
    payload: {},
    correlationId: null,
}));

const EVENTS = [CALL, ...FILLER];

/** An unrelated log — what the user was doing when the tree collapsed under them. */
function incoming(n) {
    return {
        type: 'LogEvent',
        id: `log-live-${n}`,
        timestamp: 2_000 + n,
        source: 'LOG',
        level: 'Info',
        tag: 'Probe',
        message: `live line ${n} — unrelated to the selected call`,
        payload: {},
        correlationId: null,
    };
}

// --- in-page helpers -------------------------------------------------------
// Addressed through [data-json-node], the tree's structural hook, for the same
// reason the tab strip has [data-detail-tabs]: Tailwind classes are styling and
// change freely, these do not.

function pageNodes() {
    return [...document.querySelectorAll('[data-json-node]')].map((d) => [
        d.dataset.jsonNode,
        d.open,
    ]);
}

function pageRowCount() {
    return document.querySelectorAll('[data-event-id]').length;
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const openState = (nodes, p) => {
    const hit = nodes.find(([q]) => q === p);
    return hit ? hit[1] : undefined;
};

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

    /**
     * Clicks the first collapsed node the reader could actually reach — one whose
     * ancestors are open — and returns its path. A node buried inside a closed
     * parent is not a thing a user can expand, so it is not what this tests.
     */
    const expandFirstVisibleClosed = () =>
        page.evaluate(() => {
            const target = [...document.querySelectorAll('[data-json-node]')].find(
                (d) => !d.open && d.offsetParent !== null,
            );
            if (!target) return null;
            target.querySelector('summary').click();
            return target.dataset.jsonNode;
        });

    const toggle = (nodePath) =>
        page.evaluate((p) => {
            const el = document.querySelector(`[data-json-node="${p}"]`);
            if (!el) return null;
            el.querySelector('summary').click();
            return el.open;
        }, nodePath);

    /** Pushes `count` live logs and waits for the list to actually take them. */
    const pushEvents = async (count, from) => {
        const before = await page.evaluate(pageRowCount);
        for (let i = 0; i < count; i++) device.push(incoming(from + i));
        await page.waitForFunction(
            (n) => document.querySelectorAll('[data-event-id]').length > n,
            before,
            { timeout: 5_000 },
        );
        await page.waitForTimeout(SETTLE_MS);
    };

    const openTab = async (name) => {
        await page.click(`button:text-is("${name}")`);
        await page.waitForTimeout(SETTLE_MS);
    };

    try {
        log(`fake device on ${device.url}`);
        await page.goto(device.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(`[data-event-id="${CALL_ID}"]`, { timeout: 10_000 });
        // detailTab persists to localStorage, so a previous run would otherwise
        // decide which tab this one starts on.
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector(`[data-event-id="${CALL_ID}"]`, { timeout: 10_000 });

        await page.click(`[data-event-id="${CALL_ID}"]`);
        await page.waitForTimeout(SETTLE_MS);

        const tabs = await page.evaluate(() => {
            const strip = document.querySelector('[data-detail-tabs]');
            return strip ? [...strip.children].map((b) => b.textContent) : [];
        });
        // Told apart from a real failure on purpose: with no strip found every
        // assertion below reads as an empty tree, and the run looks like the bug it
        // is meant to catch.
        if (tabs.length === 0) {
            throw new Error('no [data-detail-tabs] strip — stale dist/? run: cd argus-webui && npm run build');
        }

        await openTab('Response');

        const arrived = await page.evaluate(pageNodes);
        if (arrived.length === 0) {
            throw new Error(
                'no [data-json-node] elements — the tree has no structural hook, or the ' +
                'Response body did not render as JSON',
            );
        }
        log(`Response tree rendered with ${arrived.length} collapsible nodes`);
        check(
            'the tree arrives with deep nodes collapsed',
            arrived.some(([, open]) => !open),
            JSON.stringify(arrived),
        );
        check(
            'a key containing a slash gets its own path',
            arrived.some(([p]) => p === '/data/a~1b') && arrived.some(([p]) => p === '/data/a~01b'),
            JSON.stringify(arrived.map(([p]) => p)),
        );

        // --- 1. a manual expansion survives unrelated events ---------------
        const opened = await expandFirstVisibleClosed();
        if (!opened) throw new Error('no reachable collapsed node — fixture is not deep enough');
        log(`expanded ${JSON.stringify(opened)}`);
        await page.waitForTimeout(SETTLE_MS);

        const beforeNodes = await page.evaluate(pageNodes);
        // Held across the pushes on purpose. Restoring expansion would make a
        // rebuilt tree indistinguishable from an untouched one by open state alone,
        // so the no-rebuild claim is made against the element itself: a wiped
        // subtree leaves this handle detached. It is also what proves the reader's
        // text selection and the pane's scroll position survive, neither of which
        // any amount of state restoration could bring back.
        const node = await page.$(`[data-json-node="${opened}"]`);
        if (DIAGNOSE) log('before:', JSON.stringify(beforeNodes));

        await pushEvents(3, 0);

        const afterNodes = await page.evaluate(pageNodes);
        if (DIAGNOSE) log('after: ', JSON.stringify(afterNodes));

        check(
            'the expanded node is still open after three events arrive',
            openState(afterNodes, opened) === true,
            `${JSON.stringify(opened)} → ${JSON.stringify(openState(afterNodes, opened))}`,
        );
        check(
            'no node changed its open state',
            same(beforeNodes, afterNodes),
            `before ${JSON.stringify(beforeNodes)} after ${JSON.stringify(afterNodes)}`,
        );
        check(
            'the pane was not rebuilt — the same DOM node is still mounted',
            await node.evaluate((el) => el.isConnected),
            'the element the reader expanded was replaced',
        );

        // --- 2. a deliberate COLLAPSE survives too -------------------------
        // Recording only what the reader changed is what makes this work: a node
        // that opens by default and was closed on purpose must stay closed.
        const closedByHand = '/data';
        const nowOpen = await toggle(closedByHand);
        check(
            `the default-open node ${JSON.stringify(closedByHand)} can be collapsed`,
            nowOpen === false,
            String(nowOpen),
        );
        if (nowOpen === false) {
            await pushEvents(2, 10);
            const nodes = await page.evaluate(pageNodes);
            check(
                'a deliberately collapsed node does not spring back open',
                openState(nodes, closedByHand) === false,
                JSON.stringify(openState(nodes, closedByHand)),
            );
        }

        // --- 3. and survives the rebuilds that DO happen -------------------
        await openTab('Headers');
        await openTab('Response');
        let nodes = await page.evaluate(pageNodes);
        check(
            'expansion survives a tab switch away and back',
            openState(nodes, opened) === true && openState(nodes, closedByHand) === false,
            JSON.stringify(nodes),
        );

        await page.click('[data-event-id="log-backfill-0"]');
        await page.waitForTimeout(SETTLE_MS);
        await page.click(`[data-event-id="${CALL_ID}"]`);
        await page.waitForTimeout(SETTLE_MS);
        nodes = await page.evaluate(pageNodes);
        check(
            'expansion survives reselecting the row',
            openState(nodes, opened) === true,
            JSON.stringify(nodes),
        );

        // --- 4. the panes of one event stay independent --------------------
        await openTab('Request');
        const req = await page.evaluate(pageNodes);
        check(
            'the Request tree has the paths the Response tree does',
            openState(req, opened) !== undefined && openState(req, closedByHand) !== undefined,
            JSON.stringify(req.map(([p]) => p)),
        );
        check(
            'the Request pane keeps its own defaults',
            openState(req, opened) === false && openState(req, closedByHand) === true,
            JSON.stringify(req),
        );

        if (failures.length) throw new Error(`${failures.length} assertion(s) failed`);
        log('OK — every assertion passed');
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
