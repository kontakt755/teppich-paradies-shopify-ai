// Live-Pruefung vor dem Posten (Rundgang 26.10.2026, Massnahme #70). Die Faelle sind echte Beitraege
// aus dem Oktober, nachgebaut mit einem Shop-Ersatz: kein Netz, kein Meta-Aufruf.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { holeVerschwundeneZurueck, planeOffene, veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { freigeben, freigebenAutomatisch, zurueckholen } from '../lib/freigabe.mjs';
import { gedruckterPreis, m2Preise, preisBlock, produktHandles, produktLive, pruefeBeitragLive } from '../lib/live-pruefung.mjs';
import { erstelleClient } from '../lib/meta.mjs';
import { normalisiere } from '../lib/shop-quelle.mjs';
import { scheinShop, testDb, tmpDir } from './_hilfe.mjs';

const JETZT = new Date('2026-10-27T16:35:00Z');

/** Meta-Ersatz, der jeden Aufruf zaehlt - in den Sperr-Faellen darf er nie gerufen werden. */
function meta() {
  const aufrufe = []; let n = 0;
  const holen = async (url, init) => {
    aufrufe.push({ url: String(url), methode: init?.method });
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (init?.method === 'GET') return ok({ images: [{ source: 'https://cdn.fb/a.jpg', width: 1080 }], status_code: 'FINISHED', permalink: 'p', permalink_url: 'p' });
    n += 1; return ok({ id: `id${n}`, post_id: `post${n}` });
  };
  return { aufrufe, client: erstelleClient({ token: 't', pageId: 'PAGE', igUserId: 'IG', holen, pause: async () => {} }) };
}

/** Ein geplanter Beitrag wie in der Datenbank: Inhalt vom Shop-Scout, gerenderte Datei, automatisch freigegeben. */
function geplant(t, db, dir, { typ = 'produkt_farben', handle, produkte = [handle], daten = {}, format = 'story', vorlage = 'produkt', text = 'Ein ruhiger Boden für Wohnzimmer und Flur. Muster bekommen Sie kostenlos über den Shop.', medien = null, termin = '2026-10-27T16:30:00.000Z' }) {
  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ, titel: handle, produkt_handle: handle, einwilligung: true, daten: { produkte, ...daten } });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' }); db.inhaltAendern(id, { status: 'CONTENT_ERSTELLT' });
  const rel = path.join('medien', String(id), 'beitrag-1', '01.jpg');
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'jpg');
  const b = db.beitragAnlegen({ inhalt_id: id, format, plattformen: ['instagram', 'facebook'], vorlage, text, hashtags: '#a', medien: medien ?? [{ pfad: rel, art: 'bild', vorlage, quellen: [] }], geplant_am: termin });
  freigeben(db, b, { von: 'automatisch' });
  return b;
}

// Produktseite einer Paketware wie im Shop (Preisblock aus snippets/tp-price-per-sqm.liquid), dazu ein Verlegepreis im Seitentext.
const NOVIRA_SEITE = '<html><main><h1>Novira Sauberlauf-Fliesen 50 × 50 cm</h1><product-price data-product-id="1"><div class="tp-price-per-sqm"><div class="tp-price-per-sqm__unit"><span class="tp-price-per-sqm__amount">90,50</span> <span class="tp-price-per-sqm__label">€/m²</span></div><div class="tp-price-per-sqm__package">271,51&nbsp;€ pro Originalpaket</div><div class="tp-price-per-sqm__content">1 Paket = 3,00&nbsp;m²</div></div></product-price><p>Faire Festpreise: lose Verlegung 8,95 €/m²</p></main></html>';
const M2 = menge => ({ measured_type: 'area', quantity_value: menge, quantity_unit: 'm2', reference_value: 1, reference_unit: 'm2' });
/** Prueft nur den gedruckten Preis eines Beitrags gegen den Shop-Ersatz. */
const preisSperren = async (shop, handle, preis, preisAlt = null, text = '') => (await pruefeBeitragLive(
  { beitrag: { vorlage: 'produkt', medien: [{ preis, preisAlt }], text }, inhalt: { produkt_handle: handle, daten: {} } },
  { holen: shop.holen, pauseMs: 0 },
)).sperren;

