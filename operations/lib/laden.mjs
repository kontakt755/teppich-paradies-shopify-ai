/**
 * Ansicht "Laden" (#/laden): Ablagen und Auswahl fuer den Ladenrechner.
 *
 * Drei Dateien unter $TP_PRIVAT_DIR, nie im Repository (Namen und Kundentexte):
 *   laden-personen.json     ["Name", ...]  - wer sich im Laden kuemmern kann (von Hand gepflegt, nur gelesen)
 *   laden-zustaendig.json   { "<schluessel>": { wer, seit } }  - wer einen Eintrag uebernommen hat
 *   laden-aufgaben.json     { version, aufgaben: [{ id, art, text, erstelltAm, erledigtAm }] }  - von Hand angelegt
 * Dazu laden-postfach.json (Zugang) und laden-mails.json (Zwischenspeicher): siehe laden-mails.mjs.
 *
 * Es gibt keinen Login je Person (gemeinsamer Zugang): der Name kommt aus der Liste und wird per
 * Knopf gewaehlt. Gelesen wird wie in operations/lib/fehlermeldungen.mjs: nur eine FEHLENDE Datei
 * gilt als leer, eine beschaedigte wirft - sonst ueberschriebe der naechste Klick alles andere.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { naechsterSchritt } from './kundenfaelle.mjs';
import { leseLadenZugang, ladenPostfachPfad, leseMailCache, abrufenUndSpeichern } from './laden-mails.mjs';

export const AUFGABE_ARTEN = Object.freeze(['Rolle schneiden', 'Rechnung kontrollieren', 'Angebot kontrollieren', 'Sonstiges']);
export const AUFGABE_TEXT_MAX = 200;
const SCHLUESSEL = /^(rueckruf|fall|aufgabe|mail):[A-Za-z0-9:/._-]{1,120}$/;

export class LadenFehler extends Error {}

const privat = dir => dir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
export const ladenPersonenPfad = dir => path.join(privat(dir), 'laden-personen.json');
export const ladenZustaendigPfad = dir => path.join(privat(dir), 'laden-zustaendig.json');
export const ladenAufgabenPfad = dir => path.join(privat(dir), 'laden-aufgaben.json');

/** Datei als JSON; fehlend -> null, leer -> null, beschaedigt oder unlesbar -> Fehler. */
function leseJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw new Error(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch {
    throw new Error(`${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  }
}

function schreibeJson(file, wert) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(wert, null, 2));
  fs.renameSync(tmp, file);
}

/** Namen im Laden; null = Datei fehlt (die Ansicht erklaert dann, wie sie angelegt wird). */
export function lesePersonen(file) {
  const roh = leseJson(file);
  if (roh === null) return null;
  if (!Array.isArray(roh)) throw new Error(`${path.basename(file)} muss eine Liste von Namen sein, zum Beispiel ["Person A", "Person B"]`);
  const namen = [...new Set(roh.map(n => String(n ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
  return namen.length ? namen : null;
}

export function leseZustaendig(file) {
  const roh = leseJson(file);
  return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
}

/**
 * Uebernimmt einen Eintrag (wer = Name aus der Liste) oder gibt ihn zurueck (wer = null).
 * Ein zweites "Uebernehmen" ueberschreibt nichts still: wer schneller war, bleibt stehen.
 */
export function setzeZustaendig(file, { schluessel, wer, personen, jetzt = new Date() } = {}) {
  if (!SCHLUESSEL.test(String(schluessel ?? ''))) throw new LadenFehler('Unbekannter Eintrag');
  if (wer !== null && !(personen || []).includes(wer)) throw new LadenFehler('Diesen Namen gibt es in der Liste nicht');
  const alle = leseZustaendig(file);
  if (wer === null) { delete alle[schluessel]; schreibeJson(file, alle); return null; }
  if (alle[schluessel] && alle[schluessel].wer !== wer) throw new LadenFehler(`${alle[schluessel].wer} kümmert sich schon darum`);
  alle[schluessel] ||= { wer, seit: jetzt.toISOString() };
  schreibeJson(file, alle);
  return alle[schluessel];
}

export function leseAufgaben(file) {
  const roh = leseJson(file);
  return Array.isArray(roh?.aufgaben) ? roh.aufgaben : [];
}

export function legeAufgabeAn(file, { art, text, jetzt = new Date() } = {}) {
  if (!AUFGABE_ARTEN.includes(art)) throw new LadenFehler('Bitte eine Art wählen');
  const kurz = String(text ?? '').trim();
  if (!kurz) throw new LadenFehler('Bitte kurz beschreiben, was zu tun ist');
  if (kurz.length > AUFGABE_TEXT_MAX) throw new LadenFehler(`Bitte höchstens ${AUFGABE_TEXT_MAX} Zeichen`);
  const aufgaben = leseAufgaben(file);
  const eintrag = { id: crypto.randomBytes(5).toString('hex'), art, text: kurz, erstelltAm: jetzt.toISOString(), erledigtAm: null };
  schreibeJson(file, { version: 1, aufgaben: [...aufgaben, eintrag] });
  return eintrag;
}

export function erledigeAufgabe(file, { id, jetzt = new Date() } = {}) {
  const aufgaben = leseAufgaben(file);
  const a = aufgaben.find(x => x.id === id);
  if (!a) throw new LadenFehler('Diese Aufgabe gibt es nicht');
  if (!a.erledigtAm) a.erledigtAm = jetzt.toISOString();
  schreibeJson(file, { version: 1, aufgaben });
  return a;
}

/**
 * Bestellungen, bei denen laut Zeitleiste der Kunde dran ist (Rueckmeldung, Empfang) - dieselbe
 * Quelle wie "Kunden > Zu tun" (kundenfaelle.mjs). Wer nur wartet, steht dort nie in der Liste;
 * hier ist es der Fall "Kunde antwortet nicht". Wie lange, sagt die Zeitleiste (wartetSeitTagen).
 */
export function kundeWartet(bestellzeilen = [], { jetzt = new Date() } = {}) {
  return bestellzeilen
    // Muster sind nie Sache des Ladens (Inhaber 10.11.2026) - sonst stuende hier jeder Musterkunde.
    .filter(z => !z.testbestellung && !z.storniert && z.auftragsart !== 'muster')
    .map(z => ({ z, s: naechsterSchritt(z, { jetzt }) }))
    .filter(({ s }) => s.art === 'wartet' && s.wer === 'kunde')
    .map(({ z }) => ({
      orderId: z.orderId, orderName: z.orderName, kundenname: z.kundenname || null,
      email: z.email || null, text: z.zeitleisteSchritt?.text || null,
      tage: z.zeitleisteSchritt?.wartetSeitTagen ?? null, seit: z.datum || null,
    }));
}

/** Zwischenspeicher aelter als das: ein neuer Abruf im Hintergrund. */
const MAIL_FRISCH_MS = 5 * 60 * 1000;
let mailAbrufLaeuft = false;

/**
 * Mails fuer den Laden (operations/lib/laden-mails.mjs). Bleibt synchron: liefert immer den
 * Zwischenspeicher und stoesst bei Bedarf EINEN Abruf im Hintergrund an - die Ansicht laedt per Timer
 * neu und zeigt beim naechsten Mal das Ergebnis. Ohne Zugangsdatei: nicht eingerichtet. Ein Fehler
 * wirft nie, er steht als `fehler` (kurzer Satz fuer die Ansicht) im Ergebnis.
 */
export function ladenMails(dir, { jetzt = new Date(), abruf = abrufenUndSpeichern } = {}) {
  const wurzel = privat(dir);
  const z = leseLadenZugang(ladenPostfachPfad(wurzel));
  if (z.fehlt) return { eingerichtet: false, eintraege: [] };
  if (!z.zugang) return { eingerichtet: true, eintraege: [], stand: null, fehler: z.hinweis, laeuft: false };
  let cache = null;
  let fehler = null;
  try { cache = leseMailCache(wurzel); } catch { fehler = 'Der Zwischenspeicher der Mails ist beschädigt und wird neu aufgebaut.'; }
  const stand = cache?.abgerufenAm ? new Date(cache.abgerufenAm).getTime() : NaN;
  if (!mailAbrufLaeuft && !(jetzt.getTime() - stand < MAIL_FRISCH_MS)) {
    mailAbrufLaeuft = true;
    Promise.resolve().then(() => abruf(wurzel, { jetzt: new Date() })).catch(() => {}).finally(() => { mailAbrufLaeuft = false; });
  }
  return {
    eingerichtet: true, eintraege: Array.isArray(cache?.eintraege) ? cache.eintraege : [],
    stand: cache?.abgerufenAm || null, fehler: fehler || cache?.fehler || null, laeuft: mailAbrufLaeuft,
  };
}
