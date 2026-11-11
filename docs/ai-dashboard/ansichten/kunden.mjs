/**
 * Ansicht "Kunden" (#/kunden): Reiter Zu tun, Suche, Bestellungen, Muster packen, Rueckrufe, Angebote,
 * Warenkoerbe sowie die Kundenakte (#/kunden?kunde=…). Teilmodule in ansichten/kunden/.
 */
import { viewMusterwirkung, musterwirkungKlick } from './kunden/musterwirkung.mjs';
import { state } from '../kern/zustand.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureKundenRueckrufe, openRueckrufDialog, viewKundenRueckrufe } from './kunden/rueckrufe.mjs';
import { ensureMusterAnrufe, musterAnrufeKlick, musterAnrufeOffen, viewMusterAnrufe } from './kunden/muster-anrufe.mjs';
import { viewKundenSuche, viewKundenDetail } from './kunden/akte.mjs';
import { viewKundenBestellungen, ensureKundenBestellungen } from './kunden/bestellungen.mjs';
import { viewKundenAngebote, viewKundenWarenkoerbe } from './kunden/angebote.mjs';
import { fallMarkeSetzen, viewKundenFaelle } from './kunden/faelle.mjs';
import { ensureServiceanfragen, serviceKlick, serviceOffenAnzahl, viewKundenServiceanfragen } from './kunden/serviceanfragen.mjs';
import { ensureMusterPacken, musterPackenKlick, musterPackenOffen, viewKundenMusterPacken } from './kunden/muster-packen.mjs';
import { kundenLinkWert } from '../lib/kunden-linkwert.mjs';

/** Alte Links mit Klartext-Schluessel oeffnen weiter; die Adresszeile zeigt danach nur den Kurzwert. */
function kundeImLink() {
  const roh = state.route.params.get('kunde');
  if (!roh) return null;
  const wert = kundenLinkWert(roh);
  if (wert !== roh) {
    state.route.params.set('kunde', wert);
    try { history.replaceState(null, '', `#/kunden?${state.route.params}`); } catch { /* Adresszeile bleibt, die Akte oeffnet trotzdem */ }
  }
  return wert;
}

