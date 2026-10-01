import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  haengeWahlAn, leseEreignisse, wirksameWahl, wahlFuer, wendeAufModellAn, musterOhneLieferant, musterherkunftPfad, MusterherkunftFehler,
} from '../lib/musterherkunft.mjs';
import { setzeStatus, setzeZurueckAufOffen, leseAlle, statusVorErledigt } from '../lib/auftragsstatus.mjs';
import { zeitleiste } from '../lib/auftragsverlauf.mjs';

// Nur synthetische Daten: erfundene Kunden, Pseudonym-Lieferant.
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-mh-'));

test('haengeWahlAn: nur anhaengen, wer/wann, unbekannte Werte abgelehnt', () => {
  const file = musterherkunftPfad(tmp());
  haengeWahlAn(file, { orderId: 'O1', herkunft: 'eigen_vorbei', actor: 'Mitarbeiter 1', jetzt: new Date('2026-01-01T10:00:00Z') });
  haengeWahlAn(file, { orderId: 'O1', lineItemId: 'L2', herkunft: 'lieferant', actor: 'Mitarbeiter 2', notiz: 'doch bestellen', jetzt: new Date('2026-01-02T10:00:00Z') });
  const e = leseEreignisse(file);
  assert.deepEqual(e.map(x => [x.orderId, x.lineItemId, x.herkunft, x.von]), [['O1', null, 'eigen_vorbei', 'Mitarbeiter 1'], ['O1', 'L2', 'lieferant', 'Mitarbeiter 2']]);
  assert.equal(e[1].notiz, 'doch bestellen');
  assert.throws(() => haengeWahlAn(file, { orderId: 'O1', herkunft: 'irgendwas', actor: 'x' }), MusterherkunftFehler);
  assert.throws(() => haengeWahlAn(file, { orderId: 'O1', herkunft: 'lieferant' }), MusterherkunftFehler);
  assert.equal(leseEreignisse(file).length, 2);
  assert.deepEqual(leseEreignisse(path.join(tmp(), 'fehlt.json')), []);
});

test('wirksameWahl: Position ueberstimmt Bestellung, spaetere Bestellungs-Wahl ueberstimmt alles davor', () => {
  const w1 = wirksameWahl([
    { orderId: 'O1', lineItemId: null, herkunft: 'eigen_vorbei', am: '2026-01-01' },
    { orderId: 'O1', lineItemId: 'L2', herkunft: 'lieferant', am: '2026-01-02' },
  ]);
  assert.equal(wahlFuer(w1, 'O1', 'L1').herkunft, 'eigen_vorbei');
  assert.equal(wahlFuer(w1, 'O1', 'L2').herkunft, 'lieferant');
  assert.equal(wahlFuer(w1, 'O2', 'L1'), null);
  const w2 = wirksameWahl([
    { orderId: 'O1', lineItemId: 'L2', herkunft: 'lieferant', am: '2026-01-02' },
    { orderId: 'O1', lineItemId: null, herkunft: 'eigen_versand', am: '2026-01-03' },
  ]);
  assert.equal(wahlFuer(w2, 'O1', 'L2').herkunft, 'eigen_versand');
});

test('wendeAufModellAn: nur Muster, auch in den Mustergruppen; Route SAMPLE_STOCK zaehlt ohne Wahl als eigen', () => {
  const pos = (li, extra = {}) => ({ orderId: 'O1', lineItemId: li, istMuster: true, route: 'SAMPLE_SUPPLIER', ...extra });
  const modell = {
    auftraege: [{ id: 'O1', positionen: [pos('L1'), pos('L2', { route: 'SAMPLE_STOCK' }), { orderId: 'O1', lineItemId: 'L3', istMuster: false }] }],
    testauftraege: [],
    musterGruppen: [{ positionen: [pos('L1', { route: 'MUSTER' }), pos('L2', { route: 'MUSTER' })] }],
  };
  wendeAufModellAn(modell, [{ orderId: 'O1', lineItemId: 'L1', herkunft: 'eigen_versand', am: '2026-01-01', von: 'M1' }]);
  const [l1, l2, l3] = modell.auftraege[0].positionen;
  assert.equal(l1.musterHerkunft, 'eigen_versand');
  assert.equal(l3.musterHerkunft, undefined, 'Ware bleibt unberuehrt');
  const [g1, g2] = modell.musterGruppen[0].positionen;
  assert.equal(g1.musterHerkunft, 'eigen_versand');
  assert.equal(g2.musterRoute, 'SAMPLE_STOCK');
  assert.deepEqual([musterOhneLieferant(l1), musterOhneLieferant(l2), musterOhneLieferant(g2), musterOhneLieferant({ istMuster: true, route: 'SAMPLE_STOCK', musterHerkunft: 'lieferant' })], [true, true, true, false]);
});

