import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIKETT, etikett, etikettenAusPositionen, etikettFuerPosition, klassenNummern, layout, produktUrl,
  serieAus, serieUndFarbe, technikZeilen, umbrechen, varianteFuer,
} from '../lib/muster-etiketten.mjs';

// Nur erfundene Daten. Messen ohne Canvas: jedes Zeichen ist gut halb so breit wie die Schriftgroesse.
const mass = (t, g = 20) => t.length * g * 0.55;

const vinyl = {
  handle: 'testlinea-eiche-natur-klickvinyl', titel: 'Testlinea Eiche Natur – Klickvinyl', produktgruppe: 'Klickvinyl',
  eigenschaften: { arten: 'Klickvinyl', qmProPaket: '2.2', gesamtstaerke: '5 mm', nutzschicht: '0,55 mm', nutzungsklasse: 'Klasse 23 (Wohnen, stark), Klasse 33 (Gewerbe, stark)', format: '122 × 18 cm' },
  varianten: [{ sku: 'TL-100', farbe: 'Eiche Natur' }],
};
const teppich = {
  handle: 'testvelours-teppichboden', titel: 'Testvelours Teppichboden', produktgruppe: 'Teppichboden',
  eigenschaften: { florhoehe: '8 mm' },
  varianten: [{ sku: 'TV-400-SA', farbe: 'Sand' }, { sku: 'TV-400-GR', farbe: 'Grau' }],
};

test('produktUrl: Musterprodukt fuehrt zum Original, Unsinn ergibt keine URL', () => {
  assert.equal(produktUrl('muster-testvelours-teppichboden'), 'https://www.teppich-paradies.net/products/testvelours-teppichboden');
  assert.equal(produktUrl(null), '');
  assert.equal(produktUrl('UNGEKLAERT'), '');
  assert.equal(produktUrl('a b/c'), '');
});

test('serieAus: Farbe und Warengruppe fallen weg', () => {
  assert.equal(serieAus('Testlinea Eiche Natur – Klickvinyl', 'Eiche Natur'), 'Testlinea');
  assert.equal(serieAus('Muster Testvelours Teppichboden 400cm 500cm', 'Sand'), 'Testvelours');
  assert.equal(serieAus('Teppichboden', ''), 'Teppichboden');
  assert.deepEqual(serieUndFarbe('Testlinea Eiche Natur – Klebevinyl', 'Testlinea Eiche Natur', 'Testlinea'), { serie: 'Testlinea', farbe: 'Eiche Natur' });
  assert.deepEqual(serieUndFarbe('Testmarke Plus Dekor Rot – Klebevinyl', null, 'Testmarke Plus'), { serie: 'Testmarke Plus', farbe: 'Dekor Rot' });
  // Ohne Marke nichts raten: Farbe bleibt leer statt doppelt.
  assert.deepEqual(serieUndFarbe('Testlinea Eiche Natur – Klebevinyl', 'Testlinea Eiche Natur'), { serie: 'Testlinea Eiche Natur', farbe: '' });
  assert.deepEqual(serieUndFarbe('Testgrund Nadelvlies', 'Türkis'), { serie: 'Testgrund', farbe: 'Türkis' });
  assert.equal(serieAus('Testlinea Teppichfliese 50x50cm', 'Graphit (1008)'), 'Testlinea');
  assert.equal(serieAus('Testlinea Teppichfliesen 50x50cm', 'Graphit (1008)'), 'Testlinea');
});

