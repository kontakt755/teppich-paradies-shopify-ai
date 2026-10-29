import assert from 'node:assert/strict';
import test from 'node:test';
import {
  argumente, zielReihenfolge, sortiereBisFertig, planeZuege, planeRueckweg, wendeAn, inStuecken, istGleich, MAX_ZUEGE,
  istSichtbar, bewerte, pruefeKollektionen, abschluss,
} from '../../scripts/auslauf-sortieren.mjs';

const A = new Set(['a1', 'a2', 'a3']);

test('Ziel: regulaere Produkte in alter Reihenfolge, dahinter die Auslaufartikel in alter Reihenfolge', () => {
  assert.deepEqual(zielReihenfolge(['a1', 'n1', 'a2', 'n2', 'a3'], A), ['n1', 'n2', 'a1', 'a2', 'a3']);
});

test('Zuege ergeben genau das Ziel, so wie Shopify sie nacheinander anwendet', () => {
  const vorher = ['a1', 'n1', 'a2', 'n2', 'n3', 'a3', 'n4'];
  const zuege = planeZuege(vorher, A);
  assert.deepEqual(wendeAn(vorher, zuege), zielReihenfolge(vorher, A));
  assert.equal(zuege.length, 3);
});

test('Auslaufartikel schon am Ende in einer anderen Reihenfolge: bleibt, wie es ist', () => {
  assert.deepEqual(planeZuege(['n1', 'n2', 'a2', 'a1'], A), []);
});

test('Ein Auslaufartikel steht hinten, ein anderer vorn: Reihenfolge der Auslaufartikel bleibt erhalten', () => {
  const vorher = ['a3', 'n1', 'n2', 'a1'];
  assert.deepEqual(wendeAn(vorher, planeZuege(vorher, A)), ['n1', 'n2', 'a3', 'a1']);
});

test('Nichts zu tun ohne Auslaufartikel oder wenn sie schon hinten stehen', () => {
  assert.deepEqual(planeZuege(['n1', 'n2'], A), []);
  assert.deepEqual(planeZuege(['n1', 'a1', 'a2'], A), []);
});

test('Neues Produkt hinter den Auslaufartikeln (Shopify haengt hinten an) wird erkannt', () => {
  const vorher = ['n1', 'a1', 'a2', 'n-neu'];
  const zuege = planeZuege(vorher, A);
  assert.ok(zuege.length > 0);
  assert.deepEqual(wendeAn(vorher, zuege), ['n1', 'n-neu', 'a1', 'a2']);
});

test('Rueckweg stellt die gespeicherte Reihenfolge her', () => {
  const vorher = ['a1', 'n1', 'a2', 'n2'];
  const nachher = wendeAn(vorher, planeZuege(vorher, A));
  assert.ok(!istGleich(nachher, vorher));
  assert.deepEqual(wendeAn(nachher, planeRueckweg(vorher)), vorher);
});

test('Mehr als 250 Zuege werden auf mehrere Aufrufe verteilt', () => {
  const stuecke = inStuecken(Array.from({ length: 600 }, (_, i) => i));
  assert.deepEqual(stuecke.map(s => s.length), [MAX_ZUEGE, MAX_ZUEGE, 100]);
});

