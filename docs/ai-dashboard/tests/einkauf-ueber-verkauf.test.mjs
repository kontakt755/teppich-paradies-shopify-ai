// Einkauf ueber Verkauf (Benutzer 2026-11-13): Vergleich je Bestellposition und Text an den Vertreter.
// Nur synthetische Daten: Zahlen, Artikelnummern und Namen sind erfunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { einkaufUeberVerkauf, preisZeile, ohneBetraege, vertreterNachricht } from '../lib/einkauf-ueber-verkauf.mjs';
import { belegTodos } from '../lib/lieferbelege.mjs';
import { sortiereTodos } from '../lib/todos.mjs';

const pos = (o = {}) => ({ lineItemId: 'li1', sku: '8001-000001', titel: 'Testvorstrich, 10 kg', lieferant: 'C', istMuster: false, eigenleistung: false, nettoGesamt: 50, mengeBestellt: 1, ...o });
const auftrag = (o = {}) => ({ orderId: 'o1', orderName: '#9001', kundenname: 'Erika Beispiel', datum: '2026-11-12T09:00:00Z', positionen: [pos()], ...o });
const beleg = (o = {}) => ({
  id: 'b1', art: 'ab', datum: '2026-11-12T14:00:00Z', lieferant: 'C', refs: { belegnummer: '4711' }, zuordnung: { stufe: 'keine', orderIds: [] },
  preise: { positionen: [{ artikel: '8001-000001', menge: 1, einheit: 'STK', netto: 60 }] }, ...o,
});
const zeile = (netto, o = {}) => ({ preise: { positionen: [{ artikel: '8001-000001', menge: 1, einheit: 'STK', netto, ...o }] } });

test('Verlust ist rot, Gewinn nicht - gleich hoch zaehlt als Verlust', () => {
  const [w] = einkaufUeberVerkauf({ belege: [beleg()], kandidaten: [auftrag()] });
  assert.deepEqual({ art: w.art, ton: w.ton, orderName: w.orderName, sku: w.sku, einkauf: w.einkauf, verkauf: w.verkauf, differenz: w.differenz, belegnummer: w.belegnummer },
    { art: 'einkauf_ueber_verkauf', ton: 'crit', orderName: '#9001', sku: '8001-000001', einkauf: 60, verkauf: 50, differenz: 10, belegnummer: '4711' });
  assert.deepEqual(einkaufUeberVerkauf({ belege: [beleg(zeile(40))], kandidaten: [auftrag()] }), [], 'Einkauf unter Verkauf');
  assert.equal(einkaufUeberVerkauf({ belege: [beleg(zeile(50))], kandidaten: [auftrag()] }).length, 1, 'ohne Ertrag verkauft');
});

test('Mengen: Einkauf je Stueck mal bestellte Stueckzahl gegen das Netto der ganzen Zeile', () => {
  const k = [auftrag({ positionen: [pos({ mengeBestellt: 3, nettoGesamt: 150 })] })];
  const [w] = einkaufUeberVerkauf({ belege: [beleg(zeile(120, { menge: 2 }))], kandidaten: k });
  assert.equal(w.einkauf, 180);
  assert.equal(w.stueck, 3);
});

test('Juengster Beleg zaehlt: die geaenderte Auftragsbestaetigung hebt die Warnung auf', () => {
  const neu = beleg({ id: 'b2', datum: '2026-11-13T10:00:00Z', ...zeile(35) });
  assert.deepEqual(einkaufUeberVerkauf({ belege: [neu, beleg()], kandidaten: [auftrag()] }), []);
  const teurer = beleg({ id: 'b3', datum: '2026-11-14T10:00:00Z', art: 'rechnung' });
  assert.equal(einkaufUeberVerkauf({ belege: [beleg(), neu, teurer], kandidaten: [auftrag()] })[0].belegId, 'b3');
});

test('Zuordnung: ohne Zuordnung nur Bestellungen kurz vor dem Beleg, mit Zuordnung nur die genannte', () => {
  const alt = auftrag({ orderId: 'o0', orderName: '#8000', datum: '2026-09-01T09:00:00Z' });
  const spaeter = auftrag({ orderId: 'o2', orderName: '#9002', datum: '2026-11-20T09:00:00Z' });
  assert.deepEqual(einkaufUeberVerkauf({ belege: [beleg()], kandidaten: [alt, auftrag(), spaeter] }).map(w => w.orderName), ['#9001']);
  const fest = beleg({ zuordnung: { stufe: 'bestaetigt', orderIds: ['o0'] } });
  assert.deepEqual(einkaufUeberVerkauf({ belege: [fest], kandidaten: [alt, auftrag()] }).map(w => w.orderName), ['#8000']);
});

