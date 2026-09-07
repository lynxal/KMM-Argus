// Probe for issue #31 — "waterfall list pane is a fixed 320px, so long rows clip
// with no way to widen it". Boots a fake Argus device, drives the real UI in
// headless Chromium, and asserts two things the fix has to deliver together:
// the splitter actually resizes the pane (and remembers it), and a row fits
// inside that pane at every width the splitter can produce.
//
// Layout is asserted by measuring boxes, never by reading class names: the whole
// bug was cells whose declared widths were correct while the browser laid them
// out past the pane's right edge. Narrow mode is asserted by computed `display`
// for the same reason version-probe.js does — a Tailwind display utility beats
// the `hidden` attribute, so the attribute proves nothing about what painted.
//
// Usage:  node splitter-probe.js [--diagnose]
//         --diagnose dumps every row cell's box at each width instead of only
//         pass/fail. Exits 0 on success.
//
// Requires a built UI:  cd argus-webui && npm run build

const path = require('path');
const { chromium } = require('playwright');
const { startFakeDevice } = require('./fake-device');

const VIEWPORT = { width: 1400, height: 700 };
const SETTLE_MS = 400;
const shotPath = path.join(__dirname, 'last-failure.png');

// Must track the constants in argus-webui/src. A drift here is itself a finding:
// the probe is what says whether the chosen floor actually clears the row.
const MIN_LIST_WIDTH = 320;
const MIN_WATERFALL_WIDTH = 320;
const SPLITTER_WIDTH = 8;
const NARROW_LIST_WIDTH = 440;
const ROOT_PADDING = 16;
const DEFAULT_WIDTH = 320;

const LONG_PATH =
    '/api/v3/organizations/8f2a-canvas-control/spaces/ground-floor-east/devices' +
    '/luminaire-4417/telemetry?since=2026-09-01T00:00:00Z&fields=lightness,cct,power';

const diagnose = process.argv.includes('--diagnose');

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);

const failures = [];
function check(name, ok, detail) {
    if (ok) log(`  ok   ${name}`);
    else {
        log(`  FAIL ${name} — ${detail}`);
        failures.push(`${name} — ${detail}`);
    }
}

// --- fixtures --------------------------------------------------------------

const BASE_TS = 1_767_225_600_000;

function httpEvent(i, over = {}) {
    return {
        type: 'HttpEvent',
        id: `http-${i}`,
        timestamp: BASE_TS + i * 1000,
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
        // okhttp, not ktor: OKHTTP is the widest engine label, so it is the one
        // that decides whether the full row fits.
        engine: 'okhttp',
        ...over,
    };
}

function logEvent(i) {
    return {
        type: 'LogEvent',
        id: `log-${i}`,
        timestamp: BASE_TS + i * 1000,
        source: 'LOG',
        level: 'Debug',
        tag: 'SplitterProbe',
        message: `a deliberately long debug line that cannot fit a narrow pane, number ${i}`,
        payload: {},
    };
}

/**
 * Backfill. Two hops share a requestGroupId so the second one gets a real
 * redirect pill — buildRedirectOrigins keys continuation hops off the group, and
 * a pill nobody rendered would leave the widest cell untested.
 */
function buildBackfill() {
    const events = [];
    for (let i = 0; i < 18; i++) events.push(httpEvent(i));
    events.push(httpEvent(90, {
        id: 'redirect-origin',
        requestGroupId: 'grp-redirect',
        request: {
            method: 'OPTIONS',
            url: 'https://probe.example/old/resource',
            host: 'probe.example',
            path: '/old/resource',
            headers: [],
        },
        response: { statusCode: 302, statusText: 'Found', headers: [], sizeBytes: 0 },
    }));
    events.push(httpEvent(91, {
        id: 'redirect-hop',
        requestGroupId: 'grp-redirect',
        request: {
            method: 'OPTIONS',
            url: `https://probe.example${LONG_PATH}`,
            host: 'probe.example',
            path: LONG_PATH,
            headers: [],
        },
    }));
    for (let i = 0; i < 8; i++) events.push(logEvent(i));
    return events;
}

// --- in-page helpers -------------------------------------------------------
// Serialized into the browser, so they must be self-contained.

/** The list pane is the ancestor of a row that is a direct child of the flex root. */
function pageFindPanes() {
    const row = document.querySelector('[data-event-id]');
    if (!row) return null;
    let pane = row;
    while (pane.parentElement && !pane.parentElement.classList.contains('p-2')) {
        pane = pane.parentElement;
    }
    return { pane, root: pane.parentElement };
}