const lauf = (db, dir, shop, m = meta(), jetzt = JETZT) => veroeffentlicheFaellige(db, { client: m.client, jetzt, dir, holen: shop.holen, shopPauseMs: 0 });

test('Novaris (#99): Produkt archiviert, .js leitet auf Vantana um - zurueck in die Freigabe, Meta wird nie gerufen', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const shop = scheinShop({ 'novaris-teppich-nach-mass': { status: 301, location: 'https://www.teppich-paradies.net/products/vantana-teppich-nach-mass' } });
  const b = geplant(t, db, dir, { handle: 'novaris-teppich-nach-mass', daten: { neueFarben: ['Grau'] } });
  const m = meta();
  const r = await lauf(db, dir, shop, m);
  assert.deepEqual(r.zurueck, [b]); assert.equal(m.aufrufe.length, 0);
  const z = db.beitrag(b);
  assert.equal(z.status, 'FREIGABE'); assert.match(z.fehler, /novaris-teppich-nach-mass: nicht mehr im Shop, leitet um auf \/products\/vantana-teppich-nach-mass/);
  // Die automatische Freigabe plant ihn nicht wieder ein, der Planer gibt ihm keinen Termin.
  db.beitragAendern(b, { geplant_am: '2026-11-03T16:30:00.000Z' });
  assert.deepEqual(freigebenAutomatisch(db, { env: { SOCIAL_AUTO_FREIGABE: '2' }, jetzt: JETZT }), []);
  db.beitragAendern(b, { geplant_am: '2026-10-27T16:30:00.000Z' });
  assert.deepEqual(planeOffene(db, { jetzt: JETZT, dir }), []);
});

test('Novaris als 404 und Aalborg (#126, 301 auf die Kollektion): beide gesperrt', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const shop = scheinShop({
    'novaris-teppich-nach-mass': { status: 404 },
    'aalborg-eiche-creme-laminat-8mm': { status: 301, location: '/collections/laminat' },
  });
  const novaris = geplant(t, db, dir, { handle: 'novaris-teppich-nach-mass', format: 'karussell', vorlage: 'farben_titel' });
  const aalborg = geplant(t, db, dir, { typ: 'raumidee', handle: 'aalborg-eiche-creme-laminat-8mm', produkte: ['aalborg-eiche-creme-laminat-8mm', 'aalborg-eiche-grau-laminat-8mm'], termin: '2026-10-27T16:00:00.000Z' });
  await lauf(db, dir, shop);
  assert.match(db.beitrag(novaris).fehler, /novaris-teppich-nach-mass: nicht mehr im Shop \(404\)/);
  assert.match(db.beitrag(aalborg).fehler, /leitet um auf \/collections\/laminat/);
});

test('Armonia und Ambrosia (#74, #75): Tag auslauf - "Neu bei uns" geht nicht raus', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const shop = scheinShop({
    'armonia-teppich-nach-mass': { tags: ['auslauf', 'art: teppich nach maß'] },
    'ambrosia-teppich-nach-mass': { tags: ['Auslauf'] },
  });
  const text = 'Neu bei uns: Armonia als Teppich nach Maß. Wir schneiden den Frisé zentimetergenau zu und ketteln ihn rundum.';
  const armonia = geplant(t, db, dir, { typ: 'produkt_neu', handle: 'armonia-teppich-nach-mass', text });
  const ambrosia = geplant(t, db, dir, { typ: 'produkt_neu', handle: 'ambrosia-teppich-nach-mass', text: text.replace('Armonia', 'Ambrosia'), termin: '2026-10-27T12:00:00.000Z' });
  const m = meta();
  const r = await lauf(db, dir, shop, m);
  assert.equal(r.veroeffentlicht.length, 0); assert.equal(m.aufrufe.length, 0);
  for (const b of [armonia, ambrosia]) assert.match(db.beitrag(b).fehler, /Tag „auslauf“ – Auslaufware wird nicht beworben/);
});

