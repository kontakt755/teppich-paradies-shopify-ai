// Mustergebuehr-Test 01.12.2026 bis 31.01.2027 (Inhaber 19.11.2026): Muster kosten 4,99 € Versand
// je Bestellung, ab 150 € Warenwert angerechnet. Im Theme verspricht keine Stelle mehr kostenlose Muster.
// Dieser Test ist der Waechter dafuer (Plan 4.7) und prueft zusaetzlich, dass der Preis an jedem Einstieg steht.
// Aelter: Nr. 21 (Inhaber 03.11.2026) - "2 Farben eines Produkts" oder eine Mengenangabe ohne "je Bestellung"
// klang nach etwas anderem; die Regel heisst "Bis zu zwei Muster je Bestellung".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ALT = /Bis zu 2 (Muster kostenlos|Farben)|Bis zu zwei (Farben|Farbmuster)|bis zu zwei Muster (kostenlos|schicken|sind)/i;

// Reichweite: alles, was im Shop ausgeliefert wird (Plan 4.7: auch assets, locales, layout, config).
const ORDNER = ['sections', 'snippets', 'blocks', 'templates', 'assets', 'locales', 'layout', 'config'];
const ENDUNGEN = /\.(liquid|json|js|css)$/;

function dateien() {
  const aus = [];
  for (const o of ORDNER) {
    for (const n of readdirSync(path.join(root, o))) {
      const rel = `${o}/${n}`;
      if (statSync(path.join(root, rel)).isFile() && ENDUNGEN.test(n)) aus.push(rel);
    }
  }
  return aus;
}

