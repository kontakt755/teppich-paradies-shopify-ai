/**
 * Bearbeitete Fassung eines Fotos einsetzen (Inhaberentscheidung 01.10.2026).
 *
 * Die Redaktion laesst ausgewaehlte Fotos per KI aufwerten ("cinematic": helles
 * Licht, aufgeraeumt) und setzt das Ergebnis hier ein. Das Original bleibt auf
 * der Platte liegen; das Medium zeigt danach auf die Fassung unter
 * `bearbeitet/`, die Werkstatt rendert ab dann mit ihr.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { erkenneTyp } from './eingang.mjs';
import { socialDir } from './pfade.mjs';

export class BearbeitungFehler extends Error {}

export function ersetzeBild(db, mediumId, datei, { dir = socialDir(), von = 'redaktion', wandle = (q, z) => execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', q, '--out', z], { stdio: 'ignore' }) } = {}) {
  const m = db.medium(Number(mediumId));
  if (!m) throw new BearbeitungFehler(`Medium ${mediumId} gibt es nicht`);
  if (m.art !== 'bild') throw new BearbeitungFehler('Nur Fotos lassen sich ersetzen');
  if (m.datenschutz === 'bedenken') throw new BearbeitungFehler('Bild hat Datenschutz-Bedenken – eine Bearbeitung hebt sie nicht auf');
  if (!fs.existsSync(datei)) throw new BearbeitungFehler(`Datei ${datei} fehlt`);
  const kopf = Buffer.alloc(16);
  const fd = fs.openSync(datei, 'r');
  try { fs.readSync(fd, kopf, 0, 16, 0); } finally { fs.closeSync(fd); }
  const typ = erkenneTyp(kopf);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(typ)) throw new BearbeitungFehler('Nur JPG, PNG oder WebP');
  const rel = path.join('bearbeitet', `${m.inhalt_id}-${m.id}.jpg`);
  const ziel = path.join(dir, rel);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  if (typ === 'image/jpeg') fs.copyFileSync(datei, ziel); else wandle(datei, ziel);
  db.mediumAendern(m.id, { pfad: rel });
  db.ereignis(von, 'bild-bearbeitet', `medium:${m.id}`, { vorher: m.pfad ?? m.url, nachher: rel });
  return db.medium(m.id);
}