test('Novira (#49): 90,69 €/m² im Bild, der Shop zeigt 90,50 €/m² - gesperrt; mit gleichem Preis geht er raus', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const seite = NOVIRA_SEITE;
  const shop = scheinShop({ 'novira-sauberlauf-fliesen-50-50-cm': { preis: 27151, farben: ['Schwarz', 'Anthrazit', 'Grau', 'Mokka', 'Schiefer'], seite } });
  const daten = { preisJeEinheit: { betrag: 90.69, einheit: 'm2' }, serie: false };
  const text = 'Neu im Shop: die Sauberlauf-Fliesen Novira im Format 50 × 50 cm für Eingangsbereiche. Erhältlich in fünf Farben.';
  const b = geplant(t, db, dir, { typ: 'produkt_neu', handle: 'novira-sauberlauf-fliesen-50-50-cm', format: 'feed', daten, text });
  const m = meta();
  const r = await lauf(db, dir, shop, m);
  assert.deepEqual(r.zurueck, [b]); assert.equal(m.aufrufe.length, 0);
  assert.match(db.beitrag(b).fehler, /Preis im Bild 90,69 €\/m², der Shop zeigt 90,50 €\/m²/);

  const richtig = geplant(t, db, dir, { typ: 'produkt_neu', handle: 'novira-sauberlauf-fliesen-50-50-cm', format: 'feed', daten: { ...daten, preisJeEinheit: { betrag: 90.5, einheit: 'm2' } }, text, termin: '2026-10-27T16:31:00.000Z' });
  const r2 = await lauf(db, dir, shop);
  assert.deepEqual(r2.veroeffentlicht.map(v => v.id), [richtig], JSON.stringify(r2));
});

test('Preispruefung (Pruefung PR #1734): nur Grundpreise des Produkts - kein Paketpreis, kein Verlegepreis, kein Preis je 0,01 m²', async () => {
  const paket = { preis: 27151, seite: NOVIRA_SEITE, varianten: [{ id: 11, price: 27151, compare_at_price: null, unit_price: 9050, unit_price_measurement: M2('3.0') }] };
  const nachMass = {
    varianten: [{ id: 21, price: 50, compare_at_price: 53, unit_price: 5000, unit_price_measurement: M2('0.01') }],
    // Teppich nach Mass zeigt im Preisblock den Einstiegspreis in Euro, keinen Quadratmeterpreis (snippets/tp-teppich-ab-preis.liquid).
    seite: '<html><main><product-price data-product-id="1"><span>ab Aktionspreis 147,40 €</span> <s class="tp-ab-preis__alt"><span class="visually-hidden">statt </span>151 €</s></product-price></main></html>',
  };
  const shop = scheinShop({ novira: paket, 'novira-ohne-grundpreis': { ...paket, varianten: [{ id: 11, price: 27151, compare_at_price: null }] }, zafira: nachMass });
  for (const h of ['novira', 'novira-ohne-grundpreis']) {
    assert.deepEqual(await preisSperren(shop, h, '90,50 €/m²'), [], h);
    assert.deepEqual(await preisSperren(shop, h, '271,51 €/m²'), ['Preis im Bild 271,51 €/m², der Shop zeigt 90,50 €/m²'], `${h}: der Paketpreis ist kein Quadratmeterpreis`);
    assert.deepEqual(await preisSperren(shop, h, '8,95 €/m²'), ['Preis im Bild 8,95 €/m², der Shop zeigt 90,50 €/m²'], `${h}: ein Verlegepreis im Seitentext ist kein Produktpreis`);
    assert.equal((await preisSperren(shop, h, null, null, 'Lose verlegt ab 8,95 €/m².')).length, 1, `${h}: auch nicht im Beitragstext`);
  }
  assert.deepEqual(await preisSperren(shop, 'zafira', '50,00 €/m²', '53,00 €/m²'), [], 'nach Mass: Grundpreis und Streichpreis je m² aus der .js');
  assert.equal((await preisSperren(shop, 'zafira', '0,50 €/m²')).length, 1, 'nach Mass: der Preis je 0,01 m² ist kein Quadratmeterpreis');
  assert.equal((await preisSperren(shop, 'zafira', '50,00 €/m²', '0,53 €/m²')).length, 1);
});

