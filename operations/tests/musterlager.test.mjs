import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  musterSchluessel, leseLager, einlagern, aendern, entfernen, wendeLagerAn, festzuschreiben, farbenFuer, vorschlaege,
  kurzTitel, musterlagerPfad, MusterlagerFehler, LAGER_ARTEN, musterJeStueck, MUSTER_GROESSE,
} from '../lib/musterlager.mjs';
import { haengeWahlAn, leseEreignisse, wendeAufModellAn, musterOhneLieferant, musterherkunftPfad } from '../lib/musterherkunft.mjs';

// Nur synthetische Daten: erfundene Kunden, Pseudonym-Lieferant, ausgedachte SKUs.
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ml-'));
const AM = new Date('2026-10-13T08:00:00Z');

function muster(orderId, lineItemId, sku, extra = {}) {
  return { orderId, lineItemId, orderDatum: extra.orderDatum || '2026-10-10T10:00:00Z', istMuster: true, sku, titel: 'Muster Testvelours Teppichboden', farbe: 'Sand', lieferant: 'A', route: 'UNGEKLAERT', ...extra };
}
function auftrag(id, datum, positionen, extra = {}) {
  return { id, name: `#${id}`, datum, offen: true, storniert: false, positionen: positionen.map(p => ({ ...p, orderId: id, orderDatum: datum })), ...extra };
}
function modellMit(auftraege, testauftraege = []) {
  const alle = auftraege.flatMap(a => a.positionen.filter(p => p.istMuster));
  return { auftraege, testauftraege, musterGruppen: [{ lieferant: 'A', route: 'MUSTER', positionen: alle.map(p => ({ ...p, route: 'MUSTER' })) }] };
}

test('musterSchluessel: M- ab, Sammelprodukt ueber die Quellvariante, UNGEKLAERT ist kein Schluessel', () => {
  assert.equal(musterSchluessel({ sku: 'M-TESTVEL4_102' }), 'TESTVEL4_102');
  assert.equal(musterSchluessel({ sku: ' m-testvel4_102 ' }), 'TESTVEL4_102');
  assert.equal(musterSchluessel({ sku: 'TP-MUSTER-000', musterQuelle: { sku: 'PVCTEST_400' } }), 'PVCTEST_400');
  assert.equal(musterSchluessel({ sku: 'TP-MUSTER-000', musterQuelle: null }), null);
  assert.equal(musterSchluessel({ sku: 'UNGEKLAERT' }), null);
  assert.equal(musterSchluessel({ sku: 'TESTVEL4_102' }), 'TESTVEL4_102');
});

test('einlagern: legt an, gleiche Art und gleiches Muster zaehlt dazu, andere Art steht getrennt', () => {
  const file = musterlagerPfad(tmp());
  const a = einlagern(file, { titel: 'Testvelours Teppichboden', farbe: 'Creme (102)', schluessel: ['testvel4_102', 'TESTVEL5_102'], art: 'bahn', anzahl: 2, ort: 'Regal B', actor: 'Mitarbeiter 1', jetzt: AM });
  assert.equal(a.neu, true);
  assert.deepEqual(a.eintrag.schluessel, ['TESTVEL4_102', 'TESTVEL5_102']);
  const b = einlagern(file, { titel: 'Testvelours Teppichboden', farbe: 'Creme (102)', schluessel: ['TESTVEL4_102'], art: 'bahn', anzahl: 1, actor: 'Mitarbeiter 2', jetzt: AM });
  assert.equal(b.neu, false);
  assert.equal(b.eintrag.anzahl, 3);
  assert.equal(b.eintrag.ort, 'Regal B', 'ohne neuen Platz bleibt der alte');
  const c = einlagern(file, { titel: 'Testvelours Teppichboden', farbe: 'Creme (102)', schluessel: ['TESTVEL4_102'], art: 'einzel', anzahl: 3, actor: 'Mitarbeiter 1', jetzt: AM });
  assert.equal(c.neu, true);
  assert.equal(leseLager(file).eintraege.length, 2);
  assert.throws(() => einlagern(file, { titel: 'X', schluessel: [], art: 'einzel', actor: 'x' }), MusterlagerFehler);
  assert.throws(() => einlagern(file, { titel: 'X', schluessel: ['A'], art: 'kiste', actor: 'x' }), MusterlagerFehler);
  assert.throws(() => einlagern(file, { titel: 'X', schluessel: ['A'], art: 'einzel', anzahl: -1, actor: 'x' }), MusterlagerFehler);
  assert.throws(() => einlagern(file, { titel: 'X', schluessel: ['A'], art: 'einzel' }), MusterlagerFehler);
});

