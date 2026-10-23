/**
 * Ansicht "Sonderposten" (#/sonderposten): Reststuecke, Einzelstuecke und Restrollen mit
 * Foto, Massen, Preis und Lagerort - und der eine Knopf "Im Laden verkauft…".
 *
 * Restrollen (Tag "sonderposten", z. B. Passion Yasmin): Der Knopf fragt nach der
 * abgeschnittenen Laenge; der Server zieht Laenge x Rollenbreite (ganze m2) vom
 * Shopify-Bestand ab, und der Shop zeigt sofort den neuen Rest.
 *
 * Wer im Laden ein Stueck verkauft, tippt die SP-Nummer vom Etikett, prueft Foto und Preis
 * und bucht. Der Server setzt den Bestand in Shopify auf 0 (online nicht mehr bestellbar),
 * schreibt verkauft_am/_von/_kanal und das Protokoll und liest zur Gegenprobe neu
 * (operations/lib/sonderposten.mjs). Die Liste kommt live aus Shopify, nicht aus einem
 * Export - deshalb ein eigener "Neu laden"-Knopf statt "Jetzt aktualisieren".
 */
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDateTime, fmtPreis, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { meldungNachBuchung, rollenRechnung, inventurRechnung, meldungNachInventur } from '../lib/sonderposten.mjs';
import { neueKennung } from '../lib/druckliste.mjs';

export const sonderposten = { daten: null, laedt: false };

function ensureSonderposten({ neu = false } = {}) {
  if (sonderposten.laedt || (sonderposten.daten && !neu)) return;
  sonderposten.laedt = true;
  fetchEinkauf('/api/sonderposten/liste').then(d => {
    sonderposten.daten = d;
  }).finally(() => {
    sonderposten.laedt = false;
    if (state.route.view === 'sonderposten') render();
  });
}

const zahl2 = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "4,00 × 2,35 m · 9,40 m²" - fehlt etwas, steht nur da, was belegt ist. */
export function masseText(e) {
  const teile = [];
  if (e.breiteM !== null && e.laengeM !== null) teile.push(`${zahl2(e.breiteM)} × ${zahl2(e.laengeM)} m`);
  if (e.flaecheM2 !== null) teile.push(`${zahl2(e.flaecheM2)} m²`);
  return teile.join(' · ');
}

const norm = s => String(s ?? '').toLowerCase().replace(/[\s\-_./]/g, '');

/** Trifft "SP-0042", "sp 42", "0042", "42" und Teile des Titels. */
export function passtZurSuche(e, q) {
  const n = norm(q);
  if (!n) return true;
  if (norm(e.sku).includes(n) || norm(e.titel).includes(n)) return true;
  const ziffern = n.replace(/^sp/, '');
  if (/^\d+$/.test(ziffern)) {
    const skuZiffern = String(e.sku || '').match(/(\d+)\s*$/)?.[1];
    return skuZiffern !== undefined && Number(skuZiffern) === Number(ziffern);
  }
  return false;
}

const zahlDe = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** "noch 20 m (80 m²)" - der Rest einer Rolle in Laenge und Flaeche. */
export function restText(e) {
  if (e.bestand === null) return '';
  return `noch ${zahlDe(e.laengeM ?? 0)} m (${e.bestand} m²)`;
}

