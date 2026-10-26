import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIKETT, ETIKETT_FORMATE, MIN_SCHRIFT, andereArten, etikett, etikettFormat, etikettenAusPositionen, etikettFuerPosition, klassenNummern, layout,
  layoutProbleme, produktUrl, qrMindest, qrModule, serieAus, serieUndFarbe, technikZeilen, tinte, umbrechen, varianteFuer,
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

test('technikZeilen: Vinyl von der Rolle traegt nur die Art, "Auch als" nur mit belegtem gleichem Dekor', () => {
  const rolle = { arten: 'Vinyl von der Rolle', gesamtstaerke: '2,8 mm', nutzschicht: '0,35 mm', rollenbreite: '4.0' };
  assert.deepEqual(technikZeilen(rolle), [{ label: 'Art', wert: 'Vinyl von der Rolle' }]);
  assert.deepEqual(technikZeilen({ ...vinyl.eigenschaften }, ['Klebevinyl']).slice(0, 3), [
    { label: 'Art', wert: 'Klickvinyl' },
    { label: 'Auch als', wert: 'Klebevinyl' },
    { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' },
  ]);
  // Teppichboden bekommt keine Technik, auch nicht ueber "Auch als".
  assert.deepEqual(technikZeilen(teppich.eigenschaften, ['Klickvinyl']), []);
  // Aus dem Lexikon: eigene Art und Doppelte fallen weg, leere Eintraege auch.
  const paar = { ...vinyl, gleicherDekor: [{ art: 'Klebevinyl', handle: 'a' }, { art: 'Klebevinyl', handle: 'b' }, { art: 'Klickvinyl', handle: 'c' }, { art: '', handle: 'd' }] };
  assert.deepEqual(andereArten(paar), ['Klebevinyl']);
  assert.deepEqual(andereArten(vinyl), []);
  assert.deepEqual(etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, paar).technik.map(z => z.label),
    ['Art', 'Auch als', 'Stärke / Nutzschicht', 'Nutzungsklasse', 'Format']);
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

test('layout mit "Auch als": fuenf Technikzeilen bleiben vollstaendig, QR rechts daneben', () => {
  const paar = { ...vinyl, gleicherDekor: [{ art: 'Klebevinyl', handle: 'testlinea-eiche-natur-klebevinyl' }] };
  for (const format of [ETIKETT, ETIKETT_FORMATE['50x100']]) {
    const e = etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, paar);
    const l = layout(e, mass, format);
    for (const t of l.texte) assert.ok(t.x >= format.rand - 0.01 && t.x + mass(t.text, t.groesse) <= format.breite - format.rand + 0.01 && t.y + t.groesse <= format.hoehe - format.rand + 0.01, t.text);
    assert.ok(l.qr.y + l.qr.groesse <= format.hoehe - format.rand && l.qr.x + l.qr.groesse <= format.breite - format.rand);
    const technik = l.texte.filter(t => t.y > l.linien[0].y && !t.text.startsWith('Art.-Nr.'));
    assert.deepEqual(technik.map(t => t.text), e.technik.flatMap(z => [z.label, z.wert]));
    for (let i = 1; i < technik.length; i++) assert.ok(technik[i - 1].y + technik[i - 1].groesse <= technik[i].y);
    assert.ok(technik.at(-1).y + technik.at(-1).groesse < l.texte.find(t => t.text === 'Art.-Nr. TL-100').y);
    assert.ok(l.qr && l.qr.groesse >= 100, String(l.qr?.groesse));
    if (format === ETIKETT) assert.ok(technik.every(t => t.x + mass(t.text, t.groesse) <= l.qr.x - 12));
  }
  // Rollenware: nur die Art, der QR-Code steht rechts daneben.
  const rolle = etikett({ serie: 'Testrolle', farbe: 'Eiche Hell', sku: 'TR-1', handle: 'testrolle', technik: technikZeilen({ arten: 'Vinyl von der Rolle' }) });
  const lr = layout(rolle, mass);
  imRahmen(lr);
  assert.equal(lr.linien.length, 1);
  assert.ok(lr.qr.groesse >= 100 && lr.texte.find(t => t.text === 'Vinyl von der Rolle').x < lr.qr.x);
});

test('layout: ohne URL kein QR, ohne SKU keine Art.-Nr.-Zeile', () => {
  const { texte, qr } = layout(etikett({ serie: 'Nur Serie' }), mass);
  assert.equal(qr, null);
  assert.deepEqual(texte.map(t => t.text), ['www.teppich-paradies.net', 'Nur Serie']);
});

test('layout 50 x 100 mm: dieselbe Aufteilung, alles groesser, alles im Rahmen', () => {
  const gross = ETIKETT_FORMATE['50x100'];
  assert.equal(gross.breite, 400);
  assert.equal(gross.hoehe, 800);
  assert.equal(etikettFormat('50x100'), gross);
  assert.equal(etikettFormat('unbekannt'), ETIKETT, 'unbekanntes Format faellt auf 50 x 50 zurueck');
  const imFormat = ({ texte, qr }) => {
    for (const t of texte) {
      assert.ok(t.x >= gross.rand - 0.01 && t.x + mass(t.text, t.groesse) <= gross.breite - gross.rand + 0.01, t.text);
      assert.ok(t.y + t.groesse <= gross.hoehe - gross.rand + 0.01, t.text);
    }
    if (qr) assert.ok(qr.x >= gross.rand && qr.y + qr.groesse <= gross.hoehe - gross.rand && qr.x + qr.groesse <= gross.breite - gross.rand);
  };
  const beispiele = [
    etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, vinyl),
    etikett({ serie: 'Testvelours', farbe: 'Sand', sku: 'TV-400-SA', handle: 'testvelours-teppichboden' }),
    etikett({ serie: 'Testlinea Extra Langer Serienname Mit Zusatz', farbe: 'Graphit Dunkel Anthrazit (1008)', sku: 'TL-LANG-1008', handle: 'testlinea-graphit',
      technik: [{ label: 'Art', wert: 'Klickvinyl' }, { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' }, { label: 'Nutzungsklasse', wert: '23 / 33' }, { label: 'Format', wert: '122 × 18 cm' }] }),
  ];
  for (const e of beispiele) {
    const klein = layout(e, mass);
    const l = layout(e, mass, gross);
    imFormat(l);
    assert.ok(l.texte[0].groesse > klein.texte[0].groesse, 'Absender groesser');
    assert.ok(l.texte[1].groesse >= klein.texte[1].groesse, 'Serie mindestens so gross');
    assert.ok(l.qr.groesse > klein.qr.groesse, `QR groesser (${klein.qr.groesse} -> ${l.qr.groesse})`);
    assert.ok(!l.texte.some(t => t.text.includes('…')), 'nichts abgeschnitten');
    assert.equal(l.texte[0].text, 'www.teppich-paradies.net', 'Shopname vollstaendig');
    const namen = l.texte.slice(1).filter(t => !t.text.startsWith('Art.-Nr.')).map(t => t.text).join(' ');
    assert.ok(namen.startsWith(`${e.serie} ${e.farbe}`), `kein Wort getrennt: ${namen}`);
    // Hochformat: QR-Code unter allen Texten ausser der Art.-Nr.
    assert.ok(l.texte.filter(t => !t.text.startsWith('Art.-Nr.')).every(t => t.y + t.groesse <= l.qr.y), 'QR unter dem Text');
  }
});

test('Formate: 50 x 80 mm ist 400 x 640 px und steht zwischen 50 x 50 und 50 x 100', () => {
  const f = ETIKETT_FORMATE['50x80'];
  assert.deepEqual([f.breite, f.hoehe, f.rand, f.name], [400, 640, 18, '50 × 80 mm']);
  assert.equal(etikettFormat('50x80'), f);
  assert.deepEqual(Object.keys(ETIKETT_FORMATE), ['50x50', '50x80', '50x100']);
});

test('qrModule: Kantenlaenge wie qrcode-generator (Version automatisch, Stufe M)', () => {
  const url = n => 'x'.repeat(n);
  assert.deepEqual([14, 15, 26, 27, 62, 63, 84, 85].map(n => qrModule(url(n))), [21, 25, 25, 29, 33, 37, 37, 41]);
  assert.equal(qrMindest(url(62)), 66, 'jedes Modul mindestens 2 Druckpunkte');
});

test('tinte: Akzente ueber Grossbuchstaben und Unterlaengen werden mitgerechnet', () => {
  assert.deepEqual(tinte('Eiche', 40), { oben: 0, unten: 32 });
  assert.deepEqual(tinte('Ölbraun', 40), { oben: 6, unten: 32 });
  assert.deepEqual(tinte('Grau (3N55)', 40), { oben: 0, unten: 40 });
  assert.equal(tinte('grün', 40).oben, 0, 'Umlaut in Kleinbuchstaben bleibt unter der Oberkante');
});

test('layoutProbleme: meldet Ueberlappen, Rand, Kuerzung, Mini-Schrift und fehlenden QR-Code', () => {
  const t = (text, y, groesse = 20) => ({ text, x: 18, y, groesse, fett: false });
  assert.deepEqual(layoutProbleme({ texte: [t('Eins', 18), t('Zwei', 60)], linien: [], qr: null }, mass), []);
  assert.match(layoutProbleme({ texte: [t('Eins', 18), t('Zwei', 30)] }, mass).join(), /berührt/);
  assert.match(layoutProbleme({ texte: [t('Eins', 390)] }, mass).join(), /Rand/);
  assert.match(layoutProbleme({ texte: [t('Ein…', 18)] }, mass).join(), /gekürzt/);
  assert.match(layoutProbleme({ texte: [t('Eins', 18, 10)] }, mass).join(), /kleiner als 12/);
  assert.match(layoutProbleme({ texte: [] }, mass, ETIKETT, 'https://x').join(), /QR/);
  assert.match(layoutProbleme({ texte: [], qr: { x: 100, y: 100, groesse: 20 } }, mass, ETIKETT, 'https://x').join(), /zu klein/);
});

// Pruefung "nichts ueberlappt, nichts abgeschnitten": im Rahmen, jedes Wort ganz und genau einmal da,
// keine zwei Teile beruehren sich (layoutProbleme), Schrift nie unter MIN_SCHRIFT, QR-Code lesbar gross.
const woerter = t => String(t).split(/\s+/).filter(Boolean);
function vollstaendigUndFrei(e, l, format) {
  assert.ok(l.passt, `${format.format}: ${l.probleme.join(' | ')}`);
  assert.deepEqual(layoutProbleme(l, mass, format, e.url), []);
  const soll = ['www.teppich-paradies.net', ...woerter(e.serie), ...woerter(e.farbe), ...(e.sku ? ['Art.-Nr.', e.sku] : []), ...e.technik.flatMap(z => [...woerter(z.label), ...woerter(z.wert)])];
  assert.deepEqual(l.texte.flatMap(t => woerter(t.text)).sort(), soll.sort(), 'jedes Wort ganz und genau einmal');
  assert.ok(l.texte.every(t => t.groesse >= MIN_SCHRIFT));
  if (e.url) assert.ok(l.qr.groesse >= qrMindest(e.url));
}

test('Testetikett Teppichboden mit Farbnummer auf 50 x 50 und 50 x 80: vollstaendig, nichts beruehrt sich', () => {
  const p = { handle: 'testwerk-lorena-teppichboden-400cm-500cm', titel: 'Testwerk Lorena Teppichboden 400cm 500cm', eigenschaften: { marke: 'Testwerk', florhoehe: '5,3 mm' },
    varianten: [{ sku: 'TW-LORENA-3N55-400', farbe: 'Marineblau Hell (3N55)' }, { sku: 'TW-LORENA-3N55-500', farbe: 'Marineblau Hell (3N55)' }] };
  const e = etikettFuerPosition({ istMuster: true, farbe: 'Marineblau Hell (3N55)', handle: p.handle, musterQuelle: { sku: 'TW-LORENA-3N55-400' } }, p);
  assert.deepEqual([e.serie, e.farbe, e.sku, e.technik.length], ['Testwerk Lorena', 'Marineblau Hell (3N55)', 'TW-LORENA-3N55-400', 0]);
  const klein = layout(e, mass, ETIKETT), mittel = layout(e, mass, ETIKETT_FORMATE['50x80']);
  vollstaendigUndFrei(e, klein, ETIKETT);
  vollstaendigUndFrei(e, mittel, ETIKETT_FORMATE['50x80']);
  assert.ok(mittel.texte[1].groesse > klein.texte[1].groesse, 'Serie auf 50 x 80 groesser');
  assert.ok(mittel.qr.groesse > klein.qr.groesse, 'QR-Code auf 50 x 80 groesser');
  assert.ok(mittel.texte.filter(t => !t.text.startsWith('Art.-Nr.')).every(t => t.y + t.groesse <= mittel.qr.y), 'QR unter dem Namen');
});

test('layout kurz bis sehr lang: in 50 x 50, 50 x 80 und 50 x 100 ueberlappt nichts und nichts wird abgeschnitten', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const wahl = a => a[Math.floor(rnd() * a.length)];
  const teile = ['Eiche', 'Ölbraun', 'Grün', 'Élégance', 'gypsy', '(3N55)', 'Anthrazit', 'Marineblau', 'Hell', 'Teppichbodenfliesen', 'WWW', 'Klickvinyl', '5 mm', '23 / 33', '122 × 18 cm', 'Vinyl von der Rolle', 'Q'];
  const satz = (a, b) => Array.from({ length: a + Math.floor(rnd() * (b - a + 1)) }, () => wahl(teile)).join(' ');
  const labels = ['Art', 'Auch als', 'Stärke / Nutzschicht', 'Nutzungsklasse', 'Format'];
  for (let i = 0; i < 400; i++) {
    const technik = rnd() < 0.4 ? [] : Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ label: wahl(labels), wert: satz(1, rnd() < 0.8 ? 2 : 5) }));
    const e = etikett({ serie: satz(1, rnd() < 0.2 ? 10 : 3), farbe: satz(1, rnd() < 0.2 ? 8 : 3), sku: rnd() < 0.1 ? '' : `TW-${i}-${'X'.repeat(Math.floor(rnd() * 14))}`,
      handle: `test-${'a'.repeat(Math.floor(rnd() * 90))}`, technik });
    for (const format of Object.values(ETIKETT_FORMATE)) vollstaendigUndFrei(e, layout(e, mass, format), format);
  }
});

test('layout: was selbst in Mindestschrift nicht passt, wird gesperrt statt abgeschnitten', () => {
  const e = etikett({ serie: 'Testvelours', farbe: 'Sand', sku: `TV-${'Y'.repeat(80)}`, handle: 'testvelours' });
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const l = layout(e, mass, format);
    assert.equal(l.passt, false);
    assert.match(l.probleme.join(), /zu lang/);
  }
  // Ein ellenlanger Name ohne Leerzeichen genauso - er wuerde sonst mitten im Wort getrennt.
  assert.equal(layout(etikett({ serie: 'Z'.repeat(70), farbe: 'Sand', handle: 'x' }), mass).passt, false);
});
