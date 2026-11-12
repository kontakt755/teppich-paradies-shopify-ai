#!/usr/bin/env node
/**
 * Lieferantenbelege aus dem Firmenpostfach uebernehmen (Inhaber 2026-10-19: ABs, Lieferscheine,
 * Storno - wo kommen sie, wurde es abgehakt, ist es mit Shopify synchron).
 *
 *   npm run -s belege -- bekannt                                     # JSON: Mail-IDs, Absenderdomains, letzter Lauf
 *   npm run -s belege -- uebernehmen --datei <json> [--bereiche label,lieferant,stichwort] [--unvollstaendig]
 *   npm run -s belege -- lieferorte                                  # Lieferort aus Lieferschein-PDFs nachtragen (laeuft auch nach uebernehmen)
 *
 * Der Dashboard-Dienst liest kein Postfach. Das tut der geplante Claude-Lauf
 * "lieferbelege-postfach" (nur lesend ueber Gmail): `bekannt` liefert, was schon da ist und
 * nach welchen Absendern er suchen soll; der Lauf legt neue Mails als JSON in sein Scratchpad -
 * [{ id, threadId, von, datum, betreff, text, anhaenge, quelle, viewUrl }] - und ruft
 * `uebernehmen`. Erkannt und gespeichert wird nur hier (docs/ai-dashboard/lib/lieferbelege.mjs);
 * in auftragsstatus.json wird nie geschrieben. Die Ausgabe nennt nur Zahlen und Belegarten,
 * keine Namen.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bekannt, uebernehmen, LieferbelegFehler, lieferorteOffen, lieferorteSetzen, lieferortAusText } from '../lib/lieferbelege.mjs';
import { leseStammdaten, stammdatenPfad } from '../lib/lieferanten.mjs';
import { mitNurLesen } from '../lib/imap-lesen.mjs';
import { zerlegeMail } from '../lib/mime.mjs';
import { lesePostfach } from '../lib/nachfass-versand.mjs';
import { istPdf } from '../lib/belege.mjs';
import { pdfAnalyse } from './belege-monat.mjs';
import { domainVon, FREEMAIL } from '../../docs/ai-dashboard/lib/lieferbelege.mjs';

/** Absenderdomains der hinterlegten Lieferanten (Stammdaten), ohne allgemeine Mailanbieter. */
export function lieferantenDomains(privatDir) {
  const st = leseStammdaten(stammdatenPfad(privatDir));
  const domains = new Set();
  for (const l of Object.values(st.lieferanten || {})) {
    for (const d of [...(l.postfachDomains || []), domainVon(l.ware?.mail), domainVon(l.muster?.mail)]) {
      if (d && !FREEMAIL.includes(d)) domains.add(d);
    }
  }
  return [...domains].sort();
}

/** Hoechstens so viele Lieferscheine je Lauf - der Lauf haengt an einem Claude-Befehl mit Zeitlimit. */
const LIEFERORTE_JE_LAUF = 10;

/**
 * Lieferort offener Lieferscheine aus dem PDF lesen (nur lesend per IMAP, gleicher Zugang wie die Vorpruefung).
 * Der Claude-Lauf kann das nicht: der Gmail-Konnektor liefert keine Anhaenge. Der PDF-Text wird nie gespeichert,
 * nur das Ergebnis (laden/kettler/kunde/abholung/unklar). Nicht gefundene Mails bleiben offen fuer den naechsten Lauf.
 * shortcut: laeuft nur im Anschluss an `uebernehmen`, ein IMAP-Fehler wird also erst mit der naechsten neuen
 * Belegmail erneut versucht - eigener Zeitplan, falls das im Betrieb stoert.
 */
