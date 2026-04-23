// Overlays.jsx — FilterPopover, ShortcutsOverlay, Toast, EmptyInspector, ReconnectingBanner
function FilterPopover({ onClose }) {
  return (
    <div style={op.pop}>
      <div style={op.head}>
        <Icon name="filter" size={12}/>
        <span>Add filter</span>
        <button onClick={onClose} style={op.x}><Icon name="x" size={11}/></button>
      </div>
      <div style={op.search}>
        <Icon name="search" size={11} style={{color:'var(--fg-3)'}}/>
        <input placeholder="Filter by field…" style={{flex:1, border:0, background:'transparent', outline:'none', font:'400 12px "JetBrains Mono"', color:'var(--fg-1)'}}/>
      </div>
      <div style={op.sectionLabel}>Method</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, padding:'2px 6px 8px'}}>
        {['GET','POST','PUT','PATCH','DELETE','OPTIONS'].map((m, i) => (
          <label key={m} style={op.check}>
            <input type="checkbox" defaultChecked={i < 3} style={op.cb}/>
            <span style={{font:'600 11px "JetBrains Mono"', color: methodColor(m)}}>{m}</span>
          </label>
        ))}
      </div>
      <div style={op.sectionLabel}>Status class</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, padding:'2px 6px 8px'}}>
        {[['2xx',true],['3xx',false],['4xx',true],['5xx',true],['ERR',false]].map(([s,on]) => (
          <label key={s} style={op.check}>
            <input type="checkbox" defaultChecked={on} style={op.cb}/>
            <span style={{font:'500 11px "JetBrains Mono"', color:'var(--fg-1)'}}>{s}</span>
          </label>
        ))}
      </div>
      <div style={op.foot}>
        <button style={op.ghost}>Reset</button>
        <button style={op.primary}>Apply · <Kbd>↵</Kbd></button>
      </div>
    </div>
  );
}
function ShortcutsOverlay({ onClose }) {
  const rows = [
    ['Navigate', [['Next event','j'],['Prev event','k'],['Close / clear','⎋']]],
    ['Search & filter', [['Focus search','/'],['Add filter','f'],['Clear filter','x']]],
    ['Capture', [['Pause / resume','p'],['Clear events','shift+x']]],
    ['Views', [['Cycle List · Split · Waterfall','w'],['Prev tab','[' ],['Next tab',']' ]]],
    ['Help', [['This dialog','?']]],
  ];
  return (
    <div style={op.scrim} onClick={onClose}>
      <div style={op.modal} onClick={e=>e.stopPropagation()}>
        <div style={op.modalHead}>
          <Icon name="keyboard" size={13}/>
          <span style={{font:'600 13px Inter'}}>Keyboard shortcuts</span>
          <button onClick={onClose} style={{...op.x, marginLeft:'auto'}}><Icon name="x" size={13}/></button>
        </div>
        <div style={{padding:'10px 16px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px 40px'}}>
          {rows.map(([section, items]) => (
            <div key={section}>
              <div style={{font:'500 10px/1 Inter', letterSpacing:'.04em', textTransform:'uppercase', color:'var(--fg-3)', marginBottom: 8, paddingBottom: 6, borderBottom:'1px solid var(--border-subtle)'}}>{section}</div>
              {items.map(([label, keys]) => (
                <div key={label} style={{display:'flex', alignItems:'center', height: 26, font:'400 12px Inter', color:'var(--fg-1)'}}>
                  <span style={{flex:1}}>{label}</span>
                  <span style={{display:'flex', gap:3}}>{keys.split('+').map(k => <Kbd key={k}>{k}</Kbd>)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function Toast({ msg, icon='check' }) {
  return (
    <div style={op.toast}>
      <Icon name={icon} size={13} style={{color:'var(--conn-ok-fg)'}}/>
      <span>{msg}</span>
      <Kbd>⌘ Z</Kbd>
    </div>
  );
}
function EmptyInspector() {
  return (
    <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding: 40, background: 'var(--bg-panel)', border:'1px solid var(--border-default)', borderRadius: 6}}>
      <div style={{maxWidth: 420, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:14}}>
        <svg width="40" height="40" viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeWidth="5" style={{color:'var(--fg-muted)'}}>
          <defs>
            <mask id="argus-empty" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="240" height="240" fill="white"/>
              <path d="M 20 120 A 181.67 181.67 0 0 1 220 120 A 181.67 181.67 0 0 1 20 120 Z" fill="black"/>
            </mask>
          </defs>
          <g mask="url(#argus-empty)">
            {Array.from({length: 50}).map((_, i) => {
              const a = (i/50)*Math.PI*2 - Math.PI/2;
              const x1 = 120 + Math.cos(a)*114, y1 = 120 + Math.sin(a)*114;
              const x2 = 120 + Math.cos(a)*70,  y2 = 120 + Math.sin(a)*70;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
          <circle cx="120" cy="120" r="14" fill="currentColor" stroke="none"/>
        </svg>
        <div style={{font:'600 15px Inter', color:'var(--fg-1)'}}>Waiting for events</div>
        <div style={{font:'400 12px/18px Inter', color:'var(--fg-2)'}}>
          Argus is listening on <code style={{font:'500 12px "JetBrains Mono"', color:'var(--fg-1)', background:'var(--bg-subtle)', padding:'2px 6px', borderRadius:3, border:'1px solid var(--border-subtle)'}}>192.168.1.42:9090</code>. Make a request from your app to see it here.
        </div>
        <div style={{display:'flex', gap:6, marginTop:4}}>
          <button style={op.primary}><Icon name="copy" size={12}/> Copy address</button>
          <button style={op.ghost}>Docs</button>
        </div>
        <div style={{marginTop: 14, font:'400 11px Inter', color:'var(--fg-3)'}}>Press <Kbd>?</Kbd> for shortcuts</div>
      </div>
    </div>
  );
}
function ReconnectingBanner({ state }) {
  const info = {
    reconnecting: { fg:'var(--status-4xx-fg)', bg:'var(--status-4xx-bg)', icon:'refresh', main:'Reconnecting…', sub:'Lost the event stream · last seen 14:22:10.204 · retry 2 s' },
    disconnected: { fg:'var(--status-5xx-fg)', bg:'var(--status-5xx-bg)', icon:'wifiOff', main:'Disconnected', sub:'Argus server unreachable · last seen 14:20:44.118 · retry in 8 s' },
  }[state];
  if (!info) return null;
  return (
    <div style={{display:'flex', alignItems:'center', gap:10, padding:'8px 14px', background:info.bg, color:info.fg, borderBottom:'1px solid var(--border-default)', font:'400 12px Inter', flex:'none'}}>
      <Icon name={info.icon} size={13} />
      <span><b style={{fontWeight:500}}>{info.main}</b> · <span style={{opacity:.8}}>{info.sub}</span></span>
      <button style={{marginLeft:'auto', ...op.ghost, color:'currentColor', borderColor:'currentColor', background:'transparent'}}>Retry now</button>
    </div>
  );
}
const op = {
  pop: {position:'absolute', top:'100%', left: 0, marginTop: 6, width: 300, background:'var(--bg-overlay)', border:'1px solid var(--border-default)', borderRadius: 6, boxShadow:'var(--shadow-md)', zIndex: 50, overflow:'hidden'},
  head: {display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', font:'500 12px Inter', color:'var(--fg-1)'},
  x: {width:20, height:20, border:0, background:'transparent', color:'var(--fg-3)', borderRadius:3, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center'},
  search: {display:'flex', alignItems:'center', gap:6, margin: 8, padding:'0 8px', height: 26, border:'1px solid var(--border-default)', background:'var(--bg-subtle)', borderRadius:4},
  sectionLabel: {padding:'8px 12px 4px', font:'500 10px/1 Inter', letterSpacing:'.04em', textTransform:'uppercase', color:'var(--fg-3)'},
  check: {display:'flex', alignItems:'center', gap:8, padding:'4px 8px', borderRadius:3, cursor:'pointer'},
  cb: {accentColor:'var(--accent-bg)', width:13, height:13},
  foot: {display:'flex', gap:6, padding: 10, borderTop:'1px solid var(--border-subtle)', background:'var(--bg-subtle)', justifyContent:'flex-end'},
  primary: {display:'inline-flex', alignItems:'center', gap:6, height: 26, padding:'0 12px', border:'1px solid var(--accent-bg)', background:'var(--accent-bg)', color:'var(--fg-on-accent)', font:'500 11px/1 Inter', borderRadius:4, cursor:'pointer'},
  ghost: {height:26, padding:'0 10px', border:'1px solid var(--border-default)', background:'transparent', color:'var(--fg-2)', font:'500 11px/1 Inter', borderRadius:4, cursor:'pointer'},
  scrim: {position:'absolute', inset: 0, background:'rgba(20,22,24,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 60},
  modal: {width: 560, background:'var(--bg-overlay)', border:'1px solid var(--border-default)', borderRadius: 8, boxShadow:'var(--shadow-lg)', overflow:'hidden'},
  modalHead: {display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)'},
  toast: {position:'absolute', bottom: 20, left:'50%', transform:'translateX(-50%)', display:'inline-flex', alignItems:'center', gap:8, height: 32, padding:'0 12px', background:'var(--bg-overlay)', border:'1px solid var(--border-default)', borderRadius:6, boxShadow:'var(--shadow-md)', font:'500 12px Inter', color:'var(--fg-1)', zIndex: 70},
};
window.FilterPopover = FilterPopover;
window.ShortcutsOverlay = ShortcutsOverlay;
window.Toast = Toast;
window.EmptyInspector = EmptyInspector;
window.ReconnectingBanner = ReconnectingBanner;