/** Zustand eines Stuecks in Worten - und ob er Aufmerksamkeit braucht. */
function zustandVon(e) {
  if (e.typ === 'rolle') {
    if (e.verkaufbar) return { text: restText(e), klasse: 'plain' };
    if (!e.getrackt || e.bestand === null) return { text: 'Bestand wird nicht geführt – in Shopify prüfen', klasse: 'gap' };
    if (!e.ueberverkaufGesperrt) return { text: '„Verkauf bei Nichtverfügbarkeit fortsetzen“ ist an – in Shopify ausschalten', klasse: 'gap' };
    return { text: 'Rolle leer (Bestand 0)', klasse: 'plain' };
  }
  if (e.verkaufbar) return { text: 'verfügbar', klasse: 'plain' };
  if (e.verkauftAm) {
    const wer = e.verkauftVon ? ` von ${e.verkauftVon}` : '';
    const wo = e.verkauftKanal === 'Online' ? ' (online)' : e.verkauftKanal === 'Laden' ? ' (im Laden)' : '';
    return { text: `verkauft am ${fmtDateTime(e.verkauftAm)}${wer}${wo}`, klasse: 'plain' };
  }
  if (!e.getrackt || e.bestand === null) return { text: 'Bestand wird nicht geführt – in Shopify prüfen', klasse: 'gap' };
  // Mit erlaubtem Ueberverkauf sperrt Bestand 0 den Onlinekauf nicht - der Knopf fehlt deshalb.
  if (!e.ueberverkaufGesperrt) return { text: '„Verkauf bei Nichtverfügbarkeit fortsetzen“ ist an – in Shopify ausschalten', klasse: 'gap' };
  if (e.bestand === 0) return { text: 'nicht mehr verfügbar (Bestand 0)', klasse: 'plain' };
  return { text: `Bestand ${e.bestand} – sollte 1 sein, in Shopify prüfen`, klasse: 'gap' };
}

function karte(e) {
  const z = zustandVon(e);
  const masse = e.typ === 'rolle' ? `Rolle ${zahlDe(e.breiteM)} m breit` : masseText(e);
  const bild = e.bild
    ? `<img class="sp-bild" src="${esc(e.bild)}" alt="${esc(e.bildAlt || e.titel)}" loading="lazy" width="72" height="72">`
    : '<div class="sp-bild sp-ohne-bild" aria-hidden="true">kein Foto</div>';
  const knopf = e.verkaufbar && !istNurLesend()
    ? `<button type="button" class="btn btn-primary btn-sm" data-sp-verkauft="${esc(e.id)}">${e.typ === 'rolle' ? 'Ladenverkauf buchen…' : 'Im Laden verkauft…'}</button>`
    : '';
  const inventur = e.typ === 'rolle' && !istNurLesend() && state.session?.benutzer?.rolle !== 'mitarbeiter'
    ? `<button type="button" class="btn btn-sm" data-sp-bestand="${esc(e.id)}">Restlänge eintragen…</button>` : '';
  return `<article class="sp-karte${e.verkaufbar ? '' : ' sp-weg'}">
    ${bild}
    <div class="sp-inhalt">
      <div class="sp-kopf">${e.typ === 'rolle' ? '<span class="sp-sku">Restrolle</span>' : `<span class="mono sp-sku">${esc(e.sku || 'ohne SKU')}</span>`}${e.status === 'DRAFT' ? ' <span class="small muted">· Entwurf, nicht im Shop</span>' : ''}</div>
      <div class="sp-titel">${esc(e.titel)}</div>
      <div class="sp-angaben">
        ${masse ? `<span>${esc(masse)}</span>` : ''}
        ${e.zustand ? `<span>${esc(e.zustand)}</span>` : ''}
        ${e.farbe ? `<span>${esc(e.farbe)}</span>` : ''}
        ${e.lagerort ? `<span>Lagerort: ${esc(e.lagerort)}</span>` : ''}
      </div>
      <div class="sp-fuss">
        <span class="badge ${z.klasse}">${esc(z.text)}</span>
        <a class="small" href="${esc(e.adminUrl)}" target="_blank" rel="noopener">In Shopify öffnen</a>
      </div>
    </div>
    <div class="sp-rechts">
      ${e.typ === 'rolle'
        ? `<span class="sp-preis">${e.preis === null ? '–' : `${esc(fmtPreis(e.preis))} €/m²`}<span class="small muted sp-preis-zusatz">online</span></span>`
        : `<span class="sp-preis">${e.preis === null ? '–' : `${esc(fmtPreis(e.preis))} €`}</span>`}
      ${knopf}
      ${inventur}
    </div>
  </article>`;
}

