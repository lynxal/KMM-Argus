// EventList.jsx
function EventList({ events, selectedId, onSelect, selectionMode, containsQuery, density='compact', showJumpToLatest, onJump }) {
  const rowH = density === 'comfy' ? 36 : 32;
  return (
    <div style={els.root}>
      <div style={els.head}>
        <div style={{width:46}}>Src</div>
        <div style={{width:58}}>Method</div>
        <div style={{width:54}}>Status</div>
        <div style={{flex:1}}>Path / message</div>
        <div style={{width:82,textAlign:'right'}}>Time</div>
        <div style={{width:58,textAlign:'right'}}>Size</div>
        <div style={{width:62,textAlign:'right'}}>Dur</div>
      </div>
      <div style={els.body}>
        {events.map(ev => {
          const sel = selectedId === ev.id;
          const rowStyle = {
            ...els.row, height: rowH,
            background: sel ? (selectionMode === 'kb' ? 'var(--bg-selected-kb)' : 'var(--bg-selected)') : 'transparent',
            boxShadow: sel && selectionMode === 'kb' ? 'inset 2px 0 0 var(--border-focus)' : 'none',
          };
          return <Row key={ev.id} ev={ev} sel={sel} style={rowStyle} onClick={() => onSelect(ev.id, 'mouse')} hi={containsQuery} />;
        })}
      </div>
      {showJumpToLatest && (
        <button onClick={onJump} style={els.jump}>
          <Icon name="arrowDown" size={11} />
          <span>3 new events</span>
        </button>
      )}
    </div>
  );
}
function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0,i)}<mark style={{background:'var(--syn-match)', color:'var(--fg-1)', borderRadius:2, padding:'0 1px'}}>{text.slice(i, i+q.length)}</mark>{text.slice(i+q.length)}</>;
}
function Row({ ev, sel, style, onClick, hi }) {
  if (ev.kind === 'HTTP') {
    const t = statusTone(ev.status, ev.err);
    return (
      <div style={style} onClick={onClick}>
        <div style={els.cellSrc}><SrcBadge kind="HTTP" /></div>
        <div style={{ width: 58, font: '700 11px/1 "JetBrains Mono"', color: methodColor(ev.method) }}>{ev.method}</div>
        <div style={{ width: 54 }}>
          <span style={{ ...els.statusPill, background: t.bg, color: t.fg }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: t.dot }} />
            {t.label}
          </span>
        </div>
        <div style={els.path}>
          <span style={{color:'var(--fg-3)'}}>{highlight(ev.host, hi)}</span>
          <span>{highlight(ev.url, hi)}</span>
        </div>
        <div style={els.ts}>{ev.ts}</div>
        <div style={els.num}>{formatBytes(ev.size)}</div>
        <div style={els.num}>{formatDur(ev.dur)}</div>
      </div>
    );
  }
  if (ev.kind === 'LOG') {
    const tone = logTone(ev.level);
    return (
      <div style={style} onClick={onClick}>
        <div style={els.cellSrc}><SrcBadge kind="LOG" /></div>
        <div style={{ width: 58 }}>
          <span style={{ font: '600 10px/1 "JetBrains Mono"', padding: '3px 6px', background: tone.bg, color: tone.fg, borderRadius: 3 }}>{ev.level}</span>
        </div>
        <div style={{ width: 54, font: '400 11px "JetBrains Mono"', color: 'var(--fg-3)' }}>—</div>
        <div style={{ ...els.path, color: 'var(--fg-1)' }}>
          <span style={{color:'var(--fg-3)'}}>[{ev.tag}]</span> {highlight(ev.msg, hi)}
        </div>
        <div style={els.ts}>{ev.ts}</div>
        <div style={els.num}>—</div>
        <div style={els.num}>—</div>
      </div>
    );
  }
  return (
    <div style={style} onClick={onClick}>
      <div style={els.cellSrc}><SrcBadge kind="CUSTOM" /></div>
      <div style={{ width: 58, font: '400 11px "JetBrains Mono"', color: 'var(--fg-3)' }}>—</div>
      <div style={{ width: 54, font: '400 11px "JetBrains Mono"', color: 'var(--fg-3)' }}>—</div>
      <div style={els.path}>
        <span style={{ color: 'var(--src-custom-fg)', fontWeight: 500 }}>{ev.name}</span> <span style={{color:'var(--fg-2)'}}>{highlight(ev.msg, hi)}</span>
      </div>
      <div style={els.ts}>{ev.ts}</div>
      <div style={els.num}>—</div>
      <div style={els.num}>—</div>
    </div>
  );
}
const els = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', overflow: 'hidden', position:'relative' },
  head: { display: 'flex', alignItems: 'center', gap: 10, height: 26, padding: '0 14px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-subtle)', font: '500 10px/1 "Inter"', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-3)', flex: 'none' },
  body: { flex: 1, overflow: 'auto' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'default', font: '400 12px "JetBrains Mono"', color: 'var(--fg-1)' },
  cellSrc: { width: 46, display: 'flex', alignItems: 'center' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: 4, height: 18, padding: '0 6px', borderRadius: 3, font: '500 11px/1 "JetBrains Mono"' },
  path: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-1)', display:'flex', gap: 2 },
  ts: { width: 82, textAlign: 'right', color: 'var(--fg-3)', font: '400 11px/1 "JetBrains Mono"' },
  num: { width: 58, textAlign: 'right', color: 'var(--fg-2)', font: '400 11px/1 "JetBrains Mono"' },
  jump: { position:'absolute', left:'50%', bottom: 14, transform:'translateX(-50%)', display:'inline-flex', alignItems:'center', gap:6, height: 26, padding:'0 12px', borderRadius: 999, border:'1px solid var(--accent-border)', background: 'var(--accent-subtle)', color: 'var(--accent-fg)', font:'500 11px/1 Inter', cursor:'pointer', boxShadow:'var(--shadow-md)' },
};
window.EventList = EventList;
