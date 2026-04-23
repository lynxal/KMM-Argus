// EventDetail.jsx — right pane with tabs, supports HTTP / LOG / CUSTOM
function EventDetail({ event }) {
  const [tab, setTab] = React.useState('body');
  if (!event) return <NothingSelected />;
  const isHttp = event.kind === 'HTTP';
  const isLog = event.kind === 'LOG';
  const tabs = isHttp
    ? [{ id: 'headers', label: 'Headers', n: 17 }, { id: 'request', label: 'Request' }, { id: 'body', label: 'Response', n: '12.4 KB' }, { id: 'timing', label: 'Timing' }, { id: 'related', label: 'Related logs', n: 2 }, { id: 'raw', label: 'Raw' }]
    : isLog
      ? [{ id: 'body', label: 'Message' }, { id: 'payload', label: 'Payload' }, { id: 'stack', label: 'Stack trace' }, { id: 'raw', label: 'Raw' }]
      : [{ id: 'body', label: 'Payload' }, { id: 'raw', label: 'Raw' }];

  return (
    <div style={ds.root}>
      <Header event={event} />
      <div style={ds.tabs}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...ds.tab, ...(tab === t.id ? ds.tabOn : {}) }}>
            {t.label}
            {t.n != null && <span style={ds.tabN}>{t.n}</span>}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: '0 8px' }}>
          {isHttp && <button style={ds.actBtn} title="Copy as cURL"><Icon name="terminal" size={12}/><span>cURL</span></button>}
          {isHttp && <button style={ds.actBtn} title="Export as HAR"><Icon name="download" size={12}/><span>HAR</span></button>}
          <button style={ds.iconAct} title="Copy"><Icon name="copy" size={13} /></button>
        </div>
      </div>
      <div style={ds.content}>
        {tab === 'headers' && isHttp && <HeadersTab />}
        {tab === 'request' && isHttp && <RequestTab event={event} />}
        {tab === 'body' && <BodyTab event={event} />}
        {tab === 'payload' && isLog && <PayloadTab />}
        {tab === 'timing' && isHttp && <TimingTab event={event} />}
        {tab === 'related' && isHttp && <RelatedLogsTab />}
        {tab === 'stack' && <StackTab />}
        {tab === 'raw' && <RawTab event={event} />}
      </div>
    </div>
  );
}
function Header({ event }) {
  if (event.kind === 'HTTP') {
    const t = statusTone(event.status, event.err);
    return (
      <div style={ds.head}>
        <span style={{ font: '700 12px/1 "JetBrains Mono"', color: methodColor(event.method) }}>{event.method}</span>
        <span style={{ ...ds.statusPill, background: t.bg, color: t.fg }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />{t.label}
        </span>
        <span style={ds.url}><span style={{color:'var(--fg-3)'}}>{event.host}</span>{event.url}</span>
        <span style={ds.meta}>{formatBytes(event.size)} · {formatDur(event.dur)}</span>
      </div>
    );
  }
  if (event.kind === 'LOG') {
    const tone = logTone(event.level);
    return (
      <div style={ds.head}>
        <span style={{ font: '600 10px/1 "JetBrains Mono"', padding: '3px 7px', background: tone.bg, color: tone.fg, borderRadius: 3 }}>{event.level}</span>
        <span style={{ font: '400 11px "JetBrains Mono"', color: 'var(--fg-3)' }}>[{event.tag}]</span>
        <span style={ds.url}>{event.msg}</span>
        <span style={ds.meta}>{event.ts}</span>
      </div>
    );
  }
  return (
    <div style={ds.head}>
      <SrcBadge kind="CUSTOM" />
      <span style={{ font: '500 12px "JetBrains Mono"', color: 'var(--src-custom-fg)' }}>{event.name}</span>
      <span style={ds.url}>{event.msg}</span>
      <span style={ds.meta}>{event.ts}</span>
    </div>
  );
}
function NothingSelected() {
  return (
    <div style={{ ...ds.root, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 32, textAlign: 'center', maxWidth: 320 }}>
        <Icon name="arrowLeft" size={24} style={{ color: 'var(--fg-muted)' }} />
        <div style={{ font: '500 13px Inter', color: 'var(--fg-1)' }}>Select an event to inspect</div>
        <div style={{ font: '400 12px/18px Inter', color: 'var(--fg-2)' }}>Click a row, or press <Kbd>j</Kbd>/<Kbd>k</Kbd> to step through.</div>
      </div>
    </div>
  );
}

function HeadersTab() {
  const D = window.ARGUS_DATA;
  return (
    <div style={{padding:'4px 0'}}>
      <SectionLabel>Request Headers</SectionLabel>
      <KVTable rows={D.HEADERS_REQ} />
      <SectionLabel>Response Headers</SectionLabel>
      <KVTable rows={D.HEADERS_RES} />
    </div>
  );
}
function RequestTab({ event }) {
  return (
    <div style={{padding: 0}}>
      <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border-subtle)'}}>
        <div style={{font:'500 10px Inter', letterSpacing:'.04em', textTransform:'uppercase', color:'var(--fg-3)', marginBottom:6}}>URL</div>
        <div style={{font:'400 12px/18px "JetBrains Mono"', color:'var(--fg-1)', wordBreak:'break-all'}}>
          <span style={{color:methodColor(event.method), fontWeight:700}}>{event.method}</span>{' '}
          https://<span style={{color:'var(--fg-2)'}}>{event.host}</span>{event.url}
        </div>
        <div style={{marginTop:8, display:'flex', gap:6}}>
          <span style={bv.tag}>application/json</span>
          <span style={bv.tag}>gzip</span>
        </div>
      </div>
      <SectionLabel>Request body</SectionLabel>
      <div style={{height: 200}}>
        <BodyViewer variant="json" data={{ filters: { status: 'paid', page: 2 }, cursor: null }} />
      </div>
    </div>
  );
}
function BodyTab({ event }) {
  if (event.kind === 'HTTP') {
    if (event.err) return <ErrBanner msg="Connection timed out before the response body was received." />;
    if (event.size === 0) return <BodyViewer variant="empty" />;
    return <BodyViewer variant="json" data={window.ARGUS_DATA.BODY_JSON} />;
  }
  if (event.kind === 'LOG') {
    if (event.level === 'ERROR') return <StackTab />;
    return <BodyViewer variant="text" text={event.msg + '\n\nFull message body would render here word-wrapped.'} />;
  }
  return <BodyViewer variant="json" data={{ event: event.name, payload: event.msg }} />;
}
function PayloadTab() {
  return <KVTable rows={window.ARGUS_DATA.PAYLOAD_KV} />;
}
function TimingTab({ event }) {
  const total = event.dur || 186;
  const start = '14:22:07.802';
  const end = '14:22:07.988';
  const parts = [
    { label: 'DNS', ms: 4,  color: 'var(--wf-dns)' },
    { label: 'Connect', ms: 16, color: 'var(--wf-connect)' },
    { label: 'TLS', ms: 22, color: 'var(--wf-tls)' },
    { label: 'Send', ms: 2, color: 'var(--wf-send)' },
    { label: 'Wait (TTFB)', ms: Math.round(total * 0.55), color: 'var(--wf-wait)' },
    { label: 'Receive', ms: Math.round(total * 0.30), color: 'var(--wf-receive)' },
  ];
  const sum = parts.reduce((a,b)=>a+b.ms, 0);
  return (
    <div style={{ padding: 14 }}>
      <div style={{display:'flex', gap:16, font:'400 11px "JetBrains Mono"', color:'var(--fg-2)', marginBottom: 14}}>
        <span><span style={{color:'var(--fg-3)'}}>start </span>{start}</span>
        <span><span style={{color:'var(--fg-3)'}}>end </span>{end}</span>
        <span><span style={{color:'var(--fg-3)'}}>duration </span><b style={{color:'var(--fg-1)', fontWeight:500}}>{total} ms</b></span>
      </div>
      <div style={{height: 14, background:'var(--bg-subtle)', borderRadius:3, border:'1px solid var(--border-subtle)', display:'flex', overflow:'hidden', marginBottom: 16}}>
        {parts.map((p,i) => <div key={i} title={`${p.label} · ${p.ms} ms`} style={{width: (p.ms/sum*100)+'%', background: p.color}}/>)}
      </div>
      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <tbody>
          {parts.map((p, i) => (
            <tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}>
              <td style={{padding:'6px 10px', width:14}}><span style={{display:'inline-block', width:10, height:10, borderRadius:2, background:p.color}}/></td>
              <td style={{padding:'6px 10px', width: 140, font:'500 12px "JetBrains Mono"', color:'var(--fg-2)'}}>{p.label}</td>
              <td style={{padding:'6px 10px'}}>
                <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 2, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, height: 6, borderRadius: 2, width: Math.max(2, (p.ms/sum)*100) + '%', background: p.color }} />
                </div>
              </td>
              <td style={{padding:'6px 10px', width: 70, textAlign:'right', font:'400 12px "JetBrains Mono"', color:'var(--fg-1)'}}>{p.ms} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RelatedLogsTab() {
  const D = window.ARGUS_DATA.RELATED_LOGS;
  return (
    <div>
      <div style={{padding:'10px 14px', font:'400 11px Inter', color:'var(--fg-2)', borderBottom:'1px solid var(--border-subtle)'}}>
        Log events captured during the request's time window (<code style={bv.codeMono}>14:22:07.802 → 14:22:07.988</code>).
      </div>
      {D.map(l => {
        const tone = logTone(l.level);
        return (
          <div key={l.id} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 14px', borderBottom:'1px solid var(--border-subtle)', font:'400 12px "JetBrains Mono"'}}>
            <span style={{font:'600 10px/1 "JetBrains Mono"', padding:'3px 6px', background:tone.bg, color:tone.fg, borderRadius:3}}>{l.level}</span>
            <span style={{color:'var(--fg-3)'}}>[{l.tag}]</span>
            <span style={{color:'var(--fg-1)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{l.msg}</span>
            <span style={{color:'var(--fg-3)'}}>{l.delta}</span>
            <span style={{color:'var(--fg-2)'}}>{l.ts}</span>
          </div>
        );
      })}
    </div>
  );
}
function StackTab() {
  const lines = window.ARGUS_DATA.STACK.split('\n');
  return (
    <div style={{background:'var(--bg-sunken)', height:'100%', overflow:'auto'}}>
      {lines.map((l, i) => {
        const isCause = l.startsWith('Caused by');
        const isHeader = i === 0 || isCause;
        const m = l.match(/\(([^)]+)\)$/);
        return (
          <div key={i} style={{padding: '2px 14px', font:'400 12px/20px "JetBrains Mono"', color: isHeader ? 'var(--log-error-fg)' : 'var(--fg-1)', fontWeight: isHeader ? 500 : 400, borderBottom: isCause ? '1px solid var(--border-subtle)' : 'none', marginTop: isCause ? 4 : 0, paddingTop: isCause ? 6 : 2}}>
            {m ? <>
              <span>{l.slice(0, m.index)}</span>
              <span>(</span>
              <span style={{color:'var(--fg-link)', textDecoration:'underline', textUnderlineOffset:2, cursor:'pointer'}}>{m[1]}</span>
              <span>)</span>
            </> : l}
          </div>
        );
      })}
    </div>
  );
}
function RawTab({ event }) {
  const text = JSON.stringify(event, null, 2);
  return <BodyViewer variant="text" text={text} />;
}
function SectionLabel({ children }) {
  return <div style={{ padding: '10px 14px 4px', font: '500 10px/1 Inter', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-3)', background:'var(--bg-subtle)', borderBottom:'1px solid var(--border-subtle)' }}>{children}</div>;
}
function KVTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(([k, v, redacted], i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td style={{ padding: '6px 14px', font: '500 12px "JetBrains Mono"', color: 'var(--fg-2)', width: 220, verticalAlign: 'top' }}>{k}</td>
            <td style={{ padding: '6px 14px', font: '400 12px "JetBrains Mono"', color: redacted ? 'var(--fg-3)' : 'var(--fg-1)', fontStyle: redacted ? 'italic' : 'normal', wordBreak: 'break-all' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function ErrBanner({ msg }) {
  return (
    <div style={{ margin: 14, padding: '10px 12px', border: '1px solid var(--status-5xx-fg)', background: 'var(--status-5xx-bg)', color: 'var(--status-5xx-fg)', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon name="alert" size={16} />
      <div style={{ font: '400 12px/18px Inter' }}>{msg}</div>
    </div>
  );
}
const ds = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', minWidth: 0, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 14px', borderBottom: '1px solid var(--border-default)', flex: 'none' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 8px', borderRadius: 3, font: '500 11px/1 "JetBrains Mono"' },
  url: { flex: 1, font: '400 12px "JetBrains Mono"', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { font: '400 11px "JetBrains Mono"', color: 'var(--fg-2)' },
  tabs: { display: 'flex', height: 34, borderBottom: '1px solid var(--border-default)', padding: '0 4px', alignItems: 'center', flex: 'none' },
  tab: { position: 'relative', height: 34, padding: '0 10px', border: 0, background: 'transparent', color: 'var(--fg-2)', font: '500 12px/1 Inter', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: -1 },
  tabOn: { color: 'var(--fg-1)', boxShadow: 'inset 0 -2px 0 var(--border-focus)' },
  tabN: { color: 'var(--fg-3)', font: '400 11px "JetBrains Mono"' },
  iconAct: { width: 26, height: 24, border: '1px solid var(--border-default)', background: 'var(--bg-subtle)', color: 'var(--fg-2)', borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  actBtn: { display:'inline-flex', alignItems:'center', gap:5, height: 24, padding:'0 8px', border:'1px solid var(--border-default)', background:'var(--bg-subtle)', color:'var(--fg-2)', font:'500 11px/1 Inter', borderRadius:4, cursor:'pointer' },
  content: { flex: 1, overflow: 'auto', background: 'var(--bg-panel)' },
};
const bv = {
  tag: {display:'inline-flex', alignItems:'center', height:18, padding:'0 6px', borderRadius:3, background:'var(--bg-subtle)', border:'1px solid var(--border-default)', font:'500 10px/1 "JetBrains Mono"', color:'var(--fg-2)'},
  codeMono: {font:'400 11px "JetBrains Mono"', color:'var(--fg-1)', background:'var(--bg-subtle)', padding:'1px 4px', borderRadius:2},
};
window.EventDetail = EventDetail;
