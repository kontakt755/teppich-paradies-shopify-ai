/**
 * macOS-Mitteilung fuer die Mac-Dienste (Routinen, Shop-Wache). Der Text geht als Argument,
 * nie in den AppleScript-Quelltext. Scheitert sie (kein Mac, keine Sitzung), bleibt es still:
 * die Warnung steht dann weiter im Control Center.
 */
import { execFileSync } from 'node:child_process';

export function mitteilung(titel, text, { ausfuehren = execFileSync } = {}) {
  try {
    ausfuehren('osascript', [
      '-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title "Teppich Paradies – Mac-Dienst" subtitle (item 1 of argv)', '-e', 'end run',
      String(titel).slice(0, 80), String(text).slice(0, 220),
    ], { stdio: 'ignore', timeout: 10_000 });
  } catch { /* ohne Mitteilung bleibt das To-do im Control Center */ }
}
