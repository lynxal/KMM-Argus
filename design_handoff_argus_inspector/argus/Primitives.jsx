// Primitives.jsx — Icon (Lucide-derived), Kbd, SrcBadge, helpers
const ICONS = {
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm10 18-4.3-4.3',
  x: 'M18 6 6 18M6 6l12 12',
  filter: 'M22 3 2 3l8 9.46V19l4 2v-8.54L22 3z',
  check: 'M20 6 9 17l-5-5',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  play: 'M6 3v18l14-9L6 3z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronUp: 'm18 15-6-6-6 6',
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  sun: 'M12 4v1M12 19v1M4.2 4.2l.7.7M19.1 19.1l.7.7M3 12h1M20 12h1M4.2 19.8l.7-.7M19.1 4.9l.7-.7',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  copy: 'M9 3h10v12M5 7h10v14H5z',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3',
  externalLink: 'M14 4h6v6M10 14 20 4M18 14v6H4V6h6',
  panelLeft: 'M3 4h18v16H3zM9 4v16',
  panelBottom: 'M3 4h18v16H3zM3 14h18',
  columns: 'M3 4h18v16H3zM12 4v16',
  keyboard: 'M5 7h14v10H5zM8 10h.01M12 10h.01M16 10h.01M7 14h10',
  trash: 'M3 6h18M8 6V4h8v2M6 6v14h12V6M10 10v6M14 10v6',
  alert: 'M12 9v4M12 17h.01M21.7 18 13.7 4a2 2 0 0 0-3.5 0L2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8h.01M12 12v4',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  image: 'M3 5h18v14H3zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM3 15l5-5 8 8',
  braces: 'M8 4H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2',
  binary: 'M4 4h4v6H4zM16 4h4v6h-4zM4 14h4v6H4zM16 14h4v6h-4z',
  eyeOff: 'M17.94 17.94A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5.06-5.94M9.9 4.24A10 10 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  command: 'M15 6a3 3 0 1 1 3 3h-3V6zM9 6a3 3 0 1 0-3 3h3V6zM9 18a3 3 0 1 1-3-3h3v3zM15 18a3 3 0 1 0 3-3h-3v3zM9 9h6v6H9z',
  refresh: 'M3 12a9 9 0 0 1 16-5.7L21 8M21 4v4h-4M21 12a9 9 0 0 1-16 5.7L3 16M3 20v-4h4',
  terminal: 'm4 17 6-6-6-6M12 19h8',
  wifiOff: 'M1 1l22 22M16.7 16.7A11 11 0 0 0 12 14c-3 0-5.7 1.5-7.5 3.5M5 12.5a11 11 0 0 1 3-2M19 12.5a11 11 0 0 0-6-3M8.5 16a6 6 0 0 1 7 0',
};
function Icon({ name, size = 14, stroke = 1.75, style, ...rest }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block', ...style }} {...rest}>
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}
function Kbd({ children }) {
  return <kbd className="ds-kbd">{children}</kbd>;
}
function SrcBadge({ kind, size = 'sm' }) {
  const c = {
    HTTP:  { fg: 'var(--src-http-fg)',   bg: 'var(--src-http-bg)',   brd: 'var(--src-http-brd)' },
    LOG:   { fg: 'var(--src-log-fg)',    bg: 'var(--src-log-bg)',    brd: 'var(--src-log-brd)' },
    CUSTOM:{ fg: 'var(--src-custom-fg)', bg: 'var(--src-custom-bg)', brd: 'var(--src-custom-brd)' },
  }[kind] || { fg:'var(--fg-2)', bg:'var(--bg-subtle)', brd:'var(--border-default)' };
  const h = size === 'md' ? 18 : 16;
  return <span style={{ display: 'inline-flex', alignItems:'center', height: h, padding: '0 5px', borderRadius: 3, border: `1px solid ${c.brd}`, background: c.bg, color: c.fg, font: `600 9px/1 "JetBrains Mono"`, letterSpacing: '.06em' }}>{kind}</span>;
}

function statusTone(status, err) {
  if (err || status == null) return { fg: 'var(--status-err-fg)', bg: 'var(--status-err-bg)', dot: 'var(--status-err-dot)', label: 'ERR' };
  const k = Math.floor(status / 100);
  if (k === 2) return { fg: 'var(--status-2xx-fg)', bg: 'var(--status-2xx-bg)', dot: 'var(--status-2xx-dot)', label: String(status) };
  if (k === 3) return { fg: 'var(--status-3xx-fg)', bg: 'var(--status-3xx-bg)', dot: 'var(--status-3xx-dot)', label: String(status) };
  if (k === 4) return { fg: 'var(--status-4xx-fg)', bg: 'var(--status-4xx-bg)', dot: 'var(--status-4xx-dot)', label: String(status) };
  if (k === 5) return { fg: 'var(--status-5xx-fg)', bg: 'var(--status-5xx-bg)', dot: 'var(--status-5xx-dot)', label: String(status) };
  return { fg: 'var(--fg-2)', bg: 'transparent', dot: 'var(--fg-3)', label: String(status) };
}
function methodColor(m) {
  return ({
    GET: 'var(--method-get-fg)', POST: 'var(--method-post-fg)', PUT: 'var(--method-put-fg)',
    PATCH: 'var(--method-patch-fg)', DELETE: 'var(--method-del-fg)',
    HEAD: 'var(--method-head-fg)', OPTIONS: 'var(--method-opt-fg)',
  })[m] || 'var(--fg-2)';
}
function logTone(lvl) {
  return ({
    ERROR:{fg:'var(--log-error-fg)',bg:'var(--log-error-bg)'},
    WARN: {fg:'var(--log-warn-fg)', bg:'var(--log-warn-bg)'},
    INFO: {fg:'var(--log-info-fg)', bg:'var(--log-info-bg)'},
    DEBUG:{fg:'var(--log-debug-fg)',bg:'var(--log-debug-bg)'},
    VERB: {fg:'var(--log-verbose-fg)',bg:'var(--log-verbose-bg)'},
  })[lvl] || { fg:'var(--fg-2)', bg:'transparent' };
}
function formatBytes(n) {
  if (n == null) return '—';
  if (n === 0) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}
function formatDur(ms) {
  if (ms == null) return '—';
  if (ms < 1) return '< 1 ms';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

Object.assign(window, { Icon, Kbd, SrcBadge, statusTone, methodColor, logTone, formatBytes, formatDur });
