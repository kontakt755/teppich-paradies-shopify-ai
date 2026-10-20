import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aendereMusterDruckliste, gleicheBestellungsVormerkung, leseMusterDruckliste, musterDrucklistePfad } from '../../../operations/lib/muster-druckliste.mjs';

// Nur synthetische Bestell- und Produktangaben. Alle Schreibtests nutzen einen eigenen Tempordner.
const exec = promisify(execFile);
const am = '2026-10-20T09:00:00.000Z';
const etikett = { serie: 'Testvelours', farbe: 'Sand', sku: 'TEST-SA', url: 'https://www.teppich-paradies.net/products/testvelours', technik: [], fehlt: [] };
const quelle = (lineItemId = 'gid://shopify/LineItem/301') => ({ art: 'musterbestellung', orderId: 'gid://shopify/Order/901', lineItemId, orderName: '#TEST-MUSTER-901', bestellmenge: 3 });
const eintrag = (extra = {}) => ({ id: randomUUID(), produktHandle: 'testvelours', produktTitel: 'Testvelours Teppichboden', bezeichnung: 'Sand · TEST-SA', etikett: structuredClone(etikett), anzahl: 2, quelle: quelle(), ...extra });
const ref = e => ({ id: e.id, revision: e.revision });
const status = code => e => e?.status === code && e?.statusCode === code;

function umgebung(t) {
  const privatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-musterbestellung-test-'));
  t.after(() => fs.rmSync(privatDir, { recursive: true, force: true }));
  const file = musterDrucklistePfad(privatDir);
  const aendern = daten => aendereMusterDruckliste({ privatDir, actor: 'Mitarbeiter Test', now: am, vorgangId: randomUUID(), ...daten });
  const vormerken = (eintraege, extra = {}) => aendern({ aktion: 'bestellung_hinzufuegen', eintraege, ...extra });
  return { privatDir, file, aendern, vormerken, lesen: () => leseMusterDruckliste({ privatDir }) };
}

test('zwei Positionen gleicher SKU bleiben zwei Quellen; Referenz liegt ausserhalb des Druckbilds', t => {
  const u = umgebung(t), a = eintrag(), b = eintrag({ quelle: quelle('gid://shopify/LineItem/302') });
  const vorher = structuredClone([a, b]);
  const r = u.vormerken([a, b]);
  assert.deepEqual([r.neu, r.bereits, r.wiederholt], [2, 0, false]);
  assert.equal(r.eintraege.length, 2);
  assert.deepEqual(new Set(r.eintraege.map(e => e.quelle.lineItemId)), new Set([a.quelle.lineItemId, b.quelle.lineItemId]));
  for (const e of r.eintraege) {
    assert.equal(e.status, 'offen'); assert.equal(e.revision, 1);
    assert.deepEqual(e.etikett, etikett);
    assert.equal(Object.hasOwn(e.etikett, 'quelle'), false);
    assert.doesNotMatch(JSON.stringify(e.etikett), /TEST-MUSTER|LineItem|Order|orderId|lineItemId/);
  }
  assert.deepEqual([a, b], vorher);
  assert.equal(fs.statSync(u.file).mode & 0o777, 0o600);
});

test('anderer Mitarbeiter und andere Vorgangs-/Eintrags-IDs erzeugen dieselbe Quelle kein zweites Mal', t => {
  const u = umgebung(t), a = eintrag();
  const alt = u.vormerken([a]).eintraege;
  const neu = u.vormerken([{ ...a, id: randomUUID() }], { actor: 'Zweiter Mitarbeiter' });
  assert.deepEqual([neu.neu, neu.bereits, neu.wiederholt], [0, 1, false]);
  assert.deepEqual(neu.eintraege, alt);
  const zusaetzlich = eintrag({ quelle: quelle('gid://shopify/LineItem/302') });
  const gemischt = u.vormerken([{ ...a, id: randomUUID() }, zusaetzlich]);
  assert.deepEqual([gemischt.neu, gemischt.bereits], [1, 1]);
  assert.equal(gemischt.eintraege.length, 2);
});

test('Wiederholung desselben Vorgangs schreibt nicht neu und veraenderte Nutzlast mit derselben UUID scheitert', t => {
  const u = umgebung(t), a = eintrag(), vorgangId = randomUUID();
  u.vormerken([a], { vorgangId });
  const vorher = fs.readFileSync(u.file, 'utf8');
  const r = u.vormerken([a], { vorgangId, now: '2026-10-20T10:00:00.000Z' });
  assert.deepEqual([r.neu, r.bereits, r.wiederholt], [0, 1, true]);
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
  assert.throws(() => u.vormerken([{ ...a, anzahl: 1 }], { vorgangId }), status(409));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
});

