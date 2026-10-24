#!/usr/bin/env node
/**
 * Fehlermeldungen aus dem Control Center fuer den Abgleich mit der Werkbank.
 *
 *   npm run -s fehler -- abgleich                         # JSON: neue Meldungen + laufende (fuer den geplanten Lauf)
 *   npm run -s fehler -- uebernommen F-003 --werkbank F-003
 *   npm run -s fehler -- behoben F-003 --ergebnis "Knopf speichert wieder (PR #123)"
 *   npm run -s fehler -- verworfen F-003 --ergebnis "Kein Fehler: Filter war gesetzt"
 *   npm run -s fehler -- liste                            # Ueberblick fuer Menschen
 *   npm run -s fehler -- zeige F-003                      # voller Text samt Technik-Angaben (zum Nachstellen)
 *   npm run -s fehler -- werkbank-stand --ordner <dir>    # Stand aus gespeicherten Werkbank-Eintraegen zuruecktragen
 *
 * Schreibt nur fehlermeldungen-abgleich.json; die Meldungen selbst legt allein
 * der Dashboard-Server an (operations/lib/fehlermeldungen.mjs). Der geplante
 * Claude-Lauf "fehlermeldungen-werkbank" ruft dieses Skript im Dienst-Checkout
 * auf und traegt die Meldungen in die Werkbank ein.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  meldungenPfad, abgleichPfad, alleMeldungen, abgleichSetzen, standAusWerkbank, statusText, bildDatei, FehlermeldungFehler,
} from '../lib/fehlermeldungen.mjs';

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

/**
 * `kuerzlichErledigt`: in den letzten drei Tagen behoben oder verworfen. Wird
 * der Eintrag in der Werkbank wieder geoeffnet, setzt der Abgleich die Meldung
 * zurueck auf "Bei der Technik" - sonst stuende sie beim Melder weiter als
 * behoben da.
 */
export function abgleichDaten(liste, jetzt = new Date(), md = meldungenPfad()) {
  const grenze = jetzt.getTime() - 3 * 86_400_000;
  return {
    neu: liste.filter(m => m.status === 'neu').reverse().map(m => ({
      id: m.id, erstelltAm: m.erstelltAm, von: m.von?.name || '', text: m.text, ort: m.ort,
      dringend: m.dringend, technik: m.technik, bilder: bildPfade(md, m),
    })),
    laufend: liste.filter(m => m.status === 'uebernommen').map(m => ({ id: m.id, werkbankId: m.werkbankId })),
    kuerzlichErledigt: liste
      .filter(m => ['behoben', 'verworfen'].includes(m.status) && new Date(m.erledigtAm).getTime() >= grenze)
      .map(m => ({ id: m.id, werkbankId: m.werkbankId, status: m.status })),
  };
}

/**
 * Liest die Werkbank-Eintraege, die der Abgleich per ArtifactData (out_dir) als
 * <ordner>/<werkbankId>.json abgelegt hat, und traegt den Stand fuer alle
 * laufenden und kuerzlich erledigten Meldungen ein. So muss der Lauf kein
 * Ergebnis abtippen oder in eine Shell-Zeile setzen. Fehlt eine Datei, steht die
 * Meldung unter `fehlt` - geloescht wird daraus nichts, der Lauf prueft nach.
 */
/** Absolute Pfade der Bildschirmfotos - der Abgleich laedt sie in den Bildspeicher der Werkbank. */
function bildPfade(md, m) {
  return (m.bilder || []).map(name => bildDatei(md, name).pfad);
}

export function werkbankStand(md, ad, ordner, jetzt = new Date()) {
  if (!ordner || !fs.existsSync(ordner)) throw new FehlermeldungFehler(`Ordner ${ordner || '(fehlt)'} gibt es nicht (--ordner)`);
  const daten = abgleichDaten(alleMeldungen(md, ad), jetzt, md);
  const zuPruefen = [...daten.laufend, ...daten.kuerzlichErledigt];
  const ergebnis = { geaendert: [], unveraendert: [], fehlt: [] };
  const aktuell = new Map(alleMeldungen(md, ad).map(m => [m.id, m]));
  for (const { id, werkbankId } of zuPruefen) {
    const datei = path.join(ordner, `${werkbankId}.json`);
    if (!fs.existsSync(datei)) { ergebnis.fehlt.push(id); continue; }
    let eintrag;
    try { eintrag = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { throw new FehlermeldungFehler(`${datei} ist kein JSON`); }
    const neu = standAusWerkbank(aktuell.get(id), eintrag);
    if (!neu) { ergebnis.unveraendert.push(id); continue; }
    abgleichSetzen(md, ad, id, { ...neu, werkbankId }, { jetzt });
    ergebnis.geaendert.push({ id, status: neu.status, werkbank: neu.werkbankStatus });
  }
  return ergebnis;
}

export function main(argv = process.argv.slice(2), { aus = console.log, fehler = console.error } = {}) {
  const [befehl, id] = argv;
  const md = meldungenPfad();
  const ad = abgleichPfad();
  try {
    if (befehl === 'abgleich') {
      aus(JSON.stringify(abgleichDaten(alleMeldungen(md, ad), new Date(), md), null, 2));
      return 0;
    }
    if (befehl === 'liste' || !befehl) {
      const liste = alleMeldungen(md, ad);
      if (!liste.length) { aus('Noch keine Fehlermeldungen.'); return 0; }
      for (const m of liste) {
        aus(`${m.id}  ${m.erstelltAm.slice(0, 16).replace('T', ' ')}  ${statusText(m).padEnd(24)} ${m.von?.name || ''}${m.dringend ? '  [dringend]' : ''}${m.bilder.length ? `  [${m.bilder.length} Bild]` : ''}`);
        aus(`       ${m.text.split('\n')[0].slice(0, 100)}`);
        if (m.ergebnis) aus(`       → ${m.ergebnis}`);
      }
      return 0;
    }
    if (befehl === 'werkbank-stand') {
      aus(JSON.stringify(werkbankStand(md, ad, argWert(argv, '--ordner'))));
      return 0;
    }
    if (befehl === 'zeige') {
      const m = alleMeldungen(md, ad).find(x => x.id === id);
      if (!m) { fehler(`Meldung ${id || '(fehlt)'} gibt es nicht`); return 1; }
      aus(JSON.stringify({ ...m, statusText: statusText(m), bilder: bildPfade(md, m) }, null, 2));
      return 0;
    }
    if (['uebernommen', 'behoben', 'verworfen'].includes(befehl)) {
      if (!id) { fehler(`Meldung fehlt: npm run -s fehler -- ${befehl} F-001 …`); return 2; }
      const ergebnis = abgleichSetzen(md, ad, id, {
        status: befehl,
        werkbankId: argWert(argv, '--werkbank'),
        ergebnis: argWert(argv, '--ergebnis') || '',
      });
      aus(JSON.stringify(ergebnis));
      return 0;
    }
    fehler(`Unbekannter Befehl „${befehl}“. Erlaubt: abgleich, werkbank-stand, liste, zeige, uebernommen, behoben, verworfen`);
    return 2;
  } catch (e) {
    if (e instanceof FehlermeldungFehler) { fehler(e.message); return 1; }
    throw e;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
