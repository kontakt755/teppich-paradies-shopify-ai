/**
 * Einkauf, Reiter "Musterlager" (#/einkauf?tab=musterlager): welche Muster wir selbst da
 * haben, wo sie liegen und welche Musterbestellungen daraus bedient werden.
 *
 * Inhaber 2026-10-13: Bei PVC und Linoleum kommt vom Lieferanten ein Probestueck 2 x 1 m,
 * daraus schneiden wir viele Muster; kuenftig kommen Bahnen 4 m x 20 cm der gaengigsten
 * Teppichboden-Farben dazu. Was hier steht, bestellt niemand mehr beim Lieferanten: eine
 * passende Musterbestellung steht automatisch auf "aus dem Musterlager" (Server,
 * operations/lib/musterlager.mjs). Einzelmuster zaehlen beim Verschicken ab.
 *
 * Mustergroesse A5 (Inhaber 2026-10-15): bei Probestueck und Bahn steht "reicht noch fuer ca. N
 * Muster" (Server rechnet, operations/lib/musterlager.mjs). Gemischte Bestellungen gehen
 * zusammen raus - das Lagermuster steht dann als "zurueckgelegt" da.
 *
 * Darunter Vorschlaege aus den Bestellungen: eingetroffene Probestuecke ("Rest einlagern?")
 * und Farben, die mehrfach als Muster bestellt wurden. Nur lokal, Shopify bleibt unberuehrt.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { ladeStandNeu } from './auftragsfluss.mjs';

export const musterlager = { daten: null, laedt: false, geladenAm: 0 };

/** So lange gilt der geladene Stand; danach beim naechsten Zeichnen still neu holen (Verschicktes zaehlt ab). */
const FRISCH_MS = 30000;

const ARTEN_STANDARD = { einzel: 'Einzelmuster', probestueck: 'Probestück 2 × 1 m', bahn: 'Bahn 4 m × 20 cm' };
const ART_HINWEIS = {
  einzel: 'fertige Muster – jedes verschickte zählt ab',
  probestueck: 'z. B. PVC, Linoleum – wir schneiden A5-Muster zu',
  bahn: 'z. B. Teppichboden – wir schneiden A5-Muster zu',
};

export function ensureMusterlager({ neu = false } = {}) {
  if (musterlager.laedt || (musterlager.daten && !neu && Date.now() - musterlager.geladenAm < FRISCH_MS)) return;
  musterlager.laedt = true;
  fetchEinkauf('/api/einkauf/musterlager').then(d => { musterlager.daten = d; musterlager.geladenAm = Date.now(); }).finally(() => {
    musterlager.laedt = false;
    if (state.route.view === 'einkauf') render();
  });
}

const arten = () => musterlager.daten?.arten || ARTEN_STANDARD;
const zaehlbar = e => (musterlager.daten?.zaehlbar || ['einzel']).includes(e.art);

/** Physisch noch da (Einzelmuster): eingelagert minus verschickt. Reservierte liegen noch in der Schublade. */
function nochDa(e) {
  return Math.max(0, (e.anzahl ?? 0) - (e.stand?.verbraucht ?? 0));
}

/** Bestand in Worten - und ob er Aufmerksamkeit braucht (leer, aufgebraucht). */
function bestandVon(e) {
  if (e.leer) return { text: 'leer', warn: true };
  if (zaehlbar(e)) {
    const da = nochDa(e);
    const frei = e.stand?.rest ?? da;
    if (da <= 0) return { text: 'aufgebraucht', warn: true };
    const zurueck = da - frei;
    return { text: `noch ${da} Stück${zurueck > 0 ? ` (${zurueck} zurückgelegt)` : ''}`, warn: frei <= 0 };
  }
  const n = e.anzahl ?? 1;
  const stueck = e.art === 'bahn' ? `${n} ${n === 1 ? 'Bahn' : 'Bahnen'}` : `${n} Stück`;
  // Zuschnitt: A5-Muster je Stueck (Inhaber 2026-10-15), Schaetzung aus dem Verschickten.
  const reicht = e.stand?.reichtNoch;
  if (reicht === null || reicht === undefined) return { text: stueck, warn: false };
  if (reicht <= 0) return { text: `${stueck} · rechnerisch aufgebraucht – nachsehen`, warn: true };
  return { text: `${stueck} · reicht noch für ca. ${reicht} ${musterGroesse()}-Muster`, warn: reicht <= (musterlager.daten?.knappAb ?? 5) };
}