test('Argumente: Trockenlauf ist Standard, unbekannte Flags brechen ab', () => {
  assert.deepEqual(argumente([]), { schreiben: false, kollektionen: null, zurueck: null });
  assert.deepEqual(argumente(['--schreiben', '--kollektionen', 'teppichboden,teppiche']).kollektionen, ['teppichboden', 'teppiche']);
  assert.throws(() => argumente(['--schreib']), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--zurueck']), /braucht eine Datei/);
});

test('Zuege kommen nicht an (Import haengt parallel an): neu planen und erneut schieben', () => {
  let shop = ['n1', 'a1', 'n2', 'a2'];
  let aufrufe = 0;
  const r = sortiereBisFertig({
    lies: () => [...shop],
    schiebe: zuege => {
      aufrufe++;
      if (aufrufe === 1) { shop = [...shop, 'n3']; return; } // erster Aufruf verpufft, Import haengt an
      shop = wendeAn(shop, zuege);
    },
    auslauf: A,
  });
  assert.equal(r.ok, true);
  assert.equal(r.versuche, 2);
  assert.deepEqual(shop, ['n1', 'n2', 'n3', 'a1', 'a2']);
});

test('Zuege kommen nie an: nach den Versuchen FEHL, kein Endlosschleifen', () => {
  const r = sortiereBisFertig({ lies: () => ['a1', 'n1'], schiebe: () => {}, auslauf: A, versuche: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.versuche, 3);
});

// Fehlersuche 2026-10-28: Mittelflor meldete "TUN", weil archivierte Produkte und
// Entwuerfe hinter den Auslaufartikeln standen - im Shop standen diese schon hinten.
const sichtbar = id => ({ id, status: 'ACTIVE', onlineStoreUrl: `https://shop/products/${id}` });
const archiviert = id => ({ id, status: 'ARCHIVED', onlineStoreUrl: null });
const entwurf = id => ({ id, status: 'DRAFT', onlineStoreUrl: null });

test('Sichtbar heisst aktiv und im Onlineshop veroeffentlicht', () => {
  assert.equal(istSichtbar(sichtbar('n1')), true);
  assert.equal(istSichtbar(archiviert('n1')), false);
  assert.equal(istSichtbar(entwurf('n1')), false);
  assert.equal(istSichtbar({ id: 'n1', status: 'ACTIVE', onlineStoreUrl: null }), false, 'aktiv, aber nicht im Onlineshop');
});

test('Unsichtbare Produkte hinter den Auslaufartikeln: nichts zu tun', () => {
  const b = bewerte([sichtbar('n1'), sichtbar('n2'), sichtbar('a1'), sichtbar('a2'), archiviert('x1'), entwurf('x2')], A);
  assert.equal(b.relevant, true);
  assert.deepEqual(b.zuege, []);
  assert.equal(b.gesamt, 4);
  assert.equal(b.ausgeblendet, 2);
  assert.equal(b.anzahl, 2);
  assert.equal(b.erster, 3);
});

test('Sichtbares Produkt hinter einem Auslaufartikel: Zuege auf der vollen Liste, danach stimmt auch die sichtbare', () => {
  const produkte = [sichtbar('n1'), sichtbar('a1'), archiviert('x1'), sichtbar('n2'), entwurf('x2')];
  const b = bewerte(produkte, A);
  assert.equal(b.erster, 2);
  assert.ok(b.zuege.length > 0);
  const nachher = wendeAn(b.reihenfolge, b.zuege);
  assert.deepEqual(nachher, zielReihenfolge(b.reihenfolge, A));
  const ids = new Set(produkte.filter(istSichtbar).map(p => p.id));
  assert.deepEqual(nachher.filter(id => ids.has(id)), ['n1', 'n2', 'a1']);
});

test('Nur unsichtbare Auslaufartikel oder nur Auslaufartikel sichtbar: nicht relevant', () => {
  assert.equal(bewerte([sichtbar('n1'), { id: 'a1', status: 'ARCHIVED', onlineStoreUrl: null }, sichtbar('n2')], A).relevant, false);
  assert.equal(bewerte([sichtbar('a1'), sichtbar('a2'), archiviert('n1')], A).relevant, false);
});

// Review 2026-10-28: Kommen ueber die CLI keine onlineStoreUrl an, zaehlt kein
// Produkt als sichtbar. Das darf nicht als "Nichts zu tun" mit Exit 0 enden.
const ohneUrl = id => ({ id, status: 'ACTIVE', onlineStoreUrl: null });

test('Kollektion mit Produkten, aber keinem sichtbaren: Warnung statt still uebersprungen', () => {
  const daten = {
    k1: [ohneUrl('n1'), ohneUrl('a1'), ohneUrl('n2')],
    k2: [sichtbar('n3'), sichtbar('a2')],
    leer: [],
  };
  const r = pruefeKollektionen(
    [{ id: 'k1', handle: 'teppichboden' }, { id: 'k2', handle: 'teppiche' }, { id: 'leer', handle: 'leer' }],
    id => daten[id], A,
  );
  assert.deepEqual(r.ohneSichtbare, ['teppichboden'], 'leere Kollektion ist kein Datenfehler');
  assert.match(r.zeilen.join('\n'), /^WARN teppichboden: 3 Produkte, aber keins aktiv und im Onlineshop/m);
  assert.match(r.zeilen.join('\n'), /^ok   teppiche:/m);
  assert.deepEqual(r.offen, []);
});

test('Abschluss: Warnung gibt Exit 1 und kein "Nichts zu tun", im Pruefen wie beim Schreiben', () => {
  for (const schreiben of [false, true]) {
    const s = abschluss({ offen: [], ohneSichtbare: ['teppichboden'], schreiben });
    assert.equal(s.exitCode, 1);
    assert.equal(s.schreiben, false);
    assert.match(s.meldungen.join('\n'), /WARNUNG: 1 Kollektion\(en\).*teppichboden/);
    assert.doesNotMatch(s.meldungen.join('\n'), /Nichts zu tun/);
  }
});

test('Abschluss ohne Warnung: Nichts zu tun mit Exit 0, Offenes im Pruefen Exit 1, beim Schreiben weiter', () => {
  assert.deepEqual(abschluss({ offen: [], ohneSichtbare: [], schreiben: false }), { meldungen: ['Nichts zu tun.'], exitCode: 0, schreiben: false });
  const k = { id: 'k1', handle: 'teppiche' };
  assert.equal(abschluss({ offen: [k], ohneSichtbare: [], schreiben: false }).exitCode, 1);
  assert.deepEqual(abschluss({ offen: [k], ohneSichtbare: [], schreiben: true }), { meldungen: [], exitCode: 0, schreiben: true });
  const beides = abschluss({ offen: [k], ohneSichtbare: ['x'], schreiben: true });
  assert.equal(beides.exitCode, 1, 'Warnung bleibt auch, wenn andere Kollektionen geschrieben werden');
  assert.equal(beides.schreiben, true);
});
