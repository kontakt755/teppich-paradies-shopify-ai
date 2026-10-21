/**
 * "Etiketten drucken": Vorschau und Druck von Muster-Etiketten auf dem Niimbot B1 (50 x 50 oder 50 x 100 mm)
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
import { ETIKETT, ETIKETT_FORMATE, etikettFormat, etikett, etikettFuerPosition, etikettenAusPositionen, handleFuerPosition, layout, originalHandle } from '../lib/muster-etiketten.mjs';

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
// Gewaehlte Etikettengroesse je Rechner merken (passt zur eingelegten Rolle); ohne Speicher 50 x 50.
const FORMAT_SCHLUESSEL = 'tp-etikett-format';
function gemerktesFormat() { try { return etikettFormat(localStorage.getItem(FORMAT_SCHLUESSEL)).format; } catch { return ETIKETT.format; } }
function formatMerken(name) { try { localStorage.setItem(FORMAT_SCHLUESSEL, name); } catch { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ } }

const druck = { format: gemerktesFormat(), client: null, clientWeg: '', verbindung: null, trennt: false, etiketten: [], laeuft: false, speichert: false, bearbeiten: -1, allowEditing: true, abbruch: false, kontext: null };
let sitzung = 0;
const aktuell = k => !!k && druck.kontext === k && !k.beendet && k.sitzung === sitzung && k.element?.isConnected;
const qrBereit = () => typeof window.qrcode === 'function';
const unvollstaendig = () => druck.etiketten.some(e => e.fehlt.length);

/** Zeichnet ein Etikett schwarz auf weiss in eine Canvas (400 x 400 bzw. 400 x 800). */
function zeichne(canvas, e) {
  const format = etikettFormat(druck.format);
  canvas.width = format.breite; canvas.height = format.hoehe;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  const font = (g, f) => `${f ? 'bold ' : ''}${g}px ${SCHRIFT}`;
  const { texte, linien, qr } = layout(e, (t, g, f) => { ctx.font = font(g, f); return ctx.measureText(t).width; }, format);
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
  if (!window.isSecureContext) return 'Drucker verbinden geht nur über eine sichere Adresse. Bitte die Teppich-Dashboard-App neu öffnen oder das Dashboard über HTTPS bzw. localhost aufrufen.';
  if (!navigator.bluetooth && !navigator.serial) return 'Dieser Browser kann den Drucker nicht ansprechen – bitte Chrome oder Edge nehmen (Safari und Firefox können das nicht).';
  return '';
};

function vorschauHtml() {
  return druckVorschau(druck.etiketten).eintraege.map(({ index: i, anzahl }) => { const e = druck.etiketten[i]; return `<figure class="etk-karte">
    <canvas class="etk-bild" data-etk-bild="${i}" width="${etikettFormat(druck.format).breite}" height="${etikettFormat(druck.format).hoehe}" aria-label="${esc(`Etikett ${[e.serie, e.farbe].filter(Boolean).join(' ') || 'ohne Namen'}`)}"></canvas>
    <figcaption class="small"><strong data-etk-kopien="${anzahl}">${anzahl} ${anzahl === 1 ? 'Aufkleber' : 'Kopien'}</strong>${e.fehlt.length ? `<span class="etk-fehlt">fehlt: ${esc(e.fehlt.join(', '))}</span>` : '<span class="muted">vollständig</span>'}
      ${druck.allowEditing ? `<button type="button" class="btn btn-sm" data-etk-bearbeiten="${i}"${druck.laeuft || druck.speichert ? ' disabled' : ''}>Angaben bearbeiten</button>` : ''}
      <button type="button" class="btn btn-sm" data-etk-png="${i}"${e.fehlt.length || !qrBereit() || druck.laeuft || druck.speichert ? ' disabled' : ''}>Als PNG speichern</button>
    </figcaption>
  </figure>`; }).join('');
}