const musterGroesse = () => musterlager.daten?.musterGroesse?.name || 'A5';

const passt = (e, q) => !q || [e.titel, e.farbe, e.ort, e.notiz, e.artLabel].some(v => String(v || '').toLowerCase().includes(q));

function zeileHtml(e) {
  const b = bestandVon(e);
  const lesend = istNurLesend();
  const verschickt = e.stand?.verbraucht ? `${e.stand.verbraucht}× verschickt` : '';
  const offene = e.offeneBestellungen || [];
  const fuer = offene.filter(o => !o.wartetAufLieferant).map(o => `${o.orderName}${o.kunde ? ` ${o.kunde}` : ''}`);
  // Gemischte Bestellung: geht zusammen mit den Lieferanten-Mustern raus (Inhaber 2026-10-15).
  const wartet = offene.filter(o => o.wartetAufLieferant).map(o => `${o.orderName}${o.kunde ? ` ${o.kunde}` : ''}`);
  const nachkaufen = e.art === 'probestueck' && b.warn && musterlager.daten?.probestueckPreis ? `Neues Probestück beim Lieferanten: ${musterlager.daten.probestueckPreis}` : '';
  const knoepfe = lesend ? '' : `<div class="ml-aktionen">
      ${e.leer || (zaehlbar(e) && nochDa(e) <= 0)
        ? `<button type="button" class="btn btn-sm" data-ml-wieder="${esc(e.id)}">Wieder da…</button>`
        : `<button type="button" class="btn btn-sm btn-ghost" data-ml-leer="${esc(e.id)}" title="Nichts mehr da – neue Musterbestellungen gehen wieder an den Lieferanten">Ist leer</button>`}
      <button type="button" class="btn btn-sm btn-ghost" data-ml-bearbeiten="${esc(e.id)}">Bearbeiten…</button>
    </div>`;
  return `<li class="ml-zeile${b.warn ? ' ml-knapp' : ''}">
    <div class="ml-was">
      <div class="ml-farbe">${esc(e.farbe || e.titel)}</div>
      <div class="ml-angaben">
        <span>${esc(e.artLabel || arten()[e.art] || e.art)}</span>
        <span class="${b.warn ? 'ml-warn' : ''}">${esc(b.text)}</span>
        ${e.ort ? `<span>Platz: ${esc(e.ort)}</span>` : '<span class="muted">kein Platz eingetragen</span>'}
        ${verschickt ? `<span class="muted">${esc(verschickt)}</span>` : ''}
      </div>
      ${fuer.length ? `<div class="ml-fuer">Verschicken an: ${esc(fuer.join(', '))}</div>` : ''}
      ${wartet.length ? `<div class="small muted">Zurückgelegt, geht mit den Mustern vom Lieferanten zusammen raus: ${esc(wartet.join(', '))}</div>` : ''}
      ${nachkaufen ? `<div class="small muted">${esc(nachkaufen)}</div>` : ''}
      ${e.notiz ? `<div class="ml-notiz">${esc(e.notiz)}</div>` : ''}
    </div>
    ${knoepfe}
  </li>`;
}

function vorschlagHtml(v, i) {
  const grund = v.grund === 'eingetroffen'
    ? `Probestück kam am ${fmtDate(v.eingetroffen.am)} vom Lieferanten (${v.eingetroffen.orderName}) – den Rest einlagern?`
    : `${v.anzahl}× als Muster bestellt (${v.auftraege.join(', ')}) – einlagern spart die nächste Bestellung`;
  const farbe = v.farbe && !String(v.titel).includes(v.farbe) ? v.farbe : '';
  return `<li class="ml-zeile">
    <div class="ml-was">
      <div class="ml-farbe">${esc(v.titel)}${farbe ? ` <span class="ml-farbe-zusatz">· ${esc(farbe)}</span>` : ''}</div>
      <div class="ml-angaben"><span>${esc(grund)}</span></div>
    </div>
    ${istNurLesend() ? '' : `<div class="ml-aktionen"><button type="button" class="btn btn-sm" data-ml-vorschlag="${i}">Einlagern…</button></div>`}
  </li>`;
}