test('Preispruefung (Pruefung PR #1734): der Streichpreis einer Breite sperrt nicht den gleich hohen Preis einer anderen', async () => {
  const varianten = [
    { id: 1, title: '400 cm', price: 4990, compare_at_price: null, unit_price: 4990, unit_price_measurement: M2('1.0') },
    { id: 2, title: '500 cm', price: 3990, compare_at_price: 4990, unit_price: 3990, unit_price_measurement: M2('1.0') },
  ];
  const shop = scheinShop({ breiten: { preis: 4990, varianten } });
  assert.deepEqual(await preisSperren(shop, 'breiten', '49,90 €/m²'), []);
  assert.deepEqual(await preisSperren(shop, 'breiten', '39,90 €/m²', '49,90 €/m²'), []);
  assert.equal((await preisSperren(shop, 'breiten', '45,00 €/m²')).length, 1);
});

test('Rapidia (#117): Text nennt 11 Farben, der Shop hat 9 - gesperrt', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const farben = ['Grau Sehr Dunkel Dunkler', 'Grau Sehr Dunkel Heller', 'Grau Mittel Dunkler', 'Grau Dunkel', 'Grau Dunkel Warm', 'Grau Sehr Dunkel Mittel', 'Rosé Sehr Dunkel', 'Blau Sehr Dunkel', 'Blau Dunkel'];
  const shop = scheinShop({ 'rapidia-teppichfliese-50x50cm': { farben } });
  const b = geplant(t, db, dir, { handle: 'rapidia-teppichfliese-50x50cm', text: 'Die Teppichfliese Rapidia gibt es jetzt auch in Blau Sehr Dunkel und Blau Dunkel, insgesamt in 11 Farben. Die Fliesen sind stuhlrollengeeignet.' });
  await lauf(db, dir, shop);
  assert.match(db.beitrag(b).fehler, /Text nennt „11 Farben“, im Shop sind es 9/);
});

test('Shop nicht erreichbar: der Beitrag wartet geplant auf den naechsten Takt, nichts Bleibendes', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const b = geplant(t, db, dir, { handle: 'brumina-teppichboden-400cm-500cm' });
  for (const holen of [async () => { throw new Error('ECONNRESET'); }, async () => ({ ok: false, status: 503, text: async () => '' }), async () => ({ ok: true, status: 200, text: async () => '<!DOCTYPE html><title>Verifying your connection</title>' })]) {
    const m = meta();
    const r = await veroeffentlicheFaellige(db, { client: m.client, jetzt: JETZT, dir, holen, shopPauseMs: 0 });
    assert.equal(r.wartet.length, 1); assert.equal(m.aufrufe.length, 0);
    assert.equal(db.beitrag(b).status, 'GEPLANT'); assert.equal(db.beitrag(b).fehler, null);
  }
  const r = await lauf(db, dir, scheinShop());
  assert.deepEqual(r.veroeffentlicht.map(v => v.id), [b], 'beim naechsten Takt geht er raus');
});

test('Grosse Serie: vor dem Posten nur die ersten zehn Produkte, jedes nur einmal je Lauf', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const produkte = Array.from({ length: 72 }, (_, i) => `jab-design-${i + 1}`);
  const shop = scheinShop();
  geplant(t, db, dir, { typ: 'produkt_neu', handle: produkte[0], produkte, format: 'karussell', daten: { serie: true }, termin: '2026-10-27T16:00:00.000Z' });
  geplant(t, db, dir, { typ: 'produkt_neu', handle: produkte[0], produkte, daten: { serie: true } });
  const r = await lauf(db, dir, shop);
  assert.equal(r.veroeffentlicht.length, 2);
  const js = shop.aufrufe.filter(u => u.endsWith('.js'));
  assert.equal(js.length, 10); assert.equal(new Set(js).size, 10);
});