export function viewSonderposten() {
  ensureSonderposten();
  const d = sonderposten.daten;
  const q = state.route.params.get('spq') || '';
  const anzahlVerfuegbar = d?.verfuegbar ? d.eintraege.filter(e => e.verkaufbar).length : null;
  const kopf = `<div class="page-head"><div><h1>Sonderposten</h1>
    <p class="sub">Rollen im Laden vor Zahlung und Zuschnitt buchen. Erst nach bestätigter Buchung verkaufen – der Online-Shop verwendet denselben Bestand.</p></div>
    <div class="head-actions"><button type="button" class="btn btn-sm" data-sp-neu${sonderposten.laedt ? ' disabled' : ''}>${sonderposten.laedt ? 'Lädt …' : 'Neu laden'}</button></div></div>`;
  const suche = `<div class="toolbar search-hero"><input type="search" inputmode="search" autocomplete="off" placeholder="SP-Nummer oder Name, z. B. SP-0042 oder Yasmin" value="${esc(q)}" data-param="spq" aria-label="Sonderposten suchen"></div>`;

  if (!d && sonderposten.laedt) return kopf + suche + `<div class="empty">Lade Sonderposten aus Shopify …</div>`;
  if (d?.fehler) return kopf + stoerungState(d, 'Die Sonderposten');
  if (!d || !d.verfuegbar) return kopf + emptyState('Shopify ist nicht verbunden.', `${d?.hinweis || ''}`);

  const treffer = d.eintraege.filter(e => passtZurSuche(e, q));
  const da = treffer.filter(e => e.verkaufbar);
  const weg = treffer.filter(e => !e.verkaufbar);
  // Die Zahl steht nur hier; bei 0 sagt es der Leerzustand darunter, nicht zweimal.
  const stand = `<p class="small muted sp-stand">${anzahlVerfuegbar ? `${anzahlVerfuegbar} verfügbar · ` : ''}Stand ${esc(fmtDateTime(d.abgerufenAm))}</p>`;

  if (!d.eintraege.length) {
    return kopf + emptyState('Noch keine Sonderposten angelegt.', 'Neue Stücke legt der Inhaber in Shopify aus der Vorlage „VORLAGE Sonderposten“ an.');
  }
  if (!treffer.length) {
    return kopf + suche + stand + emptyState(`Kein Sonderposten passt zu „${q}“.`, 'Nummer auf dem Etikett prüfen – oder die Suche leeren.');
  }
  return kopf + suche + stand
    + (da.length ? `<div class="sp-liste">${da.map(karte).join('')}</div>` : `<div class="empty">${q ? 'Kein verfügbares Stück passt zur Suche.' : 'Gerade ist kein Stück verfügbar.'}</div>`)
    + (weg.length ? `<h2 class="sub-title">Nicht mehr verfügbar (${weg.length})</h2><div class="sp-liste">${weg.map(karte).join('')}</div>` : '');
}

// -- Wer hat verkauft? ---------------------------------------------------------
// Im gemeinsamen Zugang (ein Passwort, kein persoenliches Konto) kennt der Server
// niemanden - das Protokoll stuende sonst immer auf "Inhaber". Inhaber 2026-10-10:
// im Laden bucht die verkaufende Person. Der Dialog fragt deshalb nach dem Namen,
// Pflicht und ohne Vorbelegung (am Laden-PC wechseln die Leute); zuletzt benutzte
// Namen stehen nur als Vorschlag in der Liste. Mit persoenlichem Konto entfaellt
// das Feld, dann gilt der Name aus der Sitzung.

const NAMEN_SCHLUESSEL = 'tp-sp-verkaeufer';

/** Persoenliches Konto hat ein Kuerzel; der gemeinsame Zugang meldet {name: 'Inhaber', kuerzel: null}. */
function brauchtNamen() {
  return !state.session?.benutzer?.kuerzel;
}

function gemerkteNamen() {
  try {
    const l = JSON.parse(localStorage.getItem(NAMEN_SCHLUESSEL) || '[]');
    return Array.isArray(l) ? l.filter(n => typeof n === 'string' && n).slice(0, 8) : [];
  } catch { return []; }
}

