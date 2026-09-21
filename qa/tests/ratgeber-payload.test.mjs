import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { baueEingabe, ladeArtikel, ohneKommentare, pruefeFreigabe } from '../../scripts/ratgeber-payload.mjs';

const meta = (extra = {}) => ({
  handle: 'test-artikel', title: 'Testartikel', tags: ['Planen & Messen'], excerpt: 'Kurz.',
  seo: { title: 'SEO-Titel', description: 'SEO-Beschreibung' }, status: 'freigegeben',
  metafields: { kurzantwort: 'Die Antwort.', art: 'Planung', dauer: '', material: [], cta: ['rechner'], kollektion: 'teppichboden', zubehoer_kollektion: '', geprueft_von: '', stand: '' },
  ...extra,
});
const HTML = '<h2>Abschnitt</h2>\n<p>Text.</p>';
const OPT = { blogId: 'gid://shopify/Blog/1', kollektionen: { teppichboden: 'gid://shopify/Collection/9' } };

test('Entwurf wird nicht angelegt', () => {
  assert.match(pruefeFreigabe(meta({ status: 'entwurf' }), HTML).join(' '), /status ist "entwurf"/);
  assert.throws(() => baueEingabe(meta({ status: 'entwurf' }), HTML, OPT), /nicht anlegbar/);
});

test('eine einzige offene PRUEFEN-Marke sperrt den Artikel, auch bei Status freigegeben', () => {
  const html = `${HTML}<!-- PRUEFEN: stimmt das? -->`;
  assert.match(pruefeFreigabe(meta(), html).join(' '), /1 offene PRUEFEN-Marke/);
  assert.throws(() => baueEingabe(meta(), html, OPT), /PRUEFEN/);
});

test('h1 im Text und unbekannte Auswahlwerte werden abgelehnt', () => {
  assert.match(pruefeFreigabe(meta(), '<h1>Doppelt</h1>').join(' '), /h1 im Text/);
  const m = meta(); m.metafields.cta = ['rechner', 'gutschein']; m.metafields.art = 'Werbung';
  const gruende = pruefeFreigabe(m, HTML).join(' ');
  assert.match(gruende, /cta enthaelt unbekannte Werte: gutschein/);
  assert.match(gruende, /art "Werbung"/);
});

test('HTML-Kommentare gehen nicht in den Shop', () => {
  assert.equal(ohneKommentare('<p>a</p> <!-- Notiz -->\n<p>b</p>'), '<p>a</p>\n<p>b</p>');
});

test('freigegebener Artikel: unveroeffentlicht, Suffix ratgeber, richtige Metafeld-Typen', () => {
  const { article } = baueEingabe(meta(), `${HTML}<!-- erledigte Notiz -->`, OPT);
  assert.equal(article.isPublished, false);
  assert.equal(article.templateSuffix, 'ratgeber');
  assert.equal(article.blogId, OPT.blogId);
  assert.ok(!article.body.includes('<!--'));
  const feld = (ns, key) => article.metafields.find(f => f.namespace === ns && f.key === key);
  assert.equal(feld('ratgeber', 'kurzantwort').type, 'multi_line_text_field');
  assert.deepEqual(JSON.parse(feld('ratgeber', 'cta').value), ['rechner']);
  assert.equal(feld('ratgeber', 'kollektion').value, 'gid://shopify/Collection/9');
  assert.equal(feld('global', 'title_tag').value, 'SEO-Titel');
  // Leere Felder werden nicht als leere Metafelder angelegt
  assert.equal(feld('ratgeber', 'dauer'), undefined);
  assert.equal(feld('ratgeber', 'material'), undefined);
  assert.equal(feld('ratgeber', 'zubehoer_kollektion'), undefined);
});

test('fehlende Kollektions-GID bricht ab statt den Verweis still wegzulassen', () => {
  assert.throws(() => baueEingabe(meta(), HTML, { blogId: OPT.blogId, kollektionen: {} }), /Kollektion "teppichboden".*fehlt/);
});

test('die echten Pilotartikel sind Entwuerfe und bleiben gesperrt, solange PRUEFEN-Marken offen sind', () => {
  const ordner = path.resolve(import.meta.dirname, '../../content/ratgeber/teppichboden');
  const artikel = ladeArtikel(ordner);
  assert.ok(artikel.length >= 4);
  for (const { meta: m, html } of artikel) {
    assert.ok(fs.existsSync(path.join(ordner, `${m.handle}.html`)), `${m.handle}: Dateiname und handle stimmen ueberein`);
    if (html.includes('PRUEFEN') || m.status !== 'freigegeben') assert.ok(pruefeFreigabe(m, html).length > 0, `${m.handle} muesste gesperrt sein`);
  }
});
