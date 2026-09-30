/**
 * Die Arbeitsschritte der Agenten - so, dass Kommandozeile, Dienst und
 * Zentrale dieselbe Funktion aufrufen.
 *
 *   shopAbgleich          Shop-Scout: Feed lesen, Anlaesse finden, Vorrat anlegen
 *   importiereReferenzen  vorhandene Referenzprojekte der Website uebernehmen
 *   planeOffene           Planer: Terminvorschlaege fuer Entwuerfe
 *   veroeffentlicheFaellige  Publisher
 *   holeKennzahlen        Auswertung: Messwerte holen, Lernstand schreiben
 */

import fs from 'node:fs';
import path from 'node:path';
import { erkenntnisse, lernstand as berechneLernstand, punkte, vereinheitliche } from './auswertung.mjs';
import { medienZuBeitrag, pruefe } from './freigabe.mjs';
import { metaBereit, metaKonfig } from './konfig.mjs';
import { erstelleClient, veroeffentliche } from './meta.mjs';
import { lernstandPfad, medienPfad, socialDir } from './pfade.mjs';
import { plane } from './planer.mjs';
import { findeKandidaten, REGELN, standAus } from './produkt-auswahl.mjs';
import { ladeLexikonPreise, ladeMusterNachfrage, ladeProdukte, normalisiere } from './shop-quelle.mjs';
import { BEITRAG_STATUS, INHALT_STATUS, TYPEN } from './status.mjs';
import { fertigerText } from './texte.mjs';

const STUNDE = 60 * 60 * 1000;

// --- Shop-Scout ---------------------------------------------------------------

export async function shopAbgleich(db, { holen = globalThis.fetch, jetzt = new Date(), roh = null, preise = ladeLexikonPreise(), nachfrage = ladeMusterNachfrage() } = {}) {
  const feed = roh ?? await ladeProdukte({ holen });
  if (!feed.length) throw new Error('Produktfeed leer – Abgleich abgebrochen, der bisherige Stand bleibt.');
  const produkte = feed.map(p => normalisiere(p));
  const stand = db.produktStand();
  const kandidaten = findeKandidaten({ produkte, stand, preise, nachfrage, jetzt });

  const neu = [];
  const ruhe = new Date(jetzt.getTime() - REGELN.ruheTage * 24 * STUNDE);
  for (const k of kandidaten) {
    // Der Schluessel traegt den Monat - am Monatswechsel kaeme derselbe Anlass sonst
    // ein zweites Mal, solange der erste noch in der Freigabe liegt.
    if (db.shopAnlassSeit(k.familie, k.art, ruhe)) continue;
    const { id, neu: angelegt } = db.inhaltAnlegen({
      quelle: 'shopify', typ: k.art, schluessel: k.schluessel,
      titel: `${TYPEN[k.art]?.label ?? k.art}: ${k.serie ? k.familienName : k.titel}`,
      bodenart: k.gruppe, produkt_handle: k.hauptHandle, produkt_titel: k.titel,
      einwilligung: true, eingereicht_von: 'Shop-Scout', punkte: k.punkte, notiz: k.grund,
      daten: k,
    });
    if (!angelegt) continue;
    k.bilder.forEach((b, i) => db.mediumAnlegen(id, {
      art: 'bild', rolle: b.rolle, url: b.src, beschriftung: b.farbe ?? null, breite: b.breite, hoehe: b.hoehe,
      pruefung: 'ok', datenschutz: 'ok', reihenfolge: i,
    }));
    neu.push({ id, art: k.art, titel: k.titel, punkte: k.punkte, grund: k.grund, handle: k.hauptHandle, neueFarben: Boolean(k.neueFarben) });
  }
  // Stand erst nach der Auswahl fortschreiben. Eine neue Farbe gilt erst als
  // bekannt, wenn daraus ein Anlass wurde - sonst ginge sie verloren, nur weil
  // der Vorrat dieses Laufs schon voll war.
  const gemeldet = new Set(neu.filter(n => n.neueFarben).map(n => n.handle));
  db.sql.exec('BEGIN');
  for (const p of produkte) {
    const alt = stand.get(p.handle);
    const felder = standAus(p, alt, jetzt);
    const hatNeueFarbe = Array.isArray(alt?.farben) && alt.farben.length && p.farben.some(f => !alt.farben.includes(f));
    if (hatNeueFarbe && !gemeldet.has(p.handle)) felder.farben = alt.farben;
    db.produktStandSetzen(p.handle, felder);
  }
  db.sql.exec('COMMIT');
  db.ereignis('shop-scout', 'shop-abgleich', null, { produkte: produkte.length, kandidaten: kandidaten.length, neu: neu.length });
  return { produkte: produkte.length, kandidaten: kandidaten.length, neu };
}

