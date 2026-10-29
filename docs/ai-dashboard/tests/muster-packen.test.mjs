import test from 'node:test';
import assert from 'node:assert/strict';
import { musterPackliste, aufkleberFuer, aufkleberFuerMuster, handTreffer, packSchluessel, packSuche, STAND_TEXT } from '../lib/muster-packen.mjs';
import { adressEtikett, adressLayout, ABSENDER } from '../lib/adress-etiketten.mjs';
import { ETIKETT_FORMATE } from '../lib/muster-etiketten.mjs';

// Ausschliesslich synthetische Kunden, Anschriften und Artikel.
const boden = {
  handle: 'testvelours-teppichboden', titel: 'Testvelours Teppichboden', eigenschaften: {},
  varianten: [
    { id: 'gid://shopify/ProductVariant/101', sku: 'TV-SA', farbe: 'Sand (011)', einkauf: { produktname: 'Lieferantenware SAND 400', farbnummer: '11', url: 'https://lieferant-a.example/sand' } },
    { id: 'gid://shopify/ProductVariant/102', sku: 'TV-GR', farbe: 'Grau (022)', einkauf: { produktname: 'Lieferantenware GRAU 400', farbnummer: '22', url: 'UNGEKLAERT' } },
  ],
};
const produkte = new Map([[boden.handle, boden]]);
const pos = (li, quellvariante, extra = {}) => ({ lineItemId: `gid://shopify/LineItem/${li}`, istMuster: true, titel: 'Muster Testvelours', farbe: 'Sand', menge: 1, mengeBestellt: 1,
  handle: 'kostenloses-muster', sku: 'TP-MUSTER-0', musterQuelle: { quellvariante, produktHandle: boden.handle }, ...extra });
const adresse = (name, extra = {}) => ({ name, strasse: 'Testweg 1', plz: '00000', ort: 'Musterstadt', land: 'Germany', ...extra });
const auftrag = (id, datum, kunde, positionen, extra = {}) => ({ id: `gid://shopify/Order/${id}`, name: `#T${id}`, datum, offen: true, storniert: false, testbestellung: false,
  bezahlt: 'PAID', erfuellt: 'UNFULFILLED', details: { kunde: { name: kunde }, lieferadresse: adresse(kunde) }, positionen, kundeKey: `k:${kunde}`, ...extra });
const schluesselVon = a => a.kundeKey;
const jetzt = new Date('2026-10-21T12:00:00Z');

test('mehrere Bestellungen eines Kunden werden ein Umschlag; aelteste Wartezeit zuerst', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [
    auftrag(3, '2026-10-20T09:00:00Z', 'Berta Beispiel', [pos(31, '102')]),
    auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101')]),
    auftrag(2, '2026-10-19T09:00:00Z', 'Anna Test', [pos(21, '102'), pos(22, '101')]),
  ] });
  assert.deepEqual(r.kunden.map(k => [k.name, k.bestellungen.map(b => b.orderName)]), [['Anna Test', ['#T1', '#T2']], ['Berta Beispiel', ['#T3']]]);
  const anna = r.kunden[0];
  assert.equal(anna.wartetTage, 4);
  assert.equal(anna.muster.length, 3);
  assert.equal(anna.aufkleber, 4, 'drei Muster plus Adresse');
  assert.equal(r.offen, 2);
  assert.deepEqual(aufkleberFuer(anna).map(e => e.art || e.sku), ['TV-SA', 'TV-GR', 'TV-SA', 'adresse']);
  assert.deepEqual(anna.adressAufkleber.bestellungen, ['#T1', '#T2']);
});

test('nur offen, bezahlt, nicht versendet, keine Testbestellung; erledigte Muster fallen weg', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    statusVon: (_, li) => (li.endsWith('/52') ? 'raus' : null),
    auftraege: [
      auftrag(1, '2026-10-17T09:00:00Z', 'Offen Bezahlt', [pos(11, '101')]),
      auftrag(2, '2026-10-17T09:00:00Z', 'Nicht Bezahlt', [pos(21, '101')], { bezahlt: 'PENDING' }),
      auftrag(3, '2026-10-17T09:00:00Z', 'Storniert', [pos(31, '101')], { storniert: true }),
      auftrag(4, '2026-10-17T09:00:00Z', 'Versendet', [pos(41, '101')], { erfuellt: 'FULFILLED' }),
      auftrag(5, '2026-10-17T09:00:00Z', 'Teilweise Raus', [pos(51, '101'), pos(52, '102')]),
      auftrag(6, '2026-10-17T09:00:00Z', 'Testkauf', [pos(61, '101')], { testbestellung: true }),
      auftrag(7, '2026-10-17T09:00:00Z', 'Nur Ware', [{ lineItemId: 'w', istMuster: false, titel: 'Teppich' }]),
    ] });
  assert.deepEqual(r.kunden.map(k => [k.name, k.muster.length]), [['Offen Bezahlt', 1], ['Teilweise Raus', 1]]);
});

