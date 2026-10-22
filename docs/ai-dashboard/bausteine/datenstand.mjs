/**
 * "Immer aktuell": Zeile "Stand: vor 3 Min." ueber jeder Seite mit Betriebsdaten, deutlicher
 * Hinweis fuer alle, wenn eine Quelle zu alt ist, und das selbsttaetige Nachladen, solange die
 * Seite offen ist.
 *
 * Die Zeile steht in #datenstandLeiste (index.html) AUSSERHALB von #main. So kann sie jede
 * halbe Minute neu geschrieben werden, ohne dass ein Formular, eine Auswahl oder ein
 * aufgeklapptes Detail darunter verloren geht.
 *
 * Nachladen: alle CONFIG.refreshMs (2 Minuten) und beim Zurueckkehren in den Tab fragt die Seite
 * /api/aktualisierung/status. Hat der Sync-Dienst seither neue Daten geschrieben, werden die
 * Zwischenspeicher verworfen und neu gezeichnet - aber nur, wenn gerade niemand tippt, einen
 * Dialog offen hat oder ungespeicherte Eingaben in der Seite stehen. Sonst wartet es bis zum
 * naechsten Takt. Grenzen je Quelle: lib/datenstand.mjs.
 */
import { CONFIG } from '../kern/konfig.mjs';
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { verwirfDatenspeicher } from './aktualisierung.mjs';
import { veralteteQuellen, hinweisSatz, quelleFuerSeite, vorText, DATENSTAND_LABEL } from '../lib/datenstand.mjs';

const ZEILE_MS = 30_000;
let kennung = null;       // Fingerabdruck der Zeitpunkte beim letzten Laden der Daten
let wartet = false;       // neue Daten da, aber jemand arbeitet gerade - beim naechsten Takt

function istInhaber() { const r = state.session?.benutzer?.rolle; return !r || r === 'inhaber'; }

function fingerabdruck(a) {
  if (!a?.verfuegbar) return '';
  return Object.entries(a.teile || {}).map(([t, s]) => `${t}:${s?.zeitpunkt || ''}`).sort().join('|');
}

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
  if (veraltet.length) {
    ziel.className = 'datenstand-leiste warn';
    ziel.setAttribute('role', 'alert');
    ziel.innerHTML = `<strong>Nicht aktuell:</strong> ${esc(hinweisSatz(veraltet, { inhaber: istInhaber() }))}`;
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

async function pruefe() {
  if (state.capabilities.mode !== 'local' || document.hidden) return;
  const d = await fetchEinkauf('/api/aktualisierung/status');
  if (!d || d.fehler) return;
  const vorher = kennung;
  einkauf.aktualisierung = d;
  einkauf.aktualisierungLaeuft = !!d.laeuft;
  const neu = fingerabdruck(d);
  if (vorher === null) kennung = neu;
  else if (neu !== vorher || wartet) {
    if (beschaeftigt()) wartet = true;
    else {
      kennung = neu; wartet = false;
      verwirfDatenspeicher();
      render();
    }
  }
  zeichneDatenstand();
}

/** Einmal beim Start (app.js). */
export function starteDatenstand() {
  void pruefe();
  setInterval(() => void pruefe(), CONFIG.refreshMs);
  setInterval(zeichneDatenstand, ZEILE_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void pruefe(); });
}
