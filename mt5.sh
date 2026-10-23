#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -ne 0 ]] || { echo 'Do not run as root.'; exit 1; }
export WINEPREFIX="${WINEPREFIX:-$HOME/.mt5}"
export DISPLAY="${DISPLAY:-:99}"
export WINEDEBUG=-all
MT5_DIR="${MT5_DIR:-$WINEPREFIX/drive_c/Program Files/MetaTrader 5}"
case "${1:-help}" in
  install)
    [[ -f downloads/mt5linux.sh ]] || { echo 'Run prepare.sh first.'; exit 1; }
    bash downloads/mt5linux.sh
    ;;
  compile)
    [[ -f "$MT5_DIR/metaeditor64.exe" ]] || { echo 'Set MT5_DIR to the installed terminal folder.'; exit 1; }
    mkdir -p "$MT5_DIR/MQL5/Experts" "$MT5_DIR/MQL5/Presets"
    cp MT5Core.mq5 TradeExecution.mqh "$MT5_DIR/MQL5/Experts/"
    src=$(winepath -w "$MT5_DIR/MQL5/Experts/MT5Core.mq5")
    log="$MT5_DIR/compile-core.log"
    [[ ! -f "$log" ]] || mv "$log" "$log.previous"
    [[ ! -f "$MT5_DIR/MQL5/Experts/MT5Core.ex5" ]] || \
      mv "$MT5_DIR/MQL5/Experts/MT5Core.ex5" "$MT5_DIR/MQL5/Experts/MT5Core.ex5.previous"
    wine "$MT5_DIR/metaeditor64.exe" /portable "/compile:$src" "/log:$(winepath -w "$log")"
    [[ -s "$MT5_DIR/MQL5/Experts/MT5Core.ex5" ]] || {
      echo "Compile did not produce EA. Inspect $log in MetaEditor."; exit 1;
    }
    echo "EA compiled. Inspect compiler log: $log"
    ;;
  login)
    [[ -f "$MT5_DIR/terminal64.exe" ]] || { echo 'Install MT5 first or set MT5_DIR.'; exit 1; }
    # Same portable data directory as run. Complete broker login in VNC, then exit MT5.
    wine "$MT5_DIR/terminal64.exe" /portable
    ;;
  run)
    [[ -f bot.ini && -f "$MT5_DIR/MQL5/Experts/MT5Core.ex5" ]] || {
      echo 'Compile EA and copy bot.ini.example to bot.ini first.'; exit 1;
    }
    chmod 600 bot.ini
    # A second wrapper instance must not start from this package directory.
    exec 9>.bot.lock
    flock -n 9 || { echo 'Bot already running.'; exit 1; }
    wine "$MT5_DIR/terminal64.exe" /portable "/config:$(winepath -w "$PWD/bot.ini")"
    ;;
  logs)
    echo "EA journals: $MT5_DIR/MQL5/Logs"
    echo "Terminal journals: $MT5_DIR/Logs"
    echo 'Open the latest daily log in VNC or use iconv -f UTF-16LE -t UTF-8 FILE.'
    ;;
  *) echo 'Usage: bash mt5.sh {install|compile|login|run|logs}' ;;
esac