test('leseLager: fehlende Datei ist leer, beschaedigte wirft (sonst ueberschriebe der naechste Klick alles)', () => {
  const dir = tmp();
  assert.deepEqual(leseLager(musterlagerPfad(dir)).eintraege, []);
  fs.writeFileSync(musterlagerPfad(dir), '{kaputt');
  assert.throws(() => leseLager(musterlagerPfad(dir)), MusterlagerFehler);
  assert.throws(() => einlagern(musterlagerPfad(dir), { titel: 'X', schluessel: ['A'], art: 'einzel', actor: 'x' }), MusterlagerFehler);
});

test('aendern und entfernen: nur uebergebene Felder, Verlauf mit wer, entfernt bleibt lesbar', () => {
  const file = musterlagerPfad(tmp());
  const { eintrag } = einlagern(file, { titel: 'Testlino', farbe: 'Grau', schluessel: ['LINTEST_1'], art: 'probestueck', actor: 'Mitarbeiter 1', jetzt: AM });
  const e = aendern(file, eintrag.id, { leer: true, ort: 'Keller' }, { actor: 'Mitarbeiter 2', jetzt: AM });
  assert.equal(e.leer, true);
  assert.equal(e.ort, 'Keller');
  assert.equal(e.art, 'probestueck');
  assert.match(e.verlauf.at(-1).was, /leer/);
  assert.equal(e.verlauf.at(-1).von, 'Mitarbeiter 2');
  assert.throws(() => aendern(file, 'ml-gibtsnicht', { leer: true }, { actor: 'x' }), MusterlagerFehler);
  entfernen(file, eintrag.id, { actor: 'Mitarbeiter 1', jetzt: AM });
  const l = leseLager(file);
  assert.equal(l.eintraege.length, 0);
  assert.equal(l.entfernt[0].entferntVon, 'Mitarbeiter 1');
});

test('wendeLagerAn: offene Musterposition kommt automatisch aus dem Lager und faellt aus der Bestellung', () => {
  const file = musterlagerPfad(tmp());
  einlagern(file, { titel: 'Testvelours', farbe: 'Sand', schluessel: ['TESTVEL4_102'], art: 'bahn', ort: 'Regal B', actor: 'x', jetzt: AM });
  const m = modellMit([auftrag('O1', '2026-10-11T10:00:00Z', [muster('O1', 'L1', 'M-TESTVEL4_102'), muster('O1', 'L2', 'M-ANDERS_1')])]);
  wendeLagerAn(m, leseLager(file));
  const [p1, p2] = m.auftraege[0].positionen;
  assert.equal(p1.musterHerkunft, 'eigen_versand');
  assert.equal(p1.musterHerkunftQuelle, 'lager');
  assert.equal(p1.musterLager.ort, 'Regal B');
  assert.equal(p1.musterLager.artLabel, LAGER_ARTEN.bahn);
  assert.equal(musterOhneLieferant(p1), true, 'nicht in die Bestellmail');
  assert.equal(p2.musterHerkunft, undefined);
  assert.equal(musterOhneLieferant(p2), false);
  const g = m.musterGruppen[0].positionen;
  assert.equal(g.find(p => p.lineItemId === 'L1').musterHerkunft, 'eigen_versand', 'Mustergruppen bekommen dasselbe');
  assert.equal(g.find(p => p.lineItemId === 'L2').musterHerkunft, undefined);
});

