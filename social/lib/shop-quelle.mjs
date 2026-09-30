/**
 * Shop als Contentquelle: liest den oeffentlichen Produktfeed des Shops.
 *
 * Bewusst /products.json und kein Admin-Token: der Feed enthaelt alles, was ein
 * Beitrag braucht (Titel, Bilder, Farben, Preise, Streichpreise, Tags,
 * Veroeffentlichungsdatum) und nichts, was privat waere. Damit laeuft der
 * Abgleich als einfacher Dienst, ohne Zugangsdaten auf dem Rechner und ohne
 * dass eine Claude-Sitzung offen sein muss. Unveroeffentlichte Artikel
 * (Musterprodukte, Entwuerfe) tauchen dort gar nicht erst auf.
 */

import fs from 'node:fs';
import path from 'node:path';
import { BETRIEB } from './konfig.mjs';
import { privatDir } from './pfade.mjs';

const SEITENGROESSE = 250;

/** Alle veroeffentlichten Produkte, seitenweise. Bricht nach 20 Seiten ab - ein Schutz gegen Endlosschleifen. */
export async function ladeProdukte({ basis = BETRIEB.shop, holen = globalThis.fetch, pauseMs = 400 } = {}) {
  const alle = [];
  for (let seite = 1; seite <= 20; seite += 1) {
    const antwort = await holen(`${basis}/products.json?limit=${SEITENGROESSE}&page=${seite}`, { headers: { Accept: 'application/json' } });
    if (!antwort.ok) throw new Error(`Produktfeed Seite ${seite}: HTTP ${antwort.status}`);
    const { products = [] } = await antwort.json();
    alle.push(...products);
    if (products.length < SEITENGROESSE) break;
    if (pauseMs) await new Promise(r => setTimeout(r, pauseMs));
  }
  return alle;
}

const ZUBEHOER = /profil|kleber|fixierung|bauchemie|verlegeband|reinigung|unterlage|zubeh/i;

/** Woraus besteht ein Bild? Die Dateinamen der Hersteller verraten es zuverlaessiger als jede Schaetzung. */
export function bildRolle(bild) {
  const name = String(bild.src || '').split('/').pop().split('?')[0].toLowerCase();
  const alt = String(bild.alt || '').toLowerCase();
  if (/raumbild|raum-|_raum|milieu|room|ambiente|interieur|wohn/.test(name) || /raum|zimmer|wohn/.test(alt)) return 'raum';
  if (/detail|nah|close/.test(name)) return 'detail';
  return 'produkt';
}

/** Taugt das Bild fuer einen Beitrag? Schmale Musterstreifen und Briefmarken nicht. */
export function bildTauglich(bild) {
  const b = Number(bild.width) || 0; const h = Number(bild.height) || 0;
  if (Math.min(b, h) < 700 || Math.max(b, h) < 1080) return false;
  const verhaeltnis = Math.max(b, h) / Math.min(b, h);
  return verhaeltnis <= 2.1;
}

