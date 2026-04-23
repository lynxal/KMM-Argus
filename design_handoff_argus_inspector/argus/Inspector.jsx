// Inspector.jsx — assembles TopBar, FilterBar, EventList, EventDetail, Waterfall
function Inspector({ initialView='split', initialConn='connected', showFilterPopover=false, showShortcuts=false, showToast=null, density='compact', forceEmpty=false, selectionMode='mouse', showJumpToLatest=false, initialTheme=null }) {
  const [theme, setTheme] = React.useState(initialTheme || 'light');
  const [view, setView] = React.useState(initialView);
  const [conn, setConn] = React.useState(initialConn);
  const [paused, setPaused] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [popover, setPopover] = React.useState(showFilterPopover);
  const [help, setHelp] = React.useState(showShortcuts);
  const [toast, setToast] = React.useState(showToast);
  const [sources, setSources] = React.useState(['HTTP', 'LOG', 'CUSTOM']);
  const [methods, setMethods] = React.useState(['GET','POST','PUT','PATCH','DELETE','OTHER']);
  const [statuses, setStatuses] = React.useState(['2xx','3xx','4xx','5xx','ERR']);
  const [levels, setLevels] = React.useState(['ERROR','WARN','INFO','DEBUG','VERB']);
  const [tagQuery, setTagQuery] = React.useState('');
  const [hostQuery, setHostQuery] = React.useState('');
  const [containsQuery, setContainsQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(10);
  const [selMode, setSelMode] = React.useState(selectionMode);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.classList.toggle('theme-dark', theme === 'dark');
    containerRef.current.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  const all = forceEmpty ? [] : window.ARGUS_DATA.DATA;
  const events = all.filter(e => sources.includes(e.kind)).filter(e => {
    if (hostQuery && e.host && !e.host.includes(hostQuery)) return false;
    if (containsQuery) {
      const hay = [e.url, e.msg, e.name, e.host, e.method].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(containsQuery.toLowerCase())) return false;
    }
    return true;
  });
  const selected = events.find(e => e.id === selectedId) || events[0];
  const onSelect = (id, mode) => { setSelectedId(id); setSelMode(mode); };
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const cycleConn = () => setConn(conn === 'connected' ? 'reconnecting' : conn === 'reconnecting' ? 'disconnected' : 'connected');
  const onClear = () => { setMethods([]); setStatuses([]); setLevels([]); setTagQuery(''); setHostQuery(''); setContainsQuery(''); };

  return (
    <div ref={containerRef} className={theme === 'dark' ? 'theme-dark' : 'theme-light'} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)', position:'relative', overflow:'hidden', color:'var(--fg-1)' }}>
      <TopBar view={view} setView={setView} theme={theme} setTheme={setTheme}
        conn={conn} onCycleConn={cycleConn} paused={paused} onPauseToggle={() => setPaused(p=>!p)}
        onClear={() => {}} query={query} setQuery={setQuery} onHelp={() => setHelp(true)} />

      {(conn === 'reconnecting' || conn === 'disconnected') && <ReconnectingBanner state={conn} />}

      <div style={{position:'relative', flex:'none'}}>
        <FilterBar sources={sources} onToggleSource={s => toggle(sources, setSources, s)}
          methods={methods} onToggleMethod={m => toggle(methods, setMethods, m)}
          statuses={statuses} onToggleStatus={s => toggle(statuses, setStatuses, s)}
          levels={levels} onToggleLevel={l => toggle(levels, setLevels, l)}
          tagQuery={tagQuery} setTagQuery={setTagQuery}
          hostQuery={hostQuery} setHostQuery={setHostQuery}
          containsQuery={containsQuery} setContainsQuery={setContainsQuery}
          onClear={onClear} totalCount={all.length} shownCount={events.length} />
        {popover && <div style={{position:'absolute', left: 12, top: '100%', zIndex: 50}}><FilterPopover onClose={() => setPopover(false)} /></div>}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 8, gap: 8, background: 'var(--bg-app)' }}>
        {forceEmpty && <EmptyInspector />}
        {!forceEmpty && view === 'list' && (
          <div style={panel}><EventList events={events} selectedId={selected?.id} onSelect={onSelect} selectionMode={selMode} containsQuery={containsQuery} density={density} showJumpToLatest={showJumpToLatest} /></div>
        )}
        {!forceEmpty && view === 'split' && (<>
          <div style={{ ...panel, flex: '0 0 50%' }}><EventList events={events} selectedId={selected?.id} onSelect={onSelect} selectionMode={selMode} containsQuery={containsQuery} density={density} showJumpToLatest={showJumpToLatest} /></div>
          <div style={{ ...panel, flex: 1 }}><EventDetail event={selected} /></div>
        </>)}
        {!forceEmpty && view === 'waterfall' && (<>
          <div style={{ ...panel, flex: '0 0 34%' }}><EventList events={events} selectedId={selected?.id} onSelect={onSelect} selectionMode={selMode} containsQuery={containsQuery} density={density} /></div>
          <div style={{ ...panel, flex: 1 }}><Waterfall events={events} selectedId={selected?.id} onSelect={onSelect} zoom={1} /></div>
        </>)}
      </div>

      <div style={statusBar}>
        <span><b style={{fontWeight:500, color:'var(--fg-1)'}}>{events.length}</b> events{paused && <span style={{color:'var(--amber-600)', marginLeft:6}}>· paused</span>}</span>
        <span style={{color:'var(--fg-3)'}}>·</span>
        <span>Argus 1.0.0</span>
        <span style={{marginLeft:'auto', display:'flex', gap:10, color:'var(--fg-3)'}}>
          <span>Search <Kbd>/</Kbd></span>
          <span>Nav <Kbd>j</Kbd><Kbd>k</Kbd></span>
          <span>Pause <Kbd>p</Kbd></span>
          <span>View <Kbd>w</Kbd></span>
          <span>Help <Kbd>?</Kbd></span>
        </span>
      </div>

      {help && <ShortcutsOverlay onClose={() => setHelp(false)} />}
      {toast && <Toast msg={toast} />}
    </div>
  );
}
const panel = { flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 };
const statusBar = { display:'flex', alignItems:'center', gap:8, height:24, padding:'0 14px', borderTop:'1px solid var(--border-default)', background:'var(--bg-panel)', font:'400 11px Inter', color:'var(--fg-2)', flex:'none' };
window.Inspector = Inspector;