test('wendeLagerAn: ausdrueckliche Wahl, vorhandener Stand, erledigte Auftraege und versendete Positionen bleiben unberuehrt', () => {
  const file = musterlagerPfad(tmp());
  einlagern(file, { titel: 'Testvelours', farbe: 'Sand', schluessel: ['TESTVEL4_102'], art: 'bahn', ort: 'Regal B', actor: 'x', jetzt: AM });
  const gewaehlt = muster('O1', 'L1', 'M-TESTVEL4_102', { musterHerkunft: 'lieferant' });
  const bestellt = muster('O2', 'L1', 'M-TESTVEL4_102');
  const zu = muster('O3', 'L1', 'M-TESTVEL4_102');
  const vorbei = muster('O4', 'L1', 'M-TESTVEL4_102', { musterHerkunft: 'eigen_vorbei' });
  const versendet = muster('O5', 'L1', 'M-TESTVEL4_102', { menge: 0 });
  const m = modellMit([
    auftrag('O1', '2026-10-01', [gewaehlt]), auftrag('O2', '2026-10-02', [bestellt]),
    auftrag('O3', '2026-10-03', [zu], { offen: false }), auftrag('O4', '2026-10-04', [vorbei]),
    auftrag('O5', '2026-10-05', [versendet]),
  ]);
  wendeLagerAn(m, leseLager(file), { statusAlle: { 'O2::L1': { status: 'bestellt' } } });
  assert.equal(m.auftraege[0].positionen[0].musterHerkunft, 'lieferant');
  assert.equal(m.auftraege[0].positionen[0].musterLager, undefined);
  assert.equal(m.auftraege[1].positionen[0].musterHerkunft, undefined);
  assert.equal(m.auftraege[2].positionen[0].musterHerkunft, undefined);
  // "Vorbeibringen" bleibt, bekommt aber den Lagerplatz dazu.
  assert.equal(m.auftraege[3].positionen[0].musterHerkunft, 'eigen_vorbei');
  assert.equal(m.auftraege[3].positionen[0].musterLager.ort, 'Regal B');
  assert.equal(m.auftraege[4].positionen[0].musterHerkunft, undefined, 'in Shopify schon versendet: nichts zurueckzulegen');
});

test('wendeLagerAn: Einzelmuster zaehlen ab - das aelteste wartende bekommt das letzte, der Rest geht zum Lieferanten', () => {
  const file = musterlagerPfad(tmp());
  const { eintrag } = einlagern(file, { titel: 'Testvelours', farbe: 'Sand', schluessel: ['TESTVEL4_102'], art: 'einzel', anzahl: 2, ort: 'Schublade 1', actor: 'x', jetzt: AM });
  // Eines ist schon verschickt (Ereignis mit lagerId), zwei warten.
  const verschickt = muster('O0', 'L1', 'M-TESTVEL4_102', { musterHerkunft: 'eigen_versand', musterLagerId: eintrag.id });
  const neu = muster('O2', 'L1', 'M-TESTVEL4_102');
  const alt = muster('O1', 'L1', 'M-TESTVEL4_102');
  const test1 = muster('T1', 'L1', 'M-TESTVEL4_102');
  const m = modellMit([auftrag('O0', '2026-10-01', [verschickt]), auftrag('O2', '2026-10-09', [neu]), auftrag('O1', '2026-10-05', [alt])], [auftrag('T1', '2026-10-02', [test1])]);
  const stand = wendeLagerAn(m, leseLager(file), { statusAlle: { 'O0::L1': { status: 'raus' } } });
  const [, pNeu, pAlt] = m.auftraege.map(a => a.positionen[0]);
  assert.equal(pAlt.musterHerkunftQuelle, 'lager');
  assert.equal(pAlt.musterLager.rest, 0);
  assert.equal(pNeu.musterHerkunft, undefined, 'aufgebraucht: beim Lieferanten bestellen');
  assert.equal(pNeu.musterLagerLeer.ort, 'Schublade 1');
  assert.equal(m.auftraege[0].positionen[0].musterLager.id, eintrag.id);
  assert.equal(m.testauftraege[0].positionen[0].musterHerkunftQuelle, 'lager', 'Testbestellungen zeigen es, verbrauchen aber nichts');
  assert.deepEqual(stand.get(eintrag.id), { verbraucht: 1, reserviert: 1, rest: 0, reichtNoch: null, jeStueck: null });
});

test('wendeLagerAn: leer gesetzt heisst wieder beim Lieferanten bestellen', () => {
  const file = musterlagerPfad(tmp());
  const { eintrag } = einlagern(file, { titel: 'Testlino', farbe: 'Grau', schluessel: ['LINTEST_1'], art: 'probestueck', actor: 'x', jetzt: AM });
  aendern(file, eintrag.id, { leer: true }, { actor: 'x', jetzt: AM });
  const m = modellMit([auftrag('O1', '2026-10-11', [muster('O1', 'L1', 'M-LINTEST_1')])]);
  wendeLagerAn(m, leseLager(file));
  const p = m.auftraege[0].positionen[0];
  assert.equal(p.musterHerkunft, undefined);
  assert.equal(p.musterLagerLeer.artLabel, LAGER_ARTEN.probestueck);
});

