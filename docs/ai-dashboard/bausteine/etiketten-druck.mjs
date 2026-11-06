/**
 * "Etiketten drucken": Vorschau und Druck von Muster-Etiketten (und Adressaufklebern aus "Muster packen")
 * auf dem Niimbot B1 (50 x 50, 50 x 80 oder 50 x 100 mm)
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
import { DRUCK_LIMIT, auswahlSignatur, druckBloecke, druckVorschau, fertigeSeiten, motivSchluessel, setzeMotivAnzahl, weiterAbFuer, weiterAbSchaetzen } from '../lib/druckliste.mjs';
import { ETIKETT, ETIKETT_FORMATE, FREIE_FORMATE, etikettFormat, etikett, etikettFuerPosition, etikettenAusPositionen, handleFuerPosition, layout, originalHandle, schwarzWeiss } from '../lib/muster-etiketten.mjs';
import { adressLayout } from '../lib/adress-etiketten.mjs';
import { etikettenAusLexikon } from '../lib/lexikon-etiketten.mjs';
import { EIGEN_BREITE, EIGEN_LAENGE, FORMAT_EIGEN, FREI_MAX_ANZAHL, FREI_MAX_ZEICHEN, FREI_SCHRIFT_MM, eigeneGroesseFehler, eigenesFormat, freiLayout, freiStil, freieEtiketten, freieZeilen, produktEntwurf, zeilenSchluessel, versatzGrenze } from '../lib/freie-etiketten.mjs';

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
function gemerktesFormat() { try { return ETIKETT_FORMATE[localStorage.getItem(FORMAT_SCHLUESSEL)]?.format || ETIKETT.format; } catch { return ETIKETT.format; } }
// Eigene Aufkleber merken ihre Groesse getrennt: die schmale Rolle darf nie in den Musterdruck geraten.
const FORMAT_FREI_SCHLUESSEL = 'tp-etikett-format-frei';
function gemerktesFreiFormat() { try { const f = localStorage.getItem(FORMAT_FREI_SCHLUESSEL); return f === FORMAT_EIGEN ? f : FREIE_FORMATE[f]?.format || '50x20'; } catch { return '50x20'; } }
function formatMerken(name, frei) { try { localStorage.setItem(frei ? FORMAT_FREI_SCHLUESSEL : FORMAT_SCHLUESSEL, name); } catch { /* ohne Speicher gilt die Wahl nur bis zum Neuladen */ } }
// Die eigene Groesse in mm, ebenfalls nur fuer eigene Aufkleber. Gemerkt wird nur, was gueltig ist.
const EIGEN_SCHLUESSEL = 'tp-etikett-eigene-groesse';
const EIGEN_START = Object.freeze({ breite: '50', laenge: '30' });
function gemerkteEigeneGroesse() {
  try {
    const v = JSON.parse(localStorage.getItem(EIGEN_SCHLUESSEL) || 'null');
    return v && eigenesFormat(v.breite, v.laenge) ? { breite: String(v.breite), laenge: String(v.laenge) } : EIGEN_START;
  } catch { return EIGEN_START; }
}
function eigeneGroesseMerken(g) { try { localStorage.setItem(EIGEN_SCHLUESSEL, JSON.stringify(g)); } catch { /* ohne Speicher gilt die Groesse nur bis zum Neuladen */ } }
const formatStand = { muster: gemerktesFormat(), frei: gemerktesFreiFormat(), eigen: gemerkteEigeneGroesse() };

// Druckversatz je Rechner (Foto Inhaber 26.10.: Druck sass rechts und oben nicht mittig). Gegensteuern bis
// 3 mm in jede Richtung; bei 4 mm Etikettrand bleibt auch verschoben alles auf dem Bild. 8 px = 1 mm (203 dpi).
const VERSATZ_SCHLUESSEL = 'tp-etikett-versatz';
const VERSATZ_MM = Array.from({ length: 13 }, (_, i) => (i - 6) / 2);
const versatzWert = v => (VERSATZ_MM.includes(Number(v)) ? Number(v) : 0);
function gemerkterVersatz() { try { const v = JSON.parse(localStorage.getItem(VERSATZ_SCHLUESSEL) || '{}'); return { x: versatzWert(v?.x), y: versatzWert(v?.y) }; } catch { return { x: 0, y: 0 }; } }
function versatzMerken(v) { try { localStorage.setItem(VERSATZ_SCHLUESSEL, JSON.stringify(v)); } catch { /* ohne Speicher gilt der Versatz nur bis zum Neuladen */ } }
// Festes Leerzeichen: <summary> ist ein Flex-Container und verschluckt ein fuehrendes normales Leerzeichen.
const versatzHinweis = () => (druck.versatz.x || druck.versatz.y ? '\u00a0· Versatz eingestellt' : '');
const versatzOptionen = (wert, minus, plus) => VERSATZ_MM.map(v => `<option value="${v}"${v === wert ? ' selected' : ''}>${v === 0 ? 'keiner (Standard)' : `${String(Math.abs(v)).replace('.', ',')} mm ${v < 0 ? minus : plus}`}</option>`).join('');

