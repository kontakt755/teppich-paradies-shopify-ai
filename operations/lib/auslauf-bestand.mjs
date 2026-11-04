/**
 * Auslauf-Pruefung fuer Lieferant I: rechnet aus der Bestandsdatei statt aus Lieferantenseiten.
 *
 * Freigabe Inhaber 2026-11-04: Ist ein Artikel 30 Tage lang ununterbrochen in keiner Groesse
 * verfuegbar, erscheint er als Hinweis im Control Center. Steht eine Variante eines aktiven
 * Produkts nicht mehr in der Bestandsdatei, ist das ein Befund. Archiviert wird nie automatisch:
 * "nichts verfuegbar" beweist keinen Auslauf, das prueft eine Sitzung beim Lieferanten.
 *
 * Reine Funktionen. operations/scripts/bestand-abgleich.mjs schreibt den Verlauf fort,
 * operations/scripts/auslauf-pruefen.mjs liest ihn ohne Netz.
 */

import path from 'node:path';
import { trefferFuer } from './lieferanten-bestand.mjs';
import { zusammenfassen } from './auslauf.mjs';

export const LIEFERANT = 'I';
/** Ab so vielen Tagen ohne Verfuegbarkeit erscheint der Artikel als Hinweis. */
export const NICHTS_VERFUEGBAR_TAGE = 30;
/**
 * Laenger ohne Lauf (Mac aus, Dienst aus, Sperren) ist "ununterbrochen" nicht belegt: Der Verlauf
 * beginnt neu, und die Auslauf-Pruefung meldet bis dahin eine Stoerung statt Befunde.
 */
export const VERLAUF_LUECKE_TAGE = 3;

const TAG_MS = 86400000;
const datum = (iso) => String(iso).slice(0, 10);

/** Verlaufsdatei im privaten Ordner ($TP_PRIVAT_DIR). */
export function verlaufDatei(privatDir) {
  return path.join(privatDir, 'lieferant-i', 'auslauf-verlauf.json');
}

/** Liegt der letzte Lauf zu weit zurueck (oder ist der Stand unlesbar)? */
export function verlaufVeraltet(verlauf, jetzt = new Date()) {
  const stand = Date.parse(verlauf?.stand);
  return !Number.isFinite(stand) || jetzt.getTime() - stand > VERLAUF_LUECKE_TAGE * TAG_MS;
}

/**
 * Bestandsdatei + Shop-Varianten -> je aktivem Produkt: Variantenzahl, irgendetwas verfuegbar,
 * fehlende SKUs. varianten: [{sku, barcode, handle, status}]; Zuordnung wie im Abgleich (SKU, Ersatz EAN).
 */
export function beobachteProdukte(bestand, varianten = []) {
  const produkte = new Map();
  for (const v of varianten) {
    if (v.status !== 'ACTIVE' || !v.handle) continue;
    const p = produkte.get(v.handle) || { handle: v.handle, varianten: 0, verfuegbar: false, fehlend: [] };
    const treffer = trefferFuer(bestand, v);
    p.varianten++;
    if (!treffer) p.fehlend.push(v.sku);
    else if (treffer.verfuegbar > 0) p.verfuegbar = true;
    produkte.set(v.handle, p);
  }
  return [...produkte.values()];
}

/**
 * Verlauf fortschreiben: seit wann ein Produkt durchgehend nichts verfuegbar hat und seit wann
 * eine Variante in der Datei fehlt. Einmal verfuegbar loescht `seit`; Produkte, die nicht mehr
 * aktiv sind, fallen heraus. Nach einer Luecke beginnt alles neu (VERLAUF_LUECKE_TAGE).
 */
export function fortschreibeVerlauf(vorher, beobachtung = [], jetzt = new Date()) {
  const zeit = jetzt.toISOString();
  const alt = vorher && !verlaufVeraltet(vorher, jetzt) ? vorher : null;
  const produkte = {};
  for (const p of beobachtung) {
    const a = alt?.produkte?.[p.handle];
    produkte[p.handle] = {
      varianten: p.varianten,
      seit: p.verfuegbar ? null : (a?.seit || zeit),
      fehlend: Object.fromEntries([...p.fehlend].sort().map((sku) => [sku, a?.fehlend?.[sku] || zeit])),
    };
  }
  return { stand: zeit, beginn: alt?.beginn || zeit, produkte };
}

/** Verlauf -> ein Eintrag je Produkt fuer zusammenfassen(). Ein fehlender Artikel geht vor "nichts verfuegbar". */
export function eintraegeAusVerlauf(verlauf, { jetzt = new Date(), tage = NICHTS_VERFUEGBAR_TAGE } = {}) {
  return Object.entries(verlauf?.produkte || {}).map(([handle, p]) => {
    const handles = [handle];
    const fehlend = Object.keys(p.fehlend || {});
    if (fehlend.length) {
      const seit = Object.values(p.fehlend).sort()[0];
      const anteil = fehlend.length === p.varianten ? `Alle ${p.varianten} Varianten stehen` : `${fehlend.length} von ${p.varianten} Varianten stehen`;
      return { kennung: fehlend.join(', '), handles, ergebnis: 'fehlt', grund: `${anteil} nicht mehr in der Bestandsdatei (seit ${datum(seit)})` };
    }
    const dauer = p.seit ? Math.floor((jetzt.getTime() - Date.parse(p.seit)) / TAG_MS) : 0;
    if (dauer >= tage) {
      return { kennung: handle, handles, ergebnis: 'nicht-verfuegbar', grund: `Seit ${dauer} Tagen (${datum(p.seit)}) in keiner Groesse verfuegbar - kein Auslaufbeleg, beim Lieferanten pruefen` };
    }
    return { kennung: handle, handles, ergebnis: 'ok' };
  });
}

/**
 * Teil fuer gesamtStand(), Grenzen wie bei den anderen Lieferanten: fehlt mehr als AUSFALL_GRENZE
 * der Produkte auf einmal, ist das eine Stoerung oder Umstellung und kein Auslauf. Ein fehlender
 * oder veralteter Verlauf ist ebenfalls eine Stoerung, keine gruene Meldung.
 */
export function teilAusVerlauf(verlauf, { jetzt = new Date(), tage = NICHTS_VERFUEGBAR_TAGE } = {}) {
  if (!verlauf) return { ...zusammenfassen(LIEFERANT, []), ausfall: 'Bestandsverlauf fehlt oder ist unlesbar (npm run bestand:abgleich)' };
  if (verlaufVeraltet(verlauf, jetzt)) return { ...zusammenfassen(LIEFERANT, []), ausfall: `Bestandsverlauf zuletzt am ${datum(verlauf.stand)} fortgeschrieben` };
  return zusammenfassen(LIEFERANT, eintraegeAusVerlauf(verlauf, { jetzt, tage }));
}
