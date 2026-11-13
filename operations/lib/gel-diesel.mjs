/**
 * Dieselzuschlag der Spedition (GEL), woechentlich von der oeffentlichen Seite in die private
 * Tarifdatei ($TP_PRIVAT_DIR/versandkosten/tarife.json). Der Wert einer Kalenderwoche gilt
 * Montag bis Sonntag dieser ISO-Woche (belegt 13.11.2026). Der Lauf steht in
 * operations/scripts/gel-diesel-nachtragen.mjs; hier nur Lesen der Seite und Schreiben der
 * drei Felder. Vertragspreise bleiben in der privaten Datei, hier steht keiner.
 */
import fs from 'node:fs';
import { pruefeVersandtarif } from '../../docs/ai-dashboard/lib/versandkosten.mjs';

export const GEL_SEITE = 'https://www.gel-express.de/de/kraftstoff-zuschlag/';
export const GEL_MIN_SATZ = 0.05;
export const GEL_MAX_SATZ = 0.6;
const FELDER = ['GEL Diesel', 'GEL gültig von', 'GEL gültig bis'];
const TAG_MS = 86_400_000;
const iso = ms => new Date(ms).toISOString().slice(0, 10);

/** ISO-Woche zu einem Datum (JJJJ-MM-TT): Nummer, Wochenjahr, Montag und Sonntag. */
export function isoWoche(datum) {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(datum) ? Date.parse(datum) : NaN;
  if (!Number.isFinite(ms) || iso(ms) !== datum) throw new Error(`Datum ungültig: ${datum}`);
  const montag = ms - ((new Date(ms).getUTCDay() + 6) % 7) * TAG_MS;
  const donnerstag = montag + 3 * TAG_MS; // der Donnerstag legt das Wochenjahr fest
  const jahr = new Date(donnerstag).getUTCFullYear();
  return { jahr, woche: Math.floor((donnerstag - Date.UTC(jahr, 0, 1)) / TAG_MS / 7) + 1, von: iso(montag), bis: iso(montag + 6 * TAG_MS) };
}

/**
 * Liest den Zuschlag der ISO-Woche von `datum` aus Seitentext oder HTML ("KW 46/2026*" gefolgt
 * von "24,6%", Komma oder Punkt). Fehlt die Woche, ist sie widerspruechlich oder liegt der Wert
 * ausserhalb von 5 bis 60 %, gibt es einen Fehler statt eines geratenen Werts.
 * @returns {{satz: number, von: string, bis: string}} Anteil 0 bis 1, Montag und Sonntag als ISO-Datum
 */
export function gelDieselAusSeite(seite, datum) {
  const w = isoWoche(datum);
  const text = String(seite)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  const werte = new Set();
  for (const m of text.matchAll(/KW\s*(\d{1,2})\s*\/\s*(\d{4})\s*\*?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)) {
    if (Number(m[1]) === w.woche && Number(m[2]) === w.jahr) werte.add(m[3].replace(',', '.'));
  }
  const kw = `KW ${String(w.woche).padStart(2, '0')}/${w.jahr}`;
  if (!werte.size) throw new Error(`${kw} steht nicht auf der GEL-Seite.`);
  if (werte.size > 1) throw new Error(`${kw} steht mit verschiedenen Werten auf der GEL-Seite (${[...werte].join(' / ')}).`);
  const satz = Math.round(Number([...werte][0]) * 100) / 10_000;
  if (satz < GEL_MIN_SATZ || satz > GEL_MAX_SATZ) throw new Error(`${kw}: ${(satz * 100).toFixed(1).replace('.', ',')} % ist nicht plausibel (erlaubt 5 bis 60 %).`);
  return { satz, von: w.von, bis: w.bis };
}

const prozent = s => `${(s * 100).toFixed(1).replace('.', ',')} %`;
const tag = d => d.split('-').reverse().join('.');

/** Ein Satz fuers Protokoll: alt → neu mit Zeitraum, oder "unveraendert". */
export function gelDieselMeldung({ geaendert, alt, neu }) {
  const zeitraum = `${tag(neu.von).slice(0, 6)}–${tag(neu.bis)}`;
  return geaendert
    ? `GEL-Diesel: ${prozent(alt.satz)} → ${prozent(neu.satz)}, gültig ${zeitraum}.`
    : `GEL-Diesel unverändert: ${prozent(neu.satz)}, gültig ${zeitraum}.`;
}

/**
 * Traegt Satz und Zeitraum der Woche von `datum` in die Tarifdatei ein - nur diese drei Felder,
 * der Rest der Datei bleibt Zeichen fuer Zeichen. Ohne Aenderung wird nichts geschrieben. Sonst:
 * datierte Sicherung `<datei>.bak-<datum>-gel-diesel`, neue Fassung in eine Nebendatei, mit
 * pruefeVersandtarif gegenpruefen, dann erst ersetzen. Bei jedem Fehler bleibt die Datei
 * unveraendert. Mit `trocken` wird alles gerechnet und geprueft, aber nichts geschrieben.
 */
export function gelDieselNachtragen(datei, seite, datum, { trocken = false } = {}) {
  const neu = gelDieselAusSeite(seite, datum);
  const roh = fs.readFileSync(datei, 'utf8');
  const tarif = JSON.parse(roh);
  const s = tarif.saetze || {};
  const alt = { satz: s['GEL Diesel'], von: s['GEL gültig von'], bis: s['GEL gültig bis'] };
  const werte = { 'GEL Diesel': neu.satz, 'GEL gültig von': neu.von, 'GEL gültig bis': neu.bis };
  if (Math.round(alt.satz * 10_000) === Math.round(neu.satz * 10_000) && alt.von === neu.von && alt.bis === neu.bis) {
    return { geaendert: false, alt, neu };
  }

  let text = roh;
  for (const feld of FELDER) {
    const muster = new RegExp(`("${feld}"\\s*:\\s*)(?:"[^"]*"|-?[\\d.eE+-]+)`, 'g');
    if ((text.match(muster) || []).length !== 1) throw new Error(`Feld "${feld}" steht nicht genau einmal in der Tarifdatei.`);
    text = text.replace(muster, (_, vor) => vor + JSON.stringify(werte[feld]));
  }
  const erwartet = { ...tarif, saetze: { ...s, ...werte } };
  const geschrieben = JSON.parse(text);
  if (JSON.stringify(geschrieben) !== JSON.stringify(erwartet)) throw new Error('Die Änderung hätte mehr als die drei GEL-Felder berührt.');
  pruefeVersandtarif(geschrieben);
  if (trocken) return { geaendert: true, trocken: true, alt, neu };

  const modus = fs.statSync(datei).mode & 0o777;
  const nebendatei = `${datei}.${process.pid}.tmp`;
  try {
    fs.copyFileSync(datei, `${datei}.bak-${datum}-gel-diesel`);
    fs.writeFileSync(nebendatei, text, { mode: modus });
    pruefeVersandtarif(JSON.parse(fs.readFileSync(nebendatei, 'utf8')));
    fs.renameSync(nebendatei, datei);
  } catch (e) {
    fs.rmSync(nebendatei, { force: true });
    throw e;
  }
  return { geaendert: true, alt, neu };
}