test('Teilversand reduziert nur die neue offene Menge; bestehende Anzahl und Revision bleiben unveraendert', t => {
  const u = umgebung(t), a = eintrag();
  const alt = u.vormerken([a]).eintraege;
  const r = u.vormerken([{ ...a, id: randomUUID(), anzahl: 1 }]);
  assert.deepEqual([r.neu, r.bereits], [0, 1]);
  assert.deepEqual(r.eintraege, alt);
  assert.equal(r.eintraege[0].anzahl, 2);
});

test('geaenderte Gesamtmenge oder Etikettdaten verhindern die komplette Vormerkung ohne Schreibwirkung', t => {
  const u = umgebung(t), a = eintrag();
  u.vormerken([a]);
  const vorher = fs.readFileSync(u.file, 'utf8');
  const geaendert = [
    { ...a, id: randomUUID(), quelle: { ...a.quelle, bestellmenge: 4 } },
    { ...a, id: randomUUID(), etikett: { ...a.etikett, farbe: 'Grau' } },
    { ...a, id: randomUUID(), etikett: { ...a.etikett, technik: [{ label: 'Art', wert: 'Geaendert' }] } },
  ];
  for (const konflikt of geaendert) {
    const neueQuelle = eintrag({ quelle: quelle('gid://shopify/LineItem/999') });
    assert.throws(() => u.vormerken([neueQuelle, konflikt]), status(409));
    assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
    assert.equal(u.lesen().eintraege.length, 1);
  }
});

test('reservierte, gedruckte und entfernte Quellen bleiben bereits vorhanden; Zustand und Druckauftrag bleiben erhalten', async t => {
  for (const ziel of ['in_druck', 'gedruckt', 'entfernt']) await t.test(ziel, t => {
    const u = umgebung(t), a = eintrag();
    let e = u.vormerken([a]).eintraege[0];
    const batch = randomUUID();
    if (ziel === 'entfernt') e = u.aendern({ aktion: 'entfernen', eintraege: [ref(e)] }).eintraege[0];
    else {
      e = u.aendern({ aktion: 'reservieren', eintraege: [ref(e)], druckauftragId: batch }).eintraege[0];
      if (ziel === 'gedruckt') e = u.aendern({ aktion: 'erledigen', eintraege: [ref(e)], druckauftragId: batch }).eintraege[0];
    }
    const r = u.vormerken([{ ...a, id: randomUUID(), anzahl: 1 }]);
    assert.deepEqual([r.neu, r.bereits], [0, 1]);
    assert.deepEqual(r.eintraege, [e]);
    assert.equal(r.eintraege[0].status, ziel);
  });
});

test('normale Lexikonvormerkungen ohne Quelle bleiben lesbar und beanspruchen keine Bestellposition', t => {
  const u = umgebung(t), a = eintrag();
  const { quelle: _quelle, ...lexikonEintrag } = a;
  u.aendern({ aktion: 'hinzufuegen', eintrag: lexikonEintrag });
  assert.equal(Object.hasOwn(u.lesen().eintraege[0], 'quelle'), false);
  const r = u.vormerken([{ ...a, id: randomUUID() }]);
  assert.deepEqual([r.neu, r.bereits], [1, 0]);
  assert.equal(r.eintraege.length, 2);
  assert.equal(r.eintraege.filter(e => e.quelle).length, 1);
});

test('gleicheBestellungsVormerkung vergleicht Quelle, Gesamtmenge und kanonisches Etikett unabhaengig von Status und offener Menge', () => {
  const a = eintrag(), b = { ...structuredClone(a), id: randomUUID(), anzahl: 1, status: 'gedruckt', revision: 5 };
  assert.equal(gleicheBestellungsVormerkung(a, b), true);
  assert.equal(gleicheBestellungsVormerkung(a, { ...b, etikett: Object.fromEntries(Object.entries(b.etikett).reverse()) }), true, 'JSON-Schluesselreihenfolge ist fachlich gleich');
  for (const q of [
    { ...b.quelle, lineItemId: 'gid://shopify/LineItem/999' },
    { ...b.quelle, orderId: 'gid://shopify/Order/999' },
    { ...b.quelle, bestellmenge: 4 },
  ]) assert.equal(gleicheBestellungsVormerkung(a, { ...b, quelle: q }), false);
  assert.equal(gleicheBestellungsVormerkung(a, { ...b, etikett: { ...b.etikett, sku: 'TEST-ANDERS' } }), false);
  assert.equal(gleicheBestellungsVormerkung(a, { ...b, quelle: undefined }), false);
  assert.equal(gleicheBestellungsVormerkung(null, b), false);
});

