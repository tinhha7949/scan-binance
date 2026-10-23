#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -ne 0 ]] || { echo 'Do not run as root.'; exit 1; }
export DISPLAY=:99
umask 077
mkdir -p "$HOME/.vnc"
if [[ ! -f "$HOME/.vnc/mt5.pass" ]]; then
  x11vnc -storepasswd "$HOME/.vnc/mt5.pass"
fi
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
xpid=$!
opid=''
cleanup() {
  [[ -z "$opid" ]] || kill "$opid" 2>/dev/null || true
  kill "$xpid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 2
kill -0 "$xpid" || { echo 'Display :99 unavailable.'; exit 1; }
openbox &
opid=$!
# Only reachable via SSH tunnel, never bind public VNC.
x11vnc -display "$DISPLAY" -localhost -rfbport 5901 \
  -rfbauth "$HOME/.vnc/mt5.pass" -forever -shared
