/**
 * Kunden: Suche und Kundenakte.
 *
 * Wofuer: Mitarbeiter am Telefon findet einen Kunden ueber Name, E-Mail,
 * Telefonnummer, Bestellnummer, Strasse/Ort oder PLZ und sieht sofort alle
 * Bestellungen. Alles kommt aus der bereits lokal vorliegenden
 * Bestelluebersicht - keine neue Shopify-Abfrage im Browser.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, plural, geldText } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState } from '../../bausteine/karten.mjs';
import { kunden, telLink, kundenAuftragKarte } from './gemeinsam.mjs';
import { ensureKundenFaelle, fallKarte } from './faelle.mjs';
import { ORG_STATUS_LABEL } from '../organisation/gemeinsam.mjs';
import { zeitleisteBlock, kontaktKnoepfe } from './zeitleiste.mjs';

// Voreinstellung "in Arbeit" (Inhabervorgabe) - die Liste ist beim Oeffnen
// sofort da, ohne Suchtext getippt zu haben.
const KUNDEN_FILTER_STANDARD = 'in_arbeit';
const KUNDEN_FILTER_LABEL = { alle: 'Alle', in_arbeit: 'In Arbeit', fertig: 'Fertig', rueckruf_offen: 'Rückruf offen', muster: 'Muster', test: 'Testbestellungen' };

function ensureKundenSuche(q, filter) {
  const query = String(q || '').trim();
  const key = `${query}::${filter}`;
  if (kunden.sucheKey === key && (kunden.suche || kunden.loadingSuche)) return;
  kunden.sucheKey = key;
  kunden.loadingSuche = true;
  fetchEinkauf(`/api/kunden/suche?${new URLSearchParams({ q: query, filter: filter === 'alle' ? '' : filter })}`).then(d => {
    // Eine frueher gestartete Abfrage darf ein neueres Ergebnis nicht ueberschreiben -
    // sonst zeigt die Liste dauerhaft die Treffer zum alten Suchwort.
    if (kunden.sucheKey !== key) return;
    kunden.suche = d; kunden.loadingSuche = false;
    if (state.route.view === 'kunden') render();
  });
}

function ensureKundenDetail(key) {
  if (kunden.detailKey === key && (kunden.detail || kunden.loadingDetail)) return;
  kunden.detailKey = key;
  kunden.loadingDetail = true;
  fetchEinkauf(`/api/kunden/detail?${new URLSearchParams({ key })}`).then(d => {
    if (kunden.detailKey !== key) return; // inzwischen ein anderer Kunde geoeffnet
    kunden.detail = d; kunden.loadingDetail = false;
    if (state.route.view === 'kunden') render();
  });
}

function kundenFortschrittBadge(f) {
  if (!f || !f.gesamt) return '';
  const klasse = f.fertig ? 'ok' : 'plain';
  return ` <span class="badge ${klasse}">${f.fertig ? 'Fertig' : esc(f.text)}</span>`;
}

function kundenTrefferZeile(k) {
  const fertig = k.fortschritt?.fertig;
  return `<div class="row kunden-zeile${fertig ? ' fertig' : ''}" data-kunden-open="${esc(k.key)}" tabindex="0" role="button" aria-label="${esc(k.name)}">
    <div>
      <div class="t">${esc(k.name)}${k.ort ? ` <span class="small muted">· ${esc(k.ort)}</span>` : ''}${k.nurTestbestellungen ? ' <span class="badge plain">nur Testbestellungen</span>' : ''}${k.nurStammdaten ? ' <span class="badge plain">aus Shopify, keine Bestellung hier</span>' : kundenFortschrittBadge(k.fortschritt)}</div>
      <div class="m">${k.email && k.email !== '–' ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : '<span class="small muted">keine E-Mail</span>'} · ${telLink(k.telefon)}${k.telefonQuelle === 'lieferadresse' ? ' <span class="small muted">(aus der Lieferadresse)</span>' : ''}</div>
    </div>
    <div class="r">
      <div class="small">${plural(k.anzahlBestellungen, 'Bestellung', 'Bestellungen')} · ${geldText({ betrag: k.gesamtumsatz, waehrung: k.waehrung })}</div>
      <div class="small muted">${k.nurStammdaten && !k.letzteBestellung ? 'noch keine Bestellung' : `letzte: ${k.letzteBestellungName ? `${esc(k.letzteBestellungName)} · ` : ''}${fmtDate(k.letzteBestellung)}`}</div>
    </div>
  </div>`;
}

export function viewKundenSuche() {
  const q = state.route.params.get('kq') || '';
  const filterRaw = state.route.params.get('kf') || '';
  const filter = Object.hasOwn(KUNDEN_FILTER_LABEL, filterRaw) ? filterRaw : KUNDEN_FILTER_STANDARD;
  ensureKundenSuche(q, filter);
  const toolbar = `<div class="toolbar search-hero"><input type="search" placeholder="Name, E-Mail, Telefon, Bestellnummer, Straße/Ort oder PLZ … (Liste filtert waehrend des Tippens)" value="${esc(q)}" data-param="kq" aria-label="Kunden durchsuchen" autofocus></div>`;
  const chips = `<div class="chips" style="margin:8px 0">
    ${Object.entries(KUNDEN_FILTER_LABEL).map(([k, l]) => `<button type="button" class="chip" data-param="kf" data-value="${k === KUNDEN_FILTER_STANDARD ? '' : k}" aria-pressed="${filter === k}">${esc(l)}</button>`).join('')}
  </div>`;
  const d = kunden.suche;
  if (!d && kunden.loadingSuche) return toolbar + chips + `<div class="empty">Lade Kunden …</div>`;
  if (!d || !d.verfuegbar) return toolbar + chips + emptyState('Keine Kundendaten verfügbar.', d?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  return toolbar + chips + `
    <p class="small muted" style="margin:-4px 0 10px">${d.treffer.length} Kunde${d.treffer.length === 1 ? '' : 'n'}</p>
    <div class="rows">${d.treffer.length ? d.treffer.map(kundenTrefferZeile).join('') : emptyState('Keine Treffer.', 'Begriff oder Filter anpassen.')}</div>`;
}

function adresseHtml(a, titel) {
  if (!a) return '';
  // Zum Abschreiben ins Lieferschein- oder Bestellformular: ein Klick statt
  // Zeile fuer Zeile abtippen.
  const alsText = [a.name, a.strasse, `${a.plz} ${a.ort}`.trim(), a.land && a.land !== '–' ? a.land : '']
    .filter(t => t && t !== '–').join('\n');
  return `<div><p class="small muted" style="margin:0">${esc(titel)}</p>
    <p style="margin:2px 0">${esc(a.name)}<br>${esc(a.strasse)}<br>${esc(a.plz)} ${esc(a.ort)}${a.land && a.land !== '–' ? `, ${esc(a.land)}` : ''}${a.telefon && a.telefon !== '–' ? `<br>${esc(a.telefon)}` : ''}</p>
    <button type="button" class="btn btn-sm btn-ghost no-print" data-kopiertext="${esc(alsText)}" title="Anschrift in die Zwischenablage">Adresse kopieren</button></div>`;
}

export function viewKundenDetail(key) {
  ensureKundenDetail(key);
  ensureKundenFaelle();      // der naechste Schritt liegt berechnet vor
  ensureKundenNotizen(key);  // was beim letzten Anruf besprochen wurde
  const zurueck = `<p class="no-print" style="margin:0 0 12px"><a href="#" data-kunden-zurueck>← Zurück zur Kundensuche</a></p>`;
  // Nur anzeigen, was zu DIESEM Kunden gehoert: sonst stehen waehrend des
  // Ladens Name und Adresse des zuvor geoeffneten Kunden unter der neuen
  // Adresse - am Telefon liest das jemand vor.
  const d = kunden.detailKey === key ? kunden.detail : null;
  if (!d) return zurueck + `<div class="empty">Lade Kunde …</div>`;
  if (!d || !d.verfuegbar) return zurueck + emptyState('Kunde nicht gefunden.', d?.hinweis || '');
  const k = d.kunde;
  // "Was ist hier offen?" musste man sich bisher aus den Bestellkarten
  // zusammenreimen - dabei rechnet kundenfaelle.mjs es laengst aus.
  const fall = kunden.faelle?.faelle?.find(f => f.schluessel === key || f.key === key);
  return zurueck + `
    ${fall ? fallKarte(fall) : ''}
    <section class="card">
      <div class="card-head"><h2>${esc(k.kunde.name)}${kundenFortschrittBadge(k.fortschritt)}</h2><span class="small">${plural(k.anzahlBestellungen, 'Bestellung', 'Bestellungen')} · ${geldText({ betrag: k.gesamtumsatz, waehrung: k.waehrung })}</span></div>
      <p class="small">E-Mail: ${k.kunde.email !== '–'
        ? `<a href="mailto:${esc(k.kunde.email)}">${esc(k.kunde.email)}</a>`
        : '–'} · Telefon: ${telLink(k.kunde.telefon)}</p>
      ${kontaktKnoepfe(k.kunde)}
    </section>
    ${woStehtEs(k)}
    <section class="card" style="margin-top:14px">
      <div class="kunden-adressen" style="margin-top:0">
        ${adresseHtml(k.lieferadresse, 'Lieferadresse')}
        ${adresseHtml(k.rechnungsadresse, 'Rechnungsadresse')}
      </div>
      <div class="toolbar no-print" style="margin-top:10px">
        <button type="button" class="btn btn-primary" data-kunde-aufgabe="${esc(key)}" data-kunde-name="${esc(k.kunde.name)}"
          title="Notiz oder Aufgabe zu diesem Kunden – der Bezug bleibt erhalten">+ Aufgabe zu diesem Kunden</button>
      </div>
    </section>
    ${kundenNotizenBlock(key)}
    <h2 style="margin-top:18px">Bestellungen</h2>
    ${k.auftraege.map(kundenAuftragKarte).join('') || emptyState('Keine Bestellungen in den hier vorliegenden Daten.', k.hinweis || '')}
  `;
}

/**
 * "Wo steht es": je offener Bestellung der eine naechste Schritt und der Verlauf.
 * Abgeschlossenes bleibt einen Klick entfernt - sonst schiebt die Geschichte eines
 * Stammkunden das, was heute zu tun ist, aus dem Bild. Testbestellungen sind keine Arbeit.
 */
