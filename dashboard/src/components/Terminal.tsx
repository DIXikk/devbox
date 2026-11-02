import { useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { encodeBottom, encodeInput, encodeResize, encodeScroll, encodeUnlock, KEY_BAR, KEY_SEQ, terminalWsUrl, wheelSteps } from "../terminalProto";
import { filesFrom, MAX_UPLOAD_BYTES, promptText, tooLarge, uploadName, uploadToSession } from "../terminalUpload";
import { decodeOsc52, isUserInitiated, preview, writeClipboard } from "../terminalClipboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TerminalProps {
  /** Owner's session — WS to /api/sessions/:id/terminal. A guest passes `wsUrl` instead. */
  id?: string;
  tmux?: string;
  /** Ready-made WS address (share guest page); takes precedence over `id`. */
  wsUrl?: string;
  /** Control from the start (share guest — the server granted it right away): no read-only and no Take control. */
  startUnlocked?: boolean;
  title: string;
  /** Without onClose the Close button is not shown (the guest page has nothing to close to). */
  onClose?: () => void;
  /** Header addition next to the title (e.g. share countdown). */
  headerExtra?: ReactNode;
  /** The socket closed; `opened` = it managed to open (otherwise connect/upgrade already failed). */
  onSocketClose?: (ev: { code: number; opened: boolean }) => void;
  /** Connection state texts — overrides the default "connecting…" / "disconnected". */
  statusLabels?: { connecting: string; closed: string };
}

