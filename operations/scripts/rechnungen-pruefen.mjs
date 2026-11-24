#!/usr/bin/env node
/**
 * Rechnungspruefer im Probebetrieb (Benutzer 24.11.2026, Werkbank w-414): Warenrechnungen aus dem
 * Rechnungsarchiv (belege:monat) gegen die Auftragsbestaetigung desselben Lieferantenauftrags.
 *
 *   npm run -s rechnungen:pruefen -- --monat 2026-11              # Probelauf: prueft, schreibt nichts
 *   npm run -s rechnungen:pruefen -- --monat 2026-11 --schreiben  # legt die Ergebnisse ab
 *
 * Laeuft freitags nach `belege:monat --schreiben` mit (Dienst net.teppich-paradies.sammeldatei), nur fuer
 * neue Rechnungen und solche, die in den letzten 14 Tagen nicht pruefbar waren (die AB kann spaeter kommen).
 * AB-Texte kommen nur lesend aus dem Postfach (wie bei den Lieferbelegen) und werden nie gespeichert.
 * Ergebnis: $TP_PRIVAT_DIR/rechnungspruefung/ergebnisse.json - das Control Center zeigt es (Heute, Laden).
 * Mail an verkauf@ nur mit einstellungen.json "mailAnVerkauf": true; eingeschaltet wird das erst nach
 * ausdruecklichem Ja des Benutzers. Nie eine Mail an Lieferanten. Die Ausgabe nennt nur Zahlen.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { belegeOrdner, monatsGrenzen } from '../lib/belege.mjs';
import { leseBelege, lieferbelegePfad } from '../lib/lieferbelege.mjs';
import { pruefeRechnung, abNummern, nummerImText, leseErgebnisse, leseEinstellungen, ergebnissePfad, einstellungenPfad } from '../lib/rechnungspruefung.mjs';
import { lesePostfach, postfachPfad } from '../lib/nachfass-versand.mjs';
import { sendeMail } from '../lib/smtp.mjs';
import { pdfAnalyse } from './belege-monat.mjs';
import { pdfTexte, lieferantenDomains } from './lieferbelege.mjs';
import { rechnungMail } from '../../docs/ai-dashboard/lib/rechnungspruefung.mjs';

const TAG_MS = 86400000;
/** So lange vor der Rechnung darf die AB liegen. */
const AB_FENSTER_TAGE = 150;
/** So lange wird eine nicht pruefbare Rechnung erneut versucht. */
const NOCHMAL_TAGE = 14;
const LAEUFE_MAX = 60;

const jsonLesen = (p, ersatz) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return ersatz; } };

/**
 * @param {object} o
 * @param {Function} o.texte  (offen, optionen) => { mailId: [PDF-Text] } | null - in Tests ersetzbar
 * @returns Zahlen fuer die Ausgabe (keine Namen, keine Nummern)
 */
