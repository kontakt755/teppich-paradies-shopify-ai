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
import { einordnung, verzugAmpel, auftragsAmpel, kundeInformiertAus, kundenNachricht, nachfrageNachricht, einkaufZahlen } from '../lib/auftrags-ablauf.mjs';

const JETZT = new Date('2026-10-20T10:00:00Z'); // Dienstag

test('Verzug wie "Je Lieferant": gelb ab 7, rot ab 14 Kalendertagen; bestaetigter Termin zaehlt vorher', () => {
  const v = (bestelltAm, extra = {}) => verzugAmpel({ status: 'bestellt', bestelltAm, ...extra }, JETZT);
  assert.equal(v('2026-10-14T08:00:00Z'), null, '6 Tage: noch im Plan');
  assert.deepEqual([v('2026-10-13T08:00:00Z').stufe, v('2026-10-13T08:00:00Z').tage], ['gelb', 7], '7 Tage: nachhaken');
  assert.deepEqual([v('2026-10-07T08:00:00Z').stufe, v('2026-10-07T08:00:00Z').tage], ['gelb', 13]);
  assert.deepEqual([v('2026-10-06T08:00:00Z').stufe, v('2026-10-06T08:00:00Z').tage], ['rot', 14], '14 Tage = frueher 10 Werktage: ueberfaellig');
  assert.equal(v('2026-10-01T08:00:00Z', { beschaffung: { liefertermin: '2026-10-25' } }), null, 'Termin vor uns: im Plan, egal wie lange bestellt');
  const termin = v('2026-10-15T08:00:00Z', { beschaffung: { liefertermin: '2026-10-19' } });
  assert.deepEqual([termin.stufe, termin.grund, termin.tage], ['rot', 'termin', 1], 'Termin vorbei: sofort rot, auch nach 5 Tagen');
  assert.equal(verzugAmpel({ status: 'geliefert', bestelltAm: '2026-09-01T08:00:00Z' }, JETZT), null);
});

test('Auftragskarte: Ampel aus der dringendsten Position - blockiert, gesperrt, ueberfaellig, nachhaken', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1')] }] };
  const mit = (tage) => { const ab = auftragsAblauf({ id: 'o1' }, d, () => ({ status: 'bestellt', bestelltAm: new Date(JETZT - tage * 864e5).toISOString() })); return auftragsAmpel(ab, einordnung(ab, null, JETZT)); };
  assert.equal(mit(3), null, 'frisch bestellt: ruhig');
  assert.deepEqual([mit(8).stufe, mit(8).wort], ['gelb', 'Nachhaken · 8 Tage']);
  assert.deepEqual([mit(15).stufe, mit(15).wort], ['rot', 'Überfällig · 15 Tage']);
  const ungeklaert = auftragsAblauf({ id: 'o1' }, { gruppen: [{ lieferant: 'A', positionen: [pos('a1', { grosshaendlerId: 'UNGEKLAERT' })] }] }, () => null);
  assert.deepEqual([auftragsAmpel(ungeklaert, einordnung(ungeklaert, null, JETZT)).stufe, auftragsAmpel(ungeklaert, einordnung(ungeklaert, null, JETZT)).wort], ['rot', 'Blockiert']);
  const md = { musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true })] }] };
  const muster = auftragsAblauf({ id: 'o1' }, md, () => null);
  assert.equal(auftragsAmpel(muster, einordnung(muster, null, JETZT)), null, 'Muster zu bestellen: normale Arbeit, ruhig');
  // Gesperrt und seit 15 Tagen bestellt: rot "Gesperrt", aber kein Nachfragen beim Lieferanten.
  const gesperrt = auftragsAblauf({ id: 'o1' }, { ...md, gesperrteMuster: ['m1'] }, () => ({ status: 'bestellt', bestelltAm: new Date(JETZT - 15 * 864e5).toISOString() }));
  const eg = einordnung(gesperrt, null, JETZT);
  assert.equal(auftragsAmpel(gesperrt, eg).wort, 'Gesperrt');
  assert.equal(eg.verzug.length, 0, 'kommt nicht mehr: nicht nachfragen');
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
  const nachhaken = einordnung(auftragsAblauf({ id: 'o1' }, { gruppen: [{ lieferant: 'A', positionen: [pos('a1')] }] }, p => ({ ...alt(p), bestelltAm: '2026-10-12T08:00:00Z' })), null, JETZT);
  assert.deepEqual([nachhaken.gruppe, nachhaken.verzug[0].ampel.stufe], ['jetzt', 'gelb'], 'ab 7 Tagen steht der Auftrag unter "jetzt": nachhaken');
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

