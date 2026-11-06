import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Fehlt issues.json (GitHub-Aufgaben), darf das nur die Technik-Ansichten sperren. Bis 2026-11-06
// stand auf jeder Seite "Daten nicht verfuegbar" - auch an der Packstation und im Einkauf, die
// ihre Daten gar nicht aus issues.json holen.

const quelle = fs.readFileSync(new URL('../kern/render.mjs', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export\s/gm, '');

function zeichner({ view, raw = null, loadError = 'issues.json konnte nicht geladen werden (HTTP 404)', inhaber = true } = {}) {
  const main = { innerHTML: '', contains: () => false, querySelector: () => null };
  const state = { raw, loadError, tasks: [], capabilities: { mode: 'local' }, route: { view, params: new URLSearchParams() } };
  const api = vm.runInNewContext(quelle + '\n({ render, registriereAnsichten })', {
    state, URLSearchParams,
    $: sel => (sel === '#main' ? main : null),
    esc: s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`),
    istNurLesend: () => false, darfAnsicht: v => inhaber || !['freigaben', 'arbeit'].includes(v),
    aktualisiereNavigation() {}, aktualisiereSeitentitel() {}, renderSheet() {},
    merkeEingabe: () => null, stelleEingabeWiederHer: () => false,
    document: { activeElement: null, title: '', getElementById: () => null },
    window: { dispatchEvent() {} }, Event: class {},
  });
  const ansicht = name => () => `<p>Ansicht ${name}</p>`;
  api.registriereAnsichten(Object.fromEntries(['heute', 'kunden', 'einkauf', 'lexikon', 'arbeit', 'freigaben', 'insights', 'bereiche', 'aktivitaet'].map(n => [n, ansicht(n)])));
  api.render();
  return main.innerHTML;
}

test('ohne issues.json zeichnen Heute, Kunden, Einkauf und Lexikon normal mit gelber Zeile', () => {
  for (const view of ['heute', 'kunden', 'einkauf', 'lexikon']) {
    const html = zeichner({ view });
    assert.ok(html.includes(`<p>Ansicht ${view}</p>`), `${view} wird gezeichnet`);
    assert.match(html, /notice warn[^>]*>Technik-Aufgaben nicht geladen – Entscheidungen werden gerade nicht gezählt\./);
    assert.match(html, /data-action="refresh"[^>]*>Erneut versuchen</);
    assert.doesNotMatch(html, /Daten nicht verfügbar|npm run|issues\.json/, 'kein Befehl, kein Dateiname in der Arbeitsansicht');
  }
});

test('ohne issues.json sperren nur die Ansichten, die GitHub-Aufgaben zeigen', () => {
  for (const view of ['arbeit', 'freigaben', 'insights', 'bereiche', 'aktivitaet']) {
    const html = zeichner({ view });
    assert.match(html, /<h1>Daten nicht verfügbar<\/h1>/, view);
    assert.ok(!html.includes(`<p>Ansicht ${view}</p>`), `${view} bleibt gesperrt`);
  }
});

test('Mitarbeiter sehen keine Zeile zu Technik und Entscheidungen; mit altem Stand bleibt die rote Zeile', () => {
  const mitarbeiter = zeichner({ view: 'kunden', inhaber: false });
  assert.equal(mitarbeiter, '<p>Ansicht kunden</p>');
  const alterStand = zeichner({ view: 'kunden', raw: { issues: [] }, loadError: 'HTTP 500' });
  assert.match(alterStand, /notice crit[^>]*>Aktualisierung fehlgeschlagen: HTTP 500/);
  assert.equal(zeichner({ view: 'kunden', raw: { issues: [] }, loadError: null }), '<p>Ansicht kunden</p>');
});