function pageListWidth() {
    const found = (function () {
        const row = document.querySelector('[data-event-id]');
        if (!row) return null;
        let pane = row;
        while (pane.parentElement && !pane.parentElement.classList.contains('p-2')) {
            pane = pane.parentElement;
        }
        return pane;
    })();
    return found ? Math.round(found.getBoundingClientRect().width) : -1;
}

/**
 * Every rendered row's cell boxes, relative to the row. `overflowRight` is the
 * bug: rows are absolutely positioned left:0/right:0 inside an overflow-x-hidden
 * viewport, so a cell past the row's right edge is simply not drawn.
 */
function pageRowBoxes() {
    const rows = Array.from(document.querySelectorAll('[data-event-id]'));
    return rows.map((row) => {
        const rb = row.getBoundingClientRect();
        const cells = Array.from(row.children).map((c) => {
            const b = c.getBoundingClientRect();
            const cs = getComputedStyle(c);
            return {
                cls: c.className.split(' ').slice(0, 2).join(' '),
                left: Math.round(b.left - rb.left),
                right: Math.round(b.right - rb.left),
                width: Math.round(b.width),
                display: cs.display,
                overflowRight: Math.round(b.right - rb.right),
                overflowBottom: Math.round(b.bottom - rb.bottom),
            };
        });
        return {
            id: row.dataset.eventId,
            width: Math.round(rb.width),
            height: Math.round(rb.height),
            cells,
        };
    });
}

/** Path/message cell state on one row: is it truncating, and is the full text recoverable? */
function pageTextCell(eventId) {
    const row = document.querySelector(`[data-event-id="${eventId}"]`);
    if (!row) return null;
    const cell = Array.from(row.children).find((c) => c.classList.contains('flex-1'));
    if (!cell) return null;
    return {
        scrollWidth: Math.round(cell.scrollWidth),
        clientWidth: Math.round(cell.clientWidth),
        title: cell.getAttribute('title') || '',
        textOverflow: getComputedStyle(cell).textOverflow,
    };
}

/** Computed display of the two cells narrow mode drops, plus the pill that must survive. */
function pageNarrowCells(eventId) {
    const row = document.querySelector(`[data-event-id="${eventId}"]`);
    if (!row) return null;
    const chip = row.querySelector('.ds-row-engine');
    const pill = row.querySelector('[data-redirect-pill]');
    const label = pill && pill.querySelector('.ds-row-redirect-label');
    return {
        chip: chip ? getComputedStyle(chip).display : 'absent',
        pill: pill ? getComputedStyle(pill).display : 'absent',
        // Measured, not textContent: a display:none child still contributes its
        // text to textContent, so only the box says whether the label was dropped.
        pillWidth: pill ? Math.round(pill.getBoundingClientRect().width) : -1,
        pillTitle: pill ? pill.getAttribute('title') || '' : '',
        label: label ? getComputedStyle(label).display : 'absent',
    };
}

function pageCanvasWidths() {
    return Array.from(document.querySelectorAll('canvas')).map((c) => c.style.width);
}

// --- drag ------------------------------------------------------------------

async function dragTo(page, targetWidth) {
    const handle = await page.$('[role="separator"]');
    if (!handle) throw new Error('no [role="separator"] in the waterfall view');
    const box = await handle.boundingBox();
    const current = await page.evaluate(pageListWidth);
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    // Two moves: a single one can land before the pointer capture is live.
    await page.mouse.move(startX + (targetWidth - current) / 2, y);
    await page.mouse.move(startX + (targetWidth - current), y);
    await page.mouse.up();
    await page.waitForTimeout(SETTLE_MS);
    return page.evaluate(pageListWidth);
}