test('setzeZurueckAufOffen: von jedem Schritt zurueck, alter Stand im Verlauf, Bestellnummer weg, erneuter Durchlauf sauber', () => {
  const file = path.join(tmp(), 'auftragsstatus.json');
  const p = { orderId: 'O1', lineItemId: 'L1' };
  for (const [status, tag] of [['bestellt', 1], ['geliefert', 2], ['raus', 3]]) {
    setzeStatus(file, { ...p, status, actor: 'Mitarbeiter 1', lieferantBestellnummer: status === 'bestellt' ? 'LB-1' : null, jetzt: new Date(`2026-01-0${tag}T10:00:00Z`) });
  }
  const e = setzeZurueckAufOffen(file, { ...p, actor: 'Mitarbeiter 2', notiz: 'nur getestet', jetzt: new Date('2026-01-04T10:00:00Z') });
  assert.equal(e.status, null);
  assert.deepEqual([e.zurueckGesetztVon, e.zurueckGesetztVonStatus, e.bestelltAm, e.lieferantBestellnummer], ['Mitarbeiter 2', 'raus', undefined, undefined]);
  const v = e.verlauf.at(-1);
  assert.deepEqual([v.aktion, v.von, v.vonStatus, v.notiz, v.vorher.lieferantBestellnummer, v.vorher.bestelltAm], ['zurück auf offen', 'Mitarbeiter 2', 'raus', 'nur getestet', 'LB-1', '2026-01-01T10:00:00.000Z']);
  assert.equal(leseAlle(file)['O1::L1'].status, null);
  // Schon offen: nichts zu tun (Sammelaktionen ueberspringen)
  assert.equal(setzeZurueckAufOffen(file, { ...p, actor: 'x' }), null);
  // Neuer Durchlauf: "erledigt" ohne Zwischenschritte faellt beim Wiederoeffnen auf offen, nicht auf alte Stufen.
  setzeStatus(file, { ...p, status: 'erledigt', actor: 'Mitarbeiter 1', jetzt: new Date('2026-01-05T10:00:00Z') });
  assert.equal(statusVorErledigt(leseAlle(file)['O1::L1']), null);
  // Auch "erledigt" laesst sich direkt zuruecksetzen.
  assert.equal(setzeZurueckAufOffen(file, { ...p, actor: 'x' }).zurueckGesetztVonStatus, 'erledigt');
});

test('Zeitleiste: eigener Bestand ohne Lieferanten-Schritte; vorbeibringen ersetzt verschicken, naechster Schritt nennt Kunde und Ort', () => {
  const auftrag = (herkunft) => ({
    id: 'O1', name: '#T1', datum: '2026-01-01T10:00:00Z',
    details: { kunde: { name: 'Testkunde 1' }, lieferadresse: { ort: 'Musterstadt' } },
    positionen: [{ orderId: 'O1', lineItemId: 'L1', istMuster: true, route: 'SAMPLE_SUPPLIER', musterHerkunft: herkunft }],
  });
  const jetzt = new Date('2026-01-02T10:00:00Z');
  const vorbei = zeitleiste(auftrag('eigen_vorbei'), { jetzt });
  assert.deepEqual(vorbei.verlauf.map(s => s.schritt), ['angefragt', 'raus', 'kunde_hat_muster', 'nachgefasst', 'ergebnis']);
  assert.equal(vorbei.verlauf[1].label, 'Persönlich übergeben');
  assert.deepEqual([vorbei.naechsterSchritt.text, vorbei.naechsterSchritt.aktion, vorbei.naechsterSchritt.knopf], ['Muster vorbeibringen bei Testkunde 1', 'kunde_hat_muster', 'Erledigt – Kunde hat Muster']);
  assert.match(vorbei.naechsterSchritt.detail, /Musterstadt/);
  const versand = zeitleiste(auftrag('eigen_versand'), { jetzt });
  assert.equal(versand.naechsterSchritt.text, 'Muster verschicken an Testkunde 1');
  const lieferant = zeitleiste(auftrag('lieferant'), { jetzt });
  assert.deepEqual(lieferant.verlauf.map(s => s.schritt).slice(0, 4), ['angefragt', 'bestellt', 'geliefert', 'raus']);
  assert.equal(lieferant.naechsterSchritt.aktion, 'bestellt');
});
