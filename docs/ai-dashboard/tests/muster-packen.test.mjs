import test from 'node:test';
import assert from 'node:assert/strict';
import { musterPackliste, aufkleberFuer, aufkleberFuerMuster, handTreffer, offeneSuche, packSchluessel, packSuche, STAND_TEXT } from '../lib/muster-packen.mjs';
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

test('Bestellungen eines Kunden vom selben Tag werden ein Umschlag, ein anderer Bestelltag ein eigener (Rueckmeldung 29.10.); aelteste Wartezeit zuerst', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [
    auftrag(3, '2026-10-20T09:00:00Z', 'Berta Beispiel', [pos(31, '102')]),
    auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101')]),
    auftrag(2, '2026-10-17T16:30:00Z', 'Anna Test', [pos(21, '102'), pos(22, '101')]),
    auftrag(4, '2026-10-19T09:00:00Z', 'Anna Test', [pos(41, '102')]),
  ] });
  assert.deepEqual(r.kunden.map(k => [k.name, k.bestellungen.map(b => b.orderName)]), [['Anna Test', ['#T1', '#T2']], ['Anna Test', ['#T4']], ['Berta Beispiel', ['#T3']]]);
  const [anna, annaSpaeter, berta] = r.kunden;
  assert.equal(anna.wartetTage, 4);
  assert.equal(anna.muster.length, 3);
  assert.equal(anna.aufkleber, 4, 'drei Muster plus Adresse');
  assert.equal(r.offen, 3);
  assert.deepEqual(aufkleberFuer(anna).map(e => e.art || e.sku), ['TV-SA', 'TV-GR', 'TV-SA', 'adresse']);
  assert.deepEqual(anna.adressAufkleber.bestellungen, ['#T1', '#T2']);
  // Der spaetere Umschlag wartet fuer sich, mit eigener Adresse und Klaermarke; beide nennen einander.
  assert.equal(annaSpaeter.wartetTage, 2);
  assert.deepEqual(annaSpaeter.adressAufkleber.bestellungen, ['#T4']);
  assert.notEqual(anna.schluessel, annaSpaeter.schluessel);
  assert.deepEqual(anna.weitere, [{ packSchluessel: annaSpaeter.packSchluessel, bestellungen: ['#T4'], seit: '2026-10-19T09:00:00Z', bereich: 'warten' }]);
  assert.deepEqual(annaSpaeter.weitere.map(w => w.bestellungen), [['#T1', '#T2']]);
  assert.deepEqual(berta.weitere, []);
  // Der Tag wechselt in Berlin, nicht in UTC: 23:30 Z am 17.10. ist hier schon der 18.10.
  const nacht = musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101')]), auftrag(2, '2026-10-17T23:30:00Z', 'Anna Test', [pos(21, '102')])] });
  assert.equal(nacht.kunden.length, 2);
});

test('ein ueber mehrere Tage gepackter oder vorbereiteter Umschlag bleibt zusammen, eine dritte Bestellung kommt daneben', () => {
  const a1 = auftrag(1, '2026-10-15T09:00:00Z', 'Anna Test', [pos(11, '101')]);
  const a2 = auftrag(2, '2026-10-17T09:00:00Z', 'Anna Test', [pos(21, '102')]);
  const a3 = auftrag(3, '2026-10-19T09:00:00Z', 'Anna Test', [pos(31, '101')]);
  const pk = packSchluessel([a1.id, a2.id]);
  const nummern = r => r.kunden.map(k => k.bestellungen.map(b => b.orderName)).sort((x, y) => x[0].localeCompare(y[0]));
  assert.deepEqual(nummern(musterPackliste({ produkte, schluesselVon, jetzt, auftraege: [a1, a2, a3] })), [['#T1'], ['#T2'], ['#T3']], 'ohne Marke je Tag ein Umschlag');
  for (const marke of ['gepackt', 'gedruckt']) {
    const r = musterPackliste({ produkte, schluesselVon, jetzt, [marke]: { [pk]: { zeit: '2026-10-18T10:00:00Z', von: 'Laden' } }, auftraege: [a1, a2, a3] });
    assert.deepEqual(nummern(r), [['#T1', '#T2'], ['#T3']], marke);
    assert.ok(r.kunden.find(k => k.packSchluessel === pk)[marke], `${marke} bleibt am Umschlag`);
  }
});

