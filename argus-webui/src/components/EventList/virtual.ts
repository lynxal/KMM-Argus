/**
 * Fixed-row-height windowing. No external dep — 50-odd LOC keeps the bundle
 * lean. Overscan defaults to 10 rows: enough that j/k keyboard nav never
 * shows a blank row even when combined with a slight scroll lag.
 *
 * Items grow at the END (newest last). That is the mode a scroll container is
 * built for: appending never changes an existing row's offset, so scrollTop
 * stays valid and the user's reading position holds by itself. The only scroll
 * compensation left is following the tail — see `pinned` below.
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
  /**
   * Replace items. Existing rows keep their offsets, so the viewport needs no
   * correction — except when the user is already at the tail, in which case we
   * stay there so newly appended rows remain visible.
   */
  setItems(items: readonly T[]): void;
  scrollToIndex(index: number): void;
  /** Jump to the newest row and resume following the tail. */
  scrollToEnd(): void;
  /**
   * Scroll the row at `index` just inside the viewport, but only when it is
   * currently outside it. A no-op otherwise, so keyboard nav within the visible
   * window doesn't jerk the list on every keypress.
   */
  scrollIndexIntoView(index: number): void;
  /** True while the newest (last) row is at least partly visible. */
  isNewestRowVisible(): boolean;
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
  // Pooled rows remember which item they were built from. A key can outlive the
  // item behind it — the store replaces an event in place when a later copy of it
  // arrives (a redirect's second hop shares the first hop's id) — and reusing the
  // element would leave the old status and duration on screen. Identity is the
  // right test: setItems hands back the same object references for untouched
  // events, so only genuinely replaced rows rebuild.
  const pool = new Map<string, { el: HTMLElement; item: T }>();
  const scrollListeners = new Set<() => void>();

  // True while the viewport sits at the bottom. Appended rows extend the content
  // below the viewport, which would otherwise leave the user drifting upward away
  // from live events, so we re-pin whenever the content or the viewport size
  // changes. Otherwise recomputed from the real scroll position on every scroll
  // event, so it can never disagree with what the user sees.
  let pinned = true;

  // Chromium reverts scrollTop after a content-size change lands and then fires a
  // scroll event carrying the reverted value. Appending is NOT immune to this —
  // it is the same stomp the old viewport-anchor lock existed for, measured here
  // as scrollTop 39 → 0 one frame after the write. Unguarded, that phantom event
  // reads as "the user scrolled to the top" and clears the pin for good.
  //
  // Only the bottom needs defending now, so the guard is a single boolean rather
  // than an anchor snapshot: inside the window we re-assert the bottom and
  // swallow the event. rAF releases it in the common case; the timeout is the
  // safety net for backgrounded tabs where rAF can be throttled indefinitely and
  // a stuck lock would fight real user scrolling.
  let pinLocked = false;

  function distanceFromTail(): number {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  }

  /**
   * Whether the newest row is still on screen. The last row occupies the final
   * `rowHeight` px of the content, so it is visible exactly while the gap below
   * the viewport is smaller than one row. This — not "scrollTop is exactly at the
   * bottom" — is what decides whether we keep following: a list resting a few px
   * short of the end is still showing the user live events.
   */
  function newestRowVisible(): boolean {
    return distanceFromTail() < opts.rowHeight;
  }

  function pinIfNeeded(): void {
    if (!pinned) return;
    if (viewport.scrollHeight <= viewport.clientHeight) return;
    viewport.scrollTop = viewport.scrollHeight;
    pinLocked = true;
    const release = () => { pinLocked = false; };
    requestAnimationFrame(release);
    setTimeout(release, 250);
  }

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
      let entry = pool.get(slotKey);
      if (entry != null && entry.item !== item) {
        entry.el.remove();
        pool.delete(slotKey);
        entry = undefined;
      }
      if (entry == null) {
        const el = opts.renderRow(item, i);
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.right = '0';
        el.style.height = `${opts.rowHeight}px`;
        innerContent.appendChild(el);
        entry = { el, item };
        pool.set(slotKey, entry);
      }
      entry.el.style.transform = `translateY(${i * opts.rowHeight}px)`;
    }

    for (const [key, entry] of pool) {
      if (!liveSlots.has(key)) {
        entry.el.remove();
        pool.delete(key);
      }
    }
  }

  viewport.addEventListener('scroll', () => {
    if (pinLocked && pinned && !newestRowVisible()) {
      viewport.scrollTop = viewport.scrollHeight;
      render();
      return;
    }
    pinned = newestRowVisible();
    render();
    for (const l of scrollListeners) l();
  });
  // Also re-pins on the first layout pass: clientHeight is 0 until then, so the
  // initial setItems cannot compute a meaningful bottom.
  const ro = new ResizeObserver(() => {
    pinIfNeeded();
    render();
  });
  ro.observe(viewport);

  return {
    root,
    viewport,
    innerContent,
    setItems(next) {
      items = next;
      // Grow innerContent before touching scrollTop so the new bottom is valid.
      innerContent.style.height = `${items.length * opts.rowHeight}px`;
      pinIfNeeded();
      render();
    },
    scrollToIndex(index) {
      viewport.scrollTop = index * opts.rowHeight;
      render();
    },
    scrollToEnd() {
      pinned = true;
      viewport.scrollTop = viewport.scrollHeight;
      render();
    },
    scrollIndexIntoView(index) {
      if (index < 0 || index >= items.length) return;
      const top = index * opts.rowHeight;
      const bottom = top + opts.rowHeight;
      const current = viewport.scrollTop;
      const height = viewport.clientHeight;
      // Before first layout clientHeight is 0; every row would look off-screen.
      if (height === 0) return;
      let target: number;
      if (top < current) {
        target = top;
      } else if (bottom > current + height) {
        target = bottom - height;
      } else {
        return;
      }
      viewport.scrollTop = target;
      render();
    },
    isNewestRowVisible() {
      return newestRowVisible();
    },
    onScroll(listener) {
      scrollListeners.add(listener);
      return () => scrollListeners.delete(listener);
    },
    invalidateAll() {
      for (const entry of pool.values()) entry.el.remove();
      pool.clear();
    },
  };
}