function zeichneVorschau() {
  const k = druck.kontext;
  if (!aktuell(k)) return;
  const liste = $('#etkListe');
  if (!liste) return;
  liste.innerHTML = druck.etiketten.length ? vorschauHtml() : '<p class="small muted">Noch kein Etikett – unten Angaben eintragen und „Hinzufügen“.</p>';
  liste.querySelectorAll('[data-etk-bild]').forEach(c => zeichne(c, druck.etiketten[Number(c.dataset.etkBild)]));
  const zusammenfassung = $('#etkZusammenfassung'), vorschau = druckVorschau(druck.etiketten);
  if (zusammenfassung) zusammenfassung.textContent = `${druck.etiketten.length} Aufkleber insgesamt · ${vorschau.motive} verschiedene Motive.${vorschau.motive > DRUCK_LIMIT.vorschau ? ` Die Vorschau zeigt die ersten ${DRUCK_LIMIT.vorschau} Motive. Gedruckt werden alle Aufkleber.` : ''}`;
  const beschaeftigt = druck.laeuft || k.schliesst || k.bestaetigt;
  const verbunden = !!druck.client?.isConnected?.();
  const verbindungOffen = !!druck.verbindung;
  const wartet = $('#etkVerbindungWartet'); if (wartet) wartet.hidden = !verbindungOffen || k.verbindet || druck.laeuft;
  for (const e of document.querySelectorAll('.etk-dialog [data-close-dialog], #etkDichte, #etkFormat')) e.disabled = beschaeftigt;
  const weg = $('#etkWeg'); if (weg) weg.disabled = beschaeftigt || k.verbindet || verbindungOffen || druck.trennt || verbunden;
  const verbindenKnopf = $('#etkVerbinden');
  if (verbindenKnopf) { verbindenKnopf.textContent = verbunden ? 'Drucker verbunden' : k.verbindet ? 'Verbinde …' : 'Drucker verbinden'; verbindenKnopf.disabled = verbunden || k.verbindet || verbindungOffen || druck.trennt || beschaeftigt || !!umgebungsHinweis(); }
  const trennen = $('#etkTrennen');
  if (trennen) { trennen.textContent = druck.laeuft ? 'Druck abbrechen' : 'Verbindung trennen'; trennen.hidden = !druck.laeuft && !druck.client?.isConnected?.(); trennen.disabled = druck.trennt || k.schliesst || k.bestaetigt; }
  const knopf = $('#etkDrucken');
  if (knopf) { knopf.hidden = !!k.beiBestaetigen && k.transportFertig; knopf.disabled = !druck.etiketten.length || beschaeftigt || k.verbindet || verbindungOffen || druck.trennt || druck.speichert || unvollstaendig() || !qrBereit() || !!umgebungsHinweis(); knopf.textContent = `Jetzt ${druck.etiketten.length} Aufkleber drucken`; }
  const bestaetigung = $('#etkBestaetigung');
  if (bestaetigung) bestaetigung.hidden = !k.transportFertig;
  const bestaetigen = $('#etkBestaetigen'); if (bestaetigen) bestaetigen.disabled = beschaeftigt;
}

function status(t, k = druck.kontext) { if (!aktuell(k)) return; const s = k.element.querySelector('#etkStatus'); if (s) s.textContent = t; }

async function verbinden(weg, k, pruefeAbbruch) {
  if (druck.verbindung || druck.trennt) throw new Error('Bitte die vorherige Geräteauswahl schließen und das Trennen abwarten.');
  // Die Sperre umfasst auch einen verlassenen Systemdialog und dessen gesamten
  // Disconnect. Ein spaeter Cleanup darf keine neue Verbindung desselben Geraets stoeren.
  const vorgang = {};
  druck.verbindung = vorgang;
  try {
    await ladeSkript('niimbluelib');
    pruefeAbbruch();
    const lib = window.niimbluelib;
    if (druck.client?.isConnected?.()) {
      if (druck.clientWeg !== weg) throw new Error('Zum Wechseln zwischen Bluetooth und USB bitte zuerst die Verbindung trennen.');
      return druck.client;
    }
    const client = weg === 'usb' ? new lib.NiimbotSerialClient() : new lib.NiimbotBluetoothClient();
    status('Verbinde mit dem Drucker …', k);
    try {
      await client.connect();
      // Der Systemdialog kann noch offen sein, wenn Vorgang oder Sitzung bereits
      // beendet wurden. Nur die Generation dieses Aufrufs darf den Client behalten.
      pruefeAbbruch();
      if (!client.isConnected?.()) throw new Error('Der Drucker hat die Verbindung noch nicht bestätigt.');
    } catch (err) {
      try { await client.disconnect(); } catch { /* Verbindung bereits getrennt */ }
      throw err;
    }
    druck.client = client; druck.clientWeg = weg;
    client.on?.('disconnect', () => {
      if (druck.client !== client) return;
      druck.client = null; druck.clientWeg = '';
      const offen = druck.kontext;
      if (aktuell(offen)) { status('Drucker getrennt.', offen); zeichneVorschau(); }
    });
    return client;
  } finally {
    if (druck.verbindung === vorgang) druck.verbindung = null;
    zeichneVorschau();
  }
}