function text(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/**
 * Produktfamilie: bei Vinyl ist jedes Dekor ein eigenes Produkt ("Solenta
 * Eiche Hell", "Solenta Buche Blond"). Fuer Social Media zaehlt die Familie -
 * sonst entstuenden 39 fast gleiche Beitraege.
 */
export function familie(titel, typ = '') {
  const t = String(titel || '').trim();
  const kollektion = /^(.*?-Kollektion)\b/i.exec(t);
  const kopf = kollektion ? kollektion[1] : t.split(/[\s–—-]+/)[0];
  const schluessel = `${kopf}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { schluessel: `${schluessel}|${String(typ).toLowerCase()}`, name: kopf };
}

/** Bringt ein Feed-Produkt in die Form, mit der Auswahl und Texte arbeiten. */
export function normalisiere(p, { basis = BETRIEB.shop } = {}) {
  const varianten = p.variants ?? [];
  const preise = varianten.map(v => Number(v.price)).filter(n => n > 0);
  const vergleiche = varianten.map(v => Number(v.compare_at_price)).filter(n => n > 0);
  const rabatte = varianten
    .filter(v => Number(v.compare_at_price) > Number(v.price))
    .map(v => Math.round((1 - Number(v.price) / Number(v.compare_at_price)) * 100));
  const farbOption = (p.options ?? []).find(o => /^(farbe|dekor|design)$/i.test(o.name));
  const variantenFarbe = new Map();
  if (farbOption) {
    const feld = `option${farbOption.position}`;
    for (const v of varianten) if (v[feld]) variantenFarbe.set(v.id, v[feld]);
  }
  const bilder = (p.images ?? []).map(b => {
    const farben = [...new Set((b.variant_ids ?? []).map(id => variantenFarbe.get(id)).filter(Boolean))];
    return {
      src: b.src, breite: b.width, hoehe: b.height, alt: b.alt || null,
      rolle: bildRolle(b), tauglich: bildTauglich(b),
      farbe: farben.length === 1 ? farben[0] : null,
    };
  });
  const typ = p.product_type || '';
  const fam = familie(p.title, typ);
  return {
    handle: p.handle,
    titel: p.title,
    typ,
    tags: p.tags ?? [],
    erstellt: p.created_at,
    veroeffentlicht: p.published_at,
    url: `${basis}/products/${p.handle}`,
    beschreibung: text(p.body_html).slice(0, 900),
    farben: farbOption ? farbOption.values : [],
    bilder,
    preisMin: preise.length ? Math.min(...preise) : null,
    vergleichMax: vergleiche.length ? Math.max(...vergleiche) : null,
    rabattProzent: rabatte.length ? Math.max(...rabatte) : 0,
    starkReduziert: (p.tags ?? []).includes('stark-reduziert'),
    verfuegbar: varianten.some(v => v.available),
    zubehoer: ZUBEHOER.test(typ) || (p.tags ?? []).some(t => /^zubehoer/.test(t)),
    familie: fam.schluessel,
    familienName: fam.name,
  };
}

/**
 * Ergaenzt den Quadratmeterpreis aus dem Produktlexikon des Control Centers.
 *
 * Bei Paketware ist der Shopify-Preis der Paketpreis; nach aussen zeigt der
 * Shop ausschliesslich Euro je Quadratmeter (AGENTS.md, Preislogik). Ein
 * Beitrag darf deshalb nie den Feed-Preis nennen - entweder den m²-Preis aus
 * dem Lexikon oder gar keinen.
 */
export function ladeLexikonPreise(datei = path.join(privatDir(), 'lexikon', 'produkte.json')) {
  const preise = new Map();
  let roh;
  try { roh = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return preise; }
  for (const p of roh.produkte ?? []) {
    const je = (p.varianten ?? []).map(v => v.preisJeEinheit).filter(e => e && e.betrag > 0);
    if (!je.length) continue;
    const kleinster = je.reduce((a, b) => (b.betrag < a.betrag ? b : a));
    preise.set(p.handle, { betrag: kleinster.betrag, einheit: kleinster.einheit, gruppe: p.produktgruppe ?? null });
  }
  return preise;
}

/** Was Kunden als Muster bestellen, interessiert sie - ein ehrlicheres Signal als Klicks. */
export function ladeMusterNachfrage(datei = path.join(privatDir(), 'kennzahlen', 'shop-snapshot.json')) {
  const namen = new Map();
  let roh;
  try { roh = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return namen; }
  for (const t of roh.topProdukte ?? []) {
    const m = /^Muster\s+(\S+)/i.exec(t.titel || '');
    if (m) namen.set(m[1].toLowerCase(), (namen.get(m[1].toLowerCase()) ?? 0) + (Number(t.menge ?? t.anzahl) || 1));
  }
  return namen;
}
