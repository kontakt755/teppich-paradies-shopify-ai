/**
 * Lieferantenkarte im Einkauf auf einen Blick: was blockiert eine Position, welche Angaben zum
 * Zuschnitt gehoeren in die Zeile, Muster je Kommission statt je Farbe.
 *
 * Inhaber 2026-10-14: "teilweise alles sehr unuebersichtlich". Vorher standen Ware und Muster in
 * einer Liste "Zu bestellen", jedes Muster als eigene Zeile ("Muster: Solenta Schiefer Berg /
 * Solenta Schiefer Berg · 1 Muster") und von 25 laufenden Posten drei - welche ueberfaellig sind,
 * sah man nur am Hinweis oben. Reine Funktionen ohne DOM; die Eintraege kommen aus
 * lieferantenKarten() ({pos, eintrag, wartetage, warnstufe}).
 */

import { musterEigen } from './einkauf-lieferanten.mjs';

const UNGEKLAERT = 'UNGEKLAERT';
const leer = v => v === null || v === undefined || String(v).trim() === '' || v === '–' || v === UNGEKLAERT;

/**
 * Warum eine Position so nicht bestellt werden kann. Leer = bestellbar. Nur, was die Bestellung
 * wirklich aufhaelt (Artikelnummer, Menge); ein fehlender Link zur Produktseite haelt nichts auf.
 */
export function blockGruende(p) {
  if (!p || p.istMuster) return [];
  const g = [];
  if (p.grosshaendlerId === UNGEKLAERT) g.push('Artikelnummer beim Lieferanten fehlt');
  if (p.bestellmenge?.menge === UNGEKLAERT) g.push(`Menge ungeklärt${leer(p.bestellmenge?.grund) ? '' : ` (${p.bestellmenge.grund})`}`);
  return g;
}

/** Bestellmenge als Text; ungeklaert steht als Grund in blockGruende(). */
export function mengeText(p) {
  const b = p?.bestellmenge;
  if (!b || b.menge === UNGEKLAERT) return '';
  return leer(b.text) ? '' : String(b.text);
}

/**
 * Fertigmass und Einfassung einer Massanfertigung (aus #1248, operations/lib/bestelluebersicht.mjs).
 * "Zuschnitt aus Rollenbreite" (nur noch in Altdaten vor 2026-10-14) faellt weg - die Rolle waehlt der Lieferant.
 */
export function ausfuehrungKurz(p) {
  return (Array.isArray(p?.ausfuehrung) ? p.ausfuehrung : [])
    .filter(z => !leer(z) && !/^Zuschnitt aus Rollenbreite/i.test(z));
}

const STUFE_RANG = { crit: 2, warn: 1 };

/**
 * Eintraege je Kommission (Kundenbestellung) zusammenfassen - fuer Muster: ein Kunde bestellt
 * meist drei bis fuenf auf einmal, und sie gehen gemeinsam raus. Reihenfolge: laengste Wartezeit
 * zuerst, sonst wie gekommen.
 * @returns {{orderId: string, orderName: string, eintraege: object[], positionen: object[], wartetage: number|null, warnstufe: string|null}[]}
 */
export function jeKommission(eintraege = []) {
  const je = new Map();
  for (const x of eintraege || []) {
    const p = x?.pos || {};
    const key = p.orderId || p.orderName || '?';
    if (!je.has(key)) je.set(key, { orderId: p.orderId || null, orderName: p.orderName || '', eintraege: [], positionen: [], wartetage: null, warnstufe: null });
    const k = je.get(key);
    k.eintraege.push(x);
    k.positionen.push(p);
    if (x.wartetage !== null && x.wartetage !== undefined && (k.wartetage === null || x.wartetage > k.wartetage)) k.wartetage = x.wartetage;
    if ((STUFE_RANG[x.warnstufe] || 0) > (STUFE_RANG[k.warnstufe] || 0)) k.warnstufe = x.warnstufe;
  }
  return [...je.values()].sort((a, b) => (b.wartetage ?? -1) - (a.wartetage ?? -1));
}

/**
 * Der eine naechste Schritt fuer alle Muster eines Kunden (Innendienst 2026-10-15: "pro Kunde
 * anklicken, die drei Muster sind angekommen, nicht jedes Muster einzeln"). `statusVon(p)` liefert
 * den Auftragsfluss-Status einer Position oder null.
 * - "angekommen": mindestens ein Muster ist beim Lieferanten bestellt - alle bestellten auf einmal.
 * - "verschicken": nichts mehr zu bestellen oder unterwegs, mindestens eins liegt bei uns
 *   (angekommen oder aus eigenem Bestand). `uebergabe`, wenn alle persoenlich vorbeigebracht werden.
 * - null: es gibt fuer diese Muster gerade keinen gemeinsamen Schritt.
 */
export function musterSchritt(positionen = [], statusVon = () => null) {
  const muster = (positionen || []).filter(p => p?.istMuster && p.lineItemId);
  const bestellt = muster.filter(p => statusVon(p) === 'bestellt');
  if (bestellt.length) return { schritt: 'angekommen', positionen: bestellt };
  if (muster.some(p => !statusVon(p) && !musterEigen(p))) return null;
  const bereit = muster.filter(p => statusVon(p) === 'geliefert' || (!statusVon(p) && musterEigen(p)));
  if (!bereit.length) return null;
  return { schritt: 'verschicken', positionen: bereit, uebergabe: bereit.every(p => p.musterHerkunft === 'eigen_vorbei') };
}
