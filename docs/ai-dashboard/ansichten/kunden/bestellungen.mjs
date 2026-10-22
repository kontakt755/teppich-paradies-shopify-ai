/**
 * Kunden, Reiter "Bestellungen": vollwertige Bestellliste wie im Shopify-Admin,
 * nur uebersichtlicher. Eine Zeile je Bestellung, sortierbar, filterbar,
 * durchsuchbar; Klick auf die Zeile klappt die Detailansicht auf.
 */
import {
  bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname, sortiereNachWichtigkeit,
} from '../../lib/kunden-bestellgruppen.mjs';
import { bestellArbeitsstand, bestellungAusgeblendet, bestellPruefgruende, bestellZahlungOffen } from '../../lib/bestellarbeit.mjs';
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural, toast, geldText } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { einkauf, AF_STATUS_LABEL, setzeAuftragsstatus, ladeStandNeu } from '../einkauf/auftragsfluss.mjs';
import { kunden, telLink, kundenAuftragKarte, ZAHLUNG_TEXT, VERSAND_TEXT, statusText } from './gemeinsam.mjs';
import { zeitleisteBlock, auftragAusZeile, zeitleisteKlick } from './zeitleiste.mjs';
import { oeffneVersandDialog } from '../einkauf/versand.mjs';
import { bestellinhalt } from '../../lib/bestellinhalt.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { aktualisiereMusteretiketten, bestellungsEtikettenDrucken, musteretikettenBlock, musteretikettenKlick } from './musteretiketten.mjs';

/** Setzt den Auftragsfluss-Status fuer ALLE Positionen einer Bestellung auf einmal (Bereich Kunden/Bestellungen). */
async function setzeAuftragsstatusFuerBestellung(orderId, status) {
  const zeile = (kunden.bestellungen?.zeilen || []).find(z => z.orderId === orderId);
  const positionen = (zeile?.auftrag?.positionen || []).filter(p => p.lineItemId);
  if (!positionen.length) { toast('Keine Positionen mit Auftragsfluss gefunden', 'warn'); return; }
  let ok = 0;
  for (const p of positionen) {
    const gesetzt = await setzeAuftragsstatus({ orderId, lineItemId: p.lineItemId, orderName: zeile.orderName, titel: p.titel, farbe: p.farbe }, status, { still: true, nachladen: false });
    if (gesetzt) ok += 1;
  }
  toast(`${ok}/${positionen.length} Artikel: ${AF_STATUS_LABEL[status]}`);
  // Nach dem Sammelschritt nur einmal frisch lesen. Der vorhandene Helfer bewahrt lesbare
  // Bestell-/Packlisten bei Abruffehlern; ein Lesefehler darf keine Schreibwiederholung ausloesen.
  try { await ladeStandNeu(); }
  catch {
    toast(`${ok}/${positionen.length} Artikel gespeichert. Listen nicht vollständig neu geladen – letzter lesbarer Stand bleibt sichtbar.`, 'warn');
    render();
  }
}

