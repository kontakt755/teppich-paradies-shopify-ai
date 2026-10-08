/**
 * Ansicht "Sonderposten" (#/sonderposten): Reststuecke und Einzelstuecke mit Foto, Massen,
 * Preis und Lagerort - und der eine Knopf "Im Laden verkauft…".
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

/** Zustand eines Stuecks in Worten - und ob er Aufmerksamkeit braucht. */
function zustandVon(e) {
  if (e.verkaufbar) return { text: 'verfügbar', klasse: 'plain' };
  if (e.verkauftAm) {
    const wer = e.verkauftVon ? ` von ${e.verkauftVon}` : '';
    const wo = e.verkauftKanal === 'Online' ? ' (online)' : e.verkauftKanal === 'Laden' ? ' (im Laden)' : '';
    return { text: `verkauft am ${fmtDateTime(e.verkauftAm)}${wer}${wo}`, klasse: 'plain' };
  }
  if (!e.getrackt || e.bestand === null) return { text: 'Bestand wird nicht geführt – in Shopify prüfen', klasse: 'gap' };
  if (e.bestand === 0) return { text: 'nicht mehr verfügbar (Bestand 0)', klasse: 'plain' };
  return { text: `Bestand ${e.bestand} – sollte 1 sein, in Shopify prüfen`, klasse: 'gap' };
}

function karte(e) {
  const z = zustandVon(e);
  const masse = masseText(e);
  const bild = e.bild
    ? `<img class="sp-bild" src="${esc(e.bild)}" alt="${esc(e.bildAlt || e.titel)}" loading="lazy" width="72" height="72">`
    : '<div class="sp-bild sp-ohne-bild" aria-hidden="true">kein Foto</div>';
  const knopf = e.verkaufbar && !istNurLesend()
    ? `<button type="button" class="btn btn-primary btn-sm" data-sp-verkauft="${esc(e.id)}">Im Laden verkauft…</button>`
    : '';
  return `<article class="sp-karte${e.verkaufbar ? '' : ' sp-weg'}">
    ${bild}
    <div class="sp-inhalt">
      <div class="sp-kopf"><span class="mono sp-sku">${esc(e.sku || 'ohne SKU')}</span>${e.status === 'DRAFT' ? ' <span class="small muted">· Entwurf, nicht im Shop</span>' : ''}</div>
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
      <span class="sp-preis">${e.preis === null ? '–' : `${esc(fmtPreis(e.preis))} €`}</span>
      ${knopf}
    </div>
  </article>`;
}

export function viewSonderposten() {
  ensureSonderposten();
  const d = sonderposten.daten;
  const q = state.route.params.get('spq') || '';
  const anzahlVerfuegbar = d?.verfuegbar ? d.eintraege.filter(e => e.verkaufbar).length : null;
  const kopf = `<div class="page-head"><div><h1>Sonderposten</h1>
    <p class="sub">Reststücke und Einzelstücke. Im Laden verkauft? Hier abbuchen – dann ist das Stück online nicht mehr bestellbar.</p></div>
    <div class="head-actions"><button type="button" class="btn btn-sm" data-sp-neu${sonderposten.laedt ? ' disabled' : ''}>${sonderposten.laedt ? 'Lädt …' : 'Neu laden'}</button></div></div>`;
  const suche = `<div class="toolbar search-hero"><input type="search" inputmode="search" autocomplete="off" placeholder="SP-Nummer vom Etikett, z. B. SP-0042" value="${esc(q)}" data-param="spq" aria-label="Sonderposten suchen"></div>`;

  if (!d && sonderposten.laedt) return kopf + suche + `<div class="empty">Lade Sonderposten aus Shopify …</div>`;
  if (d?.fehler) return kopf + stoerungState(d, 'Die Sonderposten');
  if (!d || !d.verfuegbar) return kopf + emptyState('Shopify ist nicht verbunden.', `${d?.hinweis || ''}`);

  const treffer = d.eintraege.filter(e => passtZurSuche(e, q));
  const da = treffer.filter(e => e.verkaufbar);
  const weg = treffer.filter(e => !e.verkaufbar);
  // Die Zahl steht nur hier; bei 0 sagt es der Leerzustand darunter, nicht zweimal.
  const stand = `<p class="small muted sp-stand">${anzahlVerfuegbar ? `${anzahlVerfuegbar} Stück verfügbar · ` : ''}Stand ${esc(fmtDateTime(d.abgerufenAm))}</p>`;

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

// -- Buchen -----------------------------------------------------------------

async function bucheVerkauf(e) {
  const r = await fetch('/api/sonderposten/verkauft', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ produktId: e.id, inventoryItemId: e.inventoryItemId }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const text = j.error || (r.status === 401 ? 'Die Anmeldung ist abgelaufen – bitte neu anmelden.' : 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
    return { ok: false, status: r.status, grund: j.grund || null, text };
  }
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
    <p data-sp-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Ja, im Laden verkauft</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const knopf = form.querySelector('[type=submit]');
  knopf.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    knopf.disabled = true;
    knopf.textContent = 'Wird gebucht …';
    let antwort;
    try { antwort = await bucheVerkauf(e); } catch {
      antwort = { ok: false, text: 'Keine Verbindung zum Dashboard am Mac. Es wurde nichts gebucht – bitte noch einmal versuchen.' };
    }
    if (antwort.ok) {
      const er = antwort.ergebnis;
      ensureSonderposten({ neu: true });
      if (er.ok && !er.felderFehler) {
        $('#dialogRoot').innerHTML = '';
        toast('Als im Laden verkauft gebucht – online nicht mehr bestellbar');
        return;
      }
      // Gebucht, aber die Gegenprobe zeigt eine Abweichung: sagen, was stimmt und was nicht.
      const text = !er.ok
        ? `Shopify zeigt nach dem Buchen Bestand ${er.bestandNachher ?? 'unbekannt'} statt 0. Bitte in der Shopify-App prüfen und dort auf 0 setzen.`
        : `Bestand ist auf 0 – online nicht mehr bestellbar. Datum und Name des Verkaufs konnten aber nicht gespeichert werden (${er.felderFehler}). Bitte Ahmet Bescheid geben.`;
      zeigeDialogMeldung(form, 'warn', text);
      knopf.hidden = true;
      form.querySelector('[data-close-dialog]').textContent = 'Schließen';
      return;
    }
    zeigeDialogMeldung(form, antwort.grund === 'recht-fehlt' ? 'warn' : 'crit', antwort.text);
    if (antwort.status === 409) ensureSonderposten({ neu: true }); // Stand hat sich geaendert
    knopf.hidden = true;
    form.querySelector('[data-close-dialog]').textContent = 'Schließen';
  });
}

/** Klicks der Ansicht. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function sonderpostenKlick(ev) {
  if (ev.target.closest('[data-sp-neu]')) { ensureSonderposten({ neu: true }); render(); return true; }
  const k = ev.target.closest('[data-sp-verkauft]');
  if (!k) return false;
  const e = sonderposten.daten?.eintraege?.find(x => x.id === k.dataset.spVerkauft);
  if (e) oeffneVerkaufDialog(e);
  return true;
}