/** Verbindung pruefen, ohne einen Druckauftrag anzulegen oder dessen Status zu aendern. */
async function druckerVerbinden(k) {
  if (!aktuell(k) || k.verbindet || druck.verbindung || druck.trennt || k.schliesst || k.bestaetigt || druck.laeuft || umgebungsHinweis()) return;
  if (druck.client?.isConnected?.()) return;
  const generation = ++k.verbindungsNr;
  const pruefeAbbruch = () => { if (!aktuell(k) || k.verbindungsNr !== generation) throw new Error('Verbindung abgebrochen'); };
  k.verbindet = true; zeichneVorschau();
  try {
    await verbinden($('#etkWeg')?.value || 'bluetooth', k, pruefeAbbruch);
    pruefeAbbruch();
    status('Drucker verbunden. Es wurde nichts gedruckt.', k);
  } catch (err) {
    if (!aktuell(k) || k.verbindungsNr !== generation) return;
    status(/cancel|chosen|abgebrochen/i.test(String(err?.message))
      ? 'Kein Drucker gewählt. Es wurde nichts gedruckt. Du kannst erneut verbinden.'
      : `Drucker nicht verbunden: ${err?.message || err}. Es wurde nichts gedruckt. Bitte erneut verbinden.`, k);
  } finally {
    if (aktuell(k) && k.verbindungsNr === generation) { k.verbindet = false; zeichneVorschau(); }
  }
}

function verbindungswahlBeenden(k) {
  if (!k?.verbindet) return;
  k.verbindungsNr++; k.verbindet = false;
}

