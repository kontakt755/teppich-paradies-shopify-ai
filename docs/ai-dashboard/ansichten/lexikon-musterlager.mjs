/**
 * Lexikon, Produktseite: Bestand im Musterlager sehen und nachtragen, ohne in den Einkauf zu
 * wechseln (Wunsch Mitarbeiter 02.11.). Geschrieben wird ueber denselben Endpunkt wie im Musterlager.
 */
import { state } from '../kern/zustand.mjs';
import { esc, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { lagerEintraegeFuerFarben, lagerMenge } from '../lib/lexikon-musterlager.mjs';

const lager = { key: null, farben: null, eintraege: [], fehler: '', laeuft: false };

function lade(handle) {
  lager.key = handle; lager.farben = null; lager.eintraege = []; lager.fehler = '';
  Promise.all([
    fetchEinkauf(`/api/einkauf/musterlager-farben?${new URLSearchParams({ handle })}`),
    fetchEinkauf('/api/einkauf/musterlager'),
  ]).then(([f, l]) => {
    if (lager.key !== handle) return; // inzwischen ein anderes Produkt geoeffnet
    if (!f?.verfuegbar) lager.fehler = f?.hinweis || 'Farben konnten nicht geladen werden.';
    else if (l?.verfuegbar === false) lager.fehler = l.hinweis || 'Musterlager konnte nicht gelesen werden.';
    lager.farben = f?.farben || [];
    lager.eintraege = l?.eintraege || [];
  }).catch(e => {
    if (lager.key === handle) { lager.farben = []; lager.fehler = `Musterlager nicht erreichbar (${e.message}).`; }
  }).finally(() => {
    if (lager.key === handle && state.route.view === 'lexikon') render();
  });
}

export function musterlagerBlock(handle) {
  if (lager.key !== handle) lade(handle);
  const kopf = '<div class="card-head"><h2>Im Musterlager</h2></div>';
  if (!lager.farben) return `<section class="card" style="margin-bottom:16px">${kopf}<p role="status">Lade Bestand …</p></section>`;
  if (lager.fehler) return `<section class="card" style="margin-bottom:16px">${kopf}<div class="notice crit">${esc(lager.fehler)}</div></section>`;
  if (!lager.farben.length) return '';
  const zeilen = lagerEintraegeFuerFarben(lager.eintraege, lager.farben);
  const liste = zeilen.length
    ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Farbe</th><th>Da</th><th>Lagerplatz</th></tr></thead>
      <tbody>${zeilen.map(e => `<tr><td>${esc(e.farbe || e.titel)}</td><td>${esc(lagerMenge(e))}</td><td>${e.ort ? esc(e.ort) : '<span class="muted">nicht eingetragen</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="small muted">Von diesem Produkt liegt nichts im Musterlager.</p>';
  const formular = istNurLesend() ? '' : `<form data-lex-lager="${esc(handle)}" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:12px">
      <div class="field"><label for="lexLagerFarbe">Farbe</label><select id="lexLagerFarbe" name="farbe" required>${lager.farben.map(f => `<option value="${esc(f.farbe)}">${esc(f.farbe)}</option>`).join('')}</select></div>
      <div class="field"><label for="lexLagerAnzahl">Anzahl</label><input id="lexLagerAnzahl" name="anzahl" type="number" min="1" max="999" value="1" required style="width:80px"></div>
      <div class="field"><label for="lexLagerOrt">Lagerplatz</label><input id="lexLagerOrt" name="ort" maxlength="80" autocomplete="off" placeholder="z. B. Büro"></div>
      <button type="submit" class="btn btn-primary"${lager.laeuft ? ' disabled' : ''}>Ins Lager eintragen</button>
    </form>`;
  return `<section class="card" style="margin-bottom:16px">${kopf}${liste}${formular}</section>`;
}

/** Absenden des Formulars. Gibt true zurueck, wenn das Ereignis hierher gehoert. */
export function musterlagerAbsenden(e) {
  const form = e.target.closest?.('form[data-lex-lager]');
  if (!form) return false;
  e.preventDefault();
  if (lager.laeuft) return true;
  const handle = form.dataset.lexLager;
  const fd = new FormData(form);
  const farbe = fd.get('farbe');
  const anzahl = fd.get('anzahl');
  lager.laeuft = true;
  fetch('/api/einkauf/musterlager', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aktion: 'einlagern', art: 'einzel', handle, farben: [farbe], anzahl, ort: String(fd.get('ort') || '').trim() }) })
    .then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
      toast(`${anzahl}× ${farbe} ins Lager eingetragen.`);
      lade(handle);
    })
    .catch(err => toast(`Nicht eingetragen: ${err.message}`))
    .finally(() => { lager.laeuft = false; if (state.route.view === 'lexikon') render(); });
  return true;
}