test('vorher = Lieferantenangaben aus dem Lexikon, Stand nur aus belegtem Auftragsfluss', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    statusVon: (_, li) => ({ 'gid://shopify/LineItem/11': 'geliefert', 'gid://shopify/LineItem/12': 'bestellt' })[li] || null,
    auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102'), pos(13, '101', { musterHerkunft: 'eigen_versand' }), pos(14, '102')])] });
  const [m1, m2, m3, m4] = r.kunden[0].muster;
  assert.deepEqual(m1.vorher, { produktname: 'Lieferantenware SAND 400', farbnummer: '11', url: 'https://lieferant-a.example/sand', kollektion: null, lieferant: null, bild: null, hersteller: null, artikelnummer: null });
  assert.equal(m2.vorher.url, null, 'UNGEKLAERT ist kein Link');
  assert.deepEqual([m1.stand, m2.stand, m3.stand, m4.stand], ['da', 'bestellt', 'lager', 'offen']);
  assert.equal(r.kunden[0].nichtBestellt, 1);
  assert.ok(Object.keys(STAND_TEXT).every(k => STAND_TEXT[k]));
});

test('gepackt gilt nur fuer genau diese Bestellungen; eine neue Bestellung oeffnet den Kunden wieder', () => {
  const a1 = auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101')]);
  const a2 = auftrag(2, '2026-10-20T09:00:00Z', 'Anna Test', [pos(21, '101')]);
  const pk = packSchluessel([a1.id]);
  const gepackt = { [pk]: { zeit: '2026-10-21T10:00:00Z', von: 'Laden' } };
  const vorher = musterPackliste({ produkte, schluesselVon, jetzt, gepackt, auftraege: [a1] });
  assert.deepEqual(vorher.kunden[0].gepackt, { zeit: '2026-10-21T10:00:00Z', von: 'Laden' });
  assert.equal(vorher.offen, 0);
  const nachher = musterPackliste({ produkte, schluesselVon, jetzt, gepackt, auftraege: [a1, a2] });
  assert.equal(nachher.kunden[0].gepackt, null);
  assert.equal(nachher.offen, 1);
  assert.equal(packSchluessel(['b', 'a', 'a']), 'a,b');
});

test('ohne eindeutige Zuordnung bleibt das Muster sichtbar und der Kunde benannt unvollstaendig', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '999', { titel: 'Muster Unbekannt', farbe: 'Rot' })])] });
  assert.deepEqual(r.kunden[0].fehlt, ['Muster Unbekannt – Rot']);
  assert.ok(r.kunden[0].muster[0].fehlt.includes('Originalzuordnung'));
});

test('Adressaufkleber: Zusatzzeile getrennt, Inland ohne Land, Ausland mit Land, Luecken benannt', () => {
  const inland = adressEtikett(adresse('Anna Test', { strasse: 'Testweg 1, Hinterhaus' }), ['#T1']);
  assert.deepEqual(inland.empfaenger.map(z => z.text), ['Anna Test', 'Testweg 1', 'Hinterhaus', '00000 Musterstadt']);
  assert.deepEqual(inland.fehlt, []);
  const ausland = adressEtikett(adresse('Bert Test', { land: 'Austria' }), []);
  assert.equal(ausland.empfaenger.at(-1).text, 'AUSTRIA');
  assert.deepEqual(adressEtikett({ name: 'X', strasse: '–' }).fehlt, ['Straße', 'PLZ/Ort']);
});

test('Adresslayout: jede Zeile passt in die Druckbreite, auch lange Orte; ohne Bestellnummer', () => {
  const mass = (t, g, fett) => t.length * g * (fett ? 0.6 : 0.55);
  const e = adressEtikett(adresse('Anna-Katharina Testfrau-Beispiel', { strasse: 'Lange-Beispielstraße 115, Gartenhaus', plz: '00000', ort: 'Bad Musterstadt-Langenachbarort' }), ['#T1040', '#T1041', '#T1042']);
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const { texte, linien, qr, quer } = adressLayout(e, mass, format);
    // Quer gesetzt gelten die Koordinaten im gedrehten Format.
    const f = quer ? { ...format, breite: format.hoehe, hoehe: format.breite } : format;
    assert.equal(qr, null);
    assert.ok(linien.length === 1);
    assert.deepEqual(texte.slice(0, 2).map(t => t.text), [...ABSENDER]);
    for (const t of texte) {
      assert.ok(t.x >= f.rand && t.x + mass(t.text, t.groesse, t.fett) <= f.breite - f.rand + 1, `${format.format}: ${t.text} zu breit`);
      assert.ok(t.y >= 0 && t.y + t.groesse <= f.hoehe, `${format.format}: ${t.text} ausserhalb`);
    }
    assert.ok(!texte.some(t => /Bestellung|#T104/.test(t.text)), 'keine Bestellnummer auf dem Adressaufkleber');
  }
});

test('Adresslayout: auch ellenlange Zeilen brechen um statt abzuschneiden, nichts beruehrt sich', () => {
  const mass = (t, g, fett) => t.length * g * (fett ? 0.6 : 0.55);
  const lang = 'Sehr Lange Beispielstraße Mit Vielen Woertern Hinter Dem Gartenhaus';
  const e = adressEtikett(adresse('Anna-Katharina Testfrau-Beispiel von und zu Musterhausen am Testsee', { strasse: `${lang} 115, ${lang}`, ort: 'Bad Musterstadt Ortsteil Langenachbarort' }), []);
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const l = adressLayout(e, mass, format);
    assert.ok(l.passt, `${format.format}: ${l.probleme.join(' | ')}`);
    const woerter = t => t.split(/\s+/).filter(Boolean);
    assert.deepEqual(l.texte.flatMap(t => woerter(t.text)).sort(), [...ABSENDER, ...e.empfaenger.map(z => z.text)].flatMap(woerter).sort(), 'jedes Wort ganz da');
    assert.ok(l.texte.every(t => t.groesse >= 12));
  }
  assert.equal(adressLayout(adressEtikett(adresse('X'.repeat(90)), []), mass).passt, false, 'ein Wort breiter als das Etikett wird gesperrt');
});