test('Klaermarke je Empfaenger (Stand bis 29.10.) gilt dem Umschlag, dessen Muster fehlen; Freigabe nur fuer diesen Umschlag', () => {
  const a1 = auftrag(1, '2026-10-11T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')]);
  const a2 = auftrag(2, '2026-10-20T09:00:00Z', 'Anna Test', [pos(21, '101')]);
  const haken = Object.fromEntries(a1.positionen.map(p => [p.lineItemId, { zeit: '2026-10-21T08:00:00Z' }]));
  const [erster] = musterPackliste({ produkte, schluesselVon, jetzt, haken, auftraege: [a1] }).kunden;
  const empfaenger = erster.schluessel.replace(/\|tag:.*$/, '');
  // Marke aus der Zeit, als beide Bestellungen ein Umschlag waren: es fehlten die Muster der zweiten.
  const klaeren = { [empfaenger]: { zeit: '2026-10-21T09:00:00Z', von: 'Laden', fehlt: [a2.positionen[0].lineItemId], notiz: 'zweite Lieferung fehlt' } };
  const r = musterPackliste({ produkte, schluesselVon, jetzt, haken, klaeren, auftraege: [a1, a2] });
  const [u1, u2] = r.kunden;
  assert.equal(u1.bereich, 'packen', 'alle Muster drin - die Marke betrifft diesen Umschlag nicht');
  assert.equal(u1.klaeren, null);
  assert.equal(u1.altvermerk, null);
  assert.equal(u2.bereich, 'klaeren');
  assert.equal(u2.klaeren.notiz, 'zweite Lieferung fehlt');
  assert.deepEqual(u2.klaeren.fehlt, [a2.positionen[0].lineItemId]);
  assert.equal(u2.altvermerk, null, 'alle fehlenden Muster liegen hier: eigene Marke, kein Fremdvermerk');
  const frei = musterPackliste({ produkte, schluesselVon, jetzt, haken, klaeren: { ...klaeren, [u2.schluessel]: { geklaert: true } }, auftraege: [a1, a2] });
  assert.deepEqual(frei.kunden.map(k => [k.bereich, k.klaeren]), [['packen', null], ['warten', null]]);
  // Ohne Positionsangabe gilt die Marke beiden Umschlaegen als fremde Marke mit Vermerk.
  const ohne = musterPackliste({ produkte, schluesselVon, jetzt, haken, klaeren: { [empfaenger]: { notiz: 'gemeinsam' } }, auftraege: [a1, a2] });
  assert.ok(ohne.kunden.every(k => k.bereich === 'klaeren' && /gemeinsam/.test(k.altvermerk)));
  // Ein einzelner Umschlag nimmt die Empfaengermarke als eigene, ohne Vermerk.
  const allein = musterPackliste({ produkte, schluesselVon, jetzt, klaeren: { [empfaenger]: { notiz: 'nur einer', fehlt: [] } }, auftraege: [a1] });
  assert.equal(allein.kunden[0].klaeren.notiz, 'nur einer');
  assert.equal(allein.kunden[0].altvermerk, null);
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