export function ensureKundenBestellungen() {
  if (kunden.bestellungen || kunden.loadingBestellungen) return;
  kunden.loadingBestellungen = true;
  fetchEinkauf('/api/kunden/bestellungen').then(d => {
    kunden.bestellungen = d; kunden.loadingBestellungen = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

// "nicht_fertig" zuerst - das ist die Voreinstellung (Inhabervorgabe: "welcher
// Kunde ist fertig, welcher nicht" soll sofort sichtbar sein). Muss zu
// operations/lib/bestellliste.mjs (FILTERCHIPS/wendeFilterAn) passen.
const BQ_FILTER_LABEL = { nicht_fertig: 'Offen', alle: 'Alle Bestellungen', pruefen: 'Kontrolle nötig', fertig: 'Abgehakt / versandt', offen: 'Zahlung offen', bezahlt: 'Bezahlt', unerfuellt: 'Unerfüllt', storniert: 'Storniert', beratung: 'Beratung offen', muster: 'Muster', test: 'Testbestellung' };
const BQ_SORT_LABEL = { wichtigkeit: 'Wichtigkeit', datum: 'Datum', orderName: 'Bestellnr.', kundenname: 'Kunde', gesamtbetrag: 'Betrag', zahlungsstatus: 'Zahlung', fulfillmentstatus: 'Versand', anzahlArtikel: 'Artikel', fortschritt: 'Fortschritt' };

const KANAL_TEXT = { web: 'Onlineshop', pos: 'Ladengeschäft', shopify_draft_order: 'Angebot' };

function bqFeldTreffer(felder, q) { return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(q)); }

function bestellzeileGefiltert(zeilen, params) {
  const filter = params.get('bfilter') || 'nicht_fertig';
  const q = (params.get('bq') || '').trim().toLowerCase();
  // Neueste Bestellung oben (Inhabervorgabe 2026-10-22) - vorher Kundenname A-Z.
  const sort = params.get('bsort') || 'datum';
  const dir = params.get('bdir') || (sort === 'kundenname' ? 'asc' : 'desc');
  // "Nicht fertig" laesst fertige Bestellungen drin - sie landen im Bereich "Erledigt" (istErledigt).
  let liste = zeilen.filter(z => filter === 'nicht_fertig' ? !z.testbestellung && !z.storniert
    : filter === 'pruefen' ? bestellPruefgruende(z).length > 0
    : filter === 'fertig' ? (istErledigt(z) && !z.testbestellung)
    : filter === 'offen' ? bestellZahlungOffen(z)
    : filter === 'bezahlt' ? z.zahlungsstatus === 'PAID'
    : filter === 'unerfuellt' ? ['UNFULFILLED', 'PARTIALLY_FULFILLED', null].includes(z.fulfillmentstatus)
    : filter === 'storniert' ? z.storniert
    : filter === 'beratung' ? z.beratungOffen
    : filter === 'muster' ? (z.tags.typ.some(t => /muster/i.test(t)) || (z.auftrag?.positionen || []).some(p => p.istMuster))
    : filter === 'test' ? z.testbestellung
    : !z.testbestellung);
  // Auch Produkt und Farbe: "wer hat das Regalia-Muster bestellt?" findet sich so ohne Aufklappen.
  if (q) liste = liste.filter(z => bqFeldTreffer([z.orderName, z.kundenname, z.email, z.telefon, z.kundenId, z.kanal, z.zustellmethode, z.zahlungsstatus, z.fulfillmentstatus, ...(z.tags.beratung || []), ...(z.tags.typ || []), ...(z.tags.sonstige || []),
    ...(z.auftrag?.positionen || []).flatMap(p => [p.titel, p.farbe])], q));
  const cmp = {
    datum: z => z.datum || '', orderName: z => z.orderName || '', kundenname: z => (z.kundenname || '').toLowerCase(),
    gesamtbetrag: z => z.gesamtbetrag ?? -Infinity, zahlungsstatus: z => z.zahlungsstatus || '', fulfillmentstatus: z => z.fulfillmentstatus || '', anzahlArtikel: z => z.anzahlArtikel ?? 0,
    fortschritt: z => z.fortschritt?.minStufe ?? 0,
  }[sort] || (z => z.datum || '');
  // Voreinstellung (Inhaber 22.10.): wer am dringendsten etwas braucht, steht oben.
  if (sort === 'wichtigkeit') return sortiereNachWichtigkeit(liste);
  const vz = dir === 'asc' ? 1 : -1;
  const namen = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
  liste = [...liste].sort((a, b) => {
    if (sort === 'kundenname') {
      if (!a.kundenname || !b.kundenname) return Number(!a.kundenname) - Number(!b.kundenname);
      return namen.compare(sortKundenname(a.kundenname), sortKundenname(b.kundenname)) * vz
        || namen.compare(bestellKundenKey(a), bestellKundenKey(b))
        || String(b.datum || '').localeCompare(String(a.datum || ''));
    }
    const av = cmp(a), bv = cmp(b);
    return av < bv ? -vz : av > bv ? vz : 0;
  });
  return liste;
}

function fortschrittKlasse(stufe) {
  if (stufe === 'erledigt' || stufe === 'keine') return 'erledigt';
  if (stufe === 'offen') return 'offen';
  return 'unterwegs';
}

/**
 * Versand: der Stand kommt aus dem Auftragsfluss, Shopify nur als Hinweis. Steht die Ware dort
 * schon "An Kunden raus", hiess es in derselben Zeile sonst zugleich "Noch nicht versandt".
 */
function versandZelle(z) {
  if (z.versandHinweis) return `<span class="small muted" title="Im Auftragsfluss an Kunden raus – in Shopify ist keine Sendung gebucht.">in Shopify nicht gebucht</span>`;
  return statusText(z.fulfillmentstatus, VERSAND_TEXT);
}

function wertText(v) { return v === null || v === undefined ? '<span class="small muted">nicht hinterlegt</span>' : esc(v); }

function bestellzeileAktionen(z) {
  // Rolle "lesen" darf nichts aendern - der Server lehnt ab, die Knoepfe
  // endeten in einer Fehlermeldung. Der Weg zur Rueckrufliste bleibt, das
  // ist nur Navigation.
  const lesend = istNurLesend();
  const af = ['bestellt', 'geliefert', 'raus'];
  return `<div class="btn-row">
    ${lesend ? '' : af.map(s => `<button type="button" class="btn btn-sm btn-ghost" data-bq-af="${esc(z.orderId)}" data-bq-af-status="${s}" title="${esc(`Alle Artikel dieser Bestellung auf „${AF_STATUS_LABEL[s]}“`)}">${esc(AF_STATUS_LABEL[s])}${s === 'raus' ? '…' : ''}</button>`).join('')}
    ${!lesend && !z.fertig && z.anzahlArtikel ? `<button type="button" class="btn btn-sm btn-primary" data-bq-fertig="${esc(z.orderId)}">Kunde fertig …</button>` : ''}
    ${(z.auftrag?.positionen || []).some(p => p?.istMuster) ? `<button type="button" class="btn btn-sm" data-bq-etiketten="${esc(z.orderId)}">Etiketten drucken</button>` : ''}
    ${z.beratungOffen ? `<a class="btn btn-sm" href="#/kunden?tab=rueckrufe">Zur Rückrufliste →</a>` : ''}
  </div>`;
}

/** "Kunde fertig": alle Positionen einer Bestellung auf Erledigt - mit Rueckfrage,
 * kein stiller Massenwechsel. Protokolleintrag laeuft serverseitig (merke()). */
async function kundeFertigSetzen(orderId) {
  const zeile = (kunden.bestellungen?.zeilen || []).find(z => z.orderId === orderId);
  const ids = (zeile?.auftrag?.positionen || []).filter(p => p.lineItemId).map(p => p.lineItemId);
  if (!ids.length) return;
  const test = zeile.auftrag?.testbestellung;
  if (!window.confirm(`${zeile.orderName}: alle ${ids.length} Artikel dieser Bestellung wirklich auf „Erledigt" setzen?${test ? '' : '\n\nIn Shopify wird die Bestellung als versendet gebucht, falls noch nicht geschehen – ohne Mail an den Kunden.'}`)) return;
  try {
    const r = await fetch('/api/kunden/bestellung-fertig', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, lineItemIds: ids, notiz: 'Kunde fertig (Sammelschritt, Bestellliste)' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return; }
    const rm = versandRueckmeldung(`${zeile.orderName}: ${j.anzahl} Artikel abgeschlossen`, j.shopify);
    toast(rm.text, rm.ton, rm.ton ? { dauer: 9000 } : {});
    kunden.bestellungen = null;
    einkauf.auftragsstatus = null;
    ensureKundenBestellungen();
    render();
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); }
}

/** E-Mail und Telefon in einer Spalte - zwei eigene Spalten sprengten die Breite. */
function kontaktZelle(z) {
  const teile = [];
  if (z.email) teile.push(`<a href="mailto:${esc(z.email)}">${esc(z.email)}</a> <button type="button" class="btn btn-sm btn-ghost" data-kopiertext="${esc(z.email)}">Kopieren</button>`);
  if (z.telefon) teile.push(`${telLink(z.telefon)} <button type="button" class="btn btn-sm btn-ghost" data-kopiertext="${esc(z.telefon)}">Kopieren</button>`);
  return teile.length ? teile.join('<br>') : '<span class="small muted">kein Kontakt hinterlegt</span>';
}

/**
 * Selten gebrauchte Angaben (Kunden-ID, Kanal, Zustellmethode, Artikelzahl,
 * Tags) standen als eigene Spalten in der Tabelle - fuenfzehn Spalten, die
 * niemand ohne Scrollen ueberblickt. Sie stehen jetzt in der aufgeklappten
 * Zeile; die Suche findet sie weiterhin.
 */
function weitereAngaben(z, tagListe) {
  const zeile = (label, wert) => `<div><span class="small muted">${esc(label)}</span><div>${wert}</div></div>`;
  return `<div class="bq-weitere">
    ${zeile('Kunden-ID', wertText(z.kundenId))}
    ${zeile('Kanal', statusText(z.kanal, KANAL_TEXT))}
    ${zeile('Zustellmethode', wertText(z.zustellmethode))}
    ${zeile('Artikel', String(z.anzahlArtikel ?? '–'))}
    ${zeile('Tags', tagListe.length ? tagListe.map(t => `<span class="tag">${esc(t)}</span>`).join(' ') : '<span class="small muted">keine</span>')}
  </div>`;
}

/**
 * Was bestellt wurde, ohne Aufklappen (Inhaber 2026-10-13): bei Mustern Produkt und Farben und
 * woher sie kommen, bei Ware die Artikel. Steht unter der Zeile ueber die ganze Breite.
 */
function inhaltHtml(z) {
  const i = bestellinhalt(z.auftrag?.positionen);
  const zeilen = [];
  if (i.muster.anzahl) {
    zeilen.push(`<div class="bq-inhalt-zeile"><span class="bq-art">${esc(i.muster.anzahl === 1 ? '1 Muster' : `${i.muster.anzahl} Muster`)}</span> <span class="bq-was">${esc(i.muster.text)}</span>${i.muster.herkunft ? ` <span class="bq-herkunft">${esc(i.muster.herkunft)}</span>` : ''}<button type="button" class="btn btn-sm btn-ghost" data-bq-musteretiketten-open="${esc(z.orderId)}">Musteraufkleber ansehen</button></div>`);
  }
  if (i.ware.anzahl) {
    zeilen.push(`<div class="bq-inhalt-zeile"><span class="bq-art bq-art-ware">${esc(i.ware.anzahl === 1 ? '1 Artikel' : `${i.ware.anzahl} Artikel`)}</span> <span class="bq-was">${esc(i.ware.text)}</span></div>`);
  }
  return zeilen.join('');
}

/** Reine Musterbestellung ohne Betrag: "kostenlos" sagt mehr als "0,00 €". */
function betragText(z) {
  if (!z.gesamtbetrag && bestellinhalt(z.auftrag?.positionen).art === 'muster') return '<span class="small muted">kostenlos</span>';
  return geldText({ betrag: z.gesamtbetrag, waehrung: z.waehrung });
}

/**
 * Abhaken (Inhaber 2026-10-22): erledigte Bestellungen rutschen in den eingeklappten
 * Bereich "Erledigt" - gemeinsam fuer alle, ohne Shopify-Buchung (das macht "Kunde fertig").
 */
/** Erledigt: von Hand abgehakt oder in Shopify/Auftragsfluss abgeschlossen (Abgleich laeuft serverseitig). */
function automatischErledigt(z) { return z.fertig || z.fulfillmentstatus === 'FULFILLED'; }
function istErledigt(z) { return bestellungAusgeblendet(z); }
export function bestellungenOffen() { return kunden.bestellungen?.verfuegbar ? kunden.bestellungen.zeilen.filter(z => !z.testbestellung && !z.storniert && !istErledigt(z)).length : null; }

function hakenKnopf(z) {
  if (!z.abgehakt && automatischErledigt(z)) return '<span class="bq-haken-auto" title="In Shopify bzw. im Auftragsfluss abgeschlossen">✓</span> ';
  if (istNurLesend()) return '';
  return z.abgehakt
    ? `<button type="button" class="btn btn-sm btn-ghost bq-haken" data-bq-haken="${esc(z.orderId)}" data-bq-haken-wert="0" title="Zurück in die offene Liste" aria-label="${esc(`${z.orderName} zurückholen`)}">↩</button> `
    : `<button type="button" class="btn btn-sm btn-ghost bq-haken" data-bq-haken="${esc(z.orderId)}" data-bq-haken-wert="1" title="Abhaken – nur aus der Arbeitsliste, ohne Versandbuchung" aria-label="${esc(`${z.orderName} abhaken`)}">☐</button> `;
}

async function hakenSetzen(orderId, erledigt) {
  const zeile = (kunden.bestellungen?.zeilen || []).find(z => z.orderId === orderId);
  if (!zeile) return;
  const vorher = zeile.abgehakt;
  zeile.abgehakt = erledigt ? { zeit: new Date().toISOString() } : null;
  render();
  try {
    const r = await fetch('/api/kunden/bestellung-abhaken', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, erledigt }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.status);
    zeile.abgehakt = j.abgehakt;
    toast(erledigt ? `${zeile.orderName} abgehakt` : `${zeile.orderName} wieder offen`);
  } catch (e) {
    zeile.abgehakt = vorher;
    toast(`Fehler: ${e.message}`, 'crit');
  }
  render();
}

