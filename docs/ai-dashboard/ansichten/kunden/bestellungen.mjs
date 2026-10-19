/**
 * Kunden, Reiter "Bestellungen": vollwertige Bestellliste wie im Shopify-Admin,
 * nur uebersichtlicher. Eine Zeile je Bestellung, sortierbar, filterbar,
 * durchsuchbar; Klick auf die Zeile klappt die Detailansicht auf.
 */
import {
  bestellKundenKey, gruppiereBestellzeilenNachKunde, sortKundenname,
} from '../../lib/kunden-bestellgruppen.mjs';
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural, toast, geldText } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { einkauf, AF_STATUS_LABEL, setzeAuftragsstatus } from '../einkauf/auftragsfluss.mjs';
import { kunden, telLink, kundenAuftragKarte, ZAHLUNG_TEXT, VERSAND_TEXT, statusText } from './gemeinsam.mjs';
import { zeitleisteBlock, auftragAusZeile, zeitleisteKlick } from './zeitleiste.mjs';
import { oeffneVersandDialog } from '../einkauf/versand.mjs';
import { bestellinhalt } from '../../lib/bestellinhalt.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';

/** Setzt den Auftragsfluss-Status fuer ALLE Positionen einer Bestellung auf einmal (Bereich Kunden/Bestellungen). */
async function setzeAuftragsstatusFuerBestellung(orderId, status) {
  const zeile = (kunden.bestellungen?.zeilen || []).find(z => z.orderId === orderId);
  const positionen = (zeile?.auftrag?.positionen || []).filter(p => p.lineItemId);
  if (!positionen.length) { toast('Keine Positionen mit Auftragsfluss gefunden', 'warn'); return; }
  let ok = 0;
  for (const p of positionen) {
    const gesetzt = await setzeAuftragsstatus({ orderId, lineItemId: p.lineItemId, orderName: zeile.orderName, titel: p.titel, farbe: p.farbe }, status, { still: true });
    if (gesetzt) ok += 1;
  }
  toast(`${ok}/${positionen.length} Artikel: ${AF_STATUS_LABEL[status]}`);
  // Fortschritt und "Was fehlt" rechnet der Server aus dem Auftragsstatus -
  // ohne Neuladen blieb die Zeile stehen und lud zum zweiten Klick ein.
  kunden.bestellungen = null;
  ensureKundenBestellungen();
  render();
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
const BQ_FILTER_LABEL = { nicht_fertig: 'Nicht fertig', fertig: 'Fertig', offen: 'Zahlung offen', bezahlt: 'Bezahlt', unerfuellt: 'Unerfüllt', storniert: 'Storniert', beratung: 'Beratung offen', muster: 'Muster', test: 'Testbestellung' };
const BQ_SORT_LABEL = { datum: 'Datum', orderName: 'Bestellnr.', kundenname: 'Kunde', gesamtbetrag: 'Betrag', zahlungsstatus: 'Zahlung', fulfillmentstatus: 'Versand', anzahlArtikel: 'Artikel', fortschritt: 'Fortschritt' };

const KANAL_TEXT = { web: 'Onlineshop', pos: 'Ladengeschäft', shopify_draft_order: 'Angebot' };

function bqFeldTreffer(felder, q) { return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(q)); }

