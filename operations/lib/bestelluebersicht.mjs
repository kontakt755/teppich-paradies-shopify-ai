/**
 * Bestelluebersicht fuer das Team: was ist fuer offene Kundenbestellungen
 * bei welchem Lieferanten nachzubestellen, und wie steht jeder Auftrag.
 *
 * Reine Aufbereitung - keine eigene Logik fuer Grosshaendler-ID, Umrechnung,
 * Gruppierung oder Status. Das kommt aus resolve.mjs, umrechnung.mjs,
 * einkauf.mjs, status.mjs und ampel.mjs. Fehlendes heisst UNGEKLAERT.
 *
 * Die erzeugte Seite enthaelt Bestelldaten und wird nie ins Repository
 * geschrieben (README "Bestelluebersicht").
 */

import { resolveLineItem, metafeldMap, grosshaendlerId, propertiesMap } from './resolve.mjs';
import { UNGEKLAERT, EINHEIT, paketware, rollenware, stueck, formatDe } from './umrechnung.mjs';
import { gruppieren } from './einkauf.mjs';
import { ableiten } from './status.mjs';
import { procurementReady, GRUPPE } from './ampel.mjs';
import { normalisiereLineItem } from '../sync/orders.mjs';

export const ADMIN_ORDER_URL = 'https://admin.shopify.com/store/sjjyq1-6w/orders/';

const OFFEN_FULFILLMENT = new Set(['UNFULFILLED', 'PARTIALLY_FULFILLED', 'ON_HOLD', 'IN_PROGRESS', 'OPEN', 'PENDING_FULFILLMENT', 'SCHEDULED', 'REQUEST_DECLINED']);

