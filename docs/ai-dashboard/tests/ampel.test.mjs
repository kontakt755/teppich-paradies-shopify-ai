import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WARTESCHWELLEN, warteStufe, warteAmpel, warteWort, dringender, dringendereAmpel,
  hatBestellampel, bestellbarkeit, zaehleAmpeln, musterlagerAmpel, ZEICHEN,
} from '../lib/ampel.mjs';
import { SCHWELLEN_STANDARD, lieferantenKarten, warnstufe } from '../lib/einkauf-lieferanten.mjs';
import { SCHWELLEN } from '../lib/todos.mjs';
import { jeKommission } from '../lib/einkauf-uebersicht.mjs';
import { ampelPlakette, ampelRand } from '../bausteine/ampel.mjs';

// Erfundene Testdaten - keine Kunden, Lieferanten nur als Pseudonym.
const JETZT = new Date('2026-11-06T10:00:00Z');
const vor = tage => new Date(JETZT.getTime() - tage * 864e5).toISOString();

// ------------------------------------------------------------- eine Schwelle

test('Wartestand: eine Schwelle fuer alle Ansichten (gelb ab 7, rot ab 14 Tagen)', () => {
  assert.deepEqual(WARTESCHWELLEN, { nachhakenTage: 7, problemTage: 14 });
  assert.equal(SCHWELLEN_STANDARD, WARTESCHWELLEN, 'Je Lieferant');
  assert.equal(SCHWELLEN, WARTESCHWELLEN, 'To-dos auf Heute');
  assert.deepEqual([6, 7, 13, 14, null].map(t => warteStufe(t)), [null, 'gelb', 'gelb', 'rot', null]);
  assert.deepEqual([6, 7, 14].map(t => warnstufe(t)), [null, 'warn', 'crit'], 'aeltere Klassen folgen derselben Regel');
});

test('warteAmpel: bestellt, eingetroffen, Termin, blockiert, gesperrt', () => {
  const w = (eintrag, opt = {}) => warteAmpel(eintrag, { jetzt: JETZT, ...opt });
  assert.deepEqual(w({ status: 'bestellt', bestelltAm: vor(9) }), { stufe: 'gelb', grund: 'wartet', tage: 9, termin: null });
  assert.equal(w({ status: 'bestellt', bestelltAm: vor(15) }).stufe, 'rot');
  assert.equal(w({ status: 'geliefert', geliefertAm: vor(8) }).stufe, 'gelb', 'liegt bei uns: dieselbe Schwelle');
  assert.deepEqual(w(null), { stufe: null, grund: null, tage: null, termin: null }, 'noch nicht bestellt: wartet nicht');
  const imPlan = w({ status: 'bestellt', bestelltAm: vor(30), beschaffung: { liefertermin: '2026-11-10' } });
  assert.deepEqual([imPlan.stufe, imPlan.grund, imPlan.tage], [null, 'imPlan', null], 'Termin vor uns: ruhig, egal wie lange bestellt');
  const vorbei = w({ status: 'bestellt', bestelltAm: vor(2), beschaffung: { liefertermin: '2026-11-04' } });
  assert.deepEqual([vorbei.stufe, vorbei.grund, vorbei.tage], ['rot', 'termin', 2], 'Termin vorbei: sofort rot');
  assert.equal(w(null, { blockiert: true }).stufe, 'rot');
  assert.equal(w({ status: 'bestellt', bestelltAm: vor(1) }, { gesperrt: true }).grund, 'gesperrt');
});