test('klassenNummern und technikZeilen: nur Paketware, fehlende Zeilen fallen weg', () => {
  assert.equal(klassenNummern('Klasse 23 (Wohnen, stark), Klasse 32 (Gewerbe, normal)'), '23 / 32');
  assert.deepEqual(technikZeilen(vinyl.eigenschaften), [
    { label: 'Art', wert: 'Klickvinyl' },
    { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' },
    { label: 'Nutzungsklasse', wert: '23 / 33' },
    { label: 'Format', wert: '122 × 18 cm' },
  ]);
  assert.deepEqual(technikZeilen({ qmProPaket: '2', gesamtstaerke: '4 mm', arten: 'Klebevinyl, Klickvinyl' }), [{ label: 'Art', wert: 'Klebevinyl / Klickvinyl' }, { label: 'Stärke', wert: '4 mm' }]);
  assert.deepEqual(technikZeilen(teppich.eigenschaften), []);
});

test('etikett: Muster-SKU bleibt leer ohne Hinweis, fehlende Farbe wird genannt', () => {
  const e = etikett({ serie: 'Testvelours', farbe: '–', sku: 'TP-MUSTER-000', handle: 'testvelours' });
  assert.equal(e.farbe, '');
  assert.equal(e.sku, '');
  assert.deepEqual(e.fehlt, ['Farbe']);
  assert.equal(etikett({ sku: 'M-123' }).sku, '');
});

test('varianteFuer: Quellvariante vor Farbe, sonst nichts raten', () => {
  assert.equal(varianteFuer({ musterQuelle: { sku: 'TV-400-GR' }, farbe: 'Sand' }, teppich).sku, 'TV-400-GR');
  assert.equal(varianteFuer({ farbe: 'Sand' }, teppich).sku, 'TV-400-SA');
  assert.equal(varianteFuer({ farbe: 'Blau' }, teppich), null);
  assert.equal(varianteFuer({ farbe: 'egal' }, vinyl).sku, 'TL-100');
});

test('etikettFuerPosition: echte SKU statt Muster-SKU, Technik nur bei Paketware', () => {
  const v = etikettFuerPosition({ istMuster: true, titel: 'Kostenloses Muster', sku: 'TP-MUSTER-000', farbe: 'Eiche Natur', handle: 'kostenloses-muster', musterQuelle: { produktHandle: vinyl.handle, sku: 'TL-100' } }, vinyl);
  assert.equal(v.serie, 'Testlinea');
  assert.equal(v.farbe, 'Eiche Natur');
  assert.equal(v.sku, 'TL-100');
  assert.equal(v.url, `https://www.teppich-paradies.net/products/${vinyl.handle}`);
  assert.equal(v.technik.length, 4);
  const t = etikettFuerPosition({ istMuster: true, titel: 'Muster Testvelours Teppichboden 400cm', sku: 'M-77', farbe: 'Grau', handle: 'muster-testvelours-teppichboden' }, teppich);
  assert.deepEqual([t.serie, t.sku, t.technik.length], ['Testvelours', 'TV-400-GR', 0]);
  // Ohne Lexikon: Farbe aus der Bestellung, SKU bleibt leer statt Muster-SKU.
  const o = etikettFuerPosition({ istMuster: true, titel: 'Muster Testvelours Teppichboden', sku: 'M-77', farbe: 'Grau', handle: 'muster-testvelours-teppichboden' }, null);
  assert.deepEqual([o.serie, o.farbe, o.sku], ['Testvelours', 'Grau', '']);
  assert.ok(!o.fehlt.includes('Artikelnummer'));
});

test('etikettenAusPositionen: nur Muster, eins je Stueck, Lexikon per Handle', () => {
  const liste = etikettenAusPositionen([
    { istMuster: true, titel: 'Muster Testvelours Teppichboden', farbe: 'Sand', handle: 'muster-testvelours-teppichboden', mengeBestellt: 2 },
    { istMuster: false, titel: 'Ware', farbe: 'Grau', sku: 'W-1', handle: 'ware' },
  ], new Map([[teppich.handle, teppich]]));
  assert.equal(liste.length, 2);
  assert.equal(liste[0].sku, 'TV-400-SA');
  assert.deepEqual(etikettenAusPositionen(null), []);
});

test('umbrechen: Woerter, hartes Trennen, Auslassung nach maxZeilen', () => {
  const m = t => t.length * 10;
  assert.deepEqual(umbrechen('aaa bbb ccc', 70, m, 3), ['aaa bbb', 'ccc']);
  assert.deepEqual(umbrechen('abcdefghijkl', 50, m, 3), ['abcde', 'fghij', 'kl']);
  const z = umbrechen('eins zwei drei vier fuenf sechs', 50, m, 2);
  assert.equal(z.length, 2);
  assert.ok(z[1].endsWith('…'));
});

const imRahmen = ({ texte, qr }) => {
  for (const t of texte) {
    assert.ok(t.x >= ETIKETT.rand - 0.01 && t.x + mass(t.text, t.groesse) <= ETIKETT.breite - ETIKETT.rand + 0.01, t.text);
    assert.ok(t.y + t.groesse <= ETIKETT.hoehe - ETIKETT.rand + 0.01, t.text);
  }
  if (qr) assert.ok(qr.x >= ETIKETT.rand && qr.y + qr.groesse <= ETIKETT.hoehe - ETIKETT.rand && qr.x + qr.groesse <= ETIKETT.breite - ETIKETT.rand);
};

test('layout Paketware: Absender oben, Trennlinie, Technik links, QR rechts, Art.-Nr. unten', () => {
  const e = etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, vinyl);
  const l = layout(e, mass);
  imRahmen(l);
  assert.equal(l.texte[0].text, 'www.teppich-paradies.net');
  assert.equal(l.linien.length, 1);
  assert.ok(l.qr.groesse <= 140 && l.qr.groesse >= 100, String(l.qr.groesse));
  assert.ok(l.qr.y > l.linien[0].y);
  assert.ok(l.texte.find(t => t.text === '23 / 33').x < l.qr.x);
  assert.ok(l.texte.some(t => t.text === 'Art.-Nr. TL-100' && t.y > l.qr.y + l.qr.groesse));
  // Technik ragt nicht in den QR-Code.
  assert.ok(l.texte.filter(t => t.y >= l.qr.y).every(t => t.x + mass(t.text, t.groesse) <= l.qr.x || t.text.startsWith('Art.-Nr.')));
});

