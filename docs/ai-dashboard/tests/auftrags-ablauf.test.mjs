import test from 'node:test';
import assert from 'node:assert/strict';
import { auftragsAblauf, fehlendeAngaben } from '../lib/auftrags-ablauf.mjs';

// Erfundene Testdaten - keine Kunden, keine Lieferantennamen.
const pos = (id, extra = {}) => ({ orderId: 'o1', orderName: '#T1', lineItemId: id, titel: `Artikel ${id}`, farbe: 'Grau', grosshaendlerId: `A-${id}`, bestellmenge: { menge: 1 }, ...extra });
const daten = () => ({
  gruppen: [
    { lieferant: 'A', positionen: [pos('a1'), pos('a2'), pos('x1', { orderId: 'o2' })] },
    { lieferant: 'B', positionen: [pos('b1', { grosshaendlerId: 'UNGEKLAERT' })] },
    { lieferant: 'UNGEKLAERT', positionen: [pos('u1')] },
  ],
  musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true })] }],
});
const stand = map => p => (map[p.lineItemId] ? { status: map[p.lineItemId], bestelltAm: '2026-10-19T08:00:00Z' } : null);
const schritt = ab => Object.fromEntries(ab.schritte.map(s => [s.key, s.stand]));

test('neuer Auftrag: Schritt "vorbereiten", je Lieferant und Art eine Nachricht, Ungeklaertes getrennt', () => {
  const ab = auftragsAblauf({ id: 'o1' }, daten());
  assert.equal(ab.jetzt, 'vorbereiten');
  assert.deepEqual(schritt(ab), { eingegangen: 'fertig', vorbereiten: 'jetzt', bestellt: 'offen', lieferung: 'offen', erledigt: 'offen' });
  assert.deepEqual(ab.lieferanten.map(g => `${g.lieferant}|${g.art}|${g.positionen.length}`), ['A|muster|1', 'A|ware|2']);
  // Fremder Auftrag (o2) zaehlt nicht mit.
  assert.equal(ab.positionen.length, 5);
  assert.deepEqual(ab.ungeklaert.map(x => x.pos.lineItemId).sort(), ['b1', 'u1']);
  assert.deepEqual(ab.ungeklaert.find(x => x.pos.lineItemId === 'u1').fehlt, ['Lieferant ungeklärt']);
});

test('fehlende Angaben in Alltagssprache, nichts geraten', () => {
  assert.deepEqual(fehlendeAngaben({ grosshaendlerId: 'UNGEKLAERT', bestellmenge: { menge: 'UNGEKLAERT' } }, 'A'),
    ['Artikelnummer beim Lieferanten fehlt', 'Bestellmenge ungeklärt']);
  assert.deepEqual(fehlendeAngaben(pos('ok'), 'A'), []);
});

test('alles bestellt -> Schritt Lieferung, Datum der Bestellung bekannt', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('a2')] }] };
  const ab = auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'bestellt', a2: 'geliefert' }));
  assert.equal(ab.jetzt, 'lieferung');
  assert.equal(schritt(ab).bestellt, 'fertig');
  assert.equal(ab.unterwegs.length, 1);
  assert.equal(ab.beiUns.length, 1);
  assert.equal(ab.bestelltAm, '2026-10-19T08:00:00Z');
});

test('teilweise bestellt bleibt bei "vorbereiten"; an Kunden raus -> erledigt ist dran', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('a2')] }] };
  assert.equal(auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'bestellt' })).jetzt, 'vorbereiten');
  assert.equal(auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'raus', a2: 'raus' })).jetzt, 'erledigt');
});

test('Muster aus eigenem Bestand brauchen keine Lieferantenbestellung', () => {
  const d = { musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true, musterHerkunft: 'eigen_versand' })] }] };
  const ab = auftragsAblauf({ id: 'o1' }, d);
  assert.equal(ab.lieferanten.length, 0);
  assert.equal(ab.ungeklaert.length, 0);
});

// --- Arbeitsliste (2026-10-20) ---
import { einordnung, verzugWerktage, kundeInformiertAus, kundenNachricht, nachfrageNachricht, einkaufZahlen } from '../lib/auftrags-ablauf.mjs';

const JETZT = new Date('2026-10-20T10:00:00Z'); // Dienstag

