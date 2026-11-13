// "Noch zu schneiden" (#2208): Versandweg der Unterlage und Gruppen der Seite - nur erfundene Testdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { versandweg, schnittMass, zuschnittStand } from '../lib/zuschnitt.mjs';
import { zuschnitte, ladenTodos } from '../lib/laden.mjs';
import { selbstAbschickenStand } from '../ansichten/heute/selbst-abschicken.mjs';
import { leseLagerware, markiereLagerware, LagerwareFehler } from '../../../operations/lib/lagerware.mjs';

const unterlage = (extra = {}) => ({ lineItemId: 'u1', titel: 'Testunterlage, Rollenware', farbe: '1 mm, 180 cm breit (je lfm)', kundenmenge: '6 lfm', menge: 6, sku: 'TEST-LAGER-180', route: 'SUPPLIER_TO_TP', lagerware: true, ...extra });
const teppich = (extra = {}) => ({ lineItemId: 't1', titel: 'Testteppich nach Maß', menge: 1, sku: 'TEST-TEPPICH', route: 'SUPPLIER_TO_TP', ...extra });
const kettelservice = { lineItemId: 'k1', titel: 'Kettelservice', eigenleistung: true, menge: 0 };
const weg = (positionen, status = {}) => versandweg(positionen[0], positionen, q => status[q.lineItemId] || null);

test('Versandweg: allein, mit dem Teppich, Hersteller direkt - und nie geraten', () => {
  assert.equal(weg([unterlage()]).art, 'allein', 'nur die Unterlage: Päckchen');
  assert.equal(weg([unterlage()]).kurz, 'Allein als Päckchen');

  const direkt = weg([unterlage(), teppich()], { t1: { status: 'bestellt', ueber: 'kunde' } });
  assert.equal(direkt.art, 'allein', 'Teppich geht direkt: Unterlage allein');
  assert.match(direkt.text, /Teppich kommt getrennt direkt vom Hersteller/);

  const zuUns = weg([unterlage(), teppich()], { t1: { status: 'bestellt', ueber: 'laden' } });
  assert.equal(zuUns.kurz, 'Zusammen mit dem Teppich');
  assert.match(zuUns.text, /einrollen.*Der Teppich kommt vom Hersteller zu uns – er ist bestellt und noch nicht da/);

  const kettler = weg([unterlage(), teppich()], { t1: { status: 'geliefert', ueber: 'kettler' } });
  assert.match(kettler.text, /Den Teppich ketteln wir selbst – er liegt schon hier/);

  // Bestellt ohne Vermerk: mit Kettelservice in der Bestellung geht der Teppich durch uns, ohne ist es offen.
  assert.equal(weg([unterlage(), teppich(), kettelservice], { t1: { status: 'bestellt' } }).art, 'mit');
  const offen = weg([unterlage(), teppich()], { t1: { status: 'bestellt' } });
  assert.equal(offen.art, 'unklar', 'nicht vermerkt: nicht raten');
  assert.match(offen.text, /kein Weg vermerkt/);

  // Noch nicht bestellt: der Vorschlag ist kein Beleg, auch nicht mit Kettelservice.
  const vorschlag = weg([unterlage(), teppich({ wegVorschlag: 'kettler' }), kettelservice]);
  assert.equal(vorschlag.art, 'unklar');
  assert.match(vorschlag.text, /noch nicht bestellt, voraussichtlich über Kettler/);

  assert.equal(weg([unterlage(), teppich({ titel: 'Testkleber' })], { t1: { status: 'geliefert' } }).kurz, 'Zusammen mit der übrigen Ware');
  assert.equal(weg([unterlage(), teppich()], { t1: { status: 'raus', ueber: 'laden' } }).art, 'allein', 'Teppich ist schon raus');
  assert.equal(weg([unterlage(), unterlage({ lineItemId: 'u2' })]).art, 'allein', 'zweite Unterlage zählt nicht als Begleitware');

  assert.equal(weg([unterlage()], { u1: { status: 'bestellt', ueber: 'kunde' } }).art, 'hersteller');
  assert.equal(weg([unterlage({ lagerware: false, ohneRolle: true, wegVorschlag: 'hersteller' })]).art, 'unklar', 'Vorschlag direkt: noch nicht bestellt');
  assert.equal(versandweg({ istMuster: true }, []), null);
});

test('Schnittmaß aus Variante und Kundenmenge', () => {
  assert.equal(schnittMass(unterlage()), '180 cm breit × 6 m');
  assert.equal(schnittMass(unterlage({ kundenmenge: '2,5 lfm', farbe: '3 mm, 80 cm breit (je lfm)' })), '80 cm breit × 2,5 m');
  assert.equal(schnittMass(unterlage({ kundenmenge: null })), null);
});

const zeile = (positionen, extra = {}) => ({ orderId: 'o1', orderName: '#T1', datum: '2026-11-10T08:00:00Z', zahlungsstatus: 'PAID', kundenname: 'Testkunde', auftrag: { positionen }, positionsstatus: {}, ...extra });

