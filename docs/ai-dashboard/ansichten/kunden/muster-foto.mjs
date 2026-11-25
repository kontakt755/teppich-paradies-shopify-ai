/**
 * "Muster kommt an" per Foto (25.11.2026): Foto von den Lieferantenetiketten, der Mac erkennt den Text,
 * fotoTreffer (lib/muster-packen.mjs) sucht die offenen Muster dazu. Zwei Wege:
 * - am Mac oder Handy direkt "Foto aufnehmen" (Dateiauswahl, am Handy die Kamera);
 * - am Mac "QR-Code fürs Handy": das Handy oeffnet eine Seite nur mit dem Kameraknopf (foto=handy) -
 *   geht nur im Laden-WLAN oder mit Tailscale;
 * - von unterwegs: Foto in den Dropbox-Ordner "Musterfotos" (25.11., Android ohne Tailscale).
 * Solange "Muster kommt an" am Mac offen ist, fragt die Seite alle paar Sekunden nach neuen Fotos und zeigt
 * das Ergebnis selbst an - der Drucker haengt am Mac.
 * Gespeichert wird nur der erkannte Text, im Speicher des Dienstes; das Bild nicht.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { ladeSkript, oeffneEtikettenDruck } from '../../bausteine/etiketten-druck.mjs';
import { aufkleberFuerMuster, fotoTreffer, umschlagKennung } from '../../lib/muster-packen.mjs';
import { kunden } from './gemeinsam.mjs';

const ENDPOINT = '/api/kunden/muster-foto';
const LOKAL = /^(127\.0\.0\.1|localhost|\[::1\])$/i;
const WARTEN_MS = 2500;

/** Letztes Foto: { id, text, zeit, druck } - `druck` true, bis die Ansicht den Druck einmal geoeffnet hat. */
let foto = null;
let sendet = false;
let qr = null; // { url, svg } solange der QR-Code fuers Handy gezeigt wird
// Solange "Muster kommt an" am Mac offen ist, fragt die Ansicht alle paar Sekunden nach neuen Fotos (vom
// Handy per QR oder aus dem Dropbox-Ordner "Musterfotos"). `seit` = letzte schon gesehene Foto-Nummer.
let abfrage = null; // { seit, timer }

export const istHandySeite = () => state.route.params.get('foto') === 'handy';
export const aktuellesFoto = () => foto;

/** Einmal abholen: true nur beim ersten Aufruf nach einem neuen Foto, und nicht auf der Handyseite (kein Drucker). */
export function fotoDruckFaellig() {
  if (!foto?.druck || istHandySeite()) return false;
  foto.druck = false;
  return true;
}

export function fotoKopfHtml() {
  const knopf = `<label class="btn${istHandySeite() ? ' btn-primary mp-gross' : ''}"${sendet ? ' aria-disabled="true"' : ''}>${sendet ? 'Foto wird gelesen …' : 'Foto von den Etiketten aufnehmen'}
    <input type="file" accept="image/*" capture="environment" data-mp-foto hidden${sendet ? ' disabled' : ''}></label>`;
  if (istHandySeite()) {
    return `<div class="mp-hand"><p class="mp-hand-label">Etiketten fotografieren</p>${knopf}
      <p class="small muted">Alle Etiketten eines Pakets auf ein Foto, gerade und scharf. Das Ergebnis erscheint hier und am Mac, gedruckt wird am Mac.</p></div>`;
  }
  if (!abfrage) queueMicrotask(starteAbfrage);
  const qrHtml = qr
    ? `<div class="mp-foto-qr">${qr.svg || '<p class="small muted">QR-Code wird geladen …</p>'}
        <p class="small">Mit der Handy-Kamera scannen, dann dort fotografieren. Geht nur im Laden-WLAN oder mit Tailscale auf dem Handy.</p>
        <button type="button" class="btn btn-sm btn-ghost" data-mp-foto-qr="aus">QR-Code ausblenden</button></div>`
    : '';
  return `<div class="toolbar mp-foto">${knopf}${qr ? '' : '<button type="button" class="btn" data-mp-foto-qr="an">QR-Code fürs Handy</button>'}</div>
    <p class="small muted">Vom Handy ohne WLAN: Foto in Dropbox in den Ordner „Musterfotos“ hochladen – es erscheint hier von selbst, solange diese Seite offen ist.</p>${qrHtml}`;
}

/** Bild verkleinern (Upload am Handy, Texterkennung braucht keine 12 Megapixel); geht das nicht, das Original. */
async function alsJpeg(datei) {
  try {
    const b = await createImageBitmap(datei);
    const f = Math.min(1, 2400 / Math.max(b.width, b.height));
    const c = document.createElement('canvas');
    c.width = Math.round(b.width * f); c.height = Math.round(b.height * f);
    c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } catch {
    return await new Promise((ok, fehler) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fehler; r.readAsDataURL(datei); });
  }
}

