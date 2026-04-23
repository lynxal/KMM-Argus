// FilterBar.jsx — sticky filters with contextual controls based on source toggle
function FilterBar({ sources, onToggleSource, methods, onToggleMethod, statuses, onToggleStatus, levels, onToggleLevel, tagQuery, setTagQuery, hostQuery, setHostQuery, containsQuery, setContainsQuery, onClear, totalCount, shownCount, showPopover, onPopover }) {
  const http = sources.includes('HTTP');
  const log = sources.includes('LOG');
  const allMethods = ['GET','POST','PUT','PATCH','DELETE','OTHER'];
  const allStatuses = [['2xx','var(--status-2xx-fg)'],['3xx','var(--status-3xx-fg)'],['4xx','var(--status-4xx-fg)'],['5xx','var(--status-5xx-fg)'],['ERR','var(--status-err-fg)']];
  const allLevels = ['ERROR','WARN','INFO','DEBUG','VERB'];
  return (
    <div style={fbs.root}>
      <div style={fbs.group}>
        {['HTTP','LOG','CUSTOM'].map(s => {
          const on = sources.includes(s);
          const fg = { HTTP: 'var(--src-http-fg)', LOG: 'var(--src-log-fg)', CUSTOM: 'var(--src-custom-fg)' }[s];
          const bg = { HTTP: 'var(--src-http-bg)', LOG: 'var(--src-log-bg)', CUSTOM: 'var(--src-custom-bg)' }[s];
          const brd = { HTTP: 'var(--src-http-brd)', LOG: 'var(--src-log-brd)', CUSTOM: 'var(--src-custom-brd)' }[s];
          return (
            <button key={s} onClick={() => onToggleSource(s)} style={{
              ...fbs.srcChip, background: on ? bg : 'transparent',
              color: on ? fg : 'var(--fg-3)', borderColor: on ? brd : 'var(--border-default)',
              opacity: on ? 1 : 0.6,
            }}>{s}</button>
          );
        })}
      </div>

      {http && <><div style={fbs.sep} />
        <span style={fbs.label}>Method</span>
        <div style={fbs.group}>
          {allMethods.map(m => {
            const on = methods.includes(m);
            return <button key={m} onClick={() => onToggleMethod(m)} style={{ ...fbs.pill, color: on ? methodColor(m) : 'var(--fg-3)', borderColor: on ? 'var(--border-strong)' : 'var(--border-default)', background: on ? 'var(--bg-subtle)' : 'transparent', opacity: on ? 1 : 0.65, fontWeight: on ? 700 : 500 }}>{m}</button>;
          })}
        </div>
        <span style={fbs.label}>Status</span>
        <div style={fbs.group}>
          {allStatuses.map(([s, color]) => {
            const on = statuses.includes(s);
            return <button key={s} onClick={() => onToggleStatus(s)} style={{ ...fbs.pill, color: on ? color : 'var(--fg-3)', borderColor: on ? 'var(--border-strong)' : 'var(--border-default)', background: on ? 'var(--bg-subtle)' : 'transparent', opacity: on ? 1 : 0.65 }}>{s}</button>;
          })}
        </div>
      </>}

      {log && <><div style={fbs.sep} />
        <span style={fbs.label}>Level</span>
        <div style={fbs.group}>
          {allLevels.map(l => {
            const on = levels.includes(l);
            const t = logTone(l);
            return <button key={l} onClick={() => onToggleLevel(l)} style={{ ...fbs.pill, color: on ? t.fg : 'var(--fg-3)', background: on ? t.bg : 'transparent', borderColor: on ? 'transparent' : 'var(--border-default)', opacity: on ? 1 : 0.65 }}>{l}</button>;
          })}
        </div>
        <div style={{ ...fbs.input, width: 120 }}>
          <Icon name="info" size={11} style={{ color:'var(--fg-3)' }} />
          <input value={tagQuery} onChange={e=>setTagQuery(e.target.value)} placeholder="tag…" style={fbs.inp} />
        </div>
      </>}

      <div style={fbs.sep} />
      <div style={{ ...fbs.input, width: 150 }}>
        <Icon name="link" size={11} style={{ color:'var(--fg-3)' }} />
        <input value={hostQuery} onChange={e=>setHostQuery(e.target.value)} placeholder="host…" style={fbs.inp} />
      </div>
      <div style={{ ...fbs.input, flex: 1, minWidth: 160, maxWidth: 280 }}>
        <Icon name="search" size={11} style={{ color:'var(--fg-3)' }} />
        <input value={containsQuery} onChange={e=>setContainsQuery(e.target.value)} placeholder="contains…" style={fbs.inp} />
      </div>
      <button onClick={onClear} style={fbs.clearBtn}>Clear</button>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, font: '400 11px "Inter"', color: 'var(--fg-3)' }}>
        <span><b style={{color:'var(--fg-1)',fontWeight:500}}>{shownCount}</b> / {totalCount}</span>
      </div>
    </div>
  );
}
const fbs = {
  root: { display: 'flex', alignItems: 'center', gap: 8, flexWrap:'wrap', rowGap: 6, padding: '8px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-default)', flex: 'none' },
  group: { display: 'flex', alignItems: 'center', gap: 4 },
  sep: { width: 1, height: 18, background: 'var(--border-default)' },
  label: { font: '500 10px/1 Inter', textTransform:'uppercase', letterSpacing:'.04em', color:'var(--fg-3)', marginRight: 2 },
  srcChip: { height: 22, padding: '0 8px', borderRadius: 4, border: '1px solid', font: '600 10px/1 "JetBrains Mono"', letterSpacing: '.06em', cursor: 'pointer' },
  pill: { height: 22, padding: '0 7px', borderRadius: 4, border: '1px solid', font: '500 10px/1 "JetBrains Mono"', letterSpacing: '.04em', cursor: 'pointer' },
  input: { display:'flex', alignItems:'center', gap: 6, height: 24, padding: '0 8px', border:'1px solid var(--border-default)', background:'var(--bg-subtle)', borderRadius: 4 },
  inp: { flex: 1, minWidth: 0, width:'100%', border: 0, background:'transparent', color:'var(--fg-1)', font:'400 12px/1 "JetBrains Mono"', outline:'none' },
  clearBtn: { height: 24, padding: '0 8px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--fg-2)', font:'500 11px/1 Inter', borderRadius: 4, cursor: 'pointer' },
};
window.FilterBar = FilterBar;
