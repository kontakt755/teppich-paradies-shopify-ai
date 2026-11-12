import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Auf Rechner-Seiten (Rollenware, Teppich nach Mass) gibt es genau eine
// klebende Kaufleiste: die des Themes (Inhaberentscheidung 2026-09-19). Der
// Konflikt-Merge von PR #371 hatte zwei Entwuerfe nebeneinander hinterlassen -
// die Theme-Leiste war per Liquid abgeschaltet, die eingebaute des Rechners
// verloren; live gab es dadurch gar keine. Liquid laesst sich hier nicht
// ausfuehren, geprueft wird die Verdrahtung.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (...p) => readFileSync(join(root, ...p), 'utf8');
const rechner = lies('blocks', 'tp-rollware-rechner.liquid');
const section = lies('sections', 'product-information.liquid');
const sticky = lies('assets', 'sticky-add-to-cart.js');

test('der Rollenrechner ist als Kaufweg mit Zielknopf markiert', () => {
  assert.match(rechner, /class="tp-rwc-\{\{ tp_rc_id \}\} tp-kaufweg"/);
  assert.match(rechner, /<button[^>]*\bdata-cta\b[^>]*\bdata-add-to-cart\b/);
  assert.match(rechner, /data-total/);
});

test('der Rollenrechner bringt keine eigene Kaufleiste mehr mit', () => {
  assert.doesNotMatch(rechner, /data-kaufleiste|tp-rwc-kaufleiste|aktualisiereKaufleiste/);
});

test('die Theme-Leiste wird auf Rechner-Seiten nicht mehr abgeschaltet', () => {
  assert.doesNotMatch(section, /tp_sticky_konfigurator/);
  // Nur interne Musterprodukte haben keinen direkten Kaufweg auf ihrer PDP.
  assert.match(section, /\{% if section\.settings\.enable_sticky_add_to_cart and product\.type != 'Musterservice' %\}/);
});

test('die Theme-Leiste findet den Kaufweg und bleibt ohne Ziel aus', () => {
  assert.match(sticky, /querySelector\('\.tp-kaufweg'\)/);
  assert.match(sticky, /querySelector\('\[data-add-to-cart\]'\)/);
  assert.match(sticky, /if \(!buyButtonsBlock\) return;/);
});

// Der Kaufknopf bleibt sichtbar und meldet beim Klick, was fehlt (#301) -
// gesperrt ist er nur waehrend des laufenden Warenkorb-Aufrufs. Seit Rundgang
// R2 #76 ohne echtes disabled: ein disabled-Knopf verliert den Tastaturfokus,
// und nach dem Schliessen des Warenkorbs stand der Fokus am Seitenanfang.
test('der Kaufknopf bleibt sichtbar; gesperrt nur waehrend /cart/add.js, ohne disabled', () => {
  // Nur echte Zuweisungen zaehlen - der Liquid-Kommentar nennt das alte Verhalten.
  assert.doesNotMatch(rechner, /^\s*cta\.hidden\s*=/m);
  assert.doesNotMatch(rechner, /^\s*cta\.disabled\s*=/m);
  assert.match(rechner, /if \(inFlight \|\| cta\.tpGesperrt\) return;/);
  assert.match(rechner, /inFlight = true;\s*\n\s*sperren\(true\);/);
  // Sperre = aria-disabled (Vorleseprogramm, Kaufleiste) plus Optik von :disabled.
  assert.match(rechner, /cta\.classList\.toggle\('is-busy', an\);\s*\n\s*if \(an\) cta\.setAttribute\('aria-disabled', 'true'\);/);
  assert.match(rechner, /\.tp-rwc-cta\.is-busy \{[^}]*cursor: not-allowed/);
  assert.match(sticky, /target\.getAttribute\('aria-disabled'\) === 'true'/);
});

