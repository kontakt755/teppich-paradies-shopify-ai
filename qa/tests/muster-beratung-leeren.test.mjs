// "Lieber erst beraten lassen?" (snippets/tp-muster-beratungsanfrage.liquid):
// Shopify haengt contact_posted=true nach JEDEM Kontaktformular an, deshalb
// darf der Musterwarenkorb nur leer werden, wenn genau dieses Formular
// abgeschickt wurde (Marke tp_mba_gesendet). Befund 06.11.2026: Warenkorb mit
// einem Muster, Aufruf /cart?contact_posted=true -> item_count 0.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const snippet = readFileSync(join(root, 'snippets/tp-muster-beratungsanfrage.liquid'), 'utf8');
const code = snippet.match(/<script>([\s\S]*?)<\/script>/)[1];
const MARKE = 'tp_mba_gesendet';

function speicherAus(eintraege = []) {
  const m = new Map(eintraege);
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const gesperrt = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
};

// Ein Seitenaufruf: erfolg = Anzahl gerenderter Snippets mit Danke-Kasten
// (Shopify setzt posted_successfully fuer alle Kontaktformulare der Seite).
function seite({ erfolg = 0, fehler = false, speicher = speicherAus(), skripte = 1 } = {}) {
  const geholt = [];
  const lauscher = {};
  const kaesten = [];
  for (let i = 0; i < Math.max(erfolg, 1); i++) {
    const box = { hidden: false };
    const ok = erfolg ? { hidden: true, parentNode: { querySelector: (sel) => (sel === '[data-tp-mba-box]' ? box : null) } } : null;
    kaesten.push({ box, ok });
  }
  const document = {
    readyState: 'loading',
    addEventListener: (typ, fn) => { (lauscher[typ] ||= []).push(fn); },
    querySelectorAll: (sel) => (sel === '[data-tp-mba-ok]' ? kaesten.map((k) => k.ok).filter(Boolean) : []),
    querySelector: (sel) => {
      if (sel === '[data-tp-mba-fehler]') return fehler ? {} : null;
      if (sel === '[data-tp-mba-ok]') return kaesten[0].ok;
      return null;
    },
  };
  const window = {};
  const fetch = (url, opt) => { geholt.push([url, opt?.method]); return Promise.resolve(); };
  for (let i = 0; i < skripte; i++) vm.runInNewContext(code, { window, document, sessionStorage: speicher, fetch });
  return {
    geholt, kaesten, speicher,
    geladen() { for (const fn of lauscher.DOMContentLoaded || []) fn(); },
    absenden(form) { for (const fn of lauscher.submit || []) fn({ target: form }); },
  };
}

const musterForm = { matches: (sel) => sel === 'form.tp-mba' };
const fremdesForm = { matches: () => false };

test('Danke-Kasten steht versteckt im HTML, das Kaestchen immer daneben', () => {
  assert.match(snippet, /<p class="tp-mba__ok"[^>]*\shidden\s[^>]*data-tp-mba-ok/);
  // Kein else-Zweig mehr: das Kaestchen wird auch bei posted_successfully gerendert.
  const formular = snippet.slice(snippet.indexOf("{%- form 'contact'"), snippet.indexOf('{%- endform -%}'));
  assert.doesNotMatch(formular, /\{%-?\s*else\s*-?%\}/);
  assert.match(formular, /\{%- endif -%\}\s*<details class="tp-mba__box" data-tp-mba-box/);
  assert.match(snippet, /cart\/clear\.js/);
});

test('ohne Marke (fremdes Formular, Link mit contact_posted): Muster bleiben, kein Dank', () => {
  const s = seite({ erfolg: 1 });
  s.geladen();
  assert.deepEqual(s.geholt, [], 'Warenkorb wird nicht geleert');
  assert.equal(s.kaesten[0].ok.hidden, true, 'Danke bleibt versteckt');
  assert.equal(s.kaesten[0].box.hidden, false, 'normales Kaestchen bleibt sichtbar');

  // Kontaktseite abgeschickt: andere Formulare setzen keine Marke.
  const vorher = seite();
  vorher.absenden(fremdesForm);
  assert.equal(vorher.speicher.m.size, 0);
  const nachher = seite({ erfolg: 1, speicher: vorher.speicher });
  nachher.geladen();
  assert.deepEqual(nachher.geholt, []);
});

test('mit Marke aus dem Absenden: Dank zeigen, einmal leeren, Marke danach weg', () => {
  const vorher = seite();
  vorher.absenden(musterForm);
  assert.match(vorher.speicher.m.get(MARKE), /^\d+$/);

  const nachher = seite({ erfolg: 1, speicher: vorher.speicher });
  nachher.geladen();
  assert.deepEqual(nachher.geholt, [['/cart/clear.js', 'POST']]);
  assert.equal(nachher.kaesten[0].ok.hidden, false, 'Danke sichtbar');
  assert.equal(nachher.kaesten[0].box.hidden, true, 'Kaestchen weg');
  assert.equal(nachher.speicher.m.has(MARKE), false, 'Marke geloescht');

  // Neu laden der Danke-Seite leert nicht noch einmal.
  const neu = seite({ erfolg: 1, speicher: nachher.speicher });
  neu.geladen();
  assert.deepEqual(neu.geholt, []);
  assert.equal(neu.kaesten[0].ok.hidden, true);
});

