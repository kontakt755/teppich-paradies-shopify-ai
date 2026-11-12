import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bestellWarnung, kettelwegVergleich, warnungenAnhaengen, warnungFuerMitarbeiter, leseEkListe, leseLieferkosten } from '../lib/bestellwarnung.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';

// Nur Beispielwerte: erfundene Artikel, Preise und Kostensaetze.
const EK = zeilen => ({ verfuegbar: true, stand: '2099-01-01', zeilen: new Map(zeilen.map(z => [z.artikelnummer, [z]])), handles: new Map() });
const eZeile = (artikelnummer, ek, extra = {}) => ({ artikelnummer, handle: 'test', bezug: 'm²', vk_einheit: 'm²', ek_bezug: ek, ek_vk_einheit: ek, sicherheit: 'belegt', variante: 'Test / 400 cm', ...extra });
const KOSTEN = {
  lieferanten: {
    A: { paket: 5, paketBisCm: 200, paketBisKg: 30, fracht: 20, mindermenge: 10, mindermengeUnterEk: 100, ekAufschlag: 0, anKundenNurImLiefergebiet: false },
    T: { paket: null, paketBisCm: null, paketBisKg: null, fracht: 8, mindermenge: null, mindermengeUnterEk: null, ekAufschlag: 0, anKundenNurImLiefergebiet: true },
  },
  kettler: { bis6qmJeLfm: 2, ab6qmJeLfm: 3 },
};
const pos = (id, extra = {}) => ({ lineItemId: id, orderId: 'o1', titel: 'Testboden', handle: 'test', farbe: 'Test', lieferant: 'A', istMuster: false, eigenleistung: false,
  grosshaendlerId: 'ART-1', sku: 'ART-1', mengeBestellt: 10, nettoGesamt: 100, masspruefung: { einheit: 'm²' }, ausfuehrung: [], bestellmenge: { menge: 2.5, einheit: 'lfm', text: '2,5 lfm' }, ...extra });
const auftrag = (positionen, plz = '50000', extra = {}) => ({ id: 'o1', name: '#T1', positionen, details: { lieferadresse: { plz, ort: 'Teststadt', land: 'Deutschland' }, summen: { versand: { betrag: 0 } } }, ...extra });
const basis = { kosten: KOSTEN, tarif: null, absender: { kettelservice: { plz: '10000' } }, nahPlz: /^1/, jetzt: new Date('2099-01-01T10:00:00Z'), lieferantName: id => `Lieferant ${id}` };
const inMail = (positionen, lieferziel = 'kunde', teiler = 1) => [{ lieferziel, positionen, teiler }];
const warne = (a, mail, extra = {}) => bestellWarnung({ ...basis, ek: EK([eZeile('ART-1', 3)]), auftrag: a, mailsMitPosition: mail, ...extra });

test('Normalfall: kein Hinweis', () => {
  const p = pos('l1', { nettoGesamt: 300 });
  assert.equal(warne(auftrag([p]), inMail([p])), null);
});

test('Verlust: Rohertrag negativ, mit Rechnung und Stufe crit', () => {
  const p = pos('l1', { nettoGesamt: 40 });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 3)]) });
  assert.equal(w.stufe, 'crit');
  assert.match(w.kopf, /Verlust wahrscheinlich/);
  // 40 Verkauf - 30 Einkauf - 20 Fracht - 10 Mindermenge
  assert.equal(w.rohertrag, -20);
  assert.deepEqual(w.rechnung.map(z => z.betrag), [40, -30, -30, -20]);
});

test('Niedriger Rohertrag: warn', () => {
  const p = pos('l1', { nettoGesamt: 80 });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 4)]) });
  assert.equal(w.stufe, 'warn');
  assert.match(w.kopf, /Rohertrag niedrig/);
});

test('Fehlender Einkaufspreis: "Rohertrag unbekannt", nie eine Zahl', () => {
  const p = pos('l1');
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([]) });
  assert.equal(w.rohertrag, null);
  assert.equal(w.stufe, 'leise');
  assert.equal(w.kopf, 'Rohertrag unbekannt');
  assert.ok(!w.rechnung.some(z => z.ergebnis));
  assert.ok(w.anmerkungen.some(a => /Einkaufspreis fehlt/.test(a)));
  assert.ok(w.anmerkungen.some(a => /bleiben höchstens/.test(a)));
});

test('Offen markierte Listenzeile zaehlt nicht als Einkaufspreis', () => {
  const p = pos('l1');
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 3, { sicherheit: 'offen' })]) });
  assert.equal(w.rohertrag, null);
});

test('Ohne Einkaufspreis warnt ein teurer Weg trotzdem, ein kleines Paket nicht', () => {
  const gross = pos('l1', { nettoGesamt: 90 });
  const w = warne(auftrag([gross]), inMail([gross]), { ek: EK([]) });
  assert.equal(w.stufe, 'warn');
  assert.match(w.kopf, /Rohertrag unbekannt, Weg zum Kunden teuer/);
  const klein = pos('l2', { nettoGesamt: 15, masspruefung: {}, bestellmenge: { menge: 1, einheit: 'stueck' }, mengeBestellt: 1 });
  const k = warne(auftrag([klein]), inMail([klein]), { ek: EK([]) });
  assert.equal(k.stufe, 'leise');
});

test('Schwere Stueckware geht nicht als Paket', () => {
  const sack = pos('l1', { titel: 'Spachtel, 25 kg', farbe: '25 kg', masspruefung: {}, bestellmenge: { menge: 3, einheit: 'stueck' }, mengeBestellt: 3, nettoGesamt: 90 });
  const w = warne(auftrag([sack]), inMail([sack]), { ek: EK([]) });
  assert.ok(w.rechnung.some(z => /Fracht vom Lieferanten/.test(z.text) && z.betrag === -30));
});

test('Verschnitt: volle Rollenbreite wird als Risiko gerechnet, nicht als Tatsache', () => {
  const p = pos('l1', { masspruefung: { einheit: '× 0,01 m²' }, mengeBestellt: 200, nettoGesamt: 300, ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)'], bestellmenge: { menge: 1, einheit: 'stueck', text: '1 Stück nach Maß' } });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 10)]) });
  const h = w.hinweise.find(x => x.art === 'menge');
  assert.match(h.text, /verkauft 2,00 m²/);
  assert.match(h.text, /400 cm/);
  assert.match(h.text, /4,00 m²/);
  // 2 m² mehr zu 10 je m²; der Rohertrag bleibt die Rechnung mit der echten Flaeche.
  assert.equal(w.rohertrag, 300 - 20 - 30);
  assert.ok(w.rechnung.some(z => z.text === 'Bleibt bei voller Rollenbreite' && z.betrag === 300 - 40 - 30));
});

test('Meterware: bestellt mehr als verkauft', () => {
  const p = pos('l1', { mengeBestellt: 8, nettoGesamt: 300, bestellmenge: { menge: 2.5, einheit: 'lfm', text: '2,5 lfm' } });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 10)]) });
  assert.ok(w.hinweise.some(h => /Menge weicht ab/.test(h.text) && /verkauft 8,00 m²/.test(h.text) && /bestellt 10,00 m²/.test(h.text)));
});