// --- Referenzen ---------------------------------------------------------------

/** Uebernimmt Referenzprojekte (Metaobjekt tp_projekt) als wiederverwendbare Inhalte. */
export function importiereReferenzen(db, knoten) {
  const neu = [];
  for (const k of knoten) {
    const feld = Object.fromEntries((k.fields ?? []).map(f => [f.key, f]));
    const bilder = [feld.titelbild?.reference, ...(feld.bilder?.references?.nodes ?? []), feld.vorher?.reference, feld.nachher?.reference]
      .filter(r => r?.image?.url);
    if (!bilder.length) continue;
    const { id, neu: angelegt } = db.inhaltAnlegen({
      quelle: 'referenz', typ: 'referenz', schluessel: `referenz:${k.handle}`,
      titel: feld.titel?.value ?? k.displayName, ort: feld.ort?.value ?? null,
      bodenart: feld.belag?.value ?? null,
      besonderheit: feld.beschreibung?.value ?? null,
      // Steht bereits oeffentlich in der Referenzgalerie des Shops.
      einwilligung: true, eingereicht_von: 'Referenzgalerie', punkte: 20,
      daten: { handle: k.handle, kategorie: feld.kategorie?.value ?? null, url: 'https://www.teppich-paradies.net/pages/unsere-arbeit', ortBekannt: Boolean(feld.ort?.value) },
    });
    if (!angelegt) continue;
    bilder.forEach((b, i) => {
      const lang = Math.max(b.image.width ?? 0, b.image.height ?? 0);
      db.mediumAnlegen(id, {
        art: 'bild', url: b.image.url, breite: b.image.width, hoehe: b.image.height, beschriftung: b.image.altText ?? null,
        rolle: b === feld.vorher?.reference ? 'vorher' : b === feld.nachher?.reference ? 'nachher' : null,
        pruefung: lang >= 1080 ? 'ok' : 'aussortiert', pruef_grund: lang >= 1080 ? null : 'zu klein',
        reihenfolge: i,
      });
    });
    db.inhaltAendern(id, { status: INHALT_STATUS.IN_PRUEFUNG });
    neu.push({ id, titel: feld.titel?.value ?? k.displayName, bilder: bilder.length });
  }
  db.ereignis('import', 'referenzen-import', null, { neu: neu.length });
  return neu;
}

// --- Planer -------------------------------------------------------------------

export function ladeLernstand(dir = socialDir()) {
  try { return JSON.parse(fs.readFileSync(lernstandPfad(dir), 'utf8')); } catch { return null; }
}

/** Schlaegt Termine fuer alle Entwuerfe vor, die keinen (oder einen verstrichenen) haben. */
export function planeOffene(db, { jetzt = new Date(), dir = socialDir() } = {}) {
  const mitInhalt = b => { const i = db.inhalt(b.inhalt_id); return { id: b.id, format: b.format, typ: i.typ, quelle: i.quelle, punkte: i.punkte, erstellt: b.erstellt, geplantAm: b.geplant_am }; };
  const entwuerfe = db.beitraege({ status: BEITRAG_STATUS.FREIGABE }).map(mitInhalt);
  const offen = entwuerfe.filter(b => !b.geplantAm || new Date(b.geplantAm) <= jetzt);
  // Auch was schon erschienen ist, belegt seinen Tag und zaehlt fuer die Woche -
  // sonst plant der Planer ein zweites Angebot in dieselbe Woche.
  const erschienen = db.veroeffentlichtSeit(new Date(jetzt.getTime() - 8 * 24 * STUNDE)).map(b => ({ ...mitInhalt(b), geplantAm: b.veroeffentlicht_am }));
  const belegt = [
    ...db.beitraege({ status: [BEITRAG_STATUS.GEPLANT, BEITRAG_STATUS.IN_ARBEIT] }).map(mitInhalt),
    ...entwuerfe.filter(b => !offen.includes(b)),
    ...erschienen,
  ];
  const plan = plane({ offen, belegt, jetzt, lernstand: ladeLernstand(dir) });
  for (const [id, zeit] of plan) db.beitragAendern(id, { geplant_am: zeit.toISOString() });
  return [...plan].map(([id, zeit]) => ({ id, geplantAm: zeit.toISOString() }));
}