test('Plakette sagt Zeichen und Wort, nie nur Farbe', () => {
  assert.equal(warteWort({ stufe: 'rot', grund: 'wartet', tage: 15 }), 'Überfällig · 15 Tage');
  assert.equal(warteWort({ stufe: 'gelb', grund: 'wartet', tage: 9 }), 'Nachhaken · 9 Tage');
  assert.equal(warteWort({ stufe: 'rot', grund: 'termin', tage: 2, termin: '2026-11-04' }), 'Termin 04.11. vorbei');
  assert.equal(warteWort({ stufe: 'rot', grund: 'blockiert' }), 'Blockiert');
  assert.equal(warteWort({ stufe: null, grund: 'wartet', tage: 1 }), '1 Tag');
  const html = ampelPlakette('rot', 'Blockiert');
  assert.match(html, /class="ampel ampel-rot"/);
  assert.match(html, new RegExp(`aria-hidden="true">${ZEICHEN.rot}</span>Blockiert`));
  assert.equal(ampelPlakette(null, 'Läuft'), '', 'ruhig: keine Plakette');
  assert.match(ampelPlakette(null, 'Läuft', { haken: true }), /ampel-ruhig.*✓.*Läuft/, 'hoechstens ein leiser Haken');
  assert.equal(ampelRand('gelb', 'karte'), ' ampel-karte gelb');
  assert.equal(ampelRand(null), '');
  assert.match(ampelPlakette('rot', '<b>'), /&lt;b&gt;/, 'Wort wird maskiert');
});

test('dringender: rot vor gelb vor ruhig, bei Gleichstand das laengere Warten', () => {
  assert.equal(dringender('gelb', 'rot'), 'rot');
  assert.equal(dringender(null, 'gelb'), 'gelb');
  assert.equal(dringender('gelb', null), 'gelb');
  assert.equal(dringendereAmpel({ stufe: 'gelb', tage: 8 }, { stufe: 'gelb', tage: 12 }).tage, 12);
  assert.equal(dringendereAmpel({ stufe: 'rot', tage: 1 }, { stufe: 'gelb', tage: 12 }).stufe, 'rot');
  assert.equal(dringendereAmpel(null, { stufe: null, tage: 3 }).tage, 3);
});

// ------------------------------------------------------------- Je Lieferant

const pos = (id, extra = {}) => ({ orderId: `o-${id}`, orderName: `#T${id}`, lineItemId: id, titel: `Artikel ${id}`, ...extra });

test('Je Lieferant: Termin vorbei ist rot und steht unter Nachfassen; blockiert und gesperrt faerben nur die Zeile', () => {
  const stand = {
    t1: { status: 'bestellt', bestelltAm: vor(3), beschaffung: { liefertermin: '2026-11-05' } },
    w1: { status: 'bestellt', bestelltAm: vor(8) },
    m1: { status: 'bestellt', bestelltAm: vor(20) },
  };
  const [k] = lieferantenKarten({
    gruppen: [{ lieferant: 'A', positionen: [pos('t1'), pos('w1'), pos('b1')] }],
    musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true })] }],
    eintragFuer: p => stand[p.lineItemId] || null,
    blockiert: p => p.lineItemId === 'b1',
    gesperrt: p => p.lineItemId === 'm1',
    jetzt: JETZT,
  });
  const je = id => [...k.ware.bestellt, ...k.ware.zuBestellen, ...k.muster.bestellt].find(x => x.pos.lineItemId === id);
  assert.deepEqual([je('t1').warnstufe, je('t1').ampel.grund], ['crit', 'termin'], 'vorher erst 14 Tage nach dem Termin');
  assert.deepEqual([je('w1').warnstufe, je('w1').ampel.stufe], ['warn', 'gelb']);
  assert.deepEqual([je('b1').warnstufe, je('b1').ampel.stufe, je('b1').ampel.grund], [null, 'rot', 'blockiert']);
  assert.deepEqual([je('m1').warnstufe, je('m1').ampel.grund], [null, 'gesperrt'], 'gesperrt, seit 20 Tagen bestellt: kommt nicht mehr, kein Nachhaken');
  assert.deepEqual(k.ueberfaellig.positionen.map(x => x.pos.lineItemId).sort(), ['t1', 'w1']);
  assert.equal(k.ueberfaellig.stufe, 'crit');
});

test('Muster je Kommission tragen die dringendste Ampel', () => {
  const g = jeKommission([
    { pos: pos('a', { orderId: 'o1', istMuster: true }), wartetage: 2, warnstufe: null, ampel: { stufe: null, tage: 2 } },
    { pos: pos('b', { orderId: 'o1', istMuster: true }), wartetage: 2, warnstufe: null, ampel: { stufe: 'rot', grund: 'gesperrt', tage: 2 } },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].ampel.grund, 'gesperrt');
});