test('Mindestmenge: allein keine Warnung, als Zusatz bei einer gezeigten Warnung', () => {
  const mindestmenge = { A: '10 lfm je Bestellung' };
  const normal = pos('l1', { nettoGesamt: 300 });
  assert.equal(warne(auftrag([normal]), inMail([normal]), { mindestmenge }), null);
  const verlust = pos('l1', { nettoGesamt: 40 });
  const w = warne(auftrag([verlust]), inMail([verlust]), { mindestmenge });
  assert.ok(w.hinweise.some(h => /Mindestmenge bei Lieferant A: 10 lfm/.test(h.text)));
  // Rohertrag unbekannt bleibt leise, Mitarbeiter bekommen dann nichts.
  const leise = warne(auftrag([normal]), inMail([normal]), { mindestmenge, ek: EK([]) });
  assert.equal(leise.stufe, 'leise');
  assert.equal(warnungFuerMitarbeiter(leise), null);
});

test('Teillieferung: schon bestellter Teil loest den Zuschlag erneut aus und zaehlt in der Rechnung', () => {
  const alt = pos('l1', { nettoGesamt: 200 });
  const neu = pos('l2', { nettoGesamt: 200 });
  const statusAlle = { [positionKey('o1', 'l1')]: { bestelltAm: '2099-01-02T10:00:00Z' } };
  const w = warne(auftrag([alt, neu]), inMail([alt, neu]), { statusAlle });
  assert.ok(w.hinweise.some(h => h.art === 'teillieferung' && /02\.01\./.test(h.text) && /erneut/.test(h.text)));
  assert.ok(w.rechnung.some(z => /2 Lieferungen/.test(z.text) && z.betrag === -60));
});

test('Mehrere Stuecke: Hinweis auf gemeinsame Lieferung', () => {
  const a1 = pos('l1', { nettoGesamt: 300 });
  const a2 = pos('l2', { nettoGesamt: 300 });
  const w = warne(auftrag([a1, a2]), inMail([a1, a2]));
  assert.ok(w.hinweise.some(h => h.art === 'teillieferung' && /gemeinsame Lieferung/.test(h.text)));
});

test('Zwei Ziele beim selben Lieferanten sind zwei Lieferungen', () => {
  const a1 = pos('l1', { nettoGesamt: 300 });
  const a2 = pos('l2', { nettoGesamt: 300 });
  const w = warne(auftrag([a1, a2]), [{ lieferziel: 'kunde', positionen: [a1] }, { lieferziel: 'laden', positionen: [a2] }]);
  assert.ok(w.hinweise.some(h => /Zwei Lieferungen/.test(h.text)));
});

test('Kettler-Weg: Ketteln zaehlt, Fracht teilen sich die Bestellungen derselben Mail', () => {
  const p = pos('l1', { masspruefung: { einheit: '× 0,01 m²' }, mengeBestellt: 200, nettoGesamt: 300, ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 6,00 m'], bestellmenge: { menge: 1, einheit: 'stueck' } });
  const w = warne(auftrag([p], '10500'), inMail([p], 'kettler', 2), { ek: EK([eZeile('ART-1', 10)]) });
  const zeilen = Object.fromEntries(w.rechnung.map(z => [z.text, z.betrag]));
  assert.equal(zeilen.Ketteln, -12);
  // Fracht 20 geteilt durch 2, Mindermenge 10 je Bestellung: 21,2 € Einkauf liegt unter der Grenze.
  assert.equal(zeilen['Fracht vom Lieferanten, Anteil'], -20);
  assert.ok(w.anmerkungen.some(a => /Liefergebiet/.test(a)));
});

test('Lieferant nicht zugeordnet oder ohne Kosten: nichts erfinden', () => {
  const p = pos('l1', { lieferant: 'UNGEKLAERT' });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([]) });
  assert.ok(w.anmerkungen.some(a => /Lieferant nicht zugeordnet/.test(a)));
  const q = pos('l2', { lieferant: 'Z', nettoGesamt: 300 });
  const v = warne(auftrag([q]), inMail([q]), { ek: EK([]) });
  assert.ok(v.anmerkungen.some(a => /nicht hinterlegt/.test(a)));
  assert.ok(!v.anmerkungen.some(a => /bleiben höchstens/.test(a)));
});

test('Tour nur im Nahbereich: weiter weg ohne Tarif bleibt der Versand offen, nah zaehlt nur die Tour', () => {
  const p = pos('l1', { lieferant: 'T', nettoGesamt: 300 });
  const weit = warne(auftrag([p]), inMail([p]), { ek: EK([]) });
  assert.ok(weit.anmerkungen.some(a => /Versandtarife fehlen/.test(a)));
  const nah = warne(auftrag([p], '10500'), inMail([p]), { ek: EK([]) });
  assert.ok(!nah.anmerkungen.some(a => /Versandtarife fehlen/.test(a)));
});

test('Fehlender Verkaufspreis: unbekannt statt einer falschen Rechnung', () => {
  const p = pos('l1', { nettoGesamt: null });
  const w = warne(auftrag([p]), inMail([p]));
  assert.equal(w.rohertrag, null);
  assert.ok(w.anmerkungen.some(a => /Verkaufspreis/.test(a)));
});

test('Muster und Eigenleistung: kein Einkauf, Kettelerloes zaehlt im Netto', () => {
  const p = pos('l1', { nettoGesamt: 60 });
  const dienst = pos('l2', { eigenleistung: true, nettoGesamt: 10, grosshaendlerId: 'UNGEKLAERT' });
  const muster = pos('l3', { istMuster: true, nettoGesamt: 0, grosshaendlerId: 'UNGEKLAERT' });
  const w = warne(auftrag([p, dienst, muster]), inMail([p]));
  assert.equal(w.rechnung[0].betrag, 70);
  assert.equal(w.rohertrag, 70 - 30 - 30);
});