// --- Publisher ----------------------------------------------------------------

export function clientAus(env, optionen = {}) {
  const k = metaKonfig(env);
  return { konfig: k, bereit: metaBereit(k), client: erstelleClient({ ...k, ...optionen }) };
}

function texteFuer(beitrag) {
  const tags = String(beitrag.hashtags ?? '').split(/\s+/).filter(Boolean);
  if (beitrag.format === 'story') return { instagram: '', facebook: '' };
  return {
    instagram: fertigerText({ text: beitrag.text, tags, plattform: 'instagram' }),
    facebook: fertigerText({ text: beitrag.text_facebook || beitrag.text, tags: tags.slice(0, 3), link: beitrag.link, plattform: 'facebook' }),
  };
}

/**
 * Veroeffentlicht, was faellig und freigegeben ist.
 *
 * Schutzregeln:
 *   - Beanspruchen vor dem ersten Aufruf (IN_ARBEIT): von zwei gleichzeitigen
 *     Laeufen postet genau einer, und die Zentrale kann den Beitrag waehrenddessen
 *     nicht veraendern.
 *   - Noch einmal pruefen: eine Freigabe von gestern gilt nicht, wenn heute ein
 *     Bild Bedenken bekommen hat oder das Material verworfen wurde.
 *   - Das Ergebnis jeder Plattform wird sofort gespeichert.
 *   - Unklare Fehler (Antwort nie gesehen) werden nie automatisch wiederholt.
 *   - Hoechstens ein Feed-Beitrag je Lauf; was laenger als 36 Stunden
 *     ueberfaellig ist, geht zurueck in die Freigabe.
 */