function woStehtEs(k) {
  const echte = (k.auftraege || []).filter(a => !a.testbestellung && a.verlauf?.length);
  if (!echte.length) return '';
  const offen = echte.filter(a => a.naechsterSchritt);
  const fertig = echte.filter(a => !a.naechsterSchritt);
  return `<h2 style="margin:18px 0 10px">Wo steht es</h2>
    ${offen.map(a => zeitleisteBlock(a)).join('') || '<p class="small muted" style="margin:0 0 12px">Alles abgeschlossen – nichts zu tun.</p>'}
    ${fertig.length ? `<details class="zl-abgeschlossen"><summary>${fertig.length === 1 ? '1 abgeschlossene Bestellung' : `${fertig.length} abgeschlossene Bestellungen`} – Verlauf ansehen</summary>${fertig.map(a => zeitleisteBlock(a)).join('')}</details>` : ''}`;
}

/**
 * Was zu diesem Kunden notiert wurde - Aufgaben und Notizen aus der
 * Schnellerfassung. Damit steht beim naechsten Anruf da, was beim letzten
 * besprochen wurde, statt es aus Bestellkarten zu erraten.
 */
function kundenNotizenBlock(key) {
  const d = kunden.notizenKey === key ? kunden.notizen : null;
  if (!d?.eintraege?.length) return '';
  return `<h2 style="margin-top:18px">Notizen &amp; Aufgaben <span class="small muted">${d.anzahl}</span></h2>
    <div class="rows">${d.eintraege.map(e => `<div class="row org-zeile" data-org-zu-kunde="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.titel)}">
      <div>
        <div class="t">${esc(e.titel)}</div>
        ${e.beschreibung && e.beschreibung !== e.titel ? `<div class="m org-was">${esc(String(e.beschreibung).replace(/\s+/g, ' ').slice(0, 180))}</div>` : ''}
        <div class="m">${esc(fmtDate(e.erstelltAm))}${e.verantwortlich ? ` · für ${esc(e.verantwortlich)}` : ''}${e.faellig ? ` · fällig ${esc(fmtDate(e.faellig))}` : ''}${e.kommentare ? ` · ${e.kommentare} ${e.kommentare === 1 ? 'Kommentar' : 'Kommentare'}` : ''}</div>
      </div>
      <div class="r">
        ${e.typ === 'TASK' ? `<span class="badge status ${esc(String(e.status).toLowerCase())}">${esc(ORG_STATUS_LABEL[e.status] || e.status)}</span>` : '<span class="badge plain">Notiz</span>'}
      </div>
    </div>`).join('')}</div>`;
}

/** Notizen und Aufgaben zu einem Kunden - erst beim Oeffnen der Akte geholt. */
function ensureKundenNotizen(key) {
  if (kunden.notizenKey === key && (kunden.notizen || kunden.loadingNotizen)) return;
  kunden.notizenKey = key; kunden.loadingNotizen = true; kunden.notizen = null;
  fetchEinkauf(`/api/org/zu-kunde?${new URLSearchParams({ key })}`).then(d => {
    if (kunden.notizenKey !== key) return;            // Akte inzwischen gewechselt
    kunden.notizen = d;
  }).finally(() => {
    if (kunden.notizenKey === key) { kunden.loadingNotizen = false; render(); }
  });
}
