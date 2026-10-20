import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const source = read('blocks/tp-rollware-rechner.liquid');
const advice = read('assets/tp-produktberatung.js');
const locale = file => JSON.parse(read(file).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').replace(/^\s*\/\/.*$/gm, ''));
const de = locale('locales/de.json');

function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const begin = source.indexOf('{', start);
  let depth = 0, quote = '', comment = '';
  for (let i = begin; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (comment === '//') { if (char === '\n') comment = ''; continue; }
    if (comment === '/*') { if (char === '*' && next === '/') { comment = ''; i++; } continue; }
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; continue; }
    if (char === '/' && (next === '/' || next === '*')) { comment = char + next; i++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Funktionsende fehlt: ' + name);
}

class Element {
  constructor(value = '', tagName = 'INPUT') {
    this.value = value; this.tagName = tagName; this.textContent = ''; this.hidden = false;
    this.checked = false; this.options = [{}]; this.attributes = new Map(); this.listeners = new Map(); this.children = [];
    this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    this.parentNode = { querySelector: () => new Element('', 'SPAN') };
  }
  get firstChild() { return this.children[0]; }
  appendChild(node) { this.children.push(node); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  emit(name) { this.listeners.get(name)?.(); }
}

function calculator({ art = 'meter', width = '250', length = '1120', rollWidth = 400 } = {}) {
  const pure = vm.createContext({});
  vm.runInContext(read('assets/tp-rollware-art.js'), pure);
  vm.runInContext(read('assets/tp-raummass.js'), pure);
  const artRadio = new Element(art), widthRadio = new Element(String(rollWidth));
  const root = new Element();
  root.querySelector = selector => selector.includes('tp-rwc-art-') ? artRadio : selector.includes('tp-rwc-width-') ? widthRadio : null;
  const leiste = Object.fromEntries(['hoehe', 'an', 'felder', 'meter', 'hint', 'preis', 'umfang', 'meter-label', 'raumhinweis'].map(name => ['[data-leiste-' + name + ']', new Element()]));
  leiste['[data-leiste-hoehe]'].value = '10 cm';
  leiste['[data-leiste-meter-label]'].setAttribute('data-label-stueck', de.tp_roll_context.length_label);
  leiste['[data-leiste-meter-label]'].setAttribute('data-label-raum', de.tp_roll_context.room_perimeter_label);
  leiste['[data-leiste-raumhinweis]'].textContent = de.tp_roll_context.room_perimeter_hint;
  const haft = Object.fromEntries(['an', 'hint', 'preis', 'basis'].map(name => ['[data-haft-' + name + ']', new Element()]));
  const context = vm.createContext({ root, ART: pure.TPRollwareArt,
    wIdx: 1, widths: [400, 500], farbBreiten: [400, 500], fallbackWidthCm: 400, raumAnfrage: false,
    einheitAktiv: 'cm', MAX_LENGTH_CM: 5000, MIN_BESTELL_CM: 0, WUNSCH_MIN_CM: 50,
    lengthInput: new Element(length), wunschInput: new Element(width),
    lengthEcho: new Element(), wunschEcho: new Element(), wunschError: new Element(),
    errComma: new Element(), errMin: new Element(), errMax: new Element(), messRaum: new Element(), mindestHint: null,
    bahnenHint: new Element(), syncArtUi() {},
    leisteBox: { querySelector: selector => leiste[selector] ?? null },
    haftBox: { querySelector: selector => haft[selector] ?? null }, holzBox: null, formulaExtras: null, zubehoerBox: null,
    leisteVarianten: [{ id: 'pruefleiste', title: '10 cm', price: 795 }],
    haftVarianten: [{ id: 'pruefunterlage', title: '80 cm breit', breite: 80, price: 890 }],
    target: { options: ['Petrol', '400 cm'], price: 1000, einfassen: 'Verfügbar' },
    cmExact: false, data: { product_title: 'Prüfboden' },
    document: { createElement: tag => new Element('', tag.toUpperCase()), createTextNode: textContent => ({ textContent }) },
  });
  const names = ['artMode', 'selectedWidth', 'getEffectiveLengthCm', 'bahnenAktiv', 'bahnenLoeschen', 'zeigeBahnen',
    'markInvalid', 'zeigeGegenprobe', 'maxRaumBreite', 'maxFarbBreite', 'laengeAngehoben', 'fmt', 'fmtMeter', 'rateOf',
    'leisteHoehe', 'leisteStufe', 'leisteStufeFuer', 'leisteVariante', 'leisteMaterial', 'leisteStreifen', 'extrasAllowed', 'farbeText', 'updateExtras'];
  vm.runInContext(names.map(fn).join('\n'), context);
  const tierStart = source.indexOf('  var leisteStufen = (function () {');
  vm.runInContext(source.slice(tierStart, source.indexOf('  })();', tierStart) + 7), context);
  const apiStart = source.indexOf('  root.tpRwcBestellmass = function () {');
  vm.runInContext(source.slice(apiStart, source.indexOf('\n  };', apiStart) + 5), context);
  const calcStart = source.indexOf('  function calculate() {');
  const calcEnd = source.indexOf('\n    target = findVariant(w);', calcStart);
  const validate = source.slice(calcStart, calcEnd).replace(/\{\{ tp_rc_bestand_gefuehrt \| json \}\}/g, 'false') + '\n  }';
  vm.runInContext(validate, context);
  context.errComma.textContent = 'Bitte eine gültige Zahl eingeben.';
  const extras = () => context.updateExtras(context.selectedWidth(), context.getEffectiveLengthCm(), 0);
  return { root, c: context, leiste, haft, artRadio, widthRadio, RM: pure.TPRaummass, extras,
    split(n = 2, each = 560, text = '') {
      for (const [key, value] of Object.entries({ 'data-bahnen': n, 'data-bahn-laenge': each, 'data-bahn-breite': rollWidth, 'data-zuschnitt-text': text })) root.setAttribute(key, value);
      context.lengthInput.value = String(n * each); context.zeigeBahnen();
    },
  };
}

function advicePage(calc, language = de) {
  const listeners = new Map(), attrs = new Map(), color = new Element('Petrol (082)');
  const config = { title: 'Prüfboden', handle: 'pruefboden', url: '/products/pruefboden', options: [{ name: 'Farbe', value: 'Senf' }, { name: 'Breite', value: '400 cm' }], labels: language.tp_product_advice };
  const scope = { querySelector: () => ({ textContent: JSON.stringify(config) }) };
  const main = { querySelectorAll(selector) {
    assert(selector.includes('data-product-id="42"'));
    if (selector.startsWith('variant-picker')) return [];
    if (selector.startsWith('[id^=')) return [calc.root];
    if (selector.startsWith('[data-tp-farbwahl]')) return [{ querySelector: () => color }];
    throw new Error(selector);
  } };
  let mode = 'whatsapp';
  const link = { href: 'https://wa.me/4912345', getAttribute: name => name === 'data-tp-produkt-id' ? '42' : mode, closest: selector => selector === 'main' ? main : scope };
  const document = { documentElement: { hasAttribute: name => attrs.has(name), setAttribute: (name, value) => attrs.set(name, value) }, addEventListener: (name, handler) => listeners.set(name, handler) };
  vm.runInNewContext(advice, { document, window: { location: { origin: 'https://shop.example' } }, URL, URLSearchParams });
  return { link, color,
    activate() { listeners.get('click')({ target: { closest: () => link } }); },
    contact() { mode = 'kontakt'; link.href = 'https://shop.example/pages/kontakt?thema=verlegung'; },
    message() { return new URL(link.href).searchParams.get('text'); },
  };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('Echter Raumplan 550 × 660: API und beide Beratungswege bewahren 2 × 400 × 560 cm', () => {
  const p = calculator();
  const plan = p.RM.rolleVorschlag({ breite: 550, laenge: 660, rollen: [400, 500], raum: false });
  assert.deepEqual(plain(plan.zwei.stuecke.map(stueck => [stueck.breite, stueck.laenge])), [[400, 560], [400, 560]]);
  p.split(plan.zwei.stuecke.length, plan.zwei.stuecke[0].laenge);
  assert.deepEqual(plain(p.root.tpRwcBestellmass()), { art: 'meter', breite: 400, laenge: 1120, zuschnitt: { anzahl: 2, breite: 400, laenge: 560, text: '' } });
  const a = advicePage(p); a.activate();
  assert.match(a.message(), /Zuschnitt: 2 × \(400 × 560 cm\)/);
  a.contact(); a.activate();
  assert.equal(new URL(a.link.href).searchParams.get('zuschnitt'), '2 × (400 × 560 cm)');
  assert.equal(new URL(a.link.href).searchParams.has('raum'), false);
});

test('Echter Ein-Stück-Handler entfernt Zuschnitt aus API und bereits vorbereitetem Link', () => {
  const p = calculator(); p.split();
  const a = advicePage(p); a.contact(); a.activate();
  const button = p.c.bahnenHint.children.find(child => child.tagName === 'BUTTON');
  assert.equal(button.textContent, 'Lieber als ein Stück'); button.emit('click');
  assert.equal(p.root.tpRwcBestellmass().zuschnitt, undefined);
  a.activate(); assert.equal(new URL(a.link.href).searchParams.has('zuschnitt'), false);
  p.extras(); assert.equal(p.leiste['[data-leiste-meter]'].value, 31);
  assert.equal(p.leiste['[data-leiste-meter-label]'].textContent, de.tp_roll_context.length_label);
  assert.equal(p.leiste['[data-leiste-raumhinweis]'].hidden, true);
});

test('Geänderte Maße entwerten einen alten Zuschnitt; eigene Stücktexte bleiben erhalten', () => {
  const p = calculator(); p.split(1, 560, 'Stück 1 von 2 (zusammen mit 400 × 560 cm)');
  const a = advicePage(p); a.contact(); a.activate();
  assert.equal(new URL(a.link.href).searchParams.get('zuschnitt'), 'Stück 1 von 2 (zusammen mit 400 × 560 cm)');
  p.c.lengthInput.value = '561'; a.activate();
  assert.equal(new URL(a.link.href).searchParams.has('zuschnitt'), false);
});

test('Farbe, englische Nachricht und explizite Meter nutzen echten Parser und dieselbe Schnittliste', () => {
  const p = calculator(); p.split(); p.c.lengthInput.value = '11,2 m';
  const a = advicePage(p, locale('locales/en.default.json')); a.color.value = 'Sand (043)'; a.activate();
  assert.match(a.message(), /Selection: Sand \(043\)/);
  assert.match(a.message(), /Cutting: 2 × \(400 × 560 cm\)/);
  assert.match(a.message(), /Length 1120 cm/);
});

test('Mehrbahnen: Fußleiste fragt echten Umfang, Pflicht nur nach Auswahl, manuelle Eingabe bleibt', () => {
  const p = calculator(); p.split();
  let result = p.extras();
  assert.equal(p.leiste['[data-leiste-meter]'].value, '');
  assert.equal(p.leiste['[data-leiste-meter-label]'].textContent, de.tp_roll_context.room_perimeter_label);
  assert.equal(result.leisteInvalid, false); assert.equal(result.items.length, 0);
  assert.doesNotMatch(p.leiste['[data-leiste-umfang]'].textContent, /Umfang 31|32 m/);
  p.leiste['[data-leiste-an]'].checked = true; result = p.extras();
  assert.equal(result.leisteInvalid, true); assert.equal(result.items.length, 0);
  p.leiste['[data-leiste-meter]'].value = '24.2'; p.leiste['[data-leiste-meter]'].setAttribute('data-touched', '1');
  result = p.extras(); assert.equal(result.leisteInvalid, false); assert.equal(result.items[0].quantity, 28);
  assert.equal(result.sum, 28 * 7.95);
  p.c.bahnenLoeschen(); p.extras(); assert.equal(p.leiste['[data-leiste-meter]'].value, '24.2');
  assert.equal(p.leiste['[data-leiste-raumhinweis]'].hidden, true);
});

test('Antirutsch behält Berechnung für gelieferte Teppichfläche und benennt deren Basis', () => {
  const p = calculator(); p.split(); p.haft['[data-haft-an]'].checked = true;
  const result = p.extras();
  assert.equal(result.items[0].quantity, 60); assert.equal(result.sum, 534);
  assert.equal(p.haft['[data-haft-basis]'].hidden, false);
  p.c.bahnenLoeschen(); p.extras(); assert.equal(p.haft['[data-haft-basis]'].hidden, true);
});

test('Breitenfehler verbergen die grüne Gegenprobe und korrigierte Maße lösen den lokalen ARIA-Fehler', () => {
  const p = calculator({ art: 'raum', width: '500', length: '300' });
  for (const value of ['49', '500', 'abc', '-20']) {
    p.c.wunschInput.value = value; p.c.calculate();
    assert.equal(p.c.wunschEcho.hidden, true, value);
    assert.equal(p.c.wunschError.hidden, false, value);
    assert.equal(p.c.wunschInput.getAttribute('aria-invalid'), 'true', value);
  }
  for (const value of ['50', '495', '3,5 m']) {
    p.c.wunschInput.value = value; p.c.calculate();
    assert.equal(p.c.wunschEcho.hidden, false, value);
    assert.equal(p.c.wunschError.hidden, true, value);
    assert.equal(p.c.wunschInput.getAttribute('aria-invalid'), null, value);
  }
  p.c.wunschInput.value = '450'; p.c.farbBreiten = [400]; p.c.calculate();
  assert.equal(p.c.wunschEcho.hidden, true);
  p.c.farbBreiten = [400, 500]; p.c.calculate(); assert.equal(p.c.wunschEcho.hidden, false);
});

test('Breite und Länge bleiben bei leeren Feldern ohne grüne Bestätigung, Fehler ist am Feld verknüpft', () => {
  const p = calculator({ art: 'raum', width: '', length: '' }); p.c.calculate();
  assert.equal(p.c.wunschEcho.hidden, true); assert.equal(p.c.lengthEcho.hidden, true);
  const input = source.match(/<input[^>]*data-wunsch-input>/)[0];
  assert.match(input, /aria-describedby="[^"]*tp-rwc-wb-error-/);
  assert.match(source, /id="tp-rwc-wb-error-\{\{ tp_rc_id \}\}" data-wunsch-error/);
});
