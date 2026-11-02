// Copy out of a session into the browser's clipboard (OSC 52) — the browser-only counterpart
// of the mac listener's clipboard. tmux (set-clipboard on, image/tmux.conf) forwards OSC 52
// from its own copy-mode (mouse selection) and from apps in the pane (e.g. Claude Code's
// "c to copy") to the attached client, which here is xterm.js in the dashboard.
//
// Writing to the clipboard is only done right after the operator interacted with the terminal
// (a mouse selection or a key press, see USER_GESTURE_MS). An agent — or a prompt injection that
// reached it — must not be able to silently replace what the operator pastes next, so a write
// arriving on its own is only offered behind a "Copy" button instead.

/** Upper bound for an accepted OSC 52 payload (base64 characters), ~1 MB of text. */
export const MAX_OSC52_BASE64 = 1_400_000;
/** How long after a user gesture an OSC 52 write counts as user-initiated. */
export const USER_GESTURE_MS = 2000;

/** Parses the OSC 52 data part (`<selection>;<base64>`). Returns the text, or null for a query
 *  (`?`, never answered — the page must not leak the clipboard to the session), a clear (empty
 *  payload), invalid base64/UTF-8 or an oversized payload. */
export function decodeOsc52(data: string): string | null {
  const semi = data.indexOf(";");
  if (semi < 0) return null;
  const b64 = data.slice(semi + 1).trim();
  if (!b64 || b64 === "?" || b64.length > MAX_OSC52_BASE64) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Whether an OSC 52 write that arrives `now` follows a user gesture closely enough. */
export function isUserInitiated(lastGestureAt: number, now: number, windowMs = USER_GESTURE_MS): boolean {
  return lastGestureAt > 0 && now >= lastGestureAt && now - lastGestureAt <= windowMs;
}

/** Short preview of the copied text for the "Copy" bar. */
export function preview(text: string, max = 60): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** Writes text to the clipboard. `navigator.clipboard` needs a secure context (https or
 *  localhost); the dashboard is usually plain http on the tailnet, so fall back to
 *  execCommand("copy"), which works there while the page has transient user activation.
 *  Returns whether the write succeeded. */
export async function writeClipboard(text: string, doc: Document = document): Promise<boolean> {
  const nav = doc.defaultView?.navigator;
  if (doc.defaultView?.isSecureContext && nav?.clipboard?.writeText) {
    try { await nav.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const active = doc.activeElement as HTMLElement | null;
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  doc.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = doc.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  active?.focus?.();
  return ok;
}
