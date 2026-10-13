/** Nur Zeit-/Erfolgsmetadaten der bestehenden Sicherung und Werkbank-Bruecke. */
import fs from 'node:fs';
import path from 'node:path';

function stand(datei, feld, jetzt, maxStunden) {
  let roh;
  try { roh = JSON.parse(fs.readFileSync(datei, 'utf8')); }
  catch (e) { return { status: e.code === 'ENOENT' ? 'unbekannt' : 'fehler', letzterErfolg: null }; }
  const iso = roh?.[feld];
  const zeit = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(zeit) || zeit > jetzt.getTime() + 300000) return { status: 'unbekannt', letzterErfolg: null };
  return { status: jetzt.getTime() - zeit > maxStunden * 3600000 ? 'alt' : 'ok', letzterErfolg: new Date(zeit).toISOString() };
}
export function betriebszustand(dir, { jetzt = new Date() } = {}) {
  const lokal = stand(path.join(dir, 'fehlermeldungen-abgleich.json'), 'aktualisiertAm', jetzt, 48);
  return {
    sicherung: stand(path.join(dir, 'sicherungsstand.json'), 'letzterErfolg', jetzt, 48),
    // aktualisiertAm belegt nur einen lokalen Rueckmeldungs-Schreibvorgang, auch per CLI.
    // Unveraenderte/fallweise unvollstaendige Einleselaeufe und Cloud-Schreibrechte sind damit nicht belegt.
    werkbank: { status: lokal.status === 'fehler' ? 'fehler' : 'unbekannt',
      letzteLokaleRueckmeldung: lokal.letzterErfolg, lokalerStatus: lokal.status, vollabgleich: 'unbekannt' },
  };
}