/** No cell may sit outside its row, in either axis. Vertical is the pill wrap. */
async function checkNoOverflow(page, label) {
    const rows = await page.evaluate(pageRowBoxes);
    if (diagnose) {
        for (const r of rows.slice(0, 4)) {
            log(`  [diag ${label}] ${r.id} w=${r.width} ` +
                r.cells.map((c) => `${c.cls}:${c.left}-${c.right}${c.display === 'none' ? '(none)' : ''}`).join(' '));
        }
    }
    const clipped = [];
    const spilled = [];
    for (const r of rows) {
        for (const c of r.cells) {
            if (c.display === 'none') continue;
            if (c.overflowRight > 1 || c.left < -1) clipped.push(`${r.id}/${c.cls} right+${c.overflowRight} left${c.left}`);
            if (c.overflowBottom > 1) spilled.push(`${r.id}/${c.cls} bottom+${c.overflowBottom}`);
        }
    }
    check(`${label}: no cell escapes the row horizontally`, clipped.length === 0, clipped.slice(0, 3).join('; '));
    check(`${label}: no cell escapes the row vertically`, spilled.length === 0, spilled.slice(0, 3).join('; '));
    return rows;
}

// --- main ------------------------------------------------------------------

(async () => {
    let device;
    try {
        device = await startFakeDevice(buildBackfill());
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

    try {
        log(`fake device on ${device.url}`);
        await page.goto(device.url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            () => document.querySelectorAll('[data-event-id]').length > 0,
            { timeout: 10_000 },
        );

        // View defaults to 'split'; the cycle is list -> split -> waterfall, so one press.
        await page.keyboard.press('w');
        await page.waitForFunction(() => Boolean(document.querySelector('[role="separator"]')), { timeout: 5_000 });
        await page.waitForTimeout(SETTLE_MS);

        const rootWidth = await page.evaluate(() => {
            const row = document.querySelector('[data-event-id]');
            let pane = row;
            while (pane.parentElement && !pane.parentElement.classList.contains('p-2')) pane = pane.parentElement;
            return Math.round(pane.parentElement.clientWidth);
        });
        const available = rootWidth - ROOT_PADDING;
        const ceiling = available - SPLITTER_WIDTH - MIN_WATERFALL_WIDTH;
        log(`waterfall view: root=${rootWidth} available=${available} ceiling=${ceiling}`);

        // --- 1. opens at the default, unchanged from before the splitter existed ---
        const initial = await page.evaluate(pageListWidth);
        check('opens at the default width', initial === DEFAULT_WIDTH, `got ${initial}, expected ${DEFAULT_WIDTH}`);

        // --- 2. the drag tracks the pointer ---
        const dragged = await dragTo(page, 620);
        check('drag tracks the pointer', Math.abs(dragged - 620) <= 2, `got ${dragged}, expected ~620`);

        // --- 3. clamped at both ends ---
        const atMin = await dragTo(page, 100);
        check('clamped at the narrow end', atMin === MIN_LIST_WIDTH, `got ${atMin}, expected ${MIN_LIST_WIDTH}`);

        const atMax = await dragTo(page, available);
        check('clamped at the wide end', atMax === ceiling, `got ${atMax}, expected ${ceiling}`);

        // --- 4. nothing clips at the floor, and narrow mode is what makes that true ---
        await dragTo(page, MIN_LIST_WIDTH);
        await checkNoOverflow(page, `at ${MIN_LIST_WIDTH}px`);

        const narrow = await page.evaluate(pageNarrowCells, 'redirect-hop');
        check('narrow: engine chip is not painted', narrow.chip === 'none', `display=${narrow.chip}`);
        check('narrow: redirect label is not painted', narrow.label === 'none', `display=${narrow.label}`);
        check('narrow: the pill itself survives', narrow.pill !== 'none' && narrow.pill !== 'absent', `display=${narrow.pill}`);
        check('narrow: the pill shrinks to its glyph', narrow.pillWidth > 0 && narrow.pillWidth <= 30,
            `pill is ${narrow.pillWidth}px wide, expected a bare ↳`);
        check('narrow: the pill still names its origin', narrow.pillTitle.includes('/old/resource'), `title="${narrow.pillTitle}"`);

        const text = await page.evaluate(pageTextCell, 'redirect-hop');
        check('the long path truncates rather than clipping the row',
            text && text.scrollWidth > text.clientWidth, JSON.stringify(text));
        check('truncation renders an ellipsis', text && text.textOverflow === 'ellipsis', `textOverflow=${text && text.textOverflow}`);
        check('the full path stays recoverable', text && text.title.includes(LONG_PATH), `title="${text && text.title.slice(0, 40)}…"`);

        // --- 5. the optional correlation column, at the floor ---
        // The correlation cell is the one cell deliberately left shrinkable: with
        // the path cell's basis at 0 it absorbs the whole shortfall and truncates,
        // instead of the row's trailing cells being pushed off the right edge. That
        // is a claim about flex behaviour, so measure it rather than assert it.
        await page.evaluate(() => localStorage.setItem('argus.webui.showCorrelationId', 'true'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(document.querySelector('[role="separator"]')), { timeout: 10_000 });
        await page.waitForTimeout(SETTLE_MS);
        const withCorrelation = await dragTo(page, MIN_LIST_WIDTH);
        check('correlation column: still at the floor width', withCorrelation === MIN_LIST_WIDTH, `got ${withCorrelation}`);
        const corrRows = await checkNoOverflow(page, `at ${MIN_LIST_WIDTH}px with the correlation column`);
        const corrRow = corrRows.find((r) => r.id === 'redirect-hop');
        check('correlation column: the row gained a cell', corrRow && corrRow.cells.length === 8,
            `row has ${corrRow ? corrRow.cells.length : '?'} cells, expected 8`);
        await page.evaluate(() => localStorage.removeItem('argus.webui.showCorrelationId'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(document.querySelector('[role="separator"]')), { timeout: 10_000 });
        await page.waitForTimeout(SETTLE_MS);

        // --- 6. the band just either side of the narrow threshold ---
        // Just above it the full row is back, and that is where a threshold set too
        // low shows up as a cell hanging past the right edge.
        const justBelow = await dragTo(page, NARROW_LIST_WIDTH - 8);
        check('sits just below the narrow threshold', justBelow === NARROW_LIST_WIDTH - 8, `got ${justBelow}`);
        await checkNoOverflow(page, `at ${justBelow}px (narrow)`);

        const justAbove = await dragTo(page, NARROW_LIST_WIDTH + 8);
        check('sits just above the narrow threshold', justAbove === NARROW_LIST_WIDTH + 8, `got ${justAbove}`);
        const wideCells = await page.evaluate(pageNarrowCells, 'redirect-hop');
        check('wide: the engine chip is painted again', wideCells.chip !== 'none', `display=${wideCells.chip}`);
        check('wide: the redirect label is painted again', wideCells.label !== 'none', `display=${wideCells.label}`);
        check('wide: the pill is wider than its narrow form', wideCells.pillWidth > narrow.pillWidth + 20,
            `${narrow.pillWidth}px narrow vs ${wideCells.pillWidth}px wide`);
        await checkNoOverflow(page, `at ${justAbove}px (wide)`);

        // --- 7. the waterfall canvas is untouched by the drag ---
        const before = await page.evaluate(pageCanvasWidths);
        await dragTo(page, 700);
        const after = await page.evaluate(pageCanvasWidths);
        check('the drag does not rescale the waterfall canvas',
            before.length > 0 && JSON.stringify(before) === JSON.stringify(after),
            `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

        // --- 8. the width survives a reload ---
        const stored = await page.evaluate(() => localStorage.getItem('argus.webui.waterfallListWidth'));
        check('the width is persisted', stored === '700', `localStorage holds "${stored}"`);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(document.querySelector('[role="separator"]')), { timeout: 10_000 });
        await page.waitForTimeout(SETTLE_MS);
        const restored = await page.evaluate(pageListWidth);
        check('the width survives a reload', restored === 700, `got ${restored}, expected 700`);

        // --- 9. keyboard resize, since the handle is focusable ---
        await page.focus('[role="separator"]');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(SETTLE_MS);
        const nudged = await page.evaluate(pageListWidth);
        check('ArrowLeft narrows the pane', nudged === 700 - 16, `got ${nudged}, expected 684`);

        await page.keyboard.press('Home');
        await page.waitForTimeout(SETTLE_MS);
        const reset = await page.evaluate(pageListWidth);
        check('Home resets to the default', reset === DEFAULT_WIDTH, `got ${reset}, expected ${DEFAULT_WIDTH}`);
    } catch (e) {
        failures.push(`threw: ${e.message}`);
        try { await page.screenshot({ path: shotPath }); log(`screenshot → ${shotPath}`); } catch { /* ignore */ }
    } finally {
        const errors = consoleLines.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
        if (errors.length) log('page errors:', errors.join(' | '));
        await browser.close();
        device.close();
    }

    if (failures.length) {
        console.error(`\nsplitter-probe FAILED (${failures.length})`);
        for (const f of failures) console.error('  ' + f);
        process.exit(1);
    }
    console.log('\nsplitter-probe: all assertions passed');
})();