test('Adresse liegt auf hohen Rollen quer: Zeile entlang der langen Seite, Schrift waechst mit (Inhaber 28.10.)', () => {
  const mass = (t, g, fett) => t.length * g * (fett ? 0.6 : 0.55);
  const e = adressEtikett(adresse('Anna Test', { strasse: 'Testweg 12', plz: '00000', ort: 'Musterstadt' }), []);
  const quadrat = adressLayout(e, mass, ETIKETT_FORMATE['50x50']);
  assert.equal(quadrat.quer, false, '50 x 50 bleibt wie bisher');
  for (const name of ['50x80', '50x100']) {
    const format = ETIKETT_FORMATE[name];
    const l = adressLayout(e, mass, format);
    assert.equal(l.quer, true, `${name} quer`);
    assert.ok(l.passt, `${name}: ${l.probleme.join(' | ')}`);
    const breitester = Math.max(...l.texte.map(t => t.x + mass(t.text, t.groesse, t.fett)));
    assert.ok(breitester > format.breite, `${name}: Zeilen nutzen die Rollenlaenge (${breitester} px)`);
    assert.ok(breitester <= format.hoehe - format.rand + 0.01, `${name}: innerhalb der Rollenlaenge`);
    assert.ok(Math.max(...l.texte.map(t => t.y + t.groesse)) <= format.breite - format.rand + 0.01, `${name}: innerhalb der Rollenbreite`);
    const name1 = g => g.texte.find(t => t.text === 'Anna Test').groesse;
    assert.ok(name1(l) > name1(quadrat), `${name}: Empfaenger groesser als auf 50 x 50`);
  }
});