export async function veroeffentlicheFaellige(db, { env = process.env, jetzt = new Date(), trocken = false, dir = socialDir(), client = null, melde = () => {} } = {}) {
  const meta = client ? { client, bereit: true } : clientAus(env, { trocken, protokoll: melde });
  const bericht = { faellig: 0, veroeffentlicht: [], fehler: [], zurueck: [], uebersprungen: [], trocken };

  // Ein Lauf, der mitten im Veroeffentlichen abgebrochen ist, hinterlaesst IN_ARBEIT.
  // Ob der Beitrag erschienen ist, weiss dann nur ein Mensch.
  if (!trocken) {
    for (const b of db.haengende(new Date(jetzt.getTime() - 20 * 60 * 1000))) {
      db.beitragAendern(b.id, { status: BEITRAG_STATUS.FEHLER, fehler: 'Veröffentlichung wurde unterbrochen. Bitte auf Instagram und Facebook nachsehen, ob der Beitrag erschienen ist – dann verwerfen, sonst erneut freigeben.' });
      db.ereignis('publisher', 'fehler', `beitrag:${b.id}`, { meldungen: 'Lauf unterbrochen' });
      bericht.fehler.push({ id: b.id, meldung: 'Lauf unterbrochen', endgueltig: true });
    }
  }

  const faellig = db.faellige(jetzt);
  bericht.faellig = faellig.length;
  if (!faellig.length) return bericht;
  if (!meta.bereit && !trocken) {
    bericht.uebersprungen = faellig.map(b => b.id);
    bericht.hinweis = 'Kein Meta-Zugang eingerichtet – nichts veröffentlicht (social/META-EINRICHTUNG.md).';
    return bericht;
  }
  let feedErledigt = false;
  for (const beitrag of faellig) {
    const ueberfaellig = (jetzt.getTime() - new Date(beitrag.geplant_am).getTime()) / STUNDE;
    if (ueberfaellig > 36 && !trocken) {
      db.beitragAendern(beitrag.id, { status: BEITRAG_STATUS.FREIGABE, geplant_am: null, fehler: 'Termin verpasst (System war nicht erreichbar) – bitte neu freigeben.' });
      db.ereignis('publisher', 'termin-verpasst', `beitrag:${beitrag.id}`);
      bericht.zurueck.push(beitrag.id);
      continue;
    }
    if (beitrag.format !== 'story') {
      if (feedErledigt) { bericht.uebersprungen.push(beitrag.id); continue; }
      feedErledigt = true;
    }

    // Zweite Pruefung unmittelbar vor dem Veroeffentlichen.
    const inhalt = db.inhalt(beitrag.inhalt_id);
    const { sperren } = pruefe({ beitrag, inhalt, medien: medienZuBeitrag(db, beitrag) });
    if (inhalt.status === INHALT_STATUS.VERWORFEN) sperren.push('Das Material wurde nach der Freigabe verworfen.');
    if (sperren.length) {
      if (!trocken) {
        db.beitragAendern(beitrag.id, { status: BEITRAG_STATUS.FREIGABE, fehler: `Nach der Freigabe gesperrt: ${sperren.join(' · ')}` });
        db.ereignis('publisher', 'gesperrt', `beitrag:${beitrag.id}`, { sperren });
      }
      bericht.zurueck.push(beitrag.id);
      continue;
    }

    const dateien = beitrag.medien.map(m => ({ datei: medienPfad(m.pfad, dir), relativ: m.pfad, art: m.art }));
    const fehlt = dateien.find(d => !fs.existsSync(d.datei));
    if (fehlt) {
      if (!trocken) db.beitragAendern(beitrag.id, { status: BEITRAG_STATUS.FEHLER, fehler: `Bilddatei fehlt: ${path.basename(fehlt.datei)}` });
      bericht.fehler.push({ id: beitrag.id, meldung: 'Bilddatei fehlt' });
      continue;
    }
    if (trocken) {
      await veroeffentliche(meta.client, { beitrag, dateien, texte: texteFuer(beitrag), bisher: beitrag.ergebnis ?? {} });
      bericht.veroeffentlicht.push({ id: beitrag.id, trocken: true, plattformen: beitrag.plattformen });
      continue;
    }

    // Ab hier gehoert der Beitrag diesem Lauf - oder einem anderen, dann Finger weg.
    if (!db.beanspruche(beitrag.id)) { bericht.uebersprungen.push(beitrag.id); continue; }
    const { ergebnis, fehler, fertig } = await veroeffentliche(meta.client, {
      beitrag, dateien, texte: texteFuer(beitrag), bisher: beitrag.ergebnis ?? {},
      merke: stand => db.beitragAendern(beitrag.id, { ergebnis: stand }),
    });

    if (fertig) {
      db.beitragAendern(beitrag.id, { status: BEITRAG_STATUS.VEROEFFENTLICHT, veroeffentlicht_am: jetzt.toISOString(), ergebnis, fehler: null });
      for (const handle of inhalt.daten?.produkte ?? [inhalt.produkt_handle].filter(Boolean)) db.produktStandSetzen(handle, { zuletzt_beworben: jetzt.toISOString() });
      db.ereignis('publisher', 'veroeffentlicht', `beitrag:${beitrag.id}`, ergebnis);
      bericht.veroeffentlicht.push({ id: beitrag.id, ergebnis });
      continue;
    }
    const unklar = Object.values(fehler).some(e => e.unklar);
    const meldungen = Object.entries(fehler).map(([p, e]) => `${p}: ${e.message}`).join(' · ')
      + (unklar ? ' – Unklar, ob der Beitrag erschienen ist: bitte auf der Plattform nachsehen, bevor er erneut freigegeben wird.' : '');
    const versuche = beitrag.versuche + 1;
    const endgueltig = unklar || versuche >= 3 || Object.values(fehler).some(e => !e.voruebergehend);
    db.beitragAendern(beitrag.id, { status: endgueltig ? BEITRAG_STATUS.FEHLER : BEITRAG_STATUS.GEPLANT, ergebnis, versuche, fehler: meldungen });
    db.ereignis('publisher', endgueltig ? 'fehler' : 'neuer-versuch', `beitrag:${beitrag.id}`, { meldungen, versuche });
    bericht.fehler.push({ id: beitrag.id, meldung: meldungen, endgueltig });
    // Ein abgelaufener Token trifft jeden weiteren Beitrag genauso - abbrechen statt alle zu verbrennen.
    if (Object.values(fehler).some(e => e.zugang)) { bericht.hinweis = 'Meta-Zugang abgelehnt – Token prüfen (social/META-EINRICHTUNG.md).'; break; }
  }
  return bericht;
}