export function viewEinkaufMusterlager() {
  ensureMusterlager();
  const d = musterlager.daten;
  if (!d && musterlager.laedt) return `<div class="empty">Lade Musterlager …</div>`;
  if (d?.fehler) return stoerungState(d, 'Das Musterlager');
  if (!d || !d.verfuegbar) return emptyState('Musterlager nicht verfügbar.', d?.hinweis || '');
  const q = (state.route.params.get('mlq') || '').trim().toLowerCase();
  const eintraege = d.eintraege.filter(e => passt(e, q));
  const offen = d.eintraege.reduce((s, e) => s + (e.offeneBestellungen?.length || 0), 0);
  const leer = d.eintraege.filter(e => bestandVon(e).warn).length;

  const kopf = `<div class="ml-kopf">
    <p class="small muted ml-erklaerung">Muster, die wir selbst da haben. Kommt eine Musterbestellung für eines davon, steht sie automatisch auf „aus dem Musterlager“ – sie geht nicht in die Bestellung an den Lieferanten. Einzelmuster zählen beim Verschicken ab; von Probestück und Bahn schneiden wir A5-Muster zu. Gemischte Bestellungen gehen zusammen raus, sobald die Lieferanten-Muster da sind.</p>
    ${istNurLesend() ? '' : '<button type="button" class="btn btn-primary" data-ml-neu>Muster einlagern…</button>'}
  </div>`;
  // Eine Zeile mit den drei Zahlen, die vom Normalfall abweichen; 0 faellt weg.
  const zahlen = [
    plural(d.eintraege.length, 'Muster im Lager', 'Muster im Lager'),
    offen ? `<b>${esc(plural(offen, 'Musterbestellung wird', 'Musterbestellungen werden'))} daraus bedient</b>` : null,
    leer ? `<span class="ml-warn">${esc(plural(leer, 'ist leer', 'sind leer'))}</span>` : null,
  ].filter(Boolean);

  let liste;
  if (!d.eintraege.length) {
    liste = emptyState('Noch nichts im Musterlager.', 'Kommt ein Probestück 2 × 1 m oder eine Bahn vom Lieferanten, hier einlagern – „Muster einlagern…“ oder unten bei den Vorschlägen.');
  } else if (!eintraege.length) {
    liste = emptyState(`Nichts passt zu „${q}“.`, 'Suche leeren oder anders suchen.');
  } else {
    // Je Produkt eine Gruppe, darin die Farben.
    const je = new Map();
    for (const e of eintraege) { if (!je.has(e.titel)) je.set(e.titel, []); je.get(e.titel).push(e); }
    const namen = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
    liste = [...je].sort(([a], [b]) => namen.compare(a, b)).map(([titel, l]) => `<section class="ml-gruppe">
      <h3>${esc(titel)} <span class="small muted">${esc(plural(l.length, 'Farbe', 'Farben'))}</span></h3>
      <ul class="ml-liste">${[...l].sort((a, b) => namen.compare(a.farbe || '', b.farbe || '')).map(zeileHtml).join('')}</ul>
    </section>`).join('');
  }

  const vorschlaege = (d.vorschlaege || []).length ? `<section class="ml-vorschlaege">
      <h2 class="section-title">Einlagern?</h2>
      <p class="small muted">Aus den Bestellungen: eingetroffene Probestücke und Farben, die öfter als Muster bestellt wurden.</p>
      <ul class="ml-liste">${d.vorschlaege.map(vorschlagHtml).join('')}</ul>
    </section>` : '';

  return `${kopf}
    <div class="toolbar search-hero"><input type="search" autocomplete="off" placeholder="Produkt, Farbe oder Lagerplatz suchen" value="${esc(state.route.params.get('mlq') || '')}" data-param="mlq" aria-label="Musterlager durchsuchen"></div>
    ${d.eintraege.length ? `<p class="small muted ml-zahlen">${zahlen.join(' · ')}</p>` : ''}
    ${liste}
    ${vorschlaege}`;
}

// -- Schreiben ---------------------------------------------------------------

async function schreibe(body) {
  try {
    const r = await fetch('/api/einkauf/musterlager', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, text: j.error || `Fehler ${r.status}` };
    return { ok: true, ...j };
  } catch (e) { return { ok: false, text: `Keine Verbindung zum Dashboard (${e.message})` }; }
}

