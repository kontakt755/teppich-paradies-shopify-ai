/**
 * "Heute": Kachel "Laden" - Zahlen aus dem Laden-Modus der Auftrags-App.
 *
 * Offene Beratungen, faellige Wiedervorlagen, offene Angebote, Faelle aus dem Shop
 * (7 Tage) und gewonnen/verloren (30 Tage). Nur Zahlen: Namen und Kundendaten bleiben
 * in der Auftrags-App. Die Zahlen holt der lokale Server (/api/laden/zahlen,
 * scripts/laden-zahlen.mjs) - der Browser spricht die App nie direkt an und kennt
 * ihren Schluessel nicht.
 *
 * Der Server haelt einen Stand 5 Minuten; hier wird beim Zeichnen von "Heute" nach
 * einer Minute still nachgefragt. Der alte Stand bleibt so lange stehen.
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
      <div class="d">${esc(unter)}</div>
    </div>`;
}

/**
 * Block "Laden" fuer die Startseite. Ohne Einrichtung (keine URL/kein Schluessel in .env.local)
 * eine ruhige Zeile statt eines Fehlers.
 */
export function heuteLaden() {
  ensureLadenZahlen();
  const d = ladenKachel.daten;
  const link = d?.ladenUrl
    ? `<a href="${esc(d.ladenUrl)}" target="_blank" rel="noopener">Laden-Ansicht öffnen <span aria-hidden="true">↗</span></a>`
    : '';
  let unterzeile;
  let inhalt = '';
  if (!d) unterzeile = 'Lade …';
  else if (d.fehler) { unterzeile = 'nicht erreichbar'; inhalt = `<p class="heute-hinweis">${esc(d.hinweis || 'Das Dashboard am Mac antwortet gerade nicht.')}</p>`; }
  else if (!d.eingerichtet) unterzeile = 'Nicht eingerichtet';
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
    </div>`;
  }
  return `<section class="heute-block heute-laden" aria-labelledby="heuteLaden">
    <div class="heute-block-kopf"><h2 id="heuteLaden">Laden</h2><span>${esc(unterzeile)}</span>${link}</div>
    ${inhalt}
  </section>`;
}