// ------------------------------------------------------------- Lexikon

const variante = (extra = {}) => ({
  id: `v-${Math.random()}`, sku: 'TP-1', farbe: 'Grau', verfuegbar: true,
  einkauf: { lieferant: 'A', artikelnummer: 'A-1', produktname: 'Ware A', bestelleinheit: 'paket', farbnummer: '01', url: null },
  link: { status: 'nur_artikelnummer' }, ...extra,
});
const produkt = (varianten, extra = {}) => ({ handle: 'ware-grau', status: 'ACTIVE', produktgruppe: 'Teppichboden', musterRegeln: { tags: [] }, varianten, ...extra });
const ohne = (feld, extra = {}) => variante({ einkauf: { ...variante().einkauf, [feld]: null }, ...extra });

test('Lexikon: ruhig, wenn bestellbar - blosse Nachtragsangaben zaehlen nicht', () => {
  const a = bestellbarkeit(produkt([variante({ einkauf: { ...variante().einkauf, url: null, farbnummer: null } })]));
  assert.deepEqual([a.stufe, a.text], [null, ''], 'Link fehlt, Farbnummer fehlt: kein Befund');
  assert.equal(bestellbarkeit(produkt([variante()]), { raumbild: null }).stufe, null, 'Raumbild unbekannt: nie eine Warnung');
});

test('Lexikon rot: Lieferant, Artikelnummer oder Bestelleinheit fehlt, oder nichts lieferbar', () => {
  assert.deepEqual(bestellbarkeit(produkt([ohne('bestelleinheit'), ohne('bestelleinheit')])), { stufe: 'rot', wort: 'Blockiert', text: 'Bestelleinheit fehlt', gruende: ['Bestelleinheit fehlt'] });
  const teil = bestellbarkeit(produkt([ohne('lieferant'), variante(), variante()]));
  assert.equal(teil.text, 'Lieferant fehlt bei 1 von 3 Varianten');
  const beides = bestellbarkeit(produkt([variante({ einkauf: { ...variante().einkauf, artikelnummer: null, produktname: null, bestelleinheit: null } })]));
  assert.equal(beides.text, 'Artikelnummer und Bestelleinheit fehlen');
  // Ohne Artikelnummer, aber mit Bestellbezeichnung des Lieferanten (Teppich nach Mass direkt vom Hersteller): bestellbar.
  assert.equal(bestellbarkeit(produkt([ohne('artikelnummer')])).stufe, null);
  const nichts = bestellbarkeit(produkt([variante({ verfuegbar: false }), variante({ verfuegbar: false, farbe: 'Beige' })]));
  assert.deepEqual([nichts.stufe, nichts.text], ['rot', 'Nicht lieferbar']);
});

test('Lexikon: Wunschmass und Mustervarianten zaehlen nicht als fehlende Angabe', () => {
  const wunsch = ohne('artikelnummer', { wunschmass: true, einkauf: { lieferant: 'A', bestelleinheit: 'lfm' } });
  assert.equal(bestellbarkeit(produkt([variante(), wunsch])).stufe, null, 'wird erst beim Zuschnitt bestellt');
  assert.equal(bestellbarkeit(produkt([variante(), ohne('lieferant', { sku: 'M-TP-1' })])).stufe, null);
  assert.equal(bestellbarkeit(produkt([variante(), ohne('lieferant', { original: { gefunden: true } })])).stufe, null);
});

