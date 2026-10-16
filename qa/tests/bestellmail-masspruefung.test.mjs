import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

// Masspruefung in der internen Bestellmail (#357). Bei Zuschnittware, Teppich
// nach Mass und Kettelservice steckt das Mass in der Menge; ueber
// /cart/change.js laesst sie sich am Rechner vorbei senken (belegt: 724 EUR ->
// 90,89 EUR). Die Mail rechnet die Menge aus den MASSEN nach und warnt vor dem
// Zuschnitt. Hier wird die Vorlage wirklich gerendert - ehrliche Bestellungen
// duerfen nie Alarm ausloesen, jede Manipulation muss es.
//
// Grenze des Tests: LiquidJS ist nicht Shopifys Liquid. Der Versand selbst ist
// nur ueber die Testbenachrichtigung im Admin pruefbar (README).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = readFileSync(join(root, 'domains', 'shopify', 'benachrichtigungen', 'interne-bestellmail-block.liquid'), 'utf8');
const eng = new Liquid();
const P = o => Object.entries(o);
const prod = (h) => ({ metafields: { custom: { preis_pro_001_qm: h }, grosshandel: { sku: 'X1' } } });
const line = (title, quantity, props, hundertstel=false) => ({ title, quantity, sku: 'S', variant_title: 'Sand', properties: P(props), product: prod(hundertstel), variant: { metafields: { lieferant: {} } } });
const meter = q => line('Piumera Teppichboden', q, { Art:'Meterware', Rollenbreite:'400 cm', 'Gewünschte Länge':'300 cm', 'Fläche (aufgerundet)':'12,00 m²', _Gruppe:'T1' });
const raum = q => line('Piumera Raummaß', q, { Art:'Raummaß', 'Ihre Breite':'365 cm', 'Aus Rolle':'400 cm', 'Gewünschte Länge':'301 cm', 'Fläche':'10,99 m²' }, true);
const mass = (q, m='200 × 300 cm', form='Rechteck', extra={}) => line('Wovena Teppich nach Maß', q, { Einfassung:'Ketteln', Form:form, 'Maße':m, 'Fläche (abgerechnet)':'6,00 m²', 'Kante umlaufend':'10,00 m', _Gruppe:'K1', ...extra }, true);
const kettel = (q, g='K1') => line('Kettelservice', q, { 'Zu Teppich':'Wovena', 'Kante umlaufend':'10,00 m', _Gruppe:g });
const leiste = q => line('Fußleiste', q, { 'Zu Teppichboden':'Piumera', 'Höhe':'6 cm', 'Länge':'19 m' });
const haft = q => line('Haftunterlage', q, { 'Zu Teppichboden':'Piumera', 'Ausführung':'120 cm', Bahnen:'2' });
// Zweiter Rechner (blocks/tp-teppich-wunschmass.liquid): echte Flaeche, immer 0,01 m2.
const wm = (q, form, props) => line('Teppich Wunschmaß', q, { Form: form, 'Fläche (berechnet)': '1,00 m²', ...props }, true);
const stueck = q => line('Sockelleiste', q, {});
const muster = () => line('Kostenloses Muster', 1, { Produkt:'Piumera', Farbe:'Sand', _Quellprodukt:'piumera' });
const faelle = [
 ['ehrlich: Meterware+Leiste+Haft+Stueck+Muster', [meter(12), leiste(19), haft(5), stueck(3), muster()], false, {passt:2, klein:0}],
 ['ehrlich: Teppich nach Mass + Kettel', [mass(600), kettel(1000)], false, {passt:2}],
 ['ehrlich: Mindestpreis (Menge groesser)', [mass(112,'50 × 50 cm')], false, {passt:1}],
 ['ehrlich: Raummass cm-genau 365x301', [raum(1099)], false, {passt:1}],
 ['ehrlich: Raummass 365x302 rundet ab auf 1102 (Rechner: Math.round)', [line('Raum', 1102, { Art:'Raummaß', 'Ihre Breite':'365 cm', 'Gewünschte Länge':'302 cm', 'Fläche':'11,02 m²' }, true)], false, {passt:1}],
 ['MANIPULIERT: Raummass 365x302 mit 1101', [line('Raum', 1101, { Art:'Raummaß', 'Ihre Breite':'365 cm', 'Gewünschte Länge':'302 cm' }, true)], true, {klein:1}],
 ['ehrlich: Teppich nach Mass 201x301 rundet auf 606 (605,01)', [mass(606,'201 × 301 cm')], false, {passt:1}],
 ['MANIPULIERT: Teppich nach Mass 201x301 mit 605', [mass(605,'201 × 301 cm')], true, {klein:1}],
 ['ehrlich: rund Ø 200 + Kettel 628', [mass(400,'Ø 200 cm','Rund'), kettel(628)], false, {passt:2}],
 ['ehrlich: oval 200x300 + Kettel 793', [mass(600,'200 × 300 cm','Oval'), kettel(793)], false, {passt:2}],
 ['MANIPULIERT: Issue-Fall 724->90 EUR (Menge 75 statt 600)', [mass(75), kettel(1000)], true, {klein:1}],
 ['MANIPULIERT: Meterware 12->2', [meter(2)], true, {klein:1}],
 ['MANIPULIERT: Menge UND Flaechen-Property gefaelscht, Masse echt', [mass(75,'200 × 300 cm','Rechteck',{'Fläche (abgerechnet)':'0,75 m²'})], true, {klein:1}],
 ['MANIPULIERT: Property-Name getauscht (Flaeche aufgerundet) bei 0,01-Produkt', [line('Raum',11,{ 'Ihre Breite':'365 cm','Gewünschte Länge':'301 cm','Fläche (aufgerundet)':'11,00 m²'},true)], true, {klein:1}],
 ['MANIPULIERT: Kettel 1000->100', [mass(600), kettel(100)], true, {klein:1}],
 ['MANIPULIERT: Kettel-Property mitgefaelscht', [mass(600), line('Kettelservice',100,{ 'Zu Teppich':'W','Kante umlaufend':'1,00 m',_Gruppe:'K1'})], true, {klein:1}],
 ['MANIPULIERT: Fussleiste 19->2', [meter(12), leiste(2)], true, {klein:1}],
 ['ehrlich: Wunschmass Rechteck 200x300', [wm(600,'Rechteck',{Breite:'200 cm','Länge':'300 cm'})], false, {passt:1}],
 ['ehrlich: Wunschmass Quadrat 150 mit Formzuschlag', [wm(240,'Quadrat',{'Seitenlänge':'150 cm'})], false, {passt:1}],
 ['ehrlich: Wunschmass Rund 200 (315 Einheiten)', [wm(315,'Rund',{Durchmesser:'200 cm'})], false, {passt:1}],
 ['ehrlich: Wunschmass Oval 200x300 (472 Einheiten)', [wm(472,'Oval',{Breite:'200 cm','Länge':'300 cm'})], false, {passt:1}],
 ['MANIPULIERT: Wunschmass Rechteck 600->80', [wm(80,'Rechteck',{Breite:'200 cm','Länge':'300 cm'})], true, {klein:1}],
 ['MANIPULIERT: Wunschmass Quadrat 225->50', [wm(50,'Quadrat',{'Seitenlänge':'150 cm'})], true, {klein:1}],
 ['MANIPULIERT: Wunschmass Rund 315->300', [wm(300,'Rund',{Durchmesser:'200 cm'})], true, {klein:1}],
 ['MANIPULIERT: Wunschmass Oval 472->400', [wm(400,'Oval',{Breite:'200 cm','Länge':'300 cm'})], true, {klein:1}],
 ['MANIPULIERT: Oval-Kettel 793->700 (frueher unter der Grenze durch)', [mass(600,'200 × 300 cm','Oval'), kettel(700)], true, {klein:1}],
 ['MANIPULIERT: Oval-Kettel knapp 793->785', [mass(600,'200 × 300 cm','Oval'), kettel(785)], true, {klein:1}],
 ['ehrlich: Oval-Kettel gestreckt 100x500 (1050)', [mass(500,'100 × 500 cm','Oval'), kettel(1050)], false, {passt:2}],
 ['ehrlich: Oval-Kettel fast rund 300x310 (958)', [mass(930,'300 × 310 cm','Oval'), kettel(958)], false, {passt:2}],
 ['MANIPULIERT: alle Properties entfernt bei 0,01-Produkt', [line('Teppich nach Maß',50,{},true)], true, {unlesbar:1}],
 ['Waise: Kettel ohne Teppich', [kettel(1000,'K9'), stueck(1)], true, {waise:1}],
 ['Unlesbar: Masse Muell', [mass(600,'<b>x</b>')], true, {unlesbar:1}],
];

