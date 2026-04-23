import { effect } from '@preact/signals-core';
import type { ShortcutBus } from '../../input/keyboard';

/** Bottom-center toast, auto-dismiss ~3s. Reads the bus.toast signal. */
export function createToast({ bus }: { bus: ShortcutBus }): HTMLElement {
  const root = document.createElement('div');
  root.className =
    'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 hidden items-center gap-2 px-3 ds-toast bg-bg-overlay text-fg-1 border border-border-default shadow-md rounded-md text-xs font-ui';

  const dot = document.createElement('span');
  dot.className = 'ds-conn-dot bg-conn-ok-dot';
  const msg = document.createElement('span');
  root.append(dot, msg);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  effect(() => {
    const t = bus.toast.value;
    if (!t) {
      root.classList.add('hidden');
      root.classList.remove('flex');
      return;
    }
    msg.textContent = t.msg;
    root.classList.remove('hidden');
    root.classList.add('flex');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bus.toast.value = null;
    }, 3000);
  });

  return root;
}
