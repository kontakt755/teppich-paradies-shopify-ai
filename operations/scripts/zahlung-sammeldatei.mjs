#!/usr/bin/env node
/**
 * SEPA-Sammeldatei fuer Lieferantenrechnungen (Inhaber 10.11.2026), freitags (Benutzer 19.11.2026, LaunchAgent net.teppich-paradies.sammeldatei).
 *
 *   npm run -s zahlung:sammeldatei                # Probelauf: schreibt nur die Pruefliste
 *   npm run -s zahlung:sammeldatei -- --schreiben # schreibt Sammeldatei und merkt die Rechnungen vor
 *
 * Liest die Manifeste und XML-Rechnungen aus belege-archiv (belege:monat) und den Kontoauszug-Export
 * aus laden-entlastung-2026-11/bank-export/ (CSV, CAMT.053 oder die PDF-Umsatzuebersicht; CSV ist besser,
 * weil das PDF den Verwendungszweck kuerzt). Schreibt nur nach $TP_PRIVAT_DIR/zahlungen/.
 * Kein Bankzugang: die Datei laedt der Inhaber selbst hoch und gibt sie frei.
 *
 * zahlungen/konfiguration.json (privat, nie im Repository):
 *   { "auftraggeber": { "name": "...", "iban": "...", "bic": "..." },
 *     "lieferanten": { "<absender-domain wie im Manifest>": { "name": "...", "iban": "...", "verwendungszweck": "Kd ..." },
 *                      "<domain>": { "zahlart": "lastschrift" } } }
 *
 * zahlungen/vorgemerkt.json: Rechnungen, die schon in einer Sammeldatei stehen. Wurde eine Datei
 * nicht freigegeben, die Eintraege mit ihrem Dateinamen dort von Hand loeschen.
 * zahlungen/erledigt.json: { "<Belegdatei>": "Grund" } fuer Belege ohne Zahlung (Anschreiben, eigene Rechnung).
 * Kontoauszug: der Commerzbank-CSV-Export des eigenen Kontos wird aus ~/Downloads geholt; mehrere
 * Exporte werden zusammengefuehrt, eine Luecke zwischen ihnen sperrt die Datei.
 * Rechnungen nicht eingetragener Absender (ab PDF_AB) stehen mit Namen als UNKLAR in der Pruefliste.
 * Die Ausgabe nennt nur Zahlen.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { belegeOrdner, berlinTag, istPdf, istEigen } from '../lib/belege.mjs';
import { pdfAnalyse } from './belege-monat.mjs';
import { auszugLesen } from '../lib/belege-bank.mjs';
import { konfigPruefen, auswaehlen, painBauen, pruefliste, umsatzPdfLesen, tagPlus, mailInhalt } from '../lib/zahlung-sammeldatei.mjs';
import { lesePostfach, postfachPfad } from '../lib/nachfass-versand.mjs';
import { sendeMail } from '../lib/smtp.mjs';

const BANK_EXPORT = ['laden-entlastung-2026-11', 'bank-export'];
// Reine PDF-Rechnungen erst ab hier: aeltere sind ueber die Bank bezahlt worden, bevor es die Datei gab.
const PDF_AB = '2026-11-01';

const jsonLesen = (pfad, ersatz) => (fs.existsSync(pfad) ? JSON.parse(fs.readFileSync(pfad, 'utf8')) : ersatz);

/** Rechnungen aller archivierten Monate; XML- bzw. PDF-Text nur fuer konfigurierte Lieferanten. */
function belegeLesen(privat, lieferanten, pdf) {
  const wurzel = belegeOrdner(privat);
  const belege = [];
  const fremde = [];
  let andere = 0;
  let vorStart = 0;
  for (const jahr of fs.existsSync(wurzel) ? fs.readdirSync(wurzel).filter(n => /^\d{4}$/.test(n)) : []) {
    for (const mm of fs.readdirSync(path.join(wurzel, jahr)).filter(n => /^\d{2}$/.test(n))) {
      const ordner = path.join(wurzel, jahr, mm);
      for (const b of jsonLesen(path.join(ordner, 'manifest.json'), {}).belege || []) {
        // Auch „unklar“ eingestufte Belege: die XML entscheidet, und nichts faellt still heraus.
        if (b.nichtMehrGefunden || b.dublette || !['rechnung', 'unklar'].includes(b.rolle)) continue;
        const tag = b.rechnungsdatum || b.tag || '';
        if (!lieferanten[b.anbieterSchluessel]) {
          // Nicht eingetragene Absender ab PDF_AB mit Namen in die Pruefliste, nicht nur zaehlen (eine Paketdienst-Rechnung fehlte so am 20.11.2026).
          if (tag >= PDF_AB && b.art !== 'gutschrift' && !istEigen(`x@${b.anbieterSchluessel}`)) {
            fremde.push({ schluessel: b.anbieterSchluessel, anbieter: b.anbieter || b.anbieterSchluessel, datei: b.datei, nummer: b.rechnungsnummer || null, brutto: b.brutto ?? null, datum: tag || null });
          } else andere += 1;
          continue;
        }
        const xmlDatei = b.xmlDatei || (b.format === 'xml' ? b.datei : null);
        const pfad = xmlDatei && path.join(ordner, xmlDatei);
        const xml = pfad && fs.existsSync(pfad) ? fs.readFileSync(pfad, 'utf8') : null;
        if (!xml && !lieferanten[b.anbieterSchluessel].lastschrift && b.format === 'pdf') {
          if (tag < PDF_AB) { vorStart += 1; continue; }
          const pdfPfad = path.join(ordner, b.datei);
          const text = b.pdfLesbar && fs.existsSync(pdfPfad) ? String(pdf(fs.readFileSync(pdfPfad))?.text || '') : '';
          belege.push({ schluessel: b.anbieterSchluessel, datei: b.datei, xml: null, pdf: { text, nummer: b.rechnungsnummer || null, brutto: b.brutto ?? null, waehrung: b.waehrung || null, datum: tag || null } });
          continue;
        }
        // Fehlt in der XML das Empfaengerkonto, darf es im PDF derselben Mail stehen (nur bei Bedarf gelesen).
        const pdfPfad = b.format === 'pdf' && b.datei ? path.join(ordner, b.datei) : null;
        const pdfText = () => (pdfPfad && b.pdfLesbar && fs.existsSync(pdfPfad) ? String(pdf(fs.readFileSync(pdfPfad))?.text || '') : '');
        belege.push({ schluessel: b.anbieterSchluessel, datei: b.datei, nummer: b.rechnungsnummer || null, xml, pdfText });
      }
    }
  }
  return { belege, fremde, andere, vorStart };
}