function leer(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

export function numerischeId(gid) {
  const m = String(gid ?? '').match(/(\d+)$/);
  return m ? m[1] : null;
}

export function adminLink(orderId) {
  const n = numerischeId(orderId);
  return n ? ADMIN_ORDER_URL + n : null;
}

/** Nimmt Rohdaten der GraphQL-Antwort oder bereits normalisierte Positionen. */
function normalisiert(li) {
  if (!li?.variant || Array.isArray(li.variant.metafields)) return li;
  return normalisiereLineItem(li);
}

function knoten(conn) {
  if (!conn) return [];
  if (Array.isArray(conn)) return conn;
  if (Array.isArray(conn.nodes)) return conn.nodes;
  if (Array.isArray(conn.edges)) return conn.edges.map(e => e.node);
  return [];
}

/** Bestellung gilt als offen: nicht storniert und nicht (vollstaendig) erfuellt. */
export function istOffen(order) {
  if (order?.cancelledAt) return false;
  const f = String(order?.displayFulfillmentStatus ?? '').toUpperCase();
  return f === '' || OFFEN_FULFILLMENT.has(f);
}

function offeneMenge(li) {
  for (const k of ['unfulfilledQuantity', 'currentQuantity', 'quantity']) {
    if (li[k] !== undefined && li[k] !== null) return Number(li[k]) || 0;
  }
  return 0;
}

/**
 * Lieferant als Pseudonym A-D. Reihenfolge: einkauf.lieferant, dann die
 * Quelle der Grosshaendler-ID (lieferant_a_/lieferant_b_), dann
 * lieferant.bevorzugt. Sonst UNGEKLAERT.
 */
export function lieferantFuer(item, variantMetafelder) {
  const e = item?.einkauf?.lieferant;
  if (!leer(e) && e !== UNGEKLAERT) return String(e).toUpperCase();
  const q = item?.grosshaendlerIdQuelle ?? '';
  const m = q.match(/lieferant_([a-d])_artikelnummer/);
  if (m) return m[1].toUpperCase();
  const b = variantMetafelder?.lieferant?.bevorzugt;
  if (!leer(b) && /^[a-d]$/i.test(String(b).trim())) return String(b).trim().toUpperCase();
  return UNGEKLAERT;
}

export function istMusterPosition(item, lineItem) {
  if (item.istMuster) return true;
  const sku = String(item.sku ?? '');
  if (/^TP-MUSTER/i.test(sku)) return true;
  const handle = String(lineItem?.variant?.product?.handle ?? '');
  return /(^|-)muster(-|$)/i.test(handle);
}

/**
 * Einkaufsmenge aus der Kundenmenge. Nur mit belegten Stammdaten, sonst
 * UNGEKLAERT mit Grund. Nutzt ausschliesslich umrechnung.mjs.
 */
export function einkaufsmenge(item, menge) {
  const e = item.einkauf || {};
  const p = item.produkt || {};
  const ein = item.eingaben || {};
  const gruppe = procurementReadyGruppe(item);
  const ungeklaert = grund => ({ menge: UNGEKLAERT, einheit: UNGEKLAERT, text: UNGEKLAERT, grund });

  if (!(menge > 0)) return ungeklaert('keine offene Menge');
  try {
    if (e.bestelleinheit === EINHEIT.PAKET || gruppe === GRUPPE.PAKET) {
      if (p.qm_pro_paket === UNGEKLAERT) return ungeklaert('Paketinhalt fehlt (custom.qm_pro_paket)');
      // Shopify-Menge von Paketprodukten ist die Paketzahl; ein Bedarf aus dem Rechner gewinnt.
      const r = ein.bedarfQm > 0 ? paketware({ bedarfM2: ein.bedarfQm, qmProPaket: p.qm_pro_paket }) : { pakete: menge, qmGesamt: Math.round(menge * p.qm_pro_paket * 100) / 100 };
      return { menge: r.pakete, einheit: EINHEIT.PAKET, text: `${r.pakete} Paket(e) = ${formatDe(r.qmGesamt)} m²`, grund: null };
    }
    if (e.bestelleinheit === EINHEIT.LFM || gruppe === GRUPPE.ROLLE) {
      const breiteCm = ein.rollenbreiteCm || ein.ausRolleCm || (p.rollenbreite !== UNGEKLAERT ? p.rollenbreite * 100 : null);
      if (!(breiteCm > 0)) return ungeklaert('Rollenbreite fehlt (custom.rollenbreite / Property Rollenbreite)');
      const laengeCm = ein.gewuenschteLaengeCm;
      const flaecheM2 = p.preis_pro_001_qm ? menge / 100 : null;
      if (!(laengeCm > 0) && !(flaecheM2 > 0)) return ungeklaert('Laenge fehlt (Property Gewuenschte Laenge)');
      const r = rollenware({ laengeCm, flaecheM2, breiteM: breiteCm / 100 });
      const rasterHinweis = r.raster === UNGEKLAERT ? ' (Lieferantenraster UNGEKLAERT)' : '';
      return { menge: r.lfm, einheit: EINHEIT.LFM, text: r.text + rasterHinweis, grund: r.raster === UNGEKLAERT ? 'Lieferantenraster nicht belegt' : null };
    }
    if (e.bestelleinheit === EINHEIT.STUECK) {
      const r = stueck({ menge });
      return { menge: r.stueck, einheit: EINHEIT.STUECK, text: `${r.stueck} Stück`, grund: null };
    }
  } catch (err) {
    return ungeklaert(`Umrechnung nicht moeglich: ${err.message}`);
  }
  if (e.bestelleinheit === UNGEKLAERT || leer(e.bestelleinheit)) return ungeklaert('Bestelleinheit fehlt (einkauf.bestelleinheit)');
  return ungeklaert(`Bestelleinheit ${e.bestelleinheit} ohne Umrechnungsregel`);
}

function procurementReadyGruppe(item) {
  return procurementReady(item).gruppe;
}

function kundenmengeText(item, menge) {
  const teile = [];
  if (item.produkt?.preis_pro_001_qm) teile.push(`${menge} × 0,01 m² = ${formatDe(menge / 100)} m²`);
  else teile.push(`${menge} Stk.`);
  const m = item.eingaben?.masse;
  if (m) teile.push(`${m.breiteCm} × ${m.laengeCm} cm`);
  return teile.join(' · ');
}

function attributWert(order, name) {
  const p = propertiesMap(order?.customAttributes);
  const key = Object.keys(p).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? String(p[key] ?? '').trim() : '';
}

function jaNein(wert) {
  const w = String(wert).toLowerCase();
  if (w === 'ja' || w === 'true' || w === 'yes') return 'Ja';
  if (w === 'nein' || w === 'false' || w === 'no') return 'Nein';
  return wert ? wert : '–';
}

/** Muster: Grosshaendler-ID der Quellvariante (Property _Quellvariante_ID). */
function musterQuelle(item, quellMap) {
  const id = numerischeId(item.einkauf?.quellvariante !== UNGEKLAERT ? item.einkauf?.quellvariante : item.eingaben?.quellvarianteId);
  const qv = id ? quellMap.get(id) : null;
  if (!qv) return { id: UNGEKLAERT, quelle: null, lieferant: UNGEKLAERT, quellvariante: id, titel: null };
  const n = normalisiert({ variant: qv }).variant;
  const vm = metafeldMap(n.metafields);
  const pm = metafeldMap(n.product?.metafields);
  const gh = grosshaendlerId({ variantMetafelder: vm, produktMetafelder: pm, sku: n.sku });
  const lf = lieferantFuer({ einkauf: {}, grosshaendlerIdQuelle: gh.quelle }, vm);
  const url = vm?.einkauf?.lieferant_url;
  return { id: gh.id, quelle: gh.quelle, lieferant: lf, quellvariante: id, titel: `${n.product?.title ?? ''} – ${n.title ?? ''}`.trim(), lieferantUrl: leer(url) ? UNGEKLAERT : String(url).trim() };
}

/**
 * @param {object} daten  {orders:[...], quellvarianten?:[...]} oder Array von Orders
 * @returns {object} Modell fuer renderHtml
 */
export function aufbereiten(daten, { jetzt = new Date() } = {}) {
  const orders = Array.isArray(daten) ? daten : (daten?.orders ?? []);
  const quellMap = new Map();
  for (const qv of (Array.isArray(daten) ? [] : daten?.quellvarianten ?? [])) {
    const n = numerischeId(qv?.id);
    if (n) quellMap.set(n, qv);
  }

  const auftraege = [];
  const einkaufPositionen = [];
  const muster = [];

  for (const order of orders) {
    const zeilen = knoten(order.lineItems).map(normalisiert);
    const offen = istOffen(order);
    const positionen = zeilen.map(li => {
      const item = resolveLineItem({ lineItem: li, variant: li.variant, alleZeilen: zeilen });
      const vm = metafeldMap(li.variant?.metafields);
      const props = propertiesMap(li.customAttributes ?? li.properties);
      const menge = offeneMenge(li);
      const istM = istMusterPosition(item, li);
      const farbe = props.Farbe || li.variantTitle || li.variant?.title || '–';
      let ghId = item.grosshaendlerId;
      let ghQuelle = item.grosshaendlerIdQuelle;
      let lieferant = lieferantFuer(item, vm);
      let mq = null;
      if (istM) {
        mq = musterQuelle(item, quellMap);
        ghId = mq.id; ghQuelle = mq.quelle ? `Quellvariante: ${mq.quelle}` : null; lieferant = mq.lieferant;
      }
      const pos = {
        orderId: order.id,
        orderName: order.name,
        orderDatum: order.createdAt,
        lineItemId: li.id ?? null,
        lieferantUrl: istM ? (mq?.lieferantUrl ?? UNGEKLAERT) : (item.einkauf.lieferant_url ?? UNGEKLAERT),
        titel: istM && props.Produkt ? `Muster: ${props.Produkt}` : (li.title ?? li.variant?.product?.title ?? '–'),
        farbe,
        sku: item.sku,
        menge,
        kundenmenge: kundenmengeText(item, menge),
        grosshaendlerId: ghId,
        grosshaendlerIdQuelle: ghQuelle,
        lieferant,
        route: item.einkauf.route,
        istMuster: istM,
        musterQuelle: mq,
        ohneVariante: !li.variant,
        masspruefung: item.masspruefung,
        einkauf: item.einkauf,
        bestellmenge: istM ? { menge, einheit: 'muster', text: `${menge} Muster`, grund: null } : (li.variant ? einkaufsmenge(item, menge) : { menge: UNGEKLAERT, einheit: UNGEKLAERT, text: UNGEKLAERT, grund: "Variante in Shopify geloescht - Artikel von Hand klaeren" }),
        idGrund: ghId !== UNGEKLAERT ? null : !li.variant ? "Variante geloescht" : istM ? (mq?.quellvariante ? "Quellvariante ohne ID-Metafeld" : "Muster ohne _Quellvariante_ID - Produkt/Farbe siehe Titel") : "weder lieferant.* noch grosshandel.sku gesetzt",
      };
      if (offen && menge > 0) (istM ? muster : einkaufPositionen).push(pos);
      return pos;
    });

    const statusInfo = ableiten({ customAttributes: order.customAttributes, positionen });
    const beratung = attributWert(order, 'Beratung');
    const telefon = attributWert(order, 'Telefon');
    const verlegung = attributWert(order, 'Verlegung');
    const massAttr = attributWert(order, 'Maßprüfung');
    const massProbleme = positionen.filter(p => ['abweichung', 'unlesbar', 'waise'].includes(p.masspruefung?.status));
    const ohneId = positionen.filter(p => p.grosshaendlerId === UNGEKLAERT);
    const mengeOffen = positionen.filter(p => !p.istMuster && p.bestellmenge.menge === UNGEKLAERT);

    const hinweise = [];
    let ampel = 'gruen';
    const rot = t => { hinweise.push(t); ampel = 'rot'; };
    const gelb = t => { hinweise.push(t); if (ampel !== 'rot') ampel = 'gelb'; };
    if (massProbleme.length) rot(`Maßprüfung: ${massProbleme.map(p => p.masspruefung.status).join(', ')}`);
    if (beratung.toLowerCase() === 'ja' && !telefon) rot('Beratung gewünscht, aber keine Telefonnummer');
    else if (beratung.toLowerCase() === 'ja') gelb('Beratung gewünscht – vor Einkauf anrufen');
    if (ohneId.length) rot(`${ohneId.length} Position(en) ohne Großhändler-ID`);
    if (mengeOffen.length) gelb(`${mengeOffen.length} Einkaufsmenge(n) UNGEKLAERT`);
    if (jaNein(verlegung) === 'Ja') gelb('Verlegung gebucht');
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(String(order.displayFinancialStatus))) gelb(`Zahlung: ${order.displayFinancialStatus ?? '–'}`);
    if (!offen) { ampel = 'grau'; hinweise.unshift(order.cancelledAt ? 'Storniert' : 'Erledigt'); }

    auftraege.push({
      id: order.id,
      name: order.name,
      datum: order.createdAt,
      offen,
      storniert: !!order.cancelledAt,
      bezahlt: order.displayFinancialStatus ?? '–',
      erfuellt: order.displayFulfillmentStatus ?? '–',
      adminUrl: adminLink(order.id),
      status: statusInfo.status,
      ampel,
      hinweise,
      checks: {
        beratung: jaNein(beratung),
        telefon: telefon ? 'vorhanden' : 'fehlt',
        masspruefung: massProbleme.length ? 'Problem' : (massAttr ? jaNein(massAttr) : 'ok'),
        verlegung: jaNein(verlegung),
      },
      positionen,
    });
  }

  const gruppen = gruppieren(einkaufPositionen.map(p => ({ ...p, route: p.route === UNGEKLAERT ? UNGEKLAERT : p.route })))
    .map(g => ({ ...g, text: kopierText(g) }))
    .sort((a, b) => (a.lieferant === UNGEKLAERT) - (b.lieferant === UNGEKLAERT) || a.lieferant.localeCompare(b.lieferant));
  const musterGruppen = gruppieren(muster.map(p => ({ ...p, route: 'MUSTER' })))
    .map(g => ({ ...g, text: kopierText(g) }));

  const alle = auftraege.flatMap(a => a.positionen);
  return {
    erstellt: jetzt.toISOString(),
    auftraege,
    gruppen,
    musterGruppen,
    zahlen: {
      auftraege: auftraege.length,
      offeneAuftraege: auftraege.filter(a => a.offen).length,
      positionen: alle.length,
      ohneId: alle.filter(p => p.grosshaendlerId === UNGEKLAERT).length,
      mengeUngeklaert: alle.filter(p => !p.istMuster && p.bestellmenge.menge === UNGEKLAERT).length,
      zuBestellen: einkaufPositionen.length,
      muster: muster.length,
    },
  };
}

