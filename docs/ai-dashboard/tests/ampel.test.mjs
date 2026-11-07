import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WARTESCHWELLEN, warteStufe, warteAmpel, warteWort, warteTitel, tageMitBezug, dringender, dringendereAmpel,
  hatBestellampel, bestellbarkeit, zaehleAmpeln, musterlagerAmpel, ZEICHEN,
  packMusterAmpel, packUmschlagAmpel, packRotZaehlung,
} from '../lib/ampel.mjs';
import { automatikHaengtWerktage, MUSTER_KLAER_WERKTAGE, FRISTEN } from '../lib/todos.mjs';
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
  assert.deepEqual(w({ status: 'bestellt', bestelltAm: vor(9) }), { stufe: 'gelb', grund: 'wartet', tage: 9, termin: null, bezug: 'lieferant' });
  assert.equal(w({ status: 'bestellt', bestelltAm: vor(15) }).stufe, 'rot');
  assert.deepEqual([w({ status: 'geliefert', geliefertAm: vor(8) }).stufe, w({ status: 'geliefert', geliefertAm: vor(8) }).bezug], ['gelb', 'hier'], 'liegt bei uns: dieselbe Schwelle, Bezug "hier"');
  assert.deepEqual(w(null), { stufe: null, grund: null, tage: null, termin: null, bezug: null }, 'noch nicht bestellt: wartet nicht');
  const imPlan = w({ status: 'bestellt', bestelltAm: vor(30), beschaffung: { liefertermin: '2026-11-10' } });
  assert.deepEqual([imPlan.stufe, imPlan.grund, imPlan.tage], [null, 'imPlan', null], 'Termin vor uns: ruhig, egal wie lange bestellt');
  const vorbei = w({ status: 'bestellt', bestelltAm: vor(2), beschaffung: { liefertermin: '2026-11-04' } });
  assert.deepEqual([vorbei.stufe, vorbei.grund, vorbei.tage, vorbei.bezug], ['rot', 'termin', 2, 'lieferant'], 'Termin vorbei: sofort rot');
  assert.equal(w(null, { blockiert: true }).stufe, 'rot');
  assert.equal(w({ status: 'bestellt', bestelltAm: vor(1) }, { gesperrt: true }).grund, 'gesperrt');
});

