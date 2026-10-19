/**
 * Abgleich mit Shopify (Inhaber 2026-10-19): Bestellungen, die im Control Center abgehakt sind
 * ("An Kunden raus" oder "Erledigt"), in Shopify aber noch offen stehen. Die Liste erscheint auf
 * "Heute" nur, wenn es solche Bestellungen gibt; je Zeile ein Knopf "In Shopify nachbuchen"
 * (ohne Mail an den Kunden). Die Zahl im Kopf ist die Zahl der Zeilen.
 *
 * Die Gegenrichtung (in Shopify versendet -> hier mindestens "raus") macht der Dienst selbst nach
 * jedem neuen Bestellexport; dafuer gibt es nichts zu klicken. Regeln:
 * operations/lib/shopify-abgleich.mjs, Endpunkte GET /api/einkauf/shopify-abgleich und
 * POST /api/einkauf/auftragsstatus mit aktion "shopifyNachbuchen".
 */
import { esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { state } from '../../kern/zustand.mjs';
import { render } from '../../kern/render.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { ladeStandNeu } from './auftragsfluss.mjs';

// Wie die anderen Daten auf "Heute": nach einer halben Minute beim naechsten Zeichnen still nachladen.
const HALTBAR_MS = 30_000;
const SICHTBAR = 5;

export const shopifyAbgleich = { daten: null, am: 0, laedt: false };

export function ensureShopifyAbgleich({ neu = false } = {}) {
  if (shopifyAbgleich.laedt) return;
  if (!neu && shopifyAbgleich.daten && Date.now() - shopifyAbgleich.am < HALTBAR_MS) return;
  shopifyAbgleich.laedt = true;
  fetchEinkauf('/api/einkauf/shopify-abgleich').then(d => {
    const vorher = JSON.stringify(shopifyAbgleich.daten);
    shopifyAbgleich.daten = d; shopifyAbgleich.am = Date.now(); shopifyAbgleich.laedt = false;
    if (state.route.view === 'heute' && JSON.stringify(d) !== vorher) render();
  });
}

const STATUS_TEXT = { raus: 'an Kunden raus', erledigt: 'erledigt' };

function artikelText(p) {
  return [p.titel, p.farbe].filter(Boolean).join(' · ') || 'Artikel';
}

function zeile(z, lesend) {
  const stufe = z.positionen.every(p => p.status === 'erledigt') ? 'erledigt' : 'raus';
  const titel = `${z.orderName || 'Bestellung'}${z.kunde ? ` · ${z.kunde}` : ''}`;
  const artikel = z.positionen.slice(0, 2).map(artikelText).join(', ') + (z.positionen.length > 2 ? ` +${z.positionen.length - 2}` : '');
  const kontext = `${plural(z.positionen.length, 'Artikel', 'Artikel')} im Dashboard ${STATUS_TEXT[stufe]}${z.seit ? ` seit ${fmtDate(z.seit)}` : ''} · ${artikel}`;
  const knopf = lesend ? '' : `<button type="button" class="btn btn-sm" data-shopify-nachbuchen="${esc(z.orderId)}" title="Bucht diese Artikel in Shopify als versendet – ohne Mail an den Kunden">In Shopify nachbuchen</button>`;
  return `<div class="heute-todo warn" data-abweichung="${esc(z.orderId)}">
    <div class="heute-todo-text"><div class="t">${esc(titel)}</div><div class="s">${esc(kontext)}</div></div>
    ${knopf}
  </div>`;
}

/** Block fuer "Heute". Leer, solange nichts abweicht - eine 0 ist kein Arbeitsauftrag. */
export function shopifyAbgleichBlock() {
  const d = shopifyAbgleich.daten;
  if (!d?.verfuegbar) return '';
  if (d.fehler) {
    return `<section class="heute-block" aria-labelledby="heuteAbgleich"><div class="heute-block-kopf"><h2 id="heuteAbgleich">Abgleich mit Shopify</h2></div>
      <p class="heute-hinweis">Abgleich mit Shopify nicht möglich: ${esc(d.fehler)}</p></section>`;
  }
  const liste = d.abweichungen || [];
  if (!liste.length) return '';
  const lesend = istNurLesend();
  const oben = liste.slice(0, SICHTBAR);
  const rest = liste.slice(SICHTBAR);
  return `<section class="heute-block" aria-labelledby="heuteAbgleich">
    <div class="heute-block-kopf"><h2 id="heuteAbgleich">In Shopify noch offen</h2><span>${plural(liste.length, 'Bestellung', 'Bestellungen')} · im Dashboard abgehakt</span></div>
    <div class="heute-todos">
      ${oben.map(z => zeile(z, lesend)).join('')}
      ${rest.length ? `<details class="heute-rest"><summary>Alle anzeigen (+${rest.length})</summary>${rest.map(z => zeile(z, lesend)).join('')}</details>` : ''}
    </div>
  </section>`;
}

async function nachbuchen(knopf) {
  if (istNurLesend()) return;
  knopf.disabled = true;
  const text = knopf.textContent;
  knopf.textContent = 'Wird gebucht …';
  try {
    const j = await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'shopifyNachbuchen', orderId: knopf.dataset.shopifyNachbuchen });
    const r = versandRueckmeldung('In Shopify nachgebucht', j.shopify);
    toast(r.text, r.ton, { dauer: r.ton ? 9000 : 5000 });
  } catch (e) {
    toast(`Nicht nachgebucht: ${e.message}`, 'crit', { dauer: 9000 });
    knopf.disabled = false;
    knopf.textContent = text;
  }
  ensureShopifyAbgleich({ neu: true });
  await ladeStandNeu();
}

/** Klick "In Shopify nachbuchen". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function shopifyAbgleichKlick(e) {
  const knopf = e.target.closest('[data-shopify-nachbuchen]');
  if (!knopf) return false;
  e.preventDefault();
  nachbuchen(knopf);
  return true;
}