function merkeNamen(name) {
  try {
    const l = [name, ...gemerkteNamen().filter(n => n.toLowerCase() !== name.toLowerCase())].slice(0, 8);
    localStorage.setItem(NAMEN_SCHLUESSEL, JSON.stringify(l));
  } catch { /* ohne Speicher keine Vorschlaege - die Buchung geht trotzdem */ }
}

function nameFeld(titel = 'Wer hat verkauft?') {
  if (!brauchtNamen()) return '';
  const namen = gemerkteNamen();
  return `<div class="field">
      <label for="spVerkaeufer">${esc(titel)}</label>
      <input id="spVerkaeufer" name="verkaeufer" type="text" autocomplete="off" maxlength="60" placeholder="Name"${namen.length ? ' list="spNamen"' : ''}>
      ${namen.length ? `<datalist id="spNamen">${namen.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>` : ''}
      <span class="hint">Steht im Protokoll.</span>
    </div>`;
}

/** Name aus dem Feld; null, wenn das Feld gar nicht da ist (persoenliches Konto). */
function leseNamen(form) {
  const f = form.querySelector('#spVerkaeufer');
  return f ? f.value.replace(/\s+/g, ' ').trim() : null;
}

// -- Buchen -----------------------------------------------------------------

async function bucheVerkauf(e, laengeM = null, verkauftVon = null, inventur = null) {
  const r = await fetch(inventur ? '/api/sonderposten/bestand' : '/api/sonderposten/verkauft', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      produktId: e.id, inventoryItemId: e.inventoryItemId,
      ...(laengeM === null ? {} : { laengeM }),
      ...(verkauftVon ? { verkauftVon } : {}),
      ...(inventur || {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, grund: j.grund || null, text: j.error || '' };
  return { ok: true, ergebnis: j };
}

function zeigeDialogMeldung(form, klasse, text) {
  const ziel = form.querySelector('[data-sp-meldung]');
  ziel.className = `notice ${klasse}`;
  ziel.textContent = text;
  ziel.hidden = false;
}

function oeffneVerkaufDialog(e) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="spTitel" data-dialog>
    <h2 id="spTitel">Im Laden verkauft?</h2>
    <div class="sp-dialog-stueck">
      ${e.bild ? `<img class="sp-bild" src="${esc(e.bild)}" alt="" width="72" height="72">` : ''}
      <div><div class="sp-titel">${esc(e.titel)}</div>
        <div class="mono">${esc(e.sku || '')}</div>
        <div class="sp-preis">${e.preis === null ? '–' : `${esc(fmtPreis(e.preis))} €`}</div></div>
    </div>
    <p class="small muted" style="margin:0">Der Bestand wird in Shopify auf 0 gesetzt. Online ist das Stück danach nicht mehr bestellbar. Wer gebucht hat, wird festgehalten.</p>
    ${nameFeld()}
    <p data-sp-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Ja, im Laden verkauft</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const knopf = form.querySelector('[type=submit]');
  const namensFeld = form.querySelector('#spVerkaeufer');
  const pruefeNamen = () => { if (namensFeld) knopf.disabled = !leseNamen(form); };
  namensFeld?.addEventListener('input', pruefeNamen);
  pruefeNamen();
  (namensFeld || knopf).focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const name = leseNamen(form);
    if (name === '') return;
    knopf.disabled = true;
    if (namensFeld) namensFeld.disabled = true;
    knopf.textContent = 'Wird gebucht …';
    if (name) merkeNamen(name);
    let antwort;
    // Ohne Antwort ist offen, ob der Server schon gebucht hat - lib/sonderposten.mjs
    // sagt dann "unklar" statt "nichts gebucht".
    try { antwort = await bucheVerkauf(e, null, name); } catch { antwort = { verbindung: false }; }
    const m = meldungNachBuchung(antwort);
    if (m.neuLaden) ensureSonderposten({ neu: true });
    if (m.erfolg) {
      $('#dialogRoot').innerHTML = '';
      toast(m.text);
      return;
    }
    zeigeDialogMeldung(form, m.klasse, m.text);
    knopf.hidden = true;
    form.querySelector('[data-close-dialog]').textContent = 'Schließen';
  });
}