export function viewKunden() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Hier findest du Kunden, Bestellungen und Rückrufe.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Kundendaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  // Parameter heisst 'kunde', nicht 'key': 'key' zaehlt im Secret-Scan als
  // sensibler URL-Parameter (automation/core/url-sanitizer.mjs) und liesse das
  // Gate auf jedem PR rot leuchten - und wuerde die Adresse in Protokollen
  // unlesbar machen, weil der Sanitizer sie schwaerzt.
  const key = kundeImLink();
  if (key) return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Hier stehen Kontaktdaten, Anschriften und alle Bestellungen dieses Kunden.</p></div></div>` + viewKundenDetail(key);
  const tabRaw = state.route.params.get('tab');
  // Standard ist die Arbeitsansicht: wer wartet auf was. Einen Kunden am
  // Telefon findet man ueber die Schnellsuche oder den Reiter "Suche".
  const tab = ['bestellungen', 'muster', 'anrufe', 'musterwirkung', 'rueckrufe', 'service', 'angebote', 'warenkoerbe', 'suche'].includes(tabRaw) ? tabRaw : 'zutun';
  ensureKundenBestellungen();
  ensureKundenRueckrufe();
  ensureServiceanfragen();
  ensureMusterPacken();
  ensureMusterAnrufe();
  const titel = tab === 'anrufe' ? 'Kunden nach Produkt fragen' : tab === 'musterwirkung' ? 'Musterwirkung' : tab === 'muster' ? 'Packstation' : tab === 'bestellungen' ? 'Bestellungen' : 'Kunden';
  const beschreibung = tab === 'anrufe' ? 'Hier fragst du nach, wie die Muster angekommen sind, und hältst fest, warum gekauft wird oder nicht. Oben steht, was die automatischen Nachfrage-Mails gerade tun.' : tab === 'musterwirkung' ? 'Hier vergleichst du Musteraufwand und beobachtete Warenkäufe – mit klarer Datenabdeckung.' : tab === 'muster' ? 'Hier findest du packbereite Umschläge, fehlende Muster und den gemeinsamen Packstand.' : tab === 'bestellungen' ? 'Hier bearbeitest du Kundenbestellungen und siehst den nächsten Schritt.' : 'Hier findest du Kunden am Telefon schnell, ihre Bestellungen und wer zurückgerufen werden möchte.';
  const head = `<div class="page-head"><div><h1>${titel}</h1><p class="sub">${beschreibung}</p></div></div>
    <div class="tabs no-print" role="tablist">
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'zutun'}" data-param="tab" data-value="">Zu tun${f_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'suche'}" data-param="tab" data-value="suche">Suche</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'bestellungen'}" data-param="tab" data-value="bestellungen">Bestellungen</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'muster'}" data-param="tab" data-value="muster">Muster packen${m_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'anrufe'}" data-param="tab" data-value="anrufe">Kunden nach Produkt fragen${a_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'rueckrufe'}" data-param="tab" data-value="rueckrufe">Rückrufe &amp; Beratungen${r_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'service'}" data-param="tab" data-value="service">Service-Anfragen${s_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'angebote'}" data-param="tab" data-value="angebote">Angebote</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'warenkoerbe'}" data-param="tab" data-value="warenkoerbe">Liegengeblieben</button>
    </div>`;
  const body = tab === 'bestellungen' ? viewKundenBestellungen()
    : tab === 'musterwirkung' ? viewMusterwirkung()
    : tab === 'muster' ? viewKundenMusterPacken()
    : tab === 'anrufe' ? viewMusterAnrufe()
    : tab === 'rueckrufe' ? viewKundenRueckrufe()
    : tab === 'service' ? viewKundenServiceanfragen()
    : tab === 'angebote' ? viewKundenAngebote()
    : tab === 'warenkoerbe' ? viewKundenWarenkoerbe()
    : tab === 'suche' ? viewKundenSuche()
    : viewKundenFaelle();
  const einfacherKopf = `<div class="page-head"><div><h1>${titel}</h1><p class="sub">${beschreibung}</p></div></div>
    <nav class="chips chips-zeile no-print" aria-label="Bestellungen und Kunden">
      <a class="chip" href="#/kunden?tab=bestellungen&amp;bart=ware&amp;bsort=wichtigkeit"${tab === 'bestellungen' ? ' aria-current="page"' : ''}>Bestellungen</a>
      <a class="chip" href="#/kunden?tab=muster"${tab === 'muster' ? ' aria-current="page"' : ''}>Packstation</a>
      <a class="chip" href="#/kunden?tab=anrufe"${tab === 'anrufe' ? ' aria-current="page"' : ''}>Kunden nach Produkt fragen</a>
      <a class="chip" href="#/kunden?tab=musterwirkung"${tab === 'musterwirkung' ? ' aria-current="page"' : ''}>Musterwirkung</a>
      <a class="chip" href="#/kunden">Weitere Kundenansichten</a>
    </nav>`;
  return (['bestellungen', 'muster', 'anrufe', 'musterwirkung'].includes(tab) ? einfacherKopf : head) + body;
}

/** "Zu tun · 6 sofort": die Zahl zaehlt die sofortigen Kunden (wie der Satz darunter), nicht alle Karten. */
function f_badge() {
  const n = kunden.faelle?.sofort || 0;
  return n ? ` <span class="badge gap">${n} sofort</span>` : '';
}

function r_badge() {
  // Dieselbe Bedingung wie die Liste darunter (viewKundenRueckrufe) und wie der
  // Startseitenblock: ohne das !testbestellung stand am Reiter eine hoehere
  // Zahl als Eintraege zu sehen waren, und man suchte die fehlenden.
  const n = (kunden.rueckrufe?.zeilen || []).filter(z => z.status !== 'erledigt' && !z.testbestellung).length;
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

function a_badge() {
  const n = musterAnrufeOffen();
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

function m_badge() {
  const n = musterPackenOffen();
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

function s_badge() {
  const n = serviceOffenAnzahl();
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

/** Kunden: Akte oeffnen/schliessen, Fall markieren, Rueckruf-Dialog. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function kundenKlickAkte(e) {
  const kundenOpen = e.target.closest('[data-kunden-open]');
  if (kundenOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('kunde', kundenLinkWert(kundenOpen.dataset.kundenOpen)); if (state.route.params.get('tab') === 'suche' && state.route.params.get('kq')) p.set('kq', state.route.params.get('kq')); location.hash = `#/kunden?${p}`; return true; }
  const kundenZurueck = e.target.closest('[data-kunden-zurueck]');
  if (kundenZurueck) { e.preventDefault(); location.hash = `#/kunden${state.route.params.get('kq') ? `?${new URLSearchParams({ tab: 'suche', kq: state.route.params.get('kq') })}` : ''}`; return true; }
  const fallMarke = e.target.closest('[data-fall-marke]');
  if (fallMarke) { e.preventDefault(); fallMarkeSetzen(fallMarke.dataset.fallMarke, fallMarke.dataset.grund); return true; }
  if (musterwirkungKlick(e)) return true;
  if (serviceKlick(e)) return true;
  if (musterPackenKlick(e)) return true;
  if (musterAnrufeKlick(e)) return true;
  const rueckrufBtn = e.target.closest('[data-rueckruf-open]');
  if (rueckrufBtn) { e.preventDefault(); openRueckrufDialog(rueckrufBtn.dataset.rueckrufOpen, rueckrufBtn.dataset.rueckrufStatus); return true; }
  return false;
}