test('gepackt gilt nur fuer genau diese Bestellungen; ein anderer Tag wird ein eigener Umschlag, derselbe Tag oeffnet den Umschlag wieder', () => {
  const a1 = auftrag(1, '2026-10-17T09:00:00Z', 'Anna Test', [pos(11, '101')]);
  const a2 = auftrag(2, '2026-10-20T09:00:00Z', 'Anna Test', [pos(21, '101')]);
  const a3 = auftrag(3, '2026-10-17T15:00:00Z', 'Anna Test', [pos(31, '102')]);
  const pk = packSchluessel([a1.id]);
  const gepackt = { [pk]: { zeit: '2026-10-21T10:00:00Z', von: 'Laden' } };
  const vorher = musterPackliste({ produkte, schluesselVon, jetzt, gepackt, auftraege: [a1] });
  assert.deepEqual(vorher.kunden[0].gepackt, { zeit: '2026-10-21T10:00:00Z', von: 'Laden' });
  assert.equal(vorher.offen, 0);
  // Anderer Tag: der gepackte Umschlag bleibt gepackt, die neue Bestellung bekommt ihren eigenen.
  const spaeter = musterPackliste({ produkte, schluesselVon, jetzt, gepackt, auftraege: [a1, a2] });
  assert.deepEqual(spaeter.kunden.map(k => [k.bestellungen.map(b => b.orderName), !!k.gepackt]), [[['#T2'], false], [['#T1'], true]]);
  assert.equal(spaeter.offen, 1);
  assert.deepEqual(spaeter.kunden[0].weitere.map(w => [w.bestellungen, w.bereich]), [[['#T1'], 'gepackt']]);
  // Selber Tag: ein Umschlag fuer beide, die alte Packmarke passt nicht mehr.
  const selberTag = musterPackliste({ produkte, schluesselVon, jetzt, gepackt, auftraege: [a1, a3] });
  assert.equal(selberTag.kunden.length, 1);
  assert.equal(selberTag.kunden[0].gepackt, null);
  assert.equal(selberTag.offen, 1);
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

test('Direktversand (ueber kunde, #1049): kein rotes Ueberfaellig, nur der Hinweis am Umschlag', () => {
  const eintrag = { status: 'bestellt', bestelltAm: '2026-10-01T07:00:00.000Z', bestelltVon: 'Inhaber' };
  const liste = ueber => musterPackliste({ produkte, schluesselVon, jetzt, eintragVon: () => ({ ...eintrag, ueber }),
    auftraege: [auftrag(5, '2026-09-30T08:00:00Z', 'Eva Test', [pos(51, '101')])] }).kunden[0];
  const ohne = liste(undefined);
  assert.equal(ohne.muster[0].ampel.grund, 'ueberfaellig', '20 Tage beim Lieferanten ohne Vermerk: rot');
  const mit = liste('kunde');
  assert.equal(mit.muster[0].direkt, true);
  assert.equal(mit.muster[0].ampel.stufe, null);
  assert.deepEqual([mit.ampel.stufe, mit.ampel.grund], ['gelb', 'pruefen']);
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

test('offeneSuche: ein fertiger Kunde mit besserem Treffer verdraengt den offenen Umschlag nicht mehr', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, gepackt: { 'gid://shopify/Order/2': { zeit: 'x' } }, auftraege: [
    auftrag(1, '2026-10-17T09:00:00Z', 'Offen Bezahlt', [pos(11, '101')]),
    // Gepackt bzw. versandt und mit beiden Woertern ein besserer Treffer als der offene Umschlag.
    auftrag(2, '2026-10-16T09:00:00Z', 'Schon Gepackt', [pos(21, '101'), pos(22, '102')]),
    auftrag(4, '2026-10-15T09:00:00Z', 'Versendet', [pos(41, '102')], { erfuellt: 'FULFILLED' }),
    auftrag(3, '2026-10-14T09:00:00Z', 'Storniert', [pos(31, '101')], { storniert: true }),
  ] });
  const name = t => r.kunden.find(k => k.packSchluessel === t.packSchluessel).name;
  assert.equal(r.kunden.find(k => k.name === 'Schon Gepackt').bereich, 'gepackt');
  // Bisher: gezeigt wird nur der beste Treffer - der gepackte Kunde und die versandte Bestellung.
  const vorher = packSuche(r.kunden, 'sand grau', r.ausserhalb);
  assert.deepEqual([vorher.treffer.map(name), vorher.ausserhalb.map(b => b.orderId)], [['Schon Gepackt'], ['gid://shopify/Order/4']]);
  const s = offeneSuche(r.kunden, 'sand grau', r.ausserhalb);
  assert.deepEqual(s.treffer.map(name), ['Offen Bezahlt']);
  assert.deepEqual(s.ausserhalb.map(b => b.orderId), ['gid://shopify/Order/3'], 'storniert bleibt als Warnung in der Suche');
  assert.equal(s.fertig, 2, 'gepackt und versandt passen auch');
  const nurFertig = offeneSuche(r.kunden, 'grau 22', r.ausserhalb);
  assert.deepEqual([nurFertig.treffer, nurFertig.ausserhalb, nurFertig.fertig], [[], [], 2]);
  // Auf Wunsch kommen die Fertigen dazu - hinter die offenen, verdraengen koennen sie auch dann nichts.
  const alle = offeneSuche(r.kunden, 'sand grau', r.ausserhalb, { mitFertigen: true });
  assert.deepEqual(alle.treffer.map(name), ['Offen Bezahlt', 'Schon Gepackt']);
  assert.deepEqual(alle.ausserhalb.map(b => b.orderId), ['gid://shopify/Order/3', 'gid://shopify/Order/4']);
  assert.equal(alle.fertig, 0);
});

test('offeneSuche zaehlt je Bestellung: Umschlag mit zwei Bestellungen zaehlt zwei, offen Gezeigtes nicht', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt, gepackt: { 'gid://shopify/Order/2,gid://shopify/Order/5': { zeit: 'x' } }, auftraege: [
    auftrag(2, '2026-10-16T09:00:00Z', 'Zwei Bestellungen', [pos(21, '102')]),
    auftrag(5, '2026-10-17T09:00:00Z', 'Zwei Bestellungen', [pos(51, '102')], { kundeKey: 'k:Zwei Bestellungen' }),
  ] });
  assert.deepEqual(r.kunden.map(k => [k.bereich, k.bestellungen.length]), [['gepackt', 2]]);
  assert.equal(offeneSuche(r.kunden, 'grau 22', r.ausserhalb).fertig, 2);
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

