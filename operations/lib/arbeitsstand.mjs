/** Lokale Arbeitsaenderungen erkennen, ohne Inhalte oder Dateipfade an den Browser zu geben. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const QUELLEN = [
  ['Auftragsstand', 'auftragsstatus.json'], ['Packstation', 'muster-packen.json'],
  ['Bestellmarken', 'bestellmarken.json'], ['Musterherkunft', 'musterherkunft.json'],
  ['Musterlager', 'musterlager.json'], ['Lieferantenbelege', 'lieferbelege/belege.json'],
  ['Auftragsverlauf', 'auftragsverlauf.json'], ['Kundentermine', 'bestelluebersicht/kundentermine.json'],
  ['Lieferantenangaben', 'lieferanten/stammdaten.json'],
];

/** Stat-Metadaten erfassen auch atomare Renames und den Laufvermerk der Belegablage. */
export function arbeitsstand(dir, { stat = fs.statSync } = {}) {
  const hash = createHash('sha256');
  const fehler = [];
  for (const [quelle, relativ] of QUELLEN) {
    hash.update(`${quelle}:`);
    try {
      const s = stat(path.join(dir, relativ), { bigint: true });
      if (!s.isFile()) throw Object.assign(new Error(), { code: 'KEINE_DATEI' });
      hash.update([s.size, s.mtimeNs ?? s.mtimeMs, s.ctimeNs ?? s.ctimeMs, s.ino, s.dev].map(String).join(':'));
    } catch (e) {
      const fehlerCode = e && e.code;
      if (fehlerCode === 'ENOENT') hash.update('fehlt');
      else {
        let code = 'LESEFEHLER';
        if (/^[A-Z_]+$/.test(fehlerCode || '')) code = fehlerCode;
        fehler.push({ quelle, code });
      }
    }
    hash.update('\n');
  }
  if (fehler.length) return { verfuegbar: false, kennung: null,
    hinweis: 'Der lokale Arbeitsstand konnte nicht geprüft werden.', fehler };
  return { verfuegbar: true, kennung: hash.digest('hex') };
}
