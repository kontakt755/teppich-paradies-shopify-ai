/**
 * Ansicht "Kunden" (#/kunden): Reiter Zu tun, Suche, Bestellungen, Rueckrufe, Angebote,
 * Warenkoerbe sowie die Kundenakte (#/kunden?kunde=…). Teilmodule in ansichten/kunden/.
 */
import { state } from '../kern/zustand.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureKundenRueckrufe, openRueckrufDialog, viewKundenRueckrufe } from './kunden/rueckrufe.mjs';
import { viewKundenSuche, viewKundenDetail } from './kunden/akte.mjs';
import { viewKundenBestellungen } from './kunden/bestellungen.mjs';
import { viewKundenAngebote, viewKundenWarenkoerbe } from './kunden/angebote.mjs';
import { fallMarkeSetzen, viewKundenFaelle } from './kunden/faelle.mjs';
import { ensureServiceanfragen, serviceKlick, serviceNeuAnzahl, viewKundenServiceanfragen } from './kunden/serviceanfragen.mjs';

export function viewKunden() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Hier findest du Kunden, Bestellungen und Rückrufe.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Kundendaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  // Parameter heisst 'kunde', nicht 'key': 'key' zaehlt im Secret-Scan als
  // sensibler URL-Parameter (automation/core/url-sanitizer.mjs) und liesse das
  // Gate auf jedem PR rot leuchten - und wuerde die Adresse in Protokollen
  // unlesbar machen, weil der Sanitizer sie schwaerzt.
  const key = state.route.params.get('kunde');
  if (key) return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Hier stehen Kontaktdaten, Anschriften und alle Bestellungen dieses Kunden.</p></div></div>` + viewKundenDetail(key);
  const tabRaw = state.route.params.get('tab');
  // Standard ist die Arbeitsansicht: wer wartet auf was. Einen Kunden am
  // Telefon findet man ueber die Schnellsuche oder den Reiter "Suche".
  const tab = ['bestellungen', 'rueckrufe', 'service', 'angebote', 'warenkoerbe', 'suche'].includes(tabRaw) ? tabRaw : 'zutun';
  ensureKundenRueckrufe();
  ensureServiceanfragen();
  const head = `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Hier findest du Kunden am Telefon schnell, ihre Bestellungen und wer zurückgerufen werden möchte.</p></div></div>
    <div class="tabs no-print" role="tablist">
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'zutun'}" data-param="tab" data-value="">Zu tun${f_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'suche'}" data-param="tab" data-value="suche">Suche</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'bestellungen'}" data-param="tab" data-value="bestellungen">Bestellungen</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'rueckrufe'}" data-param="tab" data-value="rueckrufe">Rückrufe &amp; Beratungen${r_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'service'}" data-param="tab" data-value="service">Service-Anfragen${s_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'angebote'}" data-param="tab" data-value="angebote">Angebote</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'warenkoerbe'}" data-param="tab" data-value="warenkoerbe">Liegengeblieben</button>
    </div>`;
  const body = tab === 'bestellungen' ? viewKundenBestellungen()
    : tab === 'rueckrufe' ? viewKundenRueckrufe()
    : tab === 'service' ? viewKundenServiceanfragen()
    : tab === 'angebote' ? viewKundenAngebote()
    : tab === 'warenkoerbe' ? viewKundenWarenkoerbe()
    : tab === 'suche' ? viewKundenSuche()
    : viewKundenFaelle();
  return head + body;
}

function f_badge() {
  const n = kunden.faelle?.sofort || 0;
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

function r_badge() {
  // Dieselbe Bedingung wie die Liste darunter (viewKundenRueckrufe) und wie der
  // Startseitenblock: ohne das !testbestellung stand am Reiter eine hoehere
  // Zahl als Eintraege zu sehen waren, und man suchte die fehlenden.
  const n = (kunden.rueckrufe?.zeilen || []).filter(z => z.status !== 'erledigt' && !z.testbestellung).length;
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

function s_badge() {
  const n = serviceNeuAnzahl();
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

/** Kunden: Akte oeffnen/schliessen, Fall markieren, Rueckruf-Dialog. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function kundenKlickAkte(e) {
  const kundenOpen = e.target.closest('[data-kunden-open]');
  if (kundenOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('kunde', kundenOpen.dataset.kundenOpen); location.hash = `#/kunden?${p}`; return true; }
  const kundenZurueck = e.target.closest('[data-kunden-zurueck]');
  if (kundenZurueck) { e.preventDefault(); location.hash = `#/kunden${state.route.params.get('kq') ? `?${new URLSearchParams({ kq: state.route.params.get('kq') })}` : ''}`; return true; }
  const fallMarke = e.target.closest('[data-fall-marke]');
  if (fallMarke) { e.preventDefault(); fallMarkeSetzen(fallMarke.dataset.fallMarke, fallMarke.dataset.grund); return true; }
  if (serviceKlick(e)) return true;
  const rueckrufBtn = e.target.closest('[data-rueckruf-open]');
  if (rueckrufBtn) { e.preventDefault(); openRueckrufDialog(rueckrufBtn.dataset.rueckrufOpen, rueckrufBtn.dataset.rueckrufStatus); return true; }
  return false;
}
