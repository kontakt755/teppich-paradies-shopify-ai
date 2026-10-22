import test from 'node:test';
import assert from 'node:assert/strict';
import { musterPackliste, aufkleberFuer, packSchluessel, STAND_TEXT } from '../lib/muster-packen.mjs';
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
  assert.deepEqual(m1.vorher, { produktname: 'Lieferantenware SAND 400', farbnummer: '11', url: 'https://lieferant-a.example/sand' });
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

test('Adresslayout: jede Zeile passt in die Druckbreite, auch lange Orte und mehrere Bestellungen', () => {
  const mass = (t, g, fett) => t.length * g * (fett ? 0.6 : 0.55);
  const e = adressEtikett(adresse('Anna-Katharina Testfrau-Beispiel', { strasse: 'Lange-Beispielstraße 115, Gartenhaus', plz: '00000', ort: 'Bad Musterstadt-Langenachbarort' }), ['#T1040', '#T1041', '#T1042']);
  for (const format of Object.values(ETIKETT_FORMATE)) {
    const { texte, linien, qr } = adressLayout(e, mass, format);
    assert.equal(qr, null);
    assert.ok(linien.length === 1);
    assert.deepEqual(texte.slice(0, 2).map(t => t.text), [...ABSENDER]);
    for (const t of texte) {
      assert.ok(t.x >= format.rand && t.x + mass(t.text, t.groesse, t.fett) <= format.breite - format.rand + 1, `${format.format}: ${t.text} zu breit`);
      assert.ok(t.y >= 0 && t.y + t.groesse <= format.hoehe, `${format.format}: ${t.text} ausserhalb`);
    }
    assert.ok(texte.some(t => t.text === 'Bestellung #T1040, #T1041, #T1042'));
  }
});
