/**
 * Fixed-row-height windowing. No external dep — 50-odd LOC keeps the bundle
 * lean. Overscan defaults to 10 rows: enough that j/k keyboard nav never
 * shows a blank row even when combined with a slight scroll lag.
 */
export interface VirtualListOptions<T> {
  readonly rowHeight: number;
  readonly overscan?: number;
  readonly renderRow: (item: T, index: number) => HTMLElement;
  /** Key extractor so we reuse row elements across updates when we can. */
  readonly keyFor: (item: T) => string;
}

export interface VirtualList<T> {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly innerContent: HTMLElement;
  setItems(items: readonly T[]): void;
  scrollToIndex(index: number): void;
  /** True when the viewport is within `threshold` px of the top (= newest). */
  isAtHead(thresholdPx?: number): boolean;
  onScroll(listener: () => void): () => void;
  /** Drop all pooled row elements; next render rebuilds them from scratch. */
  invalidateAll(): void;
}

export function createVirtualList<T>(opts: VirtualListOptions<T>): VirtualList<T> {
  const overscan = opts.overscan ?? 10;

  const root = document.createElement('div');
  root.className = 'relative flex-1 min-h-0';

  const viewport = document.createElement('div');
  viewport.className = 'absolute inset-0 overflow-y-auto overflow-x-hidden';
  viewport.style.scrollbarGutter = 'stable';
  root.appendChild(viewport);

  const innerContent = document.createElement('div');
  innerContent.style.position = 'relative';
  viewport.appendChild(innerContent);

  let items: readonly T[] = [];
  const pool = new Map<string, HTMLElement>();
  const scrollListeners = new Set<() => void>();

  function render(): void {
    const total = items.length * opts.rowHeight;
    innerContent.style.height = `${total}px`;

    const scrollTop = viewport.scrollTop;
    const viewportHeight = viewport.clientHeight || 1;
    const first = Math.max(0, Math.floor(scrollTop / opts.rowHeight) - overscan);
    const last = Math.min(items.length - 1, Math.ceil((scrollTop + viewportHeight) / opts.rowHeight) + overscan);

    // If `keyFor` ever returns the same value twice in one pass (e.g. a server
    // bug or a backfill+ws race produced two events with the same id), the
    // naive pool would map both occurrences to the same DOM and the second
    // `transform` write would steal the first row's slot — leaving a visible
    // gap. Disambiguate the pool slot with a per-pass occurrence counter.
    const seenInPass = new Map<string, number>();
    const liveSlots = new Set<string>();
    for (let i = first; i <= last; i++) {
      const item = items[i]!;
      const baseKey = opts.keyFor(item);
      const occ = seenInPass.get(baseKey) ?? 0;
      seenInPass.set(baseKey, occ + 1);
      const slotKey = occ === 0 ? baseKey : `${baseKey}#${occ}`;
      liveSlots.add(slotKey);
      let el = pool.get(slotKey);
      if (!el) {
        el = opts.renderRow(item, i);
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.right = '0';
        el.style.height = `${opts.rowHeight}px`;
        innerContent.appendChild(el);
        pool.set(slotKey, el);
      }
      el.style.transform = `translateY(${i * opts.rowHeight}px)`;
    }

    for (const [key, el] of pool) {
      if (!liveSlots.has(key)) {
        el.remove();
        pool.delete(key);
      }
    }
  }

  viewport.addEventListener('scroll', () => {
    render();
    for (const l of scrollListeners) l();
  });
  const ro = new ResizeObserver(render);
  ro.observe(viewport);

  return {
    root,
    viewport,
    innerContent,
    setItems(next) {
      items = next;
      render();
    },
    scrollToIndex(index) {
      viewport.scrollTop = index * opts.rowHeight;
      render();
    },
    isAtHead(threshold = 4) {
      return viewport.scrollTop <= threshold;
    },
    onScroll(listener) {
      scrollListeners.add(listener);
      return () => scrollListeners.delete(listener);
    },
    invalidateAll() {
      for (const el of pool.values()) el.remove();
      pool.clear();
    },
  };
}
