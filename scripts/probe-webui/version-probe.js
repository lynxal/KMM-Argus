// Probe for issue #8 — "the Web UI reports an Argus version that does not match
// the artifact the app links". Boots a fake Argus device serving a known
// argusVersion, drives the real UI in headless Chromium, and asserts the TopBar
// renders exactly that value.
//
// Also covers the connection dot next to it, found broken while fixing the above:
// `.ds-conn-dot` is a bare <span>, and display:inline ignores width/height, so the
// TopBar's dot rendered 0x0 and the pill's gap-2 read as off-centre text. The five
// other dots survived only because they are direct flex children, which blockifies
// them. Assert the measured box, not the class list — the class was always right.
//
// The assertion is against the fake device's APP_INFO.argusVersion, not against
// gradle.properties: the point is that the number on screen came off the wire.
// Hardcoding the release version here would pass even if the UI painted a
// literal, which is the class of bug this probe exists to catch.
//
// Usage:  node version-probe.js
//
// Requires a built UI:  cd argus-webui && npm run build

const path = require('path');
const { chromium } = require('playwright');
const { startFakeDevice, APP_INFO } = require('./fake-device');

const VIEWPORT = { width: 900, height: 600 };
const shotPath = path.join(__dirname, 'last-failure.png');
const SETTLE_MS = 3000;

const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(3) + 's';
const log = (...a) => console.log(ts(), ...a);

async function main() {
    const device = await startFakeDevice([]);
    log(`fake device on ${device.url}, argusVersion=${APP_INFO.argusVersion}`);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    const failures = [];

    try {
        await page.goto(device.url, { waitUntil: 'domcontentloaded' });
        // The version span is empty until the hello frame lands, so wait on content
        // rather than on the element: an empty-but-present span is the pre-hello state.
        await page.waitForFunction(
            () => {
                const spans = Array.from(document.querySelectorAll('span'));
                const versioned = spans.some((s) => /^\(\d+\.\d+\.\d+\)$/.test(s.textContent.trim()));
                const connected = Array.from(document.querySelectorAll('div')).some(
                    (e) => e.textContent.trim() === 'Connected',
                );
                return versioned && connected;
            },
            { timeout: SETTLE_MS },
        );

        const shown = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span'));
            const wordmark = spans.find((s) => s.textContent.trim() === 'Argus');
            const next = wordmark && wordmark.nextElementSibling;
            const badge = spans.map((s) => s.textContent.trim()).find((t) => t.includes('.argus.probe'));
            return {
                wordmarkFound: Boolean(wordmark),
                version: next ? next.textContent.trim() : null,
                title: next ? next.getAttribute('title') : null,
                // Computed display, not the hidden attribute: Tailwind display
                // utilities beat `hidden`, so assert what the browser resolved.
                display: next ? getComputedStyle(next).display : null,
                badge,
                dot: (() => {
                    const pill = Array.from(document.querySelectorAll('div')).find(
                        (e) => e.textContent.trim() === 'Connected' && e.querySelector('.ds-conn-dot'),
                    );
                    if (!pill) return null;
                    const d = pill.querySelector('.ds-conn-dot').getBoundingClientRect();
                    const pb = pill.getBoundingClientRect();
                    const label = pill.querySelector('.ds-conn-dot').parentElement.nextElementSibling.getBoundingClientRect();
                    return {
                        w: Math.round(d.width),
                        h: Math.round(d.height),
                        padLeft: Math.round(d.left - pb.left),
                        padRight: Math.round(pb.right - label.right),
                    };
                })(),
            };
        });

        log('rendered:', JSON.stringify(shown));

        if (!shown.wordmarkFound) failures.push('Argus wordmark span not found in TopBar');
        const expectedVersionText = `(${APP_INFO.argusVersion})`;
        if (shown.version !== expectedVersionText) {
            failures.push(`version text is "${shown.version}", expected "${expectedVersionText}"`);
        }
        if (shown.display === 'none') failures.push('version span resolves to display:none');
        if (shown.title !== `Argus library ${APP_INFO.argusVersion}`) {
            failures.push(`version title is "${shown.title}"`);
        }
        // Both numbers must be parenthesised against their own label, or the two
        // sit side by side unlabelled and neither can be told apart.
        const expectedBadge = `${APP_INFO.pkg} (${APP_INFO.versionName}) \u00b7 ${APP_INFO.device}`;
        if (shown.badge !== expectedBadge) {
            failures.push(`app badge is "${shown.badge}", expected "${expectedBadge}"`);
        }

        if (!shown.dot) {
            failures.push('connection pill never reached "Connected"');
        } else {
            if (shown.dot.w !== 8 || shown.dot.h !== 8) {
                failures.push(`connection dot is ${shown.dot.w}x${shown.dot.h}, expected 8x8`);
            }
            if (shown.dot.padLeft !== shown.dot.padRight) {
                failures.push(
                    `connection pill padding is ${shown.dot.padLeft}/${shown.dot.padRight}, expected symmetric`,
                );
            }
        }
    } catch (err) {
        failures.push(`probe threw: ${err.message}`);
    } finally {
        // Same as the other two probes: capture before the browser goes away.
        // A timeout here reports only "waitForFunction exceeded", which says
        // nothing about what the page actually rendered — and in CI the page is
        // the only thing you cannot go back and look at.
        if (failures.length > 0) {
            try { await page.screenshot({ path: shotPath, fullPage: true }); } catch {}
        }
        await browser.close();
        device.close();
    }

    if (failures.length > 0) {
        console.error('\nFAIL');
        failures.forEach((f) => console.error(`  - ${f}`));
        console.error(`screenshot: ${shotPath}`);
        process.exit(1);
    }
    log(`PASS — TopBar shows (${APP_INFO.argusVersion}) from the hello frame`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