test('Gedruckter Preis: aus dem Beitrag, sonst wie im Standardaufbau; Quadratmeterpreise der Seite', () => {
  const inhalt = { typ: 'produkt_neu', daten: { preisJeEinheit: { betrag: 69.99, einheit: 'm2' } } };
  assert.deepEqual(gedruckterPreis({ vorlage: 'produkt', medien: [{}] }, inhalt), { preis: '69,99 €/m²', preisAlt: null });
  assert.equal(gedruckterPreis({ vorlage: 'produkt', medien: [{}] }, { ...inhalt, daten: { ...inhalt.daten, serie: true } }), null, 'Serie ohne Preisschild');
  assert.equal(gedruckterPreis({ vorlage: 'farben_titel', medien: [{}] }, inhalt), null);
  assert.equal(gedruckterPreis({ vorlage: 'produkt', medien: [{ preis: null }] }, inhalt), null, 'neuer Beitrag ohne Preisschild');
  assert.deepEqual(gedruckterPreis({ vorlage: 'angebot', medien: [{ preis: '20,50 €/m²', preisAlt: '23,90 €/m²' }] }, inhalt), { preis: '20,50 €/m²', preisAlt: '23,90 €/m²' });
  // Preisblock wie blocks/price_custom.liquid: Streichpreis als __compare, verborgene Teile zeigt der Shop nicht.
  const html = '<main><product-price data-product-id="7"><span class="tp-rabatt-badge">−14&nbsp;%</span><span class="price-with-unit__compare">23,90&nbsp;€/m²</span> <span class="price-with-unit__current">20,50&nbsp;€/m²</span><span class="price-with-unit__compare" hidden>19,00&nbsp;€/m²</span></product-price>'
    + '<p>lose Verlegung 8,95 €/m²</p><product-price data-product-id="8"><span>12,00 €/m²</span></product-price></main>';
  assert.equal(preisBlock(html, 7), '−14 % statt 23,90 €/m² 20,50 €/m²');
  assert.deepEqual(m2Preise(preisBlock(html, 7)), { aktuell: ['20,50'], vergleich: ['23,90'], erster: '20,50' });
  assert.deepEqual(m2Preise('Angebotspreis 20,50 €/m² Normaler Preis 23,90 €/m²').vergleich, ['23,90'], 'Sticky-Leiste: "Normaler Preis"');
  assert.deepEqual(m2Preise('49,90 €/m²', { variants: [{ price: 3690 }, { price: 4990 }] }).aktuell, ['49,90', '36,90'], 'Meterware: guenstigere Breite zaehlt');
  assert.deepEqual(m2Preise('90,50 €/m²', { variants: [{ price: 27151 }] }).aktuell, ['90,50'], 'Paketware ohne Grundpreis: Variantenpreis zaehlt nicht');
  // Grundpreis je 10 m² (Bezugsmenge): auf 1 m² umgerechnet, Streichpreis ebenso.
  const je10 = { quantity_value: '3.0', quantity_unit: 'm2', reference_value: 10, reference_unit: 'm2' };
  assert.deepEqual(m2Preise('', { variants: [{ price: 27000, compare_at_price: 30000, unit_price: 90000, unit_price_measurement: je10 }] }), { aktuell: ['90,00'], vergleich: ['100,00'], erster: '90,00' });
  assert.equal(preisBlock('<product-price><span class="preis hidden-mobile">20,50 €/m²</span><span hidden="">19,00 €/m²</span></product-price>'), '20,50 €/m²', 'nur das Attribut hidden blendet aus');
  assert.deepEqual(produktHandles({ produkt_handle: 'a', daten: { produkte: ['a', 'b', null] } }), ['a', 'b']);
});

test('produktLive: folgt keiner Weiterleitung und erkennt ein untergeschobenes anderes Produkt', async () => {
  const shop = scheinShop({ alt: { status: 301, location: '/products/neu' } });
  assert.deepEqual(await produktLive('alt', { holen: shop.holen }), { zustand: 'umgeleitet', ziel: '/products/neu' });
  const gefolgt = async () => ({ ok: true, status: 200, redirected: false, text: async () => JSON.stringify({ handle: 'neu', tags: [] }) });
  assert.equal((await produktLive('alt', { holen: gefolgt })).zustand, 'umgeleitet');
  assert.equal((await pruefeBeitragLive({ beitrag: { text: '' }, inhalt: { daten: {} } }, { holen: shop.holen })).sperren.length, 0, 'ohne Produkt nichts zu pruefen');
});

