/** Warenkunden zuerst; alle Aktionen fuehren in die vorhandenen Bestellwege. */
import { esc, plural, geldText } from '../../kern/helfer.mjs';
import { shopBestellarbeit } from '../../lib/shop-bestellarbeit.mjs';
import { vorgangsLink } from '../../lib/vorgangslink.mjs';

const ALLE = '#/kunden?tab=bestellungen&amp;bart=ware&amp;bsort=wichtigkeit';
const SICHTBAR = 5;
const WARTET_TEXT = { lieferant: 'wartet auf Lieferant', kunde: 'wartet auf Kunde' };

export function warenbestellungenBlock({ daten, lesend = false } = {}) {
  const arbeit = shopBestellarbeit(daten);
  // Hauptknopf auf der ersten Zeile, bei der wir dran sind (Rundgang 29.10., T4) - nicht auf
  // einer Bestellung, die nur auf den Lieferanten wartet.
  const erste = arbeit.zeilen.slice(0, SICHTBAR).findIndex(a => !a.wartet);
  const zeile = (a, i) => {
    const z = a.zeile;
    // Auch eine versandte Bestellung mit offener Zahlung bleibt hier erreichbar;
    // die reine Einkaufsliste enthaelt solche Auftraege nicht mehr.
    const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
      : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bart: 'ware', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
    const wert = Number.isFinite(z.gesamtbetrag) && z.waehrung
      ? geldText({ betrag: z.gesamtbetrag, waehrung: z.waehrung }) : 'nicht hinterlegt';
    const alter = a.tage === null ? 'Bestelldatum fehlt' : a.tage ? `seit ${plural(a.tage, 'Tag', 'Tagen')}` : 'heute eingegangen';
    const zahlung = a.bezahlt ? 'bezahlt' : z.zahlungsstatus === 'PARTIALLY_PAID' ? 'teilweise bezahlt'
      : z.zahlungsstatus === 'AUTHORIZED' ? 'Zahlung autorisiert' : 'Zahlung prüfen';
    return `<div class="heute-bestellzeile"><div><strong>${esc(z.kundenname || 'Kunde nicht hinterlegt')} · ${esc(z.orderName || 'Bestellung')}</strong>
      <p>Bestellwert ${wert} · ${esc(zahlung)} · ${esc(alter)}${a.gemischt ? ' · mit Mustern' : ''}</p>
      <p>${esc(a.stand)} · ${esc(WARTET_TEXT[a.wartet] || a.naechstes?.replaceAll('Großhändler-ID', 'Lieferanten-Artikelnummer'))}</p></div>
      <a class="btn btn-sm${!lesend && i === erste ? ' btn-primary' : ''}" href="${esc(ziel)}">${lesend || a.wartet ? 'Bestellung ansehen' : 'Bestellung bearbeiten'}</a></div>`;
  };
  return `<section class="heute-geschaeft" aria-labelledby="heuteWarenbestellungen"><div class="heute-geschaeft-kopf">
    <h2 id="heuteWarenbestellungen">Warenbestellungen${arbeit.offen === null ? '' : ` · ${arbeit.offen}`}</h2>
    <p>Offene Warenaufträge mit nächstem Schritt. Bestellwert inklusive Versand und gegebenenfalls auch Muster.</p></div>
    ${!arbeit.verfuegbar ? `<p class="${arbeit.laedt ? 'muted' : 'notice warn'}" role="status">${esc(arbeit.hinweis)}</p>`
      : arbeit.zeilen.length ? arbeit.zeilen.slice(0, SICHTBAR).map(zeile).join('')
        : '<p class="muted">Keine offene Warenarbeit im geladenen Bestellstand.</p>'}
    <p><a class="btn btn-sm" href="${ALLE}">Alle Warenbestellungen ansehen${arbeit.offen > SICHTBAR ? ` · ${arbeit.offen - SICHTBAR} weitere in Arbeit` : ''} →</a></p></section>`;
}
