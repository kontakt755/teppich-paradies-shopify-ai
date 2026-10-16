#!/usr/bin/env node
/**
 * Service-Anfragen aus dem Firmenpostfach uebernehmen (Werkbank w-030,
 * Inhaber 16.10.2026: automatisch, Handeingabe bleibt).
 *
 *   npm run -s service -- bekannt                    # JSON: schon gepruefte Mail-IDs
 *   npm run -s service -- uebernehmen --datei <json> # Mails pruefen und anlegen
 *
 * Der Dashboard-Dienst liest kein Postfach. Das tut der geplante Claude-Lauf
 * "serviceanfragen-postfach" (nur lesend ueber Gmail), legt die neuen Mails
 * als JSON in seinem Scratchpad ab - [{ id, von, datum, betreff, text }] - und
 * ruft dieses Skript im Dienst-Checkout auf. Uebernommen wird nur, was
 * automatischUebernehmbar() erlaubt (feste Betreffe der Serviceseiten);
 * dieselbe Mail nie zweimal, eine schon von Hand erfasste Anfrage nicht noch
 * einmal. Die Ausgabe nennt nur Nummern und Gruende, keine Kundendaten.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  serviceanfragenPfad, postfachPfad, leseAlle, anlegen, aehnlicheAnfrage, leseGeprueft, schreibeGeprueft, ServiceanfrageFehler,
} from '../lib/serviceanfragen.mjs';
import { ausFormularMail, automatischUebernehmbar } from '../../docs/ai-dashboard/lib/serviceanfragen.mjs';

export const AKTEUR = 'Postfach (automatisch)';
const ABSENDER = /mailer@shopify\.com/i;

/** Kalendertag in Berlin - eine Mail um 0:30 Uhr gehoert zum neuen Tag. */
export function berlinerTag(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

export function bekannt({ privatDir } = {}) {
  const ids = new Set(Object.keys(leseGeprueft(postfachPfad(privatDir))));
  for (const e of leseAlle(serviceanfragenPfad(privatDir))) if (e.mailId) ids.add(e.mailId);
  return { mailIds: [...ids].sort() };
}

export function uebernehmen(mails, { privatDir, jetzt = new Date() } = {}) {
  const datei = serviceanfragenPfad(privatDir);
  const pDatei = postfachPfad(privatDir);
  const geprueft = leseGeprueft(pDatei);
  const ergebnis = { angelegt: [], uebersprungen: [] };
  for (const m of Array.isArray(mails) ? mails : []) {
    const mailId = String(m?.id || '').trim();
    if (!mailId) { ergebnis.uebersprungen.push({ mailId: null, grund: 'Mail ohne ID' }); continue; }
    const merke = grund => {
      geprueft[mailId] = { am: jetzt.toISOString(), ergebnis: grund };
      ergebnis.uebersprungen.push({ mailId, grund });
    };
    if (geprueft[mailId]) continue;
    if (leseAlle(datei).some(e => e.mailId === mailId)) continue;
    if (!ABSENDER.test(String(m.von || ''))) { merke('Absender ist nicht das Shopify-Kontaktformular'); continue; }
    const gelesen = ausFormularMail(`${m.betreff || ''}\n\n${m.text || ''}`);
    const pruefung = automatischUebernehmbar(gelesen);
    if (!pruefung.ok) { merke(pruefung.grund); continue; }
    const felder = { ...gelesen.felder, datum: gelesen.felder.datum || berlinerTag(m.datum || jetzt), mailId, status: 'neu' };
    const schon = aehnlicheAnfrage(leseAlle(datei), felder);
    if (schon) { merke(`schon erfasst als ${schon.id}`); continue; }
    try {
      const { eintrag } = anlegen(datei, felder, { actor: AKTEUR, jetzt });
      geprueft[mailId] = { am: jetzt.toISOString(), ergebnis: `angelegt ${eintrag.id}` };
      ergebnis.angelegt.push({ id: eintrag.id, mailId, leistung: eintrag.leistung, quelle: eintrag.quelle });
    } catch (e) {
      // Pruefungsfehler (z. B. keine Kontaktangabe): einmal merken, nicht jeden Lauf neu.
      if (e instanceof ServiceanfrageFehler) { merke(e.message); continue; }
      throw e;
    }
  }
  schreibeGeprueft(pDatei, geprueft);
  return ergebnis;
}

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

async function main(argv) {
  const [befehl, ...rest] = argv;
  if (befehl === 'bekannt') { console.log(JSON.stringify(bekannt())); return 0; }
  if (befehl === 'uebernehmen') {
    const pfad = argWert(rest, '--datei');
    if (!pfad) { console.error('--datei <mails.json> fehlt'); return 2; }
    const mails = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    console.log(JSON.stringify(uebernehmen(mails)));
    return 0;
  }
  console.error('Befehle: bekannt | uebernehmen --datei <mails.json>');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(e.message); process.exitCode = 1; });
}
