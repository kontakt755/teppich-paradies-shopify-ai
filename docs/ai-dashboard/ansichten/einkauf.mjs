/**
 * Ansicht "Einkauf" (#/einkauf): Reiter Je Auftrag (Standard), Je Lieferant, Belege, Musterlager, Produktdaten, Versandkosten.
 * Teilmodule in ansichten/einkauf/. Die fruehere "Anleitung" (tab=hilfe) steht seit 06.11.2026 in der Hilfe (#/hilfe,
 * #1996) - sie beschrieb Reiter, Filter und eine gruene Ampel, die es nicht mehr gab. Alte Links landen auf "Je Auftrag".
 */
import { state } from '../kern/zustand.mjs';
import { esc } from '../kern/helfer.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { ensureAktualisierung, aktualisierenButton } from '../bausteine/aktualisierung.mjs';
import { viewEinkaufBestellungen } from './einkauf/bestellungen.mjs';
import { viewEinkaufAblauf } from './einkauf/ablauf.mjs';
import { viewEinkaufProduktdaten } from './einkauf/produktdaten.mjs';
import { viewEinkaufLieferant } from './einkauf/lieferanten.mjs';
import { viewVersandkosten } from './einkauf/versandkosten.mjs';
import { viewEinkaufMusterlager } from './einkauf/musterlager.mjs';
import { viewEinkaufBelege, belegArbeit, ensureBelege } from './einkauf/belege.mjs';

export function viewEinkauf() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Bestellen</h1><p class="sub">Hier bestellst du beim Lieferanten und verfolgst, bis die Ware da ist.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  // Detailseite eines Lieferanten als Parameter (#/einkauf?lieferant=A) - bleibt damit im
  // Einkauf (Navigation, Rollen, Datenstand) und braucht keine eigene Route.
  if (state.route.params.get('lieferant')) { ensureAktualisierung(); return viewEinkaufLieferant(state.route.params.get('lieferant')); }
  // Standard ist "Je Auftrag" (Kunde bestellt -> wir bestellen beim Lieferanten). Alte Adressen
  // mit ?af= oder ?auftrag= zeigen weiter die Lieferanten-Ansicht, die dort gemeint war.
  const p = state.route.params;
  const roh = p.get('tab') === 'bestellungen' ? 'lieferant' : p.get('tab');
  const tab = ['ablauf', 'lieferant', 'belege', 'musterlager', 'produktdaten', 'versandkosten'].includes(roh) ? roh
    : (p.get('af') || p.get('auftrag') || p.get('lf')) ? 'lieferant' : 'ablauf';
  const tabs = [['ablauf', 'Je Auftrag'], ['lieferant', 'Je Lieferant'], ['belege', 'Lieferantenpost'], ['musterlager', 'Musterlager'], ['produktdaten', 'Produktdaten'], ['versandkosten', 'Versandkosten']];
  if(tab !== 'versandkosten') ensureAktualisierung();
  // Die Zahl am Reiter "Belege" zeigt, ob dort etwas zu pruefen ist - auch von den anderen Reitern aus.
  if(tab !== 'versandkosten') ensureBelege();
  const zuPruefen = belegArbeit()?.summe || 0;
  const head = `<div class="page-head"><div><h1>Bestellen</h1><p class="sub">${tab === 'versandkosten' ? 'Interne Versandkosten mit euren privaten Vertragskonditionen vergleichen.' : 'Hier bestellst du beim Lieferanten – je Auftrag der nächste Schritt: bestellen, Ware annehmen, Kunde informieren.'}</p></div>
      <div class="head-actions">${tab === 'versandkosten' ? '' : aktualisierenButton()}</div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="tab" role="tab" aria-selected="${tab === k}" data-param="tab" data-value="${k}">${esc(l)}${k === 'belege' && zuPruefen ? ` <span class="tab-zahl">${zuPruefen}</span>` : ''}</button>`).join('')}</div>`;
  const body = tab === 'versandkosten' ? viewVersandkosten() : tab === 'ablauf' ? viewEinkaufAblauf() : tab === 'lieferant' ? viewEinkaufBestellungen() : tab === 'belege' ? viewEinkaufBelege() : tab === 'musterlager' ? viewEinkaufMusterlager() : viewEinkaufProduktdaten();
  return head + body;
}
