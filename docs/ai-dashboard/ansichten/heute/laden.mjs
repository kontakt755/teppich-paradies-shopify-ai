/**
 * "Heute": Kacheln "Laden" und "Montage" - Zahlen aus der Auftrags-App.
 *
 * Offene Beratungen, faellige Wiedervorlagen, offene Angebote, Faelle aus dem Shop
 * (7 Tage) und gewonnen/verloren (30 Tage), darunter - nur wenn es welche gibt - die
 * Faelle mit Spam-Verdacht. Nur Zahlen: Namen und Kundendaten bleiben
 * in der Auftrags-App. Die Zahlen holt der lokale Server (/api/laden/zahlen,
 * scripts/laden-zahlen.mjs) - der Browser spricht die App nie direkt an und kennt
 * ihren Schluessel nicht.
 *
 * Der Server haelt einen Stand 5 Minuten; hier wird beim Zeichnen von "Heute" nach
 * einer Minute still nachgefragt. Der alte Stand bleibt so lange stehen.
 *
 * "Montage" (seit 2026-10-12) kommt aus derselben Antwort (Objekt `montage`, jede Zahl
 * optional): vorhandene Zahlen zeigen, fehlende weglassen, ohne Objekt "noch nicht verbunden".
 */
import { state } from '../../kern/zustand.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { esc, fmtDateTime } from '../../kern/helfer.mjs';

const HALTBAR_MS = 60_000;

export const ladenKachel = { daten: null, am: 0, laedt: false };

export function ensureLadenZahlen() {
  if (ladenKachel.laedt) return;
  if (ladenKachel.daten && Date.now() - ladenKachel.am < HALTBAR_MS) return;
  ladenKachel.laedt = true;
  fetchEinkauf('/api/laden/zahlen').then(d => {
    const vorher = JSON.stringify(ladenKachel.daten);
    ladenKachel.daten = d; ladenKachel.am = Date.now(); ladenKachel.laedt = false;
    if (state.route.view === 'heute' && JSON.stringify(d) !== vorher) render();
  });
}

/** Warum keine Zahlen da sind - in Worten fuer den Laden, ohne Technik. */
function grundText(d) {
  if (d.grund === 'kein-zugriff') return 'Die Auftrags-App lehnt den Abruf ab – der Schlüssel am Mac passt nicht zur App.';
  return 'Die Auftrags-App ist gerade nicht erreichbar. Die Zahlen kommen beim nächsten Versuch wieder.';
}

function kachel(n, titel, unter, { warn = false } = {}) {
  const klasse = n === 0 ? ' null' : warn ? ' warn' : '';
  return `<div class="heute-kpi">
      <div class="n${klasse}">${esc(n.toLocaleString('de-DE'))}</div>
      <div class="l">${esc(titel)}</div>
      ${unter ? `<div class="d">${esc(unter)}</div>` : ''}
    </div>`;
}

