/**
 * Clipboard write that survives a non-secure context.
 *
 * `navigator.clipboard` is gated on `isSecureContext`, and the Argus UI is
 * normally served by the device over plain http on a LAN address — so the whole
 * `clipboard` object is `undefined` there, and reading `.writeText` off it throws
 * synchronously rather than rejecting. That is why the original
 * `navigator.clipboard.writeText(...).catch(...)` calls failed silently on a real
 * device while working fine against localhost in dev.
 *
 * The `execCommand('copy')` fallback is deprecated but is the only thing that
 * works over http, and every browser that ships the modern API still honours it.
 */
export async function copyText(text: string): Promise<boolean> {
  const write = navigator.clipboard?.writeText;
  if (write) {
    try {
      await write.call(navigator.clipboard, text);
      return true;
    } catch {
      // Permission denied or a transient failure — fall through to execCommand.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // Off-screen but still focusable — `display: none` makes the selection fail.
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}
