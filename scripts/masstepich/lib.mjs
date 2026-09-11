/**
 * Gemeinsame Regeln fuer Teppich nach Mass (Raummass + Einfassprodukte).
 * Reine Funktionen - plan.mjs und guard.mjs rechnen damit, die Tests pruefen
 * sie. Die Storefront rechnet mit assets/tp-masstepich-rechnung.js; beide
 * muessen dieselben Zahlen liefern (siehe qa/tests/masstepich-rechnung.test.mjs).
 *
 * Lieferantennamen stehen nirgends im Repository - auch nicht als Hash, denn
 * kurze Namen lassen sich per Woerterbuch zurueckrechnen. Die Liste kommt aus
 * der internen Konfiguration ausserhalb des Repositorys oder aus der
 * Umgebungsvariable TP_LIEFERANTEN_NAMEN (kommagetrennt, z. B. als CI-Secret).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

export const VERFUEGBAR = 'Verfügbar';
export const SERVICE_WERTE = ['Verfügbar', 'Nicht verfügbar', 'Ungeklärt'];
export const WUNSCHMASS = 'Wunschmaß';
export const BREITE = /^\d+([.,]\d+)?\s?cm$/i;
export const WUNSCH = /^wunschma(ß|ss)$/i;
export const KONFIG_STANDARD = join(os.homedir(), 'teppich-paradies-analyse/kettelservice/masstepich-konfig.json');

export const ARTEN = {
  cover: { wert: 'Cover', kurz: 'COV', titel: (n) => `${n} Coverteppich nach Maß`, handle: 'coverteppich' },
  ketteln: { wert: 'Ketteln', kurz: 'KET', titel: (n) => `${n} Kettelteppich nach Maß`, handle: 'kettelteppich' },
  einfassband: { wert: 'Einfassband', kurz: 'EFB', titel: (n) => `${n} Teppich mit Einfassband nach Maß`, handle: 'teppich-mit-einfassband' },
  paspelband: { wert: 'Paspelband', kurz: 'PSP', titel: (n) => `${n} Teppich mit Paspelband nach Maß`, handle: 'teppich-mit-paspelband' },
};
export const FORMEN = ['Rechteck', 'Rund', 'Oval', 'Schablone', 'Skizze'];

/** Raummass-Preis je m2: Meterware-Preis plus Aufschlag, auf Cent gerundet. */
export function raummassPreis(m2Preis, prozent) {
  return Math.round(Number(m2Preis) * (1 + prozent / 100) * 100) / 100;
}

/** Breite in cm aus einem Optionswert ("400 cm", "400cm", "4,00 cm"), sonst null. */
export function breiteCm(wert) {
  const s = String(wert ?? '').trim();
  if (!BREITE.test(s)) return null;
  return Number.parseFloat(s.replace(',', '.'));
}

/** Cover wird umgeschlagen - das Stueck ist 10 cm schmaler als die Rolle. */
export function maxBreiteCm(rollenCm, art) {
  return art === 'cover' ? rollenCm - 10 : rollenCm;
}

export function ascii(s) {
  return String(s ?? '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');
}

export function slug(s) {
  return ascii(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function handleSlug(s) {
  return ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Eigene Artikelnummer - nie die des Lieferanten. */
export function eigeneSku(kurz, name, farbnummer) {
  return ['TP', kurz, slug(name), slug(farbnummer)].filter(Boolean).join('-');
}

/** Woerter eines Textes, klein, ohne Umlaute; Bindestrich-Woerter auch zerlegt und zusammengezogen. */
export function woerter(text) {
  const out = new Set();
  const roh = ascii(text).toLowerCase().match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || [];
  for (const w of roh) {
    out.add(w);
    const teile = w.split(/[-_]/);
    if (teile.length > 1) {
      teile.forEach((t) => out.add(t));
      out.add(teile.join(''));
    }
  }
  return [...out];
}

/** Namensliste als Menge: klein, ohne Umlaute, mit und ohne Bindestrich ("M-Plus" -> m-plus, mplus). */
export function namenSet(namen) {
  const set = new Set();
  for (const n of namen || []) {
    const w = ascii(n).toLowerCase().trim();
    if (!w) continue;
    set.add(w);
    set.add(w.replace(/[-_\s]+/g, ''));
  }
  return set;
}

/**
 * Lieferantennamen aus TP_LIEFERANTEN_NAMEN oder der internen Konfiguration.
 * null heisst: keine Liste verfuegbar - der Aufrufer muss das melden, nicht
 * still als "keine Treffer" werten.
 */
export function ladeLieferantenNamen(pfad = process.env.TP_MASSTEPICH_KONFIG || KONFIG_STANDARD) {
  if (process.env.TP_LIEFERANTEN_NAMEN) return namenSet(process.env.TP_LIEFERANTEN_NAMEN.split(','));
  if (!existsSync(pfad)) return null;
  const k = JSON.parse(readFileSync(pfad, 'utf8'));
  return Array.isArray(k.lieferantennamen) && k.lieferantennamen.length ? namenSet(k.lieferantennamen) : null;
}

/** Woerter im Text, die ein Lieferantenname sind. */
export function lieferantenTreffer(text, namen) {
  if (!namen) return [];
  return woerter(text).filter((w) => namen.has(w));
}

/** Kurzname eines Basisprodukts: der eigene Produktname vor der Warengruppe. */
export function kurzname(titel) {
  return String(titel ?? '').trim().split(/\s+/)[0] || '';
}
