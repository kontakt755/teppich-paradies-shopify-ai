import test from 'node:test';
import assert from 'node:assert/strict';
import { tedAbfrage, ausTed, ausOcds, ausRss, imUmkreis, bereinigen, neuSeit } from '../lib/ausschreibungen.mjs';

// Nur erfundene Daten.
const release = (cpv, region, titel = 'Bodenbelag Kita') => ({
  ocid: `ocds-${cpv}-${region}`, buyer: { id: 'K1', name: 'Testbau GmbH' },
  parties: [{ id: 'K1', address: { locality: 'Oranienburg', region } }],
  tender: { title: titel, tenderPeriod: { endDate: '2026-11-02T10:00:00+01:00' }, items: [{ classification: { id: cpv }, deliveryAddress: { region } }] },
});

test('TED-Abfrage traegt CPV, Regionen und Fristbeginn', () => {
  const q = tedAbfrage('2026-10-19').query;
  assert.match(q, /454321\*/);
  assert.match(q, /DE40A/);
  assert.match(q, />=20261019$/);
});

test('TED-Antwort: deutscher Titel bevorzugt', () => {
  const [t] = ausTed({ notices: [{ 'publication-number': '1-2026', 'notice-title': { hun: 'x', deu: 'Boden' }, 'buyer-name': { deu: ['Amt'] }, 'deadline-receipt-tender-date-lot': ['2026-11-01+01:00'] }] });
  assert.equal(t.titel, 'Boden');
  assert.equal(t.auftraggeber, 'Amt');
  assert.equal(t.frist, '2026-11-01');
});

test('OCDS: nur passende CPV im Umkreis', () => {
  assert.equal(ausOcds(release('45432100-5', 'DE40A')).ort, 'Oranienburg');
  assert.equal(ausOcds(release('72000000', 'DE40A', 'Software Kita')), null);
  assert.ok(ausOcds(release('45000000', 'DE40A')), 'Sammel-CPV: der Titel entscheidet');
  assert.equal(ausOcds(release('45432100', 'DEB35')), null);
});

test('OCDS: nationale Bekanntmachung mit grober Region und PLZ im Ort', () => {
  const national = (ort, extra = {}) => ({
    ocid: `ocds-${ort}`, tag: ['tender'], buyer: { name: 'Testamt' }, parties: [{ name: 'Testamt' }],
    tender: { title: 'Schule, Maler- und Bodenbelagsarbeiten', procurementMethodDetails: 'Public announcement',
      items: [{ classification: { id: '45442100-8' }, deliveryAddress: { locality: ort, region: 'DE4' } }], ...extra },
  });
  const t = ausOcds(national('16515 Oranienburg'));
  assert.equal(t.ort, '16515 Oranienburg');
  assert.equal(t.verfahren, 'Öffentliche Ausschreibung');
  assert.equal(t.frist, null);
  assert.equal(ausOcds(national('03050 Cottbus')), null, 'Lausitz liegt nicht im Umkreis');
  assert.ok(ausOcds(national('Musterdorf')), 'ohne PLZ lieber zeigen');
  assert.equal(ausOcds(national('16515 Oranienburg', { title: 'Schule, Malerarbeiten' })), null, 'weder CPV noch Titel passen');
  assert.equal(ausOcds({ ...national('16515 Oranienburg'), tag: ['award'] }), null, 'Zuschlag ist keine Ausschreibung');
  assert.equal(ausOcds({ ...national('16515 Oranienburg'), tag: ['planning'] }), null, 'Vorinformation ist noch keine Ausschreibung');
});

test('Links aus den Feeds: nur http(s), javascript: & Co. fallen weg', () => {
  const mitDoks = documents => { const r = release('45432100', 'DE40A'); r.tender.documents = documents; return ausOcds(r); };
  assert.equal(mitDoks([{ url: 'javascript:alert(1)' }]).link, null);
  assert.equal(mitDoks([{ url: ' JavaScript:alert(1)' }, { url: 'data:text/html,x' }]).link, null);
  assert.equal(mitDoks([{ url: 'javascript:alert(1)' }, { url: 'https://vergabe.example/doku' }]).link, 'https://vergabe.example/doku');
  assert.equal(mitDoks([{ url: 'https://vergabe.example/a' }]).link, 'https://vergabe.example/a');
  assert.equal(mitDoks(undefined).link, null);
  const ted = deu => ausTed({ notices: [{ 'publication-number': '1-2026', links: { html: { DEU: deu } } }] })[0].link;
  assert.equal(ted('javascript:alert(1)'), 'https://ted.europa.eu/de/notice/-/detail/1-2026');
  assert.equal(ted('https://ted.europa.eu/de/notice/-/detail/1-2026'), 'https://ted.europa.eu/de/notice/-/detail/1-2026');
});

