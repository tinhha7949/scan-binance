#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -ne 0 ]] || { echo 'Use a normal sudo user, not root.'; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && $(uname -m) == x86_64 ]] || {
  echo 'This starter supports Ubuntu x86_64 only.'; exit 1;
}
sudo apt-get update
sudo apt-get install -y xvfb x11vnc openbox xauth wget curl tmux
mkdir -p downloads
curl --fail --location --proto '=https' --tlsv1.2 \
  https://download.terminal.free/cdn/web/metaquotes.software.corp/mt5/mt5linux.sh \
  -o downloads/mt5linux.sh
chmod 700 downloads/mt5linux.sh
echo 'Official installer downloaded. Follow README.md: start desktop, connect VNC, then install.'
