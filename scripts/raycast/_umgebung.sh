#!/usr/bin/env bash
# Gemeinsame Umgebung fuer die Raycast-Skriptbefehle.
# Raycast startet Skripte mit knappem PATH und ohne Shell-Profil: Homebrew-Pfade
# ergaenzen und das Repository relativ zu diesem Ordner finden.
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"
TP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${TP_ROOT}" || exit 1
command -v npm >/dev/null || { echo "npm nicht gefunden (PATH: ${PATH})"; exit 1; }
