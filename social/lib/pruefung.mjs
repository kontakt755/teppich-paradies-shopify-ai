/**
 * Baustellen-Agent, technischer Teil: neue Uploads pruefen und einsortieren.
 *
 * Laeuft nach jedem Upload und zusaetzlich per Zeitplan. Macht aus NEU ->
 * IN_PRUEFUNG: HEIC wird zu JPEG, jedes Bild gemessen, Unbrauchbares und
 * Dubletten markiert. Was danach uebrig ist, sichtet die Redaktion inhaltlich.
 */

import fs from 'node:fs';
import path from 'node:path';
import { bewerte, findeDubletten, messe as messeBild, zuJpeg as wandleZuJpeg } from './bildpruefung.mjs';
import { medienPfad, socialDir } from './pfade.mjs';
import { INHALT_STATUS } from './status.mjs';

/**
 * @param nur            nur diese eine Baustelle (direkt nach ihrem Upload)
 * @param mindestAlterMs Baustellen juenger als das bleiben liegen - der Takt
 *                       darf keinen Upload pruefen, der noch laeuft
 */
export function verarbeiteEingang(db, { dir = socialDir(), messe = messeBild, zuJpeg = wandleZuJpeg, nur = null, mindestAlterMs = 0, jetzt = new Date() } = {}) {
  const bericht = [];
  // Auch IN_PRUEFUNG: kommt eine Datei nach, waehrend die Baustelle schon geprueft ist, darf sie nicht liegen bleiben.
  const kandidaten = db.inhalte({ status: [INHALT_STATUS.NEU, INHALT_STATUS.IN_PRUEFUNG], quelle: 'baustelle' })
    .filter(i => (nur ? i.id === nur : mindestAlterMs <= 0 || jetzt.getTime() - new Date(i.erstellt).getTime() >= mindestAlterMs))
    .filter(i => i.status === INHALT_STATUS.NEU || db.medien(i.id).some(m => m.pruefung === 'offen'))
    // Aelteste zuerst: bei zwei gleichen Bildern gilt das frueher eingegangene als Original.
    .sort((a, b) => a.id - b.id);
  for (const inhalt of kandidaten) {
    const medien = db.medien(inhalt.id);
    const gemessen = [];
    for (const m of medien) {
      if (m.pruefung !== 'offen') continue;
      if (m.art === 'video') {
        // Videos koennen hier nicht technisch beurteilt werden - sie gehen in die Sichtung.
        db.mediumAendern(m.id, { pruefung: 'unsicher', pruef_grund: 'Video – bitte ansehen' });
        continue;
      }
      try {
        let datei = medienPfad(m.pfad, dir);
        if (!/\.jpe?g$/i.test(datei)) {
          // Original bleibt liegen; gearbeitet wird mit der JPEG-Fassung.
          const ziel = path.join(path.dirname(path.dirname(datei)), 'arbeit', `${path.basename(datei, path.extname(datei))}.jpg`);
          fs.mkdirSync(path.dirname(ziel), { recursive: true });
          zuJpeg(datei, ziel);
          datei = ziel;
        }
        const wert = messe(datei);
        const { urteil, gruende } = bewerte(wert);
        const neu = db.mediumAendern(m.id, {
          pfad: path.relative(dir, datei), breite: wert.breite, hoehe: wert.hoehe,
          helligkeit: wert.helligkeit, schaerfe: wert.schaerfe, dhash: wert.dhash,
          pruefung: urteil, pruef_grund: gruende.join(', ') || null,
        });
        if (urteil !== 'aussortiert') gemessen.push(neu);
      } catch (e) {
        db.mediumAendern(m.id, { pruefung: 'aussortiert', pruef_grund: `nicht lesbar: ${String(e.message).split('\n')[0].slice(0, 120)}` });
      }
    }
    // Dubletten: innerhalb der Baustelle und gegen alles, was schon im Bestand ist.
    const bekannt = db.bekannteHashes().filter(b => b.inhalt_id !== inhalt.id);
    for (const [id, original] of findeDubletten(gemessen, bekannt)) {
      db.mediumAendern(id, { pruefung: 'dublette', pruef_grund: `gleiches Bild wie Medium ${original}` });
    }
    const stand = db.medien(inhalt.id);
    const brauchbar = stand.filter(m => ['ok', 'unsicher'].includes(m.pruefung));
    if (!brauchbar.length) {
      db.inhaltAendern(inhalt.id, { status: INHALT_STATUS.VERWORFEN, notiz: stand.length ? 'Kein brauchbares Bild: alle Aufnahmen zu klein, zu dunkel, unscharf oder doppelt.' : 'Upload ohne Dateien.' });
    } else if (inhalt.status === INHALT_STATUS.NEU) {
      db.inhaltAendern(inhalt.id, { status: INHALT_STATUS.IN_PRUEFUNG });
    }
    db.ereignis('eingang', 'baustelle-geprueft', `inhalt:${inhalt.id}`, { brauchbar: brauchbar.length, gesamt: stand.length });
    bericht.push({ inhalt: inhalt.id, titel: inhalt.titel, gesamt: stand.length, brauchbar: brauchbar.length, aussortiert: stand.filter(m => m.pruefung === 'aussortiert').length, dubletten: stand.filter(m => m.pruefung === 'dublette').length });
  }
  return bericht;
}
