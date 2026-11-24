#!/usr/bin/env python3
"""Startet ein Programm mit der Erlaubnis, Online-Platzhalter (Dropbox "nur online") nachzuladen.

launchd-Dienste duerfen unter macOS keine "dataless" Dateien herunterladen: Lesen scheitert mit
EDEADLK (Node: "Unknown system error -11"), auch mit ProcessType Standard (Probe 24.11.2026).
setiopolicy_np gilt fuer den Prozess und bleibt ueber exec erhalten, also: Richtlinie setzen,
dann das eigentliche Programm (node ...) an seine Stelle setzen.

  /usr/bin/python3 dataless-erlauben.py /opt/homebrew/bin/node skript.mjs
"""
import ctypes
import os
import sys

# <sys/resource.h>: IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_PROCESS, ..._ON
if ctypes.CDLL(None, use_errno=True).setiopolicy_np(3, 0, 2) != 0:
    # Ohne Erlaubnis trotzdem starten: der Dienst meldet nicht lesbare Dateien selbst.
    print(f"dataless-erlauben: setiopolicy_np fehlgeschlagen (errno {ctypes.get_errno()})", file=sys.stderr)
os.execv(sys.argv[1], sys.argv[1:])