export function Terminal({ id, tmux, wsUrl, startUnlocked = false, title, onClose, headerExtra, onSocketClose, statusLabels }: TerminalProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const [granted, setGranted] = useState(startUnlocked);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [scrolledUp, setScrolledUp] = useState(false); // "↓ Jump to end" after scrolling into history
  const termRef = useRef<Xterm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const grantedRef = useRef(startUnlocked);
  const onSocketCloseRef = useRef(onSocketClose);
  onSocketCloseRef.current = onSocketClose;
  // Copy out of the session (OSC 52, see terminalClipboard.ts): written right away after a mouse
  // selection in the terminal, otherwise offered behind a "Copy" button.
  const [copyOffer, setCopyOffer] = useState<{ text: string; failed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  // Files into the session (paste / drag & drop / button) — owner's terminal only: a share
  // guest has no `id` and devd refuses uploads from non-operator addresses anyway.
  const canUpload = Boolean(id) && !wsUrl;
  const [uploadMsg, setUploadMsg] = useState<{ text: string; error: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  async function uploadFiles(files: File[]) {
    if (!canUpload || !id || files.length === 0) return;
    if (!grantedRef.current) { setUploadMsg({ text: "Take control first, then paste or drop the file again.", error: true }); return; }
    const big = tooLarge(files);
    if (big.length) { setUploadMsg({ text: `Too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB): ${big.map((f) => f.name || "pasted image").join(", ")}`, error: true }); return; }
    setUploadMsg({ text: files.length === 1 ? "Uploading…" : `Uploading ${files.length} files…`, error: false });
    const paths: string[] = [];
    try {
      for (const f of files) paths.push(await uploadToSession(id, f, uploadName(f)));
    } catch (e) {
      setUploadMsg({ text: `Upload failed: ${(e as Error).message}`, error: true });
    }
    if (paths.length) {
      termRef.current?.paste(promptText(paths));   // bracketed paste (if the pane asked for it) — like devbox-ctrlv
      termRef.current?.focus();
      setUploadMsg((m) => (m?.error ? m : { text: `Attached ${paths.length === 1 ? paths[0] : `${paths.length} files`}`, error: false }));
    }
  }
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  useEffect(() => {
    if (!uploadMsg || uploadMsg.error || uploadMsg.text.endsWith("…")) return;
    const t = setTimeout(() => setUploadMsg(null), 4000);
    return () => clearTimeout(t);
  }, [uploadMsg]);

  useEffect(() => {
    if (!host.current) return;
    const term = new Xterm({ fontFamily: "IBM Plex Mono, monospace", fontSize: 13, cursorBlink: true, theme: { background: "#0b0e14" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    termRef.current = term;

    const ws = new WebSocket(wsUrl ?? terminalWsUrl(id ?? "", tmux));
    wsRef.current = ws;
    let opened = false;
    let disposed = false;
    ws.onopen = () => { opened = true; setStatus("open"); ws.send(encodeResize(term.cols, term.rows)); };
    ws.onmessage = (e) => { term.write(typeof e.data === "string" ? e.data : ""); };
    ws.onclose = (e) => {
      setStatus("closed");
      if (!disposed) onSocketCloseRef.current?.({ code: e.code, opened });
    };
    // Read-only: we send keys only after Take control (grantedRef).
    // Typing in copy-mode usually exits it in tmux → hide the "Jump to end" button.
    const dataSub = term.onData((d) => { if (grantedRef.current && ws.readyState === ws.OPEN) { ws.send(encodeInput(d)); setScrolledUp(false); } });
    // Wheel: the history is in tmux, not in xterm.js. Instead of mouse input ({t:"i"}, which devd
    // drops in read-only) we send {t:"s"} — works in read-only and after taking control.
    let wheelRest = 0;
    term.attachCustomWheelEventHandler((ev) => {
      ev.preventDefault();
      const lineHeight = (term.element?.querySelector(".xterm-screen")?.clientHeight ?? 0) / term.rows || 16;
      const px = ev.deltaMode === 1 ? ev.deltaY * lineHeight : ev.deltaMode === 2 ? ev.deltaY * lineHeight * term.rows : ev.deltaY;
      const st = wheelSteps(px, lineHeight, wheelRest);
      wheelRest = st.rest;
      if (st.dir && ws.readyState === ws.OPEN) {
        ws.send(encodeScroll(st.dir, st.n));
        if (st.dir === "up") setScrolledUp(true);
      }
      return false; // xterm.js does not process the wheel further
    });
    const onResize = () => { fit.fit(); if (ws.readyState === ws.OPEN) ws.send(encodeResize(term.cols, term.rows)); };
    window.addEventListener("resize", onResize);

    // Paste with files (a screenshot, a file copied in Explorer/Finder) and drag & drop → upload.
    // Capture phase, so xterm.js's own paste handler never sees a file paste; plain-text pastes
    // pass through to it untouched.
    const el = host.current;
    const onPaste = (ev: ClipboardEvent) => {
      const files = filesFrom(ev.clipboardData);
      if (!files.length) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      void uploadFilesRef.current(files);
    };
    const onDragOver = (ev: DragEvent) => { if (ev.dataTransfer?.types.includes("Files")) ev.preventDefault(); };
    const onDrop = (ev: DragEvent) => {
      const files = filesFrom(ev.dataTransfer);
      if (!files.length) return;
      ev.preventDefault();
      void uploadFilesRef.current(files);
    };
    if (canUpload) {
      el.addEventListener("paste", onPaste, true);
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("drop", onDrop);
    }

    // OSC 52 from tmux / the app in the pane → browser clipboard. Only the end of a mouse
    // selection counts as "the operator is copying": key presses do not, because the operator types
    // into the session all the time and a session could time its OSC 52 to follow them.
    let lastGestureAt = 0;
    const onGesture = () => { lastGestureAt = Date.now(); };
    el.addEventListener("mouseup", onGesture, true);
    const osc = term.parser.registerOscHandler(52, (data) => {
      const text = decodeOsc52(data);
      if (text === null) return true;   // queries are never answered; garbage is swallowed
      if (isUserInitiated(lastGestureAt, Date.now())) {
        void writeClipboard(text).then((ok) => {
          if (disposed) return;
          if (ok) { setCopyOffer(null); setCopied(true); } else setCopyOffer({ text, failed: false });
        });
      } else {
        setCopyOffer({ text, failed: false });
      }
      return true;
    });

    return () => {
      disposed = true; window.removeEventListener("resize", onResize);
      el.removeEventListener("paste", onPaste, true); el.removeEventListener("dragover", onDragOver); el.removeEventListener("drop", onDrop);
      el.removeEventListener("mouseup", onGesture, true);
      osc.dispose(); dataSub.dispose(); ws.close(); term.dispose();
    };
  }, [id, tmux, wsUrl, canUpload]);

  function takeControl() {
    grantedRef.current = true; setGranted(true);
    wsRef.current?.send(encodeUnlock());
    termRef.current?.focus();
  }
  function sendKey(k: string) {
    if (!grantedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(encodeInput(KEY_SEQ[k] ?? ""));
    setScrolledUp(false);
    termRef.current?.focus();
  }
  async function copyOffered() {
    if (!copyOffer) return;
    const ok = await writeClipboard(copyOffer.text);
    if (ok) { setCopyOffer(null); setCopied(true); termRef.current?.focus(); } else setCopyOffer({ ...copyOffer, failed: true });
  }
  function toBottom() {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(encodeBottom());
    setScrolledUp(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0e14] text-[#e6edf3]" role="dialog" aria-label={`Terminal ${title}`}>
      <div className="flex items-center gap-2 border-b border-[#1c2230] px-3.5 py-2.5">
        <span className="font-semibold">{title}</span>
        {!startUnlocked && <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide",
            granted ? "bg-[#1f3a24] text-[#79d88b]" : "bg-[#26303f] text-[#9fb0c3]",
          )}
        >
          {granted ? "control taken" : "read-only"}
        </span>}
        {headerExtra}
        <span className="flex-1" />
        {copied && <span role="status" className="text-xs text-[#79d88b]">Copied to clipboard</span>}
        {uploadMsg && <span role={uploadMsg.error ? "alert" : "status"} className={cn("max-w-[40ch] truncate text-xs", uploadMsg.error ? "text-[#ff7b72]" : "text-[#9fb0c3]")} title={uploadMsg.text}>{uploadMsg.text}</span>}
        <span className="text-xs text-[#9fb0c3]">{status === "open" ? "" : status === "connecting" ? (statusLabels?.connecting ?? "connecting…") : (statusLabels?.closed ?? "disconnected")}</span>
        {!granted && (
          <Button
            variant="outline"
            size="sm"
            className="border-[#1c2230] bg-transparent text-[#e6edf3] hover:bg-[#1c2230] hover:text-[#e6edf3]"
            onClick={takeControl}
            disabled={status !== "open"}
          >
            Take control
          </Button>
        )}
        {canUpload && granted && (
          <>
            <input ref={fileInput} type="file" multiple hidden aria-label="Upload file to the session"
              onChange={(e) => { const files = filesFrom(e.currentTarget); e.currentTarget.value = ""; void uploadFiles(files); }} />
            <Button
              variant="outline"
              size="sm"
              className="border-[#1c2230] bg-transparent text-[#e6edf3] hover:bg-[#1c2230] hover:text-[#e6edf3]"
              onClick={() => fileInput.current?.click()}
              disabled={status !== "open"}
              title="Upload a file into the session (.inbox) and paste its path — you can also paste or drop files onto the terminal"
            >
              Upload file
            </Button>
          </>
        )}
        {onClose && <Button variant="ghost" size="sm" className="text-[#9fb0c3] hover:bg-[#1c2230] hover:text-[#e6edf3]" onClick={onClose}>Close</Button>}
      </div>
      {copyOffer && (
        <div role="status" className="flex items-center gap-2 border-b border-[#1c2230] bg-[#131a26] px-3.5 py-2 text-sm">
          <span className="shrink-0 text-[#9fb0c3]">The session copied text:</span>
          <code className="min-w-0 flex-1 truncate text-[#e6edf3]" title={copyOffer.text}>{preview(copyOffer.text)}</code>
          {copyOffer.failed && <span className="shrink-0 text-xs text-[#ff7b72]">The browser blocked it — select the text and copy it by hand.</span>}
          <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => void copyOffered()}>Copy</Button>
          <Button variant="ghost" size="sm" className="text-[#9fb0c3] hover:bg-[#1c2230] hover:text-[#e6edf3]" onClick={() => setCopyOffer(null)}>Dismiss</Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div className="h-full p-1.5" ref={host} />
        {scrolledUp && (
          <button
            className="absolute bottom-3 right-4 z-10 rounded-full bg-[#1c2230] px-3.5 py-2 text-sm text-[#e6edf3] shadow-lg hover:bg-[#26303f]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toBottom}
          >
            ↓ Jump to end
          </button>
        )}
      </div>
      {granted && (
        <div className="flex flex-wrap gap-1.5 border-t border-[#1c2230] px-2.5 py-2" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}>
          {KEY_BAR.map((k) => (
            <button
              key={k}
              className="min-h-10 min-w-11 rounded-lg border-0 bg-[#1c2230] font-sans text-[#e6edf3] hover:bg-[#26303f]"
              onMouseDown={(e) => { e.preventDefault(); sendKey(k); }}
            >
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