const druck = { format: formatStand.muster, frei: false, stil: freiStil(), eigenFormat: eigenesFormat(formatStand.eigen.breite, formatStand.eigen.laenge), eigenFehler: '', zeilenSchrift: {}, freiUrl: '', produktEtiketten: [], versatz: gemerkterVersatz(), client: null, clientWeg: '', verbindung: null, trennt: false, etiketten: [], laeuft: false, speichert: false, bearbeiten: -1, abgewaehlt: new Set(), weiter: null, allowEditing: true, abbruch: false, kontext: null };
let sitzung = 0;
const aktuell = k => !!k && druck.kontext === k && !k.beendet && k.sitzung === sitzung && k.element?.isConnected;
const qrBereit = () => typeof window.qrcode === 'function';
// Nur der Dialog fuer eigene Aufkleber kennt die eigene Groesse. Steht dort gerade etwas Ungueltiges, rechnet das
// Layout mit der letzten gueltigen Groesse weiter, gezeigt und gedruckt wird aber nichts (groesseFehler).
const eigeneGroesseAktiv = () => druck.frei && druck.format === FORMAT_EIGEN;
const aktuellesFormat = () => (eigeneGroesseAktiv() ? druck.eigenFormat : etikettFormat(druck.format));
const groesseFehler = () => (eigeneGroesseAktiv() ? druck.eigenFehler : '');
// Kleine Raender vertragen nicht jeden Druckversatz; bei eigenen Aufklebern lieber melden als still abschneiden.
function versatzFehler() {
  if (!druck.frei) return '';
  const grenze = versatzGrenze(aktuellesFormat());
  const zuViel = Math.abs(druck.versatz.x) > grenze.x ? grenze.x : Math.abs(druck.versatz.y) > grenze.y ? grenze.y : null;
  return zuViel === null ? '' : `Der Versatz in den Drucker-Einstellungen ist für diese Größe zu groß, höchstens ${String(zuViel).replace('.', ',')} mm. So wird nichts gedruckt.`;
}
const formatFehler = () => groesseFehler() || versatzFehler();

const font = (g, f) => `${f ? 'bold ' : ''}${g}px ${SCHRIFT}`;
let messKontext = null;
const layoutCache = new Map();
/**
 * Layout eines Etiketts im gewaehlten Format. Gleiche Aufkleber (auch als eigene Objekte aus der
 * Druckliste) werden nur einmal berechnet. Adressaufkleber (Muster packen) haben ein eigenes Layout,
 * gezeichnet wird gleich.
 */
function etikettLayout(e) {
  const format = aktuellesFormat();
  const stil = e.art === 'frei' ? druck.stil : null;
  // Eigene Groesse und Einstellungen gehoeren in den Schluessel: sonst zeigt die Vorschau den alten Stand.
  const key = JSON.stringify([format.format, format.breite, format.hoehe, format.rand, stil, e.art || '', e.serie, e.farbe, e.sku, e.url, e.technik, e.empfaenger || null, e.zeilen || null, e.schriften || null]);
  if (!layoutCache.has(key)) {
    if (layoutCache.size > 2000) layoutCache.clear();
    messKontext ||= document.createElement('canvas').getContext('2d');
    const mass = (t, g, f) => { messKontext.font = font(g, f); return messKontext.measureText(t).width; };
    layoutCache.set(key, e.art === 'frei' ? freiLayout(e, mass, format, stil) : (e.art === 'adresse' ? adressLayout : layout)(e, mass, format));
  }
  return layoutCache.get(key);
}
/** Was dem Etikett fehlt - auch, dass es im gewaehlten Format nicht ohne Ueberlappen passt. */
const maengel = e => [...e.fehlt, ...(formatFehler() ? [formatFehler()] : []), ...(etikettLayout(e).passt ? [] : [`passt nicht auf ${aktuellesFormat().name}`])];
// Abgewaehlte Motive (alle Kopien) bleiben in der Liste, werden aber nicht gedruckt.
const auswahlGesamt = () => druck.etiketten.filter(e => !druck.abgewaehlt.has(motivSchluessel(e)));
// Nach einem Abbruch nur der Rest ab dem ersten fehlenden Aufkleber - solange die Auswahl gleich bleibt.
const weiterAb = () => weiterAbFuer(auswahlGesamt(), druck.weiter);
const ausgewaehlt = () => { const alle = auswahlGesamt(); return alle.slice(weiterAbFuer(alle, druck.weiter)); };
const teildruck = () => ausgewaehlt().length < druck.etiketten.length;
const unvollstaendig = () => ausgewaehlt().some(e => maengel(e).length);

/**
 * Zeichnet ein Etikett schwarz auf weiss in eine Canvas (400 x 400, 400 x 640 bzw. 400 x 800).
 * `versatz` (mm) nur beim Druck - die Vorschau zeigt das Etikett, wie es sitzen soll.
 */
function zeichne(canvas, e, versatz = null) {
  const format = aktuellesFormat();
  canvas.width = format.breite; canvas.height = format.hoehe;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (versatz) ctx.translate(Math.round(versatz.x * 8), Math.round(versatz.y * 8));
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  const { texte, linien, qr, quer } = etikettLayout(e);
  // Quer gesetzte Adresse (50 x 80, 50 x 100) oder gedrehter eigener Aufkleber: 90 Grad im Uhrzeigersinn auf die Rolle drehen.
  if (quer) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
  for (const t of texte) { ctx.font = font(t.groesse, t.fett); ctx.fillText(t.text, t.x, t.y); }
  for (const l of linien) ctx.fillRect(l.x1, l.y, l.x2 - l.x1, 2);
  if (qr && window.qrcode) {
    const q = window.qrcode(0, 'M'); q.addData(e.url); q.make();
    const n = q.getModuleCount();
    const modul = Math.floor(qr.groesse / n);
    // layout() legt die Flaeche aufs Raster; bliebe doch ein Rest, dann gleichmaessig rundum.
    const rest = Math.floor((qr.groesse - modul * n) / 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(qr.x + rest + c * modul, qr.y + rest + r * modul, modul, modul);
  }
  // Reines Schwarz/Weiss: so druckt der B1 - die Vorschau zeigt damit genau das Druckbild.
  const bild = ctx.getImageData(0, 0, canvas.width, canvas.height);
  schwarzWeiss(bild.data);
  ctx.putImageData(bild, 0, 0);
}

/**
 * Druckbild auf die Breite des Druckkopfs (B1: 384 px = 48 mm, Etikett 50 mm). Ein breiteres Bild legt die
 * Firmware nach eigenem Gutduenken auf den Kopf - auf den ersten Ausdrucken fehlte rechts die letzte Ziffer
 * (26.10.). Deshalb geht genau die Kopfbreite raus, mittig ausgeschnitten: rechts und links fallen je 8 px
 * weg, die bei 32 px Etikettrand immer weiss sind. Ein schmaleres Bild (eigene Groesse) wird mittig auf die
 * Kopfbreite aufgefuellt, denn schmale Rollen laufen mittig im Drucker. Die festen Formate sind alle 400 px breit
 * und bleiben davon unberuehrt.
 */
export function aufDruckkopf(quelle, ziel, kopf, richtung = 'top') {
  if (richtung !== 'top' || !(kopf > 0) || quelle.width === kopf) return quelle;
  ziel.width = kopf; ziel.height = quelle.height;
  const ctx = ziel.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ziel.width, ziel.height);
  ctx.drawImage(quelle, Math.trunc((kopf - quelle.width) / 2), 0);
  return ziel;
}