test('handTreffer: offene Muster als Karten in Packreihenfolge, Eingelegtes getrennt, Gepacktes nur auf Wunsch, hoechstens max', () => {
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
  // Gepackt ist fertig (Mitarbeiter 29.10.): Dan zaehlt nur als ausgeblendeter Treffer.
  assert.deepEqual(t.eingelegt.map(x => x.kunde.name), ['Cem Test']);
  assert.equal(t.fertig, 1);
  assert.deepEqual(handTreffer(r.kunden, 'sand 11', r.ausserhalb, { mitFertigen: true }).eingelegt.map(x => x.kunde.name).sort(), ['Cem Test', 'Dan Test']);
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

test('Grund der Musterautomatik nur bei "noch nicht bestellt"', () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    statusVon: (_, li) => ({ 'gid://shopify/LineItem/12': 'bestellt' })[li] || null,
    automatikGrundVon: () => 'Testgrund fehlt',
    auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')])] });
  const [offen, bestellt] = r.kunden[0].muster;
  assert.equal(offen.automatikGrund, 'Testgrund fehlt');
  assert.equal(bestellt.automatikGrund, null);
});

test('Variante ohne Einkaufsangaben behaelt Farbbild und Herstellersuche, macht aber nichts mehrdeutig (Review 29.10.)', () => {
  const p = { handle: 'ohne-einkauf', titel: 'Ohne Einkauf', varianten: [
    { sku: 'OE-1', farbe: 'Sand', bild: 'https://cdn.example/sand.jpg', einkauf: {} },
    { sku: 'OE-2', farbe: 'Grau', bild: 'https://cdn.example/grau.jpg', einkauf: { hersteller: 'Testhersteller' } },
    { sku: 'OE-3', farbe: 'Rot', einkauf: {} },
    // Dieselbe SKU einmal ohne, einmal mit Angaben: die Angaben gelten, kein "mehrdeutig".
    { sku: 'OE-4', farbe: 'Blau', bild: 'https://cdn.example/blau.jpg', einkauf: {} },
    { sku: 'OE-4', farbe: 'Blau', einkauf: { produktname: 'Lieferantenname Blau', farbnummer: '44' } },
    // Eigene Variante ohne Angaben: die Variante mit dieser SKU als Artikelnummer liefert sie, das Bild bleibt.
    { sku: 'OE-5', farbe: 'Gelb', bild: 'https://cdn.example/gelb.jpg', einkauf: {} },
    { sku: 'OE-5-BREIT', farbe: 'Gelb', einkauf: { artikelnummer: 'OE-5', produktname: 'Lieferantenname Gelb', farbnummer: '55' } },
  ] };
  const zeile = (sku, li) => ({ lineItemId: `gid://shopify/LineItem/${li}`, istMuster: true, titel: 'Muster', farbe: sku, menge: 1, mengeBestellt: 1, sku: `M-${sku}`, handle: 'muster-x', musterQuelle: { sku, produktHandle: p.handle } });
  const eigene = new Map([[p.handle, p]]);
  const { kunden } = musterPackliste({ produkte: eigene, schluesselVon, jetzt, auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', ['OE-1', 'OE-2', 'OE-3', 'OE-4', 'OE-5'].map((s, i) => zeile(s, i + 1)))] });
  const je = Object.fromEntries(kunden[0].muster.map(m => [m.bestellt.farbe, m]));
  assert.equal(je['OE-1'].bild, 'https://cdn.example/sand.jpg');
  assert.equal(je['OE-2'].bild, 'https://cdn.example/grau.jpg');
  assert.equal(je['OE-2'].vorher.hersteller, 'Testhersteller');
  assert.equal(je['OE-3'].vorher, null, 'gar nichts bekannt: wie bisher');
  assert.equal(je['OE-4'].vorher.unklar, undefined);
  assert.equal(je['OE-4'].vorher.farbnummer, '44');
  assert.equal(je['OE-4'].bild, 'https://cdn.example/blau.jpg');
  assert.equal(je['OE-5'].vorher.farbnummer, '55');
  assert.equal(je['OE-5'].bild, 'https://cdn.example/gelb.jpg');
  assert.equal(offeneSuche(kunden, 'Testhersteller').treffer.length, 1);
});

test('Erledigt: Versanddatum aus dem Auftragsfluss; teilweise erledigte Bestellung ist markiert und bleibt in der Suche (Review 29.10.)', () => {
  const eintrag = (o, l) => ({
    'gid://shopify/LineItem/11': { status: 'raus', rausAm: '2026-10-20T08:00:00Z' },
    'gid://shopify/LineItem/21': { status: 'raus', rausAm: '2026-10-19T08:00:00Z', erledigtAm: null },
    'gid://shopify/LineItem/22': { status: 'erledigt', rausAm: '2026-10-19T08:00:00Z', erledigtAm: '2026-10-21T08:00:00Z' },
  }[l] || null);
  const r = musterPackliste({ produkte, schluesselVon, jetzt, eintragVon: eintrag, auftraege: [
    auftrag(1, '2026-10-01T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')]),
    auftrag(2, '2026-10-02T09:00:00Z', 'Berta Beispiel', [pos(21, '101'), pos(22, '102')]),
  ] });
  const je = Object.fromEntries(r.ausserhalb.map(b => [b.orderName, b]));
  assert.equal(je['#T1'].teilweise, true, 'Muster 12 liegt noch in der Packliste');
  assert.equal(je['#T1'].erledigtAm, '2026-10-20T08:00:00Z');
  assert.equal(je['#T2'].teilweise, false);
  assert.equal(je['#T2'].erledigtAm, '2026-10-21T08:00:00Z', 'der letzte Schritt zaehlt');
  assert.deepEqual(r.kunden.map(k => k.bestellungen[0].orderName), ['#T1']);
});

test('Gesperrtes Muster: Umschlag zu klaeren, kein Aufkleber im Stapeldruck; was schon da ist, zaehlt nicht als gesperrt (w-210)', () => {
  const sperreVon = p => (p.lineItemId.endsWith('/11') || p.lineItemId.endsWith('/31') ? { imShop: true, seit: '2026-10-28T09:00:00Z' } : p.lineItemId.endsWith('/41') ? { imShop: false, seit: '2026-10-28T09:00:00Z' } : null);
  const haken = { 'gid://shopify/LineItem/31': { zeit: '2026-10-29T09:00:00Z' } };
  const r = musterPackliste({ produkte, schluesselVon, jetzt, sperreVon, haken, statusVon: (o, l) => (l.endsWith('/51') ? 'geliefert' : 'bestellt'), auftraege: [
    auftrag(1, '2026-10-15T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102')], { details: { kunde: { name: 'Anna Test', email: 'anna@example.invalid' }, lieferadresse: adresse('Anna Test') } }),
    auftrag(3, '2026-10-15T09:00:00Z', 'Carl Haken', [pos(31, '101')]),
    auftrag(4, '2026-10-15T09:00:00Z', 'Dora Offen', [pos(41, '101')]),
    auftrag(5, '2026-10-15T09:00:00Z', 'Emil Da', [pos(51, '101')]),
    auftrag(6, '2026-10-15T09:00:00Z', 'Frei Test', [pos(61, '101')]),
  ] });
  const je = Object.fromEntries(r.kunden.map(k => [k.name, k]));
  assert.equal(je['Anna Test'].bereich, 'klaeren');
  assert.deepEqual(je['Anna Test'].muster.map(m => !!m.gesperrt), [true, false]);
  assert.equal(je['Anna Test'].email, 'anna@example.invalid');
  assert.equal(je['Carl Haken'].muster[0].gesperrt, null, 'abgehakt: es ist doch gekommen');
  assert.equal(je['Carl Haken'].bereich, 'packen');
  assert.deepEqual(je['Dora Offen'].muster[0].gesperrt, { imShop: false, seit: '2026-10-28T09:00:00Z' }, 'auch eine noch nicht im Shop bestaetigte Sperre kommt nicht');
  assert.equal(je['Emil Da'].muster[0].gesperrt, null);
  assert.equal(je['Frei Test'].bereich, 'warten');
  assert.equal(je['Frei Test'].email, undefined, 'Mailadresse nur, wo sie gebraucht wird');
  assert.deepEqual(aufkleberFuer(je['Anna Test'], { nurOffen: true }).map(e => e.art || e.sku), ['TV-GR', 'adresse'], 'kein Aufkleber fuer ein Muster, das nicht kommt');
  assert.deepEqual(aufkleberFuer(je['Anna Test']).map(e => e.art || e.sku), ['TV-SA', 'TV-GR', 'adresse'], 'erneut alles drucken bleibt vollstaendig');
});