test('Verschicken haelt die Zuordnung fest: Ereignis mit lagerId, danach zaehlt es als verbraucht', () => {
  const dir = tmp();
  const lagerDatei = musterlagerPfad(dir);
  const { eintrag } = einlagern(lagerDatei, { titel: 'Testvelours', farbe: 'Sand', schluessel: ['TESTVEL4_102'], art: 'einzel', anzahl: 1, actor: 'x', jetzt: AM });
  const neuesModell = () => modellMit([auftrag('O1', '2026-10-11', [muster('O1', 'L1', 'M-TESTVEL4_102')])]);
  const m = neuesModell();
  wendeAufModellAn(m, leseEreignisse(musterherkunftPfad(dir)));
  wendeLagerAn(m, leseLager(lagerDatei));
  const offen = festzuschreiben(m.auftraege[0]);
  assert.equal(offen.length, 1);
  for (const p of offen) haengeWahlAn(musterherkunftPfad(dir), { orderId: 'O1', lineItemId: p.lineItemId, herkunft: p.musterHerkunft, actor: 'Mitarbeiter 1', notiz: 'Aus dem Musterlager', lagerId: p.musterLager.id, jetzt: AM });
  assert.equal(leseEreignisse(musterherkunftPfad(dir))[0].lagerId, eintrag.id);
  // Neu gelesen und schon "raus": steht fest, Lager ist auf 0.
  const m2 = neuesModell();
  wendeAufModellAn(m2, leseEreignisse(musterherkunftPfad(dir)));
  const stand = wendeLagerAn(m2, leseLager(lagerDatei), { statusAlle: { 'O1::L1': { status: 'raus' } } });
  assert.equal(m2.auftraege[0].positionen[0].musterLagerId, eintrag.id);
  assert.equal(festzuschreiben(m2.auftraege[0]).length, 0, 'nicht zweimal festschreiben');
  assert.deepEqual(stand.get(eintrag.id), { verbraucht: 1, reserviert: 0, rest: 0, reichtNoch: null, jeStueck: null });
});

test('farbenFuer: Mustervarianten liefern die SKU, alle Breiten einer Farbe teilen sich einen Eintrag', () => {
  const produkt = { varianten: [
    { farbe: 'Creme (102)', sku: 'TESTVEL4_102' }, { farbe: 'Creme (102)', sku: 'TESTVEL5_102' }, { farbe: 'Taupe (159)', sku: 'TESTVEL4_159' },
  ] };
  const musterProdukt = { varianten: [{ farbe: 'Creme (102)', sku: 'M-TESTVEL4_102' }, { farbe: 'Taupe (159)', sku: 'M-TESTVEL4_159' }] };
  assert.deepEqual(farbenFuer(produkt, musterProdukt), [
    { farbe: 'Creme (102)', schluessel: ['TESTVEL4_102', 'TESTVEL5_102'] },
    { farbe: 'Taupe (159)', schluessel: ['TESTVEL4_159'] },
  ]);
  // Teppich nach Maß: nur das Musterprodukt traegt eine SKU.
  assert.deepEqual(farbenFuer({ varianten: [{ farbe: 'Sand', sku: null }] }, { varianten: [{ farbe: 'Sand', sku: 'M-TESTVEL4_004' }] }), [{ farbe: 'Sand', schluessel: ['TESTVEL4_004'] }]);
  assert.deepEqual(farbenFuer({ varianten: [{ farbe: 'Sand', sku: null }] }), []);
});

test('vorschlaege: eingetroffenes Probestueck zuerst, mehrfach gefragte Farben danach, Lagerware faellt weg', () => {
  const jetzt = new Date('2026-10-13T12:00:00Z');
  const lino = (o, l) => muster(o, l, 'M-LINTEST_1', { titel: 'Muster Testlino Linoleumboden 200cm', farbe: 'Grau', handle: 'muster-testlino-linoleumboden-200cm', musterQuelle: { produktHandle: 'testlino-linoleumboden-200cm' } });
  const velours = (o, l) => muster(o, l, 'M-TESTVEL4_102', { handle: 'muster-testvelours-teppichboden', musterQuelle: { produktHandle: 'testvelours-teppichboden' } });
  const m = modellMit([
    auftrag('O1', '2026-10-01T10:00:00Z', [lino('O1', 'L1')]),
    auftrag('O2', '2026-09-20T10:00:00Z', [velours('O2', 'L1')]),
    auftrag('O3', '2026-10-05T10:00:00Z', [velours('O3', 'L1')]),
    auftrag('O4', '2026-10-06T10:00:00Z', [muster('O4', 'L1', 'M-EINMAL_1')]),
    auftrag('O5', '2026-10-07T10:00:00Z', [muster('O5', 'L1', 'M-IMLAGER_1'), muster('O5', 'L2', 'M-IMLAGER_1')]),
  ]);
  const gruppe = h => (h.includes('linoleum') ? 'Linoleumboden' : 'Teppichboden');
  const v = vorschlaege(m, {
    lager: { eintraege: [{ id: 'ml-1', art: 'einzel', schluessel: ['IMLAGER_1'] }] },
    statusAlle: { 'O1::L1': { status: 'geliefert', geliefertAm: '2026-10-08T09:00:00Z' } },
    produktgruppe: gruppe, jetzt,
  });
  assert.deepEqual(v.map(x => [x.schluessel, x.grund, x.anzahl]), [['LINTEST_1', 'eingetroffen', 1], ['TESTVEL4_102', 'gefragt', 2]]);
  assert.equal(v[0].artVorschlag, 'probestueck');
  assert.equal(v[0].eingetroffen.orderName, '#O1');
  assert.equal(v[0].titel, 'Testlino Linoleumboden');
});

