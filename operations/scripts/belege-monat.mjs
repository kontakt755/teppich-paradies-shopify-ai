#!/usr/bin/env node
/**
 * Rechnungs-Archiv und Druck-PDF eines Monats (Inhaber 03.11.2026): Originale bleiben digital,
 * gedruckt wird nur noch eine sortierte Kopie.
 *
 *   npm run -s belege:monat -- --monat 2026-10              # Probelauf: liest, schreibt nichts
 *   npm run -s belege:monat -- --monat 2026-10 --schreiben  # legt ab und baut das Druck-PDF
 *
 * Postfach nur lesend (imap-lesen.mjs: EXAMINE, BODY.PEEK), geschrieben wird nur unter
 * $TP_PRIVAT_DIR/belege-archiv/JJJJ/MM/. Originale werden nie ueberschrieben. Die Ausgabe nennt
 * nur Zahlen; Namen, Betreffe und Betraege stehen im privaten Manifest und im Druck-PDF.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mitNurLesen, ImapFehler } from '../lib/imap-lesen.mjs';
import { zerlegeMail, kopfZerlegen, kopfDaten } from '../lib/mime.mjs';
import { lesePostfach } from '../lib/nachfass-versand.mjs';
import {
  LABEL_SUCHEN, PORTALE, WORT_RECHNUNG, sha256, belegeOrdner, monatsGrenzen, monatDavor, berlinTag,
  anbieterSchluessel, anbieterName, istPdf, istXml, istRechnungsXml, einordnen, einordnenKopf,
  ablegenUnveraenderlich, archivName, belegFelder, xmlRechnungLesen, dublettenMarkieren, druckReihenfolge,
  summenJeAnbieter, wiederkehrend, pruefKandidaten, manifestZusammenfuehren, eur,
} from '../lib/belege.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const VORMONATE = 3;
const MAILS_JE_SITZUNG = 25;
const HELFER_ZEITLIMIT_MS = 300_000;
const PYTHON = process.env.TP_ANALYSE_PYTHON || path.join(os.homedir(), '.venvs', 'analyse', 'bin', 'python');
const PFAD_MIT_WERKZEUGEN = `${process.env.PATH || ''}${path.delimiter}/opt/homebrew/bin${path.delimiter}/usr/local/bin`;

/**
 * Eingabe als schon geloeschte Datei statt per `input`: im Echtlauf blieb spawnSync einmal 9 Minuten
 * haengen, weil die Pipe nie zuging (Python wartete auf das Ende der Eingabe). Dazu ein Zeitlimit.
 */