/** Die Verbindung bleibt fuer den ganzen Sammeldruck bestehen; Bilder entstehen erst bei Bedarf. */
async function drucken() {
  const k = druck.kontext;
  if (!aktuell(k) || druck.laeuft || k.verbindet || druck.verbindung || druck.trennt || druck.speichert || k.schliesst || k.bestaetigt || (k.beiBestaetigen && k.transportFertig) || !druck.etiketten.length || druck.etiketten.length > DRUCK_LIMIT.etiketten || unvollstaendig() || !qrBereit()) return;
  const etiketten = [...druck.etiketten];
  const weg = $('#etkWeg')?.value || 'bluetooth';
  const dichte = Math.min(ETIKETT.dichteMax, Math.max(ETIKETT.dichteMin, Number($('#etkDichte')?.value) || ETIKETT.dichteStandard));
  druck.laeuft = true; druck.abbruch = false; k.transportFertig = false;
  // Schon der ausdrueckliche Klick zaehlt: bei Abbruch des Systemdialogs bleibt
  // der Auftrag vorsichtshalber reserviert und kann nicht unbemerkt doppelt laufen.
  k.versucht = true;
  let task = null;
  const pruefeAbbruch = () => { if (!aktuell(k) || druck.abbruch) throw new Error('Druck abgebrochen'); };
  try {
    k.druckVersucht?.();
    zeichneVorschau();
    const client = await verbinden(weg, k, pruefeAbbruch);
    pruefeAbbruch();
    // Ein Kollege kann die Reservierung waehrend der Druckerauswahl geaendert
    // haben. Vor dem ersten Druckbefehl nochmals den gemeinsamen Stand pruefen.
    if (await k.vorDruck?.() === false) throw new Error('Der Druckauftrag konnte nicht geprüft werden. Bitte die Druckliste neu laden.');
    pruefeAbbruch();
    const lib = window.niimbluelib, meta = client.getModelMetadata?.();
    const art = client.getPrintTaskType?.() ?? 'B1', richtung = meta?.printDirection ?? 'top';
    const canvas = document.createElement('canvas');
    for (const block of druckBloecke(etiketten)) {
      pruefeAbbruch();
      task = client.protocol.newPrintTask(art, { totalPages: block.etiketten.length, density: dichte, labelType: 1 });
      await task.printInit();
      pruefeAbbruch();
      for (const [i, e] of block.etiketten.entries()) {
        pruefeAbbruch();
        status(`Drucke Aufkleber ${block.start + i + 1} von ${etiketten.length} …`, k);
        zeichne(canvas, e);
        await task.printPage(lib.ImageEncoder.encodeCanvas(canvas, 0, richtung), 1);
        pruefeAbbruch();
      }
      pruefeAbbruch();
      await task.waitForFinished();
      pruefeAbbruch();
      const beendet = await task.printEnd();
      pruefeAbbruch();
      if (art === 'B1' && beendet === false) throw new Error('Der Drucker hat den Abschluss des Druckteils noch nicht bestätigt');
      task = null;
    }
    k.transportFertig = true;
    status(`Der Drucklauf ist fertig. Bitte die ${etiketten.length} Aufkleber an der Rolle prüfen.`, k);
    toast(etiketten.length === 1 ? '1 Aufkleber gedruckt' : `${etiketten.length} Aufkleber gedruckt`);
  } catch (err) {
    if (!aktuell(k)) return;
    const auswahlAbbruch = /cancel|chosen|abgebrochen/i.test(String(err?.message));
    status(druck.abbruch ? 'Druck abgebrochen. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt.'
      : auswahlAbbruch ? 'Kein Drucker gewählt.'
        : `Druck unterbrochen: ${err?.message || err}. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt. Verbindung und Etikettenrolle prüfen und bei Bedarf den Auftrag wieder freigeben.`, k);
  } finally {
    try { await task?.printEnd(); } catch { /* Verbindung bereits getrennt */ }
    if (druck.kontext === k) { druck.laeuft = false; zeichneVorschau(); if (k.transportFertig) $('#etkBestaetigen')?.focus({ preventScroll: true }); }
  }
}
async function trennen() {
  if (druck.trennt) return;
  const k = druck.kontext, client = druck.client;
  verbindungswahlBeenden(k);
  const generation = k ? ++k.verbindungsNr : 0;
  // Auch ein neu geoeffneter Dialog wartet auf den alten Disconnect. Sonst
  // koennte dessen spaete Antwort die gerade neu hergestellte Verbindung stoeren.
  druck.trennt = true;
  if (druck.laeuft) { druck.abbruch = true; status('Druck wird abgebrochen … Bereits ausgegebene Aufkleber prüfen.', k); }
  else status('Verbindung wird getrennt …', k);
  druck.client = null; druck.clientWeg = '';
  zeichneVorschau();
  try { await client?.disconnect(); } catch { /* getrennt */ }
  druck.trennt = false;
  if (aktuell(k) && k.verbindungsNr === generation && !druck.laeuft) status('Verbindung getrennt.', k);
  zeichneVorschau();
}

function beendeDialog(k) {
  if (druck.kontext !== k) return;
  verbindungswahlBeenden(k);
  k.beendet = true; k.beobachter?.disconnect();
  if (k.element?.isConnected) k.element.remove();
  druck.kontext = null; druck.etiketten = []; druck.speichert = false;
}

async function schliessen(k) {
  if (!aktuell(k) || k.schliesst || k.bestaetigt) return false;
  if (druck.laeuft) { toast('Der Druck läuft. Zum Anhalten „Druck abbrechen“ wählen.'); return false; }
  verbindungswahlBeenden(k);
  k.schliesst = true; zeichneVorschau();
  try {
    if (await k.beiSchliessen?.({ versucht: k.versucht }) === false) throw new Error('Die Druckvorschau konnte noch nicht geschlossen werden. Bitte erneut versuchen.');
    if (!aktuell(k)) return false;
    beendeDialog(k);
    return true;
  } catch (err) {
    status(err?.message || String(err), k);
    return false;
  } finally { k.schliesst = false; if (aktuell(k)) zeichneVorschau(); }
}

