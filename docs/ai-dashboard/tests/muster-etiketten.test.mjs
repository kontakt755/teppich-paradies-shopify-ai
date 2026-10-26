import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIKETT, ETIKETT_FORMATE, MIN_SCHRIFT, QR_HINWEIS, SCHWELLE, andereArten, breitenAus, etikett, etikettFormat, etikettenAusPositionen, etikettFuerPosition, klassenNummern, layout,
  layoutProbleme, produktUrl, qrMindest, qrModule, qrRaster, schwarzWeiss, serieAus, serieUndFarbe, technikZeilen, tinte, umbrechen, varianteFuer,
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

test('klassenNummern und technikZeilen: Paketware feste Zeilen, sonst Eckdaten als Zusatz, fehlende fallen weg', () => {
  assert.equal(klassenNummern('Klasse 23 (Wohnen, stark), Klasse 32 (Gewerbe, normal)'), '23 / 32');
  assert.deepEqual(technikZeilen(vinyl.eigenschaften), [
    { label: 'Art', wert: 'Klickvinyl' },
    { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' },
    { label: 'Nutzungsklasse', wert: '23 / 33' },
    { label: 'Format', wert: '122 × 18 cm' },
  ]);
  assert.deepEqual(technikZeilen({ qmProPaket: '2', gesamtstaerke: '4 mm', arten: 'Klebevinyl, Klickvinyl' }), [{ label: 'Art', wert: 'Klebevinyl / Klickvinyl' }, { label: 'Stärke', wert: '4 mm' }]);
  assert.deepEqual(technikZeilen(teppich.eigenschaften), [{ label: 'Florhöhe', wert: '8 mm', zusatz: true }]);
  // Teppichboden: Material, Breite, Florhoehe, Nutzungsklasse, Fussbodenheizung - alles nur, wo Platz ist.
  assert.deepEqual(technikZeilen({ fasermaterial: 'Polyamid', florhoehe: '5,3 mm', gesamtstaerke: '8 mm', nutzungsklasse: 'Klasse 32 (Gewerbe, normal)', fussbodenheizung: 'Ja', ruecken: 'Textilrücken' }, [], '400 / 500 cm'), [
    { label: 'Material', wert: 'Polyamid', zusatz: true },
    { label: 'Breite', wert: '400 / 500 cm', zusatz: true },
    { label: 'Florhöhe', wert: '5,3 mm', zusatz: true },
    { label: 'Nutzungsklasse', wert: '32', zusatz: true },
    { label: 'Fußbodenheizung', wert: 'ja', zusatz: true },
  ]);
  // Ohne Florhoehe die Staerke; "Nein" und ellenlange Materialangaben bleiben weg.
  assert.deepEqual(technikZeilen({ material: 'Polyethylen-Monofilament (glatt) und Polypropylen (gekräuselt)', gesamtstaerke: '2,5 mm', fussbodenheizung: 'Nein' }), [{ label: 'Stärke', wert: '2,5 mm', zusatz: true }]);
  // Paketware: Fussbodenheizung als Zusatz hinter den festen Zeilen.
  assert.deepEqual(technikZeilen({ ...vinyl.eigenschaften, fussbodenheizung: 'Ja' }).at(-1), { label: 'Fußbodenheizung', wert: 'ja', zusatz: true });
});

test('breitenAus: Rollenbreiten der Farbe aus den Varianten, sonst custom.rollenbreite; kein Wunschmass, keine Millimeter', () => {
  const p = { eigenschaften: {}, varianten: [
    { farbe: 'Sand', optionen: [{ name: 'Farbe', wert: 'Sand' }, { name: 'Breite', wert: '500cm' }] },
    { farbe: 'Sand', optionen: [{ name: 'Farbe', wert: 'Sand' }, { name: 'Breite', wert: '400 cm' }] },
    { farbe: 'Grau', optionen: [{ name: 'Farbe', wert: 'Grau' }, { name: 'Breite', wert: '200 cm' }] },
    { farbe: 'Grau', optionen: [{ name: 'Breite', wert: 'Wunschmaß' }] },
  ] };
  assert.equal(breitenAus(p, 'Sand'), '400 / 500 cm');
  assert.equal(breitenAus(p, 'Grau'), '200 cm');
  assert.equal(breitenAus(p), '200 / 400 / 500 cm', 'ohne Farbe alle Breiten');
  assert.equal(breitenAus(p, 'Unbekannt'), '200 / 400 / 500 cm');
  assert.equal(breitenAus({ eigenschaften: { rollenbreite: '2.0' }, varianten: [{ optionen: [{ name: 'Breite', wert: 'Wunschmaß' }] }] }), '200 cm');
  assert.equal(breitenAus({ varianten: [{ optionen: [{ name: 'Breite', wert: '90 mm' }] }] }), '');
  assert.equal(breitenAus(null), '');
});

test('technikZeilen: Vinyl von der Rolle traegt nur die Art, "Auch als" nur mit belegtem gleichem Dekor', () => {
  const rolle = { arten: 'Vinyl von der Rolle', gesamtstaerke: '2,8 mm', nutzschicht: '0,35 mm', rollenbreite: '4.0' };
  assert.deepEqual(technikZeilen(rolle).filter(z => !z.zusatz), [{ label: 'Art', wert: 'Vinyl von der Rolle' }]);
  assert.deepEqual(technikZeilen(rolle, [], '400 cm').filter(z => z.zusatz).map(z => z.label), ['Breite', 'Stärke / Nutzschicht']);
  assert.deepEqual(technikZeilen({ ...vinyl.eigenschaften }, ['Klebevinyl']).slice(0, 3), [
    { label: 'Art', wert: 'Klickvinyl' },
    { label: 'Auch als', wert: 'Klebevinyl' },
    { label: 'Stärke / Nutzschicht', wert: '5 mm / 0,55 mm' },
  ]);
  // Teppichboden bekommt kein "Auch als" (das gibt es nur bei Vinyl).
  assert.ok(!technikZeilen(teppich.eigenschaften, ['Klickvinyl']).some(z => z.label === 'Auch als'));
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

test('etikettFuerPosition: echte SKU statt Muster-SKU, feste Technik nur bei Paketware', () => {
  const v = etikettFuerPosition({ istMuster: true, titel: 'Kostenloses Muster', sku: 'TP-MUSTER-000', farbe: 'Eiche Natur', handle: 'kostenloses-muster', musterQuelle: { produktHandle: vinyl.handle, sku: 'TL-100' } }, vinyl);
  assert.equal(v.serie, 'Testlinea');
  assert.equal(v.farbe, 'Eiche Natur');
  assert.equal(v.sku, 'TL-100');
  assert.equal(v.url, `https://www.teppich-paradies.net/products/${vinyl.handle}`);
  assert.equal(v.technik.length, 4);
  const t = etikettFuerPosition({ istMuster: true, titel: 'Muster Testvelours Teppichboden 400cm', sku: 'M-77', farbe: 'Grau', handle: 'muster-testvelours-teppichboden' }, teppich);
  assert.deepEqual([t.serie, t.sku, t.technik], ['Testvelours', 'TV-400-GR', [{ label: 'Florhöhe', wert: '8 mm', zusatz: true }]]);
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

// Woerter ohne Schraegstriche: die Tabelle setzt "Stärke / Nutzschicht" mit "5 mm / 0,55 mm" als zwei Zeilen.
const worte = texte => texte.flatMap(t => String(t.text ?? t).split(/\s+/)).filter(w => w && w !== '/');
/** Technik = alles zwischen der Linie unter den Namen und der Linie ueber der Art.-Nr. */
const technikVon = l => l.texte.filter(t => t.y > l.linien[0].y && t.y < l.linien[1].y && t.text !== QR_HINWEIS);
/** Zeilen untereinander; Bezeichnung und Wert einer Tabellenzeile stehen auf derselben Hoehe. */
const untereinander = texte => texte.every((t, i) => !i || texte[i - 1].y === t.y || texte[i - 1].y + texte[i - 1].groesse <= t.y);

const imRahmen = ({ texte, qr }) => {
  for (const t of texte) {
    assert.ok(t.x >= ETIKETT.rand - 0.01 && t.x + mass(t.text, t.groesse) <= ETIKETT.breite - ETIKETT.rand + 0.01, t.text);
    assert.ok(t.y + t.groesse <= ETIKETT.hoehe - ETIKETT.rand + 0.01, t.text);
  }
  if (qr) assert.ok(qr.x >= ETIKETT.rand && qr.y + qr.groesse <= ETIKETT.hoehe - ETIKETT.rand && qr.x + qr.groesse <= ETIKETT.breite - ETIKETT.rand);
};

test('layout Paketware: Absender oben, zwei Linien, Technik links, QR rechts, Art.-Nr. unten', () => {
  const e = etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, vinyl);
  const l = layout(e, mass);
  imRahmen(l);
  assert.equal(l.texte[0].text, 'www.teppich-paradies.net');
  assert.equal(l.texte[0].fett, false, 'Shopadresse normal - die Serie ist die Ueberschrift');
  assert.equal(l.linien.length, 2, 'Linie unter den Namen und ueber der Art.-Nr.');
  assert.ok(l.qr.groesse <= 140 && l.qr.groesse >= 100, String(l.qr.groesse));
  assert.ok(l.qr.y > l.linien[0].y && l.qr.y + l.qr.groesse < l.linien[1].y);
  assert.ok(l.texte.find(t => t.text === '23 / 33').x < l.qr.x);
  const nr = l.texte.find(t => t.text === 'TL-100'), label = l.texte.find(t => t.text === 'Art.-Nr.');
  assert.ok(nr.fett && !label.fett && nr.y === label.y && label.x < nr.x, 'Art.-Nr. normal, Nummer fett, eine Zeile');
  assert.ok(nr.y > l.linien[1].y);
  // Technik ragt nicht in den QR-Code.
  assert.ok(technikVon(l).every(t => t.x + mass(t.text, t.groesse) <= l.qr.x));
});

test('layout Teppichboden: ohne Technik groesserer QR in der Mitte, lange Namen bleiben im Rahmen', () => {
  const e = etikett({ serie: 'Testvelours Extra Langer Serienname Mit Woertern', farbe: 'Beige Mittel Dunkler Ton', sku: 'TV-400-SA', handle: 'testvelours-teppichboden' });
  const l = layout(e, mass);
  imRahmen(l);
  assert.equal(l.linien.length, 2);
  assert.ok(!l.texte.some(t => t.text.includes('…')), 'Produktname und Farbe bleiben vollstaendig');
  const namen = l.texte.filter(t => t.y > l.texte[0].y && t.y < l.linien[0].y);
  assert.equal(namen.map(t => t.text).join(' '), `${e.serie} ${e.farbe}`);
  assert.ok(namen.every(t => t.y + t.groesse <= l.qr.y), 'Volltext und QR bleiben getrennt');
  // Ab hier nur noch 2 Druckpunkte je Kaestchen (37 x 2 = 74 px) - mehr Flaeche ergab vorher nur Luft im Druck.
  assert.ok(l.qr.groesse >= qrMindest(e.url), String(l.qr.groesse));
  assert.ok(Math.abs(l.qr.x + l.qr.groesse / 2 - ETIKETT.breite / 2) <= 1);
  const kurz = layout(etikett({ serie: 'Testvelours', farbe: 'Sand', sku: 'X', handle: 'x' }), mass);
  assert.equal(kurz.qr.groesse, 132, 'QR-Code hoechstens 20 mm, in ganzen Kaestchen (4 x 33) - der Rest bleibt Luft zwischen den Linien');
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
  const technik = technikVon(l);
  assert.deepEqual(worte(technik).sort(), worte(e.technik.flatMap(z => [z.label, z.wert])).sort());
  assert.ok(technik.every(t => t.x + mass(t.text, t.groesse) <= l.qr.x - 12));
  assert.ok(untereinander(technik));
  const artikel = l.texte.find(t => t.text === 'TL-LANG-1008');
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
    const technik = technikVon(l);
    assert.deepEqual(worte(technik).sort(), worte(e.technik.flatMap(z => [z.label, z.wert])).sort());
    assert.ok(untereinander(technik));
    assert.ok(technik.at(-1).y + technik.at(-1).groesse < l.texte.find(t => t.text === 'TL-100').y);
    assert.ok(l.qr && l.qr.groesse >= 100, String(l.qr?.groesse));
    if (format === ETIKETT) assert.ok(technik.every(t => t.x + mass(t.text, t.groesse) <= l.qr.x - 12));
  }
  // Rollenware: nur die Art, der QR-Code steht rechts daneben.
  const rolle = etikett({ serie: 'Testrolle', farbe: 'Eiche Hell', sku: 'TR-1', handle: 'testrolle', technik: technikZeilen({ arten: 'Vinyl von der Rolle' }) });
  const lr = layout(rolle, mass);
  imRahmen(lr);
  assert.equal(lr.linien.length, 2);
  assert.ok(lr.qr.groesse >= 100);
  assert.deepEqual(worte(technikVon(lr)), ['Art', 'Vinyl', 'von', 'der', 'Rolle']);
  assert.ok(technikVon(lr).every(t => t.x + mass(t.text, t.groesse) <= lr.qr.x - 12));
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
    const namen = l.texte.filter(t => t.y > l.texte[0].y && t.y < l.linien[0].y).map(t => t.text).join(' ');
    assert.equal(namen, `${e.serie} ${e.farbe}`, 'kein Wort getrennt');
    // Hochformat: QR-Code unter Namen und Technik, nur der Hinweis steht darunter.
    assert.ok(l.texte.filter(t => t.y < l.linien[1].y && t.text !== QR_HINWEIS).every(t => t.y + t.groesse <= l.qr.y), 'QR unter dem Text');
  }
});

test('Formate: 50 x 80 mm ist 400 x 640 px und steht zwischen 50 x 50 und 50 x 100', () => {
  const f = ETIKETT_FORMATE['50x80'];
  assert.deepEqual([f.breite, f.hoehe, f.rand, f.name], [400, 640, 32, '50 × 80 mm']);
  assert.equal(etikettFormat('50x80'), f);
  assert.deepEqual(Object.keys(ETIKETT_FORMATE), ['50x50', '50x80', '50x100']);
});

test('qrModule: Kantenlaenge wie qrcode-generator (Version automatisch, Stufe M)', () => {
  const url = n => 'x'.repeat(n);
  assert.deepEqual([14, 15, 26, 27, 62, 63, 84, 85].map(n => qrModule(url(n))), [21, 25, 25, 29, 33, 37, 37, 41]);
  assert.equal(qrMindest(url(62)), 66, 'jedes Modul mindestens 2 Druckpunkte');
});

test('qrRaster: groesste Flaeche in ganzen Kaestchen, ohne URL oder Platz keine', () => {
  const url = 'x'.repeat(84); // 37 Kaestchen
  assert.deepEqual([140, 148, 160, 111, 110, 74, 73].map(g => qrRaster(url, g)), [111, 148, 148, 111, 74, 74, 37]);
  assert.equal(qrRaster('', 140), 0);
  assert.equal(qrRaster(url, 0), 0);
});

test('schwarzWeiss: jedes Pixel ganz schwarz oder ganz weiss, Grenze bei SCHWELLE', () => {
  const px = [[0, 0, 0, 255], [SCHWELLE - 1, SCHWELLE - 1, SCHWELLE - 1, 255], [SCHWELLE, SCHWELLE, SCHWELLE, 255], [255, 255, 255, 0], [200, 30, 30, 255]];
  const raus = [...schwarzWeiss(new Uint8ClampedArray(px.flat()))];
  assert.deepEqual(raus, [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
});

test('layout QR-Code: auf ganzen Kaestchen, quer buendig rechts und oben auf Hoehe der Technik', () => {
  const e = etikettFuerPosition({ istMuster: true, farbe: 'Eiche Natur', handle: vinyl.handle }, vinyl);
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const l = layout(e, mass, format);
    assert.equal(l.qr.groesse % qrModule(e.url), 0, `${format.format}: ${l.qr.groesse} px`);
  }
  const l = layout(e, mass);
  assert.equal(l.qr.x + l.qr.groesse, ETIKETT.breite - ETIKETT.rand, 'rechts am Rand, keine Luecke im Druck');
  assert.equal(l.qr.y, Math.min(...technikVon(l).map(t => t.y)), 'Oberkante wie die erste Technikzeile');
});

test('tinte: Akzente ueber Grossbuchstaben und Unterlaengen werden mitgerechnet', () => {
  assert.deepEqual(tinte('Eiche', 40), { oben: 0, unten: 32 });
  assert.deepEqual(tinte('Ölbraun', 40), { oben: 6, unten: 32 });
  assert.deepEqual(tinte('Grau (3N55)', 40), { oben: 0, unten: 40 });
  assert.equal(tinte('grün', 40).oben, 0, 'Umlaut in Kleinbuchstaben bleibt unter der Oberkante');
});

test('layoutProbleme: meldet Ueberlappen, Rand, Kuerzung, Mini-Schrift und fehlenden QR-Code', () => {
  const t = (text, y, groesse = 20) => ({ text, x: 32, y, groesse, fett: false });
  assert.deepEqual(layoutProbleme({ texte: [t('Eins', 32), t('Zwei', 74)], linien: [], qr: null }, mass), []);
  assert.match(layoutProbleme({ texte: [t('Eins', 32), t('Zwei', 44)] }, mass).join(), /berührt/);
  assert.match(layoutProbleme({ texte: [t('Eins', 360)] }, mass).join(), /Rand/);
  assert.match(layoutProbleme({ texte: [{ ...t('Eins', 32), x: 20 }] }, mass).join(), /Rand/, '4 mm Rand auch links');
  assert.match(layoutProbleme({ texte: [t('Ein…', 32)] }, mass).join(), /gekürzt/);
  assert.match(layoutProbleme({ texte: [t('Eins', 32, 10)] }, mass).join(), /kleiner als 12/);
  assert.match(layoutProbleme({ texte: [] }, mass, ETIKETT, 'https://x').join(), /QR/);
  assert.match(layoutProbleme({ texte: [], qr: { x: 100, y: 100, groesse: 20 } }, mass, ETIKETT, 'https://x').join(), /zu klein/);
});

// Pruefung "nichts ueberlappt, nichts abgeschnitten": im Rahmen, jedes Wort ganz und genau einmal da,
// keine zwei Teile beruehren sich (layoutProbleme), Schrift nie unter MIN_SCHRIFT, QR-Code lesbar gross.
const woerter = t => String(t).split(/\s+/).filter(Boolean);
function vollstaendigUndFrei(e, l, format) {
  assert.ok(l.passt, `${format.format}: ${l.probleme.join(' | ')}`);
  assert.deepEqual(layoutProbleme(l, mass, format, e.url), []);
  const hinweis = l.texte.some(t => t.text === QR_HINWEIS) ? [QR_HINWEIS] : [];
  assert.deepEqual(l.zeilen.filter(z => !z.zusatz), e.technik.filter(z => !z.zusatz), 'feste Technikzeilen stehen immer da');
  const soll = worte(['www.teppich-paradies.net', e.serie, e.farbe, ...(e.sku ? ['Art.-Nr.', e.sku] : []), ...l.zeilen.flatMap(z => [z.label, z.wert]), ...hinweis]);
  assert.deepEqual(worte(l.texte).sort(), soll.sort(), 'jedes Wort ganz und genau einmal');
  assert.ok(l.texte.every(t => t.groesse >= MIN_SCHRIFT));
  if (e.url) assert.ok(l.qr.groesse >= qrMindest(e.url) && l.qr.groesse % qrModule(e.url) === 0, `QR ${l.qr.groesse} px`);
}

test('Testetikett Teppichboden mit Farbnummer auf 50 x 50 und 50 x 80: vollstaendig, nichts beruehrt sich', () => {
  const p = { handle: 'testwerk-lorena-teppichboden-400cm-500cm', titel: 'Testwerk Lorena Teppichboden 400cm 500cm', eigenschaften: { marke: 'Testwerk', florhoehe: '5,3 mm' },
    varianten: [{ sku: 'TW-LORENA-3N55-400', farbe: 'Marineblau Hell (3N55)' }, { sku: 'TW-LORENA-3N55-500', farbe: 'Marineblau Hell (3N55)' }] };
  const e = etikettFuerPosition({ istMuster: true, farbe: 'Marineblau Hell (3N55)', handle: p.handle, musterQuelle: { sku: 'TW-LORENA-3N55-400' } }, p);
  assert.deepEqual([e.serie, e.farbe, e.sku, e.technik.map(z => z.label)], ['Testwerk Lorena', 'Marineblau Hell (3N55)', 'TW-LORENA-3N55-400', ['Florhöhe']]);
  const klein = layout(e, mass, ETIKETT), mittel = layout(e, mass, ETIKETT_FORMATE['50x80']);
  vollstaendigUndFrei(e, klein, ETIKETT);
  vollstaendigUndFrei(e, mittel, ETIKETT_FORMATE['50x80']);
  // Der Name bleibt auf beiden Rollen einzeilig - lieber gleich gross als auf 50 x 80 zweizeilig (Foto Inhaber 26.10.).
  assert.ok(mittel.texte[1].groesse >= klein.texte[1].groesse, 'Serie auf 50 x 80 mindestens so gross');
  assert.deepEqual([klein, mittel].map(l => l.texte.filter(t => t.y > l.texte[0].y && t.y < l.linien[0].y).length), [2, 2], 'Serie und Farbe je eine Zeile');
  assert.ok(mittel.qr.groesse > klein.qr.groesse, 'QR-Code auf 50 x 80 groesser');
  assert.ok(mittel.texte.filter(t => t.y < mittel.linien[0].y).every(t => t.y + t.groesse <= mittel.qr.y), 'QR unter dem Namen');
  assert.ok(mittel.texte.some(t => t.text === QR_HINWEIS && t.y > mittel.qr.y + mittel.qr.groesse), 'auf 50 x 80 steht unter dem QR-Code, wofuer er ist');
  assert.ok(!klein.texte.some(t => t.text === QR_HINWEIS), 'auf 50 x 50 ist dafuer kein Platz');
});

test('layout Eckdaten: Zusatzzeilen nur, wo Platz ist - dafuer wird nichts kleiner', () => {
  const eck = [['Material', 'Polyamid'], ['Breite', '400 / 500 cm'], ['Florhöhe', '5,3 mm'], ['Nutzungsklasse', '32'], ['Fußbodenheizung', 'ja']].map(([label, wert]) => ({ label, wert, zusatz: true }));
  const ohne = etikett({ serie: 'Testwerk Lorena', farbe: 'Marineblau Hell (3N55)', sku: 'TW-LORENA-3N55-400', handle: 'testwerk-lorena-teppichboden' });
  const mit = { ...ohne, technik: eck };
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const a = layout(ohne, mass, format), b = layout(mit, mass, format);
    vollstaendigUndFrei(mit, b, format);
    assert.ok(b.zeilen.length >= 3, `${format.format}: ${b.zeilen.length} Eckdaten`);
    assert.deepEqual(b.zeilen, eck.filter(z => b.zeilen.includes(z)), 'Reihenfolge bleibt');
    assert.ok(b.masse.serie >= Math.min(a.masse.serie, Math.round(40 * format.faktor)), `${format.format}: Serie ${a.masse.serie} -> ${b.masse.serie}`);
    assert.equal(b.masse.skala, a.masse.skala, 'nichts wird insgesamt verkleinert');
    assert.ok(b.qr.groesse >= 100);
  }
  assert.equal(layout(mit, mass, ETIKETT_FORMATE['50x80']).zeilen.length, 5, 'auf 50 x 80 ist fuer alle Platz');
  // Eine Zusatzzeile, die nicht passt, faellt allein weg - die folgenden stehen trotzdem da.
  const sperrig = { ...ohne, technik: [eck[0], { label: 'Rücken', wert: 'W'.repeat(60), zusatz: true }, ...eck.slice(1)] };
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const l = layout(sperrig, mass, format);
    assert.ok(l.passt);
    assert.ok(!l.zeilen.some(z => z.label === 'Rücken') && l.zeilen.some(z => z.label === 'Breite'), format.format);
  }
  // Feste Zeilen (Paketware) bleiben, auch wenn danach keine Zusatzzeile mehr passt.
  const paket = { ...ohne, technik: [{ label: 'Art', wert: 'Klickvinyl' }, { label: 'Format', wert: '122 × 18 cm' }, ...eck] };
  assert.deepEqual(layout(paket, mass).zeilen.slice(0, 2).map(z => z.label), ['Art', 'Format']);
});

test('layout kurz bis sehr lang: in 50 x 50, 50 x 80 und 50 x 100 ueberlappt nichts und nichts wird abgeschnitten', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const wahl = a => a[Math.floor(rnd() * a.length)];
  const teile = ['Eiche', 'Ölbraun', 'Grün', 'Élégance', 'gypsy', '(3N55)', 'Anthrazit', 'Marineblau', 'Hell', 'Teppichbodenfliesen', 'WWW', 'Klickvinyl', '5 mm', '23 / 33', '122 × 18 cm', 'Vinyl von der Rolle', 'Q'];
  const satz = (a, b) => Array.from({ length: a + Math.floor(rnd() * (b - a + 1)) }, () => wahl(teile)).join(' ');
  const labels = ['Art', 'Auch als', 'Stärke / Nutzschicht', 'Nutzungsklasse', 'Format', 'Material', 'Breite', 'Florhöhe', 'Fußbodenheizung'];
  for (let i = 0; i < 400; i++) {
    // Feste Zeilen (Paketware) und Zusatzzeilen (Eckdaten) gemischt, wie technikZeilen() sie liefert.
    const technik = rnd() < 0.4 ? [] : Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ label: wahl(labels), wert: satz(1, rnd() < 0.8 ? 2 : 5), ...(rnd() < 0.5 ? { zusatz: true } : {}) }))
      .sort((a, b) => Number(Boolean(a.zusatz)) - Number(Boolean(b.zusatz)));
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