/** Alle Exporte im Ordner. Kein Ordner, keine Datei oder keine Buchung: kein Abgleich. */
const AUSZUG_HOECHSTALTER_TAGE = 4; // Wochenende plus ein Banktag

/**
 * Commerzbank-Exporte des eigenen Kontos (Dateiname beginnt mit der IBAN) aus Downloads in den
 * Bank-Ordner kopieren, damit niemand sie von Hand verschieben muss. Gibt die Zahl neuer Dateien
 * zurueck, oder null, wenn macOS dem Dienst den Ordner nicht freigibt (dann bleibt die Hand-Ablage).
 */
export function exporteHolen(ordner, iban, downloads) {
  try {
    let neu = 0;
    for (const n of fs.readdirSync(downloads)) {
      if (!n.startsWith(`${iban}_`) || !/\.csv$/i.test(n) || fs.existsSync(path.join(ordner, n))) continue;
      fs.mkdirSync(ordner, { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(downloads, n), path.join(ordner, n));
      neu += 1;
    }
    return neu;
  } catch { return null; }
}

/**
 * Mehrere Exporte ueberlappen sich: eine Buchung zaehlt so oft, wie sie in einer einzelnen Datei
 * vorkommt, nie doppelt. Liegt zwischen zwei Exporten eine Luecke, fehlen dort vielleicht
 * Zahlungen: dann ist der Auszug nicht vollstaendig.
 */
export function exporteZusammenfuehren(jeDatei) {
  const schluessel = b => [b.datum, b.betrag, b.name, b.iban, b.zweck].join('|');
  const genommen = new Map();
  const buchungen = [];
  for (const liste of jeDatei) {
    const hier = new Map();
    for (const b of liste) {
      const k = schluessel(b);
      const n = (hier.get(k) || 0) + 1;
      hier.set(k, n);
      if (n > (genommen.get(k) || 0)) { genommen.set(k, n); buchungen.push(b); }
    }
  }
  const spannen = jeDatei.filter(l => l.length).map(l => l.map(b => b.datum).sort()).map(d => [d[0], d.at(-1)]).sort((a, b) => a[0].localeCompare(b[0]));
  let luecke = null;
  let bis = spannen[0]?.[1];
  for (const [von, ende] of spannen.slice(1)) {
    if (von > bis && !luecke) luecke = `${bis} bis ${von}`;
    if (ende > bis) bis = ende;
  }
  return { buchungen, luecke };
}

function bankLesen(privat, pdf, heute, { iban, downloads }) {
  const ordner = path.join(privat, ...BANK_EXPORT);
  const ausDownloads = downloads ? exporteHolen(ordner, iban, downloads) : 0;
  const jeDatei = [];
  let dateien = 0;
  let fehler = 0;
  let zeilenNichtLesbar = 0;
  for (const name of fs.existsSync(ordner) ? fs.readdirSync(ordner).filter(n => !n.startsWith('.')) : []) {
    try {
      const inhalt = fs.readFileSync(path.join(ordner, name));
      const r = istPdf(inhalt) ? umsatzPdfLesen(pdf(inhalt).text) : auszugLesen(inhalt);
      jeDatei.push(r.buchungen);
      // CSV: erkannte Saldo- und Summenzeilen zaehlen nicht, jede andere unlesbare Zeile sperrt.
      zeilenNichtLesbar += (r.unlesbareBuchungen ?? r.nichtLesbar) || 0;
      dateien += 1;
    } catch { fehler += 1; }
  }
  const { buchungen, luecke } = exporteZusammenfuehren(jeDatei);
  const bis = buchungen.map(b => b.datum).sort().at(-1) || null;
  // Eine ungelesene Zeile oder eine Luecke kann eine schon bezahlte Rechnung verdecken: dann nicht aktuell.
  return { moeglich: buchungen.length > 0, buchungen: buchungen.length, dateien, fehler, zeilenNichtLesbar, luecke, ausDownloads, bis, aktuell: Boolean(bis) && !zeilenNichtLesbar && !luecke && bis >= tagPlus(heute, -AUSZUG_HOECHSTALTER_TAGE), liste: buchungen.length ? buchungen : null };
}

/** @returns zahlen fuer die Ausgabe (keine Namen, keine IBAN) */
export function sammelLauf({ privat, schreiben = false, jetzt = new Date(), pdf = pdfAnalyse, downloads = null }) {
  const ordner = path.join(privat, 'zahlungen');
  const konfigPfad = path.join(ordner, 'konfiguration.json');
  if (!fs.existsSync(konfigPfad)) throw new Error(`Konfiguration fehlt: ${konfigPfad} (Aufbau steht im Kopf des Skripts)`);
  const konfig = konfigPruefen(JSON.parse(fs.readFileSync(konfigPfad, 'utf8')));
  const vorgemerktPfad = path.join(ordner, 'vorgemerkt.json');
  const vorgemerkt = jsonLesen(vorgemerktPfad, []);
  const heute = berlinTag(jetzt.toISOString());
  const { belege, fremde, andere, vorStart } = belegeLesen(privat, konfig.lieferanten, pdf);
  const abgleich = bankLesen(privat, pdf, heute, { iban: konfig.auftraggeber.iban, downloads });
  // zahlungen/erledigt.json: { "<Belegdatei>": "Grund" } fuer Belege, die keine Zahlung brauchen (Anschreiben, Anhang, eigene Rechnung).
  const erledigt = jsonLesen(path.join(ordner, 'erledigt.json'), {});
  const auswahl = auswaehlen({ belege, fremde, erledigt, konfig, buchungen: abgleich.liste, auszugAktuell: abgleich.aktuell, vorgemerkt, heute });

  // Uhrzeit im Namen: zwei Laeufe am selben Tag ueberschreiben sich nicht und haben eigene Kennungen.
  const stempel = `${heute}-${jetzt.toISOString().slice(11, 19).replace(/:/g, '')}`;
  const pain = schreiben ? painBauen({ zeilen: auswahl.zeilen, konfig, heute, kennung: `TP-${stempel.replace(/-/g, '')}` }) : null;
  const datei = pain ? `sammeldatei-${stempel}.xml` : null;
  const zahlen = auswahl.zeilen.filter(z => z.status === 'zahlen');
  const summeCent = zahlen.reduce((a, z) => a + Math.round(z.zahlbetrag * 100), 0);
  const liste = `pruefliste-${stempel}${schreiben ? '' : '-probelauf'}.csv`;

  fs.mkdirSync(ordner, { recursive: true, mode: 0o700 });
  if (pain) {
    // Erst vormerken, dann die Datei: bricht es dazwischen ab, fehlt hoechstens die Datei, nie die Vormerkung.
    const neu = [...vorgemerkt, ...zahlen.map(z => ({ schluessel: z.schluessel, nummer: z.nummer, betrag: z.zahlbetrag, datei, am: heute }))];
    const temp = `${vorgemerktPfad}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(neu, null, 1)}\n`, { mode: 0o600 });
    fs.renameSync(temp, vorgemerktPfad);
    fs.writeFileSync(path.join(ordner, datei), pain.xml, { mode: 0o600, flag: 'wx' });
  }
  fs.writeFileSync(path.join(ordner, liste), pruefliste({ auswahl, abgleich, datei, andere, vorStart, pdfAb: PDF_AB, summeCent }), { mode: 0o600 });

  const status = {};
  for (const z of auswahl.zeilen) status[z.status] = (status[z.status] || 0) + 1;
  return {
    lauf: heute, naechsterLauf: auswahl.naechster, schreiben, bezahltAbgleich: abgleich.moeglich, auszugAktuell: abgleich.aktuell, bankDateienNichtLesbar: abgleich.fehler, bankZeilenNichtLesbar: abgleich.zeilenNichtLesbar, bankLuecke: abgleich.luecke, bankAusDownloads: abgleich.ausDownloads,
    zahlungen: zahlen.length, summe: summeCent / 100, status, andereLieferanten: andere, pdfVorStart: vorStart, ordner, pruefliste: liste, datei,
  };
}

