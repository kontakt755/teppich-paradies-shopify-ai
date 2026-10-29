// Voruebergehender Geduld-Hinweis zu Musterbestellungen (Benutzer 28.10.2026):
// snippets/tp-muster-hinweis, abschaltbar ueber "TP Versand"
// (tp_muster_hinweis_aktiv, tp_muster_hinweis_text). Erscheint unter dem
// Muster-Knopf (tp-muster-cta und Rollware-Rechner), auf der Musterseite und
// im Warenkorb mit mindestens einem Muster.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = name => readFileSync(path.join(root, name), 'utf8');

const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
for (const tag of ['doc', 'stylesheet']) engine.registerTag(tag, {
  parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
  render() { return ''; },
});
engine.registerFilter('money', cent => `${(cent / 100).toFixed(2).replace('.', ',')} €`);

const schema = JSON.parse(read('config/settings_schema.json'));
const versand = schema.find(gruppe => gruppe.name === 'TP Versand');
const einstellung = id => versand.settings.find(s => s.id === id);
const STANDARDTEXT = einstellung('tp_muster_hinweis_text').default;

const globals = (settings = {}) => ({
  settings: {
    tp_muster_hinweis_aktiv: true,
    tp_muster_hinweis_text: STANDARDTEXT,
    tp_telefon_schema: '+49 3301 5733720',
    tp_versand_frei_ab: 50,
    ...settings,
  },
  shop: { email: 'kontakt@teppich-paradies.net' },
});
const hinweis = settings => engine.parseAndRender("{% render 'tp-muster-hinweis', kontext: 'produkt' %}", {}, { globals: globals(settings) });

const item = (sample = false) => ({ sku: sample ? 'M-123' : 'B123', properties: {}, variant: { metafields: { custom: {} } }, product: { type: 'Teppich', metafields: { custom: {} } } });
const warenkorb = (items, total = 0) => engine.parseAndRender(read('snippets/tp-cart-versandhinweis.liquid'),
  { cart: { items, total_price: total }, pages: {} }, { globals: globals() });

test('Einstellungen in TP Versand: Schalter standardmaessig an, Text ohne feste Dauer', () => {
  assert.equal(einstellung('tp_muster_hinweis_aktiv').type, 'checkbox');
  assert.equal(einstellung('tp_muster_hinweis_aktiv').default, true);
  assert.equal(einstellung('tp_muster_hinweis_text').type, 'textarea');
  assert.match(STANDARDTEXT, /Geduld/);
  assert.doesNotMatch(STANDARDTEXT, /\d/, 'keine Zahl, also keine Zusage einer Dauer');
});

test('Hinweis nennt Text, klickbare E-Mail und Telefon aus den Kontaktdaten', async () => {
  const html = (await hinweis()).replace(/\s+/g, ' ');
  assert.match(html, /<div class="tp-muster-hinweis tp-muster-hinweis--produkt" role="note">/);
  assert.ok(html.includes(STANDARDTEXT));
  assert.match(html, /Fragen zu Ihrer Musterbestellung\? Schreiben Sie uns an <a href="mailto:kontakt@teppich-paradies\.net">kontakt@teppich-paradies\.net<\/a> oder rufen Sie an: <a href="tel:\+4933015733720">03301 573 37 20<\/a>\./);
});

test('Telefon in anderem Format: Link bleibt waehlbar, Anzeige national', async () => {
  const html = await hinweis({ tp_telefon_schema: '+49 30 1234567-0' });
  assert.match(html, /<a href="tel:\+493012345670">030 1234567-0<\/a>/);
  assert.doesNotMatch(await hinweis({ tp_telefon_schema: '' }), /tel:/);
});

test('Ausgeschaltet oder ohne Text: keine Ausgabe', async () => {
  assert.equal((await hinweis({ tp_muster_hinweis_aktiv: false })).trim(), '');
  assert.equal((await hinweis({ tp_muster_hinweis_text: '' })).trim(), '');
});

test('Text aus dem Editor wird maskiert', async () => {
  const html = await hinweis({ tp_muster_hinweis_text: 'Bitte <b>Geduld</b>' });
  assert.match(html, /Bitte &lt;b&gt;Geduld&lt;\/b&gt;/);
});

test('Warenkorb: Hinweis bei reinen Musterkoerben und gemischten Koerben, nicht ohne Muster', async () => {
  assert.match(await warenkorb([item(true)]), /tp-muster-hinweis--warenkorb/);
  assert.match(await warenkorb([item(true), item()], 4000), /tp-muster-hinweis--warenkorb/);
  assert.doesNotMatch(await warenkorb([item()], 4000), /tp-muster-hinweis/);
});

test('Eingebunden unter dem Muster-Knopf (beide Zweige) und auf der Musterseite', () => {
  const block = read('blocks/tp-muster-cta.liquid');
  const aufruf = block.indexOf("render 'tp-muster-hinweis', kontext: 'produkt'");
  assert.ok(aufruf > 0, 'Aufruf im Muster-Knopf fehlt');
  // nach dem Link und ausserhalb von "if tp_mc_anfrage", damit auch die Musteranfrage ihn zeigt
  assert.ok(aufruf > block.indexOf('</a>'), 'Hinweis steht nicht unter dem Knopf');
  assert.ok(aufruf < block.indexOf("{% if product.template_suffix == 'einfassung' %}"));
  // Rollenware (Teppichboden, Rollenvinyl): dort ist tp-muster-cta abgeschaltet, der Knopf sitzt im Rechner
  const rechner = read('blocks/tp-rollware-rechner.liquid');
  const rcKnopf = rechner.indexOf('<a class="tp-rwc-muster"');
  const rcAufruf = rechner.indexOf("render 'tp-muster-hinweis', kontext: 'produkt'");
  assert.ok(rcKnopf > 0 && rcAufruf > rcKnopf, 'Hinweis fehlt unter dem Muster-Knopf im Rollware-Rechner');
  assert.ok(rcAufruf < rechner.indexOf('tp-rwc-infozeile', rcKnopf), 'Hinweis gehoert in den Musterbereich, vor die Infozeile');
  const seite = read('sections/tp-sample-checkout.liquid');
  const info = seite.indexOf('data-sample-hersteller');
  const seitenAufruf = seite.indexOf("render 'tp-muster-hinweis', kontext: 'musterseite'");
  assert.ok(info > 0 && seitenAufruf > info, 'Hinweis gehoert direkt unter die Versandzeile der Musterseite');
  assert.ok(seitenAufruf < seite.indexOf('</header>'));
});

test('Telefonnummer bricht nicht um, die Mailadresse darf (Fehlersuche 2026-10-28)', () => {
  const css = read('snippets/tp-muster-hinweis.liquid').split('{% stylesheet %}')[1];
  assert.match(css, /\.tp-muster-hinweis__kontakt a\[href\^="tel:"\]\s*\{\s*white-space: nowrap;/);
  assert.match(css, /\.tp-muster-hinweis__kontakt a \{[^}]*overflow-wrap: anywhere;/);
});