test('Erkennen: Farbbild nur fuer genau diese Farbe, Lieferant mit Namen, verwechselbare Muster markiert', () => {
  const zweiFarben = { ...boden, bild: 'https://cdn.example/produkt.jpg', varianten: [
    { ...boden.varianten[0], bild: 'https://cdn.example/sand.jpg', einkauf: { ...boden.varianten[0].einkauf, lieferant: 'A', kollektion: 'Lieferantenware' } },
    { ...boden.varianten[1], einkauf: { ...boden.varianten[1].einkauf, lieferant: 'A', kollektion: 'Lieferantenware' } },
  ] };
  const einfarbig = { handle: 'testvinyl-eiche', titel: 'Testvinyl Eiche', bild: 'https://cdn.example/eiche.jpg', eigenschaften: {},
    varianten: [{ id: 'gid://shopify/ProductVariant/201', sku: 'TVY-EI', farbe: 'Eiche', einkauf: { lieferant: 'B', produktname: 'Eiche hell', farbnummer: '5' } }] };
  const prod = new Map([[zweiFarben.handle, zweiFarben], [einfarbig.handle, einfarbig]]);
  const vinyl = (li) => ({ ...pos(li, '201'), musterQuelle: { quellvariante: '201', produktHandle: einfarbig.handle } });
  const r = musterPackliste({ produkte: prod, schluesselVon, jetzt, lieferantVon: id => ({ A: 'Partnerladen Nord' })[id] || `Lieferant ${id}`,
    auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102'), vinyl(13)])] });
  const [sand, grau, eiche] = r.kunden[0].muster;
  assert.equal(sand.bild, 'https://cdn.example/sand.jpg');
  assert.equal(grau.bild, null, 'Produktbild zeigt eine andere Farbe - lieber kein Bild');
  assert.equal(eiche.bild, 'https://cdn.example/eiche.jpg', 'einfarbiges Produkt: Produktbild ist die Farbe');
  assert.equal(sand.lieferant, 'Partnerladen Nord');
  assert.equal(eiche.lieferant, 'Lieferant B');
  assert.deepEqual([sand.verwechselbar, grau.verwechselbar, eiche.verwechselbar], [true, true, false]);
});

test('Abhaken und zu klaeren: Bereich je Kunde, Haken bleiben, gepackt gewinnt', () => {
  const a1 = auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')]);
  const a2 = auftrag(2, '2026-10-18T09:00:00Z', 'Berta Beispiel', [pos(21, '101')]);
  const haken = { 'gid://shopify/LineItem/11': { zeit: '2026-10-22T08:00:00Z', von: 'Laden' } };
  const schluessel = musterPackliste({ produkte, schluesselVon, auftraege: [a1] }).kunden[0].schluessel;
  const klaeren = { [schluessel]: { zeit: '2026-10-22T08:05:00Z', von: 'Laden', fehlt: ['gid://shopify/LineItem/12'], notiz: 'Grau fehlt im Paket' } };
  const r = musterPackliste({ produkte, schluesselVon, jetzt, haken, klaeren, auftraege: [a1, a2] });
  const [anna, berta] = r.kunden;
  assert.equal(anna.bereich, 'klaeren');
  assert.deepEqual(anna.klaeren.fehlt, ['gid://shopify/LineItem/12']);
  assert.equal(anna.klaeren.notiz, 'Grau fehlt im Paket');
  assert.equal(anna.muster[0].abgehakt.von, 'Laden');
  assert.equal(anna.muster[1].abgehakt, null);
  assert.equal(berta.bereich, 'warten');
  assert.deepEqual(r.zahlen, { warten: 1, packen: 0, klaeren: 1, gepackt: 0 });
  const gepackt = { [packSchluessel([a1.id])]: { zeit: '2026-10-22T09:00:00Z', von: 'Laden' } };
  const spaeter = musterPackliste({ produkte, schluesselVon, jetzt, haken, klaeren, gepackt, auftraege: [a1, a2] });
  assert.equal(spaeter.kunden.find(k => k.name === 'Anna Test').bereich, 'gepackt');
  assert.deepEqual(spaeter.zahlen, { warten: 1, packen: 0, klaeren: 0, gepackt: 1 });
});

test('gleiche SKU in mehreren Breiten mit je eigenem Bild bleibt eindeutig', () => {
  const breit = { ...boden, handle: 'testvelours-500', varianten: [{ ...boden.varianten[0], id: 'gid://shopify/ProductVariant/111', bild: 'https://cdn.example/sand-500.jpg' }] };
  const schmal = { ...boden, varianten: [{ ...boden.varianten[0], bild: 'https://cdn.example/sand-400.jpg' }, boden.varianten[1]] };
  const r = musterPackliste({ produkte: new Map([[schmal.handle, schmal], [breit.handle, breit]]), schluesselVon, jetzt,
    auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101')])] });
  const m = r.kunden[0].muster[0];
  assert.equal(m.vorher?.produktname, 'Lieferantenware SAND 400');
  assert.equal(m.bild, 'https://cdn.example/sand-400.jpg');
});

test('nach Partnerladen: nur offene, nicht eingelegte Muster, mit Ziel-Umschlag', async () => {
  const { musterNachLaden } = await import('../lib/muster-packen.mjs');
  const m = (li, lieferant, name, farbnr, abgehakt = null) => ({ lineItemId: li, orderName: '#T1', lieferant, abgehakt, vorher: { produktname: name, farbnummer: farbnr }, etikett: {} });
  const kunden = [
    { name: 'Anna', bereich: 'packen', packSchluessel: 'a', muster: [m('1', 'Laden Nord', 'Velours', '22'), m('2', 'Laden Nord', 'Velours', '11', { zeit: 'x' })] },
    { name: 'Berta', bereich: 'klaeren', packSchluessel: 'b', muster: [m('3', 'Laden Nord', 'Velours', '5'), m('4', null, 'Vinyl', '1')] },
    { name: 'Carl', bereich: 'packen', packSchluessel: 'c', muster: [m('5', 'Laden Süd', 'Berber', '7')] },
    { name: 'Dora', bereich: 'gepackt', packSchluessel: 'd', muster: [m('6', 'Laden Nord', 'Velours', '9')] },
  ];
  const r = musterNachLaden(kunden);
  assert.deepEqual(r.map(l => [l.laden, l.eintraege.map(e => `${e.muster.vorher.farbnummer}>${e.kunde}@${e.umschlag}`)]), [
    ['Laden Nord', ['5>Berta@b', '22>Anna@a']],
    ['Laden Süd', ['7>Carl@c']],
    ['Lieferant nicht hinterlegt', ['1>Berta@b']],
  ]);
});

test('packbereit nur mit bestaetigtem Bestand oder eingelegtem Muster; Teilwareneingang bleibt wartend', () => {
  const auftraege = [auftrag(1, '2026-10-17', 'Anna', [pos(11, '101'), pos(12, '102')])];
  const basis = { produkte, schluesselVon, auftraege, jetzt };
  assert.equal(musterPackliste({ ...basis, statusVon: () => 'bestellt' }).kunden[0].bereich, 'warten');
  assert.equal(musterPackliste({ ...basis, statusVon: (_, li) => li.endsWith('/11') ? 'geliefert' : 'bestellt' }).kunden[0].bereich, 'warten');
  assert.equal(musterPackliste({ ...basis, statusVon: () => 'geliefert' }).kunden[0].bereich, 'packen');
  assert.equal(musterPackliste({ ...basis, haken: Object.fromEntries(auftraege[0].positionen.map(p => [p.lineItemId, { zeit: 'x' }])) }).kunden[0].bereich, 'packen');
  assert.equal(musterPackliste({ ...basis, auftraege: [auftrag(1, '2026-10-17', 'Anna', [pos(11, '999')])], statusVon: () => 'geliefert' }).kunden[0].bereich, 'klaeren');
});
test('Umschlagkennung bleibt nach Sortieren und Packen anderer Kunden gleich', async () => {
  const { musterNachLaden } = await import('../lib/muster-packen.mjs');
  const liste = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-17', 'Anna', [pos(11, '101')]), auftrag(2, '2026-10-18', 'Berta', [pos(21, '102')])] }).kunden;
  const kennung = ks => musterNachLaden(ks).flatMap(l => l.eintraege).find(e => e.kunde === 'Berta').umschlag;
  assert.equal(kennung(liste), '#T2');
  assert.equal(kennung([...liste].reverse()), '#T2');
  assert.equal(kennung([{ ...liste[0], bereich: 'gepackt' }, liste[1]]), '#T2');
});


test('unterschiedliche Empfaengeradressen bleiben getrennt; alte Sammelpackmarke gilt nicht fuer Teilumschlaege', () => {
  const a = auftrag(81, '2026-10-17', 'Anna Test', [pos(811, '101')]);
  const b = auftrag(82, '2026-10-18', 'Anna Test', [pos(821, '102')]);
  b.details.lieferadresse = adresse('Berta Beispiel', { strasse: 'Andersweg 2' });
  const haken = { [a.positionen[0].lineItemId]: { zeit: '2026-10-21', von: 'Team' } };
  const r = musterPackliste({ produkte, schluesselVon, auftraege: [a, b], haken,
    gepackt: { [packSchluessel([a.id, b.id])]: { zeit: '2026-10-21' } } });
  assert.equal(r.kunden.length, 2);
  assert.equal(new Set(r.kunden.map(k => k.schluessel)).size, 2);
  assert.ok(r.kunden.every(k => !k.gepackt));
  assert.ok(r.kunden[0].muster[0].abgehakt);
  assert.deepEqual(r.kunden.map(k => k.adresse.strasse), ['Testweg 1', 'Andersweg 2']);
});

test('fehlende Kundenidentitaet faellt pro Auftrag zurueck statt unbekannte Kunden zu buendeln', () => {
  const auftraege = [91, 92].map(id => auftrag(id, '2026-10-17', '', [pos(id, '101')],
    { details: { kunde: {}, lieferadresse: {} } }));
  const r = musterPackliste({ produkte, auftraege, schluesselVon: () => 'name:unbekannt' });
  assert.equal(r.kunden.length, 2);
  assert.ok(r.kunden.every(k => k.schluessel.startsWith('auftrag:') && k.bereich === 'klaeren'));
  assert.ok(r.kunden.every(k => k.adressFehlt.includes('Straße')));
});

test('offene Teilrueckerstattung und Direktversand bleiben sichtbar zur Klaerung trotz lokalem Lieferstatus', () => {
  const r = musterPackliste({ produkte, schluesselVon, statusVon: () => 'geliefert', auftraege: [
    auftrag(93, '2026-10-17', 'Anna Test', [pos(931, '101')], { bezahlt: 'PARTIALLY_REFUNDED' }),
    auftrag(94, '2026-10-17', 'Berta Beispiel', [pos(941, '101', { route: 'SUPPLIER_DIRECT' })]),
    auftrag(95, '2026-10-17', 'Clara Beispiel', [pos(951, '101', { musterRoute: 'SUPPLIER_DIRECT' })]),
  ] });
  assert.equal(r.kunden.length, 3);
  assert.ok(r.kunden.every(k => k.bereich === 'klaeren' && k.hinweise.length === 1));
  assert.match(r.kunden[0].hinweise[0], /Teilweise erstattet/);
  assert.ok(r.kunden.slice(1).every(k => /Direktversand/.test(k.hinweise[0])));
});

test('Nullmengen aus Teilversand oder Erstattung erzeugen keinen Packfall und blockieren offene Muster nicht', () => {
  const r = musterPackliste({ produkte, schluesselVon, statusVon: () => 'geliefert', auftraege: [
    auftrag(96, '2026-10-17', 'Anna Test', [pos(961, '101', { menge: 0 }), pos(962, '102')]),
    auftrag(97, '2026-10-17', 'Berta Beispiel', [pos(971, '101', { menge: 0 })]),
  ] });
  assert.equal(r.kunden.length, 1);
  assert.equal(r.kunden[0].muster.length, 1);
  assert.equal(r.kunden[0].bereich, 'packen');
  assert.equal(r.kunden[0].aufkleber, 2);
});


test('adressbezogene Klaermarken bleiben stabil; alte gemeinsame Klaerung bleibt bis zur ausdruecklichen Freigabe aktiv', () => {
  const a = auftrag(98, '2026-10-17', 'Anna Test', [pos(981, '101')]);
  const b = auftrag(99, '2026-10-18', 'Anna Test', [pos(991, '102')]);
  b.details.lieferadresse = adresse('Berta Beispiel');
  const vorher = musterPackliste({ produkte, schluesselVon, auftraege: [a, b] });
  const key = vorher.kunden[0].schluessel;
  const klaeren = { [key]: { notiz: 'Nur erster Umschlag', fehlt: [a.positionen[0].lineItemId] }, 'k:Anna Test': { notiz: 'Alte gemeinsame Notiz' } };
  const beide = musterPackliste({ produkte, schluesselVon, auftraege: [a, b], klaeren });
  assert.equal(beide.kunden[0].klaeren.notiz, 'Nur erster Umschlag');
  assert.equal(beide.kunden[1].klaeren.notiz, 'Alte gemeinsame Notiz');
  assert.equal(beide.kunden[1].bereich, 'klaeren');
  const freigegeben = musterPackliste({ produkte, schluesselVon, auftraege: [a, b], klaeren: { ...klaeren, [beide.kunden[1].schluessel]: { geklaert: true } } });
  assert.equal(freigegeben.kunden[1].klaeren, null);
  assert.equal(freigegeben.kunden[0].klaeren.notiz, 'Nur erster Umschlag');
  assert.match(beide.kunden[1].altvermerk, /Alte gemeinsame Notiz/);
  const allein = musterPackliste({ produkte, schluesselVon, auftraege: [a], klaeren });
  assert.equal(allein.kunden[0].schluessel, key);
  assert.equal(allein.kunden[0].klaeren.notiz, 'Nur erster Umschlag');
});

test('Ausschlusszahlen zaehlen Zahlungsverzug und geschlossene Musterauftraege getrennt ohne Doppelzaehlung', () => {
  const r = musterPackliste({ produkte, schluesselVon, auftraege: [
    auftrag(101, '2026-10-17', 'Anna', [pos(1011, '101')], { bezahlt: 'PENDING' }),
    auftrag(102, '2026-10-17', 'Berta', [pos(1021, '101')], { offen: false, bezahlt: 'PENDING' }),
    auftrag(103, '2026-10-17', 'Clara', [pos(1031, '101')], { storniert: true }),
  ] });
  assert.deepEqual(r.ausschluesse, { zahlungOffen: 1, geschlossen: 1 });
});

test('Anmerkung: Bestelldatum und Musterautomatik aus dem Auftragsfluss, Direktversand an den Kunden wird nicht gepackt', () => {
  const eintraege = {
    'gid://shopify/LineItem/21': { status: 'bestellt', bestelltAm: '2026-10-24T07:00:00.000Z', bestelltVon: 'Musterautomatik' },
    'gid://shopify/LineItem/22': { status: 'bestellt', bestelltAm: '2026-10-23T09:00:00.000Z', bestelltVon: 'tobias' },
    'gid://shopify/LineItem/23': { status: 'geliefert', bestelltAm: '2026-10-20T09:00:00.000Z', bestelltVon: 'Musterautomatik' },
    'gid://shopify/LineItem/31': { status: 'bestellt', bestelltAm: '2026-10-24T07:00:00.000Z', bestelltVon: 'Musterautomatik', ueber: 'kunde' },
  };
  const r = musterPackliste({ produkte, schluesselVon, jetzt, eintragVon: (_, li) => eintraege[li] || null,
    auftraege: [auftrag(2, '2026-10-23T08:00:00Z', 'Bea Test', [pos(21, '101'), pos(22, '102'), pos(23, '101')]),
      auftrag(3, '2026-10-23T08:00:00Z', 'Cem Test', [pos(31, '101')])] });
  const bea = r.kunden.find(k => k.name === 'Bea Test');
  assert.equal(bea.bereich, 'warten');
  assert.deepEqual(bea.muster.map(m => [m.stand, m.bestelltAm, m.automatisch]), [
    ['bestellt', '2026-10-24T07:00:00.000Z', true], ['bestellt', '2026-10-23T09:00:00.000Z', false], ['da', '2026-10-20T09:00:00.000Z', false]], 'das Lieferantendatum bleibt nach der Ankunft');
  const cem = r.kunden.find(k => k.name === 'Cem Test');
  assert.equal(cem.direktversand, true);
  assert.equal(cem.bereich, 'klaeren', 'geht vom Lieferanten direkt an den Kunden - nicht bei uns packen');
  // Ohne eintragVon bleibt alles wie bisher (nur Status).
  const alt = musterPackliste({ produkte, schluesselVon, jetzt, statusVon: () => 'bestellt', auftraege: [auftrag(4, '2026-10-23T08:00:00Z', 'Dan Test', [pos(41, '101')])] });
  assert.deepEqual([alt.kunden[0].muster[0].bestelltAm, alt.kunden[0].muster[0].automatisch], [null, false]);
});

test('packSuche: Herstellerangaben vom Muster finden den Umschlag, das beste Muster wird markiert, Unbekanntes stoert nicht', () => {
  const lexikon = new Map([[boden.handle, { ...boden, varianten: boden.varianten.map(v => ({ ...v,
    einkauf: { ...v.einkauf, hersteller: 'Testwerk Hameln', kollektion: 'Testkollektion', artikelnummer: `ART-${v.sku}` } })) }]]);
  const r = musterPackliste({ produkte: lexikon, schluesselVon, jetzt, statusVon: () => 'bestellt',
    auftraege: [auftrag(5, '2026-10-22T08:00:00Z', 'Eva Test', [pos(51, '101'), pos(52, '102')]), auftrag(6, '2026-10-22T09:00:00Z', 'Fynn Test', [pos(61, '102')])] });
  assert.equal(r.kunden[0].muster[0].vorher.hersteller, 'Testwerk Hameln');
  const eva = r.kunden.find(k => k.name === 'Eva Test'), fynn = r.kunden.find(k => k.name === 'Fynn Test');
  // "TSU" steht nirgends, Hersteller, Produkt und Farbnummer passen zum Sand-Muster von Eva.
  const s = packSuche(r.kunden, 'Testwerk SAND tsu 11');
  assert.deepEqual(s.treffer, [{ packSchluessel: eva.packSchluessel, muster: ['gid://shopify/LineItem/51'] }]);
  assert.deepEqual(s.fehlen, ['tsu']);
  // Farbnummer mit Bindestrich, Gross-/Kleinschreibung und Umlaute egal.
  assert.deepEqual(packSuche(r.kunden, 'grau ART-TV-GR').treffer.map(t => t.packSchluessel).sort(), [eva.packSchluessel, fynn.packSchluessel].sort());
  // Bestellnummer findet nur den Umschlag; kurze Woerter passen nicht ohne Satzzeichen irgendwo hinein.
  assert.deepEqual(packSuche(r.kunden, '#T6').treffer, [{ packSchluessel: fynn.packSchluessel, muster: [] }]);
  assert.deepEqual(packSuche(r.kunden, 'gibtsnicht'), { woerter: ['gibtsnicht'], treffer: [], ausserhalb: [], fehlen: ['gibtsnicht'] });
  assert.deepEqual(packSuche(r.kunden, '   ').treffer, []);
});

test('ausserhalb: storniert, versandt, Zahlung offen, geschlossen und erledigte Muster stehen mit Grund fuer die Suche bereit', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    statusVon: (_, li) => (li.endsWith('/52') ? 'raus' : null),
    auftraege: [
      auftrag(1, '2026-10-17T09:00:00Z', 'Offen Bezahlt', [pos(11, '101')]),
      auftrag(2, '2026-10-18T09:00:00Z', 'Nicht Bezahlt', [pos(21, '101')], { bezahlt: 'PENDING' }),
      auftrag(3, '2026-10-19T09:00:00Z', 'Storniert', [pos(31, '101')], { storniert: true }),
      auftrag(4, '2026-10-16T09:00:00Z', 'Versendet', [pos(41, '102', { menge: 0 })], { erfuellt: 'FULFILLED' }),
      auftrag(5, '2026-10-15T09:00:00Z', 'Teilweise Raus', [pos(51, '101'), pos(52, '102')]),
      auftrag(6, '2026-10-14T09:00:00Z', 'Testkauf', [pos(61, '101')], { testbestellung: true }),
      auftrag(8, '2026-10-13T09:00:00Z', 'Geschlossen', [pos(81, '101')], { offen: false }),
    ] });
  // Neueste zuerst; Testbestellungen nie.
  assert.deepEqual(r.ausserhalb.map(b => [b.orderName, b.grund, b.muster.map(m => m.lineItemId.split('/').pop())]), [
    ['#T3', 'storniert', ['31']], ['#T2', 'zahlungOffen', ['21']], ['#T4', 'erledigt', ['41']], ['#T5', 'erledigt', ['52']], ['#T8', 'geschlossen', ['81']]]);
  assert.deepEqual(r.ausschluesse, { zahlungOffen: 1, geschlossen: 1 }, 'Zaehlung wie bisher');
  assert.deepEqual(r.kunden.map(k => [k.name, k.muster.length]), [['Teilweise Raus', 1], ['Offen Bezahlt', 1]]);
  const versandt = r.ausserhalb.find(b => b.orderName === '#T4').muster[0];
  assert.deepEqual([versandt.etikett.sku, versandt.vorher.produktname, versandt.vorher.farbnummer, versandt.bestellt.farbe], ['TV-GR', 'Lieferantenware GRAU 400', '22', 'Sand']);
  assert.equal(r.ausserhalb.find(b => b.orderName === '#T4').name, 'Versendet');
});

test('packSuche: Bestellungen ausserhalb der Packliste nur, wenn sie mindestens so gut passen wie ein offener Umschlag', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [
    auftrag(1, '2026-10-17T09:00:00Z', 'Offen Bezahlt', [pos(11, '101')]),
    auftrag(4, '2026-10-16T09:00:00Z', 'Versendet', [pos(41, '102')], { erfuellt: 'FULFILLED' }),
  ] });
  const grau = packSuche(r.kunden, 'GRAU 22', r.ausserhalb);
  assert.deepEqual(grau.treffer, []);
  assert.deepEqual(grau.ausserhalb, [{ orderId: 'gid://shopify/Order/4', muster: ['gid://shopify/LineItem/41'] }]);
  assert.deepEqual(grau.fehlen, []);
  const sand = packSuche(r.kunden, 'sand 11', r.ausserhalb);
  assert.deepEqual(sand.treffer.map(t => t.muster), [['gid://shopify/LineItem/11']]);
  assert.deepEqual(sand.ausserhalb, [], 'das versandte Muster passt nur zu "sand" - schlechter als der offene Umschlag');
  assert.deepEqual(packSuche(r.kunden, '#T4', r.ausserhalb).ausserhalb, [{ orderId: 'gid://shopify/Order/4', muster: [] }]);
});