// Verboten: kostenlos / gratis / kostenfrei / versandkostenfrei im selben Satz wie "Muster".
// Satzgrenzen: . ! ? ; | Zeilenumbruch, Komma, Tags, Anfuehrungszeichen und " – " / " · " als Gedankenstrich.
// "kostenloses-muster" ist nur der Handle des Sammelprodukts und zaehlt nicht.
const VERBOTEN = /kostenlos|gratis|kostenfrei|versandkostenfrei/i;
const SATZGRENZE = /[.!?;|,<>"\n\\]|\s[–—·]\s/;
// Ausnahmen (kurze Liste): Ladenberatung bleibt kostenlos, Kautschuk hat keine Muster.
// Herstellermuster (Inhaber 21.11.2026): D, E, H schicken kostenlos direkt an den Kunden.
// Der freigegebene Herstellersatz enthaelt ein Komma und wuerde sonst an "Muster kostenlos" zerbrechen.
const HERSTELLERSATZ = /Muster kostenlos inklusive Versand, direkt vom Hersteller/g;
const AUSNAHMEN = [/im Laden/i, /keine kostenlosen Muster hinterlegt/i, /Hersteller/i];

function verstoesse(rel) {
  const text = readFileSync(path.join(root, rel), 'utf8').replace(/kostenloses-muster/gi, 'sammelprodukt').replace(HERSTELLERSATZ, 'Herstellermuster');
  const treffer = [];
  for (const satz of text.split(SATZGRENZE)) {
    if (!/muster/i.test(satz) || !VERBOTEN.test(satz)) continue;
    if (AUSNAHMEN.some((a) => a.test(satz))) continue;
    treffer.push(satz.trim().slice(0, 120));
  }
  return treffer;
}

test('Shoptexte und Social-Vorlage nennen die Musterregel einheitlich', () => {
  const offen = dateien().filter((d) => ALT.test(readFileSync(path.join(root, d), 'utf8')));
  assert.deepEqual(offen, []);
  assert.doesNotMatch(readFileSync(path.join(root, 'social/lib/texte.mjs'), 'utf8'), /bis zu 3 Muster/);
});

test('Waechter: kein Gratisversprechen bei Mustern im Theme', () => {
  const offen = {};
  for (const d of dateien()) {
    const t = verstoesse(d);
    if (t.length) offen[d] = t;
  }
  assert.deepEqual(offen, {});
});

test('Waechter erkennt die alten Wortlaute, laesst Ladenberatung und Kautschuk durch', () => {
  const pruefe = (text) => {
    const satz = text.replace(/kostenloses-muster/gi, 'sammelprodukt').replace(HERSTELLERSATZ, 'Herstellermuster').split(SATZGRENZE)
      .filter((s) => /muster/i.test(s) && VERBOTEN.test(s) && !AUSNAHMEN.some((a) => a.test(s)));
    return satz.length;
  };
  for (const alt of [
    'Kostenloses Muster anfragen',
    'Bis zu zwei Muster je Bestellung kostenlos, versandkostenfrei',
    'Muster sind gratis',
    'Kostenloser Musterversand innerhalb Deutschlands.',
    'Vinyl-Muster sind kostenlos – höchstens 2 je Bestellung.',
    'Muster verschicken wir innerhalb Deutschlands kostenlos.',
    'Muster kostenlos zu Ihnen nach Hause.',
  ]) assert.equal(pruefe(alt), 1, alt);
  for (const ok of [
    'Im Laden ansehen und beraten lassen: kostenlos.',
    'Muster im Laden ansehen: kostenlos.',
    'Für die angebotenen Kautschukböden sind keine kostenlosen Muster hinterlegt.',
    'Ab 50 € Bestellwert versandkostenfrei. Muster verschicken wir für 4,99 €.',
    'Muster kostenlos inklusive Versand, direkt vom Hersteller',
    'Muster: vom Hersteller kostenlos, sonst 4,99 € Versand',
    "var SAMPLE_HANDLE = 'kostenloses-muster';",
  ]) assert.equal(pruefe(ok), 0, ok);
});

// An jedem Einstieg, an dem der Kunde die Musterbestellung beginnt, steht der Preis (Plan 3.3).
test('Der Preis 4,99 € steht an jedem Einstieg der Musterbestellung', () => {
  const MIT_PREIS = [
    'sections/header-group.json', 'sections/tp-topbar.liquid', 'sections/tp-start-muster.liquid',
    'snippets/tp-drawer-nav.liquid', 'blocks/tp-muster-cta.liquid', 'blocks/tp-rollware-rechner.liquid',
    'blocks/tp-teppich-versand.liquid', 'snippets/tp-farbauswahl.liquid',
    'snippets/tp-teppichboden-kampagne-kasten.liquid', 'sections/tp-sample-checkout.liquid',
    'sections/contact-form.liquid', 'snippets/tp-cart-versandhinweis.liquid', 'sections/tp-shipping-delivery.liquid',
  ];
  const ohne = MIT_PREIS.filter((d) => !readFileSync(path.join(root, d), 'utf8').includes('4,99 €'));
  assert.deepEqual(ohne, []);
});

test('Anrechnung ab 150 € steht in Topbar, Musterseite, Warenkorb und Versandseite', () => {
  for (const d of ['sections/header-group.json', 'sections/tp-sample-checkout.liquid', 'snippets/tp-cart-versandhinweis.liquid', 'sections/tp-shipping-delivery.liquid']) {
    assert.match(readFileSync(path.join(root, d), 'utf8'), /ab 150 € (Einkauf|Warenwert)/i, d);
  }
});

test('Produktvorlagen: Knopf "Muster bestellen" mit Preiszeile', () => {
  // Die Vorlagen beginnen mit einem Kommentarblock und sind deshalb kein reines JSON.
  const vorlagen = readdirSync(path.join(root, 'templates')).filter((n) => /^product.*\.json$/.test(n));
  const mitKnopf = vorlagen.filter((n) => readFileSync(path.join(root, 'templates', n), 'utf8').includes('"tp-muster-cta"'));
  assert.ok(mitKnopf.length >= 8, `nur ${mitKnopf.length} Produktvorlagen mit Musterknopf`);
  for (const n of mitKnopf) {
    const t = readFileSync(path.join(root, 'templates', n), 'utf8');
    assert.match(t, /"label": "Muster bestellen"/, n);
    assert.match(t, /"hinweis": "Musterversand 4,99 € je Bestellung"/, n);
  }
});

// Herstellermuster (Inhaber 21.11.2026): kostenlos nur dort, wo Liquid/JS es je Muster entscheiden.
test('Herstellermuster: Wortlaut kostenlos an Produkt, Farbauswahl, Teppich-Versand, Warenkorb, Musterseite, Versandseite', () => {
  const wort = /Muster kostenlos inklusive Versand, direkt vom Hersteller/;
  for (const d of ['blocks/tp-muster-cta.liquid', 'snippets/tp-farbauswahl.liquid', 'sections/tp-sample-checkout.liquid', 'snippets/tp-cart-versandhinweis.liquid']) {
    assert.match(readFileSync(path.join(root, d), 'utf8'), wort, d);
  }
  assert.match(readFileSync(path.join(root, 'blocks/tp-teppich-versand.liquid'), 'utf8'), /kostenlos inklusive Versand, direkt vom Hersteller/);
  assert.match(readFileSync(path.join(root, 'sections/tp-shipping-delivery.liquid'), 'utf8'), /Hersteller direkt an Sie schickt, sind kostenlos/);
  // bezahlt bleibt wie in #2254
  assert.match(readFileSync(path.join(root, 'blocks/tp-muster-cta.liquid'), 'utf8'), /Musterversand 4,99 € je Bestellung/);
});
