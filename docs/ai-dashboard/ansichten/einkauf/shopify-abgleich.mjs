/**
 * Abgleich mit Shopify (Inhaber 2026-10-19): Bestellungen, die im Control Center abgehakt sind
 * ("An Kunden raus" oder "Erledigt"), in Shopify aber noch offen stehen. Auf "Heute" stehen sie
 * seit #1427 als Zeilen der einen Arbeitsliste (shopifyAbgleichTodos), je Zeile ein Knopf "In
 * Shopify nachbuchen" (ohne Mail an den Kunden). shopifyAbgleichBlock bleibt fuer andere Ansichten.
 *
 * Die Gegenrichtung (in Shopify versendet -> hier mindestens "raus") macht der Dienst selbst nach
 * jedem neuen Bestellexport; dafuer gibt es nichts zu klicken.
 *
 * Dazu Positionen, die aus der Kundenbestellung entfernt wurden, beim Lieferanten aber bestellt
 * sind (`entfernt`, Fehlersuche 28.10.2026, #1056): rotes To-do "Lieferantenbestellung
 * stornieren?". "Abhaken…" setzt sie mit Notiz ueber die vorhandene Aktion "zurueckAufOffen"
 * zurueck (ohne Shopify); mit Menge 0 fallen sie danach ueberall heraus. Regeln:
 * operations/lib/shopify-abgleich.mjs, Endpunkte GET /api/einkauf/shopify-abgleich und
 * POST /api/einkauf/auftragsstatus mit aktion "shopifyNachbuchen".
 */
