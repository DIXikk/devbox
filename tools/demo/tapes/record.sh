#!/usr/bin/env bash
# Records the CLI GIFs with charmbracelet/vhs against a fresh demo devd per tape.
# Usage (from anywhere): bash tools/demo/tapes/record.sh [ls|open ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export DEMO_PORT="${DEMO_PORT:-4399}"
# Fresh HOME: the CLI must not read a real ~/.config/devbox-cli (ssh host, recents).
DEMO_HOME="$(mktemp -d)"
export DEMO_HOME
trap 'rm -rf "$DEMO_HOME"' EXIT
# After "Session … running." the CLI attaches via `docker exec` (or ssh). A stub `docker`
# that just waits keeps that step silent; the tape hides the frame before Ctrl+C.
mkdir -p "$DEMO_HOME/bin"
printf '#!/bin/sh\nexec sleep 600\n' > "$DEMO_HOME/bin/docker"
chmod +x "$DEMO_HOME/bin/docker"
tapes=("$@")
[ ${#tapes[@]} -eq 0 ] && tapes=(ls open)
for t in "${tapes[@]}"; do
  bun run tools/demo/server.ts --port "$DEMO_PORT" >/dev/null 2>&1 &
  pid=$!
  for _ in $(seq 50); do curl -sf "http://127.0.0.1:$DEMO_PORT/api/health" >/dev/null && break; sleep 0.1; done
  vhs "tools/demo/tapes/$t.tape" || { kill "$pid"; exit 1; }
  kill "$pid"; wait "$pid" 2>/dev/null || true
done
ls -lh docs/assets/cli-*.gif
