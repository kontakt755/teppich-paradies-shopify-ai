/**
 * Produktampel PROCUREMENT_READY (02-DATA-MODEL.md Abschnitt 7).
 * Wird berechnet, nie gespeichert. Fehlende Werte heissen UNGEKLAERT.
 */

import { UNGEKLAERT, EINHEIT } from './umrechnung.mjs';
import { ROUTE } from './route.mjs';

export const GRUPPE = Object.freeze({
  ROLLE: 'rolle',
  PAKET: 'paket',
  STUECK: 'stueck',
  MUSTER: 'muster',
  DIENSTLEISTUNG: 'dienstleistung',
});

function gesetzt(wert) {
  return wert !== undefined && wert !== null && wert !== '' && wert !== UNGEKLAERT;
}

/**
 * Produktgruppe aus dem Kontext ableiten. Explizite Angabe gewinnt; sonst aus
 * Route, Muster-Kennzeichen und Produkt-Metafeldern. Unklar -> UNGEKLAERT.
 */
export function produktgruppe(ctx = {}) {
  if (ctx.gruppe && Object.values(GRUPPE).includes(ctx.gruppe)) return ctx.gruppe;
  const e = ctx.einkauf || {};
  const p = ctx.produkt || {};
  if (e.route === ROUTE.NO_PROCUREMENT) return GRUPPE.DIENSTLEISTUNG;
  if (ctx.istMuster || gesetzt(e.muster_quelle) || (typeof ctx.sku === 'string' && ctx.sku.startsWith('M-'))) return GRUPPE.MUSTER;
  if (gesetzt(p.qm_pro_paket)) return GRUPPE.PAKET;
  if (gesetzt(p.rollenbreite)) return GRUPPE.ROLLE;
  if (gesetzt(p.stangenlaenge) || e.bestelleinheit === EINHEIT.STUECK) return GRUPPE.STUECK;
  return UNGEKLAERT;
}

/**
 * @param {object} ctx  Ergebnis von resolveLineItem oder {einkauf, produkt, gruppe}
 * @returns {{ready:boolean, gruppe:string, fehlend:string[]}}
 */
export function procurementReady(ctx = {}) {
  const gruppe = produktgruppe(ctx);
  const e = ctx.einkauf || {};
  const p = ctx.produkt || {};
  const fehlend = [];
  const pflicht = (bedingung, grund) => { if (!bedingung) fehlend.push(grund); };

  switch (gruppe) {
    case GRUPPE.ROLLE:
      pflicht(gesetzt(e.lieferant), 'Lieferant fehlt (einkauf.lieferant)');
      pflicht(gesetzt(e.artikelnummer), 'Artikelnummer fehlt (einkauf.artikelnummer)');
      pflicht(gesetzt(e.farbnummer), 'Farbnummer fehlt (einkauf.farbnummer)');
      pflicht(gesetzt(p.rollenbreite), 'Rollenbreite fehlt (custom.rollenbreite)');
      pflicht(e.bestelleinheit === EINHEIT.LFM, `Bestelleinheit muss lfm sein (ist ${e.bestelleinheit ?? UNGEKLAERT})`);
      pflicht(gesetzt(e.route), 'Route fehlt (einkauf.route)');
      break;
    case GRUPPE.PAKET:
      pflicht(gesetzt(e.lieferant), 'Lieferant fehlt (einkauf.lieferant)');
      pflicht(gesetzt(e.artikelnummer), 'Artikelnummer fehlt (einkauf.artikelnummer)');
      pflicht(gesetzt(e.farbnummer), 'Farbnummer fehlt (einkauf.farbnummer)');
      pflicht(gesetzt(p.qm_pro_paket), 'Paketinhalt fehlt (custom.qm_pro_paket)');
      pflicht(e.bestelleinheit === EINHEIT.PAKET, `Bestelleinheit muss paket sein (ist ${e.bestelleinheit ?? UNGEKLAERT})`);
      pflicht(gesetzt(e.route), 'Route fehlt (einkauf.route)');
      break;
    case GRUPPE.STUECK:
      pflicht(gesetzt(e.lieferant), 'Lieferant fehlt (einkauf.lieferant)');
      pflicht(gesetzt(e.artikelnummer), 'Artikelnummer fehlt (einkauf.artikelnummer)');
      pflicht(gesetzt(p.stangenlaenge) || e.bestelleinheit === EINHEIT.STUECK,
        'Stangenlaenge (custom.stangenlaenge) oder Bestelleinheit stueck fehlt');
      pflicht(gesetzt(e.route), 'Route fehlt (einkauf.route)');
      break;
    case GRUPPE.MUSTER:
      pflicht(gesetzt(e.quellvariante), 'Musterzuordnung fehlt (einkauf.quellvariante)');
      pflicht(gesetzt(e.muster_quelle), 'Musterquelle fehlt (einkauf.muster_quelle)');
      break;
    case GRUPPE.DIENSTLEISTUNG:
      pflicht(e.route === ROUTE.NO_PROCUREMENT, 'Route muss NO_PROCUREMENT sein');
      break;
    default:
      fehlend.push('Produktgruppe UNGEKLAERT (weder qm_pro_paket, rollenbreite, stangenlaenge noch Muster/Route erkennbar)');
  }

  return { ready: fehlend.length === 0, gruppe, fehlend };
}
