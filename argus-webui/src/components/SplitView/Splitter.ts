import { effect, type Signal } from '@preact/signals-core';
import {
  clampListWidth,
  MIN_LIST_WIDTH,
  MIN_WATERFALL_WIDTH,
  SPLITTER_WIDTH,
  WIDTH_STEP,
} from './SplitView.states';
import { DEFAULT_WATERFALL_LIST_WIDTH } from '../../store/eventStore';

export interface SplitterProps {
  /** Width of the pane to the splitter's left. Written on drag, read for the reset. */
  readonly width: Signal<number>;
  /**
   * Content width of the flex row holding both panes and this handle. A callback
   * rather than a value because it has to be measured at the moment of the drag —
   * the window can be resized between mounting and grabbing the handle.
   */
  readonly available: () => number;
}

/**
 * Draggable divider between the event list and the waterfall canvas.
 *
 * Sized to `SPLITTER_WIDTH` so it can stand in for the layout's `gap-2` gutter
 * rather than adding a third one — SplitView drops the gap in the branch that
 * mounts this. The visible mark is a 1 px rule, matching the decorative divider
 * in FilterBar.styles.ts; the rest of the width is hit area.
 */
export function createSplitter({ width, available }: SplitterProps): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ds-splitter w-2 flex-none flex items-center justify-center cursor-col-resize';
  // Without this a touch drag scrolls the page instead of moving the handle, and
  // the pointer events we rely on stop arriving mid-gesture.
  root.style.touchAction = 'none';
  root.setAttribute('role', 'separator');
  root.setAttribute('aria-orientation', 'vertical');
  root.setAttribute('aria-label', 'Resize event list');
  root.tabIndex = 0;
  root.title = 'Drag to resize · double-click to reset';

  const rule = document.createElement('div');
  rule.className = 'ds-splitter-rule w-px h-full bg-border-default';
  root.appendChild(rule);

  function resize(next: number): void {
    width.value = clampListWidth(next, available());
  }

  // Pointer drag. `setPointerCapture` is what keeps the gesture alive once the
  // cursor leaves the 8 px handle — without it the first move event lands on the
  // canvas and the drag dies immediately.
  let startX = 0;
  let startWidth = 0;

  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    root.toggleAttribute('data-dragging', true);
    startX = e.clientX;
    startWidth = width.peek();
    // A drag across text otherwise selects it, which leaves the page highlighted
    // and swallows the next click.
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  root.addEventListener('pointermove', (e) => {
    if (!root.hasAttribute('data-dragging')) return;
    resize(startWidth + (e.clientX - startX));
  });

  function endDrag(e: PointerEvent): void {
    if (!root.hasAttribute('data-dragging')) return;
    root.releasePointerCapture(e.pointerId);
    root.removeAttribute('data-dragging');
    document.body.style.userSelect = '';
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  root.addEventListener('dblclick', () => resize(DEFAULT_WATERFALL_LIST_WIDTH));

  // Left/right and Home are deliberate: keyboard.ts binds Up/Down to event
  // navigation globally, and its typing guard exempts only inputs and
  // contenteditable — a focusable div would still hand them over.
  root.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? WIDTH_STEP * 4 : WIDTH_STEP;
    if (e.key === 'ArrowLeft') resize(width.peek() - step);
    else if (e.key === 'ArrowRight') resize(width.peek() + step);
    else if (e.key === 'Home') resize(DEFAULT_WATERFALL_LIST_WIDTH);
    else return;
    e.preventDefault();
  });

  // Re-runs on width changes only. `available()` is read here for the ceiling but
  // is not reactive, so a window resize leaves aria-valuemax stale until the next
  // drag — SplitView's resize observer re-clamps the width, which fires this.
  effect(() => {
    const current = width.value;
    const ceiling = Math.max(MIN_LIST_WIDTH, available() - SPLITTER_WIDTH - MIN_WATERFALL_WIDTH);
    root.setAttribute('aria-valuenow', String(current));
    root.setAttribute('aria-valuemin', String(MIN_LIST_WIDTH));
    root.setAttribute('aria-valuemax', String(ceiling));
  });

  return root;
}
