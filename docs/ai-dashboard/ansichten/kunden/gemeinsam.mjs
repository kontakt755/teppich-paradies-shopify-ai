/**
 * Kunden: Zwischenspeicher und Bausteine, die mehrere Reiter teilen
 * (Telefonlink, Klartext fuer Zahlung/Versand, Auftragskarte).
 */
import { esc, fmtDate, geldText, NICHT_HINTERLEGT } from '../../kern/helfer.mjs';

export const kunden = {
  suche: null, loadingSuche: false, sucheKey: null,
  detail: null, loadingDetail: false, detailKey: null,
  rueckrufe: null, loadingRueckrufe: false,
  bestellungen: null, loadingBestellungen: false,
  angebote: null, loadingAngebote: false,
  faelle: null, loadingFaelle: false,
  warenkoerbe: null, loadingWarenkoerbe: false,
  notizen: null, loadingNotizen: false, notizenKey: null,
  erweitert: new Set(),
};

export function telLink(telefon) {
  if (!telefon || telefon === '–') return '<span class="small muted">keine Telefonnummer</span>';
  const zifferAllein = String(telefon).replace(/[^0-9+]/g, '');
  return `<a class="tel-link" href="tel:${esc(zifferAllein)}">${esc(telefon)}</a>`;
}

function kundenPositionZeile(p) {
  return `<tr>
    <td data-l="Artikel">${esc(p.titel)}${p.farbe ? `<br><span class="small muted">${esc(p.farbe)}</span>` : ''}</td>
    <td data-l="Unsere SKU">${esc(p.sku || '–')}</td>
    <td data-l="Lieferanten-Art.-Nr.">${esc(p.lieferantenArtikelnummer || '–')}</td>
    <td data-l="Menge">${esc(p.kundenmasse || p.menge)}</td>
    <td data-l="Preis">${p.preis?.betrag != null ? geldText(p.preis) : '–'}</td>
  </tr>`;
}

// Auftragsstatus aus operations/lib/status.mjs - der Kunde am Telefon fragt
// nicht nach "WARENEINGANG".
const AUFTRAG_STATUS_TEXT = {
  NEU: 'Neu', PRUEFUNG: 'In Prüfung', BERATUNG_OFFEN: 'Beratung offen',
  MASS_PRUEFUNG_OFFEN: 'Maßprüfung offen', FREIGEGEBEN: 'Freigegeben',
  EINKAUF: 'Im Einkauf', WARENEINGANG: 'Ware eingetroffen', VERSAND: 'Im Versand',
  ABGESCHLOSSEN: 'Abgeschlossen', SPAETER: 'Später', PROBLEM: 'Problem',
};

export function kundenAuftragKarte(a) {
  const dt = a.details;
  const beratungsZeilen = Object.entries(dt?.beratungsangaben || {}).filter(([, v]) => v);
  return `<article class="card kunden-auftrag${a.testbestellung ? ' testbestellung' : ''}" id="druck-${esc(a.id.replace(/\W/g, ''))}">
    <div class="card-head">
      <h3>${esc(a.name)} <span class="small muted">${fmtDate(a.datum)}</span>${a.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</h3>
      <span class="no-print"><a class="btn btn-sm btn-ghost" href="${esc(a.adminUrl)}" target="_blank" rel="noopener">Im Shopify-Admin öffnen ↗</a> <button type="button" class="btn btn-sm" data-drucken="${esc(a.id)}">Drucken</button></span>
    </div>
    <div class="chips">
      <span class="chip">Status: <b>${esc(AUFTRAG_STATUS_TEXT[a.status] || a.status)}</b></span>
      <span class="chip">Zahlung: <b>${statusText(a.bezahlt, ZAHLUNG_TEXT)}</b></span>
      <span class="chip">Versand: <b>${statusText(a.erfuellt, VERSAND_TEXT)}</b></span>
      <span class="chip">Beratung: <b>${esc(a.checks?.beratung || '–')}</b></span>
      <span class="chip">Maßprüfung: <b>${esc(a.checks?.masspruefung || '–')}</b></span>
    </div>
    ${beratungsZeilen.length ? `<p class="small">${beratungsZeilen.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' · ')}</p>` : ''}
    <div class="table-wrap kunden-table"><table><thead><tr><th>Artikel</th><th>Unsere SKU</th><th>Lieferanten-Art.-Nr.</th><th>Menge</th><th>Preis</th></tr></thead>
    <tbody>${(dt?.positionen || []).map(kundenPositionZeile).join('') || `<tr><td colspan="5">Keine Positionen.</td></tr>`}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Gesamt: ${geldText(dt?.summen?.gesamt)} · Zahlungsart: ${esc(dt?.zahlungsart || '–')} · Versandart: ${esc(dt?.versandart || '–')}</p>
  </article>`;
}

// Shopify liefert Zahlungs-, Versand- und Kanalwerte auf Englisch. Am
// Ladentresen liest das niemand als Status - deshalb Klartext, mit dem
// Rohwert als Titel fuer den Fall, dass jemand im Admin danach sucht.
export const ZAHLUNG_TEXT = {
  PAID: 'Bezahlt', PENDING: 'Zahlung offen', AUTHORIZED: 'Autorisiert',
  PARTIALLY_PAID: 'Teilweise bezahlt', PARTIALLY_REFUNDED: 'Teilweise erstattet',
  REFUNDED: 'Erstattet', VOIDED: 'Storniert', EXPIRED: 'Abgelaufen',
};
export const VERSAND_TEXT = {
  FULFILLED: 'Versandt', UNFULFILLED: 'Noch nicht versandt',
  PARTIALLY_FULFILLED: 'Teilweise versandt', IN_PROGRESS: 'Wird versandt',
  SCHEDULED: 'Geplant', ON_HOLD: 'Zurueckgestellt', OPEN: 'Offen', RESTOCKED: 'Wieder eingelagert',
};

export function statusText(wert, karte) {
  if (wert === null || wert === undefined || wert === '') return NICHT_HINTERLEGT;
  const text = karte[wert];
  return text ? `<span title="${esc(wert)}">${esc(text)}</span>` : esc(wert);
}