const umgebungsHinweis = () => {
  if (!window.isSecureContext) return 'Drucker verbinden geht nur über eine sichere Adresse. Bitte die Teppich-Dashboard-App neu öffnen oder das Dashboard über HTTPS bzw. localhost aufrufen.';
  if (!navigator.bluetooth && !navigator.serial) return 'Dieser Browser kann den Drucker nicht ansprechen – bitte Chrome oder Edge nehmen (Safari und Firefox können das nicht).';
  return '';
};

// Schrift je Zeile: eine Auswahl je getippter Zeile. Ohne Wahl gilt die Schriftgroesse aller Zeilen.
const ZEILEN_MAX = 40;
function zeilenHtml(text) {
  const motive = freieZeilen(text);
  const zeilen = motive.flatMap((z, m) => z.map((t, i) => ({ t, key: zeilenSchluessel(m, i), neu: i === 0 && motive.length > 1, m })));
  if (!zeilen.length) return '';
  if (zeilen.length > ZEILEN_MAX) return `<p class="small muted">Bei mehr als ${ZEILEN_MAX} Zeilen gilt die Schriftgröße aller Zeilen.</p>`;
  return `<p class="small"><strong>Schrift je Zeile</strong></p>${zeilen.map(({ t, key, neu, m }) => `${neu ? `<p class="small muted">Aufkleber ${m + 1}</p>` : ''}<label class="etk-zeile"><span>${esc(t)}</span><select data-etk-zeile="${key}" aria-label="${esc(`Schriftgröße für ${t}`)}"><option value="gleich">wie alle</option>${FREI_SCHRIFT_MM.map(mm => `<option value="${mm}"${Number(druck.zeilenSchrift[key]) === mm ? ' selected' : ''}>${mm} mm</option>`).join('')}</select></label>`).join('')}`;
}

function vorschauHtml() {
  const format = aktuellesFormat();
  return druckVorschau(druck.etiketten).eintraege.map(({ index: i, anzahl }) => { const e = druck.etiketten[i]; return `<figure class="etk-karte">
    <canvas class="etk-bild${eigeneGroesseAktiv() ? ' etk-bild-eigen' : ''}" data-etk-bild="${i}" width="${format.breite}" height="${format.hoehe}" aria-label="${esc(`Etikett ${[e.serie, e.farbe].filter(Boolean).join(' ') || 'ohne Namen'}`)}"></canvas>
    <figcaption class="small"><label class="etk-wahl"><input type="checkbox" data-etk-wahl="${i}"${druck.abgewaehlt.has(motivSchluessel(e)) ? '' : ' checked'}${druck.laeuft ? ' disabled' : ''}> drucken</label>${druck.mehrfach ? `<label class="etk-anzahl">Anzahl <input type="number" inputmode="numeric" min="1" max="${FREI_MAX_ANZAHL}" value="${anzahl}" data-etk-anzahl="${i}"${druck.laeuft ? ' disabled' : ''}></label>` : `<strong data-etk-kopien="${anzahl}">${anzahl} ${anzahl === 1 ? 'Aufkleber' : 'Kopien'}</strong>`}${e.fehlt.length ? `<span class="etk-fehlt">fehlt: ${esc(e.fehlt.join(', '))}</span>` : ''}${etikettLayout(e).passt ? (e.fehlt.length ? '' : '<span class="muted">vollständig</span>') : `<span class="etk-fehlt" title="${esc(etikettLayout(e).probleme.join(' · '))}">Passt nicht auf ${esc(format.name)} – ${druck.frei ? 'Text kürzen, Schrift kleiner stellen oder größere Rolle wählen' : 'Angaben kürzen oder größere Rolle wählen'}</span>`}
      ${druck.allowEditing ? `<button type="button" class="btn btn-sm" data-etk-bearbeiten="${i}"${druck.laeuft || druck.speichert ? ' disabled' : ''}>Angaben bearbeiten</button>` : ''}
      <button type="button" class="btn btn-sm" data-etk-png="${i}"${maengel(e).length || !qrBereit() || druck.laeuft || druck.speichert ? ' disabled' : ''}>Als PNG speichern</button>
    </figcaption>
  </figure>`; }).join('');
}

