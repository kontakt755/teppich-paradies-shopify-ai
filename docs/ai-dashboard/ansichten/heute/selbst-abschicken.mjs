/**
 * "Von uns abschicken" auf der Shop-Übersicht (Inhaber 06.11.2026, #1995): Ware, die WIR auf den
 * Weg bringen - aus eigener Lagerrolle zuschneiden (Lieferweg "aus Lager") oder bei uns
 * eingetroffene Ware packen und verschicken ("über uns"). Bis dahin stand Lagerware als "beim
 * Lieferanten bestellen" in der Liste, und niemand sah, dass der Zuschnitt bei uns liegt.
 *
 * Steht direkt unter den Warenbestellungen und nur, wenn etwas zu tun ist - ein leerer Kasten
 * waere Rauschen. Zaehlt Warenpositionen offener, echter Bestellungen (lib/lieferweg.mjs
 * selbstStand). Gelb und Rot folgen der vorhandenen Frist "Ware liegt bei uns" (lib/todos.mjs
 * FRISTEN.rausgeben), keine neue Schwelle. Aus dem To-do "Ware ist da – rausgeben" nimmt heute.mjs
 * die Positionen heraus, die dieser Block zeigt (lib/todos.mjs rausgebenOhne, Schluessel aus
 * `schluessel`) - eine Sache steht genau einmal auf der Seite.
 *
 * Knoepfe kommen aus einkauf/auftragsfluss.mjs selbstKnoepfe (dieselben wie im Einkauf und in der
 * Kundenakte); Klicks verteilt ereignisse.mjs ueber data-Attribute. Styles: stile/heute.css.
 */
import { esc, plural } from '../../kern/helfer.mjs';
import { lieferwegVon, selbstStand, selbstStandText } from '../../lib/lieferweg.mjs';
import { lieferwegPlakette } from '../../bausteine/lieferweg.mjs';
import { FRISTEN, alterText, tageSeit, tonNachAlter } from '../../lib/todos.mjs';
import { vorgangsLink } from '../../lib/vorgangslink.mjs';
import { mengeKurz } from '../../lib/bestellinhalt.mjs';
import { selbstKnoepfe } from '../einkauf/auftragsfluss.mjs';

/** Mehr Zeilen klappen auf - am Handy bleibt der Muster-Block sonst unter dem ersten Bildschirm. */
export const SELBST_SICHTBAR = 5;

const TON_RANG = { crit: 0, warn: 1, '': 2 };

/**
 * Ab wann die Frist zaehlt: beim Zuschneiden ab der Bestellung, danach ab Zuschnitt bzw. Eingang -
 * solange liegt die Ware bei uns, auch wenn sie schon gepackt ist. "Gepackt" setzt die Frist nicht
 * zurueck (Pruefung 06.11.: sonst war eine seit 6 Tagen liegende Ware nach dem Klick wieder neutral).
 */
function seit(stand, z, eintrag) {
  if (stand === 'zuschneiden') return z.datum || z.auftrag?.datum || null;
  return eintrag?.selbstversand?.zugeschnitten?.am || eintrag?.geliefertAm || null;
}

/**
 * Stand fuer Block und Doppelt-Pruefung. Reine Funktion.
 * @param {object} p
 * @param {object} p.daten       /api/kunden/bestellungen (zeilen mit auftrag.positionen und positionsstatus)
 * @param {object} [p.statusAlle] einkauf.auftragsstatus ({ positionen: { "<orderId>::<lineItemId>": eintrag } }) -
 *                                frischer als positionsstatus, weil ein Klick ihn sofort nachfuehrt
 * @returns {{ verfuegbar:boolean, zeilen:object[], schluessel:Set<string>, fehler:string|null }}
 */
export function selbstAbschickenStand({ daten, statusAlle = null, jetzt = new Date() } = {}) {
  const leer = { verfuegbar: false, zeilen: [], schluessel: new Set(), fehler: null };
  if (!daten || !daten.verfuegbar || !Array.isArray(daten.zeilen)) return leer;
  const frisch = statusAlle?.positionen && typeof statusAlle.positionen === 'object' ? statusAlle.positionen : null;
  const zeilen = [];
  for (const z of daten.zeilen) {
    if (!z || z.testbestellung || z.storniert || z.archiviert || z.offen === false || z.fulfillmentstatus === 'FULFILLED') continue;
    for (const p of z.auftrag?.positionen || []) {
      if (!p?.lineItemId || p.istMuster || (p.menge ?? 1) <= 0) continue;
      const key = `${z.orderId}::${p.lineItemId}`;
      const eintrag = frisch ? (frisch[key] || null) : (z.positionsstatus?.[p.lineItemId] || null);
      const stand = selbstStand(p, eintrag);
      if (!stand) continue;
      const lw = lieferwegVon(p, eintrag);
      const tage = tageSeit(seit(stand, z, eintrag), jetzt);
      zeilen.push({
        key, z, p: { ...p, orderId: z.orderId, orderName: z.orderName || '' }, eintrag, stand, lw, tage,
        ton: tonNachAlter(tage, ...FRISTEN.rausgeben),
      });
    }
  }
  zeilen.sort((a, b) => TON_RANG[a.ton] - TON_RANG[b.ton] || (b.tage ?? -1) - (a.tage ?? -1) || a.key.localeCompare(b.key));
  return { verfuegbar: true, zeilen, schluessel: new Set(zeilen.map(x => x.key)), fehler: daten.lagerwareFehler || null };
}