test('kurzTitel: Muster-Vorsatz und Rollenbreiten fallen weg', () => {
  assert.equal(kurzTitel('Muster Vellana Teppichboden 400cm 500cm'), 'Vellana Teppichboden');
  assert.equal(kurzTitel('Muster: Selene Linoleumboden 200cm'), 'Selene Linoleumboden');
  assert.equal(kurzTitel('Elastium Linoleumboden 200cm-1'), 'Elastium Linoleumboden');
  assert.equal(kurzTitel('Palenza Teppich nach Maß'), 'Palenza Teppich nach Maß');
});

test('A5 (Inhaber 2026-10-15): Probestueck 2 x 1 m ergibt 54, Bahn 4 m x 20 cm 27 Muster', () => {
  assert.equal(MUSTER_GROESSE.name, 'A5');
  assert.equal(musterJeStueck('probestueck'), 54);
  assert.equal(musterJeStueck('bahn'), 27);
  assert.equal(musterJeStueck('einzel'), null);
});

test('reichtNoch: Zuschnitt-Vorrat minus verschickte seit dem letzten Auffuellen minus reservierte', () => {
  const dir = tmp();
  const lagerDatei = musterlagerPfad(dir);
  const { eintrag } = einlagern(lagerDatei, { titel: 'Testvelours', farbe: 'Sand', schluessel: ['TESTVEL4_102'], art: 'bahn', anzahl: 1, actor: 'x', jetzt: AM });
  // Ein Muster ging raus (Ereignis mit lagerId, nach dem Einlagern), eines ist offen und reserviert.
  const SPAETER = new Date('2026-10-14T08:00:00Z');
  haengeWahlAn(musterherkunftPfad(dir), { orderId: 'O1', lineItemId: 'L1', herkunft: 'eigen_versand', actor: 'x', lagerId: eintrag.id, jetzt: SPAETER });
  const modell = () => modellMit([
    auftrag('O1', '2026-10-11', [muster('O1', 'L1', 'M-TESTVEL4_102')]),
    auftrag('O2', '2026-10-12', [muster('O2', 'L1', 'M-TESTVEL4_102')]),
  ]);
  const m = modell();
  wendeAufModellAn(m, leseEreignisse(musterherkunftPfad(dir)));
  let st = wendeLagerAn(m, leseLager(lagerDatei), { statusAlle: { 'O1::L1': { status: 'raus' } } }).get(eintrag.id);
  assert.deepEqual([st.jeStueck, st.verbraucht, st.reserviert, st.reichtNoch], [27, 1, 1, 25]);
  // Neue Bahn hingelegt und neu gezaehlt: Verschicktes von vorher zaehlt nicht mehr dagegen.
  aendern(lagerDatei, eintrag.id, { anzahl: 2 }, { actor: 'x', jetzt: new Date('2026-10-15T08:00:00Z') });
  const m2 = modell();
  wendeAufModellAn(m2, leseEreignisse(musterherkunftPfad(dir)));
  st = wendeLagerAn(m2, leseLager(lagerDatei), { statusAlle: { 'O1::L1': { status: 'raus' } } }).get(eintrag.id);
  assert.equal(st.reichtNoch, 53);
  // Leer gesetzt: reicht fuer nichts mehr.
  aendern(lagerDatei, eintrag.id, { leer: true }, { actor: 'x', jetzt: new Date('2026-10-15T09:00:00Z') });
  st = wendeLagerAn(modell(), leseLager(lagerDatei)).get(eintrag.id);
  assert.equal(st.reichtNoch, 0);
});