/** Nach jeder Aenderung: Lager und alles, was die Herkunft der Muster zeigt (Einkauf, Kunden, Heute). */
function nachladen() {
  ensureMusterlager({ neu: true });
  ladeStandNeu({ bestellungen: true });
}

function zeigeMeldung(form, text) {
  const ziel = form.querySelector('[data-ml-meldung]');
  ziel.className = 'notice crit';
  ziel.textContent = text;
  ziel.hidden = false;
}

function artFelder(gewaehlt) {
  return `<fieldset class="zl-wahl"><legend>Was liegt da?</legend>
    ${Object.entries(arten()).map(([k, l]) => `<label><input type="radio" name="art" value="${esc(k)}"${k === gewaehlt ? ' checked' : ''} required><span class="ml-art-text"><span>${esc(l)}</span><span class="small muted">${esc(ART_HINWEIS[k] || '')}</span></span></label>`).join('')}
  </fieldset>`;
}

function ortFeld(wert = '') {
  const orte = [...new Set((musterlager.daten?.eintraege || []).map(e => e.ort).filter(Boolean))].sort();
  return `<div class="field"><label for="mlOrt">Lagerplatz</label>
    <input id="mlOrt" name="ort" maxlength="80" autocomplete="off" placeholder="z. B. Regal B, Fach 3" value="${esc(wert)}"${orte.length ? ' list="mlOrte"' : ''}>
    ${orte.length ? `<datalist id="mlOrte">${orte.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>` : ''}
    <span class="hint">Damit es beim Verschicken jeder findet.</span></div>`;
}

/**
 * "Muster einlagern": Produkt im Lexikon suchen, Farben ankreuzen, Art, Anzahl, Platz.
 * Mit `vorgabe` (aus einem Vorschlag) stehen Produkt und Farbe schon fest.
 */
function oeffneEinlagern(vorgabe = null) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog ml-dialog" role="dialog" aria-modal="true" aria-labelledby="mlTitel" data-dialog novalidate>
    <h2 id="mlTitel">Muster einlagern</h2>
    ${vorgabe
      ? `<div class="ml-gewaehlt"><b>${esc(vorgabe.titel)}</b>${vorgabe.farbe && !vorgabe.titel.includes(vorgabe.farbe) ? ` · ${esc(vorgabe.farbe)}` : ''}</div>`
      : `<div class="field"><label for="mlSuche">Produkt</label>
          <input id="mlSuche" type="search" autocomplete="off" placeholder="Name, Farbe oder Artikelnummer" aria-describedby="mlSucheHinweis">
          <span class="hint" id="mlSucheHinweis">Mindestens 2 Zeichen.</span>
          <div class="ml-treffer" data-ml-treffer></div></div>
        <fieldset class="ml-farben" data-ml-farben hidden><legend data-ml-produkt></legend><div class="ml-farbliste" data-ml-farbliste></div></fieldset>`}
    ${artFelder(vorgabe?.art || 'einzel')}
    <div class="field"><label for="mlAnzahl">Anzahl</label><input id="mlAnzahl" name="anzahl" type="number" inputmode="numeric" min="1" max="999" value="1" style="width:7rem"><span class="hint">Stück bzw. Bahnen je Farbe.</span></div>
    ${ortFeld()}
    <div class="field"><label for="mlNotiz">Notiz (optional)</label><input id="mlNotiz" name="notiz" maxlength="300" autocomplete="off"></div>
    <p data-ml-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary"${vorgabe ? '' : ' disabled'}>Einlagern</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const knopf = form.querySelector('[type=submit]');
  let produkt = null;
  const gewaehlteFarben = () => [...form.querySelectorAll('[data-ml-farbliste] input:checked')].map(i => i.value);
  const pruefe = () => { if (!vorgabe) knopf.disabled = !produkt || !gewaehlteFarben().length; };

  if (!vorgabe) {
    const suche = form.querySelector('#mlSuche');
    const treffer = form.querySelector('[data-ml-treffer]');
    let zaehler = 0;
    let warte = null;
    suche.addEventListener('input', () => {
      clearTimeout(warte);
      const q = suche.value.trim();
      if (q.length < 2) { treffer.innerHTML = ''; return; }
      warte = setTimeout(async () => {
        const nr = ++zaehler;
        const d = await fetchEinkauf(`/api/lexikon/liste?${new URLSearchParams({ q, pageSize: 8 })}`);
        if (nr !== zaehler) return;
        // Musterprodukte selbst nicht anbieten - das Original fuehrt zu denselben Farben.
        const items = (d?.treffer?.items || []).filter(x => x.produktgruppe !== 'Musterservice');
        treffer.innerHTML = items.length
          ? items.map(x => `<button type="button" class="ml-treffer-knopf" data-ml-handle="${esc(x.handle)}"><span>${esc(x.titel)}</span><span class="small muted">${esc([x.produktgruppe, x.farbenAnzahl ? plural(x.farbenAnzahl, 'Farbe', 'Farben') : null].filter(Boolean).join(' · '))}</span></button>`).join('')
          : `<p class="small muted">${d?.verfuegbar === false ? esc(d.hinweis || 'Lexikon nicht verfügbar.') : 'Kein Produkt gefunden.'}</p>`;
      }, 250);
    });
    treffer.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-ml-handle]');
      if (!b) return;
      const d = await fetchEinkauf(`/api/einkauf/musterlager-farben?${new URLSearchParams({ handle: b.dataset.mlHandle })}`);
      if (!d?.verfuegbar) { zeigeMeldung(form, d?.hinweis || 'Farben nicht lesbar.'); return; }
      produkt = d;
      treffer.innerHTML = '';
      suche.value = d.titel;
      const box = form.querySelector('[data-ml-farben]');
      form.querySelector('[data-ml-produkt]').textContent = `Farben von ${d.titel}`;
      form.querySelector('[data-ml-farbliste]').innerHTML = d.farben.length
        ? d.farben.map(f => `<label><input type="checkbox" value="${esc(f.farbe)}"${d.farben.length === 1 ? ' checked' : ''}> ${esc(f.farbe)}${f.imLager ? ' <span class="muted small">(schon im Lager)</span>' : ''}</label>`).join('')
        : '<p class="small muted">Keine Farbe mit Artikelnummer – im Lexikon prüfen.</p>';
      box.hidden = false;
      // Lieferant schickt bei PVC und Linoleum ein grosses Stueck: das ist dann die naheliegende Art.
      if (['Vinyl von der Rolle', 'Linoleumboden'].includes(d.produktgruppe)) form.querySelector('input[name=art][value=probestueck]').checked = true;
      pruefe();
      box.querySelector('input')?.focus();
    });
    form.addEventListener('change', ev => { if (ev.target.closest('[data-ml-farbliste]')) pruefe(); });
    suche.focus();
  } else {
    form.querySelector('#mlOrt').focus();
  }

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const basis = { aktion: 'einlagern', art: fd.get('art'), anzahl: fd.get('anzahl') || 1, ort: (fd.get('ort') || '').trim(), notiz: (fd.get('notiz') || '').trim() };
    const body = vorgabe
      ? { ...basis, schluessel: [vorgabe.schluessel], titel: vorgabe.titel, farbe: vorgabe.farbe, handle: vorgabe.handle }
      : { ...basis, handle: produkt?.handle, farben: gewaehlteFarben() };
    if (!vorgabe && !body.farben.length) return;
    knopf.disabled = true;
    knopf.textContent = 'Wird eingelagert …';
    const r = await schreibe(body);
    if (!r.ok) { zeigeMeldung(form, r.text); knopf.disabled = false; knopf.textContent = 'Einlagern'; return; }
    $('#dialogRoot').innerHTML = '';
    toast(`${plural(r.anzahl, 'Muster', 'Muster')} eingelagert${basis.ort ? ` · ${basis.ort}` : ''}`);
    nachladen();
  });
}