function oeffneRollenDialog(e) {
  const breite = zahlDe(e.breiteM);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="spTitel" data-dialog novalidate>
    <h2 id="spTitel">Ladenverkauf buchen</h2>
    <div class="sp-dialog-stueck">
      ${e.bild ? `<img class="sp-bild" src="${esc(e.bild)}" alt="" width="72" height="72">` : ''}
      <div><div class="sp-titel">${esc(e.titel)}</div>
        <div class="small muted">Rolle ${esc(breite)} m breit · ${esc(restText(e))}</div></div>
    </div>
    <div class="field">
      <label for="spLaenge">Länge für den Ladenkunden</label>
      <div class="sp-eingabe"><input id="spLaenge" name="laenge" type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 3,5" aria-describedby="spLaengeHinweis spRechnung"><span>m</span></div>
      <span class="hint" id="spLaengeHinweis">Vor Zahlung und Zuschnitt buchen. Immer volle Rollenbreite (${esc(breite)} m): Ein Teppich 2 × 3 m verbraucht 2 m der Rolle. Bei unklarer Antwort erst den Bestand prüfen.</span>
    </div>
    <p class="sp-rechnung" id="spRechnung" data-sp-rechnung aria-live="polite"></p>
    ${nameFeld()}
    <p data-sp-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary" disabled>Abbuchen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const feld = form.querySelector('#spLaenge');
  const zeile = form.querySelector('[data-sp-rechnung]');
  const knopf = form.querySelector('[type=submit]');
  const namensFeld = form.querySelector('#spVerkaeufer');
  let rechnung = rollenRechnung('', e.breiteM, e.bestand);
  const aktualisiere = () => {
    rechnung = rollenRechnung(feld.value, e.breiteM, e.bestand);
    zeile.textContent = rechnung.ok ? rechnung.text : rechnung.fehler;
    zeile.classList.toggle('sp-rechnung-fehler', !rechnung.ok && !rechnung.leer);
    knopf.disabled = !rechnung.ok || leseNamen(form) === '';
    knopf.textContent = rechnung.ok ? `${rechnung.qm} m² abbuchen` : 'Abbuchen';
  };
  feld.addEventListener('input', aktualisiere);
  namensFeld?.addEventListener('input', aktualisiere);
  feld.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    aktualisiere();
    const name = leseNamen(form);
    if (!rechnung.ok || name === '') return;
    knopf.disabled = true;
    feld.disabled = true;
    if (namensFeld) namensFeld.disabled = true;
    knopf.textContent = 'Wird gebucht …';
    if (name) merkeNamen(name);
    let antwort;
    // Ohne Antwort ist offen, ob der Server schon gebucht hat - lib/sonderposten.mjs
    // sagt dann "unklar" statt "nichts gebucht".
    try { antwort = await bucheVerkauf(e, rechnung.laengeM, name); } catch { antwort = { verbindung: false }; }
    const m = meldungNachBuchung(antwort);
    if (m.neuLaden) ensureSonderposten({ neu: true });
    if (m.erfolg) {
      $('#dialogRoot').innerHTML = '';
      toast(m.text);
      return;
    }
    zeigeDialogMeldung(form, m.klasse, m.text);
    knopf.hidden = true;
    form.querySelector('[data-close-dialog]').textContent = 'Schließen';
  });
}

