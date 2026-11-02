import test from 'node:test';
import assert from 'node:assert/strict';
import { produktEntwurf, zeilenSchluessel, eigeneGroesseFehler, eigenesFormat, eigenerRand, freieEtiketten, freiLayout, freiStil, FORMAT_EIGEN, FREI_MAX_ANZAHL, FREI_SCHRIFT_MM, versatzGrenze } from '../lib/freie-etiketten.mjs';
import { aufDruckkopf } from '../bausteine/etiketten-druck.mjs';
import { ETIKETT_FORMATE, FREIE_FORMATE, etikettFormat } from '../lib/muster-etiketten.mjs';
import { motivSchluessel } from '../lib/druckliste.mjs';

// Etwa Arial fett: Grossbuchstaben rund 0,72 der Schriftgroesse breit.
const mass = (t, g) => String(t).length * g * 0.72;
const schmal = etikettFormat('50x20');
const layoutVon = text => freiLayout(freieEtiketten(text)[0], mass, schmal);

test('jede Zeile bleibt eine Zeile, eine Leerzeile beginnt den naechsten Aufkleber', () => {
  const e = freieEtiketten('  MUSTER \nRESTE\n\n \nWARE\r\nRESTE\n\n\n');
  assert.deepEqual(e.map(x => x.zeilen), [['MUSTER', 'RESTE'], ['WARE', 'RESTE']]);
  assert.equal(e[0].art, 'frei');
  assert.deepEqual(e[0].fehlt, []);
});

test('Anzahl gilt je Aufkleber und bleibt in den Grenzen', () => {
  assert.equal(freieEtiketten('A\n\nB', 3).length, 6);
  assert.equal(freieEtiketten('A', 0).length, 1);
  assert.equal(freieEtiketten('A', 'x').length, 1);
  assert.equal(freieEtiketten('A', 100000).length, FREI_MAX_ANZAHL);
  assert.deepEqual(freieEtiketten(' \n \n'), []);
});

test('verschiedene Texte sind verschiedene Motive, Kopien dasselbe', () => {
  const [a, b, c] = freieEtiketten('MUSTER\n\nMUSTER\n\nRESTE');
  assert.equal(motivSchluessel(a), motivSchluessel(b));
  assert.notEqual(motivSchluessel(a), motivSchluessel(c));
});

for (const text of ['RESTE', 'MUSTER\nRESTE', 'WARE\nRESTE', 'MUSTERBESTELLUNGEN\nVORBEREITET\nWARTEN AUF WARE']) {
  test(`„${text.replace(/\n/g, ' / ')}“ passt auf 50 x 20`, () => {
    const l = layoutVon(text);
    assert.deepEqual(l.probleme, []);
    assert.equal(l.passt, true);
    assert.equal(l.texte.length, text.split('\n').length);
    assert.ok(l.texte.every(t => t.fett));
    // Mittig: links und rechts gleich viel Platz.
    for (const t of l.texte) assert.ok(Math.abs(t.x - (schmal.breite - mass(t.text, t.groesse) - t.x)) < 0.01);
  });
}

test('Lesbar: zwei kurze Zeilen werden auf 50 x 20 gross gesetzt', () => {
  assert.ok(layoutVon('WARE\nRESTE').texte.every(t => t.groesse >= 40));
});

test('zu viel Text wird nicht stillschweigend abgeschnitten', () => {
  const langeZeile = layoutVon('X'.repeat(200));
  assert.equal(langeZeile.passt, false);
  assert.ok(langeZeile.probleme.length);
  const vieleZeilen = layoutVon(Array.from({ length: 12 }, () => 'ZEILE').join('\n'));
  assert.equal(vieleZeilen.passt, false);
});

test('auf allen Formaten passt derselbe Text', () => {
  const e = freieEtiketten('MUSTER\nRESTE')[0];
  for (const f of Object.values(FREIE_FORMATE)) assert.equal(freiLayout(e, mass, f).passt, true, f.name);
});

test('50 x 20 gibt es nur fuer eigene Aufkleber, Musteraufkleber behalten ihre Formate', () => {
  assert.equal(schmal.hoehe, 160);
  assert.ok(FREIE_FORMATE['50x20']);
  assert.equal(ETIKETT_FORMATE['50x20'], undefined);
  assert.equal(etikettFormat('unbekannt').format, '50x50');
});

