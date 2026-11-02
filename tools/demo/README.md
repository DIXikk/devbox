# Demo devd

A small Bun server that answers the devd API with **invented** data, so the README
screenshots and GIFs can be regenerated without a real server, real repositories or
real accounts. Everything it serves is fictional: the `acme` / `labs` organisations,
`*.example.com` hostnames, IPs from 192.0.2.0/24 and 100.64.0.0/10, and numbers
generated from a fixed seed.

| File | What it does |
| --- | --- |
| `server.ts` | HTTP + WebSocket server (devd API shapes, built dashboard as static files) |
| `data.ts` | The fictional sessions, stats, hardware, approvals… |
| `terminal.ts` | Canned ANSI replay for the dashboard's web terminal |
| `capture.mjs` | Playwright screenshots of the dashboard (1440×900 @2x, dark) |
| `shots.sh` | Build dashboard → start server → capture → `pngquant` |
| `tapes/*.tape`, `tapes/record.sh` | [vhs](https://github.com/charmbracelet/vhs) recordings of the real `dev` CLI |

## Run the server

```sh
bun run --cwd dashboard build        # or: cd dashboard && bunx vite build
bun run tools/demo/server.ts         # http://127.0.0.1:4399
bun run tools/demo/server.ts --port 4400 --host 0.0.0.0   # reachable from another machine
bun run tools/demo/server.ts --dashboard path/to/dist     # serve a different build
```

- Open `http://127.0.0.1:4399/` for the dashboard.
- Point the CLI at it: `DEV_DEVD_URL=http://127.0.0.1:4399 bun cli/src/main.ts ls`.
- Point the iOS simulator at `http://<mac-ip>:4399` (start with `--host 0.0.0.0`).

Behaviour worth knowing:

- `POST /api/sessions` with `fresh: true` (or for a repo with no running session) takes
  ~7 s; meanwhile `GET /api/open-progress` walks clone (enumerate → receive → resolve,
  percent rising) → worktree → pull → container. The new session is kept in memory
  until the server restarts.
- `WS /api/sessions/:id/terminal` replays a fictional agent run on `acme/web` and keeps
  a spinner alive. Input is ignored.
- Every other mutation answers `{ ok: true }` and changes nothing; unknown `GET`s answer
  `[]` so pages render their empty states instead of crashing.

## Regenerate the assets

Requirements: Bun, `pngquant` and `vhs` (`brew install pngquant vhs`). Playwright is a
dev dependency of this folder only (`cd tools/demo && bun install`); if its pinned
Chromium is not downloaded, `capture.mjs` falls back to any
`chromium_headless_shell-*` in the Playwright cache (or `CHROMIUM_PATH`).

```sh
bash tools/demo/shots.sh                 # docs/assets/dashboard-*.png
bash tools/demo/shots.sh dashboard-stats # just one shot
bash tools/demo/tapes/record.sh          # docs/assets/cli-ls.gif, docs/assets/cli-open.gif
bash tools/demo/tapes/record.sh open     # just one tape
```

`record.sh` starts a fresh demo devd per tape, runs the CLI with a throwaway `HOME`
(so no real `~/.config/devbox-cli` is read) and puts a stub `docker` first on `PATH`,
so the attach step after "Session … running." stays silent; the tape hides the frame
before it presses Ctrl+C.

## iOS screenshots

The `docs/assets/ios-*.png` shots are taken by hand in the iOS Simulator against this
server. The app decodes strictly (Swift `Codable`), so after changing `data.ts` check
that every response still decodes, e.g. by compiling `ios/DevboxApp/Api/Models.swift`
with a tiny `main.swift` that fetches each endpoint and calls `JSONDecoder().decode`
(watch for fractional numbers in `Int` fields such as timestamps).

1. On this machine: `bun run tools/demo/server.ts --host 0.0.0.0`.
2. On `<builder>` (a Mac with Xcode): build the app for the simulator, boot a simulator,
   `xcrun simctl status_bar <udid> override --time 9:41`, and set the region to en_US
   (`xcrun simctl spawn <udid> defaults write -g AppleLocale en_US`) so numbers use a
   decimal point.
3. The demo server is plain HTTP on an IP address, which App Transport Security blocks.
   Patch a **copy** of the built `.app` only (never the project):
   `PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" Info.plist`,
   `codesign --force --sign - --preserve-metadata=entitlements DevboxApp.app`, then
   `xcrun simctl install <udid> DevboxApp.app`.
4. In the app's Settings enter `http://<mac-ip>:4399` as the tailnet address. Never
   screenshot the Settings screen (it shows that address).
5. Navigate with [axe](https://github.com/cameroncooke/AXe) (`axe tap --label Sessions
   --udid <udid>`, `axe swipe …`) and capture with
   `xcrun simctl io <udid> screenshot shot.png`: Overview, Sessions, a session detail,
   Statistics (scrolled so the hourly chart shows), Hardware, More → SSH keys and
   More → Production writes.
6. Live Activity: `xcrun simctl terminate <udid> <bundle-id>`, then
   `xcrun simctl launch <udid> <bundle-id> --live-activity-preview`, tap "Waiting for
   approval", lock twice (`axe button lock`), screenshot and crop the card
   (`ffmpeg -i lock.png -vf "crop=1206:500:0:1860" …`). If iOS asks to allow Live
   Activities, allow and retake.
7. Scale to 603 px wide (`ffmpeg -vf scale=603:-1:flags=lanczos`) and run
   `pngquant --quality 70-95`.

Before committing new assets, look at every image and grep the diff for anything that
is not demo data.
