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

/** Anchors the viewport so a specific item stays at the same visual position across a setItems call. */
export interface ScrollAnchor {
  /** Key of the item that should remain visually pinned. */
  readonly key: string;
  /** Pixels into that item where the viewport's top edge sat (0 ≤ offset < rowHeight). */
  readonly offset: number;
}

export interface VirtualList<T> {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly innerContent: HTMLElement;
  /**
   * Replace items. When `options.anchor` is supplied and the anchored key is
   * present in the new list, scrollTop is reset so that item appears at the
   * same on-screen position (including its sub-row offset). Prevents the
   * user's view from drifting when new items prepend while they're scrolled
   * away from the head.
   */
  setItems(items: readonly T[], options?: { anchor?: ScrollAnchor }): void;
  scrollToIndex(index: number): void;
  /** True when the viewport is within `threshold` px of the top (= newest). */
  isAtHead(thresholdPx?: number): boolean;
  /** Snapshot of the topmost visible item so it can be restored across a setItems call. */
  peekAnchor(): ScrollAnchor | undefined;
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

  // Anchor restore: when prepending grows innerContent.height, Chromium fires a
  // spurious scroll event that resets scrollTop to 0 *between* our synchronous
  // set and the next paint. Two cooperating pieces of state defend against it:
  //
  //   expectedScrollTop — set during a setItems call, cleared in the rAF that
  //     follows; the scroll listener uses it to detect/repair browser stomps.
  //
  //   lastSetScrollTop — survives between setItems calls. Used by peekAnchor
  //     so that, if a second event arrives in the same frame before the rAF
  //     has run, we don't re-anchor against a freshly-stomped scrollTop=0.
  let expectedScrollTop: number | null = null;
  let lastSetScrollTop: number | null = null;

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
    // If we're inside the lock window and the browser has stomped on us,
    // immediately re-pin and swallow the spurious event so external listeners
    // (atHead, etc.) don't see the transient 0.
    if (expectedScrollTop != null && viewport.scrollTop !== expectedScrollTop) {
      viewport.scrollTop = expectedScrollTop;
      render();
      return;
    }
    // Genuine scroll (user input or our own re-pin landing). Mirror the new
    // value into lastSetScrollTop so future peekAnchor calls see the truth.
    lastSetScrollTop = viewport.scrollTop;
    render();
    for (const l of scrollListeners) l();
  });
  const ro = new ResizeObserver(render);
  ro.observe(viewport);

  return {
    root,
    viewport,
    innerContent,
    setItems(next, options) {
      items = next;
      // Grow innerContent before moving scrollTop so the new range is valid.
      innerContent.style.height = `${items.length * opts.rowHeight}px`;
      // Compute the scrollTop to lock in across this setItems call. Anchor key
      // present + found → move to its new pixel position. Otherwise keep the
      // current scrollTop. We pin in either case so the browser's post-layout
      // reset can't silently send us back to 0.
      const anchor = options?.anchor;
      let target = viewport.scrollTop;
      if (anchor != null) {
        const idx = items.findIndex((it) => opts.keyFor(it) === anchor.key);
        if (idx >= 0) target = idx * opts.rowHeight + anchor.offset;
      }
      viewport.scrollTop = target;
      expectedScrollTop = target;
      lastSetScrollTop = target;
      // Belt-and-suspenders clears for expectedScrollTop: rAF for the common
      // case where the browser fires a paint within a frame; setTimeout as a
      // safety net for backgrounded tabs / paused devtools where rAF can be
      // throttled indefinitely (otherwise a stale lock would re-pin every real
      // user scroll). Whichever fires first wins; the other becomes a no-op.
      const releaseLock = () => { expectedScrollTop = null; };
      requestAnimationFrame(() => {
        if (expectedScrollTop != null && viewport.scrollTop !== expectedScrollTop) {
          viewport.scrollTop = expectedScrollTop;
        }
        releaseLock();
      });
      setTimeout(releaseLock, 250);
      render();
    },
    scrollToIndex(index) {
      const top = index * opts.rowHeight;
      viewport.scrollTop = top;
      lastSetScrollTop = top;
      render();
    },
    isAtHead(threshold = 4) {
      return viewport.scrollTop <= threshold;
    },
    peekAnchor() {
      if (items.length === 0) return undefined;
      const rh = opts.rowHeight;
      // Always prefer lastSetScrollTop once it has been written: it tracks
      // BOTH our own intentional pins (setItems/scrollToIndex) AND genuine
      // user scrolls (the scroll handler mirrors viewport.scrollTop into it).
      // The live viewport.scrollTop, on the other hand, can be transiently 0
      // when Chromium stomps it between our set and the rAF re-pin — reading
      // it directly there would silently anchor against the head.
      const st = lastSetScrollTop ?? viewport.scrollTop;
      const raw = Math.floor(st / rh);
      const clamped = Math.max(0, Math.min(items.length - 1, raw));
      return {
        key: opts.keyFor(items[clamped]!),
        offset: st - clamped * rh,
      };
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