test('warnungenAnhaengen: je Bestellung nur an der ersten Mail, Muster bleiben ohne', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-warn-'));
  try {
    const stamm = path.join(dir, 'stammdaten.json');
    fs.writeFileSync(stamm, JSON.stringify({ lieferanten: { A: { kosten: { fracht: 20 } } } }));
    const a1 = pos('l1', { nettoGesamt: 30 });
    const a2 = pos('l2', { nettoGesamt: 30 });
    const modell = { auftraege: [auftrag([a1, a2])] };
    const antwort = { art: 'ware', mails: [{ lieferziel: 'kunde', positionen: [a1], fehlt: [] }, { lieferziel: 'laden', positionen: [a2], fehlt: [] }] };
    const r = warnungenAnhaengen(antwort, { modell, privatDir: dir, stammdaten: { lieferanten: {} }, stammdatenDatei: stamm, statusAlle: {}, tarif: null, nahPlz: /^1/, jetzt: new Date('2099-01-01T10:00:00Z') });
    assert.equal(r.mails[0].kostenWarnungen.length, 1);
    assert.equal(r.mails[1].kostenWarnungen, undefined);
    const muster = warnungenAnhaengen({ art: 'muster', mails: [{ positionen: [a1] }] }, { modell, privatDir: dir, stammdatenDatei: stamm });
    assert.equal(muster.mails[0].kostenWarnungen, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Dateien: neueste EK-Ableitung gewinnt, kaputte Dateien gelten als fehlend', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ek-'));
  try {
    assert.equal(leseEkListe(dir).verfuegbar, false);
    for (const [tag, ek] of [['2099-01-01', 1], ['2099-02-01', 2]]) {
      fs.mkdirSync(path.join(dir, 'ek-liste', `ableitung-${tag}`), { recursive: true });
      fs.writeFileSync(path.join(dir, 'ek-liste', `ableitung-${tag}`, 'ek-varianten.json'), JSON.stringify([eZeile('ART-1', ek)]));
    }
    const liste = leseEkListe(dir);
    assert.equal(liste.stand, '2099-02-01');
    assert.equal(liste.zeilen.get('ART-1')[0].ek_bezug, 2);
    fs.writeFileSync(path.join(dir, 'ek-liste', 'ableitung-2099-02-01', 'ek-varianten.json'), '{kaputt');
    assert.equal(leseEkListe(dir).verfuegbar, false);
    assert.deepEqual(leseLieferkosten(path.join(dir, 'fehlt.json')), { lieferanten: {}, kettler: null });
    const stamm = path.join(dir, 'stamm.json');
    fs.writeFileSync(stamm, JSON.stringify({ absender: { kettelservice: { kosten: { bis6qmJeLfm: 1 } } }, lieferanten: { A: { kosten: { fracht: 'x', paket: 2 } }, B: {} } }));
    const k = leseLieferkosten(stamm);
    assert.equal(k.lieferanten.A.fracht, null);
    assert.equal(k.lieferanten.A.paket, 2);
    assert.equal(k.lieferanten.B, undefined);
    assert.equal(k.kettler.ab6qmJeLfm, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Rolle "mitarbeiter": Einkauf und Marge duerfen in keinem Feld stehen.
const VERBOTEN = /Einkauf|Rohertrag|Marge|Verlust|Bleibt|bleiben|vom Netto|Netto|rechnung"\s*:\s*\[\s*\{/;

test('Mitarbeiter: Verlust wird zur Bitte um Klaerung, ohne Rechnung, Marge und rote Stufe', () => {
  const p = pos('l1', { nettoGesamt: 40 });
  const w = warnungFuerMitarbeiter(warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 3)]) }));
  assert.equal(w.stufe, 'warn');
  assert.match(w.kopf, /vor dem Bestellen mit Ahmet klären/);
  assert.deepEqual(w.rechnung, []);
  assert.deepEqual(w.anmerkungen, []);
  assert.deepEqual(Object.keys(w).sort(), ['anmerkungen', 'hinweise', 'kopf', 'orderId', 'orderName', 'rechnung', 'stufe', 'wege']);
  assert.doesNotMatch(JSON.stringify(w), VERBOTEN);
});

test('Mitarbeiter: teurer Weg ohne Zahl, auch ohne Einkaufspreis', () => {
  const p = pos('l1', { nettoGesamt: 90 });
  const w = warnungFuerMitarbeiter(warne(auftrag([p]), inMail([p]), { ek: EK([]) }));
  assert.equal(w.kopf, 'Weg zum Kunden teuer, vor dem Bestellen mit Ahmet klären');
  assert.doesNotMatch(JSON.stringify(w), VERBOTEN);
  assert.doesNotMatch(JSON.stringify(w), /€/);
});