test('aufkleberFuerMuster: genau dieses Muster in bestellter Anzahl, nichts bei fehlender Zuordnung', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101', { menge: 2, mengeBestellt: 2 }), pos(12, '102')])] });
  const [zwei, eins] = r.kunden[0].muster;
  assert.deepEqual(aufkleberFuerMuster(zwei).map(e => e.sku), ['TV-SA', 'TV-SA']);
  assert.deepEqual(aufkleberFuerMuster(eins).map(e => e.sku), ['TV-GR']);
  assert.deepEqual(aufkleberFuerMuster({ ...eins, fehlt: ['Serie'] }), []);
  assert.deepEqual(aufkleberFuerMuster(null), []);
});

test('aufkleberFuer nurOffen: abgehakte Muster sind schon ueberklebt, die Adresse kommt immer', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, haken: { 'gid://shopify/LineItem/11': { zeit: 'x' } },
    auftraege: [auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')])] });
  const k = r.kunden[0];
  assert.deepEqual(aufkleberFuer(k).map(e => e.art || e.sku), ['TV-SA', 'TV-GR', 'adresse']);
  assert.deepEqual(aufkleberFuer(k, { nurOffen: true }).map(e => e.art || e.sku), ['TV-GR', 'adresse']);
});

test('handTreffer: offene Muster als Karten in Packreihenfolge, Eingelegtes und Gepacktes getrennt, hoechstens max', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, statusVon: () => 'geliefert',
    haken: { 'gid://shopify/LineItem/31': { zeit: 'x' } }, gepackt: { 'gid://shopify/Order/4': { zeit: 'x' } },
    auftraege: [
      auftrag(2, '2026-10-19T09:00:00Z', 'Bea Test', [pos(21, '101')]),
      auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')]),
      auftrag(3, '2026-10-18T09:00:00Z', 'Cem Test', [pos(31, '101')]),
      auftrag(4, '2026-10-16T09:00:00Z', 'Dan Test', [pos(41, '101')]),
    ] });
  const t = handTreffer(r.kunden, 'sand 11', r.ausserhalb);
  assert.deepEqual(t.karten.map(x => [x.kunde.name, x.muster.lineItemId.split('/').pop()]), [['Anna Test', '11'], ['Bea Test', '21']], 'aelteste offene Bestellung zuerst');
  assert.deepEqual(t.eingelegt.map(x => x.kunde.name).sort(), ['Cem Test', 'Dan Test']);
  const knapp = handTreffer(r.kunden, 'sand 11', r.ausserhalb, { max: 1 });
  assert.deepEqual([knapp.karten.length, knapp.mehr], [1, 1]);
  // Kunde oder Bestellnummer: alle offenen Muster dieses Umschlags.
  assert.deepEqual(handTreffer(r.kunden, '#T1').karten.map(x => x.muster.lineItemId.split('/').pop()), ['11', '12']);
  assert.deepEqual(handTreffer(r.kunden, '').karten, []);
});