export async function rechnungenPruefen({ privatDir, monat, schreiben = false, jetzt = new Date(), analyse = pdfAnalyse, texte = pdfTexte, senden = sendeMail } = {}) {
  const privat = privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
  const g = monatsGrenzen(monat);
  const ordner = path.join(belegeOrdner(privat), g.jahr, g.mm);
  const manifest = jsonLesen(path.join(ordner, 'manifest.json'), null);
  if (!manifest) return { monat, geprueft: 0, hinweis: 'kein Archiv fuer diesen Monat' };
  const einst = leseEinstellungen(einstellungenPfad(privat));
  const ablage = leseErgebnisse(ergebnissePfad(privat));
  const abAlle = Object.values(leseBelege(lieferbelegePfad(privat)).belege).filter(b => b.art === 'ab');

  // Warenlieferant: schickt ABs per Mail, steht in den Stammdaten oder ist in den Einstellungen genannt.
  const waren = new Set([...abAlle.map(b => b.domain), ...lieferantenDomains(privat), ...Object.keys(einst.warenlieferanten)]);
  const faellig = (manifest.belege || []).filter((b) => {
    if (b.rolle !== 'rechnung' || b.art !== 'rechnung' || b.format !== 'pdf' || b.dublette || b.nichtMehrGefunden || !waren.has(b.anbieterSchluessel)) return false;
    const alt = ablage.rechnungen[b.sha256];
    return !alt || (alt.ergebnis === 'nicht_pruefbar' && jetzt.getTime() - Date.parse(b.datum) <= NOCHMAL_TAGE * TAG_MS);
  });

  const lesen = faellig.map((b) => {
    const text = analyse(fs.readFileSync(path.join(ordner, b.datei)))?.text || '';
    const xml = b.xmlDatei ? fs.readFileSync(path.join(ordner, b.xmlDatei), 'utf8') : null;
    const suchtext = `${text}\n${String(xml || '').replace(/<[^>]+>/g, ' ')}`;
    const abDomain = einst.warenlieferanten[b.anbieterSchluessel] || b.anbieterSchluessel;
    const t = Date.parse(b.datum);
    // Vorauswahl ohne Postfach: ABs dieses Lieferanten im Zeitfenster, deren Nummer aus Betreff/Dateiname in der
    // Rechnung steht - oder die (noch) keine Nummer haben. Nur diese werden geholt.
    const kandidaten = abAlle.filter((ab) => {
      if (ab.domain !== abDomain || Date.parse(ab.datum) > t + TAG_MS || Date.parse(ab.datum) < t - AB_FENSTER_TAGE * TAG_MS) return false;
      const n = abNummern({ belegnummer: ab.refs?.belegnummer, anhaenge: ab.anhaenge });
      return !n.length || n.some(x => nummerImText(x, suchtext));
    });
    return { b, text, xml, kandidaten };
  });

  const offen = [...new Map(lesen.flatMap(x => x.kandidaten).map(ab => [ab.id, { id: ab.id, von: ab.von }])).values()];
  const abTexte = offen.length ? await texte(offen, { privatDir: privat, analyse, zeitraum: `${AB_FENSTER_TAGE + 30}d` }) : {};
  if (!abTexte) return { monat, geprueft: 0, faellig: faellig.length, fehler: 'kein Postfach-Zugang' };

  const neu = {};
  for (const { b, text, xml, kandidaten } of lesen) {
    const abs = kandidaten.map((ab) => {
      const t = (abTexte[ab.id] || []).filter(Boolean);
      return { id: ab.id, datum: ab.datum, texte: t, nummern: abNummern({ belegnummer: ab.refs?.belegnummer, anhaenge: ab.anhaenge, texte: t }) };
    });
    const e = pruefeRechnung({ xml, text, brutto: b.brutto }, abs);
    neu[b.sha256] = {
      schluessel: b.sha256.slice(0, 16), monat, datei: b.datei, anbieter: b.anbieter, anbieterSchluessel: b.anbieterSchluessel,
      eingang: b.datum, nummer: b.rechnungsnummer, brutto: b.brutto, mailId: b.mailId,
      ...e, geprueftAm: jetzt.toISOString(), gemeldetAm: ablage.rechnungen[b.sha256]?.gemeldetAm ?? null,
    };
  }

  const zahlen = { monat, faellig: faellig.length, geprueft: Object.keys(neu).length, abGeholt: Object.keys(abTexte).length, passt: 0, abweichung: 0, nicht_pruefbar: 0 };
  for (const e of Object.values(neu)) zahlen[e.ergebnis] += 1;

  // Mail an verkauf@ nur mit eingeschaltetem Schalter und nur einmal je Rechnung.
  let gemeldet = 0;
  if (schreiben && einst.mailAnVerkauf && einst.verkaufAn) {
    const pf = lesePostfach(postfachPfad(privat));
    for (const e of Object.values(neu).filter(x => x.ergebnis === 'abweichung' && !x.gemeldetAm)) {
      if (!pf.zugang) break;
      const m = rechnungMail(e);
      await senden(pf.zugang, { von: { name: pf.zugang.absenderName, adresse: pf.zugang.absender }, an: [einst.verkaufAn], betreff: m.betreff, text: m.text });
      e.gemeldetAm = jetzt.toISOString();
      gemeldet += 1;
    }
  }
  if (!schreiben) return zahlen;

  const pfad = ergebnissePfad(privat);
  fs.mkdirSync(path.dirname(pfad), { recursive: true, mode: 0o700 });
  const daten = {
    version: 1, rechnungen: { ...ablage.rechnungen, ...neu },
    laeufe: [...ablage.laeufe, { am: jetzt.toISOString(), ...zahlen, gemeldet }].slice(-LAEUFE_MAX),
  };
  const temp = `${pfad}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(daten, null, 1)}\n`, { mode: 0o600 });
  fs.renameSync(temp, pfad);
  return { ...zahlen, gemeldet };
}

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const monat = argWert(args, '--monat');
  if (!monat) {
    console.error('Aufruf: rechnungen:pruefen -- --monat JJJJ-MM [--schreiben]');
    process.exit(2);
  }
  rechnungenPruefen({ monat, schreiben: args.includes('--schreiben') })
    .then(e => console.log(JSON.stringify(e)))
    .catch((e) => { console.error(String(e?.message || e)); process.exitCode = 1; });
}
