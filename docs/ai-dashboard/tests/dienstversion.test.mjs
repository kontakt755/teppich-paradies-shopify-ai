import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { dienstversion } from '../../../scripts/dashboard-version.mjs';
import { requestHandler } from '../../../scripts/serve-dashboard.mjs';

test('Dienstversion aendert sich mit Code, nicht mit Datenexporten', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-version-'));
  try {
    for (const p of ['docs/ai-dashboard', 'scripts', 'operations/lib']) fs.mkdirSync(path.join(root, p), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/ai-dashboard/app.js'), 'code-eins');
    const version = dienstversion(root);
    fs.writeFileSync(path.join(root, 'docs/ai-dashboard/issues.json'), '{"neu":true}');
    assert.equal(dienstversion(root), version);
    fs.writeFileSync(path.join(root, 'docs/ai-dashboard/app.js'), 'code-zwei');
    assert.notEqual(dienstversion(root), version);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('HTML und GET-Version gehoeren zusammen; POST und fremde Herkunft bleiben gesperrt', async () => {
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base)).text();
    const r = await fetch(`${base}/api/version`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const d = await r.json();
    assert.deepEqual(Object.keys(d), ['version'], 'keine Betriebsdaten oder Pfade');
    assert.match(d.version, /^[a-f0-9]{16}$/);
    assert.ok(html.includes(`name="tp-dienstversion" content="${d.version}"`));
    assert.ok(!html.includes('__TP_DIENSTVERSION__'));
    assert.equal((await fetch(`${base}/api/version`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/version`, { headers: { origin: 'https://fremd.example' } })).status, 403);
  } finally { await new Promise(r => server.close(r)); }
});

function umgebung() {
  const u = { version: 'a'.repeat(16), felder: [], dialog: false, reloads: 0, meldungen: [], antwort: { version: 'a'.repeat(16) }, status: 200, ereignisse: {}, intervalle: [] };
  u.balken = { hidden: true }; u.knopf = { addEventListener: (_, fn) => { u.klick = fn; } };
  u.state = { capabilities: { mode: 'local' } };
  u.doc = { hidden: false, querySelector: s => s.startsWith('meta') ? { content: u.version } : (u.dialog ? {} : null),
    querySelectorAll: () => u.felder, addEventListener: (art, fn) => { u.ereignisse[art] = fn; } };
  const code = fs.readFileSync(new URL('../bausteine/dienstversion.mjs', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
  u.modul = vm.runInNewContext(code + '\n({ starteDienstversion, offeneEingaben })', {
    document: u.doc, state: u.state, $: id => id === '#dienstversionLeiste' ? u.balken : u.knopf,
    toast: t => u.meldungen.push(t), window: { location: { reload: () => { u.reloads++; } }, addEventListener: (art, fn) => { u.ereignisse[art] = fn; } },
    markiereSitzungAbgelaufen: () => { u.state.capabilities.mode = 'ausgeloggt'; },
    fetch: async () => ({ status: u.status, ok: u.status === 200, json: async () => u.antwort }),
    setInterval: fn => u.intervalle.push(fn),
  });
  return u;
}
const feld = (typ, wert, start = '') => ({ value: wert, defaultValue: start, matches: s => s === typ });
const fertig = () => new Promise(r => setImmediate(r));

test('neue Version zeigt nur Hinweis: Eingabe bleibt, gleicher/defekter Stand und 401 werden behandelt', async () => {
  const u = umgebung();
  u.modul.starteDienstversion(); await fertig();
  assert.equal(u.balken.hidden, true);
  const eingabe = feld('input', 'offene Notiz'); u.felder.push(eingabe);
  u.antwort = { version: 'b'.repeat(16) };
  await u.intervalle[0](); await fertig();
  assert.equal(u.balken.hidden, false);
  assert.equal(eingabe.value, 'offene Notiz'); assert.equal(u.reloads, 0);
  u.klick(); assert.equal(u.reloads, 0); assert.match(u.meldungen[0], /speichern/);
  u.felder.length = 0; u.klick(); assert.equal(u.reloads, 1);
  u.antwort = { version: 'ungueltig' }; await u.intervalle[0](); await fertig();
  assert.equal(u.balken.hidden, false, 'ungueltige Antwort verwirft keinen bestaetigten Hinweis');
  u.status = 401; await u.intervalle[0](); await fertig();
  assert.equal(u.state.capabilities.mode, 'ausgeloggt'); assert.equal(u.balken.hidden, true);
});

test('manuelles Neuladen schuetzt Dialoge, Text, Auswahl und Checkboxen', () => {
  const u = umgebung();
  assert.equal(u.modul.offeneEingaben(), false);
  u.dialog = true; assert.equal(u.modul.offeneEingaben(), true); u.dialog = false;
  u.felder = [feld('input', 'neu')]; assert.equal(u.modul.offeneEingaben(), true);
  u.felder = [feld('input', 'gleich', 'gleich')]; assert.equal(u.modul.offeneEingaben(), false);
  u.felder = [{ matches: s => s === 'select', options: [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }] }];
  assert.equal(u.modul.offeneEingaben(), false, 'erste Option gilt ohne selected-Attribut als Standard');
  u.felder[0].options[0].selected = false; u.felder[0].options[1].selected = true;
  assert.equal(u.modul.offeneEingaben(), true);
  u.felder = [{ matches: s => s === '[type=checkbox], [type=radio]', checked: true, defaultChecked: false }];
  assert.equal(u.modul.offeneEingaben(), true);
});
