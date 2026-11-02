#!/usr/bin/env bash
# Builds the dashboard, starts a fresh demo devd, captures the PNGs and optimises them.
# Usage (from anywhere): bash tools/demo/shots.sh [shot-name ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PORT="${DEMO_PORT:-4399}"
(cd dashboard && bunx vite build >/dev/null)
(cd tools/demo && [ -d node_modules/playwright ] || bun install)
bun run tools/demo/server.ts --port "$PORT" >/dev/null 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.1; done
(cd tools/demo && bun run capture.mjs --base "http://127.0.0.1:$PORT" "$@")
if command -v pngquant >/dev/null; then
  pngquant --force --ext .png --quality 70-90 --strip --speed 1 docs/assets/dashboard-*.png
else
  echo "pngquant not found — PNGs left unoptimised (brew install pngquant)" >&2
fi
ls -lh docs/assets/dashboard-*.png
