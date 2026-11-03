/**
 * Messung des Laufs postfach-entwuerfe fuer die 4-Wochen-Probe (Inhaber 03.11.2026): je Mail eine
 * Zeile in $TP_PRIVAT_DIR/routinen/postfach-entwuerfe/messung.jsonl, ohne Inhalte. Ob wirklich ein
 * Entwurf entstand, entscheidet die Spur der Wache (entwurf-spuren.jsonl), nicht die Angabe von
 * Claude.
 */

import fs from 'node:fs';
import path from 'node:path';
import { entwuerfeOrdner } from './routinen.mjs';
import { entwurfNormal, entwurfSha, liesSpuren } from './routine-wache.mjs';

export const KLASSEN = Object.freeze([
  'K1', 'K2', 'K6', 'E1', 'E2', 'E3', 'E4', 'E5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'N1', 'N2', 'N3', 'N4', 'X1',
]);
export const STUFEN = Object.freeze(['KLAR', 'ENTWURF', 'NUR-MENSCH', 'NICHT-ANTWORTEN']);
const STUFE_DER_KLASSE = (k) => {
  if (['K1', 'K2', 'K6'].includes(k)) return 'KLAR';
  // X1: kein Kundenbezug (Lieferant, Rechnung, Werbung, Autoantwort): nur gezaehlt.
  if (['F6', 'F7', 'X1'].includes(k)) return 'NICHT-ANTWORTEN';
  if (k === 'F5' || k.startsWith('N')) return 'NUR-MENSCH';
  return 'ENTWURF';
};
/** Warum es trotz passender Stufe keinen Entwurf gibt: feste Werte, nie freier Text. */
export const GRUENDE = Object.freeze(['schon-beantwortet', 'schon-entwurf', 'folgemail', 'unsicher']);

export function messungPfad(privat) {
  return path.join(entwuerfeOrdner(privat), 'messung.jsonl');
}