test('Taeglicher Shop-Abgleich: geplante Beitraege mit verschwundenem oder ausgelaufenem Produkt zurueck', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const weg = geplant(t, db, dir, { handle: 'novaris-teppich-nach-mass', termin: '2026-10-31T09:30:00.000Z' });
  const aus = geplant(t, db, dir, { handle: 'piumera-teppich-nach-mass', termin: '2026-11-01T09:30:00.000Z' });
  const gut = geplant(t, db, dir, { handle: 'brumina-teppichboden-400cm-500cm', termin: '2026-11-02T09:30:00.000Z' });
  const feed = h => normalisiere({ handle: h, title: h, product_type: 'Teppichboden', tags: h.startsWith('piumera') ? ['auslauf'] : [], variants: [], images: [], options: [] });
  const produkte = [feed('piumera-teppich-nach-mass'), feed('brumina-teppichboden-400cm-500cm')];
  const r = holeVerschwundeneZurueck(db, { produkte, stand: new Map(), jetzt: JETZT });
  assert.deepEqual(r.zurueck.sort(), [weg, aus].sort());
  assert.match(db.beitrag(weg).fehler, /nicht mehr im Shop: novaris-teppich-nach-mass/);
  assert.match(db.beitrag(aus).fehler, /Tag „auslauf“: piumera/);
  assert.equal(db.beitrag(gut).status, 'GEPLANT');
  assert.deepEqual(freigebenAutomatisch(db, { env: { SOCIAL_AUTO_FREIGABE: '2' }, jetzt: JETZT }), [], 'bleibt beim Menschen');
  assert.deepEqual(holeVerschwundeneZurueck(db, { produkte, stand: new Map(), jetzt: JETZT }).zurueck, [], 'kein zweites Mal');

  // Ein auffaellig kleiner Feed holt nichts zurueck.
  const stand = new Map(Array.from({ length: 60 }, (_, i) => [`p${i}`, { handle: `p${i}`, zuletzt_gesehen: '2026-10-27T05:00:00.000Z' }]));
  const g2 = geplant(t, db, dir, { handle: 'p1', termin: '2026-11-03T09:30:00.000Z' });
  const klein = holeVerschwundeneZurueck(db, { produkte: [feed('p0')], stand, jetzt: JETZT });
  assert.deepEqual(klein.zurueck, []); assert.match(klein.hinweis, /unvollständig/); assert.equal(db.beitrag(g2).status, 'GEPLANT');
});

test('Zurueckgeholt heisst zurueckgeholt: die Automatik gibt nicht wieder frei, der Publisher postet nicht, ein Mensch darf', async (t) => {
  const db = testDb(t, () => JETZT); const dir = tmpDir(t);
  const b = geplant(t, db, dir, { handle: 'zafira-teppichboden-400cm-500cm', termin: '2026-11-05T16:30:00.000Z' });
  zurueckholen(db, b, { von: 'redaktion', grund: 'Doppelt: Zafira Rauchblau kommt schon als #105.' });
  assert.equal(db.beitrag(b).fehler, 'Doppelt: Zafira Rauchblau kommt schon als #105.');
  const env = { SOCIAL_AUTO_FREIGABE: '2' };
  assert.deepEqual(freigebenAutomatisch(db, { env, jetzt: JETZT }), []);
  // So war es am 26.10.: nach dem Zurueckholen automatisch wieder freigegeben - der Publisher haelt ihn trotzdem auf.
  freigeben(db, b, { von: 'automatisch' }); db.beitragAendern(b, { geplant_am: '2026-10-27T16:30:00.000Z' });
  const m = meta();
  const r = await lauf(db, dir, scheinShop(), m);
  assert.deepEqual(r.zurueck, [b]); assert.equal(m.aufrufe.length, 0);
  assert.match(db.beitrag(b).fehler, /zurückgeholt \(Doppelt: Zafira.*nur automatisch wieder freigegeben/);
  // Ein Mensch gibt frei: dann gilt das.
  freigeben(db, b, { von: 'Inhaber', geplantAm: '2026-10-27T16:30:00.000Z' });
  assert.equal(db.zurueckgehalten(b), null);
  assert.equal((await lauf(db, dir, scheinShop())).veroeffentlicht.length, 1);
});
