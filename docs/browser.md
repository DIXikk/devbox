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
- In the dashboard terminal **Ctrl+V pastes** (on Windows/Linux it would otherwise be sent to
  the session as the control character `^V`). For a literal `^V` in an editor use its
  alternative (e.g. `Ctrl+Q` in vim).
- Uploads are accepted only from operator addresses (loopback, the tailnet,
  `DEVD_APPROVAL_ALLOW`), the same allowlist as approvals, so a session container cannot
  write into another session's workspace. They work with a locked vault.
- InstaBox sessions are not supported (the inbox lives on the VPS).

This does not need HTTPS: paste and drop events carry files on plain `http://` too.

## Copying out of a session

Text copied inside a session reaches the browser clipboard over OSC 52 (`set-clipboard on`
in `image/tmux.conf`, applied to sessions created after the image is rebuilt):

- **select text with the mouse** in the terminal (tmux copies the selection on release), or
- use an agent's own copy action, e.g. **`c`** on Claude Code's "Browser didn't open? … (c to copy)".

A copy that follows your mouse selection within 2 s goes straight to the clipboard
("Copied to clipboard"). Any other copy — an agent's copy action, something the session sends on
its own, or a write the browser refuses — appears as a bar with a **Copy** button, so a session
cannot silently replace what you paste next (key presses do not count: you type into the session
all the time). Clipboard *reads* (OSC 52 queries) are never answered.

On plain `http://` the browser only allows clipboard writes right after a user action; if a write
is blocked, use the **Copy** button. Holding **Shift** while selecting makes a local xterm.js
selection that bypasses tmux, which you can copy with the browser's own copy command.

## Signing in Claude Code

**AI limits → Service connections → Claude → Sign in with Claude.** devd runs
`claude auth login` in a short-lived container over the shared `claude-home` volume and shows
the sign-in link; open it in a browser signed in to the Claude account with your subscription
(use a private window if you have several), then paste the code Claude shows you into the
dialog. Every session uses this sign-in; running Claude sessions pick it up when they start
again. **Sign in again** switches accounts. Extra accounts for automatic selection are added in
the account pool ([account-pool.md](account-pool.md)).

The sign-in routes accept only operator addresses (like approvals), so a session container
cannot replace the shared credentials. Codex, Grok and Antigravity have their own sign-in
buttons in the same list.

## Compared with the Mac integration

| | Mac with listener | Browser only |
|---|---|---|
| Image or file into the prompt | `⌘V` / `⌘⇧V` in Warp | paste, drop or **Upload file** in the dashboard terminal |
| Notifications | macOS notifications, click focuses the Warp tab | the dashboard Overview |
| Copy out of a session | Mac clipboard via the listener | browser clipboard via OSC 52 |
| Claude Code sign-in | `claude auth login` on the Mac, or in a session | **Sign in with Claude** in the dashboard |
| `open` / `preview` from a container | opens on the Mac | not available |