test('bereinigen und neuSeit', () => {
  const a = { id: 'a', titel: 'X', auftraggeber: 'Y', frist: '2026-11-01' };
  const alt = { id: 'b', titel: 'Z', auftraggeber: 'Y', frist: '2026-10-01' };
  const doppelt = { ...a, id: 'c' };
  assert.deepEqual(bereinigen([a, alt, doppelt], '2026-10-19').map(t => t.id), ['a']);
  assert.deepEqual(neuSeit([a], [{ id: 'a' }]), []);
  // Doppel ohne Auftraggeber (Berliner Feed) faellt zusammen und ergaenzt die fehlende Frist.
  const [e, e2] = bereinigen([{ id: 'o', titel: 'Boden Kita', auftraggeber: 'Amt', frist: null }, { id: 'r', titel: 'boden kita', auftraggeber: '', frist: '2026-11-20', verfahren: 'UVgO' }, { id: 'u', titel: 'Boden  Kita', auftraggeber: 'Amt\n', frist: null }], '2026-10-19');
  assert.equal(e2, undefined);
  assert.deepEqual([e.id, e.frist, e.verfahren], ['o', '2026-11-20', 'UVgO']);
});

test('Umkreis: NUTS-3 genau, Berlin als Land, sonst PLZ', () => {
  assert.equal(imUmkreis('DE40A', ''), true);
  assert.equal(imUmkreis('DE402', '16515'), false);
  assert.equal(imUmkreis('DE3', ''), true);
  assert.equal(imUmkreis('DE4', '16515'), true);
  assert.equal(imUmkreis('DE4', '03046'), false);
  assert.equal(imUmkreis('', '16515'), true);
  assert.equal(imUmkreis('', '80331'), false);
  assert.equal(imUmkreis('', ''), false);
});

test('OCDS: Lieferung zaehlt, Fliesen nicht; Wert und Umfang aus den Losen', () => {
  const mit = (cpv, titel) => ausOcds({ ocid: 'x', tag: ['tender'], buyer: { name: 'Testamt' },
    tender: { title: titel, items: [{ classification: { id: cpv }, deliveryAddress: { locality: '16515 Oranienburg', region: 'DE4' } }],
      lots: [{ title: titel, description: 'ca. 180 m2 Linoleum', value: { amount: 12000 } }] } });
  assert.deepEqual([mit('39531400-7', 'Lieferung').wert, mit('44112200-0', 'Lieferung').umfang], [12000, 'ca. 180 m2 Linoleum']);
  assert.equal(mit('45431000-7', 'Fliesenarbeiten'), null);
});

test('RSS bund.de und Berlin: Suchwort im Titel, PLZ im Umkreis, Frist und Verfahren', () => {
  const bund = `<rss><channel><item><title>Rathaus - Bodenbelagsarbeiten</title><link>https://bund.example/a.html#track=feed</link>
    <description><![CDATA[ Erf&uuml;llungsort: <strong>16515 Oranienburg</strong><br />Vergabestelle: <strong>Stadt M&#252;sterstadt</strong><br />
    <br />Angebotsfrist:  <strong>25.11.2026 09:03</strong> <br />Veröffentlichungsende:  <strong>24.11.2026 23:59</strong>]]></description></item>
    <item><title>Bodenbelagsarbeiten</title><link>https://bund.example/b.html</link><description><![CDATA[Erf&uuml;llungsort: <strong>80331 München</strong>]]></description></item>
    <item><title>Tischlerarbeiten</title><link>https://bund.example/c.html</link><description><![CDATA[Erf&uuml;llungsort: <strong>16515 Oranienburg</strong>]]></description></item></channel></rss>`;
  const [t, ...rest] = ausRss(bund, 'service.bund.de');
  assert.equal(rest.length, 0);
  assert.deepEqual([t.id, t.auftraggeber, t.ort, t.frist], ['https://bund.example/a.html', 'Stadt Müsterstadt', '16515 Oranienburg', '2026-11-25']);
  const berlin = `<rss><channel><item><title>Schule: Linoleum</title><description><![CDATA[Verfahrensart: Öffentliche Ausschreibung (VOB/A)<br>
    Ausführungsort: 13507, Berlin<br> Ablauf Angebotsfrist: 01.12.2026, 11:00 Uhr<br> Online seit: 12.11.2026 ]]></description>
    <link>javascript:alert(1)</link></item></channel></rss>`;
  const [b] = ausRss(berlin, 'berlin.de');
  assert.deepEqual([b.verfahren, b.ort, b.frist, b.link], ['Öffentliche Ausschreibung (VOB/A)', '13507 Berlin', '2026-12-01', null]);
});