/** Bearbeiten: Art, Anzahl (bei Einzelmustern: wie viele noch da sind), Platz, Notiz - oder herausnehmen. */
function oeffneBearbeiten(e, { wieder = false } = {}) {
  const istZaehlbar = zaehlbar(e);
  const anzahlWert = istZaehlbar ? nochDa(e) : (e.anzahl ?? 1);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog ml-dialog" role="dialog" aria-modal="true" aria-labelledby="mlTitel" data-dialog novalidate>
    <h2 id="mlTitel">${wieder ? 'Wieder da' : 'Bearbeiten'} · ${esc(e.titel)}</h2>
    <div class="ml-gewaehlt">${esc(e.farbe || '')}</div>
    ${artFelder(e.art)}
    <div class="field"><label for="mlAnzahl">${istZaehlbar ? 'Wie viele sind noch da?' : 'Anzahl'}</label><input id="mlAnzahl" name="anzahl" type="number" inputmode="numeric" min="0" max="999" value="${esc(wieder && istZaehlbar && anzahlWert <= 0 ? '' : anzahlWert)}" style="width:7rem">
      ${istZaehlbar && e.stand?.verbraucht ? `<span class="hint">${esc(plural(e.stand.verbraucht, 'Muster ist', 'Muster sind'))} schon verschickt.</span>` : ''}</div>
    ${ortFeld(e.ort || '')}
    <div class="field"><label for="mlNotiz">Notiz (optional)</label><input id="mlNotiz" name="notiz" maxlength="300" autocomplete="off" value="${esc(e.notiz || '')}"></div>
    <p data-ml-meldung hidden></p>
    <div class="actions ml-actions">
      ${wieder ? '' : '<button type="button" class="btn btn-ghost ml-entfernen" data-ml-entfernen>Aus dem Lager nehmen…</button>'}
      <button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Speichern</button>
    </div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('#mlAnzahl').focus();
  form.querySelector('[data-ml-entfernen]')?.addEventListener('click', async () => {
    if (!window.confirm(`${e.titel}${e.farbe ? ` · ${e.farbe}` : ''} aus dem Musterlager nehmen? Neue Musterbestellungen gehen dann wieder an den Lieferanten.`)) return;
    const r = await schreibe({ aktion: 'entfernen', id: e.id });
    if (!r.ok) { zeigeMeldung(form, r.text); return; }
    $('#dialogRoot').innerHTML = '';
    toast('Aus dem Musterlager genommen');
    nachladen();
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const eingabe = String(fd.get('anzahl') ?? '').trim();
    const art = fd.get('art');
    // Einzelmuster: eingetippt wird, was in der Schublade liegt; gespeichert wird die Gesamtzahl
    // (schon verschickte + noch da), damit das Abzaehlen weiter stimmt.
    const anzahl = eingabe === '' ? undefined : zaehlbar({ art }) ? Number(eingabe) + (e.stand?.verbraucht ?? 0) : Number(eingabe);
    const body = { aktion: 'aendern', id: e.id, art, ort: (fd.get('ort') || '').trim(), notiz: (fd.get('notiz') || '').trim() };
    if (wieder) body.leer = false;
    if (anzahl !== undefined) body.anzahl = anzahl;
    const r = await schreibe(body);
    if (!r.ok) { zeigeMeldung(form, r.text); return; }
    $('#dialogRoot').innerHTML = '';
    toast(wieder ? 'Wieder im Musterlager' : 'Gespeichert');
    nachladen();
  });
}