test('Wartezeit zaehlt Kalendertage in Berlin, nicht volle 24 Stunden', () => {
  // Bestellt 19.10. 18:33 Berlin, angesehen 28.10. 12:29 Berlin: 9 Tage (vorher 8).
  const r = musterPackliste({ produkte, schluesselVon, jetzt: new Date('2026-10-28T11:29:00Z'), auftraege: [auftrag(1, '2026-10-19T16:33:35Z', 'Anna Test', [pos(11, '101')])] });
  assert.equal(r.kunden[0].wartetTage, 9);
  // Kurz vor Mitternacht Berlin bestellt, am naechsten Morgen: 1 Tag; am selben Abend: 0.
  const morgen = musterPackliste({ produkte, schluesselVon, jetzt: new Date('2026-10-20T06:00:00Z'), auftraege: [auftrag(1, '2026-10-19T21:30:00Z', 'Anna Test', [pos(11, '101')])] });
  assert.equal(morgen.kunden[0].wartetTage, 1);
  const abend = musterPackliste({ produkte, schluesselVon, jetzt: new Date('2026-10-19T21:50:00Z'), auftraege: [auftrag(1, '2026-10-19T21:30:00Z', 'Anna Test', [pos(11, '101')])] });
  assert.equal(abend.kunden[0].wartetTage, 0);
});

