import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(fileURLToPath(new URL('../../snippets/tp-formular.liquid', import.meta.url)), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Formular-Script fehlt');

class Element {
  constructor(text = '') {
    this.textContent = text;
    this.hidden = true;
    this.id = '';
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.inserted = [];
    this.parentNode = { insertBefore: (node) => this.inserted.push(node) };
  }
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
  }
  emit(type) { for (const callback of this.listeners.get(type) || []) callback(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

function setup({ maxCm = 5000, beschreibung = '', mindestmenge = false } = {}) {
  const feld = new Element();
  feld.setAttribute('aria-describedby', beschreibung);
  const breite = new Element();
  breite.setAttribute('aria-describedby', 'breite-grenze breite-echo');
  const min = new Element('Mindestlänge 100 cm');
  const format = new Element('Bitte nur eine Zahl in cm eingeben – zum Beispiel 350.');
  const max = new Element('Ab 50 m Länge beraten wir Sie lieber persönlich.');
  const stock = new Element('Diese Breite ist derzeit nicht lieferbar.');
  const echo = new Element('Länge 2 m');
  echo.id = 'tp-rwc-len-echo-test';
  const mindestHinweis = mindestmenge ? new Element('Mindestbestellmenge: 8 m Länge. Kürzere Längen liefern und berechnen wir mit 8 m.') : null;
  if (mindestHinweis) mindestHinweis.hidden = false;
  const root = new Element();
  root.id = 'tp-rwc-test';
  if (maxCm !== undefined) root.dataset.maxLaengeCm = String(maxCm);
  const elements = {
    'input[data-length-input]': feld,
    '[data-error-min]': min,
    '[data-error-comma]': format,
    '[data-error-max]': max,
    '[data-error-stock]': stock,
    '[data-length-echo]': echo,
    '[data-mindest-hint]': mindestHinweis,
    '[data-wunsch-input]': breite,
  };
  root.querySelector = (selector) => elements[selector] ?? null;
  const created = [];
  const document = {
    readyState: 'complete',
    querySelectorAll: () => [root],
    createElement: () => {
      const node = new Element();
      created.push(node);
      return node;
    },
    addEventListener() {},
  };
  vm.runInNewContext(script, { document, window: { setTimeout() {} }, Promise }, { timeout: 1000 });
  const status = created.find((node) => node.getAttribute('role') === 'status');
  assert.ok(status, 'Dauerhaftes Statusfeld fehlt');
  return {
    feld, breite, min, format, max, stock, echo, root, status, mindestHinweis,
    hinweise: created.filter(node => node.className === 'tp-formular-hinweis'),
    async input(visible) {
      for (const [name, node] of Object.entries({ min, format, max, stock, echo })) {
        node.hidden = !visible.includes(name);
      }
      feld.emit('input');
      await Promise.resolve();
    },
  };
}

test('Formatfehler wird angekündigt, dem Längenfeld zugeordnet und nach Korrektur entfernt', async () => {
  const form = setup();
  await form.input(['format']);
  assert.equal(form.feld.getAttribute('aria-invalid'), 'true');
  assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.format.id));
  assert.ok(!form.feld.getAttribute('aria-describedby').split(' ').includes(form.min.id));
  assert.equal(form.status.textContent, form.format.textContent);
  assert.equal(form.status.getAttribute('aria-live'), 'polite');

  await form.input(['echo']);
  assert.equal(form.feld.getAttribute('aria-invalid'), null);
  assert.equal(form.status.textContent, '');
  assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.echo.id));
  assert.ok(!form.feld.getAttribute('aria-describedby').split(' ').includes(form.format.id));
});

test('Mindestlänge wird erst nach Verlassen des Feldes als Fehler gemeldet', async () => {
  const form = setup();
  await form.input(['min']);
  assert.equal(form.min.hidden, true);
  assert.equal(form.feld.getAttribute('aria-invalid'), null);
  form.feld.emit('blur');
  assert.equal(form.min.hidden, false);
  assert.equal(form.feld.getAttribute('aria-invalid'), 'true');
  assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.min.id));
  assert.equal(form.status.textContent, form.min.textContent);
  form.feld.emit('focus');
  await form.input(['echo']);
  assert.equal(form.feld.getAttribute('aria-invalid'), null);
  assert.equal(form.status.textContent, '');
});

test('Obergrenze ist Eingabefehler; fehlender Bestand ist keiner', async () => {
  const form = setup();
  await form.input(['max']);
  assert.equal(form.feld.getAttribute('aria-invalid'), 'true');
  assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.max.id));
  assert.equal(form.status.textContent, form.max.textContent);

  await form.input(['stock']);
  assert.equal(form.feld.getAttribute('aria-invalid'), null);
  assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.stock.id));
  assert.equal(form.status.textContent, form.stock.textContent);
});

test('Vorhandene Feldbeschreibungen bleiben erhalten, nur aktive Fehler und Gegenprobe werden ergaenzt', async () => {
  const form = setup({ beschreibung: 'produktkontext produktkontext tp-rwc-len-echo-test tp-rwc-test-fehler-1' });
  assert.equal(form.hinweise.length, 1);
  assert.equal(form.hinweise[0].textContent, 'Länge von 1 m (100 cm) bis 50 m');
  const ids = () => form.feld.getAttribute('aria-describedby').split(' ');
  assert.deepEqual(ids(), ['produktkontext', form.hinweise[0].id]);

  await form.input(['format']);
  assert.deepEqual(ids(), ['produktkontext', form.hinweise[0].id, form.format.id]);
  await form.input(['max']);
  assert.deepEqual(ids(), ['produktkontext', form.hinweise[0].id, form.max.id]);
  await form.input(['echo']);
  assert.deepEqual(ids(), ['produktkontext', form.hinweise[0].id, form.echo.id]);
  assert.equal(form.feld.getAttribute('aria-invalid'), null);
  assert.equal(form.breite.getAttribute('aria-describedby'), 'breite-grenze breite-echo');
});

test('Ein vorhandener Hinweis verwendet Produkt- und Bestandsgrenze mit deutscher Zahl', () => {
  for (const [maxCm, text] of [[5000, '50'], [1800, '18'], [175, '1,75']]) {
    const form = setup({ maxCm });
    assert.equal(form.hinweise.length, 1);
    assert.equal(form.hinweise[0].hidden, false);
    assert.equal(form.hinweise[0].textContent, `Länge von 1 m (100 cm) bis ${text} m`);
    assert.ok(form.feld.getAttribute('aria-describedby').split(' ').includes(form.hinweise[0].id));
  }
});

test('Mindestbestellmenge ist mitbeschrieben und wird nicht durch eine pauschale Untergrenze widersprochen', () => {
  const form = setup({ mindestmenge: true });
  assert.equal(form.hinweise[0].textContent, 'Länge bis 50 m');
  const ids = form.feld.getAttribute('aria-describedby').split(' ');
  assert.ok(ids.includes(form.mindestHinweis.id));
  assert.match(form.mindestHinweis.textContent, /8 m/);
});

test('Nicht bestellbarer Rest hat keinen irrefuehrenden Bereich von 100 bis unter100cm', () => {
  for (const maxCm of [0, 25, 99]) {
    const form = setup({ maxCm });
    assert.equal(form.hinweise[0].hidden, true);
    assert.ok(!form.feld.getAttribute('aria-describedby').split(' ').includes(form.hinweise[0].id));
  }
});