async function bestaetigen(k) {
  if (!aktuell(k) || !k.transportFertig || !k.beiBestaetigen || k.bestaetigt || k.schliesst || druck.laeuft) return;
  k.bestaetigt = true; zeichneVorschau();
  try {
    if (await k.beiBestaetigen() === false) throw new Error('Der Ausdruck wurde noch nicht als gedruckt markiert. Bitte erneut versuchen.');
    if (aktuell(k)) beendeDialog(k);
  } catch (err) { status(err?.message || String(err), k); }
  finally { k.bestaetigt = false; if (aktuell(k)) zeichneVorschau(); }
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
 * Die optionale Druckliste prueft vorDruck nach der Druckerauswahl erneut. Schon
 * der finale Klick meldet druckVersucht synchron; beiSchliessen bekommt diesen
 * monotonen Stand. Nur die Papierfrage ruft beiBestaetigen auf. false/Fehler
 * lassen den Dialog offen, damit ein Mitarbeiter die Aktion wiederholen kann.
 */
export async function oeffneEtikettenDruck({ etiketten = [], titel = 'Druckvorschau', allowEditing = true, hinweis = '', vorDruck, druckVersucht, beiSchliessen, beiBestaetigen, schonVersucht = false } = {}) {
  if (druck.laeuft || druck.speichert) { toast('Bitte warten, bis der aktuelle Vorgang fertig ist.'); return; }
  if (!Array.isArray(etiketten) || etiketten.length > DRUCK_LIMIT.etiketten) { toast(`Bitte höchstens ${DRUCK_LIMIT.etiketten} Aufkleber pro Drucklauf wählen.`); return; }
  // Ein anderer Aufruf darf den alten Auftrag nicht ohne dessen Freigabe ersetzen.
  if (aktuell(druck.kontext) && !await schliessen(druck.kontext)) return;
  const k = { sitzung, element: null, vorDruck, druckVersucht, beiSchliessen, beiBestaetigen, versucht: !!schonVersucht, transportFertig: false, schliesst: false, bestaetigt: false, beendet: false, verbindet: false, verbindungsNr: 0 };
  druck.kontext = k;
  druck.etiketten = [...etiketten];
  druck.bearbeiten = -1;
  druck.allowEditing = allowEditing;
  const umgebung = umgebungsHinweis();
  const hatUsb = !!navigator.serial;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog etk-dialog" role="dialog" aria-modal="true" aria-labelledby="etkTitel" data-dialog>
    <h2 id="etkTitel">${esc(titel)}</h2>
    <p class="small muted">Niimbot B1. Zuerst die passende Rolle einlegen und unten die Größe wählen, dann Drucker einschalten und „Drucker verbinden“. Erst „Jetzt drucken“ startet den Druck.</p>
    <label class="etk-format small">Etikettengröße <select id="etkFormat">${Object.values(ETIKETT_FORMATE).map(f => `<option value="${f.format}"${f.format === druck.format ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
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
    <details class="etk-einstellungen"><summary>Drucker-Einstellungen</summary><div class="etk-optionen">
      <label>Druckdichte <select id="etkDichte">${[1, 2, 3, 4, 5].map(d => `<option value="${d}"${d === ETIKETT.dichteStandard ? ' selected' : ''}>${d}${d === ETIKETT.dichteStandard ? ' (Standard)' : ''}</option>`).join('')}</select></label>
      <label>Verbindung <select id="etkWeg"><option value="bluetooth"${!navigator.bluetooth && hatUsb ? ' disabled' : ''}>Bluetooth</option>${hatUsb ? `<option value="usb"${!navigator.bluetooth ? ' selected' : ''}>USB-Kabel</option>` : ''}</select></label>
    </div></details>
    <p id="etkVerbindungWartet" class="small muted" role="status" hidden>Vorherige Geräteauswahl schließen und das Trennen abwarten. Danach kannst du erneut verbinden.</p>
    <p id="etkStatus" class="small" role="status" aria-live="polite"></p>
    ${beiBestaetigen ? `<div id="etkBestaetigung" class="etk-bestaetigung" hidden>
      <p><strong>Sind alle ${etiketten.length} Aufkleber vollständig und lesbar?</strong></p>
      <button type="button" class="btn btn-primary" id="etkBestaetigen">Ja, als gedruckt markieren</button>
    </div>` : ''}
    <div class="actions">
      <button type="button" class="btn" data-close-dialog>Schließen</button>
      <button type="button" class="btn" id="etkVerbinden">Drucker verbinden</button>
      <button type="button" class="btn btn-ghost" id="etkTrennen">Verbindung trennen</button>
      <button type="button" class="btn btn-primary" id="etkDrucken">Drucken</button>
    </div>
  </div></div>`;
  k.element = $('.etk-dialog')?.closest('.dialog-backdrop');
  // Einige allgemeine Dialoge ersetzen dialogRoot direkt. Den alten Kontext
  // sofort sperren; seine asynchronen Antworten duerfen den Nachfolger nie aendern.
  k.beobachter = new MutationObserver(() => {
    if (k.element?.isConnected || k.beendet) return;
    verbindungswahlBeenden(k);
    k.beendet = true; k.beobachter.disconnect();
    if (druck.kontext === k) {
      if (druck.laeuft) void trennen();
      druck.kontext = null; druck.etiketten = []; druck.speichert = false; druck.laeuft = false;
    }
    if (k.sitzung === sitzung && !k.schliesst && !k.bestaetigt) {
      Promise.resolve().then(() => k.beiSchliessen?.({ versucht: k.versucht })).then(ok => {
        if (ok === false) throw new Error('Die Druckliste bitte prüfen: Die Vorschau wurde geschlossen, die Freigabe aber nicht bestätigt.');
      }).catch(err => { if (k.sitzung === sitzung) toast(err?.message || String(err), 'crit'); });
    }
  });
  k.beobachter.observe($('#dialogRoot'), { childList: true });
  $('#etkFormat')?.addEventListener('change', ev => {
    if (!aktuell(k) || druck.laeuft) return;
    druck.format = etikettFormat(ev.target.value).format;
    formatMerken(druck.format);
    zeichneVorschau();
  });
  $('#etkListe').addEventListener('click', ev => {
    if (!aktuell(k)) return;
    const bearbeiten = ev.target.closest('[data-etk-bearbeiten]');
    if (bearbeiten && druck.allowEditing && !druck.laeuft && !druck.speichert && !k.schliesst && !k.bestaetigt) {
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
    if (!aktuell(k) || druck.laeuft || druck.speichert || k.schliesst || k.bestaetigt || !druck.allowEditing) return;
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
      if (!aktuell(k) || $('#etkForm') !== form) return; // Dialog inzwischen geschlossen.
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
      if (druck.kontext === k) druck.speichert = false;
      if (aktuell(k) && $('#etkForm') === form) {
        for (const feld of form.elements) feld.disabled = false;
        zeichneVorschau();
      }
    }
  });
  $('#etkDrucken').addEventListener('click', () => { if (aktuell(k) && !umgebungsHinweis()) void drucken(); });
  $('#etkVerbinden').addEventListener('click', () => { void druckerVerbinden(k); });
  $('#etkTrennen').addEventListener('click', () => { void trennen(); });
  $('#etkBestaetigen')?.addEventListener('click', () => { void bestaetigen(k); });
  if (druck.client?.isConnected?.()) { $('#etkWeg').value = druck.clientWeg; status('Drucker verbunden.', k); }
  zeichneVorschau();
  const fokus = !$('#etkVerbinden').disabled ? $('#etkVerbinden') : $('#etkDrucken').disabled ? ($('#etkForm input') || $('.etk-dialog [data-close-dialog]')) : $('#etkDrucken');
  fokus?.focus({ preventScroll: true });
  // QR-Code nachzeichnen, sobald die Bibliothek da ist; ohne Internet bleibt die Vorschau ohne QR.
  try { await ladeSkript('qrcode'); if (aktuell(k)) zeichneVorschau(); } catch (err) { status(`${err.message} – zum Drucken mit QR-Code den Dialog erneut öffnen.`, k); }
}

// Ein laufender Druck darf nicht unsichtbar im Hintergrund weitergehen.
if (typeof document !== 'undefined') {
  document.addEventListener('click', ev => {
    const k = druck.kontext;
    if (!aktuell(k)) return;
    const ziel = ev.target.closest('[data-close-dialog]');
    if (ziel && k.element.contains(ziel) && (ziel === ev.target || !ev.target.closest('.dialog'))) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      void schliessen(k);
    }
  }, true);
  document.addEventListener('keydown', ev => {
    const k = druck.kontext;
    if (ev.key === 'Escape' && aktuell(k)) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (druck.laeuft) void trennen(); else void schliessen(k);
    }
  }, true);
  window.addEventListener('tp-sitzung-beendet', () => {
    sitzung++;
    druck.abbruch = true;
    void trennen();
    const k = druck.kontext;
    if (k) beendeDialog(k);
    druck.laeuft = false;
  });
}
