// Files into a session from the browser (paste / drag & drop / "Upload file" in the web
// terminal) — the browser-only counterpart of ⌘⇧V / ⌘V on the mac, which go through the mac
// listener. Each file is uploaded to devd (POST /api/sessions/:id/upload → .inbox), and the
// returned container paths are pasted into the prompt, where Claude Code, Codex and Grok attach
// them the same way as a file dragged into a local terminal.

/** Mirror of MAX_INBOX_BYTES in devd/src/inbox.ts (the server enforces it; this is only an early message). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** The parts of File that the helpers need (File in the browser, a plain object in tests). */
export interface UploadFile { name: string; size: number; type: string }

/** Files carried by a paste or drop event, if any. A plain-text paste has none and is left to xterm.js. */
export function filesFrom(dt: { files?: ArrayLike<File> | null } | null | undefined): File[] {
  return dt?.files ? Array.from(dt.files) : [];
}

/** File name to upload under. A clipboard screenshot arrives as a generic "image.png" (Chrome,
 *  Edge, Firefox) — give it a timestamped name, so pastes do not pile up as image-1, image-2… and
 *  the agent sees when it was taken. Real file names are kept (devd sanitizes them). */
export function uploadName(f: UploadFile, now: Date = new Date()): string {
  const generic = /^image\.(png|jpe?g|gif|webp)$/i.exec(f.name);
  if (!f.name || generic) {
    const ext = generic?.[1]?.toLowerCase() ?? (f.type.startsWith("image/") ? f.type.slice(6).replace("jpeg", "jpg") : "bin");
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    return `img-${stamp}.${ext}`;
  }
  return f.name;
}

/** Files over the limit, refused before uploading (the server would answer 413 anyway). */
export function tooLarge(files: UploadFile[], max = MAX_UPLOAD_BYTES): UploadFile[] {
  return files.filter((f) => f.size > max);
}

/** Text pasted into the prompt for the uploaded paths: space separated with a trailing space, so
 *  the user can keep typing. The paths come from devd (sanitized names, no spaces). */
export function promptText(paths: string[]): string {
  return paths.length ? paths.join(" ") + " " : "";
}

/** Uploads one file; returns the container path. Throws with the server's message on failure. */
export async function uploadToSession(sessionId: string, file: File, name: string, fetcher: typeof fetch = fetch): Promise<string> {
  const r = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
    method: "POST",
    headers: { "x-devbox-filename": encodeURIComponent(name), "content-type": "application/octet-stream" },
    body: file,
  });
  const body = (await r.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!r.ok || !body.path) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body.path;
}

/** Ctrl+V on Windows/Linux. xterm.js turns it into the control character ^V (sent to tmux, where
 *  the C-v binding asks the mac listener for the clipboard) and cancels the key event, so the
 *  browser never fires `paste` and a screenshot never reaches the upload. In the dashboard
 *  terminal Ctrl+V is therefore left to the browser as a paste — files then go to the upload,
 *  text to xterm.js as usual. ⌘V on a Mac is not affected (xterm.js does not intercept it). */
export function isPasteShortcut(ev: { type: string; key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean {
  return ev.type === "keydown" && ev.ctrlKey && !ev.altKey && !ev.metaKey && ev.key.toLowerCase() === "v";
}