test('Seite: drei Gruppen, nur bezahlte offene Bestellungen, Zahl = Liste', () => {
  const daten = { verfuegbar: true, zeilen: [
    zeile([unterlage()]),
    zeile([unterlage()], { orderId: 'o2', positionsstatus: { u1: { status: 'geliefert', ueber: 'lager', selbstversand: { zugeschnitten: { am: '2026-11-12T08:00:00Z' } } } } }),
    zeile([unterlage({ lagerware: false, ohneRolle: true })], { orderId: 'o3', positionsstatus: { u1: { status: 'bestellt', ueber: 'kunde' } } }),
    zeile([unterlage()], { orderId: 'o4', zahlungsstatus: 'PENDING' }),
    zeile([unterlage()], { orderId: 'o5', storniert: true }),
    zeile([unterlage({ menge: 0 })], { orderId: 'o6' }),
    zeile([unterlage()], { orderId: 'o7', positionsstatus: { u1: { status: 'raus', ueber: 'lager' } } }),
    zeile([teppich()], { orderId: 'o8' }),
  ] };
  const s = zuschnittStand({ daten, jetzt: new Date('2026-11-13T08:00:00Z') });
  assert.deepEqual([s.schneiden, s.hier, s.bestellen].map(l => l.map(x => x.z.orderId)), [['o1'], ['o2'], ['o3']]);
  assert.equal(s.schneiden[0].weg.art, 'allein');
  assert.equal(s.schneiden[0].tage, 3);
  assert.equal(s.bestellen[0].weg.art, 'hersteller');
  // Der frische Stand aus einkauf.auftragsstatus gewinnt: nach dem Klick wandert die Zeile sofort.
  const nachKlick = zuschnittStand({ daten, statusAlle: { positionen: { 'o1::u1': { status: 'geliefert', ueber: 'lager' } } } });
  assert.ok(!nachKlick.schneiden.some(x => x.z.orderId === 'o1'));
  assert.ok(nachKlick.hier.some(x => x.z.orderId === 'o1'));
  assert.equal(zuschnittStand({ daten: null }).verfuegbar, false);
  assert.equal(zuschnittStand({ daten: { verfuegbar: true, zeilen: [], lagerwareFehler: 'kaputt' } }).fehler, 'kaputt');
});

test('Heute und Laden zeigen denselben Versandweg', () => {
  const positionen = [unterlage(), teppich(), kettelservice];
  const heute = selbstAbschickenStand({ daten: { verfuegbar: true, zeilen: [zeile(positionen, { positionsstatus: { t1: { status: 'bestellt' } } })] } });
  assert.equal(heute.zeilen[0].weg.art, 'mit');
  const laden = zuschnitte([{ id: 'o1', name: '#T1', bezahlt: 'PAID', datum: '2026-11-10T08:00:00Z', positionen }], (o, l) => (l === 't1' ? { status: 'bestellt' } : null));
  assert.match(laden[0].hinweis, /^Versand: Zusammen mit dem Teppich – Mit dem Teppich einrollen/);
  const todo = ladenTodos({ zuschnitte: laden }, { jetzt: new Date('2026-11-13T08:00:00Z') });
  assert.equal(todo[0].hinweis, laden[0].hinweis, 'auch die Zeile „Zuschneiden“ trägt den Weg');
  assert.ok(todo[0].schnitt);
});

test('Lagerliste: ohneRolle ist keine Lagerware und schlägt die Regel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-zuschnitt-'));
  const datei = path.join(dir, 'lagerware.json');
  try {
    fs.writeFileSync(datei, JSON.stringify({ regeln: [{ skuPraefix: 'TEST-LAGER-', hinweis: 'Rolle da' }], ohneRolle: [{ skuPraefix: 'TEST-LAGER-120', hinweis: 'Rolle fehlt' }] }));
    const liste = leseLagerware(datei);
    assert.deepEqual(liste.ohneRolle, [{ skuPraefix: 'TEST-LAGER-120', hinweis: 'Rolle fehlt' }]);
    const modell = { auftraege: [{ positionen: [{ sku: 'TEST-LAGER-180' }, { sku: 'TEST-LAGER-120' }, { sku: 'TEST-TEPPICH' }] }] };
    assert.equal(markiereLagerware(modell, liste.regeln, liste.ohneRolle), 1, 'gezählt wird nur Lagerware');
    const [da, fehlt, sonst] = modell.auftraege[0].positionen;
    assert.equal(da.lagerware, true);
    assert.deepEqual([fehlt.lagerware, fehlt.ohneRolle, fehlt.lagerHinweis], [undefined, true, 'Rolle fehlt']);
    assert.deepEqual([sonst.lagerware, sonst.ohneRolle], [undefined, undefined]);
    // Alte Datei ohne die neue Liste bleibt gültig; eine kaputte neue Liste meldet sich wie eine kaputte Regel.
    fs.writeFileSync(datei, JSON.stringify({ regeln: [] }));
    assert.deepEqual(leseLagerware(datei).ohneRolle, []);
    fs.writeFileSync(datei, JSON.stringify({ regeln: [], ohneRolle: [{ skuPraefix: 'X' }] }));
    assert.throws(() => leseLagerware(datei), LagerwareFehler);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