/** Klartext-Bestellliste je Lieferantengruppe (zum Kopieren in Mail/Portal). */
export function kopierText(gruppe) {
  const kopf = `Bestellung Lieferant ${gruppe.lieferant}` + (gruppe.route && gruppe.route !== UNGEKLAERT && gruppe.route !== 'MUSTER' ? ` (${gruppe.route})` : '');
  const zeilen = gruppe.positionen.map((p, i) => {
    const menge = p.bestellmenge.menge === UNGEKLAERT ? `UNGEKLAERT (Kunde: ${p.kundenmenge})` : p.bestellmenge.text;
    return `${i + 1}. ${p.grosshaendlerId} | ${p.titel} | ${p.farbe} | ${menge} | Kd.-Best. ${p.orderName}`;
  });
  return [kopf, ...zeilen].join('\n');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function datumDe(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
}

const AMPEL_TEXT = { gruen: 'Bereit', gelb: 'Prüfen', rot: 'Blockiert', grau: 'Geschlossen' };

function idZelle(p) {
  if (p.grosshaendlerId === UNGEKLAERT) return `<span class="flag">UNGEKLAERT</span>${p.idGrund ? `<small>${esc(p.idGrund)}</small>` : ""}`;
  return `<code>${esc(p.grosshaendlerId)}</code>`;
}

function mengeZelle(p) {
  if (p.bestellmenge.menge === UNGEKLAERT) return `<span class="flag">UNGEKLAERT</span><small>${esc(p.bestellmenge.grund)}</small>`;
  return `${esc(p.bestellmenge.text)}${p.bestellmenge.grund ? `<small>${esc(p.bestellmenge.grund)}</small>` : ''}`;
}

function gruppeHtml(g, i, praefix) {
  const zeilen = g.positionen.map(p => `
        <tr>
          <td data-l="Großhändler-ID">${idZelle(p)}</td>
          <td data-l="Artikel">${esc(p.titel)}<small>${esc(p.sku)}</small></td>
          <td data-l="Farbe/Variante">${esc(p.farbe)}</td>
          <td data-l="Kunde">${esc(p.kundenmenge)}</td>
          <td data-l="Bestellen">${mengeZelle(p)}</td>
          <td data-l="Auftrag"><a href="${esc(adminLink(p.orderId))}" target="_blank" rel="noopener">${esc(p.orderName)}</a></td>
        </tr>`).join('');
  const titel = g.lieferant === UNGEKLAERT ? 'Lieferant UNGEKLAERT' : `Lieferant ${esc(g.lieferant)}`;
  const route = g.route && g.route !== UNGEKLAERT && g.route !== 'MUSTER' ? ` <span class="tag">${esc(g.route)}</span>` : '';
  const id = `${praefix}-${i}`;
  return `
    <section class="karte${g.lieferant === UNGEKLAERT ? ' warn' : ''}">
      <header class="kopf">
        <h3>${titel}${route} <span class="anz">${g.positionen.length} Pos.</span></h3>
        <button type="button" class="kopieren" data-ziel="${id}">Liste kopieren</button>
      </header>
      <table><thead><tr><th>Großhändler-ID</th><th>Artikel</th><th>Farbe/Variante</th><th>Kunde</th><th>Bestellen</th><th>Auftrag</th></tr></thead>
      <tbody>${zeilen}</tbody></table>
      <textarea id="${id}" class="versteckt" readonly>${esc(g.text)}</textarea>
    </section>`;
}

function auftragHtml(a) {
  const pos = a.positionen.map(p => `
        <li class="${p.istMuster ? 'muster' : ''}">
          <div class="pz">${p.istMuster ? '<span class="tag m">Muster</span> ' : ''}<strong>${esc(p.titel)}</strong> · ${esc(p.farbe)}</div>
          <div class="pm">${esc(p.kundenmenge)} · ID ${idZelle(p)}${p.lieferant !== UNGEKLAERT ? ` · Lieferant ${esc(p.lieferant)}` : ''}</div>
        </li>`).join('');
  const c = a.checks;
  const chip = (label, wert, schlecht) => `<span class="chip${schlecht ? ' schlecht' : ''}">${label}: <b>${esc(wert)}</b></span>`;
  return `
    <article class="auftrag a-${a.ampel}">
      <header>
        <span class="ampel" title="${AMPEL_TEXT[a.ampel]}"></span>
        <h3><a href="${esc(a.adminUrl)}" target="_blank" rel="noopener">${esc(a.name)}</a></h3>
        <span class="datum">${datumDe(a.datum)}</span>
        <span class="tag">${AMPEL_TEXT[a.ampel]}</span>
      </header>
      <div class="chips">
        ${chip('Bezahlt', a.bezahlt, a.bezahlt !== 'PAID')}
        ${chip('Versand', a.erfuellt, false)}
        ${chip('Beratung', c.beratung, false)}
        ${chip('Telefon', c.telefon, c.beratung === 'Ja' && c.telefon === 'fehlt')}
        ${chip('Maßprüfung', c.masspruefung, c.masspruefung === 'Problem')}
        ${chip('Verlegung', c.verlegung, false)}
        ${chip('Status', a.status, false)}
      </div>
      ${a.hinweise.length ? `<p class="hinweise">${a.hinweise.map(esc).join(' · ')}</p>` : ''}
      <ul class="pos">${pos}</ul>
    </article>`;
}

/** Eigenstaendige HTML-Seite ohne externe Ressourcen. */
export function renderHtml(m) {
  const z = m.zahlen;
  const offen = m.auftraege.filter(a => a.offen);
  const zu = m.auftraege.filter(a => !a.offen);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bestellübersicht</title>
<style>
:root{--bg:#f6f5f2;--fl:#fff;--tx:#1d1d1b;--mu:#6b6a66;--li:#e3e1dc;--ak:#2f5d50;--gr:#2e8b57;--ge:#d9a400;--ro:#c0392b;--gra:#9a9894;--warn:#fff4e5}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fl:#22221f;--tx:#ecebe7;--mu:#a3a19b;--li:#3a3934;--ak:#7fc2ad;--warn:#3a2f1c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:.2rem 0}
h2{font-size:1.15rem;margin:1.8rem 0 .6rem;border-bottom:2px solid var(--ak);padding-bottom:.3rem}
h3{font-size:1rem;margin:0}
.meta{color:var(--mu);font-size:.85rem}
.zahlen{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}
.zahl{background:var(--fl);border:1px solid var(--li);border-radius:8px;padding:8px 10px}
.zahl b{display:block;font-size:1.3rem}.zahl span{color:var(--mu);font-size:.8rem}
.karte,.auftrag{background:var(--fl);border:1px solid var(--li);border-radius:10px;padding:12px;margin:0 0 12px}
.karte.warn{background:var(--warn)}
.kopf{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.anz{color:var(--mu);font-weight:400;font-size:.85rem}
button.kopieren{background:var(--ak);color:#fff;border:0;border-radius:6px;padding:8px 14px;font:inherit;cursor:pointer;min-height:40px}
button.kopieren.ok{background:var(--gr)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 8px;border-top:1px solid var(--li);vertical-align:top}
th{font-size:.78rem;color:var(--mu);font-weight:600;border-top:0}
small{display:block;color:var(--mu);font-size:.78rem}
code{font:600 .9rem ui-monospace,Menlo,monospace;word-break:break-all}
.flag{color:var(--ro);font-weight:700;font-size:.85rem}
.tag{display:inline-block;font-size:.72rem;border:1px solid var(--li);border-radius:99px;padding:1px 8px;color:var(--mu);font-weight:500}
.tag.m{border-color:var(--ak);color:var(--ak)}
.versteckt{position:absolute;left:-9999px;width:1px;height:1px}
.auftrag header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.auftrag h3 a{color:var(--tx)}
.datum{color:var(--mu);font-size:.85rem}
.ampel{width:14px;height:14px;border-radius:50%;background:var(--gra);flex:none}
.a-gruen .ampel{background:var(--gr)}.a-gelb .ampel{background:var(--ge)}.a-rot .ampel{background:var(--ro)}
.a-rot{border-left:5px solid var(--ro)}.a-gelb{border-left:5px solid var(--ge)}.a-gruen{border-left:5px solid var(--gr)}.a-grau{opacity:.7}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.chip{font-size:.78rem;background:var(--bg);border-radius:6px;padding:2px 8px}
.chip.schlecht{background:var(--ro);color:#fff}
.hinweise{margin:4px 0;font-size:.85rem;color:var(--ro)}
ul.pos{list-style:none;margin:6px 0 0;padding:0}
ul.pos li{padding:6px 0;border-top:1px solid var(--li)}
ul.pos li.muster{opacity:.85}
.pm{font-size:.85rem;color:var(--mu)}
details summary{cursor:pointer;color:var(--mu);margin:8px 0}
a{color:var(--ak)}
@media (max-width:720px){
  thead{display:none}
  table,tbody,tr,td{display:block;width:100%}
  tr{border-top:1px solid var(--li);padding:6px 0}
  td{border:0;padding:2px 0;display:grid;grid-template-columns:110px 1fr;gap:8px}
  td::before{content:attr(data-l);color:var(--mu);font-size:.75rem}
  td>small{grid-column:2}
  button.kopieren{width:100%}
}
</style>
</head>
<body>
<main>
  <h1>Bestellübersicht</h1>
  <p class="meta">Stand ${esc(new Date(m.erstellt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))} · intern, nicht weitergeben · Einkauf wird nie automatisch gesendet</p>
  <div class="zahlen">
    <div class="zahl"><b>${z.offeneAuftraege}</b><span>offene Aufträge (von ${z.auftraege})</span></div>
    <div class="zahl"><b>${z.zuBestellen}</b><span>Positionen zu bestellen</span></div>
    <div class="zahl"><b>${z.muster}</b><span>Muster offen</span></div>
    <div class="zahl"><b>${z.ohneId}</b><span>ohne Großhändler-ID</span></div>
    <div class="zahl"><b>${z.mengeUngeklaert}</b><span>Menge UNGEKLAERT</span></div>
  </div>

  <h2>Zu bestellen je Lieferant</h2>
  ${m.gruppen.length ? m.gruppen.map((g, i) => gruppeHtml(g, i, 'ware')).join('') : '<p class="meta">Keine offenen Warenpositionen.</p>'}

  <h2>Muster</h2>
  ${m.musterGruppen.length ? m.musterGruppen.map((g, i) => gruppeHtml(g, i, 'muster')).join('') : '<p class="meta">Keine offenen Muster.</p>'}

  <h2>Aufträge</h2>
  ${offen.map(auftragHtml).join('') || '<p class="meta">Keine offenen Aufträge.</p>'}
  ${zu.length ? `<details><summary>${zu.length} geschlossene/stornierte Aufträge</summary>${zu.map(auftragHtml).join('')}</details>` : ''}
</main>
<script>
document.addEventListener('click', async function (e) {
  var b = e.target.closest('button.kopieren'); if (!b) return;
  var t = document.getElementById(b.dataset.ziel); var ok = false;
  try { await navigator.clipboard.writeText(t.value); ok = true; } catch (_) {
    try { t.select(); ok = document.execCommand('copy'); } catch (__) {}
  }
  var alt = b.textContent; b.textContent = ok ? 'Kopiert' : 'Kopieren fehlgeschlagen'; b.classList.toggle('ok', ok);
  setTimeout(function () { b.textContent = alt; b.classList.remove('ok'); }, 1800);
});
</script>
</body>
</html>
`;
}