test('Muster ohne eigene Einkaufsdaten: Angaben der Meterware mit gleicher SKU, abweichende TnM-Variante stoert nicht', () => {
  const tnm = (nr, name) => ({ handle: `tnm-${nr}`, eigenschaften: {}, varianten: [{ id: `gid://shopify/ProductVariant/9${nr}`, sku: null, farbe: 'Sand (011)', einkauf: { artikelnummer: 'TV-SA', produktname: name, farbnummer: nr } }] });
  const mit = new Map([[boden.handle, boden], ['tnm-11', tnm('11', 'Lieferantenware SAND 500')]]);
  const m = musterPackliste({ produkte: mit, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101')])] }).kunden[0].muster[0];
  assert.equal(m.vorher.produktname, 'Lieferantenware SAND 400');
  assert.equal(m.vorher.farbnummer, '11');
  // Meterware mit dieser SKU ohne Angaben, Artikelnummer-Treffer widersprechen sich: unklar, nie raten.
  const leer = { ...boden, varianten: [{ ...boden.varianten[0], einkauf: {} }, boden.varianten[1]] };
  const ohne = new Map([[boden.handle, leer], ['tnm-11', tnm('11', 'A')], ['tnm-12', tnm('12', 'B')]]);
  const u = musterPackliste({ produkte: ohne, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101')])] }).kunden[0].muster[0];
  assert.equal(u.vorher.unklar, true);
  assert.equal(u.vorher.farbnummer, null);
});