function bestellzeileGefiltert(zeilen, params) {
  const filter = params.get('bfilter') || 'nicht_fertig';
  const q = (params.get('bq') || '').trim().toLowerCase();
  const sort = params.get('bsort') || 'kundenname';
  const dir = params.get('bdir') || (sort === 'kundenname' ? 'asc' : 'desc');
  let liste = zeilen.filter(z => filter === 'nicht_fertig' ? (!z.fertig && !z.testbestellung)
    : filter === 'fertig' ? (z.fertig && !z.testbestellung)
    : filter === 'offen' ? (z.offen && !z.testbestellung)
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
    zeilen.push(`<div class="bq-inhalt-zeile"><span class="bq-art">${esc(i.muster.anzahl === 1 ? '1 Muster' : `${i.muster.anzahl} Muster`)}</span> <span class="bq-was">${esc(i.muster.text)}</span>${i.muster.herkunft ? ` <span class="bq-herkunft">${esc(i.muster.herkunft)}</span>` : ''}</div>`);
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

function bestellzeileHtml(z) {
  const offenKlasse = kunden.erweitert.has(z.orderId) ? ' offen' : '';
  const tagListe = [...z.tags.beratung, ...z.tags.typ, ...z.tags.sonstige];
  const pk = fortschrittKlasse(z.fortschritt?.stufe);
  const inhalt = inhaltHtml(z);
  return `<tr class="bq-row${offenKlasse}${inhalt ? ' mit-inhalt' : ''}" data-bq-toggle="${esc(z.orderId)}" tabindex="0" role="button" aria-expanded="${kunden.erweitert.has(z.orderId)}" aria-label="Bestellung ${esc(z.orderName)} von ${esc(z.kundenname)} auf- oder zuklappen">
      <td data-l="Bestellnr."><a href="${esc(z.adminUrl)}" target="_blank" rel="noopener">${esc(z.orderName)}</a>${z.testbestellung ? ' <span class="badge plain">Test</span>' : ''}</td>
      <td data-l="Datum">${fmtDateTime(z.datum)}</td>
      <td data-l="Kunde">${z.kundenSchluessel ? `<a href="#" data-kunden-open="${esc(z.kundenSchluessel)}">${wertText(z.kundenname)}</a>` : wertText(z.kundenname)}</td>
      <td data-l="Kontakt">${kontaktZelle(z)}</td>
      <td data-l="Betrag">${betragText(z)}</td>
      <td data-l="Zahlung">${statusText(z.zahlungsstatus, ZAHLUNG_TEXT)}</td>
      <td data-l="Versand">${versandZelle(z)}</td>
      <td data-l="Fortschritt"><span class="bq-fortschritt ${pk}">${esc(z.fortschritt?.text || '–')}</span></td>
      <td data-l="Was fehlt">${z.wasFehlt?.length ? `<span class="bq-fehlt">${z.wasFehlt.map(esc).join(' · ')}</span>` : '<span class="small muted">nichts</span>'}</td>
    </tr>
    ${inhalt ? `<tr class="bq-inhalt${offenKlasse}" data-bq-toggle="${esc(z.orderId)}"><td colspan="9">${inhalt}</td></tr>` : ''}
    ${kunden.erweitert.has(z.orderId) ? `<tr class="bq-detail"><td colspan="9">${zeitleisteBlock(auftragAusZeile(z), { kontakt: true })}${weitereAngaben(z, tagListe)}${kundenAuftragKarte(z.auftrag)}${bestellzeileAktionen(z)}</td></tr>` : ''}`;
}

function bestellzeileKarte(z, gruppiert = false) {
  const pk = fortschrittKlasse(z.fortschritt?.stufe);
  return `<div class="row bq-karte" data-bq-toggle="${esc(z.orderId)}" tabindex="0" role="button" aria-expanded="${kunden.erweitert.has(z.orderId)}" aria-label="Bestellung ${esc(z.orderName)} von ${esc(z.kundenname || 'unbekannt')} auf- oder zuklappen">
    <div>
      <div class="t">${esc(z.orderName)}${gruppiert ? '' : ` · ${wertText(z.kundenname)}`}${z.testbestellung ? ' <span class="badge plain">Test</span>' : ''}</div>
      <div class="m">${betragText(z)} · ${statusText(z.zahlungsstatus, ZAHLUNG_TEXT)} · ${fmtDate(z.datum)}</div>
      ${inhaltHtml(z) ? `<div class="bq-inhalt-mobil">${inhaltHtml(z)}</div>` : ''}
      <div class="m"><span class="bq-fortschritt ${pk}">${esc(z.fortschritt?.text || '–')}</span></div>
      ${z.wasFehlt?.length ? `<div class="m bq-fehlt">${z.wasFehlt.map(esc).join(' · ')}</div>` : ''}
    </div>
    <div class="r"><span class="small muted">${kunden.erweitert.has(z.orderId) ? 'zuklappen ▲' : 'Details ▼'}</span></div>
  </div>
  ${kunden.erweitert.has(z.orderId) ? `<div class="bq-detail-mobil">${zeitleisteBlock(auftragAusZeile(z), { kontakt: true })}${kundenAuftragKarte(z.auftrag)}${bestellzeileAktionen(z)}</div>` : ''}`;
}

export function viewKundenBestellungen() {
  ensureKundenBestellungen();
  const d = kunden.bestellungen;
  if (!d && kunden.loadingBestellungen) return `<div class="empty">Lade Bestellungen …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Bestellliste');
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  const params = state.route.params;
  const filter = params.get('bfilter') || 'nicht_fertig';
  const sort = params.get('bsort') || 'kundenname';
  const dir = params.get('bdir') || (sort === 'kundenname' ? 'asc' : 'desc');
  const zeilen = bestellzeileGefiltert(d.zeilen, params);
  const alleGruppen = sort === 'kundenname' ? gruppiereBestellzeilenNachKunde(zeilen) : null;
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
  const chips = `<div class="chips" style="margin:8px 0">
    ${FILTERCHIPS_KUNDEN.map(f => `<button type="button" class="chip" data-param="bfilter" data-value="${f === 'nicht_fertig' ? '' : f}" aria-pressed="${filter === f}">${esc(BQ_FILTER_LABEL[f])}</button>`).join('')}
  </div>`;
  // Kein data-param hier: der generische Handler wuerde vorher greifen und nur
  // die Spalte setzen - die Richtung liesse sich dann nie umschalten.
  const sortHead = (feld, label) => `<th><button type="button" class="th-sort" data-bq-sort-toggle="${feld}" aria-label="Nach ${esc(label)} sortieren${sort === feld ? (dir === 'asc' ? ', aktuell aufsteigend' : ', aktuell absteigend') : ''}">${esc(label)}${sort === feld ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
  const kopf = `<tr>${sortHead('orderName', 'Bestellnr.')}${sortHead('datum', 'Datum')}${sortHead('kundenname', 'Kunde')}<th>Kontakt</th>${sortHead('gesamtbetrag', 'Betrag')}${sortHead('zahlungsstatus', 'Zahlung')}${sortHead('fulfillmentstatus', 'Versand')}${sortHead('fortschritt', 'Fortschritt')}<th>Was fehlt</th></tr>`;
  const gruppenkopf = g => `<tr class="bq-gruppenkopf"><th colspan="9" scope="rowgroup"><span>${esc(g.name)}</span><span class="small muted">${plural(g.zeilen.length, 'Bestellung', 'Bestellungen')}</span></th></tr>`;
  const tabelle = zeilen.length ? gruppen
    ? gruppen.map(g => `<tbody class="bq-tbody-desktop bq-kundengruppe">${gruppenkopf(g)}${g.zeilen.map(bestellzeileHtml).join('')}</tbody>`).join('')
    : `<tbody class="bq-tbody-desktop">${sichtbar.map(bestellzeileHtml).join('')}</tbody>`
    : `<tbody><tr><td colspan="9">${emptyState('Keine Treffer.', '')}</td></tr></tbody>`;
  const karten = zeilen.length ? gruppen
    ? gruppen.map(g => `<section class="bq-kundengruppe-mobil"><h3>${esc(g.name)} <span class="small muted">· ${plural(g.zeilen.length, 'Bestellung', 'Bestellungen')}</span></h3>${g.zeilen.map(z => bestellzeileKarte(z, true)).join('')}</section>`).join('')
    : sichtbar.map(bestellzeileKarte).join('')
    : emptyState('Keine Treffer.', '');
  return `
    <div class="toolbar search-hero"><input type="search" placeholder="Suchen – Kunde, E-Mail, Telefon, Bestellnummer, Produkt, Farbe, Tags …" value="${esc(params.get('bq') || '')}" data-param="bq" aria-label="Bestellungen durchsuchen"></div>
    ${chips}
    <p class="small muted" style="margin:0 0 8px">${zeilen.length} ${zeilen.length === 1 ? 'Bestellung' : 'Bestellungen'}${seiten > 1 ? ` · Seite ${seite} von ${seiten}` : ''} · Sortiert nach ${esc(BQ_SORT_LABEL[sort] || 'Kunde')} ${dir === 'asc' ? 'aufsteigend' : 'absteigend'} · Zeile anklicken zeigt Zeitleiste, Kanal, Tags und die Aktionen</p>
    <div class="table-wrap kunden-table bq-table"><table><thead>${kopf}</thead>
    ${tabelle}
    </table></div>
    <div class="rows bq-karten">${karten}</div>
    ${blaettern}
  `;
}

const BQ_SEITE = 25;

const FILTERCHIPS_KUNDEN = ['nicht_fertig', 'fertig', 'offen', 'bezahlt', 'unerfuellt', 'storniert', 'beratung', 'muster', 'test'];

/** Kunden, Reiter Bestellungen: sortieren, aufklappen, Auftragsfluss, fertig. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function kundenKlickBestellungen(e) {
  // Zeitleiste (Kundenakte und Bestelldetail): Hauptknopf und "Etwas anderes ist passiert ...".
  if (zeitleisteKlick(e)) return true;
  const sortKopf = e.target.closest('[data-bq-sort-toggle]');
  if (sortKopf) {
    // Zweiter Klick auf dieselbe Spalte dreht die Richtung - vorher war
    // aufsteigend nur ueber die Adresszeile erreichbar.
    e.preventDefault();
    const feld = sortKopf.dataset.bqSortToggle;
    const p = new URLSearchParams(state.route.params);
    const vorherigesFeld = p.get('bsort') || 'kundenname';
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
    if (kunden.erweitert.has(id)) kunden.erweitert.delete(id); else kunden.erweitert.add(id);
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
  const bqFertig = e.target.closest('[data-bq-fertig]');
  if (bqFertig) { e.preventDefault(); e.stopPropagation(); kundeFertigSetzen(bqFertig.dataset.bqFertig); return true; }
  return false;
}
