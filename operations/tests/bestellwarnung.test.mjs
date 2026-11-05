import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bestellWarnung, warnungenAnhaengen, warnungFuerMitarbeiter, leseEkListe, leseLieferkosten } from '../lib/bestellwarnung.mjs';
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

test('Mindestmenge aus den Stammdaten wird genannt', () => {
  const p = pos('l1', { nettoGesamt: 300 });
  const w = warne(auftrag([p]), inMail([p]), { mindestmenge: { A: '10 lfm je Bestellung' } });
  assert.ok(w.hinweise.some(h => /Mindestmenge bei Lieferant A: 10 lfm/.test(h.text)));
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
  const p = pos('l1', { nettoGesamt: 100 });
  const dienst = pos('l2', { eigenleistung: true, nettoGesamt: 200, grosshaendlerId: 'UNGEKLAERT' });
  const muster = pos('l3', { istMuster: true, nettoGesamt: 0, grosshaendlerId: 'UNGEKLAERT' });
  const w = warne(auftrag([p, dienst, muster]), inMail([p]), { mindestmenge: { A: 'x' } });
  assert.equal(w.rechnung[0].betrag, 300);
  assert.equal(w.rohertrag, 300 - 30 - 30);
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
  const teppich = meter('l1', 20, { nettoGesamt: 200 });
  const rolle = pos('l2', { nettoGesamt: 50, mengeBestellt: 8, grosshaendlerId: 'ROLLE-1', sku: 'ROLLE-1', masspruefung: { status: 'bestand', einheit: '' }, bestellmenge: { menge: 8, einheit: 'stueck' }, titel: 'Rollenkomponente, 500 kg', farbe: '500 kg' });
  const w = warne(auftrag([teppich, rolle]), inMail([teppich]), {
    ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ROLLE-1', 10, { bezug: 'stueck', vk_einheit: 'stueck' })),
    mindestmenge: { A: 'x' },
  });
  assert.equal(w.rechnung.find(z => z.text === 'Einkauf').betrag, -60);
  assert.equal(w.rechnung.find(z => z.text === 'Verkauf netto').betrag, 250);
  assert.equal(w.rohertrag, 250 - 60 - 30);
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
  const a = meter('l1', 20, { lieferant: 'A', nettoGesamt: 400 });
  const b = meter('l2', 20, { lieferant: 'B', nettoGesamt: 400, grosshaendlerId: 'ART-2', sku: 'ART-2' });
  const w = warne(auftrag([a, b]), inMail([a, b]), { kosten: KOSTEN_ZWEI, ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ART-2', 3)), mindestmenge: { A: 'x' } });
  // Je 60 Einkauf unter der Grenze von 100, zusammen 120 darueber: je 20 Fracht + 10 Mindermenge.
  assert.deepEqual(w.rechnung.filter(z => /Fracht/.test(z.text)).map(z => z.betrag), [-30, -30]);
  assert.equal(w.rohertrag, 800 - 120 - 60);
});

test('Mindermenge je Lieferung: Lieferant ueber der Grenze zahlt keine, der andere schon', () => {
  const a = meter('l1', 40, { lieferant: 'A', nettoGesamt: 400 });
  const b = meter('l2', 20, { lieferant: 'B', nettoGesamt: 400, grosshaendlerId: 'ART-2', sku: 'ART-2' });
  const w = warne(auftrag([a, b]), inMail([a, b]), { kosten: KOSTEN_ZWEI, ek: EK_MEHRERE(eZeile('ART-1', 3), eZeile('ART-2', 3)), mindestmenge: { A: 'x' } });
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