function zeile(x, { erste, lesend }) {
  const { z, p } = x;
  const ziel = z.kundenSchluessel ? vorgangsLink('kunden', { kunde: z.kundenSchluessel, auftrag: z.orderId })
    : `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bart: 'ware', bfilter: 'alle', bq: z.orderName || z.orderId || '' })}`;
  const menge = p.kundenmenge ? mengeKurz(p.kundenmenge) : p.menge;
  const artikel = [p.titel, p.farbe, menge].filter(v => v !== undefined && v !== null && String(v).trim() && v !== 'UNGEKLAERT').map(String);
  // Die Marke nennt den Bezug (#1996): "Liegt seit 8 Tagen hier" bzw. beim Zuschnitt "Kunde wartet 3 Tage".
  const alter = x.tage === null ? '' : `<span class="heute-alter${x.ton ? ` ${x.ton}` : ''}">${esc(alterText(x.tage, x.stand === 'zuschneiden' ? 'kunde' : 'hier'))}</span>`;
  const knoepfe = lesend ? '' : selbstKnoepfe(p, x.eintrag, { haupt: erste, rueckgaengig: true });
  return `<div class="heute-bestellzeile selbst-zeile" data-selbst-zeile="${esc(x.stand)}"><div>
      <strong><a href="${esc(ziel)}">${esc(z.orderName || 'Bestellung')}</a> · ${esc(z.kundenname || 'Kunde nicht hinterlegt')}</strong>
      <p>${esc(artikel.join(' · ') || 'Artikel nicht hinterlegt')}</p>
      <p class="selbst-stand">${lieferwegPlakette(x.lw)} <span>${esc(selbstStandText(x.stand, x.lw?.weg, x.eintrag))}</span> ${alter}</p>
      ${p.lagerHinweis && x.lw?.weg === 'lager' ? `<p class="selbst-hinweis">${esc(p.lagerHinweis)}</p>` : ''}</div>
      ${knoepfe ? `<div class="selbst-knoepfe">${knoepfe}</div>` : ''}</div>`;
}

/** Der Block; leer, solange nichts zu tun ist und die Regeldatei lesbar ist. */
export function selbstAbschickenBlock(stand, { lesend = false } = {}) {
  if (!stand?.verfuegbar) return '';
  const n = stand.zeilen.length;
  // Eine beschaedigte Regeldatei sagt es laut - sonst stuende Lagerware still wieder unter "bestellen".
  const fehler = stand.fehler ? `<p class="notice crit" role="alert">${esc(stand.fehler)} Lagerware steht deshalb gerade nicht in dieser Liste; Bestellmail und „bestellt“ sind gesperrt.</p>` : '';
  if (!n && !fehler) return '';
  const sichtbar = stand.zeilen.slice(0, SELBST_SICHTBAR);
  const rest = stand.zeilen.slice(SELBST_SICHTBAR);
  const zeichne = (x, i) => zeile(x, { erste: i === 0, lesend });
  return `<section class="heute-geschaeft selbst-abschicken" aria-labelledby="heuteSelbstAbschicken"><div class="heute-geschaeft-kopf">
    <h2 id="heuteSelbstAbschicken">Von uns abschicken${n ? ` · ${n}` : ''}</h2>
    <p>Ware, die wir selbst auf den Weg bringen: aus eigenem Lager zuschneiden oder Eingetroffenes packen und verschicken.</p></div>
    ${fehler}${sichtbar.map(zeichne).join('')}
    ${rest.length ? `<details class="selbst-mehr"><summary>${esc(plural(rest.length, 'weitere Position', 'weitere Positionen'))}</summary>${rest.map(x => zeile(x, { erste: false, lesend })).join('')}</details>` : ''}
  </section>`;
}
