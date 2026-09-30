/**
 * Content-Planer: wann erscheint was?
 *
 * Ziel sind drei bis fuenf gute Beitraege je Woche in wechselnder Mischung -
 * nicht ein voller Kalender. Der Planer vergibt Termine schon fuer Entwuerfe
 * (die Freigabe zeigt "geplant fuer ..."), haelt aber nichts fest: erst die
 * Freigabe macht aus dem Vorschlag einen Termin.
 *
 * Reine Funktion, ohne Datenbank und ohne Uhr - beides kommt als Argument.
 */

import { RASTER } from './konfig.mjs';
import { TYPEN } from './status.mjs';

const STUNDE = 60 * 60 * 1000;
const TAG = 24 * STUNDE;

/** Kalenderwoche als Schluessel "2026-W40" (ISO 8601). */
export function woche(datum) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahresanfang = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - jahresanfang) / TAG + 1) / 7)).padStart(2, '0')}`;
}

function tagSchluessel(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Alle Termine des Rasters in den naechsten `tage` Tagen, fruehestens `vorlaufStunden` ab jetzt. */
export function termine(raster, jetzt, { tage = 28, vorlaufStunden = 3 } = {}) {
  const aus = [];
  const ab = jetzt.getTime() + vorlaufStunden * STUNDE;
  for (let i = 0; i <= tage; i += 1) {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + i);
    for (const r of raster) {
      if (r.tag !== d.getDay()) continue;
      const [h, m] = r.zeit.split(':').map(Number);
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
      if (t.getTime() >= ab) aus.push({ zeit: t, fest: r.fest !== false });
    }
  }
  return aus.sort((a, b) => a.zeit - b.zeit);
}

const gruppeVon = (typ) => TYPEN[typ]?.gruppe ?? 'sonst';

/** Wie dringend ist ein Beitrag? Frisches von der Baustelle zuerst, Befristetes vor Zeitlosem. */
export function dringlichkeit(b, jetzt, lernstand = null) {
  let p = Number(b.punkte) || 0;
  const alter = (jetzt.getTime() - new Date(b.erstellt).getTime()) / TAG;
  if (b.quelle === 'baustelle') p += alter <= 7 ? 40 : 25;
  if (b.typ === 'angebot') p += 20;
  if (b.typ === 'produkt_neu') p += 15;
  if (b.typ === 'vorher_nachher') p += 10;
  // Was nachweislich Anfragen und Shopbesuche bringt, rueckt nach vorn - aber
  // gedeckelt, damit die Mischung erhalten bleibt und nicht ein Typ alles belegt.
  const faktor = lernstand?.typ?.[b.typ]?.faktor;
  if (typeof faktor === 'number') p *= Math.min(1.25, Math.max(0.8, faktor));
  return p;
}

/**
 * @param offen   Beitraege ohne gueltigen Termin: {id, typ, quelle, format, punkte, erstellt}
 * @param belegt  bereits feststehende Termine: {geplantAm, typ, format}
 * @returns Map id -> Date
 */
export function plane({ offen = [], belegt = [], jetzt = new Date(), raster = RASTER, lernstand = null } = {}) {
  const plan = new Map();
  const istStory = b => b.format === 'story';

  // --- Beitraege (Feed, Karussell, Reel) --------------------------------
  const beitraege = offen.filter(b => !istStory(b)).map(b => ({ ...b, prio: dringlichkeit(b, jetzt, lernstand) })).sort((a, b) => b.prio - a.prio || a.id - b.id);
  const kalender = belegt.filter(b => !istStory(b) && b.geplantAm).map(b => ({ zeit: new Date(b.geplantAm), typ: b.typ }));
  const tagBelegt = new Set(kalender.map(k => tagSchluessel(k.zeit)));
  const jeWoche = {}; const angeboteJeWoche = {};
  for (const k of kalender) {
    const w = woche(k.zeit);
    jeWoche[w] = (jeWoche[w] ?? 0) + 1;
    if (k.typ === 'angebot') angeboteJeWoche[w] = (angeboteJeWoche[w] ?? 0) + 1;
  }
  const slots = termine(raster.beitrag, jetzt);
  const festeSlots = slots.filter(s => s.fest).length;

  for (const slot of slots) {
    if (!beitraege.length) break;
    const tag = tagSchluessel(slot.zeit); const w = woche(slot.zeit);
    if (tagBelegt.has(tag)) continue;
    if ((jeWoche[w] ?? 0) >= raster.maxBeitraegeJeWoche) continue;
    // Zusatztage nur oeffnen, wenn der Vorrat die festen Tage uebersteigt.
    if (!slot.fest && beitraege.length <= festeSlots / 2) continue;

    // Nachbarn: was erscheint direkt davor und danach?
    const davor = [...kalender].filter(k => k.zeit < slot.zeit).sort((a, b) => b.zeit - a.zeit)[0];
    const danach = [...kalender].filter(k => k.zeit > slot.zeit).sort((a, b) => a.zeit - b.zeit)[0];
    const nachbarn = new Set([davor, danach].filter(Boolean).map(k => gruppeVon(k.typ)));

    const erlaubt = b => !(b.typ === 'angebot' && (angeboteJeWoche[w] ?? 0) >= raster.maxAngeboteJeWoche);
    const kandidaten = beitraege.filter(erlaubt);
    if (!kandidaten.length) continue;
    // Nicht zweimal hintereinander dasselbe Thema - ausser es gibt nichts anderes.
    const wahl = kandidaten.find(b => !nachbarn.has(gruppeVon(b.typ))) ?? kandidaten[0];

    plan.set(wahl.id, slot.zeit);
    beitraege.splice(beitraege.indexOf(wahl), 1);
    kalender.push({ zeit: slot.zeit, typ: wahl.typ });
    tagBelegt.add(tag);
    jeWoche[w] = (jeWoche[w] ?? 0) + 1;
    if (wahl.typ === 'angebot') angeboteJeWoche[w] = (angeboteJeWoche[w] ?? 0) + 1;
  }

  // --- Storys: haeufiger, eine je Termin ---------------------------------
  const storys = offen.filter(istStory).map(b => ({ ...b, prio: dringlichkeit(b, jetzt, lernstand) })).sort((a, b) => b.prio - a.prio || a.id - b.id);
  const storyBelegt = new Set(belegt.filter(b => istStory(b) && b.geplantAm).map(b => new Date(b.geplantAm).getTime()));
  for (const slot of termine(raster.story, jetzt, { tage: 14, vorlaufStunden: 1 })) {
    if (!storys.length) break;
    if (storyBelegt.has(slot.zeit.getTime())) continue;
    plan.set(storys.shift().id, slot.zeit);
  }
  return plan;
}
