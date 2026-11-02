/**
 * Lexikon, Produktseite: Bestand im Musterlager sehen, direkt korrigieren und nachtragen, ohne in den
 * Einkauf zu wechseln (Wunsch Mitarbeiter 02.11.). Geschrieben wird ueber denselben Endpunkt wie im
 * Musterlager, gerechnet mit derselben Rechnung (lib/musterlager-bestand.mjs).
 *
 * Eingaben stehen im Modul: Der Bereich wird bei jedem Datenabgleich neu gezeichnet, sonst waere
 * mitten im Tippen der Wert weg.
 */
import { state } from '../kern/zustand.mjs';
import { esc, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { lagerEintraegeFuerFarben } from '../lib/lexikon-musterlager.mjs';
import { lagerKorrektur, lagerNochDa, ZAEHLBAR_STANDARD } from '../lib/musterlager-bestand.mjs';
import { nachladen as lagerNachladen, schreibe as schreibeLager } from './einkauf/musterlager.mjs';

const ARTEN_WAHL = { einzel: 'Einzelmuster', probestueck: 'Probestück 2 × 1 m', bahn: 'Bahn 4 m × 20 cm' };
const formularLeer = () => ({ farbe: '', art: 'einzel', anzahl: '1', ort: '' });

const lager = { key: null, produktHandle: null, farben: null, eintraege: [], zaehlbar: ZAEHLBAR_STANDARD, arten: {}, fehler: '', laeuft: false, nr: 0, entwurf: {}, formular: formularLeer() };

function lade(handle, { still = false } = {}) {
  const nr = ++lager.nr;
  if (!still) { lager.key = handle; lager.farben = null; lager.eintraege = []; lager.entwurf = {}; lager.formular = formularLeer(); }
  lager.fehler = '';
  return Promise.all([
    fetchEinkauf(`/api/einkauf/musterlager-farben?${new URLSearchParams({ handle })}`),
    fetchEinkauf('/api/einkauf/musterlager'),
  ]).then(([f, l]) => {
    if (nr !== lager.nr) return; // inzwischen ein anderes Produkt oder neuerer Stand
    if (!f?.verfuegbar) lager.fehler = f?.hinweis || 'Farben konnten nicht geladen werden.';
    else if (l?.verfuegbar === false) lager.fehler = l.hinweis || 'Musterlager konnte nicht gelesen werden.';
    lager.farben = f?.farben || [];
    lager.produktHandle = f?.handle || handle; // geoeffnet kann auch das Musterprodukt sein
    lager.eintraege = l?.eintraege || [];
    lager.zaehlbar = l?.zaehlbar || ZAEHLBAR_STANDARD;
    lager.arten = l?.arten || {};
  }).catch(e => {
    if (nr === lager.nr) { lager.farben = lager.farben || []; lager.fehler = `Musterlager nicht erreichbar (${e.message}).`; }
  }).finally(() => {
    if (!still && nr === lager.nr && state.route.view === 'lexikon') render();
  });
}

/**
 * Nach jedem Routenwechsel: Wer dieses Produkt verlassen hat, sieht beim Wiederkommen den frischen
 * Stand (im Einkauf kann sich etwas geaendert haben). Der Merker wird hier und nicht beim Zeichnen
 * geloescht - lade() zeichnet selbst neu, beim Zeichnen gaebe das eine Endlosschleife.
 */
export function musterlagerRouteGeaendert() {
  if (lager.key && (state.route.view !== 'lexikon' || state.route.params.get('handle') !== lager.key)) lager.key = null;
}

function zeileHtml(e) {
  const da = lagerNochDa(e, lager.zaehlbar);
  const reserviert = e.stand?.reserviert || 0;
  const leerText = e.leer ? 'leer' : lager.zaehlbar.includes(e.art) && da <= 0 ? 'aufgebraucht' : '';
  const angaben = `<span>${esc(e.artLabel || ARTEN_WAHL[e.art] || e.art)}</span>${reserviert ? `<span>${esc(reserviert)} reserviert</span>` : ''}${leerText ? `<span class="ml-warn">${esc(leerText)}</span>` : ''}`;
  const name = `<div class="ml-farbe">${esc(e.farbe || e.titel)}</div>`;
  if (istNurLesend()) {
    return `<li class="ml-zeile"><div class="ml-was">${name}<div class="ml-angaben">${angaben}<span>Noch da: ${esc(da)}</span>${e.ort ? `<span>Platz: ${esc(e.ort)}</span>` : '<span class="muted">kein Platz eingetragen</span>'}</div></div></li>`;
  }
  const entwurf = lager.entwurf[e.id] || {};
  // Leer: Feld bleibt frei, erst eine eingetragene Menge hebt das "leer" auf.
  const wertDa = entwurf.nochDa ?? (e.leer ? '' : da);
  const wertOrt = entwurf.ort ?? (e.ort || '');
  const maxDa = lager.zaehlbar.includes(e.art) ? Math.max(0, 999 - (e.stand?.verbraucht ?? 0)) : 999;
  const aus = lager.laeuft ? ' disabled' : '';
  return `<li class="ml-zeile lex-lager-zeile${leerText ? ' ml-knapp' : ''}"><form data-lex-lager-zeile="${esc(e.id)}">
      <div class="ml-was">${name}<div class="ml-angaben">${angaben}</div></div>
      <div class="field lex-lager-da"><label for="lexDa-${esc(e.id)}">Noch da</label><input id="lexDa-${esc(e.id)}" name="nochDa" type="number" inputmode="numeric" min="0" max="${esc(maxDa)}" step="1" value="${esc(wertDa)}" data-lex-lager-feld="nochDa" data-focus-erhalten></div>
      <div class="field lex-lager-ort"><label for="lexOrt-${esc(e.id)}">Lagerplatz</label><input id="lexOrt-${esc(e.id)}" name="ort" maxlength="80" autocomplete="off" list="lexLagerOrte" placeholder="nicht eingetragen" value="${esc(wertOrt)}" data-lex-lager-feld="ort" data-focus-erhalten></div>
      <div class="ml-aktionen">
        <button type="submit" class="btn btn-sm"${aus}>Speichern</button>
        ${leerText ? '' : `<button type="submit" name="leer" value="1" formnovalidate class="btn btn-sm btn-ghost" title="Nichts mehr da – neue Musterbestellungen gehen wieder an den Lieferanten"${aus}>Ist leer</button>`}
      </div>
    </form></li>`;
}

function formularHtml(handle) {
  const f = lager.formular;
  const artLabel = k => lager.arten[k] || ARTEN_WAHL[k];
  return `<form data-lex-lager="${esc(handle)}" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:12px">
      <div class="field"><label for="lexLagerFarbe">Farbe</label><select id="lexLagerFarbe" name="farbe" required data-lex-lager-neu="farbe" data-focus-erhalten>${lager.farben.map(x => `<option value="${esc(x.farbe)}"${x.farbe === f.farbe ? ' selected' : ''}>${esc(x.farbe)}</option>`).join('')}</select></div>
      <div class="field"><label for="lexLagerArt">Art</label><select id="lexLagerArt" name="art" required data-lex-lager-neu="art" data-focus-erhalten>${Object.keys(ARTEN_WAHL).map(k => `<option value="${esc(k)}"${k === f.art ? ' selected' : ''}>${esc(artLabel(k))}</option>`).join('')}</select></div>
      <div class="field"><label for="lexLagerAnzahl">Anzahl</label><input id="lexLagerAnzahl" name="anzahl" type="number" inputmode="numeric" min="1" max="999" step="1" value="${esc(f.anzahl)}" required style="width:80px" data-lex-lager-neu="anzahl" data-focus-erhalten></div>
      <div class="field"><label for="lexLagerOrt">Lagerplatz</label><input id="lexLagerOrt" name="ort" maxlength="80" autocomplete="off" list="lexLagerOrte" placeholder="z. B. Büro" value="${esc(f.ort)}" data-lex-lager-neu="ort" data-focus-erhalten></div>
      <button type="submit" class="btn btn-primary"${lager.laeuft ? ' disabled' : ''}>Ins Lager eintragen</button>
    </form>`;
}

export function musterlagerBlock(handle) {
  if (lager.key !== handle) lade(handle);
  const kopf = '<div class="card-head"><h2>Im Musterlager</h2></div>';
  if (!lager.farben) return `<section class="card" style="margin-bottom:16px">${kopf}<p role="status">Lade Bestand …</p></section>`;
  if (lager.fehler) return `<section class="card" style="margin-bottom:16px">${kopf}<div class="notice crit">${esc(lager.fehler)}</div></section>`;
  const zeilen = lagerEintraegeFuerFarben(lager.eintraege, lager.farben, lager.produktHandle);
  if (!lager.farben.length && !zeilen.length) return '';
  const orte = [...new Set(lager.eintraege.map(e => e.ort).filter(Boolean))].sort();
  const liste = zeilen.length
    ? `<ul class="ml-liste">${zeilen.map(zeileHtml).join('')}</ul>`
    : '<p class="small muted">Von diesem Produkt liegt nichts im Musterlager.</p>';
  const nurLesen = istNurLesend();
  const vorschlaege = !nurLesen && orte.length ? `<datalist id="lexLagerOrte">${orte.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>` : '';
  return `<section class="card" style="margin-bottom:16px">${kopf}${liste}${vorschlaege}${nurLesen || !lager.farben.length ? '' : formularHtml(handle)}</section>`;
}

/** Eingaben im Modul halten, damit ein Neuzeichnen sie nicht verwirft. Gibt true zurueck, wenn sie hierher gehoeren. */
export function musterlagerEingabe(e) {
  const t = e.target;
  if (t?.matches?.('[data-lex-lager-feld]')) {
    const id = t.closest('form')?.dataset.lexLagerZeile;
    if (id) (lager.entwurf[id] ||= {})[t.dataset.lexLagerFeld] = t.value;
    return true;
  }
  if (t?.matches?.('[data-lex-lager-neu]')) { lager.formular[t.dataset.lexLagerNeu] = t.value; return true; }
  return false;
}

/** Eine Schreibaktion: nach Erfolg Bereich und alles, was die Herkunft der Muster zeigt, frisch laden. */
async function schreibeUndLade(handle, body, { meldung, fehlerText, danach = () => {} }) {
  lager.laeuft = true;
  const r = await schreibeLager(body);
  if (!r.ok) {
    toast(`${fehlerText}: ${r.text}`, 'crit');
  } else {
    // Inzwischen ein anderes Produkt geoeffnet: dessen Laden nicht ueberholen.
    if (lager.key === handle) await lade(handle, { still: true });
    danach();
    toast(meldung(r));
    lagerNachladen();
  }
  lager.laeuft = false;
  if (state.route.view === 'lexikon') render();
}

/** Absenden der Formulare. Gibt true zurueck, wenn das Ereignis hierher gehoert. */
export function musterlagerAbsenden(e) {
  const zeile = e.target.closest?.('form[data-lex-lager-zeile]');
  const neu = e.target.closest?.('form[data-lex-lager]');
  if (!zeile && !neu) return false;
  e.preventDefault();
  if (lager.laeuft) return true;
  if (zeile) { zeileSpeichern(zeile, e.submitter); return true; }
  const handle = neu.dataset.lexLager;
  const fd = new FormData(neu);
  const farbe = fd.get('farbe');
  const anzahl = fd.get('anzahl');
  const art = fd.get('art');
  schreibeUndLade(handle, { aktion: 'einlagern', art, handle, farben: [farbe], anzahl, ort: String(fd.get('ort') || '').trim() }, {
    fehlerText: 'Nicht eingetragen',
    meldung: () => `${anzahl}× ${farbe} ins Lager eingetragen (${lager.arten[art] || ARTEN_WAHL[art]}).`,
    danach: () => { lager.formular = { ...formularLeer(), farbe }; },
  });
  return true;
}

function zeileSpeichern(form, knopf) {
  const id = form.dataset.lexLagerZeile;
  const eintrag = lager.eintraege.find(x => x.id === id);
  if (!eintrag) return;
  const name = eintrag.farbe || eintrag.titel;
  const fd = new FormData(form);
  // "Ist leer" setzt nur das Kennzeichen, wie im Einkauf: was im Feld steht, zaehlt dann nicht.
  const body = knopf?.name === 'leer'
    ? { aktion: 'aendern', id, leer: true }
    : lagerKorrektur(eintrag, { nochDa: fd.get('nochDa'), ort: fd.get('ort') }, lager.zaehlbar);
  if (!body) { toast('Nichts geändert.'); return; }
  if (body.fehler) { toast(body.fehler, 'crit'); return; }
  schreibeUndLade(lager.key, body, {
    fehlerText: 'Nicht gespeichert',
    meldung: () => (body.leer ? `${name}: leer – neue Musterbestellungen gehen wieder an den Lieferanten` : `${name}: gespeichert`),
    danach: () => { delete lager.entwurf[id]; },
  });
}