test('Verzug erst nach mehr als 10 Werktagen; bestaetigter Termin zaehlt vorher', () => {
  assert.equal(verzugWerktage({ status: 'bestellt', bestelltAm: '2026-10-06T08:00:00Z' }, JETZT), null, 'genau 10 Werktage: noch kein Verzug');
  assert.equal(verzugWerktage({ status: 'bestellt', bestelltAm: '2026-10-05T08:00:00Z' }, JETZT), 11);
  assert.equal(verzugWerktage({ status: 'bestellt', bestelltAm: '2026-10-01T08:00:00Z', beschaffung: { liefertermin: '2026-10-25' } }, JETZT), null);
  assert.ok(verzugWerktage({ status: 'bestellt', bestelltAm: '2026-10-15T08:00:00Z', beschaffung: { liefertermin: '2026-10-19' } }, JETZT) !== null);
  assert.equal(verzugWerktage({ status: 'geliefert', bestelltAm: '2026-09-01T08:00:00Z' }, JETZT), null);
});

test('Einordnung: zu bestellen und Ware da ohne Info sind "jetzt", Unterwegs wartet eingeklappt', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('a2')] }] };
  const e = (st, inf = null) => einordnung(auftragsAblauf({ id: 'o1' }, d, stand(st)), inf, JETZT);
  assert.deepEqual(e({}).gruende, ['bestellen']);
  assert.equal(e({ a1: 'bestellt', a2: 'bestellt' }).gruppe, 'unterwegs', 'frisch bestellt (19.10.)');
  const da = e({ a1: 'geliefert', a2: 'geliefert' });
  assert.deepEqual([da.gruppe, da.gruende], ['jetzt', ['informieren']]);
  assert.equal(e({ a1: 'geliefert', a2: 'geliefert' }, { am: '2026-10-20' }).gruppe, 'beiKunde');
  const alt = stand({ a1: 'bestellt' });
  const verzug = einordnung(auftragsAblauf({ id: 'o1' }, { gruppen: [{ lieferant: 'A', positionen: [pos('a1')] }] }, p => ({ ...alt(p), bestelltAm: '2026-10-01T08:00:00Z' })), null, JETZT);
  assert.deepEqual([verzug.gruppe, verzug.gruende, verzug.verzug.length], ['jetzt', ['verzug'], 1]);
});

test('"Kunde informiert" aus dem Verlauf; "zurueck" hebt es auf', () => {
  assert.equal(kundeInformiertAus([]), null);
  assert.deepEqual(kundeInformiertAus([{ schritt: 'kunde_informiert', am: '2026-10-20T09:00:00Z', von: 'T' }]), { am: '2026-10-20T09:00:00Z', von: 'T' });
  assert.equal(kundeInformiertAus([{ schritt: 'kunde_informiert', am: '1' }, { schritt: 'zurueck', bezug: 'kunde_informiert', am: '2' }]), null);
});

test('Nachrichten: Sie-Form, Auftrag genannt, nichts erfunden', () => {
  const k = kundenNachricht({ auftragName: '#T1', kundeName: 'Erika Muster', artikel: ['Artikel a1 · Grau'] });
  assert.match(k.betreff, /#T1/);
  assert.match(k.text, /^Guten Tag Erika Muster,/);
  assert.match(k.text, /Ihre Ware/);
  assert.match(kundenNachricht({ auftragName: '#T1' }).text, /^Guten Tag,/);
  const n = nachfrageNachricht({ auftragName: '#T1', positionen: [{ pos: pos('a1', { bestellmenge: { menge: 2, einheit: 'Pakete' } }), eintrag: { bestelltAm: '2026-10-01T08:00:00Z', lieferantBestellnummer: 'L-9' } }] });
  assert.match(n.text, /Artikel a1 · Grau · 2 Pakete · Art\.-Nr\. A-a1 · bestellt am 01\.10\.2026 · Ihre Auftragsnr\. L-9/);
});

test('Zahlen fuer Heute zaehlen je Auftrag wie die Liste', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('b1', { orderId: 'o2' })] }] };
  const z = einkaufZahlen([{ id: 'o1' }, { id: 'o2' }], d, stand({ b1: 'geliefert' }), () => null, JETZT);
  assert.deepEqual(z, { bestellen: 1, informieren: 1, verzug: 0 });
});

test('Rundgang 29.10. (T2): Bestellen, Klaeren, Informieren und Nachfragen vor reinem Musterversand', async () => {
  const { jetztRang } = await import('../lib/auftrags-ablauf.mjs');
  assert.equal(jetztRang({ gruende: ['muster_da'] }), 1);
  for (const g of ['bestellen', 'ungeklaert', 'informieren', 'verzug']) assert.equal(jetztRang({ gruende: [g] }), 0, g);
  assert.equal(jetztRang({ gruende: ['muster_da', 'bestellen'] }), 0, 'gemischt: der Warenschritt zaehlt');
  assert.equal(jetztRang({ gruende: [] }), 1);
  assert.equal(jetztRang(null), 1);
});
