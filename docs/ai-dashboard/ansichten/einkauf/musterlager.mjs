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
 * und Farben, die mehrfach als Muster bestellt wurden. Das Lager selbst ist nur lokal.
 *
 * Verlegereste (Regel 2026-10-21, operations/lib/reste.mjs): Teppichboden und Vinyl von Lieferant
 * A oder C, die wir verlegen, hinterlassen Reste - aufheben, beschriften, als "Verlegerest"
 * einlagern. Ware anderer Hersteller (z. B. direkt bestellt) nur, wenn A oder C sie auch fuehrt:
 * "Rest prüfen…" gleicht Hersteller, Qualitaet und Farbnummer gegen das Lexikon ab.
 *
 * "Muster nicht verfuegbar" (Inhaber 2026-10-16, Zeitleiste): die betroffenen Farben sind im Shop
 * gesperrt. Oben "Im Shop sperren", wenn das nicht geklappt hat (Recht fehlt, kein Zugang,
 * kein eigener Muster-Artikel) - mit Link zur Variante in Shopify; darunter "Im Shop gesperrte
 * Muster" mit "Wieder verfuegbar". Server: operations/lib/mustersperre.mjs.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { ladeStandNeu } from './auftragsfluss.mjs';
import { oeffneEtikettenDruck, etikettenFuerBestellung } from '../../bausteine/etiketten-druck.mjs';

export const musterlager = { daten: null, laedt: false, geladenAm: 0 };

/** So lange gilt der geladene Stand; danach beim naechsten Zeichnen still neu holen (Verschicktes zaehlt ab). */
const FRISCH_MS = 30000;

