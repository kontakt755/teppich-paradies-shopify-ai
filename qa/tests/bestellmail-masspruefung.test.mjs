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