test('Lexikon gelb: einzelne Farben nicht lieferbar oder sicher kein Raumbild', () => {
  const farben = bestellbarkeit(produkt([variante({ farbe: 'Grau', verfuegbar: false }), variante({ farbe: 'Beige' }), variante({ farbe: 'Sand' })]));
  assert.deepEqual([farben.stufe, farben.wort, farben.text], ['gelb', 'Teilweise lieferbar', '1 von 3 Farben nicht lieferbar']);
  // Eine Farbe, mehrere Groessen: dann sind es Varianten, keine Farben.
  const groessen = bestellbarkeit(produkt([variante({ titel: 'Grau / 80 × 150 cm', verfuegbar: false }), variante({ titel: 'Grau / 120 × 170 cm' })]));
  assert.equal(groessen.text, '1 von 2 Varianten nicht lieferbar');
  const raum = bestellbarkeit(produkt([variante()]), { raumbild: false });
  assert.deepEqual([raum.stufe, raum.wort, raum.text], ['gelb', 'Kein Raumbild', '']);
  const beides = bestellbarkeit(produkt([variante({ farbe: 'Grau', verfuegbar: false }), variante({ farbe: 'Beige' })]), { raumbild: false });
  assert.equal(beides.text, '1 von 2 Farben nicht lieferbar · Kein Raumbild');
  // Rot schlaegt gelb, der Grund nennt das Rote.
  const rot = bestellbarkeit(produkt([ohne('bestelleinheit')]), { raumbild: false });
  assert.deepEqual([rot.stufe, rot.text], ['rot', 'Bestelleinheit fehlt']);
  assert.equal(bestellbarkeit(produkt([variante()]), { raumbild: true }).stufe, null);
});

test('Lexikon: keine Ampel fuer Muster, Service, Gutschein, eigenen Bestand und nicht aktive Produkte', () => {
  const leer = [ohne('lieferant')];
  assert.equal(bestellbarkeit(produkt(leer, { handle: 'muster-ware-grau' })), null);
  assert.equal(bestellbarkeit(produkt(leer, { produktgruppe: 'Musterservice' })), null);
  assert.equal(bestellbarkeit(produkt(leer, { produktgruppe: 'Geschenkgutschein', musterRegeln: { geschenkgutschein: true, tags: [] } })), null);
  assert.equal(bestellbarkeit(produkt(leer, { musterRegeln: { tags: ['sonderposten', 'rest-rollenquelle'] } })), null, 'Restrolle aus eigenem Bestand');
  assert.equal(bestellbarkeit(produkt(leer, { handle: 'ware-grau-sonderposten' })), null);
  assert.equal(bestellbarkeit(produkt(leer, { status: 'UNLISTED' })), null);
  assert.equal(hatBestellampel(produkt(leer, { status: 'active' })), true, 'Status in Kleinschrift wie im Export');
});

test('Lexikon: Kopfzahlen zaehlen nur Produkte mit Ampel', () => {
  assert.deepEqual(zaehleAmpeln([null, { stufe: 'rot' }, { stufe: 'gelb' }, { stufe: 'gelb' }, { stufe: null }]), { rot: 1, gelb: 2, ruhig: 1 });
});

// ------------------------------------------------------------- Musterlager

test('Musterlager: leer oder aufgebraucht rot, knapp gelb, sonst ruhig', () => {
  assert.deepEqual(musterlagerAmpel({ leer: true }), { stufe: 'rot', wort: 'Leer' });
  assert.equal(musterlagerAmpel({ zaehlbar: true, nochDa: 0 }).wort, 'Aufgebraucht');
  assert.deepEqual(musterlagerAmpel({ zaehlbar: true, nochDa: 2, frei: 0 }), { stufe: 'gelb', wort: 'Knapp' }, 'alles zurueckgelegt');
  assert.equal(musterlagerAmpel({ zaehlbar: true, nochDa: 1, frei: 1 }).stufe, null, 'Einzelmuster werden nicht auf Vorrat nachbestellt');
  assert.equal(musterlagerAmpel({ reichtNoch: 0 }).stufe, 'rot');
  assert.deepEqual(musterlagerAmpel({ reichtNoch: 5, knappAb: 5 }), { stufe: 'gelb', wort: 'Knapp' });
  assert.equal(musterlagerAmpel({ reichtNoch: 6, knappAb: 5 }).stufe, null);
  assert.equal(musterlagerAmpel({ reichtNoch: null }).stufe, null, 'ohne Schaetzung: ruhig');
});