function bestellzeileHtml(z) {
  const offenKlasse = kunden.erweitert.has(z.orderId) ? ' offen' : '';
  const tagListe = [...z.tags.beratung, ...z.tags.typ, ...z.tags.sonstige];
  const pk = fortschrittKlasse(z.fortschritt?.stufe);
  const inhalt = inhaltHtml(z);
  return `<tr class="bq-row${offenKlasse}${inhalt ? ' mit-inhalt' : ''}" data-bq-toggle="${esc(z.orderId)}" tabindex="0" role="button" aria-expanded="${kunden.erweitert.has(z.orderId)}" aria-label="Bestellung ${esc(z.orderName)} von ${esc(z.kundenname)} auf- oder zuklappen">
      <td data-l="Bestellnr.">${hakenKnopf(z)}<a href="${esc(z.adminUrl)}" target="_blank" rel="noopener">${esc(z.orderName)}</a>${neuBadge(z)}${z.testbestellung ? ' <span class="badge plain">Test</span>' : ''}</td>
      <td data-l="Kunde">${z.kundenSchluessel ? `<a href="#" data-kunden-open="${esc(z.kundenSchluessel)}">${wertText(z.kundenname)}</a>` : wertText(z.kundenname)}<div class="small muted">${fmtDateTime(z.datum)} · ${betragText(z)}</div></td>
      <td data-l="Stand"><span class="bq-fortschritt ${pk}">${esc(bestellArbeitsstand(z).stand)}</span>${z.zahlungsstatus !== 'PAID' ? `<div class="small">${statusText(z.zahlungsstatus, ZAHLUNG_TEXT)}</div>` : ''}</td>
      <td data-l="Nächster Schritt">${esc(bestellArbeitsstand(z).naechstes)}</td>
    </tr>
    ${inhalt ? `<tr class="bq-inhalt${offenKlasse}" data-bq-toggle="${esc(z.orderId)}"><td colspan="4">${inhalt}</td></tr>` : ''}
    ${kunden.erweitert.has(z.orderId) ? `<tr class="bq-detail"><td colspan="4">${musteretikettenBlock(z)}${zeitleisteBlock(auftragAusZeile(z), { kontakt: true })}<details><summary>Kontakt, Zahlung und weitere Angaben</summary>${kontaktZelle(z)}${weitereAngaben(z, tagListe)}</details><details><summary>Artikel und Beleg ansehen</summary>${kundenAuftragKarte(z.auftrag, { ohneStatus: true })}</details>${bestellzeileAktionen(z)}</td></tr>` : ''}`;
}