import { $, esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { state } from '../../kern/zustand.mjs';
import { render } from '../../kern/render.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';
import { lieferantName as lieferantAnzeige } from '../../lib/einkauf-lieferanten.mjs';
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
    // Vorhandene Arbeit bei einer Stoerung bewahren; initial muss der Fehler sichtbar bleiben.
    if ((d?.verfuegbar && !d.fehler) || !shopifyAbgleich.daten?.verfuegbar) shopifyAbgleich.daten = d;
    shopifyAbgleich.am = Date.now(); shopifyAbgleich.laedt = false;
    if (state.route.view === 'heute' && JSON.stringify(shopifyAbgleich.daten) !== vorher) render();
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

const tageSeit = (iso, jetzt) => {
  const t = iso ? Math.max(0, Math.floor((jetzt - Date.parse(iso)) / 86400000)) : null;
  return Number.isFinite(t) ? t : null;
};

/** Aus der Kundenbestellung entfernt, beim Lieferanten bestellt: je Bestellung ein rotes To-do. */
function entferntTodos(liste, jetzt, lieferantName) {
  return (liste || []).map((z) => {
    const artikel = z.positionen.slice(0, 2).map(artikelText).join(', ') + (z.positionen.length > 2 ? ` +${z.positionen.length - 2}` : '');
    const bei = [...new Set(z.positionen.map(p => p.lieferant).filter(Boolean))].map(id => lieferantName(id)).join(', ');
    return {
      id: `entfernt:${z.orderId}`, art: 'entfernt', bereich: 'laden', ton: 'crit', alterTage: tageSeit(z.seit, jetzt),
      titel: `Aus Bestellung entfernt: ${z.orderName || 'Bestellung'} – Lieferantenbestellung stornieren?`,
      kontext: [z.kunde, `${plural(z.positionen.length, 'Artikel', 'Artikel')} nicht mehr in der Bestellung, aber ${bei ? `bei ${bei} ` : ''}bestellt${z.seit ? ` am ${fmtDate(z.seit)}` : ''}`, artikel].filter(Boolean).join(' · '),
      knopf: { text: 'Abhaken…', abhaken: z.orderId, href: `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bfilter: 'alle', bq: z.orderName || z.orderId })}` },
    };
  });
}

/**
 * Zeilen fuer die eine Arbeitsliste auf "Heute" (seit 2026-10-19, #1427): je Bestellung ein To-do
 * mit "In Shopify nachbuchen" in der Zeile, dazu die aus der Bestellung entfernten Positionen.
 * Leer, solange nichts abweicht. Bereich Laden.
 */
export function shopifyAbgleichTodos(jetzt = Date.now(), { lieferantName = id => lieferantAnzeige(id) } = {}) {
  const d = shopifyAbgleich.daten;
  // Der Server konnte nicht abgleichen (fehler als Text): eine Zeile. Ein gescheiterter Abruf
  // (fehler: true aus fetchEinkauf) steht auf "Heute" als "Liste unvollstaendig" - nicht doppelt.
  if (typeof d?.fehler === 'string' && d.fehler) {
    return [{ id: 'shopify-abgleich-fehler', art: 'shopify_abgleich', bereich: 'laden', ton: 'warn', alterTage: null,
      titel: 'Abgleich mit Shopify nicht möglich', kontext: d.fehler, knopf: { text: 'Bestellen', href: '#/einkauf' } }];
  }
  if (!d?.verfuegbar || d.fehler) return [];
  return [...entferntTodos(d.entfernt, jetzt, lieferantName), ...(d.abweichungen || []).map((z) => {
    const stufe = z.positionen.every(p => p.status === 'erledigt') ? 'erledigt' : 'raus';
    const artikel = z.positionen.slice(0, 2).map(artikelText).join(', ') + (z.positionen.length > 2 ? ` +${z.positionen.length - 2}` : '');
    return {
      id: `shopify-abgleich:${z.orderId}`, art: 'shopify_abgleich', bereich: 'laden', ton: 'warn', alterTage: tageSeit(z.seit, jetzt),
      titel: `In Shopify noch offen: ${z.orderName || 'Bestellung'}${z.kunde ? ` · ${z.kunde}` : ''}`,
      kontext: `${plural(z.positionen.length, 'Artikel', 'Artikel')} im Dashboard ${STATUS_TEXT[stufe]}${z.seit ? ` seit ${fmtDate(z.seit)}` : ''} · ${artikel}`,
      knopf: { text: 'In Shopify nachbuchen', nachbuchen: z.orderId, href: `#/einkauf?${new URLSearchParams({ auftrag: z.orderId })}` },
    };
  })];
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

/**
 * "Abhaken…" an einer aus der Bestellung entfernten Position: fragt, was mit der
 * Lieferantenbestellung ist (Pflicht), und setzt die Artikel mit dieser Notiz zurueck.
 */
function abhakenDialog(orderId) {
  if (istNurLesend()) return;
  const z = (shopifyAbgleich.daten?.entfernt || []).find(x => x.orderId === orderId);
  if (!z) return;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="entTitel" data-dialog>
    <h2 id="entTitel">Aus Bestellung entfernt · ${esc(z.orderName || 'Bestellung')}</h2>
    <p class="small muted">Diese Artikel stehen nicht mehr in der Kundenbestellung, sind aber beim Lieferanten bestellt. Erst die Lieferantenbestellung stornieren, dann hier abhaken. Die Artikel verschwinden danach aus den Listen; der Vermerk bleibt im Verlauf.</p>
    <ul class="small" style="margin:0;padding-left:18px">${z.positionen.map(p => `<li>${esc(artikelText(p))}</li>`).join('')}</ul>
    <div class="field"><label for="entNotiz">Was ist mit der Lieferantenbestellung? (Pflicht)</label><textarea id="entNotiz" name="notiz" required maxlength="500" placeholder="z. B. am 29.10. telefonisch storniert"></textarea></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Abhaken</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('textarea')?.focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const notiz = String(new FormData(form).get('notiz') || '').trim();
    if (!notiz) return;
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    try {
      const j = await orgSchreiben('/api/einkauf/auftragsstatus', {
        aktion: 'zurueckAufOffen', notiz: `Aus der Bestellung entfernt: ${notiz}`,
        positionen: z.lineItemIds.map(lineItemId => ({ orderId: z.orderId, lineItemId })),
      });
      $('#dialogRoot').innerHTML = '';
      toast(`${z.orderName || 'Bestellung'}: ${plural(j.anzahl || 0, 'Artikel', 'Artikel')} abgehakt`);
    } catch (e) {
      toast(`Nicht abgehakt: ${e.message}`, 'crit', { dauer: 9000 });
      knopf.disabled = false;
      return;
    }
    ensureShopifyAbgleich({ neu: true });
    await ladeStandNeu();
  });
}

/** Klick "In Shopify nachbuchen" oder "Abhaken…". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function shopifyAbgleichKlick(e) {
  const abhaken = e.target.closest('[data-entfernt-abhaken]');
  if (abhaken) { e.preventDefault(); abhakenDialog(abhaken.dataset.entferntAbhaken); return true; }
  const knopf = e.target.closest('[data-shopify-nachbuchen]');
  if (!knopf) return false;
  e.preventDefault();
  nachbuchen(knopf);
  return true;
}
