/**
 * Parse design_handoff_argus_inspector/ds/colors_and_type.css into
 * src/design/tokens.json shaped for direct spread into Tailwind's
 * `theme.extend`. Light + dark themes share the same CSS-var names, so
 * theme-switching happens purely in CSS (toggle `.theme-dark` on <html>);
 * Tailwind only sees the var references.
 *
 * Raw color scales (--gray-*, --blue-*, ...) are NOT exposed to Tailwind —
 * components must reach for semantic names only (--bg-app, --fg-1, ...).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(
  here,
  '..',
  '..',
  'design_handoff_argus_inspector',
  'ds',
  'colors_and_type.css',
);
const outPath = resolve(here, '..', 'src', 'design', 'tokens.json');

const css = readFileSync(cssPath, 'utf8');

/**
 * Extract the body of a CSS rule whose selector prefix matches `selectorPrefix`.
 * Balances braces so nested @media / @supports don't break the parse.
 */
function extractBlock(source: string, selectorPrefix: string, startFrom = 0): string | null {
  const idx = source.indexOf(selectorPrefix, startFrom);
  if (idx === -1) return null;
  const braceStart = source.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 1;
  let i = braceStart + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return source.slice(braceStart + 1, i - 1);
}

/** Capture every `--name: value;` declaration in a CSS block. */
function parseVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

// Raw scales (gray/blue/green/...) live in the first standalone `:root { ... }`.
const firstRoot = extractBlock(css, ':root {') ?? '';

// Semantic light tokens share `:root, .theme-light`.
const semanticLight = extractBlock(css, ':root, .theme-light') ?? '';

// Typography / spacing / radii / motion live in a later `:root { ... }` that
// references --font-ui / --fs-xs. Scan all `:root { }` blocks and pick it.
const typographyBlock = ((): string => {
  const re = /:root\s*\{([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[1].includes('--font-ui') || m[1].includes('--fs-xs')) return m[1];
  }
  return '';
})();

const rawScaleVars = parseVars(firstRoot);
const semanticVars = parseVars(semanticLight);
const typographyVars = parseVars(typographyBlock);

// --- Tailwind theme shape -------------------------------------------------

const colors: Record<string, string> = {};
const boxShadow: Record<string, string> = {};

for (const name of Object.keys(semanticVars)) {
  if (name.startsWith('shadow-')) {
    boxShadow[name.slice('shadow-'.length)] = `var(--${name})`;
    continue;
  }
  colors[name] = `var(--${name})`;
}

const fontFamily: Record<string, string> = {};
if (typographyVars['font-ui']) fontFamily.ui = typographyVars['font-ui'];
if (typographyVars['font-mono']) fontFamily.mono = typographyVars['font-mono'];

const fontSize: Record<string, [string, string]> = {};
for (const key of Object.keys(typographyVars)) {
  const m = /^fs-(.+)$/.exec(key);
  if (!m) continue;
  const scale = m[1];
  const lh = typographyVars[`lh-${scale}`];
  fontSize[scale] = [typographyVars[key], lh ?? ''];
}

const fontWeight: Record<string, string> = {};
const letterSpacing: Record<string, string> = {};
const spacing: Record<string, string> = {};
const height: Record<string, string> = {};
const borderRadius: Record<string, string> = {};
const transitionDuration: Record<string, string> = {};
const transitionTimingFunction: Record<string, string> = {};

for (const [key, value] of Object.entries(typographyVars)) {
  let m = /^fw-(.+)$/.exec(key);
  if (m) fontWeight[m[1]] = value;
  m = /^tracking-(.+)$/.exec(key);
  if (m) letterSpacing[m[1]] = value;
  m = /^sp-(.+)$/.exec(key);
  if (m) spacing[m[1]] = value;
  if (/^ctrl-/.test(key) || key === 'row-h') height[key] = value;
  m = /^radius-(.+)$/.exec(key);
  if (m) borderRadius[m[1]] = value;
  m = /^dur-(.+)$/.exec(key);
  if (m) transitionDuration[m[1]] = value;
  m = /^ease-(.+)$/.exec(key);
  if (m) transitionTimingFunction[m[1]] = value;
}

const tokens = {
  _meta: {
    source: 'design_handoff_argus_inspector/ds/colors_and_type.css',
    generated: 'scripts/build-tokens.ts',
    rawScaleCount: Object.keys(rawScaleVars).length,
    semanticCount: Object.keys(semanticVars).length,
    typographyCount: Object.keys(typographyVars).length,
  },
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  spacing,
  height,
  borderRadius,
  boxShadow,
  transitionDuration,
  transitionTimingFunction,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(tokens, null, 2));
console.log(
  `tokens → ${outPath}  (${Object.keys(colors).length} colors, ${Object.keys(boxShadow).length} shadows, ${Object.keys(fontSize).length} fontSizes, ${Object.keys(spacing).length} spacings)`,
);
