// TopBar.jsx
function TopBar({ view, setView, theme, setTheme, conn, paused, onPauseToggle, onClear, query, setQuery, onHelp, onCycleConn }) {
  const viewOpts = [
    { id: 'list', label: 'List', icon: 'panelLeft' },
    { id: 'split', label: 'Split', icon: 'columns' },
    { id: 'waterfall', label: 'Waterfall', icon: 'panelBottom' },
  ];
  const connInfo = {
    connected:    { fg: 'var(--conn-ok-fg)',   dot: 'var(--conn-ok-dot)',   label: 'Connected', sub: '192.168.1.42:9090', pulse: false },
    reconnecting: { fg: 'var(--conn-reco-fg)', dot: 'var(--conn-reco-dot)', label: 'Reconnecting…', sub: 'retry 2 s', pulse: true },
    disconnected: { fg: 'var(--conn-off-fg)',  dot: 'var(--conn-off-dot)',  label: 'Disconnected', sub: 'retry in 8 s', pulse: false },
  }[conn];
  return (
    <div style={tbs.root}>
      <div style={tbs.logo}>
        <svg width="18" height="18" viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="5.4" style={{ color: 'var(--fg-1)' }}>
          <defs>
            <mask id="argus-eye-tb" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="240" height="240" fill="white"/>
              <path d="M 20 120 A 181.67 181.67 0 0 1 220 120 A 181.67 181.67 0 0 1 20 120 Z" fill="black"/>
            </mask>
          </defs>
          <g mask="url(#argus-eye-tb)">
            {Array.from({length: 60}).map((_, i) => {
              const a = (i/60)*Math.PI*2 - Math.PI/2;
              const x1 = 120 + Math.cos(a)*114, y1 = 120 + Math.sin(a)*114;
              const x2 = 120 + Math.cos(a)*70,  y2 = 120 + Math.sin(a)*70;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
          <circle cx="120" cy="120" r="18" fill="currentColor" stroke="none"/>
        </svg>
        <span style={tbs.brand}>Argus</span>
        <span style={tbs.pathBadge}>com.example.app · 1.4.2 · Pixel 8</span>
      </div>

      <div style={tbs.searchWrap}>
        <Icon name="search" size={13} style={{ color: 'var(--fg-3)' }} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter events · host, path, header, body…" style={tbs.searchInput} />
        {query && <button onClick={() => setQuery('')} style={tbs.clearBtn}><Icon name="x" size={11} /></button>}
        <Kbd>/</Kbd>
      </div>

      <div style={tbs.actions}>
        <button onClick={onClear} style={tbs.iconBtn} title="Clear events (x)"><Icon name="trash" size={13} /></button>
        <button onClick={onPauseToggle} style={{ ...tbs.iconBtn, color: paused ? 'var(--amber-600)' : 'var(--fg-2)' }} title={paused ? 'Resume (p)' : 'Pause (p)'}>
          <Icon name={paused ? 'play' : 'pause'} size={13} />
        </button>
        <div style={tbs.seg}>
          {viewOpts.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{ ...tbs.segBtn, ...(view === v.id ? tbs.segBtnOn : {}) }}>
              <Icon name={v.icon} size={12} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onCycleConn} style={{ ...tbs.connPill, color: connInfo.fg }} title="Last seen 14:22:10.204">
          <span style={{ ...tbs.dot, background: connInfo.dot, animation: connInfo.pulse ? 'argusPulse 1.2s ease-in-out infinite' : 'none' }} />
          <span style={{fontWeight:500}}>{connInfo.label}</span>
          <span style={{opacity:.6}}>·</span>
          <span style={{font:'400 10px "JetBrains Mono"'}}>{connInfo.sub}</span>
        </button>
        <button onClick={onHelp} style={tbs.iconBtn} title="Shortcuts (?)"><Icon name="keyboard" size={13} /></button>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} style={tbs.iconBtn} title="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={13} />
        </button>
      </div>
    </div>
  );
}
const tbs = {
  root: { display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-default)', flex: 'none' },
  logo: { display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10, borderRight: '1px solid var(--border-default)', height: 28 },
  brand: { font: '600 13px/1 Inter', letterSpacing: '-0.01em' },
  pathBadge: { font: '400 11px/1 "JetBrains Mono"', color: 'var(--fg-2)', padding: '4px 6px', borderRadius: 3, background: 'var(--bg-subtle)' },
  searchWrap: { flex: 1, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 4, maxWidth: 560 },
  searchInput: { flex: 1, border: 0, background: 'transparent', color: 'var(--fg-1)', font: '400 12px/1 "JetBrains Mono"', outline: 'none' },
  clearBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, border: 0, background: 'transparent', color: 'var(--fg-2)', cursor: 'pointer', padding: 0, borderRadius: 3 },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 },
  iconBtn: { height: 28, width: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-2)' },
  seg: { display: 'inline-flex', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 6, padding: 2, height: 28 },
  segBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 10px', border: 0, background: 'transparent', color: 'var(--fg-2)', font: '500 11px/1 Inter', borderRadius: 4, cursor: 'pointer' },
  segBtnOn: { background: 'var(--bg-panel)', color: 'var(--fg-1)', boxShadow: '0 1px 2px rgba(20,22,24,.06)' },
  connPill: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', border: '1px solid var(--border-default)', background: 'var(--bg-panel)', borderRadius: 999, font: '500 11px/1 Inter', cursor: 'pointer' },
  dot: { width: 7, height: 7, borderRadius: 999, display: 'inline-block', flex:'none' },
};
window.TopBar = TopBar;