const e2 = text => freieEtiketten(text)[0];

test('eigene Groesse: 8 px je mm, Grenzen eingeschlossen, auch mit Komma', () => {
  const f = eigenesFormat(37, 120);
  assert.deepEqual([f.format, f.name, f.breite, f.hoehe], [FORMAT_EIGEN, '37 × 120 mm', 296, 960]);
  for (const [b, l] of [[20, 10], [50, 10], [20, 200], [50, 200]]) assert.ok(eigenesFormat(b, l), `${b} x ${l}`);
  const komma = eigenesFormat('37,5', '20');
  assert.deepEqual([komma.name, komma.breite], ['37,5 × 20 mm', 300]);
});

test('ungueltige Groesse wird benannt und ergibt kein Format', () => {
  for (const b of [19.9, 51, '', 'abc', '-30', '1e3', null]) {
    assert.equal(eigenesFormat(b, 30), null, String(b));
    assert.match(eigeneGroesseFehler(b, 30), /Breite.*20 und 50 mm/);
  }
  for (const l of [9, 201, '', 'x']) {
    assert.equal(eigenesFormat(40, l), null, String(l));
    assert.match(eigeneGroesseFehler(40, l), /Länge.*10 und 200 mm/);
  }
  assert.equal(eigeneGroesseFehler(40, 30), '');
});

test('eigene Groesse bekommt den Rand der erprobten Rollen und nie unter 2 mm', () => {
  assert.equal(eigenesFormat(50, 20).rand, FREIE_FORMATE['50x20'].rand);
  assert.equal(eigenesFormat(50, 50).rand, FREIE_FORMATE['50x50'].rand);
  assert.equal(eigenesFormat(50, 100).rand, FREIE_FORMATE['50x100'].rand);
  assert.equal(eigenesFormat(20, 10).rand, 16);
  assert.equal(eigenerRand(400, 80), 16);
  for (let l = 10; l <= 200; l += 10) for (const b of [20, 35, 50]) {
    const { rand } = eigenesFormat(b, l);
    assert.ok(rand >= 16 && rand <= 32, `${b} x ${l}: ${rand}`);
  }
});

test('die eigene Groesse steht in keiner festen Formatliste und faellt im Musterdruck auf 50 x 50', () => {
  assert.equal(ETIKETT_FORMATE[FORMAT_EIGEN], undefined);
  assert.equal(FREIE_FORMATE[FORMAT_EIGEN], undefined);
  assert.equal(etikettFormat(FORMAT_EIGEN).format, '50x50');
});

test('auf einer eigenen Groesse passt kurzer Text, zu langer wird gemeldet', () => {
  assert.equal(freiLayout(e2('MUSTER'), mass, eigenesFormat(20, 10)).passt, true);
  assert.equal(freiLayout(e2('X'.repeat(80)), mass, eigenesFormat(20, 10)).passt, false);
});

test('Einstellungen: ohne Angabe wie bisher, Unbekanntes faellt auf den Standard', () => {
  assert.deepEqual(freiStil(), { schrift: 'auto', fett: true, ausrichtung: 'mitte', quer: false });
  assert.deepEqual(freiStil({ schrift: '7', fett: false, ausrichtung: 'rechts', quer: true }), { schrift: 7, fett: false, ausrichtung: 'rechts', quer: true });
  assert.deepEqual(freiStil({ schrift: '999', ausrichtung: 'oben' }), freiStil());
  assert.deepEqual(freiLayout(e2('MUSTER\nRESTE'), mass, schmal), freiLayout(e2('MUSTER\nRESTE'), mass, schmal, freiStil()));
});

test('feste Schrift gilt fuer jede Zeile, in mm umgerechnet', () => {
  const l = freiLayout(e2('RESTE\nMUSTERWARE'), mass, FREIE_FORMATE['50x50'], { schrift: 5 });
  assert.deepEqual(l.texte.map(t => t.groesse), [40, 40]);
  assert.equal(l.passt, true);
});

test('feste Schrift, die nicht passt, bleibt gross und wird gemeldet statt geschrumpft oder gekuerzt', () => {
  for (const [text, stil] of [['MUSTERWARE', { schrift: 30 }], ['A\nB\nC', { schrift: 12 }]]) {
    const l = freiLayout(e2(text), mass, schmal, stil);
    assert.equal(l.passt, false, text);
    assert.ok(l.probleme.length);
    assert.deepEqual(l.texte.map(t => t.text), text.split('\n'));
    assert.ok(l.texte.every(t => t.groesse === stil.schrift * 8));
  }
});

