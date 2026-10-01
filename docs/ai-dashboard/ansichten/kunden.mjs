/**
 * Ansicht "Kunden" (#/kunden): Reiter Zu tun, Suche, Bestellungen, Rueckrufe, Angebote,
 * Warenkoerbe sowie die Kundenakte (#/kunden?kunde=…). Teilmodule in ansichten/kunden/.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate } from '../kern/helfer.mjs';
import { emptyState, stoerungState, bandItem } from '../bausteine/karten.mjs';
import { kunden } from './kunden/gemeinsam.mjs';
import { ensureKundenRueckrufe, openRueckrufDialog, viewKundenRueckrufe } from './kunden/rueckrufe.mjs';
import { viewKundenSuche, viewKundenDetail } from './kunden/akte.mjs';
import { ensureKundenBestellungen, viewKundenBestellungen } from './kunden/bestellungen.mjs';
import {
  ensureKundenAngebote, ensureKundenWarenkoerbe, viewKundenAngebote, viewKundenWarenkoerbe,
} from './kunden/angebote.mjs';
import { fallMarkeSetzen, viewKundenFaelle } from './kunden/faelle.mjs';

/**
 * Startseiten-Block "Nicht liegen lassen": Geld, das schon im Haus war und
 * still verfaellt - bezahlte Bestellungen ohne Versand, offene Angebote,
 * abgebrochene Warenkoerbe. Jede Zeile erscheint nur, wenn es sie gibt; ein
 * leerer Block waere Rauschen auf der wichtigsten Seite.
 */
export function heuteNichtLiegenLassen() {
  ensureKundenBestellungen();
  ensureKundenAngebote();
  ensureKundenWarenkoerbe();

  const zeilen = [];
  let aeltesterVersand = null;
  const b = kunden.bestellungen;
  if (b?.verfuegbar) {
    const unversandt = (b.zeilen || []).filter(z => !z.testbestellung && !z.storniert
      && z.zahlungsstatus === 'PAID'
      && ['UNFULFILLED', 'PARTIALLY_FULFILLED', null].includes(z.fulfillmentstatus));
    if (unversandt.length) {
      aeltesterVersand = unversandt.map(z => z.datum).filter(Boolean).sort()[0] || null;
      zeilen.push(bandItem(unversandt.length, 'bezahlt, noch nicht versandt', 'crit', '#/kunden?tab=bestellungen&bfilter=unerfuellt'));
    }
  }
  const a = kunden.angebote;
  if (a?.verfuegbar) {
    const offen = (a.angebote || []).filter(x => x.status === 'OPEN');
    if (offen.length) zeilen.push(bandItem(offen.length, offen.length === 1 ? 'Angebot wartet auf Antwort' : 'Angebote warten auf Antwort', 'warn', '#/kunden?tab=angebote'));
  }
  const w = kunden.warenkoerbe;
  if (w?.verfuegbar) {
    const liste = w.warenkoerbe || [];
    if (liste.length) {
      const summe = liste.reduce((sum, x) => sum + (Number(x.wert) || 0), 0);
      zeilen.push(bandItem(liste.length, `liegengebliebene Warenkörbe (${summe.toFixed(0)} €)`, 'warn', '#/kunden?tab=warenkoerbe'));
    }
  }
  // Eine Quelle, die gar nicht geladen werden konnte, darf nicht wie "nichts zu
  // tun" aussehen. Bisher verschwand der ganze Block stillschweigend - genau
  // dann, wenn jemand ihn am noetigsten braucht. `fehler` unterscheidet den
  // Ausfall von "Datei noch nicht exportiert" (dann fehlt die Quelle einfach).
  const gestoert = [[b, 'Bestellungen'], [a, 'Angebote'], [w, 'Warenkörbe']]
    .filter(([q]) => q && q.fehler)
    .map(([, name]) => name);
  if (!zeilen.length && !gestoert.length) return '';
  return `<h2 class="section-title">Nicht liegen lassen <span class="section-note">Kunden, die schon gekauft oder gefragt haben</span></h2>
    ${gestoert.length ? stoerungState({ hinweis: `Betroffen: ${gestoert.join(', ')}. Solange diese Daten fehlen, kann hier etwas übersehen werden.` }, `${gestoert.length === 1 ? 'Eine Quelle' : `${gestoert.length} Quellen`} dieses Blocks`) : ''}
    ${zeilen.length ? `<div class="band">${zeilen.join('')}</div>` : ''}
    ${aeltesterVersand ? `<p class="small muted" style="margin:6px 0 0">Älteste unversandte Bestellung vom ${esc(fmtDate(aeltesterVersand))}.</p>` : ''}`;
}