for (const [name, items, alarm, erw] of faelle) {
  test(name, async () => {
    const html = await eng.parseAndRender(tpl, {
      name: '#1042', created_at: '2026-09-19T10:00:00Z', email: 'k@example.com', line_items: items,
      customer: { name: 'Test' }, shipping_address: { address1: 'Weg 1', zip: '16515', city: 'Oranienburg' },
    });
    const ist = {
      passt: (html.match(/>passt</g) || []).length,
      klein: (html.match(/MENGE ZU KLEIN/g) || []).length,
      waise: (html.match(/Service ohne Teppich/g) || []).length,
      unlesbar: (html.match(/Maß fehlt oder nicht lesbar/g) || []).length,
    };
    assert.equal(html.includes('NICHT ZUSCHNEIDEN'), alarm, 'Warnbanner');
    for (const k of Object.keys(erw)) assert.equal(ist[k], erw[k], k);
    assert.ok(!html.includes('<b>x</b>'), 'Kundeneingaben muessen escaped sein');
  });
}

test('gerechnet wird aus den Massen, nie aus der Flaechen-Property', () => {
  const pruefung = tpl.slice(tpl.indexOf('Masspruefung. Alles in ganzen Zahlen'));
  assert.doesNotMatch(pruefung, /when 'Fläche/);
  assert.match(tpl, /line\.product\.metafields\.custom\.preis_pro_001_qm/);
});

test('jede Division ist engine-unabhaengig abgerundet', () => {
  const ohne = [...tpl.matchAll(/\| divided_by: \d+\b(?! \| floor)/g)];
  assert.equal(ohne.length, 0);
});

// Gemeinsamer Rollenbestand (Inhaber 10.10.2026): Teppich nach Mass mit
// custom.zuschnitt_von_rolle, Rollenverbrauch ueber ein 0-EUR-Bundle. In der
// Bestellung steht die Rollenware als Bundle-Komponente (line.groups, 0 EUR).
const yasminProd = { metafields: { custom: { preis_pro_001_qm: true, zuschnitt_von_rolle: 'gid://shopify/Product/2' }, service: { max_breite_cm: 400 }, grosshandel: { sku: 'X1' } } };
const rolleProd = { metafields: { custom: { max_roll_laenge_cm: 2000 }, grosshandel: { sku: 'X1' } } };
const yasmin = (q, m = '200 × 300 cm', extra = {}) => ({ ...mass(q, m, 'Rechteck', { _Gruppe: 'Y1', _Rollenzuschnitt: '200', ...extra }), title: 'Passion Yasmin Kettelteppich nach Maß', product: yasminProd });
const yKettel = q => kettel(q, 'Y1');
const komponente = (q, art = 'groups') => ({ title: 'Passion Yasmin Anthrazit – Sonderposten, 400 cm', quantity: q, sku: 'S', variant_title: 'Default Title', properties: [], product: rolleProd, variant: { metafields: { lieferant: {} } }, final_price: 0, ...(art === 'groups' ? { groups: [{ title: 'Zuschnitt von der Rolle' }] } : {}) });
const bundleZeile = (q, cm = '200 cm') => ({ title: 'Zuschnitt von der Rolle – Passion Yasmin Anthrazit', quantity: q, sku: '', variant_title: cm, properties: P({ 'Zu Teppich': 'Passion Yasmin', Rollenzuschnitt: cm, _Gruppe: 'Y1' }), product: { metafields: {} }, variant: { metafields: { lieferant: {} } }, final_price: 0 });
const meterYasmin = q => ({ ...meter(q), title: 'Passion Yasmin Anthrazit – Sonderposten, 400 cm', product: rolleProd, final_price: 4195 });
const render = items => eng.parseAndRender(tpl, { name: '#1100', created_at: '2026-10-10T10:00:00Z', email: 'k@example.com', line_items: items, customer: { name: 'Test' } });
const rollFaelle = [
  ['ehrlich: 2 x 3 m braucht 200 cm = 8 Einheiten, Komponente 8', [yasmin(600), yKettel(1000), komponente(8)], 'passt', false],
  ['ehrlich: Komponente ohne line.groups, nur Preis 0', [yasmin(600), yKettel(1000), komponente(8, 'preis')], 'passt', false],
  ['ehrlich: Shopify zeigt die Bundle-Zeile statt der Komponente', [yasmin(600), yKettel(1000), bundleZeile(1)], 'passt', false],
  ['ehrlich: 2,5 x 7 m braucht 700 cm = 28 Einheiten', [yasmin(1750, '250 × 700 cm'), komponente(28)], 'passt', false],
  ['ehrlich: 201 x 301 cm braucht 201 cm = 9 Einheiten', [yasmin(606, '201 × 301 cm'), komponente(9)], 'passt', false],
  ['ehrlich: gemischter Warenkorb Meterware + Massteppich', [meterYasmin(12), yasmin(600), yKettel(1000), komponente(8)], 'passt', false],
  ['MANIPULIERT: Zuschnittzeile entfernt', [yasmin(600), yKettel(1000)], 'NICHT VOLL ABGEBUCHT', true],
  ['MANIPULIERT: kleinere Zuschnittvariante (175 cm = 7)', [yasmin(600), yKettel(1000), komponente(7)], 'NICHT VOLL ABGEBUCHT', true],
  ['MANIPULIERT: Zuschnitt ohne Teppich (0 EUR Rollenware)', [komponente(8)], 'OHNE TEPPICH', true],
  ['Unlesbar: Masse des Massteppichs fehlen', [{ ...yasmin(600), properties: P({ _Gruppe: 'Y1' }) }, komponente(8)], 'NICHT PRÜFBAR', true],
  ['MANIPULIERT: Bundle-Zeile ohne Teppich', [bundleZeile(1)], 'OHNE TEPPICH', true],
];
for (const [name, items, erwartet, alarm] of rollFaelle) {
  test(`Rollenbestand – ${name}`, async () => {
    const html = await render(items);
    assert.ok(html.includes(erwartet), `erwartet "${erwartet}"`);
    assert.equal(/ROLLENBESTAND NICHT|OHNE TEPPICH – NICHTS/.test(html), alarm, 'Rollen-Alarm');
    if (!alarm) assert.ok(!html.includes('NICHT ZUSCHNEIDEN'), 'ehrliche Bestellung ohne Warnbanner');
    // Die Komponentenzeile ist nie ein eigener Zuschnitt.
    if (items.some(i => i.product === rolleProd && i.final_price === 0)) assert.ok(html.includes('Bestandsabgang zum Maßteppich'));
  });
}
// Seit 2026-10-14 kostet der Zuschnitt 0,57 EUR = eine Einheit des Teppichs;
// die Hauptzeile hat dafuer eine Einheit weniger und "_Einheit im Zuschnitt" = 1.
const komponente057 = q => ({ ...komponente(q), final_price: 57 });
test('Rollenbestand 0,57 EUR – Teppich mit einer Einheit weniger ist ehrlich', async () => {
  const html = await render([yasmin(599, '200 × 300 cm', { '_Einheit im Zuschnitt': '1' }), yKettel(1000), komponente057(8)]);
  assert.ok(html.includes('passt'));
  assert.ok(!/MENGE (ZU KLEIN|PASST NICHT)/.test(html), 'keine Mengenwarnung');
  assert.ok(!/ROLLENBESTAND NICHT|OHNE TEPPICH – NICHTS/.test(html));
  assert.ok(html.includes('Bestandsabgang zum Maßteppich'), 'Komponente bleibt Bestandsabgang (line.groups)');
});
test('Rollenbestand 0,57 EUR – Komponente ohne line.groups wird trotzdem erkannt', async () => {
  const k = { ...komponente(8, 'preis'), final_price: 7 };
  const html = await render([yasmin(599, '200 × 300 cm', { '_Einheit im Zuschnitt': '1' }), yKettel(1000), k]);
  assert.ok(html.includes('Bestandsabgang zum Maßteppich'));
  assert.ok(!/ROLLENBESTAND NICHT|MENGE (ZU KLEIN|PASST NICHT)/.test(html));
});
test('Rollenbestand 0,57 EUR – ohne Kennzeichen oder zwei Einheiten weniger bleibt Alarm', async () => {
  const ohne = await render([yasmin(599), yKettel(1000), komponente057(8)]);
  assert.ok(/MENGE (ZU KLEIN|PASST NICHT)/.test(ohne), 'eine Einheit fehlt ohne Kennzeichen');
  const zwei = await render([yasmin(598, '200 × 300 cm', { '_Einheit im Zuschnitt': '1' }), yKettel(1000), komponente057(8)]);
  assert.ok(/MENGE (ZU KLEIN|PASST NICHT)/.test(zwei), 'mehr als eine Einheit fehlt');
});
test('Rollenbestand 0,57 EUR – Kennzeichen an einem normalen Teppich nach Mass wirkt nicht', async () => {
  const html = await render([mass(599, '200 × 300 cm', 'Rechteck', { '_Einheit im Zuschnitt': '1' })]);
  assert.ok(/MENGE (ZU KLEIN|PASST NICHT)/.test(html));
});

test('Rollenbestand – Bestellungen ohne Zuschnitt-Bundle bleiben unveraendert', async () => {
  const html = await render([mass(600), kettel(1000), meter(12), muster()]);
  assert.ok(!html.includes('Rollenbestand'), 'kein Rollenhinweis ohne Massteppich aus der Rolle');
  assert.ok(!html.includes('Bestandsabgang'));
});

test('Rollenbestand – Preis 0 ueberschreibt keinen Alarm einer Rollenware-Zeile', async () => {
  // Rollenware mit 100-%-Rabatt, Mass 2 x 3 m, aber nur 1 m2 bestellt: bleibt
  // MENGE ZU KLEIN und wird nicht zum stillen Bestandsabgang.
  const zeile = { ...mass(1, '200 × 300 cm', 'Rechteck'), title: 'Passion Yasmin Anthrazit – Sonderposten, 400 cm', product: rolleProd, final_price: 0 };
  const html = await render([zeile]);
  assert.ok(html.includes('MENGE PASST NICHT ZUM MASS'));
  assert.ok(!html.includes('Bestandsabgang zum Maßteppich'));
});

// Laengenware (Profile nach Mass, custom.preis_pro_001_lfm, seit 2026-10-16):
// Menge = "Länge je Stück" x "Anzahl" in cm, und zwar genau. Vorbild:
// operations/lib/resolve.mjs (masspruefung) - nur synthetische Testdaten.
const lfmProd = (feld = true) => ({ metafields: { custom: { preis_pro_001_lfm: feld }, grosshandel: { sku: 'G-1' } } });
const profil = (q, props = { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Gesamtlänge': '9,50 m', 'Bohrung': 'gebohrt', _Gruppe: 'L1' }, feld = true) =>
  ({ title: 'Testkante nach Maß', quantity: q, sku: 'TEST-PROFIL-1', variant_title: 'Messing poliert', properties: P(props), product: lfmProd(feld), variant: { metafields: { lieferant: {} } } });
const lfmFaelle = [
  ['ehrlich: 10 × 95 cm = 950', [profil(950)], 'passt', null],
  ['ehrlich: Metafeld als Objekt mit value', [profil(950, undefined, { value: true })], 'passt', null],
  ['ehrlich: gemischt mit Teppich nach Mass, Kettel, Meterware, Muster', [profil(950), mass(600), kettel(1000), meter(12), muster()], 'passt', null],
  ['MANIPULIERT: /cart/change.js 950 -> 1', [profil(1)], 'MENGE ZU KLEIN', 'kleiner'],
  ['MANIPULIERT: knapp 950 -> 940', [profil(940)], 'MENGE ZU KLEIN', 'kleiner'],
  ['Grenze: Menge UND Anzahl gefaelscht = kleinerer Zuschnitt zum richtigen Preis', [profil(95, { 'Länge je Stück': '95 cm', 'Anzahl': '1 Stück', 'Gesamtlänge': '9,50 m', 'Bohrung': 'gebohrt', _Gruppe: 'L1' })], 'passt', null],
  ['Abweichung: Menge 960 statt 950', [profil(960)], 'MENGE ZU GROSS', 'mehr'],
  ['MANIPULIERT: "Länge je Stück" entfernt', [profil(950, { 'Anzahl': '10 Stück', 'Bohrung': 'gebohrt', _Gruppe: 'L1' })], 'Maßangabe fehlt', 'kleiner'],
  ['MANIPULIERT: alle Properties entfernt', [profil(1, {})], 'Maßangabe fehlt', 'kleiner'],
  ['MANIPULIERT: "Maße" statt Laenge (Flaechenrechnung umgehen)', [profil(1, { 'Maße': '1 × 1 cm', _Gruppe: 'L1' })], 'Maßangabe fehlt', 'kleiner'],
  ['Unlesbar: Anzahl fehlt', [profil(950, { 'Länge je Stück': '95 cm', 'Bohrung': 'gebohrt' })], 'Maß fehlt oder nicht lesbar', 'kleiner'],
  ['Unlesbar: Laenge ist Markup', [profil(950, { 'Länge je Stück': '<b>x</b>', 'Anzahl': '10 Stück' })], 'Maß fehlt oder nicht lesbar', 'kleiner'],
];
for (const [name, items, erwartet, banner] of lfmFaelle) {
  test(`Laengenware – ${name}`, async () => {
    const html = await render(items);
    assert.ok(html.includes(erwartet), `erwartet "${erwartet}"`);
    assert.equal(html.includes('MENGE PASST NICHT ZUM MASS'), banner !== null, 'Warnbanner');
    if (banner === 'kleiner') assert.ok(html.includes('mit kleinerer Menge bezahlt'));
    if (banner === 'mehr') assert.ok(html.includes('Bei Längenware ist mehr bezahlt') && !html.includes('mit kleinerer Menge bezahlt'));
    assert.ok(!html.includes('<b>x</b>'), 'Kundeneingaben muessen escaped sein');
  });
}

test('Laengenware – Zuschnitt und Bohrung statt der Rohangaben, Soll genau', async () => {
  const html = await render([profil(950)]);
  assert.match(html, /<strong>Zuschnitt: 10 × 95 cm<\/strong>/);
  assert.match(html, /<strong>Bohrung: gebohrt<\/strong>/);
  assert.ok(html.includes('Soll genau 950 × 0,01 m'));
  assert.ok(!html.includes('Länge je Stück: 95 cm') && !html.includes('Anzahl: 10 Stück'), 'Rohangaben nicht doppelt');
  assert.ok(html.includes('Gesamtlänge: 9,50 m'), 'uebrige Properties bleiben');
  const zu = await render([profil(940)]);
  assert.ok(zu.includes('bestellt 940, zum Maß gehören genau 950 × 0,01 m'));
});

test('Laengenware – fehlende Bohrung faellt auf, Bohrung wird escaped', async () => {
  const ohne = await render([profil(950, { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück' })]);
  assert.match(ohne, /Bohrung: <span style="color:#a62020;">keine Angabe<\/span>/);
  const markup = await render([profil(950, { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Bohrung': '<b>x</b>' })]);
  assert.ok(markup.includes('Bohrung: &lt;b&gt;x&lt;/b&gt;'));
});

test('Laengenware – ohne Metafeld bleibt die Zeile ungeprueft wie bisher', async () => {
  const html = await render([profil(1, undefined, false)]);
  assert.ok(!html.includes('Zuschnitt:') && !html.includes('NICHT ZUSCHNEIDEN'));
  assert.ok(html.includes('Länge je Stück: 95 cm'), 'Rohangaben wie bei jedem Produkt');
});

test('Laengenware – zu klein und zu gross zugleich: Banner fuer zu wenig gewinnt', async () => {
  const html = await render([profil(960), mass(75)]);
  assert.ok(html.includes('MENGE ZU GROSS') && html.includes('MENGE ZU KLEIN'));
  assert.ok(html.includes('mit kleinerer Menge bezahlt'));
});

test('Laengenware – die Mail liest das Metafeld, nicht nur die Properties', () => {
  assert.match(tpl, /line\.product\.metafields\.custom\.preis_pro_001_lfm/);
});