test('Jede feste Groesse ist nicht kleiner als die Mindestschrift und nicht groesser als die Automatik', () => {
  assert.ok(FREI_SCHRIFT_MM.every(mm => mm * 8 >= 12 && mm * 8 <= 240));
});

test('Schriftstaerke: normal wird normal gemessen und gezeichnet', () => {
  const breitFett = (t, g, fett) => String(t).length * g * (fett ? 0.9 : 0.5);
  const normal = freiLayout(e2('MUSTERWARE'), breitFett, FREIE_FORMATE['50x50'], { fett: false });
  const fett = freiLayout(e2('MUSTERWARE'), breitFett, FREIE_FORMATE['50x50'], { fett: true });
  assert.equal(normal.texte[0].fett, false);
  assert.equal(fett.texte[0].fett, true);
  assert.ok(normal.texte[0].groesse > fett.texte[0].groesse, 'normal ist schmaler, also darf die Automatik groesser setzen');
});

test('Ausrichtung: links am Rand, rechts am Rand, mittig gleich viel Platz', () => {
  const f = FREIE_FORMATE['50x50'], stil = { schrift: 4 };
  const [links] = freiLayout(e2('RESTE'), mass, f, { ...stil, ausrichtung: 'links' }).texte;
  const [rechts] = freiLayout(e2('RESTE'), mass, f, { ...stil, ausrichtung: 'rechts' }).texte;
  const [mittig] = freiLayout(e2('RESTE'), mass, f, { ...stil, ausrichtung: 'mitte' }).texte;
  const w = mass('RESTE', 32);
  assert.equal(links.x, f.rand);
  assert.ok(Math.abs(rechts.x + w - (f.breite - f.rand)) < 0.01);
  assert.ok(Math.abs(mittig.x - (f.breite - w) / 2) < 0.01);
});

test('Drehen: gerechnet wird im gedrehten Format, Text laeuft entlang der Rolle', () => {
  const f = FREIE_FORMATE['50x100'], text = 'MUSTERWARE RESTE';
  const stehend = freiLayout(e2(text), mass, f, { schrift: 6 });
  const quer = freiLayout(e2(text), mass, f, { schrift: 6, quer: true });
  assert.equal(stehend.passt, false, 'stehend ist die Zeile breiter als 50 mm');
  assert.equal(quer.passt, true, 'quer stehen 100 mm zur Verfuegung');
  assert.equal(quer.quer, true);
  assert.notEqual(stehend.quer, true);
  assert.ok(quer.texte[0].x + mass(text, 48) <= f.hoehe - f.rand);
  // Automatik nutzt quer die Rollenlaenge: dieselbe Zeile wird groesser.
  assert.ok(freiLayout(e2(text), mass, f, { quer: true }).texte[0].groesse > freiLayout(e2(text), mass, f).texte[0].groesse);
});

test('Drehen meldet auch, wenn quer die Hoehe nicht reicht', () => {
  assert.equal(freiLayout(e2('A\nB\nC\nD'), mass, eigenesFormat(20, 200), { schrift: 12, quer: true }).passt, false);
});

test('Druckversatz: Grenze folgt Rand und Druckkopf', () => {
  assert.deepEqual(versatzGrenze(FREIE_FORMATE['50x50']), { x: 3, y: 4 });
  assert.deepEqual(versatzGrenze(FREIE_FORMATE['50x20']), { x: 2, y: 3 });
  assert.deepEqual(versatzGrenze(eigenesFormat(40, 10)), { x: 2, y: 2 });
  assert.deepEqual(versatzGrenze(eigenesFormat(40, 40)), { x: 4, y: 4 });
});

const ziel = () => {
  const zuege = [];
  return { width: 0, height: 0, zuege, getContext: () => ({ set fillStyle(_) {}, fillRect: () => {}, drawImage: (bild, x, y) => zuege.push({ bild, x, y }) }) };
};

test('Druckkopf: 400 px breite Bilder werden wie bisher mittig zugeschnitten', () => {
  const quelle = { width: 400, height: 640 }, z = ziel();
  assert.equal(aufDruckkopf(quelle, z, 384), z);
  assert.deepEqual([z.width, z.height], [384, 640]);
  assert.deepEqual(z.zuege, [{ bild: quelle, x: -8, y: 0 }]);
});