/**
 * Pruefliste und Datei per Mail an `mailAn` aus der Konfiguration, ueber das Firmenpostfach des
 * Nachfassens. Ohne `mailAn` oder Postfach: keine Mail, nur ein Hinweis im Ergebnis.
 */
export async function laufMailen({ privat, ergebnis, senden = sendeMail }) {
  const konfig = konfigPruefen(JSON.parse(fs.readFileSync(path.join(privat, 'zahlungen', 'konfiguration.json'), 'utf8')));
  if (!konfig.mailAn) return 'keine Mail: mailAn fehlt in der Konfiguration';
  const pf = lesePostfach(postfachPfad(privat));
  if (!pf.zugang) return `keine Mail: ${pf.hinweis}`;
  const ordner = path.join(privat, 'zahlungen');
  const liste = fs.readFileSync(path.join(ordner, ergebnis.pruefliste));
  const { betreff, text } = mailInhalt(liste.toString('utf8'), { lauf: ergebnis.lauf, datei: ergebnis.datei, zahlungen: ergebnis.zahlungen, summe: ergebnis.summe });
  const anhaenge = [{ name: ergebnis.pruefliste, typ: 'text/csv', inhalt: liste }];
  if (ergebnis.datei) anhaenge.unshift({ name: ergebnis.datei, typ: 'application/xml', inhalt: fs.readFileSync(path.join(ordner, ergebnis.datei)) });
  await senden(pf.zugang, { von: { name: pf.zugang.absenderName, adresse: pf.zugang.absender }, an: [konfig.mailAn], betreff, text, anhaenge });
  return `gesendet an ${konfig.mailAn}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const fremd = args.filter(a => !['--schreiben', '--mail'].includes(a));
    if (fremd.length) throw new Error(`Unbekanntes Argument: ${fremd.join(' ')} (erlaubt: --schreiben, --mail)`);
    const privat = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
    const ergebnis = sammelLauf({ privat, schreiben: args.includes('--schreiben'), downloads: path.join(os.homedir(), 'Downloads') });
    // Die Mail ist Zugabe: scheitert sie, bleibt der Lauf gueltig, aber der Exit-Code meldet es.
    if (args.includes('--mail')) {
      try { ergebnis.mail = await laufMailen({ privat, ergebnis }); } catch (e) { ergebnis.mail = `FEHLER: ${String(e?.message || e).slice(0, 120)}`; process.exitCode = 1; }
    }
    console.log(JSON.stringify(ergebnis, null, 1));
  } catch (e) {
    console.error(String(e?.message || e));
    process.exitCode = 1;
  }
}