test('Ampel (06.11.): jedes Muster und jeder Umschlag traegt sie, gerechnet mit jetzt des Servers', () => {
  const eintraege = {
    'gid://shopify/LineItem/11': { status: 'bestellt', bestelltAm: '2026-10-05T08:00:00Z' },            // 16 Tage: rot
    'gid://shopify/LineItem/12': { status: 'geliefert', bestelltAm: '2026-10-01T08:00:00Z' },           // da: ruhig
    'gid://shopify/LineItem/21': { status: 'bestellt', bestelltAm: '2026-10-13T08:00:00Z' },            // 8 Tage: gelb
    'gid://shopify/LineItem/31': { status: 'bestellt', bestelltAm: '2026-10-19T08:00:00Z' },            // 2 Tage: ruhig
    'gid://shopify/LineItem/41': { status: 'bestellt', bestelltAm: '2026-10-19T08:00:00Z', beschaffung: { liefertermin: '2026-10-20' } },
  };
  const faelle = { 'gid://shopify/LineItem/51': { grund: 'Farbnummer fehlt', seit: '2026-10-16T08:00:00Z' }, 'gid://shopify/LineItem/61': { grund: 'Farbnummer fehlt', seit: '2026-10-21T08:00:00Z' } };
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    eintragVon: (_, li) => eintraege[li] || null,
    automatikFallVon: (_, li) => faelle[li] || null,
    versandProbleme: { [packSchluessel(['gid://shopify/Order/7'])]: { problem: 'Shopify nicht erreicht' } },
    gepackt: { [packSchluessel(['gid://shopify/Order/8'])]: { zeit: '2026-10-20T10:00:00Z' } },
    auftraege: [
      auftrag(1, '2026-10-02T09:00:00Z', 'Anna Rot', [pos(11, '101'), pos(12, '102')]),
      auftrag(2, '2026-10-10T09:00:00Z', 'Berta Gelb', [pos(21, '101')]),
      auftrag(3, '2026-10-19T09:00:00Z', 'Carl Ruhig', [pos(31, '101')]),
      auftrag(4, '2026-10-19T09:00:00Z', 'Dora Termin', [pos(41, '101')]),
      auftrag(5, '2026-10-15T09:00:00Z', 'Emil Haengt', [pos(51, '101')]),
      auftrag(6, '2026-10-21T07:00:00Z', 'Frieda Neu', [pos(61, '101')]),
      auftrag(7, '2026-10-19T09:00:00Z', 'Gerd Versand', [pos(71, '101')]),
      auftrag(8, '2026-10-18T09:00:00Z', 'Hanna Altfall', [pos(81, '101')]),
    ] });
  const je = Object.fromEntries(r.kunden.map(k => [k.name, k]));
  const kurz = a => [a.stufe, a.wort];
  assert.deepEqual(je['Anna Rot'].muster.map(m => kurz(m.ampel)), [['rot', 'Überfällig · 16 Tage beim Lieferanten'], [null, '']]);
  assert.deepEqual(kurz(je['Anna Rot'].ampel), ['rot', 'Überfällig · 16 Tage beim Lieferanten'], 'die dringendste Stufe seiner Muster');
  assert.deepEqual(kurz(je['Berta Gelb'].ampel), ['gelb', 'Nachhaken · 8 Tage beim Lieferanten']);
  assert.deepEqual(kurz(je['Carl Ruhig'].ampel), [null, ''], 'wartet 2 Tage: kein Befund mehr (frueher Bernstein ab 2 Tagen)');
  assert.equal(je['Dora Termin'].muster[0].liefertermin, '2026-10-20');
  assert.deepEqual(kurz(je['Dora Termin'].ampel), ['rot', 'Termin 20.10. vorbei']);
  assert.equal(je['Emil Haengt'].muster[0].automatikGrund, 'Farbnummer fehlt', 'Grund aus dem Klaerfall');
  assert.equal(je['Emil Haengt'].muster[0].haengtWerktage, 3, 'Fr 16.10. bis Mi 21.10.: Mo, Di, Mi');
  assert.deepEqual(kurz(je['Emil Haengt'].ampel), ['rot', 'Hängt · 3 Werktage']);
  assert.equal(je['Frieda Neu'].muster[0].haengtWerktage, undefined, 'seit heute: noch kein Haengen');
  assert.deepEqual(kurz(je['Frieda Neu'].ampel), ['gelb', 'Nicht bestellt']);
  assert.deepEqual(kurz(je['Gerd Versand'].ampel), ['rot', 'Versand nicht eingetragen']);
  assert.equal(je['Gerd Versand'].ampel.titel, 'Shopify nicht erreicht');
  assert.deepEqual([je['Hanna Altfall'].bereich, ...kurz(je['Hanna Altfall'].ampel)], ['gepackt', 'rot', 'Nicht eingetragen']);
  // Ohne Fall-Lieferant bleibt der alte Weg (nur Grund, kein Beginn): ohne Haengen zaehlt die Kundenbestellung.
  const alt = musterPackliste({ produkte, schluesselVon, jetzt, automatikGrundVon: () => 'Testgrund', auftraege: [auftrag(1, '2026-10-02T09:00:00Z', 'Anna Test', [pos(11, '101')]), auftrag(2, '2026-10-19T09:00:00Z', 'Berta Test', [pos(21, '101')])] });
  assert.deepEqual(alt.kunden.map(k => [k.muster[0].automatikGrund, k.muster[0].ampel.stufe]), [['Testgrund', 'rot'], ['Testgrund', 'gelb']], '19 Tage rot, 2 Tage gelb');
});