test('Kein Vergleich: andere Artikelnummer, Meterware, Muster, verschenkt, abgehakter Beleg, Beleg ohne Preise', () => {
  const nichts = (b, k = auftrag()) => assert.deepEqual(einkaufUeberVerkauf({ belege: [b], kandidaten: [k] }), []);
  nichts(beleg(zeile(60, { artikel: '8001-000002' })));
  nichts(beleg(zeile(60, { einheit: 'LMT' })));
  nichts(beleg(), auftrag({ positionen: [pos({ istMuster: true })] }));
  nichts(beleg(), auftrag({ positionen: [pos({ nettoGesamt: 0 })] }));
  nichts(beleg({ erledigt: { am: '2026-11-13' } }));
  nichts(beleg({ quittiert: { o1: { am: '2026-11-13' } } }));
  nichts(beleg({ preise: null }));
});

test('Text an den Vertreter: nennt Beleg, Artikel und beide Preise - per Du nur, wenn so hinterlegt', () => {
  const [w] = einkaufUeberVerkauf({ belege: [beleg()], kandidaten: [auftrag()] });
  const du = vertreterNachricht(w, { vertreter: { name: 'Max Beispiel', mail: 'max@lieferant-c.example', duzen: true }, absender: ['Erika Beispiel', ''] });
  assert.equal(du.an, 'max@lieferant-c.example');
  assert.equal(du.betreff, 'Preis zu Auftragsbestätigung 4711, Artikel 8001-000001');
  assert.match(du.text, /^Hallo Max,\n/);
  for (const teil of ['Auftragsbestätigung 4711', '8001-000001', '60,00 €', '50,00 €', 'Kannst du bitte einen Preis für uns hinterlegen und die Auftragsbestätigung ändern?', 'Erika Beispiel']) assert.ok(du.text.includes(teil), teil);
  const sie = vertreterNachricht({ ...w, belegArt: 'rechnung', belegnummer: null });
  assert.equal(sie.an, null);
  assert.match(sie.text, /^Guten Tag,\n/);
  assert.ok(sie.text.includes('Können Sie bitte einen Preis für uns hinterlegen und die Rechnung ändern?'));
  assert.ok(sie.text.endsWith('Teppich Paradies Oranienburg'));
});

test('Ohne Betraege (alle ausser dem Inhaber) und auf "Heute": rot, Knopf oeffnet den Text nur mit Entwurf', () => {
  const [w] = einkaufUeberVerkauf({ belege: [beleg()], kandidaten: [auftrag()] });
  assert.equal(preisZeile(w), 'Einkauf 60,00 € netto · Verkauf 50,00 € netto · 10,00 € darüber · Auftragsbestätigung 4711');
  const ohne = ohneBetraege({ ...w, entwurf: { text: 'x' } });
  assert.deepEqual([ohne.einkauf, ohne.verkauf, ohne.differenz, ohne.entwurf], [undefined, undefined, undefined, undefined]);
  assert.ok(!/\d,\d\d/.test(preisZeile(ohne)), preisZeile(ohne));
  const d = abw => ({ verfuegbar: true, belege: [], abweichungen: [abw], lieferanten: { C: 'Lieferant C' } });
  const [mit] = belegTodos(d({ ...w, entwurf: { text: 'x' } }), { jetzt: new Date('2026-11-13T10:00:00Z') });
  assert.deepEqual([mit.ton, mit.art, mit.knopf.text, mit.knopf.vertreter], ['crit', 'beleg_preis', 'Nachricht an Vertreter', w.id]);
  assert.ok(mit.titel.includes('#9001') && mit.kontext.includes('60,00 €'));
  assert.equal(belegTodos(d(ohne))[0].knopf.text, 'Ansehen');
  // Am ersten Tag schon ganz oben - nicht hinter aelteren Problemen eingeklappt.
  const sortiert = sortiereTodos([{ id: 'alt', ton: 'crit', alterTage: 20 }, { id: 'gelb', ton: 'warn', alterTage: 30 }, mit]);
  assert.deepEqual(sortiert.map(t => t.id), [mit.id, 'alt', 'gelb']);
});
