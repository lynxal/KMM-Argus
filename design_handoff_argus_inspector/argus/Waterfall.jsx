// Waterfall.jsx — time-axis view with synced selection + zoom
function Waterfall({ events, selectedId, onSelect, zoom = 1 }) {
  const ticks = [0, 25, 50, 75, 100];
  const maxMs = 3000 / zoom;
  return (
    <div style={ws.root}>
      <div style={ws.head}>
        <div style={{ width: 240, font:'500 10px Inter', letterSpacing:'.04em', textTransform:'uppercase', color:'var(--fg-3)', paddingLeft:14, display:'flex', alignItems:'center', gap:6 }}>
          <span>Event</span>
          <span style={{marginLeft:'auto', font:'400 10px "JetBrains Mono"', color:'var(--fg-3)', paddingRight: 10}}>{events.length}</span>
        </div>
        <div style={ws.axis}>
          {ticks.map(t => (
            <div key={t} style={{ position:'absolute', left: t+'%', top:0, bottom:0, borderLeft: '1px solid var(--border-default)' }}>
              <span style={{ position:'absolute', top:6, left:4, font:'400 10px/1 "JetBrains Mono"', color:'var(--fg-3)' }}>{t === 0 ? '0' : `${Math.round(t*maxMs/100)} ms`}</span>
            </div>
          ))}
        </div>
        <div style={{width: 70, display:'flex', alignItems:'center', justifyContent:'flex-end', gap: 4, paddingRight: 10}}>
          <button style={ws.zoomBtn} title="Zoom out"><Icon name="minus" size={10}/></button>
          <span style={{font:'400 10px "JetBrains Mono"', color:'var(--fg-3)'}}>{zoom.toFixed(1)}×</span>
          <button style={ws.zoomBtn} title="Zoom in"><Icon name="plus" size={10}/></button>
        </div>
      </div>
      <div style={ws.body}>
        {events.map(ev => {
          const sel = ev.id === selectedId;
          return (
            <div key={ev.id} onClick={() => onSelect(ev.id, 'mouse')} style={{
              ...ws.row,
              background: sel ? 'var(--bg-selected)' : 'transparent',
              boxShadow: sel ? 'inset 2px 0 0 var(--border-focus)' : 'none',
            }}>
              <div style={ws.label}>
                <SrcBadge kind={ev.kind} />
                <span style={{font:'600 10px/1 "JetBrains Mono"', color:ev.kind==='HTTP'?methodColor(ev.method):'var(--fg-2)'}}>{ev.kind==='HTTP'?ev.method:ev.kind==='LOG'?ev.level:'·'}</span>
                <span style={{font:'400 11px "JetBrains Mono"', color:'var(--fg-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {ev.kind==='HTTP'?ev.url:ev.kind==='LOG'?ev.msg:ev.name}
                </span>
              </div>
              <div style={ws.track}>
                {[25,50,75].map(t => <div key={t} style={{position:'absolute', left:t+'%', top:-2, bottom:-2, borderLeft:'1px dashed var(--border-subtle)'}}/>)}
                {ev.width === 0 ? (
                  <div style={{ position:'absolute', left: ev.offset+'%', top: 0, width: 2, height: 14, background: ev.kind === 'LOG' ? logTone(ev.level).fg : 'var(--src-custom-fg)', borderRadius: 1 }} />
                ) : ev.err ? (
                  <div style={{ position:'absolute', left: ev.offset+'%', width: Math.max(0.5, ev.width)+'%', top: 3, height: 8, background: 'var(--status-err-bg)', border:'1px dashed var(--status-err-fg)', borderRadius: 2 }} />
                ) : (() => {
                  const tone = statusTone(ev.status);
                  return <>
                    <div style={{ position:'absolute', left: ev.offset+'%', width: ev.width*0.15+'%', top: 3, height: 8, background: 'var(--wf-connect)', borderRadius: '2px 0 0 2px' }} />
                    <div style={{ position:'absolute', left: (ev.offset + ev.width*0.15)+'%', width: ev.width*0.6+'%', top: 3, height: 8, background: 'var(--wf-wait)' }} />
                    <div style={{ position:'absolute', left: (ev.offset + ev.width*0.75)+'%', width: ev.width*0.25+'%', top: 3, height: 8, background: tone.dot, borderRadius: '0 2px 2px 0' }} />
                  </>;
                })()}
              </div>
              <div style={ws.dur}>{ev.kind==='HTTP' ? formatDur(ev.dur) : '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const ws = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' },
  head: { display: 'flex', height: 28, borderBottom: '1px solid var(--border-default)', background: 'var(--bg-subtle)', alignItems: 'stretch', flex: 'none' },
  axis: { flex: 1, position: 'relative' },
  zoomBtn: { height: 18, width: 18, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border-default)', background:'var(--bg-panel)', color:'var(--fg-2)', borderRadius:3, cursor:'pointer' },
  body: { flex: 1, overflow: 'auto' },
  row: { display: 'flex', alignItems: 'center', height: 28, borderBottom: '1px solid var(--border-subtle)', cursor: 'default' },
  label: { width: 240, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', overflow: 'hidden' },
  track: { flex: 1, position: 'relative', height: 14 },
  dur: { width: 70, textAlign: 'right', paddingRight: 14, font: '400 11px "JetBrains Mono"', color: 'var(--fg-2)' },
};
window.Waterfall = Waterfall;