/** change-Ereignis: Foto gewaehlt. Gibt true zurueck, wenn es dieses Feld war. */
export function musterFotoAenderung(e) {
  const feld = e.target.closest('[data-mp-foto]');
  if (!feld) return false;
  const datei = feld.files?.[0];
  feld.value = '';
  if (!datei || sendet) return true;
  void senden(datei);
  return true;
}

async function senden(datei) {
  sendet = true; render();
  try {
    const r = await orgSchreiben(ENDPOINT, { bild: await alsJpeg(datei) });
    if (abfrage) abfrage.seit = Math.max(abfrage.seit, r.id); // eigenes Foto nicht doppelt abholen
    foto = { ...r, druck: true };
    if (!r.text) toast('Auf dem Foto war kein Text zu erkennen. Näher ran und scharf stellen.', 'crit');
  } catch (err) {
    toast(err.message || 'Foto konnte nicht gelesen werden.', 'crit');
  } finally {
    sendet = false; render();
  }
}

/** Erkannte Muster, je Art der Umschlag, der am laengsten wartet - nach Umschlag sortiert (Paket fuer Paket). */
export function fotoReihe(kundenListe, text) {
  return [...fotoTreffer(kundenListe, text).arten].sort((a, b) => umschlagKennung(a.kunde).localeCompare(umschlagKennung(b.kunde), 'de', { numeric: true }));
}

export function fotoDrucken(reihe) {
  const etiketten = reihe.flatMap(x => aufkleberFuerMuster(x.muster));
  if (!etiketten.length) return;
  const ziele = [...new Set(reihe.map(x => `${umschlagKennung(x.kunde)} ${x.kunde.name}`))];
  oeffneEtikettenDruck({ etiketten, titel: `Aufkleber vom Foto · ${plural(reihe.length, 'Muster', 'Muster')}`, allowEditing: false, mehrfach: true,
    hinweis: `Reihenfolge nach Umschlag: ${ziele.join(' · ')}. Aufkleben, einlegen und je Muster „Eingelegt“ tippen. Der Druck bucht nichts.` });
}

/** Klicks: QR an/aus, alle Aufkleber vom Foto drucken. */
export function musterFotoKlick(e) {
  if (e.target.closest('[data-mp-foto-drucken]')) {
    e.preventDefault();
    if (foto && kunden.musterPacken?.kunden) fotoDrucken(fotoReihe(kunden.musterPacken.kunden, foto.text));
    return true;
  }
  const k = e.target.closest('[data-mp-foto-qr]');
  if (!k) return false;
  e.preventDefault();
  if (k.dataset.mpFotoQr === 'aus') qr = null; else void qrZeigen();
  render();
  return true;
}

async function qrZeigen() {
  const r = await fetchEinkauf(ENDPOINT);
  if (r.fehler) { toast(r.hinweis || 'Dashboard nicht erreichbar.', 'crit'); return; }
  // Vom Handy aus ist 127.0.0.1 das Handy selbst: dann die Netzadresse des Dashboards (Tailscale).
  const basis = !LOKAL.test(location.hostname) ? location.origin : r.netzAdresse;
  if (!basis) { toast('Für den QR-Code fehlt die Netzadresse des Dashboards. Bitte das Dashboard über die Firmenadresse öffnen.', 'crit'); return; }
  const url = `${basis}/#/kunden?tab=muster&mp=laden&foto=handy`;
  qr = { url, svg: null };
  render();
  try {
    await ladeSkript('qrcode');
    const q = window.qrcode(0, 'M'); q.addData(url); q.make();
    if (qr) qr.svg = q.createSvgTag(5, 2);
  } catch (err) {
    if (qr) qr.svg = `<p class="small">QR-Code ging nicht (${esc(err.message)}). Am Handy öffnen: <strong>${esc(url)}</strong></p>`;
  }
  render();
}

const ansichtOffen = () => state.route.view === 'kunden' && state.route.params.get('mp') === 'laden' && !istHandySeite();

async function starteAbfrage() {
  if (abfrage || !ansichtOffen()) return;
  abfrage = { seit: null, timer: null };
  const r = await fetchEinkauf(ENDPOINT);
  if (!abfrage) return;
  abfrage.seit = r.fehler ? null : r.letzte;
  naechsteAbfrage();
}

function naechsteAbfrage() {
  if (!abfrage) return;
  // Seite verlassen: aufhoeren; beim naechsten Oeffnen startet fotoKopfHtml neu.
  if (!ansichtOffen()) { abfrage = null; return; }
  abfrage.timer = setTimeout(async () => {
    if (!abfrage) return;
    if (abfrage.seit === null) { abfrage = null; return; }
    const r = await fetchEinkauf(`${ENDPOINT}?seit=${encodeURIComponent(abfrage.seit)}`);
    const neu = r.fotos?.at(-1);
    if (neu && abfrage) {
      abfrage.seit = neu.id;
      foto = { ...neu, druck: true };
      if (!neu.text) toast('Auf dem neuen Foto war kein Text zu erkennen. Näher ran und scharf stellen.', 'crit');
      render();
    }
    naechsteAbfrage();
  }, WARTEN_MS);
}
