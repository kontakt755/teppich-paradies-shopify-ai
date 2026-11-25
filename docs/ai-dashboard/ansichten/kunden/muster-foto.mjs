/**
 * "Muster kommt an" per Foto (25.11.2026): Foto von den Lieferantenetiketten, der Mac erkennt den Text,
 * fotoTreffer (lib/muster-packen.mjs) sucht die offenen Muster dazu. Zwei Wege:
 * - am Mac oder Handy direkt "Foto aufnehmen" (Dateiauswahl, am Handy die Kamera);
 * - am Mac "Mit dem Handy fotografieren": QR-Code, das Handy oeffnet eine Seite nur mit dem Kameraknopf
 *   (foto=handy). Der Mac fragt alle paar Sekunden nach neuen Fotos und zeigt das Ergebnis selbst an -
 *   der Drucker haengt am Mac. Kein Umweg ueber Google Drive.
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
const WARTEN_MS = 2500, WARTEN_MAX_MS = 30 * 60 * 1000;

/** Letztes Foto: { id, text, zeit, druck } - `druck` true, bis die Ansicht den Druck einmal geoeffnet hat. */
let foto = null;
let sendet = false;
let warten = null; // { seit, bis, qr, url } solange der Mac auf das Handy wartet
let wartenTimer = null;

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
  const qr = warten
    ? `<div class="mp-foto-qr">${warten.qr || '<p class="small muted">QR-Code wird geladen …</p>'}
        <p class="small">Mit der Handy-Kamera scannen, dann dort fotografieren. Das Ergebnis kommt hier an.</p>
        <button type="button" class="btn btn-sm btn-ghost" data-mp-foto-qr="aus">Nicht mehr warten</button></div>`
    : '';
  return `<div class="toolbar mp-foto">${knopf}${warten ? '' : '<button type="button" class="btn" data-mp-foto-qr="an">Mit dem Handy fotografieren</button>'}</div>${qr}`;
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
    if (warten) warten.seit = Math.max(warten.seit, r.id); // eigenes Foto nicht doppelt abholen
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
  if (k.dataset.mpFotoQr === 'aus') stoppen(); else void starten();
  render();
  return true;
}

function stoppen() { warten = null; clearTimeout(wartenTimer); wartenTimer = null; }

async function starten() {
  const r = await fetchEinkauf(ENDPOINT);
  if (r.fehler) { toast(r.hinweis || 'Dashboard nicht erreichbar.', 'crit'); return; }
  // Vom Handy aus ist 127.0.0.1 das Handy selbst: dann die Netzadresse des Dashboards (Tailscale).
  const basis = !LOKAL.test(location.hostname) ? location.origin : r.netzAdresse;
  if (!basis) { toast('Für den QR-Code fehlt die Netzadresse des Dashboards. Bitte das Dashboard über die Firmenadresse öffnen.', 'crit'); return; }
  const url = `${basis}/#/kunden?tab=muster&mp=laden&foto=handy`;
  warten = { seit: r.letzte, bis: Date.now() + WARTEN_MAX_MS, url, qr: null };
  render();
  try {
    await ladeSkript('qrcode');
    const q = window.qrcode(0, 'M'); q.addData(url); q.make();
    if (warten) warten.qr = `${q.createSvgTag(5, 2)}`;
  } catch (err) {
    if (warten) warten.qr = `<p class="small">QR-Code ging nicht (${esc(err.message)}). Am Handy öffnen: <strong>${esc(url)}</strong></p>`;
  }
  render();
  abfragen();
}

function abfragen() {
  clearTimeout(wartenTimer);
  if (!warten) return;
  // Nur solange "Muster kommt an" offen ist und hoechstens 30 Minuten.
  if (Date.now() > warten.bis || state.route.view !== 'kunden' || state.route.params.get('mp') !== 'laden') { stoppen(); render(); return; }
  wartenTimer = setTimeout(async () => {
    if (!warten) return;
    const r = await fetchEinkauf(`${ENDPOINT}?seit=${encodeURIComponent(warten.seit)}`);
    const neu = r.fotos?.at(-1);
    if (neu && warten) {
      warten.seit = neu.id;
      foto = { ...neu, druck: true };
      render();
    }
    abfragen();
  }, WARTEN_MS);
}
