/**
 * Warnt, wenn dieses Repository unter einem dateibasiert synchronisierten
 * Ordner liegt (iCloud Drive, Dropbox, OneDrive, Google Drive). Diese Dienste
 * sperren Dateien waehrend der Synchronisation und kollidieren mit Gits
 * eigenen Sperren - am 2026-09-04 fuehrte das zu minutenlangen Haengern bei
 * gewoehnlichen `git status`/`git commit`-Aufrufen und am Ende zu einer
 * beschaedigten Git-Objektdatenbank in einem Checkout unter ~/Documents.
 *
 * Git-Repos gehoeren nicht in solche Ordner. GitHub selbst ist der
 * Sync-Mechanismus zwischen Rechnern, kein Dateisystem-Sync.
 */
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

// Namensbasierte Marker fangen Cloud-Dienst-Ordner ausserhalb des Standard-
// Homes ab (z.B. ein manuell verschobener Dropbox-Ordner).
const NAME_MARKERS = [
  { pattern: /icloud drive/i, label: 'iCloud Drive (Archiv-Ordner)' },
  { pattern: /mobile documents/i, label: 'iCloud Drive' },
  { pattern: /dropbox/i, label: 'Dropbox' },
  { pattern: /onedrive/i, label: 'OneDrive' },
  { pattern: /google drive/i, label: 'Google Drive' },
  { pattern: /\/library\/cloudstorage\//i, label: 'Cloud-Speicher (macOS CloudStorage)' },
];

// ~/Desktop und ~/Documents tragen den Sync-Status nicht im Namen - ob sie
// mit iCloud synchronisiert sind, ist eine Systemeinstellung ("Desktop &
// Dokumente"), die sich jederzeit unbemerkt aendern kann. Deshalb werden
// beide unabhaengig vom aktuellen Schalterzustand als Risiko behandelt.
const HOME_RISK_DIRS = ['Desktop', 'Documents'];

export function detectSyncPath(root, homeDir = os.homedir()) {
  const normalized = root.toLowerCase();
  for (const marker of NAME_MARKERS) {
    if (marker.pattern.test(normalized)) return marker.label;
  }
  const relative = path.relative(homeDir, root);
  const firstSegment = relative.split(path.sep)[0];
  if (!relative.startsWith('..') && HOME_RISK_DIRS.includes(firstSegment)) {
    return `~/${firstSegment} (kann jederzeit per "Desktop & Dokumente" mit iCloud synchronisiert werden)`;
  }
  return null;
}

function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const hit = detectSyncPath(root);

  if (hit) {
    console.error(`FEHLER: Dieses Repository liegt unter ${hit}.`);
    console.error(`  Pfad: ${root}`);
    console.error('  Git-Sperren kollidieren mit der Cloud-Synchronisation - das fuehrt zu');
    console.error('  haengenden Git-Befehlen und kann die Objektdatenbank beschaedigen.');
    console.error('  Checkout an einen nicht synchronisierten Ort verschieben, z.B. ~/Developer/.');
    process.exitCode = 1;
  } else {
    console.log(`Sync-Path-Guard: ${root} liegt nicht unter einem synchronisierten Ordner.`);
    process.exitCode = 0;
  }
}

// Nur beim Direktaufruf ausfuehren, nicht beim Import (z.B. aus Tests).
if (import.meta.url === `file://${process.argv[1]}`) main();
