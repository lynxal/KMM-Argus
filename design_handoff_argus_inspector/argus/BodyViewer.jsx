// BodyViewer.jsx — JSON tree, text, image, hex, empty, truncated states
function BodyViewer({ variant, data, text, truncated, imageUrl, imageMeta, noBody }) {
  return (
    <div style={bv.wrap}>
      <div style={bv.toolbar}>
        <span style={bv.metaText}>
          {variant === 'json' && <><b style={{color:'var(--fg-1)',fontWeight:500}}>application/json</b> · {data ? Object.keys(data).length : 0} keys · 12.4 KB</>}
          {variant === 'text' && <><b style={{color:'var(--fg-1)',fontWeight:500}}>text/plain</b> · 2.1 KB · UTF-8</>}
          {variant === 'image' && imageMeta && <><b style={{color:'var(--fg-1)',fontWeight:500}}>{imageMeta.mime}</b> · {imageMeta.w}×{imageMeta.h} · {imageMeta.size}</>}
          {variant === 'hex' && <><b style={{color:'var(--fg-1)',fontWeight:500}}>application/octet-stream</b> · 48 B shown · 2.3 MB total</>}
          {variant === 'empty' && <><b style={{color:'var(--fg-1)',fontWeight:500}}>Empty response</b></>}
        </span>
        <div style={{display:'flex', gap:4}}>
          {variant === 'json' && <>
            <button style={bv.smallBtn}>Expand all</button>
            <button style={bv.smallBtn}>Collapse all</button>
          </>}
          {variant === 'text' && <button style={bv.smallBtn}>Wrap</button>}
          <button style={bv.iconBtn} title="Copy"><Icon name="copy" size={12}/></button>
          <button style={bv.iconBtn} title="Download"><Icon name="download" size={12}/></button>
        </div>
      </div>
      {truncated && (
        <div style={bv.banner}>
          <Icon name="alert" size={13} />
          <span><b style={{fontWeight:500}}>Body truncated</b> · 16,384 / 2,441,204 bytes shown. Raise <code style={bv.code}>argus.maxBodyBytes</code> to capture more.</span>
          <button style={{...bv.smallBtn, marginLeft:'auto'}}>Request full</button>
        </div>
      )}
      <div style={bv.frame}>
        {variant === 'json' && <JsonTree data={data} />}
        {variant === 'text' && <pre style={bv.pre}>{text}</pre>}
        {variant === 'image' && <ImageView url={imageUrl} meta={imageMeta} />}
        {variant === 'hex' && <HexView />}
        {variant === 'empty' && <EmptyBody />}
      </div>
    </div>
  );
}
function EmptyBody() {
  return (
    <div style={{padding:32, textAlign:'center', color:'var(--fg-3)'}}>
      <div style={{font:'500 12px Inter', color:'var(--fg-2)'}}>No body</div>
      <div style={{font:'400 11px Inter', marginTop:4}}>Response returned with <code style={{font:'400 11px "JetBrains Mono"', color:'var(--fg-2)'}}>Content-Length: 0</code>.</div>
    </div>
  );
}
function ImageView({ meta }) {
  return (
    <div style={{padding:20, display:'flex', flexDirection:'column', alignItems:'center', gap:10, background:'var(--bg-sunken)', height:'100%'}}>
      <div style={{width:220, height:140, background:'repeating-conic-gradient(var(--bg-subtle) 0% 25%, var(--bg-panel) 0% 50%) 50% / 14px 14px', border:'1px solid var(--border-default)', borderRadius: 4, position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute', inset:0, background:'linear-gradient(135deg, #7da3ff 0%, #6c4fd6 60%, #c5342e 100%)', opacity:.82}} />
        <svg viewBox="0 0 220 140" style={{position:'absolute', inset:0, width:'100%', height:'100%'}}>
          <circle cx="80" cy="55" r="18" fill="#fff" opacity=".9"/>
          <path d="M 10 120 L 70 70 L 120 100 L 170 55 L 220 100 L 220 140 L 10 140 Z" fill="#fff" opacity=".25"/>
        </svg>
      </div>
      <div style={{font:'400 11px "JetBrains Mono"', color:'var(--fg-2)'}}>{meta.name} · {meta.w}×{meta.h} · {meta.size}</div>
    </div>
  );
}
function HexView() {
  const bytes = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,0x00,0x00,0x04,0x00,0x00,0x00,0x02,0x40,0x08,0x06,0x00,0x00,0x00,0xE2,0x1F,0x8C,0xDC,0x00,0x00,0x00,0x04,0x67,0x41,0x4D,0x41,0x00,0x00,0xB1,0x8F,0x0B,0xFC,0x61,0x05];
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push(bytes.slice(i, i+16));
  return (
    <pre style={{margin:0, padding:'10px 14px', font:'400 12px/18px "JetBrains Mono"', background:'var(--bg-sunken)', color:'var(--fg-1)', height:'100%', overflow:'auto'}}>
      {rows.map((row, ri) => {
        const offset = (ri * 16).toString(16).padStart(8,'0');
        const hex = row.map(b => b.toString(16).padStart(2,'0')).join(' ');
        const ascii = row.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '·').join('');
        return <div key={ri}><span style={{color:'var(--fg-3)'}}>{offset}</span>  <span>{hex}</span>  <span style={{color:'var(--fg-2)'}}>|{ascii}|</span></div>;
      })}
    </pre>
  );
}
function JsonTree({ data }) {
  return <pre style={{margin:0, padding:'10px 14px', font:'400 12px/20px "JetBrains Mono"', overflow:'auto', height:'100%', background:'var(--bg-sunken)'}}>
    <Node k={null} v={data} depth={0} last />
  </pre>;
}
function Node({ k, v, depth, last }) {
  const [open, setOpen] = React.useState(depth < 2);
  const pad = 14;
  const indent = { paddingLeft: depth * pad };
  const comma = last ? '' : ',';
  if (v !== null && typeof v === 'object') {
    const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    const open_b = Array.isArray(v) ? '[' : '{';
    const close_b = Array.isArray(v) ? ']' : '}';
    return <div>
      <div style={{ ...indent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }} onClick={() => setOpen(!open)}>
        <span style={{ width: 10, color: 'var(--fg-3)' }}>{open ? '▾' : '▸'}</span>
        {k != null && <><span style={{ color: 'var(--syn-key)' }}>"{k}"</span><span style={{ color: 'var(--syn-punct)' }}>: </span></>}
        <span style={{ color: 'var(--syn-punct)' }}>{open_b}</span>
        {!open && <span style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>&nbsp;{entries.length} {Array.isArray(v)?'items':'keys'} </span>}
        {!open && <span style={{ color: 'var(--syn-punct)' }}>{close_b}{comma}</span>}
      </div>
      {open && entries.map(([kk, vv], i) => <Node key={kk} k={kk} v={vv} depth={depth + 1} last={i === entries.length - 1} />)}
      {open && <div style={{ ...indent, display: 'flex', gap: 2 }}><span style={{ width: 10 }} /><span style={{ color: 'var(--syn-punct)' }}>{close_b}{comma}</span></div>}
    </div>;
  }
  let valNode;
  if (v === null) valNode = <span style={{ color: 'var(--syn-null)' }}>null</span>;
  else if (typeof v === 'boolean') valNode = <span style={{ color: 'var(--syn-bool)' }}>{String(v)}</span>;
  else if (typeof v === 'number') valNode = <span style={{ color: 'var(--syn-number)' }}>{v}</span>;
  else valNode = <span style={{ color: 'var(--syn-string)' }}>"{v}"</span>;
  return <div style={{ ...indent, display: 'flex', gap: 2 }}>
    <span style={{ width: 10 }} />
    {k != null && <><span style={{ color: 'var(--syn-key)' }}>"{k}"</span><span style={{ color: 'var(--syn-punct)' }}>: </span></>}
    {valNode}<span style={{ color: 'var(--syn-punct)' }}>{comma}</span>
  </div>;
}
const bv = {
  wrap: {display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-panel)'},
  toolbar: {display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderBottom:'1px solid var(--border-subtle)', flex:'none', background:'var(--bg-panel)'},
  metaText: {flex:1, font:'400 11px "JetBrains Mono"', color:'var(--fg-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'},
  smallBtn: {height:22, padding:'0 8px', border:'1px solid var(--border-default)', background:'var(--bg-subtle)', color:'var(--fg-2)', font:'500 11px/1 Inter', borderRadius:3, cursor:'pointer'},
  iconBtn: {height:22, width:22, display:'inline-flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border-default)', background:'var(--bg-subtle)', color:'var(--fg-2)', borderRadius:3, cursor:'pointer'},
  banner: {display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--status-4xx-bg)', color:'var(--status-4xx-fg)', borderBottom:'1px solid var(--border-subtle)', font:'400 12px/16px Inter', flex:'none'},
  code: {font:'500 11px/1 "JetBrains Mono"', padding:'1px 4px', background:'rgba(20,22,24,.06)', borderRadius:3, color:'currentColor'},
  frame: {flex:1, overflow:'hidden', background:'var(--bg-sunken)', borderTop:'1px solid var(--border-subtle)'},
  pre: {margin:0, padding:'10px 14px', font:'400 12px/20px "JetBrains Mono"', color:'var(--fg-1)', background:'var(--bg-sunken)', overflow:'auto', height:'100%', whiteSpace:'pre-wrap'},
};
window.BodyViewer = BodyViewer;