/** Link in eine Ansicht der Auftrags-App (neuer Tab, eigene Anmeldung dort). Nur https. */
function appLink(url, text) {
  let u;
  try { u = new URL(String(url || '')); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  return `<a href="${esc(u.toString())}" target="_blank" rel="noopener">${esc(text)} <span aria-hidden="true">↗</span></a>`;
}

/**
 * Sprunglink in die Laden-Ansicht mit dem Filter „Spam pruefen" (Auftrags-App ab Version 47:
 * `?ansicht=laden&filter=spam`). Gebaut aus dem ladenUrl des Servers, damit weitere Parameter
 * der App-Adresse erhalten bleiben; `ansicht=laden` wird mitgesetzt, weil es den Filter nur dort
 * gibt. Nur https - alles andere (oder kein ladenUrl) ergibt keinen Link. Eine aeltere App
 * ignoriert den Parameter und zeigt die Laden-Ansicht ohne Filter.
 */
export function spamUrl(ladenUrl) {
  if (!ladenUrl) return '';
  let u;
  try { u = new URL(ladenUrl); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  u.searchParams.set('ansicht', 'laden');
  u.searchParams.set('filter', 'spam');
  return u.toString();
}

/**
 * Faelle aus dem Shop, die die App als moeglichen Spam zurueckhaelt. Sie zaehlen in keiner der
 * fuenf Zahlen mit und warten in der Laden-Ansicht im Filter „Spam pruefen" auf eine Entscheidung.
 * Deshalb eine eigene Zeile - aber nur, wenn welche da sind (0 oder aeltere App: nichts).
 * Mit Adresse der App endet die Zeile mit dem Sprung direkt in den Filter; der Linktext ist
 * der Filtername, damit der Klick dort landet, wo er es verspricht.
 */
function spamHinweis(n, ladenUrl) {
  if (!Number.isInteger(n) || n <= 0) return '';
  const faelle = n === 1 ? 'Fall' : 'Fälle';
  const zahl = `<b>${esc(n.toLocaleString('de-DE'))}</b> ${faelle} aus dem Shop mit Spam-Verdacht`;
  const ziel = spamUrl(ladenUrl);
  if (!ziel) return `<p class="heute-hinweis heute-laden-spam">${zahl} – in der Laden-Ansicht unter „Spam prüfen“ ansehen. In den Zahlen oben nicht enthalten.</p>`;
  return `<p class="heute-hinweis heute-laden-spam">${zahl} – in den Zahlen oben nicht enthalten. <a href="${esc(ziel)}" target="_blank" rel="noopener">Spam prüfen <span aria-hidden="true">↗</span></a></p>`;
}

/**
 * Block "Laden" fuer die Startseite. Ohne Einrichtung (keine URL/kein Schluessel in .env.local)
 * eine ruhige Zeile statt eines Fehlers.
 */
export function heuteLaden() {
  ensureLadenZahlen();
  const d = ladenKachel.daten;
  // Der Link steht, sobald die Adresse der App bekannt ist - auch ohne Schluessel fuer die Zahlen.
  const link = appLink(d?.ladenUrl, 'Laden-Ansicht öffnen');
  let unterzeile;
  let inhalt = '';
  if (!d) unterzeile = 'Lade …';
  else if (d.fehler) { unterzeile = 'nicht erreichbar'; inhalt = `<p class="heute-hinweis">${esc(d.hinweis || 'Das Dashboard am Mac antwortet gerade nicht.')}</p>`; }
  // Adresse da, Schluessel nicht: sagen, was fehlt - "Nicht eingerichtet" stimmte dann nicht.
  else if (!d.eingerichtet) unterzeile = d.fehlt === 'schluessel' ? 'Schlüssel fehlt' : 'Nicht eingerichtet';
  else if (!d.erreichbar) { unterzeile = 'nicht erreichbar'; inhalt = `<p class="heute-hinweis">${esc(grundText(d))}</p>`; }
  else {
    const z = d.zahlen;
    unterzeile = `Beratungen aus der Auftrags-App · Stand ${fmtDateTime(d.stand || d.abgerufen)}`;
    inhalt = `<div class="heute-kpis heute-laden-zahlen">
      ${kachel(z.offen, 'Offene Beratungen', `davon ${z.neu} neu`)}
      ${kachel(z.faellig, 'Wiedervorlage fällig', 'heute oder früher', { warn: true })}
      ${kachel(z.angeboteOffen, 'Angebote offen', `davon ${z.nachfassen} zum Nachfassen`)}
      ${kachel(z.ausShop7Tage, 'Aus dem Shop', 'Muster und Anfragen, 7 Tage')}
      ${kachel(z.gewonnen30Tage, 'Gewonnen', `verloren ${z.verloren30Tage} · 30 Tage`)}
    </div>${spamHinweis(z.spamVerdacht, d.ladenUrl)}`;
  }
  return `<section class="heute-block heute-laden" aria-labelledby="heuteLaden">
    <div class="heute-block-kopf"><h2 id="heuteLaden">Laden</h2><span>${esc(unterzeile)}</span>${link}</div>
    ${inhalt}
  </section>`;
}

/** Montage-Zahlen in fester Reihenfolge; Bernstein, wo etwas liegen geblieben ist. */
const MONTAGE_KACHELN = [
  ['einsaetzeHeute', 'Einsätze heute'],
  ['einsaetzeMorgen', 'Einsätze morgen'],
  ['offenVonGestern', 'Offen von gestern', { warn: true }],
  ['meldungenOffen', 'Meldungen offen', { warn: true }],
  ['antraegeOffen', 'Anträge offen', { warn: true }],
  ['neueAuftraege', 'Neue Aufträge'],
  ['rueckmeldungenNeu', 'Neue Rückmeldungen'],
];

/**
 * Block "Montage" fuer die Startseite: nur Zahlen der Montage-App, nie Namen. Fehlt eine Zahl,
 * faellt ihre Kachel weg; fehlt das ganze Objekt (aeltere App) oder der Schluessel, steht ruhig
 * "noch nicht verbunden". Der Link "Montage-App öffnen" braucht nur die Adresse der App.
 */
export function heuteMontage() {
  ensureLadenZahlen();
  const d = ladenKachel.daten;
  const link = appLink(d?.montageUrl, 'Montage-App öffnen');
  let unterzeile;
  let inhalt = '';
  const m = d?.montage;
  if (!d) unterzeile = 'Lade …';
  else if (d.fehler || (d.eingerichtet && !d.erreichbar)) unterzeile = 'nicht erreichbar';
  else if (!d.eingerichtet || !m) unterzeile = 'noch nicht verbunden';
  else {
    const da = MONTAGE_KACHELN.filter(([k]) => Number.isInteger(m[k]));
    unterzeile = `aus der Montage-App · Stand ${fmtDateTime(d.stand || d.abgerufen)}`;
    inhalt = da.length ? `<div class="heute-kpis heute-montage-zahlen">${da.map(([k, titel, opt]) => kachel(m[k], titel, '', opt)).join('')}</div>` : '';
  }
  return `<section class="heute-block heute-laden heute-montage" aria-labelledby="heuteMontage">
    <div class="heute-block-kopf"><h2 id="heuteMontage">Montage</h2><span>${esc(unterzeile)}</span>${link}</div>
    ${inhalt}
  </section>`;
}