// Live-Gegenprobe w-061: Die Leiste las das Stueck aus [data-stueck-mass],
// das der Rechner seit PR #691 nicht mehr rendert. Ohne Farbwaehler blieb die
// Zeile auf der Startvariante ("200 cm"), obwohl 400 cm gewaehlt waren.
// Jeder [data-...]-Selektor der Leiste braucht deshalb ein Gegenstueck im Theme.
test('jeder Rechner-Selektor der Leiste existiert im Theme-Markup', () => {
  const markup = ['blocks', 'snippets', 'sections']
    .flatMap((ordner) => readdirSync(join(root, ordner))
      .filter((datei) => datei.endsWith('.liquid'))
      .map((datei) => lies(ordner, datei)))
    .join('\n');
  const selektoren = [...new Set([...sticky.matchAll(/\[(data-[a-z-]+)/g)].map((m) => m[1]))];
  assert.ok(selektoren.length > 0);
  for (const attr of selektoren) {
    assert.ok(new RegExp(`\\b${attr}\\b`).test(markup), `${attr} fehlt im Markup`);
  }
  assert.doesNotMatch(sticky, /data-stueck/);
});

test('der Rollenrechner meldet Breite und Laenge am Kaufweg', () => {
  assert.match(rechner, /class="tp-rwc-\{\{ tp_rc_id \}\} tp-kaufweg"[^>]*data-tp-breite=""[^>]*data-tp-laenge=""/);
  assert.match(rechner, /root\.setAttribute\('data-tp-breite', w > 0 && !wErr \? String\(w\) : ''\);/);
  assert.match(rechner, /root\.setAttribute\('data-tp-laenge', valid && w > 0 \? String\(len\) : ''\);/);
  assert.match(sticky, /attributeFilter: \['data-tp-breite', 'data-tp-laenge'\]/);
});

// Fuehrt die echte Methode #syncRechnerVariantLine in einem VM-DOM-Adapter aus.
function variantenzeile({ attrs, farbe = '', start = '200 cm' }) {
  const anfang = sticky.indexOf('  #syncRechnerVariantLine(target) {');
  const ende = sticky.indexOf('\n  #syncGalleryImage()', anfang);
  assert.ok(anfang >= 0 && ende > anfang, 'Methodengrenzen nicht gefunden');
  const methode = sticky.slice(anfang, ende).trim().replace(/^#syncRechnerVariantLine/, 'function syncRechnerVariantLine');
  const context = vm.createContext({ attrs, farbe, start });
  return JSON.parse(vm.runInContext(`
    class HTMLElement {
      constructor(a = {}) {
        this.a = a; this.style = {}; this.title = ''; this.textContent = '';
        this.dataset = {};
        for (const [k, v] of Object.entries(a)) {
          this.dataset[k.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
        }
      }
      hasAttribute(n) { return n in this.a; }
    }
    class HTMLInputElement extends HTMLElement {}
    ${methode}
    const kaufweg = new HTMLElement(attrs);
    const zeile = new HTMLElement();
    zeile.textContent = start;
    const input = Object.assign(new HTMLInputElement(), { value: farbe });
    const section = { querySelector: () => (farbe ? input : null) };
    const leiste = {
      querySelector: (s) => (s === '.sticky-add-to-cart__variant' ? zeile : null),
      closest: () => section,
    };
    syncRechnerVariantLine.call(leiste, { closest: () => kaufweg });
    JSON.stringify({ text: zeile.textContent, title: zeile.title });
  `, context, { timeout: 1000 }));
}

test('Leiste zeigt das Stueck aus dem Rechner, nie die Startbreite', () => {
  const stueck = { 'data-tp-breite': '400', 'data-tp-laenge': '205' };
  assert.deepEqual(variantenzeile({ attrs: stueck }),
    { text: '400 × 205 cm', title: 'Breite 400 cm · Länge 205 cm' });
  assert.equal(variantenzeile({ attrs: stueck, farbe: 'Sand Hell' }).text, '400 × 205 cm · Sand Hell');
  assert.equal(variantenzeile({ attrs: { 'data-tp-breite': '1250', 'data-tp-laenge': '1500' } }).text, '1.250 × 1.500 cm');
  // Ohne gueltige Laenge: die gewaehlte Breite statt der Startvariante.
  assert.equal(variantenzeile({ attrs: { 'data-tp-breite': '400', 'data-tp-laenge': '' } }).text, 'Breite 400 cm');
  // Raummass ohne Breite: lieber leer als falsch.
  assert.equal(variantenzeile({ attrs: { 'data-tp-breite': '', 'data-tp-laenge': '' } }).text, '');
});

test('Einfass-Konfigurator meldet kein Stueck: Zeile nur mit Farbe, sonst unveraendert', () => {
  assert.equal(variantenzeile({ attrs: { 'data-tp-ek': '' }, start: 'Grau' }).text, 'Grau');
  assert.equal(variantenzeile({ attrs: { 'data-tp-ek': '' }, farbe: 'Anthrazit' }).text, 'Anthrazit');
});

// Handy-Kaufweg 12.11.2026: Farbe, Mass, Kauf- und Musterknopf lagen bei 390 px
// erst ab dem zweiten Bildschirm. Fehlt ein Mass, steht die Leiste ("Muster",
// "Masse eingeben") deshalb schon, bevor der Kaufweg erreicht ist - nur auf dem
// Handy, nur unterhalb des Viewports und nie kaufbereit (kein ungesehener Kauf).
test('fruehe Leiste nur auf dem Handy, unterhalb und mit fehlendem Mass', () => {
  const regel = sticky.match(/#leisteZeigen\(rect\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(regel, /rect\.bottom < 0 \|\| rect\.top < 0/);
  assert.match(regel, /rect\.top >= window\.innerHeight/);
  assert.match(regel, /matchMedia\('\(max-width: 749px\)'\)/);
  assert.match(regel, /this\.#targetIncomplete\(this\.#targetAddToCartButton\)/);
  // alle drei Einblend-Stellen nutzen dieselbe Regel
  assert.equal((sticky.match(/this\.#leisteZeigen\(rect\)/g) || []).length, 3);
});

// w-376: Der Einfass-Konfigurator verbirgt seinen Knopf ohne gueltige Masse.
// Die Leiste fuehrt dann selbst zum ersten fehlenden Feld - nie bei
// Anfrage-Formen oder wenn der Knopf aus anderem Grund fehlt.
test('Konfigurator: Leiste kennt das fehlende Massfeld', () => {
  const rumpf = sticky.match(/#ekMassFeld\(target\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  const ekMassFeld = vm.runInNewContext(`(target) => {${rumpf}}`);
  const feld = (value, { invalid = false, versteckt = false } = {}) => ({
    value, getAttribute: (a) => (a === 'aria-invalid' ? String(invalid) : null),
    closest: (s) => (s === '[hidden]' && versteckt ? {} : null),
  });
  const knopf = (felder, { hidden = true, konfigHidden = false } = {}) => {
    const ek = { querySelector: () => ({ hidden: konfigHidden }), querySelectorAll: () => felder };
    return { hidden, closest: (s) => (s === '[data-tp-ek]' ? ek : null) };
  };
  const b = feld(''), l = feld('');
  assert.equal(ekMassFeld(knopf([b, l])), b);
  const l2 = feld('400', { invalid: true });
  assert.equal(ekMassFeld(knopf([feld('200'), l2])), l2);
  // Rund: verstecktes Laengenfeld zaehlt nicht
  assert.equal(ekMassFeld(knopf([feld('200'), feld('', { versteckt: true })])), null);
  assert.equal(ekMassFeld(knopf([b, l], { hidden: false })), null);
  assert.equal(ekMassFeld(knopf([b, l], { konfigHidden: true })), null);
  assert.equal(ekMassFeld({ hidden: true, closest: () => null }), null);
  assert.equal(ekMassFeld(null), null);
  // Klick geht nie an den verborgenen Knopf
  assert.match(sticky, /const ekFeld = this\.#ekMassFeld\(target\);\s*\n\s*if \(ekFeld\) \{[\s\S]*?return;/);
});

// Codex-Review #2182: Wechsel zu einer Anfrage-Form aendert nur [data-konfig],
// nicht den Knopf - die Leiste muss das trotzdem mitbekommen.
test('Konfigurator: Leiste beobachtet hidden am Konfigurator', () => {
  assert.match(sticky, /kaufweg\.querySelector\('\[data-konfig\]'\);\s*\n\s*if \(konfig\) this\.#targetStateObserver\.observe\(konfig, \{ attributes: true, attributeFilter: \['hidden'\] \}\);/);
});