test('Mitarbeiter: Menge bleibt, nur ohne den Einkaufsbetrag; Teillieferung wie beim Inhaber', () => {
  const stueck = pos('l1', { masspruefung: { einheit: '× 0,01 m²' }, mengeBestellt: 200, nettoGesamt: 300, ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)'], bestellmenge: { menge: 1, einheit: 'stueck' } });
  const roh = warne(auftrag([stueck]), inMail([stueck]), { ek: EK([eZeile('ART-1', 10)]) });
  assert.match(roh.hinweise[0].text, /mehr Einkauf/);
  const w = warnungFuerMitarbeiter(roh);
  assert.match(w.hinweise[0].text, /Verschnitt möglich/);
  assert.match(w.hinweise[0].text, /4,00 m²/);
  assert.doesNotMatch(JSON.stringify(w), /Einkauf|€/);
  assert.equal(w.kopf, 'Hinweis zu Menge oder Lieferung');
  const meter = pos('l2', { mengeBestellt: 8, nettoGesamt: 300 });
  const m = warnungFuerMitarbeiter(warne(auftrag([meter]), inMail([meter]), { ek: EK([eZeile('ART-1', 10)]) }));
  assert.ok(m.hinweise.some(h => /verkauft 8,00 m², bestellt 10,00 m²\.$/.test(h.text)));
  assert.doesNotMatch(JSON.stringify(m), /Einkauf/);
  const a1 = pos('l3', { nettoGesamt: 300 });
  const a2 = pos('l4', { nettoGesamt: 300 });
  const t = warnungFuerMitarbeiter(warne(auftrag([a1, a2]), inMail([a1, a2])));
  assert.ok(t.hinweise.some(h => h.art === 'teillieferung' && /gemeinsame Lieferung/.test(h.text)));
});

test('Mitarbeiter: fehlt nur der Einkaufspreis, kommt nichts an', () => {
  const p = pos('l1');
  assert.equal(warnungFuerMitarbeiter(warne(auftrag([p]), inMail([p]), { ek: EK([]) })), null);
  assert.equal(warnungFuerMitarbeiter(null), null);
});

test('warnungenAnhaengen: ohne Angabe keine Betraege, nur mitPreisen liefert die Rechnung', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-rolle-'));
  try {
    fs.mkdirSync(path.join(dir, 'ek-liste', 'ableitung-2099-01-01'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ek-liste', 'ableitung-2099-01-01', 'ek-varianten.json'), JSON.stringify([eZeile('ART-1', 3.21)]));
    const stamm = path.join(dir, 'stammdaten.json');
    fs.writeFileSync(stamm, JSON.stringify({ lieferanten: { A: { kosten: { fracht: 20 } } } }));
    const p = pos('l1', { nettoGesamt: 40 });
    const lauf = extra => warnungenAnhaengen({ art: 'ware', mails: [{ lieferziel: 'kunde', positionen: [p], fehlt: [] }] }, { modell: { auftraege: [auftrag([p])] }, privatDir: dir, stammdaten: { lieferanten: {} }, stammdatenDatei: stamm, statusAlle: {}, tarif: null, nahPlz: /^1/, jetzt: new Date('2099-01-01T10:00:00Z'), ...extra });
    const ohne = lauf({}).mails[0].kostenWarnungen[0];
    assert.deepEqual(ohne.rechnung, []);
    assert.equal(ohne.rohertrag, undefined);
    assert.doesNotMatch(JSON.stringify(ohne), VERBOTEN);
    const inhaber = lauf({ mitPreisen: true }).mails[0].kostenWarnungen[0];
    assert.ok(inhaber.rechnung.some(z => z.text === 'Einkauf'));
    assert.ok(Number.isFinite(inhaber.rohertrag));
    assert.equal(inhaber.wegTeuer, undefined);
    assert.equal(inhaber.rohertragAuffaellig, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Befunde aus dem Review von PR #1954.
const EK_MEHRERE = (...zeilen) => EK(zeilen);
// Meterware aus der 400-cm-Rolle: bestellt genau die verkaufte Flaeche.
const meter = (id, m2Menge, extra = {}) => pos(id, { mengeBestellt: m2Menge, bestellmenge: { menge: m2Menge / 4, einheit: 'lfm' }, ...extra });

test('Bestandsabgang einer Bundle-Komponente: kein Einkauf, kein Weg, Verkaufspreis bleibt im Netto', () => {
  const teppich = meter('l1', 20, { nettoGesamt: 70 });
  const rolle = pos('l2', { nettoGesamt: 30, mengeBestellt: 8, grosshaendlerId: 'ROLLE-1', sku: 'ROLLE-1', masspruefung: { status: 'bestand', einheit: '' }, bestellmenge: { menge: 8, einheit: 'stueck' }, titel: 'Rollenkomponente, 500 kg', farbe: '500 kg' });
  const w = warne(auftrag([teppich, rolle]), inMail([teppich]), {
    ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ROLLE-1', 10, { bezug: 'stueck', vk_einheit: 'stueck' })),
  });
  assert.equal(w.rechnung.find(z => z.text === 'Einkauf').betrag, -60);
  assert.equal(w.rechnung.find(z => z.text === 'Verkauf netto').betrag, 100);
  assert.equal(w.rohertrag, 100 - 60 - 30);
  // Nur Bestandsabgang: nichts zu rechnen.
  assert.equal(warne(auftrag([rolle]), []), null);
});

const massStueck = (id, masse, extra = {}) => pos(id, { masspruefung: { einheit: '× 0,01 m²' }, ausfuehrung: [`Fertigmaß: ${masse} cm (Rechteck)`], bestellmenge: { menge: 1, einheit: 'stueck' }, ...extra });

test('Volle Rollenbreite: Stueck laenger als die Rolle breit laeuft der Laenge nach', () => {
  const p = massStueck('l1', '200 × 600', { mengeBestellt: 1200, nettoGesamt: 200 });
  const w = warne(auftrag([p]), inMail([p]), { ek: EK([eZeile('ART-1', 10)]) });
  const h = w.hinweise.find(x => x.art === 'menge').text;
  // 600 cm laeuft, 400 cm Rolle: 24 m², nicht 8 m².
  assert.match(h, /sind es 24,00 m²/);
  assert.match(h, /etwa 120 € mehr Einkauf/);
  assert.equal(w.rechnung.find(z => z.text === 'Bleibt bei voller Rollenbreite').betrag, w.rohertrag - 120);
  assert.equal(w.stufe, 'crit');
});

test('Volle Rollenbreite: kuerzeste moegliche Laenge, kein Hinweis ohne Mehrflaeche oder mit Naht', () => {
  // Beide Richtungen moeglich: die kurze Seite laeuft.
  const klein = massStueck('l1', '100 × 200', { mengeBestellt: 200, nettoGesamt: 300 });
  assert.match(warne(auftrag([klein]), inMail([klein]), { ek: EK([eZeile('ART-1', 10)]) }).hinweise[0].text, /sind es 4,00 m²/);
  // Passt genau in die Rollenbreite: keine Mehrflaeche.
  const passt = massStueck('l2', '400 × 500', { mengeBestellt: 2000, nettoGesamt: 900 });
  assert.equal(warne(auftrag([passt]), inMail([passt]), { ek: EK([eZeile('ART-1', 10)]) }), null);
  // Breiter als die Rolle in beiden Richtungen: mit Naht, keine Aussage zur vollen Breite.
  const naht = massStueck('l3', '500 × 600', { mengeBestellt: 3000, nettoGesamt: 900 });
  assert.equal(warne(auftrag([naht]), inMail([naht]), { ek: EK([eZeile('ART-1', 10)]) }), null);
});

const KOSTEN_ZWEI = { lieferanten: { A: KOSTEN.lieferanten.A, B: { ...KOSTEN.lieferanten.A } }, kettler: null };

test('Mindermenge je Lieferant: zwei Lieferanten mit zusammen genug Einkauf zahlen beide', () => {
  const a = meter('l1', 20, { lieferant: 'A', nettoGesamt: 100 });
  const b = meter('l2', 20, { lieferant: 'B', nettoGesamt: 100, grosshaendlerId: 'ART-2', sku: 'ART-2' });
  const w = warne(auftrag([a, b]), inMail([a, b]), { kosten: KOSTEN_ZWEI, ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ART-2', 3)) });
  // Je 60 Einkauf unter der Grenze von 100, zusammen 120 darueber: je 20 Fracht + 10 Mindermenge.
  assert.deepEqual(w.rechnung.filter(z => /Fracht/.test(z.text)).map(z => z.betrag), [-30, -30]);
  assert.equal(w.rohertrag, 200 - 120 - 60);
});

test('Mindermenge je Lieferung: Lieferant ueber der Grenze zahlt keine, der andere schon', () => {
  const a = meter('l1', 40, { lieferant: 'A', nettoGesamt: 125 });
  const b = meter('l2', 20, { lieferant: 'B', nettoGesamt: 125, grosshaendlerId: 'ART-2', sku: 'ART-2' });
  const w = warne(auftrag([a, b]), inMail([a, b]), { kosten: KOSTEN_ZWEI, ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ART-2', 3)) });
  assert.deepEqual(w.rechnung.filter(z => /Fracht/.test(z.text)).map(z => z.betrag), [-20, -30]);
});

test('Mindermenge je Teillieferung: jede Lieferung wird fuer sich geprueft', () => {
  const alt = meter('l1', 20, { nettoGesamt: 400 });
  const neu = meter('l2', 20, { nettoGesamt: 400 });
  const statusAlle = { [positionKey('o1', 'l1')]: { bestelltAm: '2099-01-02T10:00:00Z' } };
  // Je 60 Einkauf: zusammen ueber, einzeln unter der Grenze.
  const w = warne(auftrag([alt, neu]), inMail([alt, neu]), { statusAlle });
  assert.equal(w.rechnung.find(z => /2 Lieferungen/.test(z.text)).betrag, -60);
  assert.ok(w.hinweise.some(h => /erneut/.test(h.text) && /etwa 30 €/.test(h.text)));
});

test('Mindermenge ohne Einkaufspreis: Verkaufspreis der Lieferung als Grenze, nicht der ganze Auftrag', () => {
  const a = pos('l1', { lieferant: 'A', nettoGesamt: 90 });
  const b = pos('l2', { lieferant: 'B', nettoGesamt: 90, grosshaendlerId: 'ART-2', sku: 'ART-2' });
  const w = warne(auftrag([a, b]), inMail([a, b]), { kosten: KOSTEN_ZWEI, ek: EK([]) });
  assert.deepEqual(w.rechnung.filter(z => /Fracht/.test(z.text)).map(z => z.betrag), [-30, -30]);
  const unbekannt = pos('l3', { nettoGesamt: null });
  const u = warne(auftrag([unbekannt]), inMail([unbekannt]), { ek: EK([]) });
  assert.equal(u.rechnung.find(z => /Fracht/.test(z.text)).betrag, -20);
});


// ------------------------------------------------------------------ Massformen (Review Runde 2)

const rund = (id, extra = {}) => pos(id, { masspruefung: { einheit: '× 0,01 m²' }, ausfuehrung: ['Fertigmaß: Ø 200 cm (Rund)'], bestellmenge: { menge: 1, einheit: 'stueck' }, mengeBestellt: 400, nettoGesamt: 100, ...extra });
const ek10 = { ek: EK([eZeile('ART-1', 10)]) };
const unbekannt = w => {
  assert.equal(w.rohertrag, null);
  assert.match(w.kopf, /Rohertrag unbekannt/);
  assert.equal(w.rechnung.some(z => z.ergebnis), false, 'keine Zahl als Ergebnis');
};

test('Rundmass: Durchmesser zaehlt als umschliessendes Quadrat, volle Rollenbreite wird genannt', () => {
  const p = rund('l1');
  const w = warne(auftrag([p]), inMail([p]), ek10);
  // 100 Verkauf - 40 Einkauf (4 m²) - 20 Fracht - 10 Mindermenge
  assert.equal(w.rohertrag, 30);
  assert.equal(w.rechnung.find(z => z.text === 'Bleibt bei voller Rollenbreite').betrag, -10);
  assert.equal(w.stufe, 'crit');
  assert.match(w.kopf, /Verlust möglich bei voller Rollenbreite/);
  assert.match(w.hinweise.find(h => h.art === 'menge').text, /sind es 8,00 m²/);
});

test('Rundmass beim Kettler: Verschnitt wird genannt, der Rohertrag bleibt unbekannt', () => {
  const p = rund('l1', { ausfuehrung: ['Fertigmaß: Ø 200 cm (Rund)', 'Einfassung: Gekettelt, umlaufend 6,28 m'] });
  const w = warne(auftrag([p], '10000'), inMail([p], 'kettler'), ek10);
  unbekannt(w);
  assert.ok(w.anmerkungen.some(a => /Ketteln rund oder oval/.test(a)));
  assert.match(w.hinweise.find(h => h.art === 'menge').text, /Verschnitt möglich/);
});

test('Oval rechnet wie sein umschliessendes Rechteck', () => {
  const p = pos('l1', { masspruefung: { einheit: '× 0,01 m²' }, ausfuehrung: ['Fertigmaß: 200 × 300 cm (Oval)'], bestellmenge: { menge: 1, einheit: 'stueck' }, mengeBestellt: 600, nettoGesamt: 300 });
  const w = warne(auftrag([p]), inMail([p]), ek10);
  // 300 - 60 - 20 - 10; bei voller Breite 200 × 400 cm: 20 € mehr Einkauf
  assert.equal(w.rohertrag, 210);
  assert.match(w.hinweise.find(h => h.art === 'menge').text, /sind es 8,00 m²/);
});

test('Nicht rechenbare Masse zeigen keine Zahl', () => {
  for (const [name, zeile, menge] of [
    ['Meter statt Zentimeter', 'Fertigmaß: 1,80 × 2,50 m', 450],
    ['einzelne Zahl', 'Fertigmaß: 200 cm', 400],
    ['Schablone', 'Fertigmaß: 200 × 300 cm (Schablone)', 600],
    ['Rund mit zwei Seiten', 'Fertigmaß: 200 × 300 cm (Rund)', 600],
    ['Ø als Rechteck', 'Fertigmaß: Ø 200 cm (Rechteck)', 400],
  ]) {
    const p = pos('l1', { masspruefung: { einheit: '× 0,01 m²' }, ausfuehrung: [zeile], bestellmenge: { menge: 1, einheit: 'stueck' }, mengeBestellt: menge, nettoGesamt: 500 });
    const w = warne(auftrag([p]), inMail([p]), ek10);
    assert.ok(w, name);
    unbekannt(w);
    assert.ok(w.anmerkungen.some(a => /Fertigmaß|Form/.test(a)), name);
  }
});

test('Menge passt nicht zum Fertigmass oder Massproblem: keine Zahl', () => {
  // Zwei Stuecke oder Mindestflaeche: Die Rechnung kennt nur ein Stueck.
  const doppelt = massStueck('l1', '200 × 300', { mengeBestellt: 1200, nettoGesamt: 500 });
  unbekannt(warne(auftrag([doppelt]), inMail([doppelt]), ek10));
  const pruefung = massStueck('l1', '200 × 300', { mengeBestellt: 600, nettoGesamt: 500, masspruefung: { einheit: '× 0,01 m²', status: 'abweichung' } });
  unbekannt(warne(auftrag([pruefung]), inMail([pruefung]), ek10));
  // Volle m² rundet der Shop auf, das ist keine Abweichung.
  const aufgerundet = massStueck('l1', '180 × 250', { masspruefung: { einheit: 'm²', status: 'ok' }, mengeBestellt: 5, nettoGesamt: 500 });
  assert.notEqual(warne(auftrag([aufgerundet]), inMail([aufgerundet]), ek10).rohertrag, null);
});

test('Wunschmass-Rechner: Mass fehlt an der Position, keine Zahl aus der Kreisflaeche', () => {
  const p = pos('l1', { masspruefung: { einheit: '× 0,01 m²', status: 'ok' }, wunschmassRechner: true, bestellmenge: { menge: 3.14, einheit: 'm²' }, mengeBestellt: 314, nettoGesamt: 500 });
  const w = warne(auftrag([p]), inMail([p]), ek10);
  unbekannt(w);
  assert.ok(w.anmerkungen.some(a => /Wunschmaß-Rechner/.test(a)));
});

test('Einfassung ohne hinterlegte Kosten: Band zaehlt nicht als kostenlos', () => {
  const p = massStueck('l1', '200 × 300', { mengeBestellt: 600, nettoGesamt: 500, ausfuehrung: ['Fertigmaß: 200 × 300 cm (Rechteck)', 'Einfassung: Juteband, umlaufend 10 m'] });
  const w = warne(auftrag([p]), inMail([p]), ek10);
  unbekannt(w);
  assert.ok(w.anmerkungen.some(a => /Einfassung/.test(a)));
  // Vom Hersteller eingefasst oder ohne Einfassung kostet nichts extra.
  for (const zeile of ['Einfassung: Fertig eingefasst', 'Einfassung: ohne Einfassung', 'Einfassung: Zugeschnitten']) {
    const q = massStueck('l1', '200 × 300', { mengeBestellt: 600, nettoGesamt: 500, ausfuehrung: ['Fertigmaß: 200 × 300 cm (Rechteck)', zeile] });
    assert.notEqual(warne(auftrag([q]), inMail([q]), ek10)?.rohertrag, null, zeile);
  }
});

test('Fehlende Lieferkosten: keine Zahl, aber bekannte Kosten ueber dem Verkauf fallen auf', () => {
  const p = meter('l1', 20, { nettoGesamt: 500 });
  const ohne = { lieferanten: {}, kettler: null };
  const w = warne(auftrag([p]), inMail([p]), { kosten: ohne, ek: EK([eZeile('ART-1', 10)]) });
  unbekannt(w);
  assert.ok(w.anmerkungen.some(a => /Lieferkosten des Lieferanten/.test(a)));
  const teuer = meter('l1', 20, { nettoGesamt: 100 });
  const t = warne(auftrag([teuer]), inMail([teuer]), { kosten: ohne, ek: EK([eZeile('ART-1', 10)]) });
  unbekannt(t);
  assert.equal(t.stufe, 'warn');
  assert.match(t.kopf, /bekannten Kosten übersteigen den Verkauf/);
  const ma = warnungFuerMitarbeiter(t);
  assert.match(ma.kopf, /mit Ahmet klären/);
  assert.doesNotMatch(JSON.stringify(ma), VERBOTEN);
});

// ------------------------------------------------------------------ Gespeicherte Lieferwege (Review Runde 2)

const gekettelt = (id, extra = {}) => massStueck(id, '200 × 300', { mengeBestellt: 600, nettoGesamt: 300, ausfuehrung: ['Fertigmaß: 200 × 300 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 10 m'], ...extra });
const schonBestellt = (id, extra = {}) => ({ [positionKey('o1', id)]: { status: 'bestellt', bestelltAm: '2098-12-20T10:00:00Z', ...extra } });

test('Vermerk "kunde": beim Lieferanten gekettelte Ware kostet keinen Kettler, Nachbestellung loest Fracht erneut aus', () => {
  const alt = gekettelt('l1');
  const neu = meter('l2', 20, { nettoGesamt: 400 });
  const w = warne(auftrag([alt, neu]), inMail([neu]), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  assert.equal(w.rechnung.some(z => z.text === 'Ketteln'), false);
  assert.match(w.hinweise.find(h => h.art === 'teillieferung').text, /schon am 20\.12\..*erneut aus/);
  // Der Preis fuers Ketteln beim Lieferanten steht nirgends.
  unbekannt(w);
  assert.ok(w.anmerkungen.some(a => /Ketteln außerhalb unseres Kettlers/.test(a)));
});

test('Vermerk "kettler": eigene Lieferung, auch wenn die Nachbestellung an den Kunden geht', () => {
  const alt = gekettelt('l1');
  const neu = meter('l2', 20, { nettoGesamt: 400 });
  const w = warne(auftrag([alt, neu], '10000'), inMail([neu]), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kettler' }) });
  assert.equal(w.rechnung.find(z => z.text === 'Ketteln').betrag, -20);
  assert.match(w.hinweise.find(h => h.art === 'teillieferung').text, /schon am 20\.12\./);
  assert.notEqual(w.rohertrag, null);
});

test('Schon bearbeitete Ware ohne Vermerk: Weg nicht belegt, keine Zahl, Hinweis bleibt', () => {
  const neu = meter('l2', 20, { nettoGesamt: 400 });
  for (const eintrag of [schonBestellt('l1', { ueber: null }), schonBestellt('l1'), { [positionKey('o1', 'l1')]: { status: 'erledigt', erledigtNotiz: 'ohne Einkauf' } }]) {
    const alt = meter('l1', 20, { nettoGesamt: 400 });
    const w = warne(auftrag([alt, neu]), inMail([neu]), { ...ek10, statusAlle: eintrag });
    unbekannt(w);
    assert.ok(w.anmerkungen.some(a => /Lieferweg/.test(a)));
    if (eintrag[positionKey('o1', 'l1')].bestelltAm) assert.ok(w.hinweise.some(h => h.art === 'teillieferung'));
  }
});

test('Lieferziel in der Mail: Kettelt der Lieferant, zaehlt kein Kettler und keine Zahl', () => {
  const p = gekettelt('l1');
  const w = warne(auftrag([p]), inMail([p], 'kunde'), ek10);
  assert.equal(w.rechnung.some(z => z.text === 'Ketteln'), false);
  unbekannt(w);
  // Ist die Position schon bestellt, gilt ihr Vermerk auch dann, wenn sie noch in der Mail steht.
  const v = warne(auftrag([p], '10000'), inMail([p], 'kettler'), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  assert.equal(v.rechnung.some(z => z.text === 'Ketteln'), false);
});

test('Vermerk "kunde" bei Lieferant nur im Liefergebiet: kein Weiterversand dazugerechnet', () => {
  const alt = meter('l1', 20, { lieferant: 'T', nettoGesamt: 300 });
  const neu = meter('l2', 20, { lieferant: 'T', nettoGesamt: 300 });
  const w = warne(auftrag([alt, neu]), inMail([neu]), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  // Die neue Position teilt die Gruppe, ihr Weg ist nicht vermerkt: Versand bleibt Teil der Rechnung.
  assert.ok(w.anmerkungen.some(a => /Versandtarife/.test(a)));
  const nurAlt = warne(auftrag([alt]), [], { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  assert.equal((nurAlt?.anmerkungen ?? []).some(a => /Versandtarife/.test(a)), false);
});

// ------------------------------------------------------------------ Letzte Korrekturen vor dem Merge

test('Teillieferung: Mitarbeiter sehen keinen Frachtbetrag, der Inhaber schon', () => {
  const [a, b] = [meter('l1', 20, { nettoGesamt: 400 }), meter('l2', 20, { nettoGesamt: 400 })];
  const stuecke = warne(auftrag([a, b]), inMail([a, b]), ek10);
  assert.match(stuecke.hinweise.find(h => h.art === 'teillieferung').text, /Teillieferung vermeiden.*etwa \d+ €/);
  assert.doesNotMatch(JSON.stringify(warnungFuerMitarbeiter(stuecke)), /€/);
  assert.match(warnungFuerMitarbeiter(stuecke).hinweise.find(h => h.art === 'teillieferung').text, /Teillieferung vermeiden.*gemeinsame Lieferung/);
  const nach = warne(auftrag([a, b]), inMail([b]), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  assert.match(nach.hinweise.find(h => h.art === 'teillieferung').text, /schon am 20\.12\..*etwa \d+ €/);
  assert.doesNotMatch(JSON.stringify(warnungFuerMitarbeiter(nach)), /€/);
});

test('Zwei Lieferungen: nur, wenn beim Lieferanten Fracht hinterlegt ist', () => {
  const [a, b] = [pos('l1', { nettoGesamt: 300 }), pos('l2', { nettoGesamt: 300 })];
  const mails = [...inMail([a], 'kunde'), ...inMail([b], 'laden')];
  const genannt = warne(auftrag([a, b], '10000'), mails, ek10);
  assert.ok(genannt.hinweise.some(h => /^Zwei Lieferungen/.test(h.text)));
  const nurPaket = { lieferanten: { A: { ...KOSTEN.lieferanten.A, fracht: null, mindermenge: null } }, kettler: null };
  const ohne = warne(auftrag([a, b], '10000'), mails, { ...ek10, kosten: nurPaket });
  assert.equal((ohne?.hinweise ?? []).some(h => /^Zwei Lieferungen/.test(h.text)), false);
});

test('Sammellieferung: Anteil nur fuer die neue Lieferung, fruehere Bestelltage tragen die volle Fracht', () => {
  const [alt, neu] = [meter('l1', 20, { nettoGesamt: 100 }), meter('l2', 20, { nettoGesamt: 100 })];
  const w = warne(auftrag([alt, neu]), inMail([neu], 'kunde', 2), { ...ek10, ek: EK([eZeile('ART-1', 3)]), statusAlle: schonBestellt('l1', { ueber: 'kunde' }) });
  // Alt: 20 Fracht + 10 Mindermenge. Neu: 20 / 2 + 10 Mindermenge.
  assert.equal(w.rechnung.find(z => /2 Lieferungen/.test(z.text)).betrag, -50);
});

test('Mindermenge bei Sammellieferung wird als Schaetzung benannt', () => {
  const satz = /Mindermenge je Bestellung geschätzt, die Sammellieferung kann darüber liegen/;
  const p = meter('l1', 20, { nettoGesamt: 70 });
  assert.ok(warne(auftrag([p]), inMail([p], 'kunde', 2)).anmerkungen.some(a => satz.test(a)));
  assert.equal(warne(auftrag([p]), inMail([p], 'kunde', 1)).anmerkungen.some(a => satz.test(a)), false);
  const ohneMindermenge = meter('l1', 40, { nettoGesamt: 120 });
  assert.equal(warne(auftrag([ohneMindermenge]), inMail([ohneMindermenge], 'kunde', 2)).anmerkungen.some(a => satz.test(a)), false);
});

test('Guenstigere Wege nur fuer noch offene Positionen in der Mail', () => {
  const gross = gekettelt('l1', { mengeBestellt: 750, ausfuehrung: ['Fertigmaß: 250 × 300 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 11 m'] });
  const satz = /Kurze Seite über 200 cm/;
  assert.ok(warne(auftrag([gross]), inMail([gross], 'kettler'), ek10).wege.some(x => satz.test(x)));
  const neu = meter('l2', 20, { nettoGesamt: 70 });
  const w = warne(auftrag([gross, neu]), inMail([neu]), { ...ek10, statusAlle: schonBestellt('l1', { ueber: 'kettler' }) });
  assert.equal(w.wege.some(x => satz.test(x)), false);
});

test('Netto 0 ohne Kosten: nichts uebersteigt den Verkauf, quote null ist nicht auffaellig', () => {
  const p = meter('l1', 20, { nettoGesamt: 0 });
  const ohne = warne(auftrag([p]), inMail([p]), { kosten: { lieferanten: {}, kettler: null }, ek: EK([]) });
  assert.doesNotMatch(ohne.kopf, /übersteigen/);
  assert.equal(warnungFuerMitarbeiter(ohne), null);
  // Rohertrag genau 0 auf Netto 0, dazu eine Mengenabweichung: bleibt ein Mengenhinweis.
  const kostenlos = { lieferanten: { A: { ...KOSTEN.lieferanten.A, paket: null, fracht: 0, mindermenge: null } }, kettler: null };
  const q = pos('l1', { nettoGesamt: 0, mengeBestellt: 10, bestellmenge: { menge: 10, einheit: 'lfm' } });
  const w = warne(auftrag([q]), inMail([q]), { kosten: kostenlos, ek: EK([eZeile('ART-1', 0)]) });
  assert.equal(w.quote, null);
  assert.equal(warnungFuerMitarbeiter(w).kopf, 'Hinweis zu Menge oder Lieferung');
});

test('Fehlende oder unlesbare Adresse heisst Lieferadresse fehlt, nicht Ausland', () => {
  const p = gekettelt('l1');
  const hinweis = a => warne(a, inMail([p], 'kettler'), ek10).anmerkungen.join(' ');
  const summen = { summen: { versand: { betrag: 0 } } };
  for (const a of [auftrag([p], '–'), auftrag([p], '123'), auftrag([p], '50000', { details: { lieferadresse: null, ...summen } })]) {
    assert.match(hinweis(a), /Lieferadresse fehlt/);
    assert.doesNotMatch(hinweis(a), /Ausland/);
  }
  const ausland = auftrag([p], '1010', { details: { lieferadresse: { plz: '1010', land: 'Österreich' }, ...summen } });
  assert.match(hinweis(ausland), /Versand ins Ausland nicht hinterlegt/);
});

test('Kettelsatz ohne verkaufte Flaeche richtet sich nach der Flaeche des Stuecks', () => {
  const p = pos('l1', { masspruefung: { einheit: '' }, mengeBestellt: 1, nettoGesamt: 900, bestellmenge: { menge: 1, einheit: 'stueck' }, ausfuehrung: ['Fertigmaß: 300 × 300 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 12 m'] });
  const w = warne(auftrag([p], '10000'), inMail([p], 'kettler'), { ek: EK([eZeile('ART-1', 80, { bezug: 'stueck', vk_einheit: 'stueck', ek_vk_einheit: 800 })]) });
  // 12 m zum Satz ab 6 m² (3 €), nicht bis 6 m² (2 €).
  assert.equal(w.rechnung.find(z => z.text === 'Ketteln').betrag, -36);
});

// ------------------------------------------------------------------ Gegenrechnung "Wer kettelt?" (2026-11-12)

const teppich = (id, extra = {}) => pos(id, { masspruefung: { einheit: '× 0,01 m²' }, mengeBestellt: 200, nettoGesamt: 300, ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 6,00 m'], bestellmenge: { menge: 1, einheit: 'stueck' }, ...extra });
const mitKetteln = (extra = {}) => ({ ...KOSTEN, lieferanten: { A: { ...KOSTEN.lieferanten.A, kettelnJeLfm: 5, abholungZumKettler: true, ...extra } } });
const vergleiche = (a, ids, extra = {}) => kettelwegVergleich({ ...basis, ek: EK([eZeile('ART-1', 1)]), kosten: mitKetteln(), auftrag: a, lineItemIds: ids, ...extra });

test('Gegenrechnung: eigener Kettelweg ab 30 € Ersparnis, sonst Lieferant direkt', () => {
  const p = teppich('l1');
  // Lieferant: Fracht 20 + Mindermenge 10 + Ketteln 6 m × 5. Eigener Weg im Liefergebiet: Abholung, Ketteln 6 m × 2.
  const v = vergleiche(auftrag([p], '10500'), ['l1']);
  assert.equal(v.empfehlung, 'kettler');
  assert.ok(v.ersparnis >= 30 && v.ersparnis <= 48, String(v.ersparnis));
  assert.match(v.text, /Fahrt und Abholung sind nicht eingerechnet/);
  assert.doesNotMatch(v.textOhnePreis, /€|\d/);
  // Kettelt der Lieferant fast zum selben Preis und ohne Zuschlaege, lohnt der Mehraufwand nicht.
  const knapp = vergleiche(auftrag([p], '10500'), ['l1'], { kosten: mitKetteln({ kettelnJeLfm: 3, fracht: 0, mindermenge: null }) });
  assert.equal(knapp.empfehlung, 'lieferant');
  assert.ok(knapp.ersparnis < 30);
});

test('Gegenrechnung: ohne hinterlegten Kettelpreis, ohne Versandtarif oder ohne Kante keine Empfehlung', () => {
  const p = teppich('l1');
  assert.equal(vergleiche(auftrag([p], '10500'), ['l1'], { kosten: KOSTEN }), null);
  assert.equal(vergleiche(auftrag([p], '50000'), ['l1']), null);
  const ohneKante = teppich('l1', { ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)', 'Einfassung: Gekettelt'] });
  assert.equal(vergleiche(auftrag([ohneKante], '10500'), ['l1']), null);
});

test('Gegenrechnung: geht andere Ware des Lieferanten ohnehin direkt, spart der eigene Weg seine Fracht nicht', () => {
  const p = teppich('l1');
  const allein = vergleiche(auftrag([p], '10500'), ['l1']);
  const mitRest = vergleiche(auftrag([p, pos('l2')], '10500'), ['l1']);
  assert.ok(mitRest.ersparnis < allein.ersparnis);
});

test('Hinterlegter Kettelpreis des Lieferanten zaehlt in der Rechnung statt "Preis nicht hinterlegt"', () => {
  // Kleiner Verkaufspreis, damit die Rechnung gezeigt wird (im Normalfall gibt es keine Warnung).
  const p = teppich('l1', { nettoGesamt: 70 });
  const w = warne(auftrag([p], '50000'), inMail([p], 'kunde'), { kosten: mitKetteln() });
  assert.equal(w.rechnung.find(z => z.text === 'Ketteln beim Lieferanten').betrag, -30);
  assert.ok(!w.anmerkungen.some(a => /Ketteln außerhalb/.test(a)));
});

test('warnungenAnhaengen: Gegenrechnung an der Frage "Wer kettelt?", Betraege nur mit mitPreisen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-warn-'));
  try {
    const stamm = path.join(dir, 'stammdaten.json');
    const stammdaten = { absender: { kettelservice: { plz: '10000', kosten: { bis6qmJeLfm: 2, ab6qmJeLfm: 3 } } }, lieferanten: { A: { name: 'Lieferant A', kosten: { fracht: 20, mindermenge: 10, mindermengeUnterEk: 100, kettelnJeLfm: 5, abholungZumKettler: true } } } };
    fs.writeFileSync(stamm, JSON.stringify(stammdaten));
    const p1 = teppich('l1');
    const p2 = teppich('l2');
    const frage = p => ({ orderId: 'o1', orderName: '#T1', lineItemId: p.lineItemId, empfehlung: null, wahl: null });
    const lauf = mitPreisen => warnungenAnhaengen({ art: 'ware', mails: [], kettelwege: [frage(p1), frage(p2)] }, { modell: { auftraege: [auftrag([p1, p2], '10500')] }, privatDir: dir, stammdaten, stammdatenDatei: stamm, statusAlle: {}, tarif: null, nahPlz: /^1/, jetzt: new Date('2099-01-01T10:00:00Z'), mitPreisen });
    const inhaber = lauf(true);
    assert.deepEqual(inhaber.kettelwege.map(f => f.empfehlung), ['kettler', 'kettler']);
    assert.match(inhaber.kettelwege[0].vergleich, /€/);
    assert.equal(inhaber.kettelwege[1].vergleich, undefined);
    assert.doesNotMatch(lauf(false).kettelwege[0].vergleich, /€/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
