#!/bin/zsh
set -eu
cd "$(dirname "$0")"
WORLD_NODE="$(command -v node 2>/dev/null || true)"
if [[ -z "$WORLD_NODE" ]]; then
  WORLD_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$WORLD_NODE" ]]; then
  echo '未找到 Node.js。请安装 Node.js 20 或更新版本后再打开。'
  read -r '?按回车关闭'
  exit 1
fi
if [[ -x node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ]]; then
  exec node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
fi
"$WORLD_NODE" server.cjs &
WORLD_PID=$!
trap 'kill "$WORLD_PID" 2>/dev/null || true' EXIT INT TERM
open 'http://localhost:4177'
wait "$WORLD_PID"