test('layout Teppichboden: ohne Technik groesserer QR in der Mitte, lange Namen bleiben im Rahmen', () => {
  const e = etikett({ serie: 'Testvelours Extra Langer Serienname Mit Woertern', farbe: 'Beige Mittel Dunkler Ton', sku: 'TV-400-SA', handle: 'testvelours-teppichboden' });
  const l = layout(e, mass);
  imRahmen(l);
  assert.equal(l.linien.length, 0);
  assert.ok(!l.texte.some(t => t.text.includes('…')), 'Produktname und Farbe bleiben vollstaendig');
  const namen = l.texte.filter(t => t.y > l.texte[0].y && !t.text.startsWith('Art.-Nr.'));
  assert.equal(namen.map(t => t.text).join(' '), `${e.serie} ${e.farbe}`);
  assert.ok(namen.every(t => t.y + t.groesse <= l.qr.y), 'Volltext und QR bleiben getrennt');
  assert.ok(l.qr.groesse >= 100);
  assert.ok(Math.abs(l.qr.x + l.qr.groesse / 2 - ETIKETT.breite / 2) <= 1);
  const kurz = layout(etikett({ serie: 'Testvelours', farbe: 'Sand', sku: 'X', handle: 'x' }), mass);
  assert.equal(kurz.qr.groesse, 180);
});

test('layout lange Serie und Farbe: alle vier Technikzeilen bleiben vollstaendig und ohne Ueberlappung', () => {
  const e = etikett({
    serie: 'Testlinea Extra Langer Serienname Mit Zusatz', farbe: 'Graphit Dunkel Anthrazit (1008)', sku: 'TL-LANG-1008', handle: 'testlinea-graphit',
    technik: [
      { label: 'Art', wert: 'Klickvinyl' },
      { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' },
      { label: 'Nutzungsklasse', wert: '23 / 33' },
      { label: 'Format', wert: '122 × 18 cm' },
    ],
  });
  const l = layout(e, mass);
  imRahmen(l);
  assert.ok(l.qr.groesse >= 100, String(l.qr.groesse));
  const technik = l.texte.filter(t => t.y > l.linien[0].y && !t.text.startsWith('Art.-Nr.'));
  assert.deepEqual(technik.map(t => t.text), e.technik.flatMap(z => [z.label, z.wert]));
  assert.ok(technik.every(t => t.x + mass(t.text, t.groesse) <= l.qr.x - 12));
  for (let i = 1; i < technik.length; i++) assert.ok(technik[i - 1].y + technik[i - 1].groesse <= technik[i].y);
  const artikel = l.texte.find(t => t.text === 'Art.-Nr. TL-LANG-1008');
  assert.ok(technik.at(-1).y + technik.at(-1).groesse < artikel.y);
  assert.ok(l.texte.filter(t => t.y < l.linien[0].y).every(t => t.y + t.groesse < l.linien[0].y));
  assert.ok(!l.texte.some(t => t.text.includes('…')), 'auch der lange Titel bleibt vollstaendig');
});

test('layout: ohne URL kein QR, ohne SKU keine Art.-Nr.-Zeile', () => {
  const { texte, qr } = layout(etikett({ serie: 'Nur Serie' }), mass);
  assert.equal(qr, null);
  assert.deepEqual(texte.map(t => t.text), ['www.teppich-paradies.net', 'Nur Serie']);
});