function zeichneVorschau() {
  const k = druck.kontext;
  if (!aktuell(k)) return;
  const liste = $('#etkListe');
  if (!liste) return;
  // Die Liste wird neu gezeichnet (auch spaeter, wenn die QR-Codes fertig sind): das Anzahlfeld behaelt den Fokus.
  const anzahlFokus = document.activeElement?.closest?.('[data-etk-anzahl]')?.dataset.etkAnzahl;
  const eigen = $('#etkEigen'); if (eigen) eigen.hidden = !eigeneGroesseAktiv();
  const fehlerText = formatFehler(), fehlerZeile = $('#etkEigenFehler');
  if (fehlerZeile) { fehlerZeile.textContent = fehlerText; fehlerZeile.hidden = !fehlerText; }
  liste.innerHTML = groesseFehler() ? '<p class="small muted">Keine Vorschau, bis die Größe stimmt.</p>'
    : druck.etiketten.length ? vorschauHtml() : `<p class="small muted">${druck.frei ? 'Noch kein Aufkleber – oben Text eintragen.' : 'Noch kein Aufkleber – unten Angaben eintragen und „Hinzufügen“.'}</p>`;
  liste.querySelectorAll('[data-etk-bild]').forEach(c => zeichne(c, druck.etiketten[Number(c.dataset.etkBild)]));
  if (anzahlFokus !== undefined) liste.querySelector(`[data-etk-anzahl="${anzahlFokus}"]`)?.focus({ preventScroll: true });
  const zusammenfassung = $('#etkZusammenfassung'), vorschau = druckVorschau(druck.etiketten);
  if (zusammenfassung) zusammenfassung.textContent = `${druck.etiketten.length} Aufkleber insgesamt · ${vorschau.motive} verschiedene Motive.${teildruck() ? ` Ausgewählt: ${ausgewaehlt().length}.` : ''}${vorschau.motive > DRUCK_LIMIT.vorschau ? ` Die Vorschau zeigt die ersten ${DRUCK_LIMIT.vorschau} Motive. Gedruckt werden alle ausgewählten Aufkleber.` : ''}`;
  const wahl = $('#etkWahl'); if (wahl) wahl.hidden = vorschau.motive < 2;
  for (const b of document.querySelectorAll('[data-etk-alle]')) b.disabled = druck.laeuft;
  const beschaeftigt = druck.laeuft || k.schliesst || k.bestaetigt;
  const verbunden = !!druck.client?.isConnected?.();
  const verbindungOffen = !!druck.verbindung;
  const wartet = $('#etkVerbindungWartet'); if (wartet) wartet.hidden = !verbindungOffen || k.verbindet || druck.laeuft;
  for (const e of document.querySelectorAll('.etk-dialog [data-close-dialog], #etkDichte, #etkFormat, #etkVersatzX, #etkVersatzY, #etkEigen input, #etkFrei input, #etkFrei select, #etkFrei textarea')) e.disabled = beschaeftigt;
  const weg = $('#etkWeg'); if (weg) weg.disabled = beschaeftigt || k.verbindet || verbindungOffen || druck.trennt || verbunden;
  const verbindenKnopf = $('#etkVerbinden');
  if (verbindenKnopf) { verbindenKnopf.textContent = verbunden ? 'Drucker verbunden' : k.verbindet ? 'Verbinde …' : 'Drucker verbinden'; verbindenKnopf.disabled = verbunden || k.verbindet || verbindungOffen || druck.trennt || beschaeftigt || !!umgebungsHinweis(); }
  const trennen = $('#etkTrennen');
  if (trennen) { trennen.textContent = druck.laeuft ? 'Druck abbrechen' : 'Verbindung trennen'; trennen.hidden = !druck.laeuft && !druck.client?.isConnected?.(); trennen.disabled = druck.trennt || k.schliesst || k.bestaetigt; }
  const knopf = $('#etkDrucken');
  if (knopf) { knopf.hidden = !!k.beiBestaetigen && k.transportFertig; knopf.disabled = !ausgewaehlt().length || beschaeftigt || k.verbindet || verbindungOffen || druck.trennt || druck.speichert || unvollstaendig() || !qrBereit() || !!umgebungsHinweis(); knopf.textContent = `Jetzt ${ausgewaehlt().length} Aufkleber drucken`; }
  // Weiterdrucken nach Abbruch: Startnummer sichtbar und aenderbar, falls an der Rolle ein anderer zuletzt kam.
  const weiterZeile = $('#etkWeiter');
  if (weiterZeile) {
    const alle = auswahlGesamt(), ab = weiterAbFuer(alle, druck.weiter);
    weiterZeile.hidden = !ab;
    if (ab) {
      const feld = $('#etkWeiterAb');
      feld.max = String(alle.length);
      if (document.activeElement !== feld) feld.value = String(ab + 1);
      feld.disabled = beschaeftigt;
      $('#etkWeiterAlle').disabled = beschaeftigt;
      const e = alle[ab];
      $('#etkWeiterName').textContent = `(${[e.serie, e.farbe].filter(Boolean).join(' ') || 'ohne Namen'}, noch ${alle.length - ab} von ${alle.length})`;
    }
  }
  const bestaetigung = $('#etkBestaetigung');
  if (bestaetigung) bestaetigung.hidden = !k.transportFertig || !!k.teilGedruckt;
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
  if (!aktuell(k) || druck.laeuft || k.verbindet || druck.verbindung || druck.trennt || druck.speichert || k.schliesst || k.bestaetigt || (k.beiBestaetigen && k.transportFertig) || !ausgewaehlt().length || druck.etiketten.length > DRUCK_LIMIT.etiketten || unvollstaendig() || !qrBereit()) return;
  const etiketten = ausgewaehlt();
  // Weiterdrucken nach Abbruch: zusammen mit dem ersten Lauf ist alles draussen, wenn nichts abgewaehlt ist
  // und der Start nicht hinter dem ersten fehlenden Aufkleber liegt. Dann zaehlt es wie ein ganzer Lauf.
  const basisAb = weiterAb(), alleGewaehlt = auswahlGesamt();
  const weiterKomplett = basisAb > 0 && alleGewaehlt.length === druck.etiketten.length && basisAb <= (druck.weiter?.geschaetzt ?? 0);
  const teil = etiketten.length < druck.etiketten.length && !weiterKomplett;
  const signatur = auswahlSignatur(alleGewaehlt);
  // Fortschritt fuer "weiterdrucken": vollstaendig gesendete Seiten und, falls der Drucker es meldet, fertige Seiten.
  let gesendet = 0, gedruckt = null, blockStart = 0, client = null;
  const fortschritt = ev => { gedruckt = blockStart + fertigeSeiten(ev); };
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
    client = await verbinden(weg, k, pruefeAbbruch);
    pruefeAbbruch();
    client.on?.('printprogress', fortschritt);
    // Ein Kollege kann die Reservierung waehrend der Druckerauswahl geaendert
    // haben. Vor dem ersten Druckbefehl nochmals den gemeinsamen Stand pruefen.
    if (await k.vorDruck?.() === false) throw new Error('Der Druckauftrag konnte nicht geprüft werden. Bitte die Druckliste neu laden.');
    pruefeAbbruch();
    const lib = window.niimbluelib, meta = client.getModelMetadata?.();
    const art = client.getPrintTaskType?.() ?? 'B1', richtung = meta?.printDirection ?? 'top';
    const canvas = document.createElement('canvas'), kopfBild = document.createElement('canvas');
    for (const block of druckBloecke(etiketten)) {
      pruefeAbbruch();
      blockStart = block.start; gedruckt = null;
      task = client.protocol.newPrintTask(art, { totalPages: block.etiketten.length, density: dichte, labelType: 1 });
      await task.printInit();
      pruefeAbbruch();
      for (const [i, e] of block.etiketten.entries()) {
        pruefeAbbruch();
        status(`Drucke Aufkleber ${basisAb + block.start + i + 1} von ${alleGewaehlt.length} …`, k);
        zeichne(canvas, e, druck.versatz);
        await task.printPage(lib.ImageEncoder.encodeCanvas(aufDruckkopf(canvas, kopfBild, meta?.printheadPixels, richtung), 0, richtung), 1);
        gesendet = block.start + i + 1;
        pruefeAbbruch();
      }
      pruefeAbbruch();
      await task.waitForFinished();
      pruefeAbbruch();
      const beendet = await task.printEnd();
      pruefeAbbruch();
      if (art === 'B1' && beendet === false) throw new Error('Der Drucker hat den Abschluss des Druckteils noch nicht bestätigt');
      task = null;
      gedruckt = block.start + block.etiketten.length;
    }
    druck.weiter = null;
    // Ein Teildruck (nur ausgewaehlte Motive) markiert nichts als gedruckt: der Auftrag
    // ist erst erledigt, wenn alle Aufkleber gedruckt sind.
    if (teil) {
      status(`Teildruck fertig: ${etiketten.length} von ${druck.etiketten.length} Aufklebern. Nichts wurde als gedruckt markiert.`, k);
      toast(etiketten.length === 1 ? '1 Aufkleber gedruckt' : `${etiketten.length} Aufkleber gedruckt`);
      return;
    }
    k.transportFertig = true;
    // Nur ein vollstaendiger Lauf zaehlt; ein Fehler im Aufrufer darf die Meldung nicht verhindern.
    try { k.druckFertig?.(); } catch { /* Aufrufer meldet selbst */ }
    status(basisAb > 0 ? `Rest gedruckt (ab Aufkleber ${basisAb + 1}). Bitte alle ${druck.etiketten.length} Aufkleber an der Rolle prüfen.`
      : `Der Drucklauf ist fertig. Bitte die ${etiketten.length} Aufkleber an der Rolle prüfen.`, k);
    toast(etiketten.length === 1 ? '1 Aufkleber gedruckt' : `${etiketten.length} Aufkleber gedruckt`);
  } catch (err) {
    if (!aktuell(k)) return;
    const auswahlAbbruch = /cancel|chosen|abgebrochen/i.test(String(err?.message));
    // Ein Druckerfehler mitten im Lauf: der Rest laesst sich ab dem ersten fehlenden Aufkleber nachdrucken.
    const rest = druck.abbruch || auswahlAbbruch ? 0 : weiterAbSchaetzen({ gesendet, gedruckt, gesamt: etiketten.length });
    if (rest > 0) {
      const ab = basisAb + rest;
      druck.weiter = { ab, signatur, geschaetzt: Math.min(ab, druck.weiter?.geschaetzt ?? ab) };
    }
    status(druck.abbruch ? 'Druck abgebrochen. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt.'
      : auswahlAbbruch ? 'Kein Drucker gewählt.'
        : rest > 0 ? `Druck unterbrochen nach Aufkleber ${basisAb + rest} von ${alleGewaehlt.length}: ${err?.message || err}. An der Rolle prüfen, welcher zuletzt kam – unten lässt sich ab dem nächsten weiterdrucken.`
          : `Druck unterbrochen: ${err?.message || err}. Bereits ausgegebene Aufkleber prüfen. Der Ausdruck wurde nicht bestätigt. Verbindung und Etikettenrolle prüfen und bei Bedarf den Auftrag wieder freigeben.`, k);
  } finally {
    client?.off?.('printprogress', fortschritt);
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
 * monotonen Stand. druckFertig meldet einen vollstaendig an den Drucker uebertragenen Lauf
 * (Packstation: Umschlag vorbereitet). Nur die Papierfrage ruft beiBestaetigen auf. false/Fehler
 * lassen den Dialog offen, damit ein Mitarbeiter die Aktion wiederholen kann.
 */
export async function oeffneEtikettenDruck({ etiketten = [], titel = 'Druckvorschau', allowEditing = true, freierText = false, entwurf = null, entwurfAnzahl = 1, mehrfach = false, hinweis = '', vorDruck, druckVersucht, druckFertig, beiSchliessen, beiBestaetigen, schonVersucht = false } = {}) {
  if (druck.laeuft || druck.speichert) { toast('Bitte warten, bis der aktuelle Vorgang fertig ist.'); return; }
  if (!Array.isArray(etiketten) || etiketten.length > DRUCK_LIMIT.etiketten) { toast(`Bitte höchstens ${DRUCK_LIMIT.etiketten} Aufkleber pro Drucklauf wählen.`); return; }
  // Ein anderer Aufruf darf den alten Auftrag nicht ohne dessen Freigabe ersetzen.
  if (aktuell(druck.kontext) && !await schliessen(druck.kontext)) return;
  const k = { sitzung, element: null, vorDruck, druckVersucht, druckFertig, beiSchliessen, beiBestaetigen, versucht: !!schonVersucht, transportFertig: false, schliesst: false, bestaetigt: false, beendet: false, verbindet: false, verbindungsNr: 0 };
  druck.kontext = k;
  druck.etiketten = [...etiketten];
  druck.bearbeiten = -1;
  druck.abgewaehlt = new Set();
  druck.weiter = null;
  druck.allowEditing = allowEditing;
  // Nur Einzeldrucke: Sammelauftraege mit Packreihenfolge oder Bestaetigung behalten ihre Menge.
  druck.mehrfach = mehrfach && !freierText && !beiBestaetigen;
  druck.frei = freierText;
  druck.format = freierText ? formatStand.frei : formatStand.muster;
  druck.stil = freiStil();
  druck.eigenFormat = eigenesFormat(formatStand.eigen.breite, formatStand.eigen.laenge);
  druck.eigenFehler = '';
  druck.zeilenSchrift = {}; druck.freiUrl = ''; druck.produktEtiketten = [];
  // Ein Produktentwurf startet auf der Rolle des Musterdrucks; die schmale Rolle faesst ihn nicht.
  if (entwurf) druck.format = formatStand.muster;
  const umgebung = umgebungsHinweis();
  const hatUsb = !!navigator.serial;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog etk-dialog" role="dialog" aria-modal="true" aria-labelledby="etkTitel" data-dialog>
    <h2 id="etkTitel">${esc(titel)}</h2>
    <p class="small muted">Niimbot B1. Zuerst die passende Rolle einlegen und unten die Größe wählen, dann Drucker einschalten und „Drucker verbinden“. Erst „Jetzt drucken“ startet den Druck.</p>
    <label class="etk-format small">Etikettengröße <select id="etkFormat">${Object.values(freierText ? FREIE_FORMATE : ETIKETT_FORMATE).map(f => `<option value="${f.format}"${f.format === druck.format ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}${freierText ? `<option value="${FORMAT_EIGEN}"${druck.format === FORMAT_EIGEN ? ' selected' : ''}>Eigene Größe…</option>` : ''}</select></label>
    ${freierText ? `<div id="etkEigen" class="etk-optionen" hidden>
      <label>Breite in mm <input id="etkEigenBreite" type="number" inputmode="decimal" min="${EIGEN_BREITE.min}" max="${EIGEN_BREITE.max}" step="any" value="${esc(formatStand.eigen.breite)}" style="width:96px"></label>
      <label>Länge in mm <input id="etkEigenLaenge" type="number" inputmode="decimal" min="${EIGEN_LAENGE.min}" max="${EIGEN_LAENGE.max}" step="any" value="${esc(formatStand.eigen.laenge)}" style="width:96px"></label>
      <p class="small muted etk-versatz-hilfe">Breite ist die Seite quer zur Rolle (${EIGEN_BREITE.min} bis ${EIGEN_BREITE.max} mm), Länge die Seite in Laufrichtung (${EIGEN_LAENGE.min} bis ${EIGEN_LAENGE.max} mm). Maße der Rolle eintragen.</p>
    </div>
    <p id="etkEigenFehler" class="etk-warn" role="alert" hidden></p>` : ''}
    ${umgebung ? `<p class="etk-warn">${esc(umgebung)}</p>` : ''}
    ${hinweis ? `<p class="etk-auftrag-hinweis">${esc(hinweis)}</p>` : ''}
    ${freierText ? `<form id="etkFrei" class="etk-form">
      <div class="etk-optionen etk-produkt">
        <label>Produkt übernehmen <input id="etkFreiProdukt" autocomplete="off" placeholder="Produktlink oder Handle"></label>
        <button type="button" class="btn btn-sm" id="etkFreiLaden">Angaben holen</button>
        <label id="etkFreiFarbe" hidden>Farbe / Ausführung <select id="etkFreiVariante"></select></label>
        <p class="small muted etk-versatz-hilfe">Ersetzt den Text unten durch die Angaben des Produkts. Danach kannst du alles ändern.</p>
      </div>
      <label>Text <textarea id="etkFreiText" name="text" rows="4" maxlength="${FREI_MAX_ZEICHEN}" autocomplete="off" placeholder="MUSTER&#10;RESTE&#10;&#10;WARE&#10;EINGANG"></textarea></label>
      <p class="small muted">Jede Zeile steht als eigene Zeile auf dem Aufkleber. Eine Leerzeile beginnt den nächsten Aufkleber.</p>
      <label>Anzahl je Aufkleber <input id="etkFreiAnzahl" name="anzahl" type="number" min="1" max="${FREI_MAX_ANZAHL}" value="1" style="width:80px"></label>
      <div id="etkZeilen" class="etk-zeilen"></div>
      <label id="etkFreiQr" class="etk-wahl" hidden><input type="checkbox" name="qr" checked> QR-Code zum Produkt</label>
      <div class="etk-optionen">
        <label>Schriftgröße aller Zeilen <select name="schrift"><option value="auto">Automatisch</option>${FREI_SCHRIFT_MM.map(mm => `<option value="${mm}">${mm} mm</option>`).join('')}</select></label>
        <label>Schriftstärke <select name="staerke"><option value="fett">Fett</option><option value="normal">Normal</option></select></label>
        <label>Ausrichtung <select name="ausrichtung"><option value="links">Links</option><option value="mitte" selected>Mittig</option><option value="rechts">Rechts</option></select></label>
        <label class="etk-wahl"><input type="checkbox" name="quer"> Text drehen</label>
      </div>
      <p class="small muted">Gilt für alle Aufkleber hier, außer eine Zeile hat oben ihre eigene Größe. Automatisch: jede Zeile so groß, wie sie passt. Feste Größe: Großbuchstaben werden etwa drei Viertel so hoch. Drehen: Der Text läuft entlang der Rolle, gut für lange Aufkleber.</p>
    </form>` : ''}
    <p id="etkZusammenfassung" class="small"></p>
    <p id="etkWahl" class="etk-wahl-leiste small" hidden>Zum Drucken: <button type="button" class="btn btn-sm" data-etk-alle="1">alle wählen</button> <button type="button" class="btn btn-sm" data-etk-alle="0">keine</button></p>
    <div id="etkListe" class="etk-liste"></div>
    ${allowEditing ? `<details class="etk-hand"${etiketten.length ? '' : ' open'}><summary>Aufkleber von Hand hinzufügen</summary>
      <form id="etkForm" class="etk-form">
        <label>Produktlink oder Handle <input name="handle" autocomplete="off" placeholder="https://www.teppich-paradies.net/products/…"></label>
        <label>Farbe <input name="farbe" autocomplete="off"></label>
        <p class="small muted">Mit Link holt das Control Center Serie, Artikelnummer und technische Daten aus dem Produktlexikon. Was du unten einträgst, gilt vor dem Lexikon.</p>
        <label>Serie <input name="serie" autocomplete="off"></label>
        <label>Artikelnummer <input name="sku" autocomplete="off"></label>
        <button type="submit" class="btn btn-sm" id="etkUebernehmen">Hinzufügen</button>
      </form>
    </details>` : ''}
    <details class="etk-einstellungen"><summary>Drucker-Einstellungen<span id="etkVersatzHinweis">${versatzHinweis()}</span></summary><div class="etk-optionen">
      <label>Druckdichte <select id="etkDichte">${[1, 2, 3, 4, 5].map(d => `<option value="${d}"${d === ETIKETT.dichteStandard ? ' selected' : ''}>${d}${d === ETIKETT.dichteStandard ? ' (Standard)' : ''}</option>`).join('')}</select></label>
      <label>Versatz waagerecht <select id="etkVersatzX">${versatzOptionen(druck.versatz.x, 'nach links', 'nach rechts')}</select></label>
      <label>Versatz senkrecht <select id="etkVersatzY">${versatzOptionen(druck.versatz.y, 'nach oben', 'nach unten')}</select></label>
      <p class="small muted etk-versatz-hilfe">Sitzt der Druck nicht mittig auf dem Etikett, hier gegensteuern – steht z. B. alles zu weit rechts: 1 mm nach links. Gilt für diesen Rechner; die Vorschau bleibt mittig.</p>
      <label>Verbindung <select id="etkWeg"><option value="bluetooth"${!navigator.bluetooth && hatUsb ? ' disabled' : ''}>Bluetooth</option>${hatUsb ? `<option value="usb"${!navigator.bluetooth ? ' selected' : ''}>USB-Kabel</option>` : ''}</select></label>
    </div></details>
    <p id="etkVerbindungWartet" class="small muted" role="status" hidden>Vorherige Geräteauswahl schließen und das Trennen abwarten. Danach kannst du erneut verbinden.</p>
    <p id="etkStatus" class="small" role="status" aria-live="polite"></p>
    <p id="etkWeiter" class="small etk-weiter" hidden><label>Weiter ab Aufkleber <input id="etkWeiterAb" type="number" inputmode="numeric" min="1" step="1" style="width:5rem"></label> <span id="etkWeiterName" class="muted"></span> <button type="button" class="btn btn-sm" id="etkWeiterAlle">Doch alle drucken</button></p>
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
  // Beim Aendern muss die Vorschau neben den Feldern sichtbar bleiben, nicht unter dem langen Formular.
  if (freierText) { $('#etkListe').classList.add('etk-liste-frei'); $('#etkFrei').before($('#etkListe')); }
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
    druck.format = druck.frei && ev.target.value === FORMAT_EIGEN ? FORMAT_EIGEN : etikettFormat(ev.target.value).format;
    formatStand[druck.frei ? 'frei' : 'muster'] = druck.format;
    formatMerken(druck.format, druck.frei);
    zeichneVorschau();
  });
  // Eigene Groesse: etwas Ungueltiges wird gemeldet und sperrt den Druck, gemerkt wird nur Gueltiges.
  $('#etkEigen')?.addEventListener('input', () => {
    if (!aktuell(k) || druck.laeuft) return;
    const breite = $('#etkEigenBreite').value, laenge = $('#etkEigenLaenge').value;
    druck.eigenFehler = eigeneGroesseFehler(breite, laenge);
    if (!druck.eigenFehler) {
      druck.eigenFormat = eigenesFormat(breite, laenge);
      formatStand.eigen = { breite, laenge };
      eigeneGroesseMerken(formatStand.eigen);
    }
    zeichneVorschau();
  });
  // Die Vorschau folgt beim Tippen; abgewaehlte Motive bleiben abgewaehlt, solange ihr Text gleich bleibt.
  const freiUebernehmen = () => {
    const form = $('#etkFrei'), d = new FormData(form);
    const url = druck.freiUrl && d.get('qr') === 'on' ? druck.freiUrl : '';
    druck.etiketten = freieEtiketten(d.get('text'), d.get('anzahl'), { zeilenSchrift: druck.zeilenSchrift, url });
    druck.stil = freiStil({ schrift: d.get('schrift'), fett: d.get('staerke') !== 'normal', ausrichtung: d.get('ausrichtung'), quer: d.get('quer') === 'on' });
    $('#etkFreiQr').hidden = !druck.freiUrl;
    zeichneVorschau();
  };
  const entwurfSetzen = e => {
    $('#etkFreiText').value = e.text;
    druck.zeilenSchrift = { ...e.zeilenSchrift }; druck.freiUrl = e.url || '';
    const qr = $('#etkFrei').elements.qr; if (qr) qr.checked = true;
    $('#etkZeilen').innerHTML = zeilenHtml(e.text);
    freiUebernehmen();
  };
  $('#etkFrei')?.addEventListener('input', ev => {
    if (!aktuell(k) || druck.laeuft) return;
    if (ev.target.id === 'etkFreiProdukt' || ev.target.id === 'etkFreiVariante') return;
    if (ev.target.dataset.etkZeile) {
      if (ev.target.value === 'gleich') delete druck.zeilenSchrift[ev.target.dataset.etkZeile];
      else druck.zeilenSchrift[ev.target.dataset.etkZeile] = Number(ev.target.value);
    } else if (ev.target.id === 'etkFreiText') {
      $('#etkZeilen').innerHTML = zeilenHtml(ev.target.value);
    }
    freiUebernehmen();
  });
  $('#etkFreiVariante')?.addEventListener('change', ev => {
    const auswahl = druck.produktEtiketten[Number(ev.target.value)];
    if (auswahl && aktuell(k) && !druck.laeuft) entwurfSetzen(produktEntwurf(auswahl.etikett));
  });
  $('#etkFreiLaden')?.addEventListener('click', async () => {
    if (!aktuell(k) || druck.laeuft) return;
    const roh = $('#etkFreiProdukt').value.trim();
    const handle = originalHandle((roh.match(/\/products\/([^/?#]+)/) || [])[1] || roh);
    if (!handle) { status('Bitte einen Produktlink oder Handle eintragen.', k); return; }
    status('Hole die Angaben …', k);
    const produkt = await lexikonProdukt(handle);
    if (!aktuell(k)) return;
    druck.produktEtiketten = produkt ? etikettenAusLexikon(produkt) : [];
    const farbe = $('#etkFreiFarbe');
    farbe.hidden = druck.produktEtiketten.length < 2;
    $('#etkFreiVariante').innerHTML = druck.produktEtiketten.map((x, i) => `<option value="${i}">${esc(x.bezeichnung)}</option>`).join('');
    if (!druck.produktEtiketten.length) { status('Produkt nicht gefunden. Der Text bleibt, wie er ist.', k); return; }
    entwurfSetzen(produktEntwurf(druck.produktEtiketten[0].etikett));
    status(druck.produktEtiketten.length > 1 ? 'Angaben übernommen. Bitte die richtige Farbe wählen.' : 'Angaben übernommen.', k);
  });
  if (entwurf) { $('#etkFreiAnzahl').value = Math.max(1, Math.trunc(Number(entwurfAnzahl)) || 1); entwurfSetzen(entwurf); }
  $('#etkFrei')?.addEventListener('submit', ev => ev.preventDefault());
  for (const [id, achse] of [['#etkVersatzX', 'x'], ['#etkVersatzY', 'y']]) {
    $(id)?.addEventListener('change', ev => {
      if (!aktuell(k) || druck.laeuft) return;
      druck.versatz = { ...druck.versatz, [achse]: versatzWert(ev.target.value) };
      versatzMerken(druck.versatz);
      $('#etkVersatzHinweis').textContent = versatzHinweis();
      if (druck.frei) zeichneVorschau();
    });
  }
  $('#etkListe').addEventListener('change', ev => {
    const anzahlFeld = ev.target.closest('[data-etk-anzahl]');
    if (anzahlFeld) {
      if (!aktuell(k) || !druck.mehrfach || druck.laeuft || druck.speichert || k.schliesst || k.bestaetigt) return;
      const wert = Number(anzahlFeld.value), schluessel = motivSchluessel(druck.etiketten[Number(anzahlFeld.dataset.etkAnzahl)]);
      const bearbeitet = druck.etiketten[druck.bearbeiten];
      if (Number.isInteger(wert) && wert >= 1 && wert <= FREI_MAX_ANZAHL) druck.etiketten = setzeMotivAnzahl(druck.etiketten, schluessel, wert);
      else status(`Anzahl: bitte 1 bis ${FREI_MAX_ANZAHL} eintragen.`, k);
      // Die Liste verschiebt sich: das gerade bearbeitete Motiv muss mitgehen.
      if (bearbeitet) druck.bearbeiten = druck.etiketten.findIndex(e => motivSchluessel(e) === motivSchluessel(bearbeitet));
      zeichneVorschau();
      return;
    }
    const wahl = ev.target.closest('[data-etk-wahl]');
    if (!wahl || !aktuell(k) || druck.laeuft) return;
    const schluessel = motivSchluessel(druck.etiketten[Number(wahl.dataset.etkWahl)]);
    if (wahl.checked) druck.abgewaehlt.delete(schluessel); else druck.abgewaehlt.add(schluessel);
    zeichneVorschau();
  });
  $('#etkWahl').addEventListener('click', ev => {
    const b = ev.target.closest('[data-etk-alle]');
    if (!b || !aktuell(k) || druck.laeuft) return;
    druck.abgewaehlt = b.dataset.etkAlle === '1' ? new Set() : new Set(druck.etiketten.map(motivSchluessel));
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
      // Die Karte steht fuer alle Kopien des Motivs: Aendern gilt fuer alle, sonst spaltet sich die Stueckzahl auf.
      if (vorher) { const alt = motivSchluessel(vorher); druck.etiketten = druck.etiketten.map(e => motivSchluessel(e) === alt ? neu : e); }
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
  $('#etkWeiterAb').addEventListener('change', ev => {
    if (!druck.weiter || druck.laeuft) return;
    const n = Math.trunc(Number(ev.target.value)), alle = auswahlGesamt();
    // 1 = wieder alles; ausserhalb der Auswahl bleibt der bisherige Startpunkt.
    if (n === 1) druck.weiter = null;
    else if (n > 1 && n <= alle.length) druck.weiter = { ...druck.weiter, ab: n - 1 };
    zeichneVorschau();
  });
  $('#etkWeiterAlle').addEventListener('click', () => { if (druck.laeuft) return; druck.weiter = null; zeichneVorschau(); $('#etkDrucken')?.focus({ preventScroll: true }); });
  $('#etkVerbinden').addEventListener('click', () => { void druckerVerbinden(k); });
  $('#etkTrennen').addEventListener('click', () => { void trennen(); });
  $('#etkBestaetigen')?.addEventListener('click', () => { void bestaetigen(k); });
  if (druck.client?.isConnected?.()) { $('#etkWeg').value = druck.clientWeg; status('Drucker verbunden.', k); }
  zeichneVorschau();
  const fokus = freierText ? $('#etkFreiText') : !$('#etkVerbinden').disabled ? $('#etkVerbinden') : $('#etkDrucken').disabled ? ($('#etkForm input') || $('.etk-dialog [data-close-dialog]')) : $('#etkDrucken');
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
