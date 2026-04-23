/**
 * Token lint — fail the build if a raw hex color or px literal sneaks into
 * a component file. Tokens live in src/design/tokens.json and src/styles/
 * globals.css (mirror of the handoff CSS). Everywhere else must reference
 * tokens via Tailwind utilities (`bg-bg-app`, `text-fg-1`, …) or via the
 * exact var reference (`var(--bg-app)`).
 *
 * Exempt paths: src/design/**, src/styles/globals.css, src/assets/**,
 * design_handoff_argus_inspector/** (not scanned — outside project).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..', 'src');

const EXEMPT_PATHS = [
  'src/design',
  'src/styles/globals.css',
  'src/assets',
];

const HEX = /#[0-9a-fA-F]{3,6}\b/g;
const PX = /\b\d+(?:\.\d+)?px\b/g;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function isExempt(rel: string): boolean {
  return EXEMPT_PATHS.some((p) => rel === p || rel.startsWith(p + '/'));
}

const violations: string[] = [];

/** Strip comments (line and block) from a source text, preserving line count. */
function stripComments(text: string, ext: string): string {
  let out = text;
  // Block comments (/* ... */) — present in .ts/.tsx/.css. Replace chars with
  // spaces but preserve newlines so line numbers stay accurate.
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments (// ... EOL) — only in .ts/.tsx.
  if (ext === '.ts' || ext === '.tsx') {
    out = out
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('//');
        if (idx === -1) return line;
        // Leave in-string occurrences alone (naive: bail out if an odd number
        // of quotes precedes the //).
        const before = line.slice(0, idx);
        const singles = (before.match(/'/g) ?? []).length;
        const doubles = (before.match(/"/g) ?? []).length;
        const backticks = (before.match(/`/g) ?? []).length;
        if (singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1) return line;
        return before;
      })
      .join('\n');
  }
  // HTML comments
  if (ext === '.html') {
    out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  }
  return out;
}

for (const file of listFiles(srcRoot)) {
  const rel = relative(resolve(here, '..'), file);
  if (isExempt(rel)) continue;
  const ext = extname(file);
  if (!['.ts', '.tsx', '.css', '.html'].includes(ext)) continue;
  const text = readFileSync(file, 'utf8');
  const scrubbedFile = stripComments(text, ext);
  const lines = scrubbedFile.split('\n');
  lines.forEach((line, i) => {
    // Permit `var(--x)` references even though they may sit next to a
    // string that otherwise looks like a color — strip CSS-var refs from
    // the scanned line so we only catch raw literals.
    const scrubbed = line.replace(/var\(--[a-z0-9-]+\)/gi, '');
    const hex = scrubbed.match(HEX);
    const px = scrubbed.match(PX);
    if (hex) violations.push(`${rel}:${i + 1}  raw hex → ${hex.join(', ')}  ${line.trim()}`);
    if (px) violations.push(`${rel}:${i + 1}  raw px  → ${px.join(', ')}  ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('\nToken lint failed. Move these values into src/design/tokens.json or reference them via a token.');
  console.error('Exempt paths: ' + EXEMPT_PATHS.join(', '));
  console.error('');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('token lint: clean');