function bestellzeileKarte(z, gruppiert = false) {
  const pk = fortschrittKlasse(z.fortschritt?.stufe);
  return `<div class="row bq-karte" data-bq-toggle="${esc(z.orderId)}" tabindex="0" role="button" aria-expanded="${kunden.erweitert.has(z.orderId)}" aria-label="Bestellung ${esc(z.orderName)} von ${esc(z.kundenname || 'unbekannt')} auf- oder zuklappen">
    <div>
      <div class="t">${hakenKnopf(z)}${esc(z.orderName)}${neuBadge(z)}${gruppiert ? '' : ` · ${wertText(z.kundenname)}`}${z.testbestellung ? ' <span class="badge plain">Test</span>' : ''}</div>
      <div class="m">${betragText(z)} · ${statusText(z.zahlungsstatus, ZAHLUNG_TEXT)} · ${fmtDate(z.datum)}</div>
      ${inhaltHtml(z) ? `<div class="bq-inhalt-mobil">${inhaltHtml(z)}</div>` : ''}
      <div class="m"><span class="bq-fortschritt ${pk}">${esc(bestellArbeitsstand(z).stand)}</span></div>
      <div class="m">${esc(bestellArbeitsstand(z).naechstes)}</div>
    </div>
    <div class="r"><span class="small muted">${kunden.erweitert.has(z.orderId) ? 'zuklappen ▲' : 'Details ▼'}</span></div>
  </div>
  ${kunden.erweitert.has(z.orderId) ? `<div class="bq-detail-mobil">${musteretikettenBlock(z)}${zeitleisteBlock(auftragAusZeile(z), { kontakt: true })}<details><summary>Artikel und Beleg ansehen</summary>${kundenAuftragKarte(z.auftrag, { ohneStatus: true })}</details>${bestellzeileAktionen(z)}</div>` : ''}`;
}