const ARTEN_STANDARD = { einzel: 'Einzelmuster', probestueck: 'Probestück 2 × 1 m', bahn: 'Bahn 4 m × 20 cm', rest: 'Verlegerest' };
const ART_HINWEIS = {
  einzel: 'fertige Muster – jedes verschickte zählt ab',
  probestueck: 'z. B. PVC, Linoleum – wir schneiden A5-Muster zu',
  bahn: 'z. B. Teppichboden – wir schneiden A5-Muster zu',
  rest: 'Rest vom Verlegen – beschriftet, wir schneiden A5-Muster zu',
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
const resteLieferanten = (trenner = ' und ') => (musterlager.daten?.reste?.lieferanten || ['A', 'C']).join(trenner);

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
      ${e.handle ? `<button type="button" class="btn btn-sm btn-ghost" data-ml-etikett-eintrag="${esc(e.id)}" title="Aufkleber für dieses Stück">Aufkleber</button>` : ''}
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
    : v.grund === 'verlegerest'
      ? `Verlegeware kam am ${fmtDate(v.verlegerest.am)} (${v.verlegerest.orderName}) – Rest nach dem Verlegen aufheben, beschriften, einlagern${v.verlegerest.ueber ? ` · gibt es auch bei Lieferant ${v.verlegerest.ueber}` : ''}`
      : `${v.anzahl}× als Muster bestellt (${v.auftraege.join(', ')}) – einlagern spart die nächste Bestellung`;
  const farbe = v.farbe && !String(v.titel).includes(v.farbe) ? v.farbe : '';
  return `<li class="ml-zeile">
    <div class="ml-was">
      <div class="ml-farbe">${esc(v.titel)}${farbe ? ` <span class="ml-farbe-zusatz">· ${esc(farbe)}</span>` : ''}</div>
      <div class="ml-angaben"><span>${esc(grund)}</span></div>
    </div>
    <div class="ml-aktionen">
      ${v.handle && v.grund === 'verlegerest' ? `<button type="button" class="btn btn-sm btn-ghost" data-ml-vorschlag-etikett="${i}">Aufkleber</button>` : ''}
      ${istNurLesend() ? '' : `<button type="button" class="btn btn-sm" data-ml-vorschlag="${i}">Einlagern…</button>`}
    </div>
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
    <div class="ml-erklaerung"><p class="small muted">Muster, die wir selbst da haben. Kommt eine Musterbestellung für eines davon, steht sie automatisch auf „aus dem Musterlager“ – sie geht nicht in die Bestellung an den Lieferanten. Einzelmuster zählen beim Verschicken ab; von Probestück, Bahn und Verlegerest schneiden wir A5-Muster zu. Gemischte Bestellungen gehen zusammen raus, sobald die Lieferanten-Muster da sind.</p>
    <p class="small muted"><b>Verlegereste:</b> Teppichboden und Vinyl von Lieferant ${esc(resteLieferanten())} – Rest immer aufheben und beschriften. Ware anderer Hersteller nur, wenn ${esc(resteLieferanten(' oder '))} sie auch führt: „Rest prüfen…“.</p></div>
    <div class="btn-row">${istNurLesend() ? '' : '<button type="button" class="btn btn-primary" data-ml-neu>Muster einlagern…</button>'}
    <button type="button" class="btn" data-ml-rest-pruefen>Rest prüfen…</button>
    <button type="button" class="btn" data-ml-etikett>Aufkleber drucken…</button></div>
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

  const sp = d.sperren || { gesperrt: [], offen: [] };
  const sperrFehler = sp.fehler ? `<div class="notice crit" role="alert">Gesperrte Muster nicht lesbar: ${esc(sp.fehler)}</div>` : '';

  return `${kopf}
    ${sperrFehler}
    ${sperrenOffenHtml(sp.offen || [])}
    <div class="toolbar search-hero"><input type="search" autocomplete="off" placeholder="Produkt, Farbe oder Lagerplatz suchen" value="${esc(state.route.params.get('mlq') || '')}" data-param="mlq" aria-label="Musterlager durchsuchen"></div>
    ${d.eintraege.length ? `<p class="small muted ml-zahlen">${zahlen.join(' · ')}</p>` : ''}
    ${liste}
    ${sperrenImShopHtml(sp.gesperrt || [])}
    ${vorschlaege}`;
}

// -- Mustersperre ---------------------------------------------------------------

const auftraegeText = s => (s.auftraege || []).map(a => a.orderName).filter(Boolean).join(', ');
const sperrName = s => [s.produkt, s.farbe].filter(Boolean).join(' · ') || s.sku;

/** "Im Shop sperren": Sperren, die (noch) nicht in Shopify stehen - mit Grund und Link. */
function sperrenOffenHtml(liste) {
  if (!liste.length) return '';
  const lesend = istNurLesend();
  return `<section class="ml-sperren ml-sperren-offen" aria-labelledby="mlSperrenOffen">
    <h2 class="section-title" id="mlSperrenOffen">Im Shop sperren <span class="ml-warn">${liste.length}</span></h2>
    <p class="small muted">Für diese Farben ist die Sperre im Shop noch nicht bestätigt. In Shopify die Variante öffnen und dort „Bestand verfolgen“ an, Bestand 0, „Verkauf bei Nichtverfügbarkeit“ aus – oder „Erneut sperren“.</p>
    <ul class="ml-liste">${liste.map(s => `<li class="ml-zeile ml-knapp">
      <div class="ml-was">
        <div class="ml-farbe">${esc(sperrName(s))}</div>
        <div class="ml-angaben"><span>${esc(s.sku)}</span><span>seit ${esc(fmtDate(s.seit))}${s.von ? ` · ${esc(s.von)}` : ''}</span>${auftraegeText(s) ? `<span>${esc(auftraegeText(s))}</span>` : ''}</div>
        ${s.fehler ? `<div class="small ml-warn">${esc(s.fehler)}</div>` : ''}
        ${s.freigabeFehler ? `<div class="small ml-warn">Freigabe hat nicht geklappt: ${esc(s.freigabeFehler)}</div>` : ''}
      </div>
      <div class="ml-aktionen">
        <a class="btn btn-sm" href="${esc(s.adminLink)}" target="_blank" rel="noopener">In Shopify öffnen</a>
        ${lesend ? '' : `${s.fehlerGrund === 'keine-mustervariante' ? '' : `<button type="button" class="btn btn-sm" data-ms-nachholen="${esc(s.sku)}">Erneut sperren</button>`}
        <button type="button" class="btn btn-sm btn-ghost" data-ms-frei="${esc(s.sku)}" title="${s.shopPruefen ? 'Die Farbe ist wieder da – im Shop freigeben und prüfen' : 'Die Farbe ist wieder da – aus der Liste nehmen'}">Wieder verfügbar</button>`}
      </div>
    </li>`).join('')}</ul>
  </section>`;
}

/** "Im Shop gesperrte Muster": was der Musterkonfigurator gerade als nicht verfuegbar zeigt. */
function sperrenImShopHtml(liste) {
  if (!liste.length) return '';
  const lesend = istNurLesend();
  return `<section class="ml-sperren" aria-labelledby="mlSperrenShop">
    <h2 class="section-title" id="mlSperrenShop">Im Shop gesperrte Muster</h2>
    <p class="small muted">Diese Muster sind beim Lieferanten nicht verfügbar und im Shop nicht bestellbar. Kommt eine Farbe wieder, „Wieder verfügbar“ – dann ist sie sofort wieder bestellbar.</p>
    <ul class="ml-liste">${liste.map(s => `<li class="ml-zeile">
      <div class="ml-was">
        <div class="ml-farbe">${esc(sperrName(s))}</div>
        <div class="ml-angaben"><span>gesperrt seit ${esc(fmtDate(s.seit))}${s.von ? ` · ${esc(s.von)}` : ''}</span>${auftraegeText(s) ? `<span>${esc(auftraegeText(s))}</span>` : ''}<span class="muted">${esc(s.sku)}</span></div>
        ${s.freigabeFehler ? `<div class="small ml-warn">Freigabe hat nicht geklappt: ${esc(s.freigabeFehler)}</div>` : ''}
      </div>
      ${lesend ? '' : `<div class="ml-aktionen"><button type="button" class="btn btn-sm" data-ms-frei="${esc(s.sku)}">Wieder verfügbar</button></div>`}
    </li>`).join('')}</ul>
  </section>`;
}

async function schreibeSperre(body) {
  try {
    const r = await fetch('/api/einkauf/mustersperre', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, text: j.error || `Fehler ${r.status}` };
    return { ok: true, ...j };
  } catch (e) { return { ok: false, text: `Keine Verbindung zum Dashboard (${e.message})` }; }
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
      ? { ...basis, schluessel: vorgabe.schluesselAlle?.length ? vorgabe.schluesselAlle : [vorgabe.schluessel], titel: vorgabe.titel, farbe: vorgabe.farbe, handle: vorgabe.handle }
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
  // Einzeletikett von Hand, z. B. fuer Muster im Lager ohne Bestellung.
  if (ev.target.closest('[data-ml-etikett]')) { oeffneEtikettenDruck({ titel: 'Aufkleber drucken' }); return true; }
  const ms = ev.target.closest('[data-ms-frei], [data-ms-nachholen]');
  if (ms) {
    const frei = 'msFrei' in ms.dataset;
    const sku = frei ? ms.dataset.msFrei : ms.dataset.msNachholen;
    const alle = [...(musterlager.daten?.sperren?.gesperrt || []), ...(musterlager.daten?.sperren?.offen || [])];
    const s = alle.find(x => x.sku === sku);
    if (frei && (s?.shopPruefen || s?.imShop) && !window.confirm(`${sperrName(s)} wieder verfügbar? Das Muster ist dann im Shop sofort wieder bestellbar.`)) return true;
    ms.disabled = true;
    schreibeSperre({ aktion: frei ? 'freigeben' : 'nachholen', sku }).then(r => {
      if (!r.ok) { toast(r.text, 'crit', { dauer: 9000 }); ms.disabled = false; return; }
      toast(r.meldung || (frei ? 'Wieder verfügbar' : 'Im Shop gesperrt'));
      ensureMusterlager({ neu: true });
    });
    return true;
  }
  const v = ev.target.closest('[data-ml-vorschlag]');
  if (v) {
    const x = musterlager.daten?.vorschlaege?.[Number(v.dataset.mlVorschlag)];
    if (x) oeffneEinlagern({ titel: x.titel, farbe: x.farbe, schluessel: x.schluessel, schluesselAlle: x.schluesselAlle, handle: x.handle, art: x.artVorschlag });
    return true;
  }
  if (ev.target.closest('[data-ml-rest-pruefen]')) { oeffneRestPruefen(); return true; }
  const ve = ev.target.closest('[data-ml-vorschlag-etikett]');
  if (ve) {
    const x = musterlager.daten?.vorschlaege?.[Number(ve.dataset.mlVorschlagEtikett)];
    if (x) druckeEtiketten([{ handle: x.handle, titel: x.titel, farbe: x.farbe, sku: x.schluessel }], 'Aufkleber für den Verlegerest');
    return true;
  }
  const ee = ev.target.closest('[data-ml-etikett-eintrag]');
  if (ee) {
    const e = musterlager.daten?.eintraege?.find(x => x.id === ee.dataset.mlEtikettEintrag);
    if (e) druckeEtiketten([{ handle: e.handle, titel: e.titel, farbe: e.farbe, sku: e.schluessel?.[0] }], 'Aufkleber');
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

// -- Verlegereste: Etikett und Pruefung fremder Ware -------------------------

/** Aufkleber fuer Lagerstuecke: dieselben Etiketten wie fuer Muster (Serie, Farbe, Technik aus dem Lexikon). */
async function druckeEtiketten(stuecke, titel) {
  const positionen = stuecke.filter(x => x.handle).map(x => ({ istMuster: true, handle: x.handle, titel: x.titel, farbe: x.farbe, musterQuelle: { sku: x.sku || null, produktHandle: x.handle } }));
  if (!positionen.length) { toast('Ohne Produkt im Lexikon kein Etikett – „Etikett drucken…“ oben füllt es von Hand.'); return; }
  const etiketten = await etikettenFuerBestellung(positionen);
  oeffneEtikettenDruck({ etiketten, titel });
}

/**
 * "Rest prüfen": Ware direkt vom Hersteller oder von einem anderen Lieferanten - fuehrt A oder C sie auch? Dann den
 * Rest unter dem A/C-Produkt einlagern und beschriften. Server: GET /api/einkauf/reste-abgleich.
 */
function oeffneRestPruefen() {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog ml-dialog" role="dialog" aria-modal="true" aria-labelledby="mlRestTitel" data-dialog novalidate>
    <h2 id="mlRestTitel">Rest prüfen</h2>
    <p class="small muted">Ware von einem anderen Hersteller oder Lieferanten, z. B. direkt beim Hersteller bestellt: Führt Lieferant ${esc(resteLieferanten(' oder '))} sie auch, kommt der Rest beschriftet ins Musterlager. Nur Hersteller eingeben zeigt alles, was es von ihm bei ${esc(resteLieferanten(' und '))} gibt.</p>
    <div class="field"><label for="mlRestHersteller">Hersteller</label><input id="mlRestHersteller" name="hersteller" maxlength="120" autocomplete="off" placeholder="Name oder Kürzel wie auf dem Lieferschein"></div>
    <div class="field"><label for="mlRestQualitaet">Qualität</label><input id="mlRestQualitaet" name="qualitaet" maxlength="120" autocomplete="off" placeholder="Name auf Lieferschein oder Etikett"></div>
    <div class="field"><label for="mlRestFarbe">Farbnummer (optional)</label><input id="mlRestFarbe" name="farbnummer" maxlength="20" autocomplete="off" style="width:9rem"></div>
    <div class="btn-row"><button type="submit" class="btn">Prüfen</button></div>
    <div data-ml-rest-ergebnis></div>
    <p data-ml-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const ziel = form.querySelector('[data-ml-rest-ergebnis]');
  let treffer = [];
  form.querySelector('#mlRestHersteller').focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const q = { hersteller: String(fd.get('hersteller') || '').trim(), qualitaet: String(fd.get('qualitaet') || '').trim(), farbnummer: String(fd.get('farbnummer') || '').trim() };
    if (!q.hersteller && !q.qualitaet) { zeigeMeldung(form, 'Hersteller oder Qualität angeben.'); return; }
    form.querySelector('[data-ml-meldung]').hidden = true;
    ziel.innerHTML = '<p class="small muted">Prüfe …</p>';
    const d = await fetchEinkauf(`/api/einkauf/reste-abgleich?${new URLSearchParams(q)}`);
    if (!d?.verfuegbar) { ziel.innerHTML = `<p class="notice crit">${esc(d?.hinweis || d?.error || 'Abgleich nicht möglich.')}</p>`; return; }
    treffer = d.treffer || [];
    ziel.innerHTML = treffer.length ? treffer.map(restTrefferHtml).join('') : `<p class="notice">Bei ${esc(resteLieferanten(' und '))} nicht gefunden – den Rest nicht als Muster aufheben.</p>`;
  });
  ziel.addEventListener('click', async ev => {
    const knopf = ev.target.closest('[data-ml-rest-einlagern], [data-ml-rest-etikett]');
    if (!knopf) return;
    const t = treffer[Number(knopf.dataset.mlRestEinlagern ?? knopf.dataset.mlRestEtikett)];
    const box = knopf.closest('[data-ml-rest-treffer]');
    const farben = [...box.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
    if (!t || !farben.length) { zeigeMeldung(form, 'Mindestens eine Farbe ankreuzen.'); return; }
    if ('mlRestEtikett' in knopf.dataset) {
      // Ein Reststueck je Farbe - die Rollenbreiten derselben Farbe sind dasselbe Material.
      const jeFarbe = new Map();
      for (const f of t.farben) if (farben.includes(f.farbe) && !jeFarbe.has(f.farbe)) jeFarbe.set(f.farbe, f);
      druckeEtiketten([...jeFarbe.values()].map(f => ({ handle: t.handle, titel: t.titel, farbe: f.farbe, sku: f.sku })), 'Aufkleber für den Verlegerest');
      return;
    }
    const ort = String(box.querySelector('input[name=ort]')?.value || '').trim();
    knopf.disabled = true;
    const r = await schreibe({ aktion: 'einlagern', art: 'rest', anzahl: 1, handle: t.handle, farben: [...new Set(farben)], ort, notiz: `Verlegerest, geprüft: ${[form.querySelector('#mlRestHersteller').value, form.querySelector('#mlRestQualitaet').value].map(x => x.trim()).filter(Boolean).join(' ')}` });
    if (!r.ok) { zeigeMeldung(form, r.text); knopf.disabled = false; return; }
    toast(`${plural(r.anzahl, 'Verlegerest', 'Verlegereste')} eingelagert${ort ? ` · ${ort}` : ''} – jetzt beschriften`);
    knopf.textContent = 'Eingelagert';
    nachladen();
  });
}

function restTrefferHtml(t, i) {
  const lesend = istNurLesend();
  // Farben ohne Namen lassen sich nicht einlagern (Lager ordnet ueber die Farbe zu).
  const farben = [...new Map(t.farben.filter(f => f.farbe).map(f => [f.farbe, f])).values()];
  const vorab = t.farbeGefunden || farben.length === 1;
  return `<section class="ml-gruppe" data-ml-rest-treffer>
    <h3>${esc(t.titel)} <span class="small muted">${esc([t.produktgruppe, `Lieferant ${t.lieferant}`].filter(Boolean).join(' · '))}</span></h3>
    <p class="small muted">${esc(t.bezeichnung || '')}${t.hersteller ? ` · ${esc(t.hersteller)}` : ''}</p>
    ${t.herstellerOffen ? '<p class="small ml-warn">Beim Lieferanten steht kein Hersteller – Qualität am Lieferschein vergleichen.</p>' : ''}
    ${t.farbeGefunden ? '' : '<p class="small muted">Farbnummer nicht gefunden oder nicht angegeben – passende Farbe ankreuzen.</p>'}
    <div class="ml-farbliste">${farben.map(f => `<label><input type="checkbox" value="${esc(f.farbe)}"${vorab ? ' checked' : ''}> ${esc(f.farbe)}${f.farbnummer && !String(f.farbe).includes(f.farbnummer) ? ` <span class="muted small">${esc(f.farbnummer)}</span>` : ''}${f.imLager ? ' <span class="muted small">(schon im Lager)</span>' : ''}</label>`).join('')}</div>
    ${lesend ? '' : `<div class="field"><label>Lagerplatz <input name="ort" maxlength="80" autocomplete="off" placeholder="z. B. Regal B, Fach 3"></label></div>`}
    <div class="btn-row">
      <button type="button" class="btn btn-sm btn-ghost" data-ml-rest-etikett="${i}">Etikett</button>
      ${lesend ? '' : `<button type="button" class="btn btn-sm btn-primary" data-ml-rest-einlagern="${i}">Als Verlegerest einlagern</button>`}
    </div>
  </section>`;
}