test('ungueltige oder doppelte Eingabequellen werden atomar abgewiesen; Vormerkungen sind auf 100 Quellen begrenzt', t => {
  const u = umgebung(t), a = eintrag();
  const falsch = [
    { ...a, quelle: undefined },
    { ...a, quelle: { ...a.quelle, art: 'ware' } },
    { ...a, quelle: { ...a.quelle, lineItemId: '' } },
    { ...a, quelle: { ...a.quelle, bestellmenge: 0 } },
    { ...a, quelle: { ...a.quelle, bestellmenge: 1 } },
    { ...a, quelle: { ...a.quelle, kunde: 'Unzulaessige Metadaten' } },
    { ...a, anzahl: 0 },
  ];
  for (const e of falsch) assert.throws(() => u.vormerken([e]), status(400));
  assert.throws(() => u.vormerken([a, { ...a, id: randomUUID() }]), status(400));
  assert.equal(fs.existsSync(u.file), false);
  const mehrAls100Aufkleber = Array.from({ length: 6 }, (_, i) => eintrag({ anzahl: 20, quelle: { ...quelle(`gid://shopify/LineItem/${i + 1}`), bestellmenge: 20 } }));
  assert.equal(u.vormerken(mehrAls100Aufkleber).neu, 6, 'Vormerken ist unabhaengig von der spaeteren Druckauswahl bis 100 Aufkleber');
  const vorher = fs.readFileSync(u.file, 'utf8');
  const zuVieleQuellen = Array.from({ length: 101 }, (_, i) => eintrag({ quelle: quelle(`gid://shopify/LineItem/${i + 1001}`) }));
  assert.throws(() => u.vormerken(zuVieleQuellen), status(400));
  assert.equal(fs.readFileSync(u.file, 'utf8'), vorher);
});

test('beschaedigte gespeicherte Quelle oder doppelte Quellidentitaet wird nie als leer behandelt/ueberschrieben', t => {
  const u = umgebung(t), a = eintrag();
  u.vormerken([a]);
  const valide = JSON.parse(fs.readFileSync(u.file, 'utf8'));
  const varianten = [null, {}, { ...a.quelle, art: 'ware' }, { ...a.quelle, bestellmenge: 1 }, { ...a.quelle, bestellmenge: '3' }, { ...a.quelle, kunde: 'Nicht erlaubt' }].map(q => {
    const d = structuredClone(valide); d.eintraege[0].quelle = q; return d;
  });
  const doppelt = structuredClone(valide);
  doppelt.eintraege.push({ ...structuredClone(doppelt.eintraege[0]), id: randomUUID() });
  varianten.push(doppelt);
  for (const daten of varianten) {
    const roh = JSON.stringify(daten);
    fs.writeFileSync(u.file, roh);
    assert.throws(() => u.lesen(), status(500));
    assert.throws(() => u.vormerken([eintrag({ quelle: quelle('gid://shopify/LineItem/999') })]), status(500));
    assert.equal(fs.readFileSync(u.file, 'utf8'), roh);
  }
});

test('zwei parallele Serverprozesse mit verschiedenen Vorgangs-IDs erzeugen fuer dieselbe Quelle nur einen Eintrag', async t => {
  const u = umgebung(t), a = eintrag();
  const modul = new URL('../../../operations/lib/muster-druckliste.mjs', import.meta.url).href;
  const code = `
    import { aendereMusterDruckliste } from ${JSON.stringify(modul)};
    const args = JSON.parse(process.argv[1]);
    let fertig = false;
    for (let i = 0; i < 500 && !fertig; i++) {
      try {
        const r = aendereMusterDruckliste(args);
        process.stdout.write(JSON.stringify({ neu:r.neu, bereits:r.bereits, wiederholt:r.wiederholt }));
        fertig = true;
      } catch(e) {
        if(e.status !== 409) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);
      }
    }
    if(!fertig) throw new Error('Prozesssperre wurde nicht frei');
  `;
  const ergebnisse = await Promise.all([1, 2].map(n => exec(process.execPath, ['--input-type=module', '-e', code, JSON.stringify({ privatDir: u.privatDir, actor: `Testprozess${n}`, aktion: 'bestellung_hinzufuegen', vorgangId: randomUUID(), eintraege: [{ ...a, id: randomUUID() }] })])));
  const zahlen = ergebnisse.map(r => JSON.parse(r.stdout));
  assert.deepEqual(zahlen.map(r => r.neu).sort(), [0, 1]);
  assert.deepEqual(zahlen.map(r => r.bereits).sort(), [0, 1]);
  assert.ok(zahlen.every(r => r.wiederholt === false));
  assert.equal(u.lesen().eintraege.length, 1);
  assert.deepEqual(u.lesen().eintraege[0].quelle, a.quelle);
  assert.equal(u.lesen().eintraege[0].anzahl, 2);
});