test('Snippet mehrfach auf der Seite: Marke einmal auswerten, nur einmal leeren', () => {
  const s = seite({ erfolg: 2, skripte: 2, speicher: speicherAus([[MARKE, String(Date.now())]]) });
  s.geladen();
  assert.deepEqual(s.geholt, [['/cart/clear.js', 'POST']]);
  assert.deepEqual(s.kaesten.map((k) => [k.ok.hidden, k.box.hidden]), [[false, true], [false, true]]);
  // Auch das Absenden setzt die Marke nur ueber einen Lauscher.
  const speicher = speicherAus();
  let gesetzt = 0;
  const zaehler = { ...speicher, setItem: (k, v) => { gesetzt++; speicher.setItem(k, v); } };
  seite({ skripte: 2, speicher: zaehler }).absenden(musterForm);
  assert.equal(gesetzt, 1);
});

test('Speicher gesperrt: sicherer Ausfall, Muster bleiben im Warenkorb', () => {
  const vorher = seite({ speicher: gesperrt });
  assert.doesNotThrow(() => vorher.absenden(musterForm));
  const s = seite({ erfolg: 1, speicher: gesperrt });
  assert.doesNotThrow(() => s.geladen());
  assert.deepEqual(s.geholt, []);
  assert.equal(s.kaesten[0].ok.hidden, true);
  assert.equal(s.kaesten[0].box.hidden, false);
});

test('Anfrage mit Fehlern zurueck: Marke verworfen, spaeteres fremdes Formular leert nicht', () => {
  const fehler = seite({ fehler: true, speicher: speicherAus([[MARKE, String(Date.now())]]) });
  fehler.geladen();
  assert.equal(fehler.speicher.m.has(MARKE), false);
  const spaeter = seite({ erfolg: 1, speicher: fehler.speicher });
  spaeter.geladen();
  assert.deepEqual(spaeter.geholt, []);
});

test('Seite ohne Danke und ohne Fehler (z. B. Zwischenschritt) laesst die Marke stehen', () => {
  const s = seite({ speicher: speicherAus([[MARKE, String(Date.now())]]) });
  s.geladen();
  assert.match(s.speicher.m.get(MARKE), /^\d+$/);
  assert.deepEqual(s.geholt, []);
});

test('alte Marke (abgebrochenes Absenden vor ueber 15 Minuten): fremdes Formular leert nicht', () => {
  const alt = String(Date.now() - 16 * 60 * 1000);
  const s = seite({ erfolg: 1, speicher: speicherAus([[MARKE, alt]]) });
  s.geladen();
  assert.deepEqual(s.geholt, []);
  assert.equal(s.kaesten[0].ok.hidden, true);
  assert.equal(s.speicher.m.has(MARKE), false, 'alte Marke wird verworfen');
});

test('Hydration morpht den Dank zurueck: Beobachter zeigt ihn wieder', () => {
  const kaesten = [];
  const box = { hidden: false };
  const ok = { hidden: true, parentNode: { querySelector: (sel) => (sel === '[data-tp-mba-box]' ? box : null) } };
  kaesten.push({ box, ok });
  let rueckruf = null;
  let getrennt = false;
  const window = {
    MutationObserver: function (fn) { rueckruf = fn; this.observe = () => {}; this.disconnect = () => { getrennt = true; }; },
  };
  const document = {
    readyState: 'complete',
    body: {},
    addEventListener: () => {},
    querySelectorAll: (sel) => (sel === '[data-tp-mba-ok]' ? [ok] : []),
    querySelector: () => null,
  };
  const geholt = [];
  let zeitgeber = null;
  vm.runInNewContext(code, {
    window, document, Date,
    sessionStorage: speicherAus([[MARKE, String(Date.now())]]),
    fetch: (url) => { geholt.push(url); return Promise.resolve(); },
    setTimeout: (fn) => { zeitgeber = fn; },
  });
  assert.equal(ok.hidden, false);
  assert.equal(box.hidden, true);
  assert.deepEqual(geholt, ['/cart/clear.js']);
  // Morph setzt den Server-Zustand zurueck ...
  ok.hidden = true; box.hidden = false;
  rueckruf();
  assert.equal(ok.hidden, false, 'Dank wieder sichtbar');
  assert.equal(box.hidden, true, 'Kaestchen wieder weg');
  zeitgeber();
  assert.equal(getrennt, true, 'Beobachter endet nach der Frist');
});
