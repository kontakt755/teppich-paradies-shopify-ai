import assert from 'node:assert/strict';
import test from 'node:test';
import { cta, fertigerText, grundtext, hashtags, pruefeText, shopLink } from '../lib/texte.mjs';

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
