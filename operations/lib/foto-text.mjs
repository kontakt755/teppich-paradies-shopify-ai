/**
 * Text auf einem Foto erkennen, lokal am Mac (Apple Vision ueber osascript): keine Cloud, kein Schluessel.
 * Das Bild liegt nur fuer die Dauer der Erkennung im Temp-Ordner. Der allererste Aufruf nach dem Start
 * laedt das Sprachmodell und kann bis zu einer Minute dauern, danach unter einer Sekunde.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKRIPT = fileURLToPath(new URL('./foto-text.jxa.js', import.meta.url));

/** @param {Buffer} bild JPEG/PNG/HEIC @returns {Promise<string>} erkannte Zeilen, durch \n getrennt */
export async function fotoText(bild, { timeoutMs = 90_000, ausfuehren = execFile } = {}) {
  if (process.platform !== 'darwin') throw new Error('Texterkennung geht nur am Mac.');
  const ordner = await mkdtemp(join(tmpdir(), 'tp-foto-'));
  try {
    const datei = join(ordner, 'foto');
    await writeFile(datei, bild);
    return await new Promise((ok, fehler) => ausfuehren('osascript', ['-l', 'JavaScript', SKRIPT, datei], { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (e, aus) => (e ? fehler(new Error('Texterkennung am Mac fehlgeschlagen')) : ok(String(aus).trim()))));
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}