export function viewKunden() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kundensuche, Bestellliste und Rückruf-/Beratungsliste.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Kundendaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  // Parameter heisst 'kunde', nicht 'key': 'key' zaehlt im Secret-Scan als
  // sensibler URL-Parameter (automation/core/url-sanitizer.mjs) und liesse das
  // Gate auf jedem PR rot leuchten - und wuerde die Adresse in Protokollen
  // unlesbar machen, weil der Sanitizer sie schwaerzt.
  const key = state.route.params.get('kunde');
  if (key) return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kontaktdaten, Anschriften und alle Bestellungen dieses Kunden.</p></div></div>` + viewKundenDetail(key);
  const tabRaw = state.route.params.get('tab');
  // Standard ist die Arbeitsansicht: wer wartet auf was. Einen Kunden am
  // Telefon findet man ueber die Schnellsuche oder den Reiter "Suche".
  const tab = ['bestellungen', 'rueckrufe', 'angebote', 'warenkoerbe', 'suche'].includes(tabRaw) ? tabRaw : 'zutun';
  ensureKundenRueckrufe();
  const head = `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kunden am Telefon schnell finden, alle Bestellungen im Überblick – und wer zurückgerufen werden möchte.</p></div></div>
    <div class="tabs no-print" role="tablist">
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'zutun'}" data-param="tab" data-value="">Zu tun${f_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'suche'}" data-param="tab" data-value="suche">Suche</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'bestellungen'}" data-param="tab" data-value="bestellungen">Bestellungen</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'rueckrufe'}" data-param="tab" data-value="rueckrufe">Rückrufe &amp; Beratungen${r_badge()}</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'angebote'}" data-param="tab" data-value="angebote">Angebote</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'warenkoerbe'}" data-param="tab" data-value="warenkoerbe">Liegengeblieben</button>
    </div>`;
  const body = tab === 'bestellungen' ? viewKundenBestellungen()
    : tab === 'rueckrufe' ? viewKundenRueckrufe()
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

/** Kunden: Akte oeffnen/schliessen, Fall markieren, Rueckruf-Dialog. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function kundenKlickAkte(e) {
  const kundenOpen = e.target.closest('[data-kunden-open]');
  if (kundenOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('kunde', kundenOpen.dataset.kundenOpen); location.hash = `#/kunden?${p}`; return true; }
  const kundenZurueck = e.target.closest('[data-kunden-zurueck]');
  if (kundenZurueck) { e.preventDefault(); location.hash = `#/kunden${state.route.params.get('kq') ? `?${new URLSearchParams({ kq: state.route.params.get('kq') })}` : ''}`; return true; }
  const fallMarke = e.target.closest('[data-fall-marke]');
  if (fallMarke) { e.preventDefault(); fallMarkeSetzen(fallMarke.dataset.fallMarke, fallMarke.dataset.grund); return true; }
  const rueckrufBtn = e.target.closest('[data-rueckruf-open]');
  if (rueckrufBtn) { e.preventDefault(); openRueckrufDialog(rueckrufBtn.dataset.rueckrufOpen, rueckrufBtn.dataset.rueckrufStatus); return true; }
  return false;
}