export async function lieferorteNachtragen({ privatDir, jetzt = new Date(), sitzung = mitNurLesen, analyse = pdfAnalyse, zugang } = {}) {
  const offen = lieferorteOffen({ privatDir, jetzt }).slice(0, LIEFERORTE_JE_LAUF);
  if (!offen.length) return { gelesen: 0, offen: 0 };
  const zug = zugang || lesePostfach(path.join(path.dirname(path.dirname(stammdatenPfad(privatDir))), 'nachfassen', 'postfach.json')).zugang;
  if (!zug) return { gelesen: 0, offen: offen.length, fehler: 'kein Postfach-Zugang' };
  const anschriften = (() => { const a = leseStammdaten(stammdatenPfad(privatDir)).absender || {}; return { laden: a.lieferanschrift, kettler: a.kettelservice }; })();
  const adressen = [...new Set(offen.map(b => /[^\s<>"]+@[^\s<>"]+/.exec(b.von || '')?.[0]).filter(a => a && /^[\x21-\x7e]+$/.test(a)))];
  const roh = await sitzung(zug, async (s) => {
    const aus = {};
    for (const adresse of adressen) {
      const uids = await s.suche(`from:${adresse} has:attachment newer_than:10d`);
      for (const d of await s.daten(uids)) if (offen.some(b => b.id === d.id)) aus[d.id] = await s.nachricht(d.uid);
    }
    return aus;
  });
  const orte = {};
  for (const [id, bytes] of Object.entries(roh)) {
    const pdfs = zerlegeMail(bytes).anhaenge.filter(a => a.inhalt?.length && istPdf(a.inhalt));
    const gelesen = pdfs.map(a => lieferortAusText(analyse(a.inhalt)?.text, anschriften));
    // Ein erkannter Schein entscheidet; mehrere verschiedene oder ein unlesbares PDF sind unklar.
    const klar = [...new Set(gelesen.filter(Boolean))];
    orte[id] = klar.length === 1 ? klar[0] : klar.length > 1 || !pdfs.length ? 'unklar' : null;
  }
  const gesetzt = lieferorteSetzen(orte, { privatDir, jetzt });
  return { gelesen: gesetzt, offen: offen.length - gesetzt };
}

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

async function main(argv) {
  const [befehl, ...rest] = argv;
  const privatDir = process.env.TP_PRIVAT_DIR || undefined;
  if (befehl === 'bekannt') {
    console.log(JSON.stringify(bekannt({ privatDir, domains: lieferantenDomains(privatDir) })));
    return 0;
  }
  if (befehl === 'uebernehmen') {
    const datei = argWert(rest, '--datei');
    if (!datei) { console.error('--datei <json> fehlt'); return 2; }
    let mails;
    try { mails = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) { console.error(`Datei nicht lesbar: ${e.message}`); return 2; }
    if (!Array.isArray(mails)) { console.error('Die Datei muss eine JSON-Liste sein'); return 2; }
    const bereiche = (argWert(rest, '--bereiche') || '').split(',').map(s => s.trim()).filter(Boolean);
    const e = uebernehmen(mails, { privatDir, lieferantenDomains: lieferantenDomains(privatDir), lauf: { bereiche, vollstaendig: !rest.includes('--unvollstaendig') } });
    const arten = {};
    for (const n of e.neu) arten[n.art] = (arten[n.art] || 0) + 1;
    const gruende = {};
    for (const u of e.uebersprungen) gruende[u.grund] = (gruende[u.grund] || 0) + 1;
    // Der Lieferort ist Zusatz: scheitert er (Netz, Zugang), ist die Uebernahme trotzdem gelungen.
    let lieferorte;
    try { lieferorte = await lieferorteNachtragen({ privatDir }); } catch (f) { lieferorte = { fehler: String(f?.message || f).slice(0, 120) }; }
    console.log(JSON.stringify({ neu: e.neu.length, arten, uebersprungen: e.uebersprungen.length, gruende, lieferorte }));
    return 0;
  }
  if (befehl === 'lieferorte') {
    console.log(JSON.stringify(await lieferorteNachtragen({ privatDir })));
    return 0;
  }
  console.error('Befehle: bekannt | uebernehmen --datei <json> [--bereiche a,b] [--unvollstaendig] | lieferorte');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch((e) => {
    console.error(e instanceof LieferbelegFehler ? e.message : (e?.stack || e?.message || String(e)));
    process.exit(1);
  });
}
