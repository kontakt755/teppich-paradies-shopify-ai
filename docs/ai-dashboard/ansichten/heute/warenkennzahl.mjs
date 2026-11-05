/**
 * Warenkennzahl ganz oben auf der Shop-Übersicht, nur Inhaber (Prüfung 05.11., Inhaber 22.10.:
 * zahlende Warenkunden zuerst). Warenumsatz der letzten 7 Tage, Zahl der Warenkunden, Vergleich
 * mit den 7 Tagen davor. Muster stehen getrennt in einer eigenen Zeile.
 *
 * Die Zahlen rechnet operations/lib/kennzahlen.mjs (Feld `ware`, `muster`, `vorwoche`). Ein
 * Export von vor dieser Regel hat die Felder nicht: dann ein Hinweis statt einer falschen Zahl,
 * denn `umsatz` enthaelt Versand und waere hier falsch benannt.
 *
 * Reine Funktion ohne DOM. Keine Farbe fuer den Vergleich: eine schwache Woche ist kein Problem,
 * das heute jemand loesen muss (Skill control-center, Farbe).
 */
import { esc, plural } from '../../kern/helfer.mjs';

const euro = (wert, waehrung) => wert.toLocaleString('de-DE', { style: 'currency', currency: waehrung || 'EUR', maximumFractionDigits: 0 });

/** Veraenderung in Prozent; ohne Umsatz in der Vorwoche gibt es keinen sinnvollen Wert. */
export function veraenderungText(jetzt, vorher) {
  if (!(vorher > 0)) return '';
  const p = Math.round(((jetzt - vorher) / vorher) * 100);
  return ` (${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)} %)`;
}

function rahmen(inhalt) {
  return `<section class="waren-zahl" aria-label="Warenumsatz der letzten 7 Tage">${inhalt}</section>`;
}

/** @param {object|null} k  Antwort von /api/einkauf/kennzahlen; null = laedt noch */
export function warenkennzahlBlock(k) {
  if (!k) return rahmen('<p class="waren-zahl-hinweis" role="status">Warenumsatz lädt …</p>');
  if (!k.verfuegbar) return rahmen(`<p class="waren-zahl-hinweis" role="status">${esc(k.hinweis || 'Shop-Kennzahlen sind noch nicht exportiert.')}</p>`);
  const z7 = k.zeitraeume?.['7'];
  const z30 = k.zeitraeume?.['30'];
  if (typeof z7?.ware?.umsatz !== 'number') return rahmen('<p class="waren-zahl-hinweis" role="status">Warenumsatz erscheint mit dem nächsten Datenabruf.</p>');
  const w = z7.waehrung;
  const v = k.vorwoche?.ware;
  const vergleich = v ? `Vorwoche ${esc(euro(v.umsatz, w))}${esc(veraenderungText(z7.ware.umsatz, v.umsatz))} · ${esc(plural(v.kunden, 'Warenkunde', 'Warenkunden'))}` : '';
  const dreissig = typeof z30?.ware?.umsatz === 'number' ? `30 Tage ${esc(euro(z30.ware.umsatz, w))} · ` : '';
  return rahmen(`
    <div class="waren-zahl-kopf">
      <div><strong>${esc(euro(z7.ware.umsatz, w))}</strong><span>Warenumsatz, 7 Tage</span></div>
      <div><strong>${esc(String(z7.ware.kunden))}</strong><span>${z7.ware.kunden === 1 ? 'Warenkunde' : 'Warenkunden'}</span></div>
    </div>
    <p class="waren-zahl-erklaerung">Bezahlt, brutto, ohne Versand und Muster.</p>
    ${vergleich ? `<p class="waren-zahl-vergleich">${vergleich}</p>` : ''}
    <p class="waren-zahl-muster">${dreissig}Muster getrennt: ${esc(plural(z7.muster?.bestellungen ?? 0, 'Bestellung', 'Bestellungen'))} in 7 Tagen</p>`);
}
