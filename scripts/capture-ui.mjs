// Capture README screenshots from the Argus Inspector design prototype.
//
// The prototype (design_handoff_argus_inspector/Argus Inspector.html) is a
// React + inline-Babel page that renders every Inspector state as a labeled
// <DCArtboard id="ab-..."> element. This script loads the page in headless
// Chromium, waits for the artboards to mount, and snapshots the inner
// inspector frame of each artboard we want in the README.
//
// Run:    npm install && npx playwright install chromium && npm run capture-ui
// Output: docs/ui/{hero,event-list,waterfall,filters}.png

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve, normalize, sep } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const root = resolve(repo, "design_handoff_argus_inspector");
const htmlFile = "Argus Inspector.html";
const outDir = resolve(repo, "docs/ui");

// Babel-standalone fetches every `src=` JSX file via XHR, which Chrome blocks
// from file:// origins. Serve the design folder over loopback HTTP instead.
const mime = {
  ".html": "text/html",
  ".jsx": "application/javascript",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const abs = normalize(resolve(root, rel));
    if (!abs.startsWith(root + sep) && abs !== root) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(abs);
    const ext = abs.slice(abs.lastIndexOf("."));
    res.writeHead(200, { "content-type": mime[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/${encodeURIComponent(htmlFile)}`;

// (artboard-id, output-filename) pairs. The split view shows both event-list
// (left) and detail-with-tabs (right) in one frame — it's the canonical
// "looking at Argus" image, reused for the README hero and the detail-tabs
// caption in the UI walkthrough.
const captures = [
  ["ab-split", "hero.png"],
  ["ab-list", "event-list.png"],
  ["ab-waterfall", "waterfall.png"],
  ["ab-popover", "filters.png"],
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    console.error(`[page ${msg.type()}]`, msg.text());
  }
});
page.on("pageerror", (err) => console.error("[pageerror]", err.message));

await page.goto(baseUrl, { waitUntil: "networkidle" });
// Babel transpiles JSX in the browser after fetching React + each .jsx; the
// page loads ~10 scripts from unpkg + 10 local JSX files, so give it room.
await page.waitForSelector('[data-dc-slot="ab-split"]', { timeout: 60_000 });
// Give React + fonts a tick to settle.
await page.waitForTimeout(1500);

for (const [id, file] of captures) {
  const el = await page.$(`[data-dc-slot="${id}"]`);
  if (!el) {
    console.error(`missing artboard: ${id}`);
    process.exitCode = 1;
    continue;
  }
  // Each DCArtboard wraps the inspector in a labeled container. The actual
  // inspector frame is the .argus-frame inside it — capture that to avoid
  // bleeding the artboard chrome (label, padding) into the README image.
  const frame = await el.$(".argus-frame");
  const target = frame ?? el;
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: resolve(outDir, file) });
  console.log(`wrote ${file}`);
}

await browser.close();
server.close();