function eingabeFd(eingabe) {
  if (eingabe === undefined) return 'ignore';
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-'));
  try {
    const datei = path.join(ordner, 'eingabe');
    fs.writeFileSync(datei, eingabe, { mode: 0o600 });
    return fs.openSync(datei, 'r');
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

function pythonHelfer(befehl, { eingabe, arg } = {}) {
  const stdin = eingabeFd(eingabe);
  let r;
  try {
    r = spawnSync(PYTHON, [path.join(HIER, 'belege_pdf.py'), befehl, ...(arg ? [arg] : [])], { stdio: [stdin, 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024, timeout: HELFER_ZEITLIMIT_MS });
  } finally {
    if (typeof stdin === 'number') fs.closeSync(stdin);
  }
  if (r.error) throw new Error(`PDF-Helfer nicht startbar oder Zeitlimit (${r.error.code || r.error.message})`);
  if (r.status !== 0) throw new Error(`PDF-Helfer fehlgeschlagen: ${String(r.stderr).trim().split('\n').at(-1)}`);
  return JSON.parse(String(r.stdout));
}

export const pdfAnalyse = inhalt => pythonHelfer('analyse', { eingabe: inhalt });

/** Teile eines PDFs zusammenfuegen; schreibt erst ganz zum Schluss. */
const pdfFuegen = plan => pythonHelfer('fuegen', { eingabe: JSON.stringify(plan) });

function htmlZuPdf(html, ziel) {
  const quelle = `${ziel}.html`;
  fs.writeFileSync(quelle, html);
  const r = spawnSync('weasyprint', [quelle, ziel], { env: { ...process.env, PATH: PFAD_MIT_WERKZEUGEN }, encoding: 'utf8' });
  fs.rmSync(quelle, { force: true });
  if (r.error) throw new Error(`weasyprint nicht startbar (${r.error.code || r.error.message})`);
  if (r.status !== 0) throw new Error(`weasyprint fehlgeschlagen: ${String(r.stderr).trim().split('\n').at(-1)}`);
}

/**
 * Eine Mail zu Eintrag und Belegen. Reihenfolge der Daten: XML vor PDF-Text. Eine XML, die zu
 * genau einem Rechnungs-PDF derselben Mail gehoert, ist dessen Datenquelle und kein zweiter Beleg.
 * @returns {{ eintrag, belege: Array<{ meta, inhalt, xmlInhalt }> }}
 */
export function mailAuswerten({ roh, id, thread, eingang, labels, analyse = pdfAnalyse, aliase = {} }) {
  const mail = zerlegeMail(roh);
  const datum = mail.datum || (eingang && !Number.isNaN(new Date(eingang).getTime()) ? new Date(eingang).toISOString() : null);
  const anhaenge = mail.anhaenge
    .filter(a => a.inhalt.length && (istPdf(a.inhalt) || istXml(a)))
    .map((a) => {
      const pdf = istPdf(a.inhalt);
      const info = pdf ? analyse(a.inhalt) : null;
      const eingebettet = (info?.eingebettet || []).map(e => ({ name: e.name, xml: Buffer.from(e.inhalt, 'base64').toString('utf8') })).find(e => istRechnungsXml(e.xml));
      const xmlText = pdf ? eingebettet?.xml ?? null : a.inhalt.toString('utf8');
      return {
        ...a, pdf, info, text: info?.text || '', xmlText,
        xml: !pdf, rechnungsXml: Boolean(xmlText && istRechnungsXml(xmlText)),
        eingebettetName: eingebettet?.name || null,
      };
    });
  const einordnung = einordnen({ von: mail.von, betreff: mail.betreff, labels, anhaenge });
  const eintrag = {
    mailId: id, threadId: thread, von: mail.von.adresse, name: mail.von.name, datum, tag: berlinTag(datum), betreff: mail.betreff,
    labels, klasse: einordnung.klasse, grund: einordnung.grund, ...(einordnung.portal ? { portal: einordnung.portal } : {}),
    anhaenge: mail.anhaenge.filter(a => !a.inline).map(a => a.name || a.typ),
  };
  if (!['rechnung', 'unklar', 'portal'].includes(einordnung.klasse)) return { eintrag, belege: [] };

  const rollen = einordnung.rollen || anhaenge.map(() => (einordnung.klasse === 'unklar' ? 'rechnung' : null));
  const gepaart = new Set();
  const pdfs = anhaenge.map((a, i) => ({ a, i })).filter(x => x.a.pdf && rollen[x.i] === 'rechnung');
  for (const [i, a] of anhaenge.entries()) {
    if (a.pdf || !a.rechnungsXml) continue;
    const stamm = String(a.name).replace(/\.[^.]*$/, '').toLowerCase();
    const passend = pdfs.length === 1 ? pdfs[0] : pdfs.find(p => String(p.a.name).replace(/\.[^.]*$/, '').toLowerCase() === stamm);
    if (passend && !passend.a.xmlText) {
      passend.a.xmlText = a.xmlText;
      passend.a.xmlAnhang = a;
      gepaart.add(i);
    }
  }

  const schluessel = anbieterSchluessel(mail.von.adresse);
  const anbieter = anbieterName(mail.von, aliase);
  const belege = [];
  for (const [i, a] of anhaenge.entries()) {
    if (gepaart.has(i) || (!a.pdf && !a.rechnungsXml)) continue;
    const rolleRoh = rollen[i] || 'beilage';
    const rolle = rolleRoh === 'rechnung' && einordnung.klasse !== 'rechnung' ? 'unklar' : rolleRoh;
    const hash = sha256(a.inhalt);
    const felder = belegFelder({
      xml: a.xmlText, text: a.text, pdfLesbar: a.pdf ? a.info?.lesbar !== false : true, betreff: mail.betreff, name: a.name,
    });
    const tag = berlinTag(datum);
    const meta = {
      datei: archivName({ tag, anbieter, hash, name: a.name || (a.pdf ? 'beleg.pdf' : 'beleg.xml') }),
      sha256: hash, groesse: a.inhalt.length, originalName: a.name, mailId: id, threadId: thread,
      absender: mail.von.adresse, anbieter, anbieterSchluessel: schluessel, datum, tag, betreff: mail.betreff,
      rolle, format: a.pdf ? 'pdf' : 'xml', seiten: a.info?.seiten ?? null, pdfLesbar: a.pdf ? a.info?.lesbar !== false : null,
      zugferd: Boolean(a.pdf && a.eingebettetName), xrechnung: Boolean(a.xmlAnhang || !a.pdf),
      rechnungsnummer: felder.nummer, rechnungsdatum: felder.datum, netto: felder.netto, steuer: felder.steuer, brutto: felder.brutto,
      waehrung: felder.waehrung, art: felder.art, quelle: felder.quelle, pruefen: felder.pruefen,
    };
    // Eingebettete oder mitgeschickte XML wird als eigene Datei abgelegt, das PDF bleibt unberuehrt.
    let xmlInhalt = null;
    if (a.pdf && a.xmlText) {
      xmlInhalt = a.xmlAnhang ? a.xmlAnhang.inhalt : Buffer.from(a.xmlText, 'utf8');
      const xmlHash = sha256(xmlInhalt);
      meta.xmlDatei = archivName({ tag, anbieter, hash: xmlHash, name: a.xmlAnhang?.name || `${a.eingebettetName || 'eingebettet'}${/\.xml$/i.test(a.eingebettetName || '') ? '' : '.xml'}` });
      meta.xmlSha256 = xmlHash;
    }
    belege.push({ meta, inhalt: a.inhalt, xmlInhalt, xmlText: a.xmlText });
  }
  return { eintrag, belege };
}

/** Anbieter mit Rechnungs-Betreff je Vormonat, nur aus den Koepfen. */
async function historieLesen(sitzung, monat, aliase) {
  const historie = {};
  const namen = {};
  for (let s = 1; s <= VORMONATE; s += 1) {
    const m = monatDavor(monat, s);
    const g = monatsGrenzen(m);
    const koepfe = await sitzung(async (v) => {
      const uids = new Set();
      for (const l of LABEL_SUCHEN) for (const u of await v.suche(`${l.q} after:${g.after} before:${g.before}`)) uids.add(u);
      const r = [];
      for (const uid of uids) r.push(await v.kopf(uid));
      return r;
    });
    const je = new Set();
    for (const roh of koepfe) {
      const k = kopfDaten(kopfZerlegen(roh.toString('latin1')));
      if (berlinTag(k.datum)?.slice(0, 7) !== m || !k.von.adresse) continue;
      const e = einordnenKopf({ von: k.von, betreff: k.betreff });
      if ((e && e.klasse !== 'portal') || !WORT_RECHNUNG.test(k.betreff)) continue;
      const sch = anbieterSchluessel(k.von.adresse);
      je.add(sch);
      namen[sch] = namen[sch] || anbieterName(k.von, aliase);
    }
    historie[m] = je;
  }
  return { historie, namen };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `@page { size: A4; margin: 16mm 14mm; @bottom-right { content: "Deckblatt " counter(page) " / " counter(pages); font-size: 8pt; color: #555; } }
body { font-family: Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #111; }
h1 { font-size: 17pt; margin: 0 0 2mm; } h2 { font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 1px solid #444; padding-bottom: 1mm; }
p { margin: 1mm 0; } ul { margin: 1mm 0; padding-left: 5mm; } li { margin: .6mm 0; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: .8mm 1.5mm; border-bottom: .3pt solid #bbb; vertical-align: top; font-size: 8.5pt; }
th { border-bottom: 1px solid #444; } td.z, th.z { text-align: right; white-space: nowrap; } tr { break-inside: avoid; } .klein { color: #444; font-size: 8pt; }`;

/** Deckblatt als HTML: Summen, Liste mit Druckseite, offene Punkte, Auswertung. Alles maskiert. */
export function deckblattHtml(d) {
  const zeile = (zellen) => `<tr>${zellen.map(([w, z]) => `<td${z ? ' class="z"' : ''}>${esc(w)}</td>`).join('')}</tr>`;
  const anteilBasis = d.summen.reduce((a, s) => a + Math.max(s.summe, 0), 0);
  const dauer = new Set(d.wiederkehrend.map(w => w.schluessel));
  const liste = (titel, eintraege) => (eintraege.length ? `<h3 style="font-size:10pt;margin:3mm 0 1mm">${esc(titel)}</h3><ul>${eintraege.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Eingangsrechnungen ${esc(d.monat)}</title><style>${CSS}</style></head><body>
<h1>Eingangsrechnungen ${esc(d.monat)}</h1>
<p class="klein">Stand ${esc(d.stand)}. Kopie zum Abheften, die Originale liegen unverändert im digitalen Archiv (belege-archiv/${esc(d.monat.replace('-', '/'))}).</p>
<p>${d.zahlen.gefunden} Mails geprüft, ${d.zahlen.rechnungen} Rechnungen, ${d.zahlen.druckSeiten} Belegseiten. Summe erkannter Beträge: <b>${esc(eur(d.gesamt))} EUR</b>${d.zahlen.ohneBetrag ? ` – ${d.zahlen.ohneBetrag} Rechnung(en) ohne sicheren Betrag fehlen in der Summe, also Summe unvollständig` : ''}.</p>
<h2>Summen je Lieferant</h2>
<table><tr><th>Anbieter</th><th class="z">Belege</th><th class="z">ohne Betrag</th><th class="z">Summe EUR</th><th class="z">Anteil</th><th>Wiederkehrend</th></tr>
${d.summen.map(s => zeile([[s.anbieter], [s.anzahl, 1], [s.ohneBetrag || '', 1], [`${eur(s.summe)}${s.fremdwaehrung ? ` (+${s.fremdwaehrung} nicht sicher EUR)` : ''}`, 1], [anteilBasis > 0 && s.summe > 0 ? `${Math.round(s.summe / anteilBasis * 100)} %` : '', 1], [dauer.has(s.schluessel) ? 'ja' : '']])).join('\n')}</table>
<h2>Liste der Belege</h2>
<table><tr><th class="z">Seite</th><th>Datum</th><th>Anbieter</th><th>Rechnungsnr.</th><th class="z">Betrag EUR</th><th>Prüfen</th></tr>
${d.liste.map(b => zeile([[b.seite ?? 'fehlt', 1], [b.tag], [b.anbieter], [b.rechnungsnummer || ''], [b.brutto === null ? '' : `${eur(b.brutto)}${b.waehrung !== 'EUR' ? ` ${b.waehrung || '?'}` : ''}`, 1], [(b.pruefen || []).join('; ')]])).join('\n')}</table>
<h2>Offene Punkte</h2>
${liste('Portal-Belege selbst holen (liegen nicht als Anhang vor)', d.portale.map(p => `${p.name}: ${p.wo}${p.hinweise ? ` – ${p.hinweise} Hinweis-Mail(s) im Monat` : ' – keine Hinweis-Mail im Monat'}${p.belege ? `, ${p.belege} Beleg(e) kamen per Mail` : ''}`))}
${liste('Fehlende Monatsbelege wiederkehrender Anbieter', d.fehlend.map(f => f.anbieter))}
${liste('Unklare Mails (Anhang im Archiv, nicht im Druck und nicht in der Summe)', d.unklar.map(m => `${m.tag || 'ohne Datum'} · ${m.von || 'unbekannt'} · ${m.betreff || '(kein Betreff)'} – ${m.grund}`))}
${liste('Nicht im Druck', d.nichtImDruck.map(b => `${b.anbieter} · ${b.tag} · ${b.originalName || b.datei} – ${b.grund}`))}
${liste('Doppelt erkannt, nur einmal gedruckt', d.dubletten.map(b => `${b.anbieter} · ${b.tag} · ${b.originalName || b.datei}`))}
${liste('Fehler beim Lesen', d.fehler.map(f => `${f.was}: ${f.fehler}`))}
${d.portale.length || d.fehlend.length || d.unklar.length || d.nichtImDruck.length || d.dubletten.length || d.fehler.length ? '' : '<p>Keine.</p>'}
<h2>Auswertung (nur Hinweise)</h2>
<p>Wiederkehrend heißt: in den ${VORMONATE} Vormonaten jeweils mit Rechnungs-Mail da. ${d.wiederkehrend.length ? `Das sind: ${esc(d.wiederkehrend.map(w => w.anbieter).join(', '))}.` : 'Keine erkannt.'}</p>
${d.kandidaten.length ? `<p>Kandidaten zur Prüfung (wiederkehrend, kleine Summe; ob gebraucht, entscheidet der Inhaber): ${esc(d.kandidaten.map(k => `${k.anbieter} ${eur(k.summe)} EUR`).join(', '))}.</p>` : ''}
<p class="klein">Aussortiert: ${esc(Object.entries(d.aussortiert).map(([k, n]) => `${k} ${n}`).join(', ') || 'nichts')}. Beträge und Rechnungsnummern nur aus XML oder sicher aus PDF-Text; sonst leer und „Prüfen“. Maschinell erzeugt, keine Buchungsgrundlage.</p>
</body></html>`;
}

/** Ersatzansicht fuer eine reine XML-Rechnung: sie laesst sich nicht direkt heften. */
export function xmlAnsichtHtml(meta, xml) {
  const f = xmlRechnungLesen(xml) || {};
  const z = [['Absender', meta.absender], ['Verkäufer laut XML', f.verkaeufer], ['Rechnungsnummer', f.nummer], ['Rechnungsdatum', f.datum], ['Netto', eur(f.netto)], ['Steuer', eur(f.steuer)], ['Brutto', eur(f.brutto)], ['Währung', f.waehrung], ['Originaldatei im Archiv', meta.datei], ['SHA-256', meta.sha256]];
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${CSS.replace(/@bottom-right \{[^}]*\}/, '')}</style></head><body><h1>Elektronische Rechnung (Ersatzansicht)</h1><p>Das Original ist die XML-Datei im Archiv. Diese Seite zeigt nur Kopfdaten und ersetzt das Original nicht.</p><table>${z.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></body></html>`;
}

/** Baut die Drucksachen. Die Deckblatt-Seitenzahl steht erst nach dem ersten Rendern fest. */
function druckBauen({ ordner, monat, daten, belegeFuerDruck, seitenVon }) {
  const temp = fs.mkdtempSync(path.join(ordner, '.druck-'));
  try {
    const teile = [];
    let seitenBelege = 0;
    const startInBelegen = new Map();
    for (const b of belegeFuerDruck) {
      let pfad = path.join(ordner, b.datei);
      let seiten = b.seiten;
      if (b.format === 'xml') {
        pfad = path.join(temp, `${b.sha256}.pdf`);
        htmlZuPdf(xmlAnsichtHtml(b, fs.readFileSync(path.join(ordner, b.datei), 'utf8')), pfad);
        seiten = seitenVon(pfad);
      }
      startInBelegen.set(b.datei, seitenBelege);
      seitenBelege += seiten || 0;
      teile.push({ pfad, titel: `${b.anbieter} ${b.tag}${b.rechnungsnummer ? ` ${b.rechnungsnummer}` : ''}` });
    }
    const deck = path.join(temp, 'deckblatt.pdf');
    const render = (versatz) => {
      const liste = daten.liste.map(b => (startInBelegen.has(b.datei) ? { ...b, seite: versatz + startInBelegen.get(b.datei) + 1 } : b));
      htmlZuPdf(deckblattHtml({ ...daten, liste, zahlen: { ...daten.zahlen, druckSeiten: seitenBelege } }), deck);
      return seitenVon(deck);
    };
    let deckSeiten = render(0);
    const zweite = render(deckSeiten);
    if (zweite !== deckSeiten) { deckSeiten = zweite; render(deckSeiten); }
    const ziel = path.join(ordner, `druck-${monat}.pdf`);
    const erg = pdfFuegen({ ausgabe: ziel, teile: [{ pfad: deck, titel: 'Deckblatt' }, ...teile] });
    return { datei: path.basename(ziel), seiten: erg.seiten, deckblatt: deckSeiten, fehler: erg.fehler.map(f => ({ datei: path.basename(f.pfad), fehler: f.fehler })) };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function jsonLesen(pfad, ersatz) {
  try { return JSON.parse(fs.readFileSync(pfad, 'utf8')); } catch { return ersatz; }
}

/**
 * Der Lauf. `sitzungOeffnen` und `analyse` lassen sich in Tests ersetzen.
 * @returns zahlen fuer die Ausgabe (keine Namen)
 */
export async function lauf({ monat, schreiben = false, privat, zugang, sitzungOeffnen = mitNurLesen, analyse = pdfAnalyse, drucken = true, jetzt = new Date() }) {
  const g = monatsGrenzen(monat);
  const ordner = path.join(belegeOrdner(privat), g.jahr, g.mm);
  const aliase = jsonLesen(path.join(belegeOrdner(privat), 'anbieter.json'), {});
  const vormonat = monatDavor(monat);
  const [vj, vm] = vormonat.split('-');
  const vorSha = new Set((jsonLesen(path.join(belegeOrdner(privat), vj, vm, 'manifest.json'), {}).belege || []).map(b => b.sha256));

  const fehler = [];
  const mails = [];
  const roheBelege = [];
  const suchen = [];
  let ausserhalb = 0;
  // Gmail trennt lange Sitzungen (gemessen: nach knapp 4 Minuten). Deshalb kurze Sitzungen je
  // Paket und ein einziger Wiederholversuch; die Auswertung laeuft erst nach dem Holen.
  const sitzung = async (arbeit) => {
    try { return await sitzungOeffnen(zugang, arbeit); } catch (e) {
      if (!(e instanceof ImapFehler) || /Anmeldung/.test(e.message)) throw e;
      return sitzungOeffnen(zugang, arbeit);
    }
  };
  const treffer = new Map();
  const daten0 = await sitzung(async (s) => {
    treffer.clear();
    suchen.length = 0;
    for (const l of LABEL_SUCHEN) {
      const q = `${l.q} after:${g.after} before:${g.before}`;
      const uids = await s.suche(q);
      suchen.push({ label: l.kurz, q, treffer: uids.length });
      for (const u of uids) treffer.set(u, [...(treffer.get(u) || []), l.kurz]);
    }
    return s.daten([...treffer.keys()]);
  });
  if (daten0.length !== treffer.size) fehler.push({ was: 'Kennungen', fehler: `${treffer.size - daten0.length} Nachricht(en) ohne Kennung` });
  for (let i = 0; i < daten0.length; i += MAILS_JE_SITZUNG) {
    const paket = daten0.slice(i, i + MAILS_JE_SITZUNG);
    const rohe = await sitzung(async (s) => {
      const r = [];
      for (const d of paket) r.push(await s.nachricht(d.uid));
      return r;
    });
    for (const [j, d] of paket.entries()) {
      try {
        const { eintrag, belege } = mailAuswerten({ roh: rohe[j], id: d.id, thread: d.thread, eingang: d.eingang, labels: treffer.get(d.uid), analyse, aliase });
        if (eintrag.tag?.slice(0, 7) !== monat) { ausserhalb += 1; continue; }
        mails.push(eintrag);
        roheBelege.push(...belege);
      } catch (e) {
        fehler.push({ was: `Mail ${d.id}`, fehler: String(e?.message || e).slice(0, 160) });
      }
    }
  }
  const hist = await historieLesen(sitzung, monat, aliase);

  const neu = roheBelege.map(b => b.meta);
  dublettenMarkieren(neu);
  for (const b of neu) if (vorSha.has(b.sha256) && b.rolle === 'rechnung') b.pruefen.push('Gleiche Datei schon im Vormonat archiviert');
  const pfad = path.join(ordner, 'manifest.json');
  const alt = jsonLesen(pfad, {}).belege;
  const belege = manifestZusammenfuehren(alt, neu);
  const aktiv = belege.filter(b => !b.nichtMehrGefunden);

  const summen = summenJeAnbieter(aktiv);
  const unklar = mails.filter(m => m.klasse === 'unklar');
  const aktuell = [...aktiv.filter(b => b.rolle === 'rechnung').map(b => b.anbieterSchluessel), ...mails.filter(m => ['portal', 'unklar'].includes(m.klasse)).map(m => anbieterSchluessel(m.von))];
  const wk = wiederkehrend({ historie: hist.historie, aktuell, namen: { ...hist.namen, ...Object.fromEntries(summen.map(s => [s.schluessel, s.anbieter])) } });
  const aussortiert = {};
  for (const m of mails) if (!['rechnung', 'unklar', 'portal'].includes(m.klasse)) aussortiert[m.klasse] = (aussortiert[m.klasse] || 0) + 1;
  const portale = PORTALE.map(p => ({
    name: p.name, wo: p.wo,
    hinweise: mails.filter(m => m.klasse === 'portal' && m.portal === p.name).length,
    belege: aktiv.filter(b => p.absender.test(b.absender) && b.rolle === 'rechnung').length,
  }));
  const reihenfolge = druckReihenfolge(aktiv);
  const nichtImDruck = reihenfolge.filter(b => b.format === 'pdf' && b.pdfLesbar === false).map(b => ({ ...b, grund: 'PDF nicht lesbar (verschlüsselt oder beschädigt)' }));
  const belegeFuerDruck = reihenfolge.filter(b => !(b.format === 'pdf' && b.pdfLesbar === false));
  const daten = {
    monat, stand: berlinTag(jetzt.toISOString()), gesamt: summen.reduce((a, s) => Math.round((a + s.summe) * 100) / 100, 0),
    summen, liste: reihenfolge.map(b => ({ datei: b.datei, tag: b.tag, anbieter: b.anbieter, rechnungsnummer: b.rechnungsnummer, brutto: b.brutto, waehrung: b.waehrung, pruefen: b.pruefen, seite: null })),
    portale, fehlend: wk.fehlend, wiederkehrend: wk.wiederkehrend, kandidaten: pruefKandidaten(summen, wk.wiederkehrend.map(w => w.schluessel)),
    unklar, nichtImDruck, dubletten: aktiv.filter(b => b.dublette), fehler, aussortiert,
    zahlen: { gefunden: mails.length, rechnungen: reihenfolge.length, ohneBetrag: reihenfolge.filter(b => b.brutto === null).length, druckSeiten: 0 },
  };

  const ergebnis = {
    monat, schreiben, suchen: suchen.map(s => `${s.label}: ${s.treffer}`), mails: mails.length, ausserhalbMonat: ausserhalb,
    rechnungen: reihenfolge.length, beilagen: aktiv.filter(b => b.rolle === 'beilage').length, unklareMails: unklar.length,
    unklareAnhaenge: aktiv.filter(b => b.rolle === 'unklar').length, dubletten: daten.dubletten.length, aussortiert, ohneBetrag: daten.zahlen.ohneBetrag,
    zumPruefen: reihenfolge.filter(b => b.pruefen.length).length, mitXml: reihenfolge.filter(b => b.zugferd || b.xrechnung).length,
    fehlendeWiederkehrende: wk.fehlend.length, fehler: fehler.length,
  };
  if (!schreiben) return ergebnis;

  fs.mkdirSync(ordner, { recursive: true, mode: 0o700 });
  let neuAbgelegt = 0;
  for (const b of roheBelege) {
    if (ablegenUnveraenderlich(path.join(ordner, b.meta.datei), b.inhalt) === 'neu') neuAbgelegt += 1;
    if (b.xmlInhalt) ablegenUnveraenderlich(path.join(ordner, b.meta.xmlDatei), b.xmlInhalt);
  }
  let druck = null;
  if (drucken) {
    druck = druckBauen({ ordner, monat, daten, belegeFuerDruck, seitenVon: p => pythonHelfer('seiten', { arg: p }).seiten });
    for (const f of druck.fehler) fehler.push({ was: `Druck ${f.datei}`, fehler: f.fehler });
  }
  const temp = `${pfad}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ ...daten, liste: undefined, suchen, mails, belege, druck, erzeugt: jetzt.toISOString() }, null, 1)}\n`, { mode: 0o600 });
  fs.renameSync(temp, pfad);
  return { ...ergebnis, neuAbgelegt, druckSeiten: druck?.seiten ?? null, deckblattSeiten: druck?.deckblatt ?? null, fehler: fehler.length, ordner };
}

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

async function main(args) {
  const monat = argWert(args, '--monat');
  if (!monat) throw new Error('Aufruf: belege:monat -- --monat JJJJ-MM [--schreiben]');
  monatsGrenzen(monat);
  const privat = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
  const zugang = lesePostfach(path.join(privat, 'nachfassen', 'postfach.json'));
  if (!zugang.zugang) throw new Error(`kein Postfach-Zugang (${zugang.hinweis || 'nachfassen/postfach.json'})`);
  const e = await lauf({ monat, schreiben: args.includes('--schreiben'), privat, zugang: zugang.zugang });
  console.log(JSON.stringify(e, null, 1));
  if (e.fehler) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(String(e?.message || e));
    process.exitCode = 1;
  });
}
