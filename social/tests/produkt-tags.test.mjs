import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { veroeffentlicheFaellige } from '../lib/ablauf.mjs';
import { erstelleClient, veroeffentliche } from '../lib/meta.mjs';
import { passtZuProdukt, produktTagsSuchen } from '../lib/produkt-tags.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

const SHOP = 'https://shop.test';
const KATALOG = [
  { product_id: 9001, retailer_id: 'shopify_DE_111_5551', product_name: 'Amara Eiche', review_status: 'approved' },
  { product_id: 9002, retailer_id: 'shopify_DE_222_5552', product_name: 'Amara Eiche', review_status: 'approved' },
  { product_id: 9003, retailer_id: 'shopify_DE_333_5553', product_name: 'Lyra Grau', review_status: 'rejected' },
];
const PRODUKTE = { amara: { id: 222, title: 'Amara Eiche' }, lyra: { id: 333, title: 'Lyra Grau' }, fremd: { id: 444, title: 'Amara Eiche' } };

/** Meta- und Shop-Ersatz. `berechtigt`: Instagram Shopping freigeschaltet; `tagsAblehnen`: Meta lehnt product_tags ab. */
function schein({ berechtigt = true, katalog = true, tagsAblehnen = false } = {}) {
  const aufrufe = []; let n = 0;
  const ok = daten => ({ ok: true, status: 200, json: async () => daten, text: async () => JSON.stringify(daten) });
  const holen = async (url, init = {}) => {
    const u = new URL(url);
    if (u.origin === SHOP) {
      aufrufe.push({ shop: u.pathname });
      const p = PRODUKTE[u.pathname.match(/\/products\/(.+)\.js$/)?.[1]];
      return p ? ok(p) : { ok: false, status: 404, json: async () => ({}) };
    }
    const pfad = u.pathname.replace(/^\/v[\d.]+/, '');
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : (init.body ? Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === 'string')) : Object.fromEntries(u.searchParams));
    aufrufe.push({ methode: init.method, pfad, body });
    const felder = u.searchParams.get('fields');
    if (init.method === 'GET') {
      if (felder === 'shopping_product_tag_eligibility') return ok({ shopping_product_tag_eligibility: berechtigt });
      if (pfad === '/IG/available_catalogs') return ok({ data: katalog ? [{ catalog_id: 'K1', catalog_name: 'Shopify Product Catalog' }] : [] });
      if (pfad === '/IG/catalog_product_search') return ok({ data: KATALOG.filter(e => e.product_name === u.searchParams.get('q')) });
      if (felder === 'images') return ok({ images: [{ source: `https://cdn.fb/${pfad.slice(1)}.jpg`, width: 1080 }] });
      if (felder === 'status_code') return ok({ status_code: 'FINISHED' });
      return ok({ permalink: `https://instagram.com/p/${pfad.slice(1)}` });
    }
    if (tagsAblehnen && pfad === '/IG/media' && body.product_tags) return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: 'Invalid product tag' } }) };
    n += 1;
    return ok({ id: `id${n}`, post_id: `post${n}` });
  };
  const igMedia = () => aufrufe.filter(a => a.methode === 'POST' && a.pfad === '/IG/media');
  return { holen, aufrufe, igMedia };
}

const client = s => erstelleClient({ token: 't', pageId: 'PAGE', igUserId: 'IG', holen: s.holen, pause: async () => {} });

function bild(t) {
  const dir = tmpDir(t); const datei = path.join(dir, 'a.jpg'); fs.writeFileSync(datei, 'x');
  return { dir, datei };
}

test('Katalogeintrag passt nur zur eigenen Shopify-Produkt-ID, abgelehnte Eintraege nie', () => {
  assert.equal(passtZuProdukt(KATALOG[1], 222), true);
  assert.equal(passtZuProdukt(KATALOG[0], 222), false, 'gleicher Name, anderes Produkt');
  assert.equal(passtZuProdukt({ retailer_id: 'shopify_DE_2222_1' }, 222), false, 'Teilzahl zaehlt nicht');
  assert.equal(passtZuProdukt(KATALOG[2], 333), false, 'von Meta abgelehnt');
  assert.equal(passtZuProdukt({ retailer_id: '222' }, '222'), true);
});

test('Ohne Instagram Shopping: keine Shop-Abfrage, keine Tags, Grund im Hinweis', async () => {
  const s = schein({ berechtigt: false });
  const r = await produktTagsSuchen(client(s), ['amara'], { holen: s.holen, shop: SHOP });
  assert.deepEqual(r.tags, []);
  assert.match(r.hinweis, /nicht freigeschaltet/);
  assert.equal(s.aufrufe.some(a => a.shop), false);
});

test('Freigeschaltet, aber ohne Katalog: keine Tags', async () => {
  const s = schein({ katalog: false });
  const r = await produktTagsSuchen(client(s), ['amara'], { holen: s.holen, shop: SHOP });
  assert.deepEqual(r.tags, []); assert.match(r.hinweis, /kein Katalog/);
});

