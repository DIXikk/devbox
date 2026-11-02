# Working from a browser only (no Mac)

The dashboard is enough to work with devbox from any machine on the tailnet: Windows,
Linux, a Mac without the listener, or a tablet. This page lists what the browser covers
and how it differs from the Mac integration ([mac.md](mac.md)).

## Files and images into a session

Open the session's terminal in the dashboard and take control. Then either:

- **paste** a file or a screenshot (`Ctrl+V` / `⌘V` with an image or a file on the clipboard),
- **drop** one or more files onto the terminal, or
- click **Upload file** in the terminal header.

Each file is uploaded to devd (`POST /api/sessions/:id/upload`) and stored in the session's
`.inbox` (`/workspace/.inbox/<name>`, excluded from `git status`), and its path is pasted into
the prompt. Claude Code, Codex and Grok attach a pasted path the same way as a file dragged
into a local terminal. A clipboard screenshot gets a timestamped name (`img-<date>-<time>.png`).

- Limit: 25 MB per file, the same as `⌘⇧V` on the Mac.
- Plain-text pastes are not affected; they go to the terminal as before.
- Uploads are accepted only from operator addresses (loopback, the tailnet,
  `DEVD_APPROVAL_ALLOW`), the same allowlist as approvals, so a session container cannot
  write into another session's workspace. They work with a locked vault.
- InstaBox sessions are not supported (the inbox lives on the VPS).

This does not need HTTPS: paste and drop events carry files on plain `http://` too.

## Compared with the Mac integration

| | Mac with listener | Browser only |
|---|---|---|
| Image or file into the prompt | `⌘V` / `⌘⇧V` in Warp | paste, drop or **Upload file** in the dashboard terminal |
| Notifications | macOS notifications, click focuses the Warp tab | the dashboard Overview |
| `open` / `preview` from a container | opens on the Mac | not available |
