/**
 * "Etiketten drucken": Vorschau und Druck von Muster-Etiketten auf dem Niimbot B1 (50 x 50 mm)
 * direkt aus dem Browser - ohne Installation, damit es am Mac und am Windows-Laptop gleich geht.
 *
 * Verbindung per Web Bluetooth (Hauptweg, der B1 haengt nicht am USB), USB-Kabel (WebSerial)
 * nur als Ausweg. Beides gibt es nur in Chrome/Edge und nur auf https oder localhost.
 *
 * Fremdcode (niimbluelib, qrcode-generator) wird erst beim Oeffnen geladen, fest gepinnt und
 * mit Pruefsumme (SRI) - der Rest des Dashboards braucht ihn nicht.
 */
import { $, esc, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { DRUCK_LIMIT, druckBloecke, druckVorschau } from '../lib/druckliste.mjs';
import { ETIKETT, etikett, etikettFuerPosition, etikettenAusPositionen, handleFuerPosition, layout, originalHandle } from '../lib/muster-etiketten.mjs';

const SKRIPTE = {
  niimbluelib: { src: 'https://cdn.jsdelivr.net/npm/@mmote/niimbluelib@0.47.1/dist/umd/niimbluelib.min.js', sri: 'sha384-8mcKExXVFyg+JWnhi+HIvqG1HDZoqxglFtztk3Kv5PIGmvcvwBiuF6+Ru4/4Re5T' },
  qrcode: { src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', sri: 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k' },
};
const geladen = {};
function ladeSkript(name) {
  if (!geladen[name]) {
    geladen[name] = new Promise((ok, fehler) => {
      const s = document.createElement('script');
      s.src = SKRIPTE[name].src; s.integrity = SKRIPTE[name].sri; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = () => { delete geladen[name]; fehler(new Error(`${name} konnte nicht geladen werden (Internet?)`)); };
      document.head.append(s);
    });
  }
  return geladen[name];
}

const SCHRIFT = 'Arial, Helvetica, sans-serif';
const druck = { client: null, etiketten: [], laeuft: false, speichert: false, bearbeiten: -1, allowEditing: true, abbruch: false };
const qrBereit = () => typeof window.qrcode === 'function';
const unvollstaendig = () => druck.etiketten.some(e => e.fehlt.length);

/** Zeichnet ein Etikett schwarz auf weiss in eine Canvas (400 x 400). */
function zeichne(canvas, e) {
  canvas.width = ETIKETT.breite; canvas.height = ETIKETT.hoehe;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  const font = (g, f) => `${f ? 'bold ' : ''}${g}px ${SCHRIFT}`;
  const { texte, linien, qr } = layout(e, (t, g, f) => { ctx.font = font(g, f); return ctx.measureText(t).width; });
  for (const t of texte) { ctx.font = font(t.groesse, t.fett); ctx.fillText(t.text, t.x, t.y); }
  for (const l of linien) ctx.fillRect(l.x1, l.y, l.x2 - l.x1, 2);
  if (qr && window.qrcode) {
    const q = window.qrcode(0, 'M'); q.addData(e.url); q.make();
    const n = q.getModuleCount();
    const modul = Math.floor(qr.groesse / n);
    const ab = qr.y + (qr.groesse - modul * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(qr.x + c * modul, ab + r * modul, modul, modul);
  }
}

const umgebungsHinweis = () => {
  if (!window.isSecureContext) return 'Drucken geht nur, wenn das Control Center über https:// oder localhost geöffnet ist.';
  if (!navigator.bluetooth && !navigator.serial) return 'Dieser Browser kann den Drucker nicht ansprechen – bitte Chrome oder Edge nehmen (Safari und Firefox können das nicht).';
  return '';
};

function vorschauHtml() {
  return druckVorschau(druck.etiketten).eintraege.map(({ index: i, anzahl }) => { const e = druck.etiketten[i]; return `<figure class="etk-karte">
    <canvas class="etk-bild" data-etk-bild="${i}" width="${ETIKETT.breite}" height="${ETIKETT.hoehe}" aria-label="${esc(`Etikett ${[e.serie, e.farbe].filter(Boolean).join(' ') || 'ohne Namen'}`)}"></canvas>
    <figcaption class="small"><strong data-etk-kopien="${anzahl}">${anzahl} ${anzahl === 1 ? 'Aufkleber' : 'Kopien'}</strong>${e.fehlt.length ? `<span class="etk-fehlt">fehlt: ${esc(e.fehlt.join(', '))}</span>` : '<span class="muted">vollständig</span>'}
      ${druck.allowEditing ? `<button type="button" class="btn btn-sm" data-etk-bearbeiten="${i}"${druck.laeuft || druck.speichert ? ' disabled' : ''}>Angaben bearbeiten</button>` : ''}
      <button type="button" class="btn btn-sm" data-etk-png="${i}"${e.fehlt.length || !qrBereit() || druck.laeuft || druck.speichert ? ' disabled' : ''}>Als PNG speichern</button>
    </figcaption>
  </figure>`; }).join('');
}

function zeichneVorschau() {
  const liste = $('#etkListe');
  if (!liste) return;
  liste.innerHTML = druck.etiketten.length ? vorschauHtml() : '<p class="small muted">Noch kein Etikett – unten Angaben eintragen und „Hinzufügen“.</p>';
  liste.querySelectorAll('[data-etk-bild]').forEach(c => zeichne(c, druck.etiketten[Number(c.dataset.etkBild)]));
  const zusammenfassung = $('#etkZusammenfassung'), vorschau = druckVorschau(druck.etiketten);
  if (zusammenfassung) zusammenfassung.textContent = `${druck.etiketten.length} Aufkleber insgesamt · ${vorschau.motive} verschiedene Motive.${vorschau.motive > DRUCK_LIMIT.vorschau ? ` Die Vorschau zeigt die ersten ${DRUCK_LIMIT.vorschau} Motive. Gedruckt werden alle Aufkleber.` : ''}`;
  for (const e of document.querySelectorAll('.etk-dialog [data-close-dialog], #etkWeg, #etkDichte')) e.disabled = druck.laeuft;
  const trennen = $('#etkTrennen'); if (trennen) trennen.textContent = druck.laeuft ? 'Druck abbrechen' : 'Verbindung trennen';
  const knopf = $('#etkDrucken');
  if (knopf) { knopf.disabled = !druck.etiketten.length || druck.laeuft || druck.speichert || unvollstaendig() || !qrBereit() || !!umgebungsHinweis(); knopf.textContent = druck.etiketten.length === 1 ? '1 Etikett drucken' : `${druck.etiketten.length} Etiketten drucken`; }
}

function status(t) { const s = $('#etkStatus'); if (s) s.textContent = t; }

async function verbinden(weg) {
  await ladeSkript('niimbluelib');
  const lib = window.niimbluelib;
  if (druck.client?.isConnected?.()) return druck.client;
  const client = weg === 'usb' ? new lib.NiimbotSerialClient() : new lib.NiimbotBluetoothClient();
  status('Verbinde mit dem Drucker …');
  await client.connect();
  // Der Systemdialog kann noch offen sein, wenn Druck oder Sitzung bereits beendet wurden.
  if (druck.abbruch) {
    try { await client.disconnect(); } catch { /* Verbindung bereits getrennt */ }
    throw new Error('Druck abgebrochen');
  }
  druck.client = client;
  client.on?.('disconnect', () => { druck.client = null; status('Drucker getrennt.'); });
  return client;
}

/** Die Verbindung bleibt fuer den ganzen Sammeldruck bestehen; Bilder entstehen erst bei Bedarf. */
async function drucken() {
  if (druck.laeuft || druck.speichert || !druck.etiketten.length || druck.etiketten.length > DRUCK_LIMIT.etiketten || unvollstaendig() || !qrBereit()) return;
  const etiketten = [...druck.etiketten];
  const weg = $('#etkWeg')?.value || 'bluetooth';
  const dichte = Math.min(ETIKETT.dichteMax, Math.max(ETIKETT.dichteMin, Number($('#etkDichte')?.value) || ETIKETT.dichteStandard));
  druck.laeuft = true; druck.abbruch = false; zeichneVorschau();
  let task = null;
  const pruefeAbbruch = () => { if (druck.abbruch) throw new Error('Druck abgebrochen'); };
  try {
    const client = await verbinden(weg);
    pruefeAbbruch();
    const lib = window.niimbluelib, meta = client.getModelMetadata?.();
    const art = client.getPrintTaskType?.() ?? 'B1', richtung = meta?.printDirection ?? 'top';
    const canvas = document.createElement('canvas');
    for (const block of druckBloecke(etiketten)) {
      pruefeAbbruch();
      task = client.protocol.newPrintTask(art, { totalPages: block.etiketten.length, density: dichte, labelType: 1 });
      await task.printInit();
      for (const [i, e] of block.etiketten.entries()) {
        pruefeAbbruch();
        status(`Drucke Aufkleber ${block.start + i + 1} von ${etiketten.length} …`);
        zeichne(canvas, e);
        await task.printPage(lib.ImageEncoder.encodeCanvas(canvas, 0, richtung), 1);
      }
      pruefeAbbruch();
      await task.waitForFinished();
      pruefeAbbruch();
      const beendet = await task.printEnd();
      if (art === 'B1' && beendet === false) throw new Error('Der Drucker hat den Abschluss des Druckteils noch nicht bestätigt');
      task = null;
    }
    status(`Fertig: ${etiketten.length} gedruckt. Bitte den Ausdruck prüfen.`);
    toast(etiketten.length === 1 ? '1 Aufkleber gedruckt' : `${etiketten.length} Aufkleber gedruckt`);
  } catch (err) {
    const auswahlAbbruch = /cancel|chosen|abgebrochen/i.test(String(err?.message));
    status(druck.abbruch ? 'Druck abgebrochen. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt.'
      : auswahlAbbruch ? 'Kein Drucker gewählt.'
        : `Druck unterbrochen: ${err?.message || err}. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt. Verbindung und Etikettenrolle prüfen und bei Bedarf den Auftrag wieder freigeben.`);
  } finally {
    try { await task?.printEnd(); } catch { /* Verbindung bereits getrennt */ }
    druck.laeuft = false; zeichneVorschau();
  }
}
async function trennen() {
  if (druck.laeuft) { druck.abbruch = true; status('Druck wird abgebrochen … Bereits ausgegebene Aufkleber prüfen.'); }
  try { await druck.client?.disconnect(); } catch { /* getrennt */ }
  druck.client = null;
  if (!druck.laeuft) status('Verbindung getrennt.');
}

const lexikonCache = new Map();
/** Lexikon-Eintrag des Originalprodukts (/api/lexikon/produkt, nur lesend) oder null. */
function lexikonProdukt(handle) {
  if (!handle) return Promise.resolve(null);
  if (!lexikonCache.has(handle)) {
    lexikonCache.set(handle, fetchEinkauf(`/api/lexikon/produkt?${new URLSearchParams({ handle })}`)
      .then(d => d?.produkt || null).catch(() => null)
      .then(p => { if (!p) lexikonCache.delete(handle); return p; }));
  }
  return lexikonCache.get(handle);
}

/** Etiketten fuer die Muster einer Bestellung - Serie, SKU und Technik aus dem Lexikon. */
export async function etikettenFuerBestellung(positionen = []) {
  const handles = [...new Set((positionen || []).filter(p => p?.istMuster).map(handleFuerPosition).filter(Boolean))];
  const produkte = new Map();
  await Promise.all(handles.map(async h => { const p = await lexikonProdukt(h); if (p) produkte.set(h, p); }));
  return etikettenAusPositionen(positionen, produkte);
}

/**
 * Oeffnet den Dialog. `etiketten` kommen aus einer Musterbestellung (etikettenAusPositionen)
 * oder sind leer - dann nur die Eingabe von Hand.
 */
export async function oeffneEtikettenDruck({ etiketten = [], titel = 'Etiketten drucken', allowEditing = true, hinweis = '' } = {}) {
  if (druck.laeuft || druck.speichert) { toast('Bitte warten, bis der aktuelle Vorgang fertig ist.'); return; }
  if (!Array.isArray(etiketten) || etiketten.length > DRUCK_LIMIT.etiketten) { toast(`Bitte höchstens ${DRUCK_LIMIT.etiketten} Aufkleber pro Drucklauf wählen.`); return; }
  druck.etiketten = [...etiketten];
  druck.bearbeiten = -1;
  druck.allowEditing = allowEditing;
  const umgebung = umgebungsHinweis();
  const hatUsb = !!navigator.serial;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog etk-dialog" role="dialog" aria-modal="true" aria-labelledby="etkTitel" data-dialog>
    <h2 id="etkTitel">${esc(titel)}</h2>
    <p class="small muted">Niimbot B1, Etikett 50 × 50 mm. Drucker einschalten, dann „Drucken“ – beim ersten Mal fragt der Browser, welcher Drucker.</p>
    ${umgebung ? `<p class="etk-warn">${esc(umgebung)}</p>` : ''}
    ${hinweis ? `<p class="etk-auftrag-hinweis">${esc(hinweis)}</p>` : ''}
    <p id="etkZusammenfassung" class="small"></p>
    <div id="etkListe" class="etk-liste"></div>
    ${allowEditing ? `<details class="etk-hand"${etiketten.length ? '' : ' open'}><summary>Etikett von Hand hinzufügen</summary>
      <form id="etkForm" class="etk-form">
        <label>Produktlink oder Handle <input name="handle" autocomplete="off" placeholder="https://www.teppich-paradies.net/products/…"></label>
        <label>Farbe <input name="farbe" autocomplete="off"></label>
        <p class="small muted">Mit Link holt das Control Center Serie, Artikelnummer und technische Daten aus dem Produktlexikon. Was du unten einträgst, gilt vor dem Lexikon.</p>
        <label>Serie <input name="serie" autocomplete="off"></label>
        <label>Artikelnummer <input name="sku" autocomplete="off"></label>
        <button type="submit" class="btn btn-sm" id="etkUebernehmen">Hinzufügen</button>
      </form>
    </details>` : ''}
    <div class="etk-optionen">
      <label>Druckdichte <select id="etkDichte">${[1, 2, 3, 4, 5].map(d => `<option value="${d}"${d === ETIKETT.dichteStandard ? ' selected' : ''}>${d}${d === ETIKETT.dichteStandard ? ' (Standard)' : ''}</option>`).join('')}</select></label>
      <label>Verbindung <select id="etkWeg"><option value="bluetooth">Bluetooth</option>${hatUsb ? '<option value="usb">USB-Kabel</option>' : ''}</select></label>
    </div>
    <p id="etkStatus" class="small" role="status" aria-live="polite"></p>
    <div class="actions">
      <button type="button" class="btn" data-close-dialog>Schließen</button>
      <button type="button" class="btn btn-ghost" id="etkTrennen">Verbindung trennen</button>
      <button type="button" class="btn btn-primary" id="etkDrucken">Drucken</button>
    </div>
  </div></div>`;
  $('#etkListe').addEventListener('click', ev => {
    const bearbeiten = ev.target.closest('[data-etk-bearbeiten]');
    if (bearbeiten && druck.allowEditing && !druck.laeuft && !druck.speichert) {
      druck.bearbeiten = Number(bearbeiten.dataset.etkBearbeiten);
      const e = druck.etiketten[druck.bearbeiten];
      const form = $('#etkForm');
      form.elements.handle.value = e.url;
      form.elements.farbe.value = e.farbe;
      form.elements.serie.value = e.serie;
      form.elements.sku.value = e.sku;
      form.closest('details').open = true;
      $('#etkUebernehmen').textContent = 'Angaben übernehmen';
      form.elements[e.url ? 'farbe' : 'handle'].focus();
    }
    const png = ev.target.closest('[data-etk-png]');
    if (png && !png.disabled) {
      const i = Number(png.dataset.etkPng), e = druck.etiketten[i];
      const link = document.createElement('a');
      const name = [e.serie, e.farbe, e.sku].filter(Boolean).join('-').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
      link.download = `etikett-${name || 'muster'}.png`;
      link.href = $(`[data-etk-bild="${i}"]`).toDataURL('image/png');
      link.click();
    }
  });
  $('#etkForm')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (druck.laeuft || druck.speichert || !druck.allowEditing) return;
    const form = ev.target;
    const d = new FormData(form);
    const wert = k => String(d.get(k) || '').trim();
    const roh = wert('handle');
    const handle = originalHandle((roh.match(/\/products\/([^/?#]+)/) || [])[1] || roh);
    if (druck.bearbeiten < 0 && druck.etiketten.length >= DRUCK_LIMIT.etiketten) { status(`Höchstens ${DRUCK_LIMIT.etiketten} Aufkleber pro Drucklauf.`); return; }
    if (!handle && !wert('serie')) { status('Bitte Produktlink oder Serie eintragen.'); return; }
    // Ziel vor dem Abruf festhalten: ein spaeterer Klick darf kein anderes Etikett ersetzen.
    const vorher = druck.etiketten[druck.bearbeiten];
    druck.speichert = true;
    for (const feld of form.elements) feld.disabled = true;
    zeichneVorschau();
    try {
      const produkt = handle ? await lexikonProdukt(handle) : null;
      if ($('#etkForm') !== form) return; // Dialog inzwischen geschlossen.
      if (handle && !produkt) status('Produkt nicht im Lexikon gefunden – nur die eingetragenen Angaben.');
      const ausLexikon = etikettFuerPosition({ istMuster: true, handle, farbe: wert('farbe'), musterQuelle: { sku: wert('sku') } }, produkt);
      const neu = etikett({
        serie: wert('serie') || ausLexikon.serie, farbe: wert('farbe') || ausLexikon.farbe,
        sku: wert('sku') || ausLexikon.sku, handle,
        technik: produkt ? ausLexikon.technik : (vorher?.url === ausLexikon.url ? vorher.technik : []),
      });
      if (vorher) druck.etiketten = druck.etiketten.map(e => e === vorher ? neu : e);
      else druck.etiketten.push(neu);
      druck.bearbeiten = -1;
      form.reset();
      $('#etkUebernehmen').textContent = 'Hinzufügen';
    } finally {
      druck.speichert = false;
      if ($('#etkForm') === form) {
        for (const feld of form.elements) feld.disabled = false;
        zeichneVorschau();
      }
    }
  });
  $('#etkDrucken').addEventListener('click', () => { if (!umgebungsHinweis()) drucken(); });
  $('#etkTrennen').addEventListener('click', () => { void trennen(); });
  zeichneVorschau();
  ($('#etkDrucken').disabled ? ($('#etkForm input') || $('.etk-dialog [data-close-dialog]')) : $('#etkDrucken'))?.focus({ preventScroll: true });
  // QR-Code nachzeichnen, sobald die Bibliothek da ist; ohne Internet bleibt die Vorschau ohne QR.
  try { await ladeSkript('qrcode'); zeichneVorschau(); } catch (err) { status(`${err.message} – zum Drucken mit QR-Code den Dialog erneut öffnen.`); }
}

// Ein laufender Druck darf nicht unsichtbar im Hintergrund weitergehen.
if (typeof document !== 'undefined') {
  document.addEventListener('click', ev => {
    if (!druck.laeuft || !document.querySelector('.etk-dialog')) return;
    const ziel = ev.target.closest('[data-close-dialog]');
    if (ziel && (ziel === ev.target || !ev.target.closest('.dialog'))) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      toast('Der Druck läuft. Zum Anhalten „Druck abbrechen“ wählen.');
    }
  }, true);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && druck.laeuft && document.querySelector('.etk-dialog')) {
      ev.preventDefault(); ev.stopImmediatePropagation(); void trennen();
    }
  }, true);
  window.addEventListener('tp-sitzung-beendet', () => {
    if (druck.laeuft) void trennen();
    druck.etiketten = [];
    if (document.querySelector('.etk-dialog')) $('#dialogRoot').innerHTML = '';
  });
}