// --- Auswertung ---------------------------------------------------------------

export async function holeKennzahlen(db, { env = process.env, jetzt = new Date(), dir = socialDir(), client = null } = {}) {
  const meta = client ? { client, bereit: true } : clientAus(env);
  const bericht = { gemessen: 0, archiviert: 0, hinweis: null };
  const veroeffentlicht = db.beitraege({ status: BEITRAG_STATUS.VEROEFFENTLICHT });
  if (meta.bereit) {
    for (const b of veroeffentlicht) {
      const alter = (jetzt.getTime() - new Date(b.veroeffentlicht_am).getTime()) / (24 * STUNDE);
      // Story-Messwerte gibt es nur rund einen Tag lang.
      if (b.format === 'story' && alter > 1.2) continue;
      for (const plattform of b.plattformen) {
        const id = b.ergebnis?.[plattform]?.id;
        if (!id) continue;
        try {
          const roh = plattform === 'instagram' ? await meta.client.igKennzahlen(id, b.format) : await meta.client.fbKennzahlen(id);
          const k = vereinheitliche(roh);
          db.kennzahlSpeichern({ beitrag_id: b.id, plattform, ...k, punkte: punkte(k), roh });
          bericht.gemessen += 1;
        } catch (e) {
          if (e.zugang) { bericht.hinweis = 'Meta-Zugang abgelehnt – Token prüfen.'; break; }
        }
      }
      if (bericht.hinweis) break;
    }
  } else {
    bericht.hinweis = 'Kein Meta-Zugang – keine neuen Messwerte.';
  }
  // Nach 30 Tagen aendert sich an einem Beitrag kaum noch etwas: ins Archiv.
  for (const b of veroeffentlicht) {
    if ((jetzt.getTime() - new Date(b.veroeffentlicht_am).getTime()) / (24 * STUNDE) > 30) {
      db.beitragAendern(b.id, { status: BEITRAG_STATUS.ARCHIV });
      bericht.archiviert += 1;
    }
  }
  bericht.lernstand = schreibeLernstand(db, { jetzt, dir });
  return bericht;
}

export function schreibeLernstand(db, { jetzt = new Date(), dir = socialDir() } = {}) {
  const jeBeitrag = new Map();
  for (const k of db.letzteKennzahlen()) jeBeitrag.set(k.beitrag_id, (jeBeitrag.get(k.beitrag_id) ?? 0) + (k.punkte ?? 0));
  const zeilen = [];
  for (const [id, p] of jeBeitrag) {
    const b = db.beitrag(id); const i = b && db.inhalt(b.inhalt_id);
    if (!b || !i || !b.veroeffentlicht_am) continue;
    zeilen.push({ typ: i.typ, quelle: i.quelle, format: b.format, bodenart: i.bodenart, ort: i.ort, wochentag: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(b.veroeffentlicht_am).getDay()], punkte: p });
  }
  const stand = berechneLernstand(zeilen, jetzt);
  stand.erkenntnisse = erkenntnisse(stand);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lernstandPfad(dir), JSON.stringify(stand, null, 2));
  return stand;
}

// --- Sicherung ----------------------------------------------------------------

/**
 * Schreibt einen in sich stimmigen Abzug der Datenbank nach social/sicherung.db.
 * Die laufende Datei samt WAL zu kopieren waere nicht verlaesslich; VACUUM INTO
 * ist es. Den Abzug nimmt die taegliche Betriebssicherung mit
 * (operations/scripts/sicherung.mjs).
 */
export function sichereDatenbank(db, { dir = socialDir() } = {}) {
  const ziel = path.join(dir, 'sicherung.db');
  fs.rmSync(ziel, { force: true });
  db.sql.exec(`VACUUM INTO '${ziel.replace(/'/g, "''")}'`);
  return ziel;
}