/** Klicks der Ansicht. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function einkaufKlickMusterlager(ev) {
  if (ev.target.closest('[data-ml-neu]')) { oeffneEinlagern(); return true; }
  const v = ev.target.closest('[data-ml-vorschlag]');
  if (v) {
    const x = musterlager.daten?.vorschlaege?.[Number(v.dataset.mlVorschlag)];
    if (x) oeffneEinlagern({ titel: x.titel, farbe: x.farbe, schluessel: x.schluessel, handle: x.handle, art: x.artVorschlag });
    return true;
  }
  const finde = id => musterlager.daten?.eintraege?.find(e => e.id === id);
  const b = ev.target.closest('[data-ml-bearbeiten]');
  if (b) { const e = finde(b.dataset.mlBearbeiten); if (e) oeffneBearbeiten(e); return true; }
  const w = ev.target.closest('[data-ml-wieder]');
  if (w) { const e = finde(w.dataset.mlWieder); if (e) oeffneBearbeiten(e, { wieder: true }); return true; }
  const l = ev.target.closest('[data-ml-leer]');
  if (l) {
    const e = finde(l.dataset.mlLeer);
    if (!e) return true;
    l.disabled = true;
    schreibe({ aktion: 'aendern', id: e.id, leer: true }).then(r => {
      if (!r.ok) { toast(r.text, 'crit'); l.disabled = false; return; }
      toast(`${e.farbe || e.titel}: leer – neue Musterbestellungen gehen wieder an den Lieferanten`);
      nachladen();
    });
    return true;
  }
  return false;
}