export function viewKundenBestellungen() {
  ensureKundenBestellungen();
  const d = kunden.bestellungen;
  if (!d && kunden.loadingBestellungen) return `<div class="empty">Lade Bestellungen …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Bestellliste');
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  const params = state.route.params;
  const filter = params.get('bfilter') || 'nicht_fertig';
  const sort = params.get('bsort') || 'datum';
  const dir = params.get('bdir') || (sort === 'kundenname' ? 'asc' : 'desc');
  const gefiltert = bestellzeileGefiltert(d.zeilen, params);
  // Auch eine offene Zahlung bleibt nach Versand oder manuellem Haken direkt sichtbar.
  const direkt = ['alle', 'pruefen', 'fertig', 'storniert', 'test', 'offen'].includes(filter);
  const zeilen = direkt ? gefiltert : gefiltert.filter(z => !istErledigt(z));
  // Ohne Suche nur die letzten 30 Tage - sonst wuechse "Erledigt" endlos. Aeltere findet die Suche.
  const grenze = Date.now() - ERLEDIGT_TAGE * 864e5;
  const erledigtAlle = direkt ? [] : gefiltert.filter(istErledigt).sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  const erledigt = params.get('bq') ? erledigtAlle : erledigtAlle.filter(z => Date.parse(z.datum) >= grenze);
  const erledigtAelter = erledigtAlle.length - erledigt.length;
  const alleGruppen = ['kundenname', 'wichtigkeit'].includes(sort) ? gruppiereBestellzeilenNachKunde(zeilen) : null;
  // Seitenweise (25 Kunden bzw. 25 Bestellungen): die volle Liste samt Produktinhalt wurde
  // am Handy mehrere Meter lang (Codex-Audit 2026-10-19).
  const einheiten = alleGruppen || zeilen;
  const seiten = Math.max(1, Math.ceil(einheiten.length / BQ_SEITE));
  const seite = Math.min(seiten, Math.max(1, Number(params.get('bseite')) || 1));
  const ausschnitt = einheiten.slice((seite - 1) * BQ_SEITE, seite * BQ_SEITE);
  const gruppen = alleGruppen ? ausschnitt : null;
  const sichtbar = alleGruppen ? ausschnitt.flatMap(g => g.zeilen) : ausschnitt;
  const blaettern = seiten > 1 ? `<div class="bq-blaettern">
      <button type="button" class="btn btn-sm" ${seite <= 1 ? 'disabled' : ''} data-param="bseite" data-value="${seite > 2 ? seite - 1 : ''}">← Zurück</button>
      <span class="small muted">Seite ${seite} von ${seiten}</span>
      <button type="button" class="btn btn-sm" ${seite >= seiten ? 'disabled' : ''} data-param="bseite" data-value="${seite + 1}">Weiter →</button></div>` : '';
  const filterKnopf = f => `<button type="button" class="chip" data-param="bfilter" data-value="${f === 'nicht_fertig' ? '' : f}" aria-pressed="${filter === f}">${esc(BQ_FILTER_LABEL[f])}</button>`;
  const weitererFilterAktiv = FILTERCHIPS_WEITERE.includes(filter);
  const chips = `<div class="chips bq-filter-haupt" style="margin:8px 0" role="group" aria-label="Bestellarbeit filtern">
    ${FILTERCHIPS_KUNDEN.map(filterKnopf).join('')}
  </div><details class="bq-filter-extra"${weitererFilterAktiv ? ' open' : ''}>
    <summary>Weitere Filter${weitererFilterAktiv ? ` · ${esc(BQ_FILTER_LABEL[filter])}` : ''}</summary>
    <div class="chips" role="group" aria-label="Weitere Bestellfilter">${FILTERCHIPS_WEITERE.map(filterKnopf).join('')}</div>
  </details>`;
  // Kein data-param hier: der generische Handler wuerde vorher greifen und nur
  // die Spalte setzen - die Richtung liesse sich dann nie umschalten.
  const sortHead = (feld, label) => `<th><button type="button" class="th-sort" data-bq-sort-toggle="${feld}" aria-label="Nach ${esc(label)} sortieren${sort === feld ? (dir === 'asc' ? ', aktuell aufsteigend' : ', aktuell absteigend') : ''}">${esc(label)}${sort === feld ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
  const kopf = `<tr>${sortHead('orderName', 'Bestellung')}${sortHead('kundenname', 'Kunde')}${sortHead('fortschritt', 'Stand')}<th>Nächster Schritt</th></tr>`;
  // Bei "Wichtigkeit" steht am Kunden, warum er oben ist (seine dringendste Bestellung).
  const grund = g => {
    const w = sort === 'wichtigkeit' ? g.zeilen.map(z => z.wichtigkeit).filter(Boolean).sort((a, b) => a.rang - b.rang)[0] : null;
    return w ? `<span class="bq-grund bq-rang-${w.rang}">${esc(w.grund)}</span>` : '';
  };
  const gruppenkopf = g => `<tr class="bq-gruppenkopf"><th colspan="4" scope="rowgroup"><span>${esc(g.name)}</span>${grund(g)}<span class="small muted">${plural(g.zeilen.length, 'Bestellung', 'Bestellungen')}</span></th></tr>`;
  const tabelle = zeilen.length ? gruppen
    ? gruppen.map(g => `<tbody class="bq-tbody-desktop bq-kundengruppe">${gruppenkopf(g)}${g.zeilen.map(bestellzeileHtml).join('')}</tbody>`).join('')
    : `<tbody class="bq-tbody-desktop">${sichtbar.map(bestellzeileHtml).join('')}</tbody>`
    : `<tbody><tr><td colspan="4">${emptyState('Keine Treffer.', '')}</td></tr></tbody>`;
  const karten = zeilen.length ? gruppen
    ? gruppen.map(g => `<section class="bq-kundengruppe-mobil"><h3>${esc(g.name)} <span class="small muted">· ${plural(g.zeilen.length, 'Bestellung', 'Bestellungen')}</span></h3>${grund(g)}${g.zeilen.map(z => bestellzeileKarte(z, true)).join('')}</section>`).join('')
    : sichtbar.map(z => bestellzeileKarte(z)).join('')
    : emptyState('Keine Treffer.', '');
  const pruefen = d.zeilen.filter(z => bestellPruefgruende(z).length).length;
  const alleLink = new URLSearchParams(params);
  alleLink.set('bfilter', 'alle'); alleLink.delete('bseite');
  return `
    ${pruefen && filter !== 'pruefen' ? `<p class="notice warn"><a href="#/kunden?tab=bestellungen&amp;bfilter=pruefen">${plural(pruefen, 'Bestellung braucht', 'Bestellungen brauchen')} Kontrolle</a> – etwa ein manueller Haken ohne Versandnachweis oder unklare Artikel.</p>` : ''}
    ${filter === 'pruefen' ? '<p class="notice warn">Hier bleiben auch manuell abgehakte Fälle sichtbar. Prüfe den Versand- und Artikelstand, bevor du einen Fall abschließt.</p>' : ''}
    ${filter === 'alle' ? '<p class="small muted">Alle echten Bestellungen im Betriebsbestand: letzte 90 Tage sowie ältere mit offenem Versand oder offener Zahlung. Ältere vollständig abgeschlossene Bestellungen findest du in Shopify.</p>' : ''}
    <div class="toolbar search-hero"><input type="search" placeholder="Suchen – Kunde, E-Mail, Telefon, Bestellnummer, Produkt, Farbe, Tags …" value="${esc(params.get('bq') || '')}" data-param="bq" aria-label="Bestellungen durchsuchen"></div>
    ${params.get('bq') && filter !== 'alle' ? `<p class="small muted">Die Suche gilt für „${esc(BQ_FILTER_LABEL[filter] || filter)}“. <a href="#/kunden?${esc(alleLink)}">In allen Bestellungen suchen →</a></p>` : ''}
    ${chips}
    <div class="chips" role="group" aria-label="Sortierung">
      <button class="chip" data-bq-neueste aria-pressed="${sort === 'datum' && dir === 'desc'}">Neueste zuerst</button>
      <button class="chip" data-param="bsort" data-value="wichtigkeit" aria-pressed="${sort === 'wichtigkeit'}">Dringendes zuerst</button>
    </div>
    <p class="small muted" style="margin:0 0 8px">${zeilen.length} ${zeilen.length === 1 ? 'Bestellung' : 'Bestellungen'}${seiten > 1 ? ` · Seite ${seite} von ${seiten}` : ''} · ${sort === 'wichtigkeit' ? 'Sortiert nach Wichtigkeit: es fehlt etwas → unterwegs → nicht bezahlt → raus oder erledigt, je die älteste zuerst' : `Sortiert nach ${esc(BQ_SORT_LABEL[sort] || 'Kunde')} ${dir === 'asc' ? 'aufsteigend' : 'absteigend'}`} · Zeile anklicken zeigt Zeitleiste, Kanal, Tags und die Aktionen</p>
    <div class="table-wrap kunden-table bq-table"><table><thead>${kopf}</thead>
    ${tabelle}
    </table></div>
    <div class="rows bq-karten">${karten}</div>
    ${blaettern}
    ${erledigt.length || erledigtAelter ? `<details class="bq-erledigt"${filter === 'fertig' ? ' open' : ''}><summary>Abgehakt / versandt · ${plural(erledigt.length, 'Bestellung', 'Bestellungen')}${erledigtAelter ? ` <span class="small muted">· letzte ${ERLEDIGT_TAGE} Tage, ${erledigtAelter} ältere über die Suche</span>` : ''}</summary>
      <div class="table-wrap kunden-table bq-table"><table><thead>${kopf}</thead><tbody class="bq-tbody-desktop">${erledigt.map(bestellzeileHtml).join('')}</tbody></table></div>
      <div class="rows bq-karten">${erledigt.map(z => bestellzeileKarte(z)).join('')}</div>
    </details>` : ''}
  `;
}

const BQ_SEITE = 25;
const ERLEDIGT_TAGE = 30;
const NEU_STUNDEN = 24;

/** "Neu": offene Bestellung der letzten 24 Stunden - beim Oeffnen sofort sichtbar, was dazukam. */
function neuBadge(z) {
  return !istErledigt(z) && Date.now() - Date.parse(z.datum) < NEU_STUNDEN * 36e5 ? ' <span class="badge bq-neu">Neu</span>' : '';
}

const FILTERCHIPS_KUNDEN = ['nicht_fertig', 'fertig', 'pruefen', 'alle'];
const FILTERCHIPS_WEITERE = ['offen', 'bezahlt', 'unerfuellt', 'storniert', 'beratung', 'muster', 'test'];

/** Kunden, Reiter Bestellungen: sortieren, aufklappen, Auftragsfluss, fertig. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function kundenKlickBestellungen(e) {
  if (musteretikettenKlick(e)) return true;
  // Zeitleiste (Kundenakte und Bestelldetail): Hauptknopf und "Etwas anderes ist passiert ...".
  if (zeitleisteKlick(e)) return true;
  if (e.target.closest('[data-bq-neueste]')) {
    e.preventDefault();
    const p = new URLSearchParams(state.route.params);
    p.delete('bsort');
    p.delete('bdir');
    p.delete('bseite');
    location.hash = `#/${state.route.view}?${p}`;
    return true;
  }
  const sortKopf = e.target.closest('[data-bq-sort-toggle]');
  if (sortKopf) {
    // Zweiter Klick auf dieselbe Spalte dreht die Richtung - vorher war
    // aufsteigend nur ueber die Adresszeile erreichbar.
    e.preventDefault();
    const feld = sortKopf.dataset.bqSortToggle;
    const p = new URLSearchParams(state.route.params);
    const vorherigesFeld = p.get('bsort') || 'datum';
    const warSortiert = vorherigesFeld === feld;
    const richtung = warSortiert ? ((p.get('bdir') || (feld === 'kundenname' ? 'asc' : 'desc')) === 'desc' ? 'asc' : 'desc') : (feld === 'kundenname' ? 'asc' : 'desc');
    p.set('bsort', feld);
    if (richtung === (feld === 'kundenname' ? 'asc' : 'desc')) p.delete('bdir'); else p.set('bdir', richtung);
    p.delete('bseite');
    location.hash = `#/${state.route.view}?${p}`;
    return true;
  }
  const bqToggle = e.target.closest('[data-bq-toggle]');
  // Klicks auf Links, Schaltflaechen oder Kopierfelder gehoeren diesen
  // Elementen - vorher hingen dort inline-stopPropagation-Aufrufe, die
  // genau die Handler abgeschnitten haben, die am document warten.
  if (bqToggle && !e.target.closest('a, button, [data-kopiertext], [data-kunden-open]')) {
    const id = bqToggle.dataset.bqToggle;
    if (kunden.erweitert.has(id)) kunden.erweitert.delete(id);
    else {
      kunden.erweitert.add(id);
      const bestellung = (kunden.bestellungen?.zeilen || []).find(z => z.orderId === id);
      if (bestellung?.auftrag?.positionen?.some(p => p?.istMuster)) void aktualisiereMusteretiketten(id);
    }
    render();
    return true;
  }
  const bqAf = e.target.closest('[data-bq-af]');
  if (bqAf) {
    e.preventDefault(); e.stopPropagation();
    // "raus" bucht in Shopify und schickt die Versandmail: ein Paket, ein Fenster - nicht je Artikel.
    if (bqAf.dataset.bqAfStatus === 'raus') oeffneVersandDialog(bqAf.dataset.bqAf);
    else setzeAuftragsstatusFuerBestellung(bqAf.dataset.bqAf, bqAf.dataset.bqAfStatus);
    return true;
  }
  const bqEtk = e.target.closest('[data-bq-etiketten]');
  if (bqEtk) {
    e.preventDefault(); e.stopPropagation();
    void bestellungsEtikettenDrucken(bqEtk.dataset.bqEtiketten);
    return true;
  }
  const bqHaken = e.target.closest('[data-bq-haken]');
  if (bqHaken) { e.preventDefault(); e.stopPropagation(); void hakenSetzen(bqHaken.dataset.bqHaken, bqHaken.dataset.bqHakenWert === '1'); return true; }
  const bqFertig = e.target.closest('[data-bq-fertig]');
  if (bqFertig) { e.preventDefault(); e.stopPropagation(); kundeFertigSetzen(bqFertig.dataset.bqFertig); return true; }
  return false;
}