test('Plakette sagt Zeichen und Wort, nie nur Farbe', () => {
  assert.equal(warteWort({ stufe: 'rot', grund: 'wartet', tage: 15 }), 'Überfällig · 15 Tage', 'ohne Bezug wie bisher');
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

test('Tageszahl nennt ihren Bezug (#1996): beim Lieferanten, hier, Kunde wartet - Stufe bleibt', () => {
  const w = eintrag => warteAmpel(eintrag, { jetzt: JETZT });
  const rot = w({ status: 'bestellt', bestelltAm: vor(17) });
  const gelb = w({ status: 'bestellt', bestelltAm: vor(9) });
  const hier = w({ status: 'geliefert', geliefertAm: vor(8) });
  const hierRot = w({ status: 'geliefert', geliefertAm: vor(15) });
  assert.deepEqual([rot.stufe, warteWort(rot)], ['rot', 'Überfällig · 17 Tage beim Lieferanten']);
  assert.deepEqual([gelb.stufe, warteWort(gelb)], ['gelb', 'Nachhaken · 9 Tage beim Lieferanten']);
  assert.deepEqual([hier.stufe, warteWort(hier)], ['gelb', 'Liegt seit 8 Tagen hier'], 'bei uns ist nicht der Lieferant dran: kein "Nachhaken"');
  assert.deepEqual([hierRot.stufe, warteWort(hierRot)], ['rot', 'Liegt seit 15 Tagen hier'], 'Stufe und Zeichen bleiben, nur das Wort ändert sich');
  assert.equal(warteTitel(rot), 'Seit 17 Tagen beim Lieferanten bestellt – ab 14 Tagen überfällig');
  assert.equal(warteTitel(gelb), 'Seit 9 Tagen beim Lieferanten bestellt – ab 7 Tagen nachhaken');
  assert.equal(warteTitel(hier), 'Seit 8 Tagen bei uns – an den Kunden rausgeben');
  const termin = w({ status: 'bestellt', bestelltAm: vor(2), beschaffung: { liefertermin: '2026-11-04' } });
  assert.equal(warteWort(termin), 'Termin 04.11. vorbei', 'Termin: das Datum sagt es');
  assert.deepEqual([0, 1, 17].map(t => tageMitBezug(t, 'lieferant')), ['seit heute beim Lieferanten', '1 Tag beim Lieferanten', '17 Tage beim Lieferanten']);
  assert.deepEqual([0, 1, 8].map(t => tageMitBezug(t, 'hier')), ['Liegt seit heute hier', 'Liegt seit 1 Tag hier', 'Liegt seit 8 Tagen hier']);
  assert.deepEqual([0, 1, 17].map(t => tageMitBezug(t, 'kunde')), ['Kunde wartet seit heute', 'Kunde wartet 1 Tag', 'Kunde wartet 17 Tage']);
  assert.deepEqual([tageMitBezug(5), tageMitBezug(null, 'hier')], ['5 Tage', '']);
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

// ------------------------------------------------------------- Packstation

test('Packstation je Muster: im Haus ruhig, beim Lieferanten 7/14 Tage wie ueberall, kommt nicht und Zuordnung fehlt rot', () => {
  const a = (m, jetzt = JETZT) => packMusterAmpel({ fehlt: [], stand: 'bestellt', ...m }, { jetzt });
  const kurz = x => [x.stufe, x.grund, x.wort];
  assert.deepEqual(kurz(a({ stand: 'da', bestelltAm: vor(30) })), [null, null, ''], 'angekommen: ruhig, auch nach 30 Tagen');
  assert.deepEqual(kurz(a({ stand: 'lager' })), [null, null, ''], 'aus dem Musterlager');
  assert.deepEqual(kurz(a({ abgehakt: { zeit: vor(1) }, bestelltAm: vor(20) })), [null, null, ''], 'liegt im Umschlag');
  // Die fruehere Schwelle der Packstation ("wartet ab 2 Tagen") gibt es nicht mehr.
  assert.equal(a({ bestelltAm: vor(2) }).stufe, null, '2 Tage: ruhig');
  assert.equal(a({ bestelltAm: vor(6) }).stufe, null);
  assert.deepEqual(kurz(a({ bestelltAm: vor(7) })), ['gelb', 'nachhaken', 'Nachhaken · 7 Tage beim Lieferanten']);
  assert.deepEqual(kurz(a({ bestelltAm: vor(14) })), ['rot', 'ueberfaellig', 'Überfällig · 14 Tage beim Lieferanten']);
  assert.deepEqual(kurz(a({ bestelltAm: vor(3), liefertermin: '2026-11-04' })), ['rot', 'termin', 'Termin 04.11. vorbei']);
  assert.equal(a({ bestelltAm: vor(20), liefertermin: '2026-11-10' }).stufe, null, 'bestaetigter Termin vor uns: ruhig');
  assert.equal(a({ bestelltAm: null }).stufe, null, 'ohne Bestelldatum keine Wartezeit');
  assert.deepEqual(kurz(a({ gesperrt: { imShop: true }, bestelltAm: vor(1) })), ['rot', 'kommtNicht', 'Kommt nicht']);
  assert.deepEqual(kurz(a({ stand: 'da', fehlt: ['Farbe'] })), ['rot', 'zuordnung', 'Zuordnung fehlt'], 'ohne Aufkleber wird nie gepackt, auch wenn es da ist');
  assert.deepEqual(kurz(a({ stand: 'offen' })), ['gelb', 'nichtBestellt', 'Nicht bestellt']);
  assert.deepEqual(kurz(a({ stand: 'offen', haengtWerktage: 3 })), ['rot', 'haengt', 'Hängt · 3 Werktage']);
  for (const x of [a({ bestelltAm: vor(9) }), a({ stand: 'offen' }), a({ gesperrt: { imShop: false } })]) assert.ok(x.titel, `Tooltip zu ${x.wort}`);
  // Gesperrt geht vor fehlender Zuordnung: dann muss der Kunde informiert werden (Review #1975).
  assert.deepEqual(kurz(a({ gesperrt: { imShop: true }, fehlt: ['Farbe'] })), ['rot', 'kommtNicht', 'Kommt nicht']);
});

test('Packstation: nie bestellt wird rot wie das To-do "Muster bei … bestellen" auf Heute, auch ohne Musterautomatik', () => {
  assert.deepEqual(FRISTEN.bestellen, [3, 7], 'dieselbe Frist wie Heute');
  const rotAb = FRISTEN.bestellen[1];
  const a = m => packMusterAmpel({ fehlt: [], stand: 'offen', ...m }, { jetzt: JETZT, bestellenRotAb: rotAb });
  const kurz = x => [x.stufe, x.grund, x.wort];
  assert.deepEqual(kurz(a({ offenTage: 6 })), ['gelb', 'nichtBestellt', 'Nicht bestellt']);
  assert.deepEqual(kurz(a({ offenTage: 7 })), ['rot', 'ueberfaellig', 'Nicht bestellt · 7 Tage']);
  assert.match(a({ offenTage: 7 }).titel, /ab 7 Tagen überfällig/);
  assert.deepEqual(kurz(a({ offenTage: 11, haengtWerktage: 3 })), ['rot', 'haengt', 'Hängt · 3 Werktage'], 'haengt bei der Automatik: deren Grund zuerst');
  assert.deepEqual(kurz(packMusterAmpel({ fehlt: [], stand: 'offen', offenTage: 20 }, { jetzt: JETZT })), ['gelb', 'nichtBestellt', 'Nicht bestellt'], 'ohne Frist vom Aufrufer keine eigene Schwelle');
  assert.equal(a({ stand: 'bestellt', offenTage: 20, bestelltAm: vor(2) }).stufe, null, 'nur fuer nie Bestelltes');
  const u = packUmschlagAmpel({ bereich: 'warten', muster: [{ ampel: a({ offenTage: 11 }) }, { ampel: { stufe: 'gelb', grund: 'nachhaken', wort: 'Nachhaken · 9 Tage', tage: 9 } }], hinweise: [], adressFehlt: [] });
  assert.deepEqual([u.stufe, u.grund, u.wort], ['rot', 'ueberfaellig', 'Nicht bestellt · 11 Tage']);
  assert.deepEqual(packRotZaehlung([{ ampel: u }]), { n: 1, wort: 'überfällig' });
});

test('Packstation: "haengt" nach derselben Regel wie das rote To-do auf Heute', () => {
  assert.equal(MUSTER_KLAER_WERKTAGE, 1);
  // Freitag 06.11.: seit Mittwoch 2 Werktage (Do, Fr), seit Donnerstag 1.
  assert.equal(automatikHaengtWerktage('2026-11-04T09:00:00Z', JETZT), 2);
  assert.equal(automatikHaengtWerktage('2026-11-05T09:00:00Z', JETZT), null);
  assert.equal(automatikHaengtWerktage('kaputt', JETZT), null);
});

test('Packstation je Umschlag: dringendstes Muster, nie eingetragen und Versandhinweis rot, Zu klaeren mindestens gelb', () => {
  const m = (ampel, extra = {}) => ({ ampel, ...extra });
  const ruhig = { stufe: null, grund: null, wort: '' };
  const gelb = (tage = 9) => ({ stufe: 'gelb', grund: 'nachhaken', wort: `Nachhaken · ${tage} Tage`, tage });
  const rot = (tage = 15) => ({ stufe: 'rot', grund: 'ueberfaellig', wort: `Überfällig · ${tage} Tage`, tage });
  const kommtNicht = { stufe: 'rot', grund: 'kommtNicht', wort: 'Kommt nicht' };
  const u = (k, opt) => packUmschlagAmpel({ bereich: 'warten', muster: [], hinweise: [], adressFehlt: [], ...k }, opt);
  const kurz = x => [x.stufe, x.wort];
  assert.deepEqual(kurz(u({ bereich: 'packen', muster: [m(ruhig), m(ruhig)] })), [null, ''], 'packbereit ohne Befund: ruhig');
  assert.deepEqual(kurz(u({ muster: [m(ruhig), m(gelb(8)), m(gelb(12))] })), ['gelb', 'Nachhaken · 12 Tage'], 'gleiche Stufe: das laengere Warten');
  assert.deepEqual(kurz(u({ muster: [m(gelb()), m(rot(16))] })), ['rot', 'Überfällig · 16 Tage']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', muster: [m(rot()), m(kommtNicht), m(kommtNicht)] })), ['rot', '2 Muster kommen nicht'], 'kommt nicht vor dem Warten, mit Anzahl');
  assert.deepEqual(kurz(u({ bereich: 'klaeren', muster: [m(kommtNicht)] })), ['rot', '1 Muster kommt nicht']);
  const gesperrtOhneZuordnung = packMusterAmpel({ stand: 'bestellt', gesperrt: { imShop: true }, fehlt: ['Farbe'] }, { jetzt: JETZT });
  assert.deepEqual(kurz(u({ bereich: 'klaeren', muster: [m(gesperrtOhneZuordnung)] })), ['rot', '1 Muster kommt nicht'], 'auch ohne Zuordnung steht "kommt nicht" im Kopf');
  assert.deepEqual(kurz(u({ bereich: 'gepackt', muster: [m(ruhig)] })), ['rot', 'Nicht eingetragen'], 'Altfall: gepackt, nie eingetragen');
  assert.deepEqual(kurz(u({ bereich: 'gepackt', muster: [m(ruhig)] }, { versandProblem: 'Shopify nicht erreicht' })), ['rot', 'Nicht eingetragen']);
  const versand = u({ bereich: 'packen', muster: [m(ruhig)] }, { versandProblem: 'Shopify nicht erreicht' });
  assert.deepEqual([versand.stufe, versand.wort, versand.titel], ['rot', 'Versand nicht eingetragen', 'Shopify nicht erreicht']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', adressFehlt: ['PLZ'], muster: [m(gelb())] })), ['rot', 'Adresse fehlt']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', klaeren: { fehlt: ['x'] }, muster: [m(ruhig)] })), ['gelb', 'Fehlt noch']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', direktversand: true, hinweise: ['Direktversand'], muster: [m(ruhig)] })), ['gelb', 'Direktversand prüfen']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', hinweise: ['Teilweise erstattet'], muster: [m(ruhig)] })), ['gelb', 'Restumfang prüfen']);
  assert.deepEqual(kurz(u({ bereich: 'klaeren', muster: [m(ruhig)] })), ['gelb', 'Zu klären'], 'unter Zu klären nie ruhig');
  assert.deepEqual(kurz(u({ bereich: 'klaeren', klaeren: { fehlt: ['x'] }, muster: [m(gelb(10))] })), ['gelb', 'Nachhaken · 10 Tage'], 'das Warten beim Lieferanten sagt mehr');
});

test('Packstation Reiter: Zahl roter Umschlaege mit einem Wort', () => {
  const k = (grund, stufe = 'rot') => ({ ampel: { stufe, grund } });
  assert.deepEqual(packRotZaehlung([k('ueberfaellig'), k('termin'), k('haengt'), k('nachhaken', 'gelb'), {}]), { n: 3, wort: 'überfällig' });
  assert.deepEqual(packRotZaehlung([k('kommtNicht'), k('zuordnung'), k('adresse')]), { n: 3, wort: 'blockiert' });
  assert.deepEqual(packRotZaehlung([k('nichtEingetragen'), k('versand')]), { n: 2, wort: 'nicht eingetragen' });
  assert.deepEqual(packRotZaehlung([k('kommtNicht'), k('ueberfaellig')]), { n: 2, wort: 'dringend' }, 'gemischt');
  assert.deepEqual(packRotZaehlung([k('nachhaken', 'gelb')]), { n: 0, wort: 'dringend' });
});
