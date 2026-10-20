// Nur vom Pruefwerkzeug gekennzeichnete Ordner gehoeren zur automatischen Bereinigung.
// Name und Alter allein beweisen weder Besitz noch das Ende eines laufenden Prozesses.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DATEI = '.tp-dashboard-temp.json';

export function besitzLesen(ordner, art) {
  try {
    const st = fs.lstatSync(ordner);
    const datei = path.join(ordner, DATEI);
    if (!st.isDirectory() || !fs.lstatSync(datei).isFile()) return null;
    const b = JSON.parse(fs.readFileSync(datei, 'utf8'));
    return b.version === 1 && b.art === art && b.dev === st.dev && b.ino === st.ino
      && Number.isInteger(b.pid) && b.pid > 0 && Number.isFinite(b.angelegt)
      ? b : null;
  } catch { return null; }
}

export function besitzSetzen(ordner, art, { pid = process.pid, jetzt = Date.now() } = {}) {
  const st = fs.lstatSync(ordner);
  const alt = besitzLesen(ordner, art);
  // Erst anlegen, bei Uebergabe nur eine gueltige eigene Kennung ersetzen; nie Links folgen.
  const datei = path.join(ordner, DATEI);
  if (!alt && fs.existsSync(datei)) throw new Error('Ungueltige Temp-Besitzkennung');
  fs.writeFileSync(datei, JSON.stringify({ version: 1, art, dev: st.dev, ino: st.ino,
    pid, angelegt: alt?.angelegt ?? jetzt }), { mode: 0o600, flag: alt ? 'w' : 'wx' });
}

export function prozessLebt(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code !== 'ESRCH'; } // Unbekannt oder keine Rechte: erhalten.
}

// Ein Prozess kann den Ordner als cwd oder ueber offene Dateien nutzen, ohne ihn in
// Argumenten/Umgebung zu nennen. Bei fehlender/unklarer Auskunft nichts entfernen.
export function ordnerBenutzt(ordner) {
  if (process.platform === 'win32') return null;
  const r = spawnSync('lsof', ['-t', '+D', fs.realpathSync(ordner)], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  if (r.stdout?.trim()) return true;
  if (r.error || r.signal || r.stderr?.trim()) return null;
  if (r.status === 0) return true;
  return r.status === 1 ? false : null;
}
