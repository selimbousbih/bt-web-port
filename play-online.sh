#!/bin/bash
# Start the existing browser build, multiplayer rooms, and a temporary public URL.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH"
for cmd in node npx cloudflared curl; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd (install Node.js and: brew install cloudflared)" >&2; exit 1; }
done
ISO="${1:-game-super.iso}"
[ -f "$ISO" ] || { echo "Missing game image: $ISO" >&2; exit 1; }
for file in index.html game.html net.js net.css bt3-jspi.js bt3-jspi.wasm bt3-async.js bt3-async.wasm; do
  [ -f "port/build/web/$file" ] || { echo "Missing browser build: $file" >&2; exit 1; }
done
# Check all ports before starting anything, so an existing session is never replaced.
node --input-type=module <<'JS'
import net from 'node:net';
for (const port of [4700, 4701, 4702]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the existing server first.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
JS
mkdir -p port/build/tunnel
umask 077
KEY=$(node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const config = 'port/build/tunnel/wrangler.json';
let key;
try { key = JSON.parse(fs.readFileSync(config, 'utf8')).vars.BT3_KEY; } catch {}
if (!key || !/^[\w-]+$/.test(key)) key = crypto.randomBytes(24).toString('base64url');
fs.writeFileSync(config, JSON.stringify({
  name: 'bt3-super-roster', main: path.resolve('cloudflare/src/local.js'), compatibility_date: '2026-10-01',
  vars: {BT3_KEY: key}, durable_objects: {bindings: [{name: 'ROOMS', class_name: 'Room'}]},
  migrations: [{tag: 'v1', new_sqlite_classes: ['Room']}], dev: {ip: '127.0.0.1', port: 4701}
}, null, 2));
console.log(key);
JS
)
PIDS=()
stop_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do stop_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do stop_tree "$pid"; done
  wait 2>/dev/null || true
  echo "Server and tunnel stopped."
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node port/web/serve.mjs 4700 "$ISO" >port/build/tunnel/server.log 2>&1 & PIDS+=("$!")
npx --yes wrangler@4.151.1 dev --config port/build/tunnel/wrangler.json --local --log-level warn >port/build/tunnel/rooms.log 2>&1 & PIDS+=("$!")
node port/web/tunnel_proxy.mjs >port/build/tunnel/proxy.log 2>&1 & PIDS+=("$!")
echo "Starting game and multiplayer server..."
ready=0
for ((i=0; i<90; i++)); do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || { echo "Startup failed. See port/build/tunnel/*.log" >&2; exit 1; }
  done
  if curl --silent --fail --max-time 2 "http://127.0.0.1:4702/?k=$KEY" -o /dev/null; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "Server startup timed out. See port/build/tunnel/*.log" >&2; exit 1; }
cloudflared tunnel --url http://127.0.0.1:4702 --no-autoupdate >port/build/tunnel/cloudflare.log 2>&1 & PIDS+=("$!")
URL=""
for ((i=0; i<60; i++)); do
  URL=$(sed -nE 's/.*(https:\/\/[a-z0-9-]+\.trycloudflare\.com).*/\1/p' port/build/tunnel/cloudflare.log | head -1)
  [ -z "$URL" ] || break
  kill -0 "${PIDS[3]}" 2>/dev/null || { cat port/build/tunnel/cloudflare.log >&2; exit 1; }
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel startup timed out. See port/build/tunnel/cloudflare.log" >&2; exit 1; }
printf '\nPlay on this Mac:\nhttp://127.0.0.1:4702/?k=%s\n' "$KEY"
echo "Checking the public link (DNS may take a moment)..."
public_ready=0
for ((i=0; i<6; i++)); do
  kill -0 "${PIDS[3]}" 2>/dev/null || { echo "Tunnel stopped. See port/build/tunnel/cloudflare.log" >&2; exit 1; }
  if curl --silent --show-error --fail --max-time 5 "$URL/?k=$KEY" -o /dev/null 2>port/build/tunnel/public-check.log; then
    public_ready=1
    break
  fi
  sleep 2
done
if [ "$public_ready" = 0 ]; then
  if grep -q 'Could not resolve host' port/build/tunnel/public-check.log; then
    echo "Your DNS cannot resolve the tunnel hostname yet. Use the local link on this Mac."
    echo "If the public link stays unreachable, try a different DNS resolver (for example 1.1.1.1)."
  else
    echo "Public link is not responding yet. See port/build/tunnel/public-check.log."
  fi
fi
printf '\nShare this link with your friend:\n%s/?k=%s\n\n' "$URL" "$KEY"
echo "Choose Dragon Net Battle, then Host / Join a Match."
echo "Keep this terminal and your Mac awake. Press Ctrl+C to stop everything."
while true; do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || { echo "A server process stopped. See port/build/tunnel/*.log" >&2; exit 1; }
  done
  sleep 2
done
