/**
 * Vorpruefung des Postfach-Laufs ohne KI (Fehlersuche 28.10.2026): bis dahin startete Claude
 * alle zwei Stunden fuer beide Teile - auch wenn nichts Neues im Postfach lag (Service-Anfragen:
 * 14 von 16 Laeufen „nichts Neues“, je ~120k Tokens; Lieferbelege 4 von 16, je ~400k).
 *
 * Jetzt fragt der Dienst vorher per IMAP nur die Kennungen der Nachrichten ab, die dieselben
 * Gmail-Suchen finden wie die Auftragstexte (Schritt 2), und vergleicht sie mit dem, was schon
 * bekannt ist. Claude startet nur, wenn
 *  - der letzte Claude-Lauf dieses Teils fehlschlug,
 *  - heute noch kein Claude-Lauf erfolgreich war (Tageslauf: faengt Abweichungen zwischen den
 *    Suchen hier und dem privaten Auftragstext ab, und zurueckgestellte Mails unbekannter
 *    Absender werden einmal am Tag erneut angeboten),
 *  - der letzte Belege-Lauf unvollstaendig war (mehr als 40 Threads),
 *  - sich die Lieferanten-Domains geaendert haben,
 *  - oder eine gefundene Nachricht weder bekannt ist noch beim letzten erfolgreichen Lauf
 *    schon gefunden wurde („gesehen“).
 * Geht die Vorpruefung nicht (kein Zugang, IMAP abgelehnt, Netz), startet Claude wie bisher.
 * Abschalten: TP_POSTFACH_VORPRUEFUNG=aus.
 *
 * Gelesen werden nur Kennungen (imap-lesen.mjs), nie Absender, Betreff oder Text.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { berlinZeit } from './routinen.mjs';
import { bekannt as belegeBekannt, leseBelege, lieferbelegePfad } from './lieferbelege.mjs';
import { lesePostfach } from './nachfass-versand.mjs';
import { suchenNurLesend } from './imap-lesen.mjs';
import { bekannt as serviceBekannt } from '../scripts/serviceanfragen.mjs';
import { lieferantenDomains } from '../scripts/lieferbelege.mjs';

export const EIGENE_DOMAIN = 'teppich-paradies.net';
/** So viele gesehene Kennungen merkt sich der Status hoechstens (aelteste fallen weg). */
export const GESEHEN_MAX = 2000;

/**
 * Die Suchen des Lieferbelege-Auftrags (Schritt 2, A bis C). Eigene und gesendete Mails nimmt
 * schon die Suche heraus - der Auftrag sortiert sie erst danach aus.
 */
export function suchenLieferbelege({ domains = [], letzterLauf = null } = {}) {
  const z = letzterLauf ? '3d' : '30d';
  const s = [`label:inbox-ls-ab newer_than:${z}`, `label:inbox-spedition newer_than:${z}`];
  for (let i = 0; i < domains.length; i += 20) s.push(`from:(${domains.slice(i, i + 20).join(' OR ')}) newer_than:${z} -label:inbox-ls-ab`);
  s.push(`in:inbox (storniert OR stornierung OR storno OR "nicht lieferbar" OR "nicht mehr lieferbar" OR ausverkauft) newer_than:${z} -label:inbox-ls-ab`);
  return s.map(q => `${q} -in:sent -from:${EIGENE_DOMAIN}`);
}

/** Die Suche des Service-Auftrags (Schritt 2). */
export const SUCHEN_SERVICE = Object.freeze(['from:mailer@shopify.com subject:"Neue Kundennachricht" newer_than:30d']);

/** Kurzer Fingerabdruck einer Liste (Domains): aendert sie sich, startet Claude. */
export function merkmal(liste = []) {
  return createHash('sha256').update([...liste].sort().join('\n')).digest('hex').slice(0, 16);
}

/**
 * Die Entscheidung je Teil, ohne Seiteneffekte. `status`: der bisherige Stand des Teils
 * (liesStatus), `gefunden`: Kennungen aus den Suchen, `bekannteIds`: was die Ablage schon kennt.
 */