test('Nie bestellt, ohne Musterautomatik: ab 7 Tagen rot wie das To-do auf Heute (Review #1975)', () => {
  const stichtag = new Date('2026-11-06T10:00:00Z');
  const r = musterPackliste({ produkte, schluesselVon, jetzt: stichtag, auftraege: [
    auftrag(1, '2026-10-26T09:00:00Z', 'Anna Lange', [pos(11, '101')]),
    auftrag(2, '2026-10-30T09:00:00Z', 'Berta Sieben', [pos(21, '101')]),
    auftrag(3, '2026-10-31T09:00:00Z', 'Carl Sechs', [pos(31, '101')]),
  ] });
  const je = Object.fromEntries(r.kunden.map(k => [k.name, k]));
  const kurz = a => [a.stufe, a.wort];
  assert.equal(je['Anna Lange'].muster[0].offenTage, 11);
  assert.deepEqual(kurz(je['Anna Lange'].muster[0].ampel), ['rot', 'Nicht bestellt · 11 Tage'], 'Muster rot');
  assert.deepEqual(kurz(je['Anna Lange'].ampel), ['rot', 'Nicht bestellt · 11 Tage'], 'Umschlag rot');
  assert.deepEqual(kurz(je['Berta Sieben'].ampel), ['rot', 'Nicht bestellt · 7 Tage']);
  assert.deepEqual(kurz(je['Carl Sechs'].ampel), ['gelb', 'Nicht bestellt'], '6 Tage: noch gelb');
  // Haengt das Muster bei der Automatik, gilt deren Grund und keine zweite Zaehlung.
  const mitFall = musterPackliste({ produkte, schluesselVon, jetzt: stichtag,
    automatikFallVon: () => ({ grund: 'Farbnummer fehlt', seit: '2026-11-02T08:00:00Z' }),
    auftraege: [auftrag(1, '2026-10-26T09:00:00Z', 'Anna Lange', [pos(11, '101')])] });
  const m = mitFall.kunden[0].muster[0];
  assert.deepEqual([m.haengtWerktage, m.offenTage, m.ampel.wort], [4, undefined, 'Hängt · 4 Werktage']);
});

test('Nachbestellung: nachtraeglich hinzugefuegtes Muster traegt das Datum der Bestellbearbeitung (Wunsch 06.11.)', async () => {
  const r = musterPackliste({ produkte, schluesselVon, jetzt,
    auftraege: [auftrag(1, '2026-10-20T09:00:00Z', 'Anna Test', [pos(11, '101'), pos(12, '102', { nachbestelltAm: '2026-10-21T13:12:22Z' }), pos(13, '101', { nachbestelltAm: 'kaputt' })])] });
  assert.deepEqual(r.kunden[0].muster.map(m => m.nachbestelltAm), [null, '2026-10-21T13:12:22Z', null]);
});