/** Liest die Messung. Eine kaputte Zeile ist ein Fehler - nie still als leer lesen. */
export function liesMessung(privat) {
  let text;
  try { text = fs.readFileSync(messungPfad(privat), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').filter(Boolean).map(z => JSON.parse(z));
}

export function zeilenSeit(privat, start) {
  const ab = Date.parse(start);
  return liesMessung(privat).filter(z => Date.parse(z.erfasst) >= ab);
}

export function bekannt(privat) {
  const m = liesMessung(privat);
  return { mailIds: [...new Set(m.map(z => z.mailId))], threadsMitEntwurf: [...new Set(m.filter(z => z.entwurf).map(z => z.threadId))] };
}

const KENNUNG = /^[0-9a-f]{6,32}$/i;

/**
 * Prueft eine gelieferte Zeile und baut die gespeicherte: nur bekannte Felder, damit nie ein
 * Inhalt in die Messung gelangt. Die Stufe folgt der Klasse.
 */
export function pruefeZeile(z) {
  if (!KENNUNG.test(String(z?.mailId))) return { fehler: 'mailId ungültig' };
  if (!KENNUNG.test(String(z?.threadId))) return { fehler: 'threadId ungültig' };
  if (!KLASSEN.includes(z?.klasse)) return { fehler: `Klasse ungültig: ${String(z?.klasse).slice(0, 12)}` };
  if (z.stufe !== STUFE_DER_KLASSE(z.klasse)) return { fehler: `Stufe passt nicht zu ${z.klasse}` };
  const v = Number(z.vertrauen);
  if (!(v >= 0 && v <= 1)) return { fehler: 'vertrauen zwischen 0 und 1' };
  if (z.grund !== undefined && z.grund !== null && !GRUENDE.includes(z.grund)) return { fehler: 'grund ungültig' };
  return { zeile: { mailId: z.mailId, threadId: z.threadId, klasse: z.klasse, stufe: z.stufe, vertrauen: Math.round(v * 100) / 100, grund: z.grund ?? null } };
}

/**
 * Haengt die Zeilen an. `entwurf` kommt aus der Spur der Wache; widerspricht Claude ihr, zaehlt
 * die Spur und die Abweichung steht in der Ausgabe. Schon bekannte Mails werden uebersprungen.
 */
export function uebernehmen(privat, zeilen, jetzt = new Date()) {
  if (!Array.isArray(zeilen)) throw new Error('Erwartet wird eine Liste.');
  const schon = new Set(bekannt(privat).mailIds);
  const spuren = new Set(liesSpuren(privat).map(s => s.mailId));
  const raus = [];
  const abgelehnt = [];
  let abweichungen = 0;
  for (const roh of zeilen) {
    const { zeile, fehler } = pruefeZeile(roh);
    if (fehler) { abgelehnt.push(fehler); continue; }
    if (schon.has(zeile.mailId)) continue;
    schon.add(zeile.mailId);
    const entwurf = spuren.has(zeile.mailId);
    if (Boolean(roh.entwurf) !== entwurf) abweichungen += 1;
    raus.push({ datum: String(roh.datum || '').slice(0, 10) || jetzt.toISOString().slice(0, 10), erfasst: jetzt.toISOString(), ...zeile, entwurf });
  }
  if (raus.length) {
    fs.mkdirSync(path.dirname(messungPfad(privat)), { recursive: true, mode: 0o700 });
    fs.appendFileSync(messungPfad(privat), raus.map(z => `${JSON.stringify(z)}\n`).join(''), { mode: 0o600 });
  }
  return { neu: raus.length, abgelehnt, abweichungen };
}

/** Zahlen je Klasse und Stufe; KLAR wird nie gesendet, sondern hier nur gezaehlt. */
export function zahlen(messung) {
  const klassen = {};
  const stufen = {};
  for (const z of messung) {
    const k = (klassen[z.klasse] ??= { mails: 0, entwuerfe: 0, vertrauenSumme: 0 });
    k.mails += 1;
    if (z.entwurf) k.entwuerfe += 1;
    k.vertrauenSumme += Number(z.vertrauen) || 0;
    stufen[z.stufe] = (stufen[z.stufe] || 0) + 1;
  }
  for (const k of Object.values(klassen)) {
    k.vertrauen = k.mails ? Math.round((k.vertrauenSumme / k.mails) * 100) / 100 : null;
    delete k.vertrauenSumme;
  }
  return { mails: messung.length, entwuerfe: messung.filter(z => z.entwurf).length, klassen, stufen };
}

/** Gmail-Kennungen wachsen mit der Zeit: Eine groessere Kennung im Verlauf ist spaeter gesendet. */
export function nachDerMail(gesendetIds, mailId) {
  const ab = BigInt(`0x${mailId}`);
  return gesendetIds.some(id => BigInt(`0x${id}`) > ab);
}

/**
 * Wie viele Verlaeufe mit Entwurf haben danach eine gesendete Antwort? Sagt nicht, ob der Entwurf
 * benutzt wurde. Liest per IMAP nur Kennungen.
 */
export async function gesendetZaehlen(messung, { zugang, suchen }) {
  const mitEntwurf = messung.filter(z => z.entwurf);
  const ergebnis = await suchen(zugang, mitEntwurf.map(z => ({ thread: z.threadId, roh: 'in:sent' })));
  const jeKlasse = {};
  let gesendet = 0;
  mitEntwurf.forEach((z, i) => {
    if (!nachDerMail(ergebnis[i] || [], z.mailId)) return;
    gesendet += 1;
    jeKlasse[z.klasse] = (jeKlasse[z.klasse] || 0) + 1;
  });
  return { gesendet, jeKlasse };
}

/**
 * Unveraendert gesendet? Der Vergleich braucht den Wortlaut der gesendeten Mail, den IMAP hier
 * nicht liefert: `texte` ist [{ mailId, text }] mit dem gesendeten Text zur Mail `mailId`, von
 * Hand oder von einer Sitzung aus get_thread geholt. Verglichen wird der Anfang in Laenge des
 * Entwurfs (dahinter haengt Gmail Signatur und Zitat an) per Pruefsumme. Nur Zahlen als Ergebnis.
 */
export function vergleichen(privat, texte) {
  if (!Array.isArray(texte)) throw new Error('Erwartet wird eine Liste.');
  const spuren = new Map(liesSpuren(privat).map(s => [s.mailId, s]));
  const klasse = new Map(liesMessung(privat).map(z => [z.mailId, z.klasse]));
  const aus = { geprueft: 0, unveraendert: 0, geaendert: 0, ohneSpur: 0, jeKlasse: {} };
  for (const t of texte) {
    const s = spuren.get(t?.mailId);
    if (!s) { aus.ohneSpur += 1; continue; }
    aus.geprueft += 1;
    const gleich = entwurfSha(entwurfNormal(t.text).slice(0, s.laenge)) === s.sha;
    aus[gleich ? 'unveraendert' : 'geaendert'] += 1;
    const k = klasse.get(t.mailId) || '?';
    aus.jeKlasse[k] ??= { unveraendert: 0, geaendert: 0 };
    aus.jeKlasse[k][gleich ? 'unveraendert' : 'geaendert'] += 1;
  }
  return aus;
}