test('Suche ordnet ueber die Produkt-ID zu: gleichnamiges fremdes Produkt bekommt keinen Tag', async () => {
  const s = schein();
  const r = await produktTagsSuchen(client(s), ['amara', 'fremd', 'lyra', 'weg', 'amara'], { holen: s.holen, shop: SHOP });
  assert.deepEqual(r.tags, ['9002']);
  assert.match(r.hinweis, /fremd, lyra, weg/);
  const suche = s.aufrufe.find(a => a.pfad === '/IG/catalog_product_search');
  assert.equal(suche.body.catalog_id, 'K1'); assert.equal(suche.body.q, 'Amara Eiche');
  assert.equal(s.aufrufe.filter(a => a.pfad === '/IG' && a.methode === 'GET').length, 1, 'Freischaltung nur einmal je Client gefragt');
});

test('Reel traegt Tags ohne Position, Einzelbild mit Position, Karussell nur am ersten Bild', async (t) => {
  const { datei } = bild(t);
  const s = schein();
  const c = client(s);
  const reel = await c.instagram({ format: 'reel', text: 'R', fotos: [], videoDatei: datei, produktTags: ['9002', '9001', '9002'] });
  assert.deepEqual(JSON.parse(s.igMedia()[0].body.product_tags), [{ product_id: '9002' }, { product_id: '9001' }]);
  assert.equal(reel.produktTags, 2);

  await c.instagram({ format: 'feed', text: 'B', fotos: [{ url: 'https://cdn.fb/1.jpg' }], produktTags: ['9002'] });
  assert.deepEqual(JSON.parse(s.igMedia()[1].body.product_tags), [{ product_id: '9002', x: 0.5, y: 0.85 }]);

  await c.instagram({ format: 'karussell', text: 'K', fotos: [{ url: 'https://cdn.fb/1.jpg' }, { url: 'https://cdn.fb/2.jpg' }], produktTags: ['9002'] });
  const [erstes, zweites, eltern] = s.igMedia().slice(2);
  assert.ok(erstes.body.product_tags); assert.equal(zweites.body.product_tags, undefined); assert.equal(eltern.body.product_tags, undefined);
});

test('Story bekommt nie Tags, ohne Tags bleibt der Aufruf wie bisher', async () => {
  const s = schein();
  const c = client(s);
  const story = await c.instagram({ format: 'story', text: '', fotos: [{ url: 'https://cdn.fb/1.jpg' }], produktTags: ['9002'] });
  assert.equal(s.igMedia()[0].body.product_tags, undefined); assert.equal(story.produktTags, undefined);
  await c.instagram({ format: 'feed', text: 'B', fotos: [{ url: 'https://cdn.fb/1.jpg' }] });
  assert.equal(s.igMedia()[1].body.product_tags, undefined);
});

test('Lehnt Meta die Tags ab, erscheint der Beitrag ohne sie - genau einmal', async (t) => {
  const { datei } = bild(t);
  const s = schein({ tagsAblehnen: true });
  const r = await veroeffentliche(client(s), { beitrag: { format: 'feed', plattformen: ['instagram'] }, dateien: [{ datei, art: 'bild' }], texte: { instagram: 'IG' }, produktTags: ['9002'] });
  assert.equal(r.fertig, true);
  assert.equal(r.ergebnis.instagram.produktTags, 0); assert.match(r.ergebnis.instagram.tagFehler, /Invalid product tag/);
  assert.equal(s.aufrufe.filter(a => a.pfad === '/IG/media_publish').length, 1);
  assert.equal(s.igMedia()[1].body.product_tags, undefined);
});

test('Ablauf: Produkte des Beitrags werden zu Tags am Instagram-Beitrag', async (t) => {
  const { dir } = bild(t);
  const db = testDb(t);
  const { id } = db.inhaltAnlegen({ quelle: 'shopify', typ: 'raumidee', titel: 'Amara', produkt_handle: 'amara', einwilligung: true, daten: { produkte: ['amara', 'fremd'] } });
  db.inhaltAendern(id, { status: 'IN_PRUEFUNG' }); db.inhaltAendern(id, { status: 'CONTENT_ERSTELLT' });
  const rel = path.join('medien', String(id), 'beitrag-1', '01.jpg');
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), 'jpg');
  const b = db.beitragAnlegen({ inhalt_id: id, format: 'feed', plattformen: ['instagram'], text: 'Ein ruhiger Boden in Eiche für das Wohnzimmer. Im Shop ansehen.', hashtags: '#a #b #c #d', medien: [{ pfad: rel, art: 'bild', quellen: [] }], geplant_am: '2026-10-01T07:00:00.000Z' });
  db.beitragAendern(b, { status: 'GEPLANT' });

  // Der Ablauf fragt den Shop unter BETRIEB.shop - auf den Schein umlenken.
  const s = schein();
  const holen = (url, init) => s.holen(String(url).replace('https://www.teppich-paradies.net', SHOP), init);
  const meldungen = [];
  const bericht = await veroeffentlicheFaellige(db, { jetzt: new Date('2026-10-01T08:00:00Z'), dir, client: client({ holen }), holen, melde: m => meldungen.push(m) });
  assert.equal(bericht.veroeffentlicht.length, 1, JSON.stringify(bericht));
  const container = s.igMedia()[0];
  assert.deepEqual(JSON.parse(container.body.product_tags), [{ product_id: '9002', x: 0.5, y: 0.85 }]);
  assert.ok(meldungen.some(m => /fremd/.test(m)), 'nicht gefundene Produkte werden gemeldet');
  assert.equal(db.beitrag(b).ergebnis.instagram.produktTags, 1);
});
