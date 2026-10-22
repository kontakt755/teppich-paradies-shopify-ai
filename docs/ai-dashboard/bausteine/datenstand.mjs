/**
 * "Immer aktuell": Zeile "Stand: vor 3 Min." ueber jeder Seite mit Betriebsdaten, deutlicher
 * Hinweis fuer alle, wenn eine Quelle zu alt ist, und das selbsttaetige Nachladen, solange die
 * Seite offen ist.
 *
 * Die Zeile steht in #datenstandLeiste (index.html) AUSSERHALB von #main. So kann sie jede
 * halbe Minute neu geschrieben werden, ohne dass ein Formular, eine Auswahl oder ein
 * aufgeklapptes Detail darunter verloren geht.
 *
 * Nachladen: alle 30 Sekunden und beim Zurueckkehren in den Tab fragt die Seite
 * /api/aktualisierung/status. Neue Export- oder lokale Arbeitsstaende werden je Arbeitsgruppe
 * vollstaendig gelesen und gemeinsam uebernommen - aber nur, wenn gerade niemand tippt, einen
 * Dialog offen hat oder ungespeicherte Eingaben in der Seite stehen. Sonst wartet es bis zum
 * naechsten Takt. Grenzen je Quelle: lib/datenstand.mjs.
 */
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { verwirfDatenspeicher } from './aktualisierung.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';
import { belege } from '../ansichten/einkauf/belege.mjs';
import { shopifyAbgleich } from '../ansichten/einkauf/shopify-abgleich.mjs';
import { heuteDaten } from '../ansichten/heute/daten.mjs';
import { erzeugeArbeitsabgleich } from '../lib/arbeitsdaten.mjs';
import { veralteteQuellen, hinweisSatz, quelleFuerSeite, vorText, DATENSTAND_LABEL } from '../lib/datenstand.mjs';

const ZEILE_MS = 30_000;
let arbeitsFehler = null;

function istInhaber() { const r = state.session?.benutzer?.rolle; return !r || r === 'inhaber'; }


/** Arbeitet gerade jemand in der Seite? Dann nicht neu zeichnen. */
export function beschaeftigt(doc = document) {
  const aktiv = doc.activeElement;
  if (aktiv && aktiv !== doc.body && aktiv.matches?.('input, textarea, select, [contenteditable="true"]')) return true;
  if (doc.querySelector('#dialogRoot > *, #paletteRoot > *, dialog[open]')) return true;
  // Getippt und weggeklickt: der Wert steht noch nicht im Server.
  return [...doc.querySelectorAll('#main textarea, #main input:not([type=search]):not([type=checkbox]):not([type=radio]):not([type=hidden])')]
    .some(el => el.value !== el.defaultValue);
}

/** Die Zeile oben: ruhig "Stand: vor 3 Min."; bei veralteten Quellen ein deutlicher Satz fuer alle. */
export function zeichneDatenstand() {
  const ziel = $('#datenstandLeiste');
  if (!ziel) return;
  const a = einkauf.aktualisierung;
  const jetzt = new Date();
  // Kennzahlen sieht nur der Inhaber - fuer alle anderen waere der Hinweis darauf Rauschen.
  const veraltet = veralteteQuellen(a, jetzt).filter(q => istInhaber() || q.teil !== 'kennzahlen');
  const teil = quelleFuerSeite(state.route.view);
  const stand = teil && a?.teile?.[teil]?.erfolg ? a.teile[teil].zeitpunkt : null;
  if (arbeitsFehler || veraltet.length) {
    ziel.className = 'datenstand-leiste warn';
    ziel.setAttribute('role', 'alert');
    ziel.innerHTML = `<strong>Nicht aktuell:</strong> ${esc(arbeitsFehler || hinweisSatz(veraltet, { inhaber: istInhaber() }))}`;
    ziel.hidden = false;
    return;
  }
  ziel.removeAttribute('role');
  ziel.className = 'datenstand-leiste';
  ziel.hidden = !stand;
  ziel.innerHTML = stand
    ? `<span title="${esc(`${DATENSTAND_LABEL[teil]} zuletzt aus Shopify geholt: ${fmtDateTime(stand)}. Die Seite lädt neue Daten von selbst.`)}">Stand: ${esc(vorText(stand, jetzt))}</span>`
    : '';
}

/** Bereits geladene Arbeitsquellen auffrischen; keine zweite Ablage und keine Schreibaktion. */
function arbeitsQuellen() {
  const quelle = (speicher, feld, pfad, laedt, versucht = null, bezug = null) => ({
    pfad, gruppe: ['auftragsstatus', 'bestellungen', 'musterPacken'].includes(feld) ? 'bestellarbeit' : pfad,
    lesen: () => speicher[feld], laedt: () => Boolean(speicher[laedt]), bezug, versucht,
    setzen: d => { speicher[feld] = d; },
  });
  const liste = [
    quelle(einkauf, 'auftragsstatus', '/api/einkauf/auftragsstatus', 'loadingAuftragsstatus'),
    quelle(einkauf, 'bestellungen', '/api/einkauf/bestellungen', 'loadingBestellungen'),
    quelle(einkauf, 'lieferanten', '/api/einkauf/lieferanten', 'loadingLieferanten'),
    quelle(kunden, 'bestellungen', '/api/kunden/bestellungen', 'loadingBestellungen'),
    quelle(kunden, 'musterPacken', '/api/kunden/muster-packen', 'loadingMusterPacken'),
    quelle(kunden, 'faelle', '/api/kunden/faelle', 'loadingFaelle'),
    quelle(kunden, 'rueckrufe', '/api/kunden/rueckrufe', 'loadingRueckrufe'),
    quelle(belege, 'daten', '/api/einkauf/belege', 'laedt', () => { belege.geladenAm = Date.now(); }),
    quelle(shopifyAbgleich, 'daten', '/api/einkauf/shopify-abgleich', 'laedt', () => { shopifyAbgleich.am = Date.now(); }),
    quelle(heuteDaten, 'lieferanten', '/api/einkauf/lieferanten', 'laedtLieferanten', () => { heuteDaten.lieferantenAm = Date.now(); }),
  ];
  const key = kunden.detailKey;
  if (key) liste.push(quelle(kunden, 'detail', `/api/kunden/detail?${new URLSearchParams({ key })}`,
    'loadingDetail', null, () => kunden.detailKey));
  return liste;
}

const pruefe = erzeugeArbeitsabgleich({
  holen: fetchEinkauf, quellen: arbeitsQuellen,
  darfAktualisieren: () => state.capabilities.mode === 'local' && !document.hidden && !beschaeftigt(),
  kontext: () => `${state.route.view}?${state.route.params}|${state.session?.benutzer?.id || state.session?.benutzer?.rolle || ''}`,
  statusUebernehmen: d => { einkauf.aktualisierung = d; einkauf.aktualisierungLaeuft = !!d.laeuft; },
  vorUebernahme: ({ exportGeaendert }) => { if (exportGeaendert) verwirfDatenspeicher(); },
  nachUebernahme: ({ erneuert, exportGeaendert }) => { if (erneuert || exportGeaendert) render(); },
  fehlerMelden: text => { arbeitsFehler = text; zeichneDatenstand(); },
});

/** Einmal beim Start (app.js): derselbe Takt prueft Arbeitsstand und schreibt die Datumszeile. */
export function starteDatenstand() {
  const tick = async () => { await pruefe(); zeichneDatenstand(); };
  void tick();
  setInterval(() => void tick(), ZEILE_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
}