export function entscheide({ status = {}, gefunden = [], bekannteIds = [], jetzt = new Date(), unvollstaendig = false, merkmalNeu = null } = {}) {
  if (status.letzterClaudeOk === false) return { starten: true, grund: 'letzter Claude-Lauf fehlgeschlagen – neuer Versuch' };
  if (status.letzterClaudeTag !== berlinZeit(jetzt).datum) return { starten: true, grund: 'Tageslauf (heute noch kein vollständiger Lauf)' };
  if (unvollstaendig) return { starten: true, grund: 'letzter Lauf unvollständig – Rest abholen' };
  const alt = status.vorpruefung || {};
  if (merkmalNeu && alt.merkmal && alt.merkmal !== merkmalNeu) return { starten: true, grund: 'Lieferanten-Domains geändert' };
  const schon = new Set([...bekannteIds, ...(Array.isArray(alt.gesehen) ? alt.gesehen : [])]);
  const neu = [...new Set(gefunden)].filter(id => !schon.has(id));
  if (neu.length) return { starten: true, grund: `${neu.length} neue Mail(s) im Postfach`, neu };
  return { starten: false, grund: `nichts Neues (${new Set(gefunden).size} Mails in den Suchen, alle bekannt)` };
}

/**
 * Was nach einem erfolgreichen Claude-Lauf im Status steht: alles, was die Suchen vorher
 * gefunden haben, gilt als gesehen (Claude hat dieselben Suchen selbst ausgefuehrt).
 */
export function nachErfolg({ gefunden = [], merkmalNeu = null, jetzt = new Date() } = {}) {
  const gesehen = [...new Set(gefunden)].sort().slice(-GESEHEN_MAX);
  return { letzterClaudeOk: true, letzterClaudeTag: berlinZeit(jetzt).datum, vorpruefung: { gesehen, merkmal: merkmalNeu } };
}

/** Postfach-Zugang des Nachfass-Versands (gleiches Konto, App-Passwort). */
export function postfachZugangPfad(privat) {
  return path.join(privat, 'nachfassen', 'postfach.json');
}

/**
 * Sammelt fuer beide Teile die Suchen und das Bekannte, fragt das Postfach in EINER
 * IMAP-Verbindung ab und liefert je Teil { gefunden, bekannteIds, unvollstaendig, merkmalNeu }
 * - oder { fehler } fuer alle, wenn die Abfrage nicht ging.
 */
export async function postfachAbfragen({ privat, suchen = suchenNurLesend, zugangLesen = lesePostfach } = {}) {
  const zugang = zugangLesen(postfachZugangPfad(privat));
  if (!zugang.zugang) return { fehler: `kein Postfach-Zugang (${zugang.hinweis || 'nachfassen/postfach.json'})` };
  const domains = lieferantenDomains(privat);
  const b = belegeBekannt({ privatDir: privat, domains });
  const letzter = leseBelege(lieferbelegePfad(privat)).laeufe.at(-1);
  const teile = {
    lieferbelege: { suchen: suchenLieferbelege(b), bekannteIds: b.mailIds, unvollstaendig: letzter?.vollstaendig === false, merkmalNeu: merkmal(b.domains) },
    serviceanfragen: { suchen: [...SUCHEN_SERVICE], bekannteIds: serviceBekannt({ privatDir: privat }).mailIds, unvollstaendig: false, merkmalNeu: null },
  };
  const alle = Object.values(teile).flatMap(t => t.suchen);
  let ergebnisse;
  try { ergebnisse = await suchen(zugang.zugang, alle); } catch (e) { return { fehler: String(e?.message || e).slice(0, 160) }; }
  let i = 0;
  const aus = {};
  for (const [id, t] of Object.entries(teile)) {
    const gefunden = t.suchen.flatMap(() => ergebnisse[i++] || []);
    aus[id] = { gefunden, bekannteIds: t.bekannteIds, unvollstaendig: t.unvollstaendig, merkmalNeu: t.merkmalNeu, suchen: t.suchen.length };
  }
  return aus;
}