test('w-223: Warenauftraege vor reinen Musterauftraegen, Musterversand zuletzt', async () => {
  const { jetztRang } = await import('../lib/auftrags-ablauf.mjs');
  const ware = { positionen: [{ art: 'ware' }] };
  const muster = { positionen: [{ art: 'muster' }] };
  const gemischt = { positionen: [{ art: 'muster' }, { art: 'ware' }] };
  for (const g of ['bestellen', 'ungeklaert', 'informieren', 'verzug']) assert.equal(jetztRang({ gruende: [g] }, ware), 0, g);
  for (const g of ['bestellen', 'ungeklaert', 'verzug']) assert.equal(jetztRang({ gruende: [g] }, muster), 1, `reines Muster: ${g}`);
  assert.equal(jetztRang({ gruende: ['muster_da', 'bestellen'] }, gemischt), 0, 'gemischt: es gibt einen zahlenden Warenkunden');
  assert.equal(jetztRang({ gruende: ['muster_da'] }, muster), 2);
  assert.equal(jetztRang({ gruende: ['muster_da'] }, gemischt), 2, 'nur Muster verschicken bleibt hinten, auch im gemischten Auftrag');
  assert.equal(jetztRang({ gruende: [] }, ware), 2);
  assert.equal(jetztRang(null), 2);
  // Der gemeldete Fall: juengerer Warenkunde, aelterer Musterauftrag mit Grund "bestellen".
  const liste = [
    { id: 'alt-muster', e: { gruende: ['bestellen'] }, ab: muster },
    { id: 'versand', e: { gruende: ['muster_da'] }, ab: muster },
    { id: 'neu-ware', e: { gruende: ['bestellen'] }, ab: ware },
  ];
  assert.deepEqual(liste.sort((x, y) => jetztRang(x.e, x.ab) - jetztRang(y.e, y.ab)).map(x => x.id), ['neu-ware', 'alt-muster', 'versand']);
});

test('Offener Versandschritt beim Muster klingt nicht nach erledigt', () => {
  const muster = { gruppen: [], musterGruppen: [{ lieferant: 'A', positionen: [pos('m1')] }] };
  for (const status of ['bestellt', 'geliefert']) {
    const schritt = auftragsAblauf({ id: 'o1' }, muster, () => ({ status })).schritte.find(s => s.stand === 'jetzt');
    assert.equal(schritt.key, 'lieferung');
    assert.equal(schritt.label, 'Muster verschicken');
    assert.doesNotMatch(schritt.label, /verschickt/);
  }
  // Muster aus dem eigenen Lager ohne Stand: ebenfalls noch nicht raus.
  const eigen = { musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true, musterHerkunft: 'eigen_versand' })] }] };
  assert.equal(auftragsAblauf({ id: 'o1' }, eigen).schritte.find(s => s.stand === 'jetzt').label, 'Muster verschicken');
  // Erst mit "raus" ist der Schritt fertig.
  const raus = auftragsAblauf({ id: 'o1' }, muster, () => ({ status: 'raus' })).schritte.find(s => s.key === 'lieferung');
  assert.equal(raus.stand, 'fertig');
});

test('Reiner Musterauftrag zeigt keine Waren-Worte, gemischter Auftrag bleibt bei den Waren-Schritten', () => {
  const muster = { gruppen: [], musterGruppen: [{ lieferant: 'A', positionen: [pos('m1')] }] };
  const labels = auftragsAblauf({ id: 'o1' }, muster).schritte.map(s => s.label);
  assert.ok(labels.includes('Muster verschicken'));
  assert.ok(!labels.some(l => /Ware|Montage/.test(l)));
  const gemischt = { gruppen: [{ lieferant: 'A', positionen: [pos('a1')] }], musterGruppen: [{ lieferant: 'A', positionen: [pos('m1')] }] };
  assert.ok(auftragsAblauf({ id: 'o1' }, gemischt).schritte.some(s => s.label === 'Ware da · Lieferung/Montage'));
});