function oeffneInventurDialog(e) {
  // Ein Schluessel je Dialog; wiederholte Zustellung derselben Anfrage behaelt ihn.
  const operationId = neueKennung();
  const menge = n => n === null || n === undefined ? 'unbekannt' : `${zahlDe(n)} m²`;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="spTitel" data-dialog novalidate>
    <h2 id="spTitel">Restlänge eintragen</h2>
    <div class="sp-dialog-stueck"><div><div class="sp-titel">${esc(e.titel)}</div><div class="small muted">Feste Rollenbreite: ${esc(zahlDe(e.breiteM))} m</div></div></div>
    <p class="small">Shopify: physisch ${esc(menge(e.bestandVorhanden))} · frei ${esc(menge(e.bestand))} · gebunden ${esc(menge(e.bestandGebunden))} · reserviert ${esc(menge(e.bestandReserviert))} · zurückgehalten ${esc(menge(e.bestandZurueckgehalten))}.</p>
    ${e.inventurMoeglich ? `<div class="field"><label for="spLaenge">Gemessene Restlänge</label><div class="sp-eingabe"><input id="spLaenge" inputmode="decimal" type="text" autocomplete="off" placeholder="z. B. 12" aria-describedby="spInventurHinweis spRechnung"><span>m</span></div><span class="hint" id="spInventurHinweis">Nur diese durchgehende Rolle nachmessen. Getrennte Reststücke einzeln führen. 0 bedeutet leer. Shopify speichert volle m²; Bruchteile werden sicher abgerundet.</span></div>
    <p class="sp-rechnung" id="spRechnung" data-sp-rechnung aria-live="polite"></p>${nameFeld('Wer hat den Bestand geprüft?')}`
    : `<p class="notice warn">${esc(e.inventurHinweis || 'Bitte den Bestand zuerst in Shopify prüfen.')}</p><a href="${esc(e.adminUrl)}" target="_blank" rel="noopener">In Shopify prüfen</a>`}
    <p data-sp-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button>${e.inventurMoeglich ? '<button type="submit" class="btn btn-primary" disabled>Restlänge speichern</button>' : ''}</div>
  </form></div>`;
  const form = $('#dialogRoot form');
  if (!e.inventurMoeglich) { form.addEventListener('submit', ev => ev.preventDefault()); form.querySelector('[data-close-dialog]').focus(); return; }
  const feld = form.querySelector('#spLaenge');
  const knopf = form.querySelector('[type=submit]');
  const zeile = form.querySelector('[data-sp-rechnung]');
  const namensFeld = form.querySelector('#spVerkaeufer');
  const aktualisiere = () => {
    const r = inventurRechnung(feld.value, e.breiteM);
    zeile.textContent = r.ok ? r.text : r.fehler;
    zeile.classList.toggle('sp-rechnung-fehler', !r.ok && !r.leer);
    knopf.disabled = !r.ok || leseNamen(form) === '';
    return r;
  };
  feld.addEventListener('input', aktualisiere);
  namensFeld?.addEventListener('input', aktualisiere);
  feld.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = aktualisiere();
    const name = leseNamen(form);
    if (!r.ok || name === '') return;
    knopf.disabled = true; feld.disabled = true;
    if (namensFeld) namensFeld.disabled = true;
    knopf.textContent = 'Wird gespeichert …';
    let antwort;
    try { antwort = await bucheVerkauf(e, r.laengeM, name, { erwarteterBestand: e.bestandVorhanden, operationId }); } catch { antwort = { verbindung: false }; }
    const m = meldungNachInventur(antwort);
    if (m.neuLaden) ensureSonderposten({ neu: true });
    if (m.erfolg) { $('#dialogRoot').innerHTML = ''; toast(m.text); return; }
    zeigeDialogMeldung(form, m.klasse, m.text);
    knopf.hidden = true;
  });
}

/** Klicks der Ansicht. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function sonderpostenKlick(ev) {
  if (ev.target.closest('[data-sp-neu]')) { ensureSonderposten({ neu: true }); render(); return true; }
  const inventur = ev.target.closest('[data-sp-bestand]');
  if (inventur) {
    const e = sonderposten.daten?.eintraege?.find(x => x.id === inventur.dataset.spBestand);
    if (e) oeffneInventurDialog(e);
    return true;
  }
  const k = ev.target.closest('[data-sp-verkauft]');
  if (!k) return false;
  const e = sonderposten.daten?.eintraege?.find(x => x.id === k.dataset.spVerkauft);
  if (e) (e.typ === 'rolle' ? oeffneRollenDialog : oeffneVerkaufDialog)(e);
  return true;
}
