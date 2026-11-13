import assert from 'node:assert/strict';
import test from 'node:test';
import { besonderheitSauber, cta, kontaktFehler, fertigerText, grundtext, hashtags, pruefeText, shopLink } from '../lib/texte.mjs';

const GUT = 'Heute haben wir in Oranienburg einen alten Teppichboden entfernt, den Untergrund vorbereitet und anschließend neuen Klebevinyl verlegt.';

test('Der Beispieltext aus dem Auftrag besteht die Pruefung', () => {
  assert.deepEqual(pruefeText(`${GUT}\n\n${cta('kundenprojekt')}`), { fehler: [], hinweise: [], ok: true });
});

test('Floskeln und Adressen werden abgelehnt', () => {
  assert.match(pruefeText('Tauchen Sie ein in die faszinierende Welt der Bodenbeläge und lassen Sie sich beraten.').fehler.join(), /Floskel/);
  assert.match(pruefeText('Wir sind unglaublich stolz auf dieses Projekt in Oranienburg mit neuem Vinyl.').fehler.join(), /Floskel/);
  assert.match(pruefeText(`${GUT} Verlegt in der Bernauer Straße 12.`).fehler.join(), /Adresse/);
  assert.equal(pruefeText(`${GUT} Besuchen Sie uns in der Saarlandstraße 73–81.`).ok, true, 'die eigene Ladenadresse ist erlaubt');
  assert.equal(pruefeText('Zu kurz').ok, false);
});

test('Hinweise: Duzen, Preis, Superlativ, Emojis', () => {
  const h = t => pruefeText(`${GUT} ${t}`).hinweise.join(' | ');
  assert.match(h('Schaut gerne vorbei.'), /duzt/);
  assert.match(h('Jetzt ab 24,90 € je Quadratmeter.'), /Preis/);
  assert.match(h('Die größte Auswahl der Region.'), /Superlativ/);
  assert.match(h('🔥💯'), /Emoji/);
});

test('Hashtags: lokal nur bei bekanntem Ort, Facebook sparsam', () => {
  const mit = hashtags({ ort: 'Hohen Neuendorf', bodenart: 'Klebevinyl', typ: 'vorher_nachher' });
  assert.deepEqual(mit.slice(0, 3), ['#hohenneuendorf', '#oberhavel', '#oranienburg']);
  assert.ok(mit.includes('#klebevinyl') && mit.includes('#vorhernachher') && mit.length <= 10);
  assert.ok(hashtags({ ort: 'Berlin-Pankow', bodenart: 'Teppichboden', typ: 'kundenprojekt' }).includes('#pankow'));
  const ohne = hashtags({ ort: null, bodenart: 'Teppichboden', typ: 'produkt_neu' });
  assert.equal(ohne.includes('#oberhavel'), false); assert.ok(ohne.includes('#teppichparadies'));
  assert.equal(hashtags({ ort: 'Velten', bodenart: 'Linoleum', typ: 'kundenprojekt', plattform: 'facebook' }).length, 3);
  assert.equal(new Set(mit).size, mit.length);
});

test('Grundtext behauptet nur, was angegeben wurde', () => {
  const t = grundtext({ quelle: 'baustelle', typ: 'kundenprojekt', ort: 'Velten', bodenart: 'Klebevinyl', raum: 'Wohnzimmer', taetigkeit: 'Altbelag entfernt, Untergrund vorbereitet, Verlegung' });
  assert.match(t, /^In Velten haben wir den alten Belag entfernt, den Untergrund vorbereitet und Klebevinyl verlegt – hier im Wohnzimmer\./);
  assert.equal(pruefeText(t).ok, true);
  assert.match(grundtext({ quelle: 'baustelle', typ: 'kundenprojekt' }), /^Bei diesem Projekt haben wir den neuen Boden verlegt\./);
  assert.match(grundtext({ quelle: 'shopify', typ: 'produkt_neu', titel: 'x', produkt_titel: 'Fellara Dekofell' }), /^Neu im Shop: Fellara Dekofell\./);
});

test('Shop-Link traegt die Herkunft, Instagram-Text keinen Link', () => {
  const l = shopLink('https://www.teppich-paradies.net/products/x', { beitragId: 7, plattform: 'facebook' });
  assert.match(l, /utm_source=facebook&utm_medium=social&utm_campaign=organisch&utm_content=b7$/);
  assert.equal(fertigerText({ text: 'A', tags: ['#b'], link: l, plattform: 'instagram' }), 'A\n\n#b');
  assert.equal(fertigerText({ text: 'A', tags: ['#b'], link: l, plattform: 'facebook' }), `A\n\n${l}\n\n#b`);
});

test('Telefonnummern und E-Mail-Adressen sind ein Fehler, eigene Kontaktdaten und Datum/Preis nicht', () => {
  const f = t => pruefeText(`${GUT} ${t}`).fehler.join(' | ');
  for (const t of ['Rufen Sie 0171 1234567 an.', 'Tel. +49 171 1234567.', 'Telefon 03301/123456.', 'Mobil 0049 30 123 456 78.', 'Melden bei 030-1234567.', 'Mail an max.muster@example.de bitte.', 'Kontakt: info@lieferant-a.example'])
    assert.ok(f(t), `muss sperren: ${t}`);
  assert.match(f('Rufen Sie 0171 1234567 an.'), /Telefonnummer/);
  assert.match(f('Mail an max.muster@example.de bitte.'), /E-Mail/);
  for (const t of ['Rufen Sie an: 03301 573 37 20.', 'Rufen Sie an: 03301 5733720.', 'Rufen Sie an: +49 3301 5733720.', 'Schreiben Sie an kontakt@teppich-paradies.net.',
    'Stand 13.11.2026.', 'Ab 1.299,00 € je Stück.', 'Zimmer 12 m² und 24,90 € je m².', 'In 16515 Oranienburg verlegt.', 'Artikel 620 in Farbe 1234.'])
    assert.equal(f(t), '', `muss durchgehen: ${t}`);
  assert.equal(pruefeText(`${GUT}\n\n${cta('handwerk', 2)}`).ok, true, 'der Standard-Handlungsaufruf mit Telefon bleibt erlaubt');
});

test('Freitext des Monteurs gelangt nur sauber in den Grundtext', () => {
  const basis = { quelle: 'baustelle', typ: 'kundenprojekt', ort: 'Velten', bodenart: 'Klebevinyl', taetigkeit: 'Verlegung' };
  assert.match(grundtext({ ...basis, besonderheit: 'Der Boden lag auf altem Estrich' }), /Estrich\./);
  for (const b of ['Frau Meier erreichen Sie unter 0171 1234567', 'Bei max@example.de melden', 'Bernauer Straße 12, dritter Stock', 'Ein echter Hingucker'])
    assert.doesNotMatch(grundtext({ ...basis, besonderheit: b }), /Meier|max@|Bernauer|Hingucker/, `draussen: ${b}`);
  assert.equal(besonderheitSauber('Unebener Untergrund, Spachtelmasse nötig'), true);
  assert.deepEqual(kontaktFehler('Nur Text'), []);
});