test('Druckkopf: schmale Bilder werden mittig auf die Kopfbreite aufgefuellt', () => {
  const quelle = { width: 160, height: 80 }, z = ziel();
  assert.equal(aufDruckkopf(quelle, z, 384), z);
  assert.deepEqual([z.width, z.height], [384, 80]);
  assert.deepEqual(z.zuege, [{ bild: quelle, x: 112, y: 0 }]);
});

test('Druckkopf: genau passend, ohne Kopfangabe oder bei anderer Druckrichtung bleibt das Bild, wie es ist', () => {
  for (const [q, kopf, richtung] of [[{ width: 384, height: 80 }, 384, 'top'], [{ width: 160, height: 80 }, undefined, 'top'], [{ width: 160, height: 80 }, 384, 'left']]) {
    const z = ziel();
    assert.equal(aufDruckkopf(q, z, kopf, richtung), q);
    assert.deepEqual(z.zuege, []);
  }
});

test('Schrift je Zeile: feste Zeile bleibt, die automatische teilt sich den Rest', () => {
  const e = freieEtiketten('GROSS\nklein', 1, { zeilenSchrift: { [zeilenSchluessel(0, 1)]: 3 } })[0];
  assert.deepEqual(e.schriften, [0, 3]);
  const l = freiLayout(e, mass, ETIKETT_FORMATE['50x50']);
  assert.equal(l.texte[1].groesse, 24);
  assert.ok(l.texte[0].groesse > 24);
  assert.equal(l.passt, true);
});

test('Schrift je Zeile geht vor der Schrift aller Zeilen und meldet, was nicht passt', () => {
  const e = freieEtiketten('A\nB', 1, { zeilenSchrift: { '0:0': 5 } })[0];
  const l = freiLayout(e, mass, ETIKETT_FORMATE['50x50'], { schrift: 3 });
  assert.deepEqual(l.texte.map(t => t.groesse), [40, 24]);
  const zuGross = freieEtiketten('AB\nCD', 1, { zeilenSchrift: { '0:0': 30, '0:1': 30 } })[0];
  assert.equal(freiLayout(zuGross, mass, ETIKETT_FORMATE['50x50']).passt, false);
});

test('unbekannte Schrift je Zeile zaehlt nicht; verschiedene Schrift = eigenes Motiv', () => {
  assert.equal(freieEtiketten('A', 1, { zeilenSchrift: { '0:0': 11 } })[0].schriften, null);
  const [a] = freieEtiketten('A'), [b] = freieEtiketten('A', 1, { zeilenSchrift: { '0:0': 5 } });
  assert.notEqual(motivSchluessel(a), motivSchluessel(b));
});

const produkt = { serie: 'Solenta', farbe: 'Eiche Dunkelbraun', sku: 'ABC-1', url: 'https://www.teppich-paradies.net/products/solenta', technik: [{ label: 'Art', wert: 'Klickvinyl' }, { label: 'Material', wert: 'Wolle', zusatz: true }] };

test('Produktentwurf: Angaben als Text, Eckdaten nur von Hand', () => {
  const v = produktEntwurf(produkt);
  assert.deepEqual(v.text.split('\n'), ['www.teppich-paradies.net', 'Solenta', 'Eiche Dunkelbraun', 'Art: Klickvinyl', 'Art.-Nr. ABC-1']);
  assert.equal(v.url, produkt.url);
  assert.equal(v.zeilenSchrift['0:1'], undefined);
  assert.equal(v.zeilenSchrift['0:4'], 3);
});

test('Produktentwurf passt samt QR-Code auf alle drei Rollen, QR ueberlappt nichts', () => {
  const v = produktEntwurf(produkt);
  const e = freieEtiketten(v.text, 1, v)[0];
  for (const name of ['50x50', '50x80', '50x100']) {
    const l = freiLayout(e, mass, ETIKETT_FORMATE[name]);
    assert.deepEqual(l.probleme, [], name);
    assert.ok(l.qr, name);
  }
});

test('QR-Code auf der schmalen Rolle wird gemeldet statt still weggelassen', () => {
  const e = freieEtiketten('A', 1, { url: produkt.url })[0];
  assert.equal(freiLayout(e, mass, schmal).passt, false);
});
