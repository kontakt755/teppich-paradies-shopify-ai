// Zugaenge › "Angemeldete Geraete" (Rundgang 26.10., Massnahme 58; Codex-Review #1731):
// die Zahl kennt nur das Control Center. Ein Handy, das nur in der Social-Zentrale angemeldet
// ist, muss sich trotzdem abmelden lassen - der Knopf ist also nie gesperrt. Nur Stubs, keine Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../ansichten/team.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));

function umgebung(antwort) {
  const schreiben = [], toasts = [];
  let klick = null;
  const dialog = { addEventListener: (art, fn) => { if (art === 'click') klick = fn; } };
  const root = { innerHTML: '', querySelector: sel => (sel === '.dialog' ? dialog : null) };
  const modul = vm.runInNewContext(`${quelle}\n({ viewTeam, teamKlick, team })`, {
    $: sel => (sel === '#dialogRoot' ? root : { focus() {} }),
    esc: v => String(v ?? ''), toast: (...a) => toasts.push(a), render() {},
    fetchEinkauf: async () => { throw new Error('nicht erwartet'); },
    orgSchreiben: async (pfad, daten) => { schreiben.push({ pfad, daten }); return antwort; },
    emptyState: t => `<div class="empty">${t}</div>`, stoerungState: () => '',
  });
  return { ...modul, root, schreiben, toasts, ja: async () => { await klick({ target: { closest: s => (s === '#tmGeraeteJa' ? { disabled: false } : null) } }); await tick(); } };
}

const daten = n => ({ verfuegbar: true, eingerichtet: true, benutzer: [], rollen: ['inhaber', 'mitarbeiter', 'lesen'], angemeldeteGeraete: n });
const klickAuf = sel => ({ target: { closest: s => (s === sel ? {} : null) }, preventDefault() {} });

test('Nur dieses Geraet im Control Center: "Alle anderen Geräte abmelden…" bleibt klickbar und meldet die Social-Zentrale ab', async () => {
  const u = umgebung({ ok: true, abgemeldet: 0, social: true, angemeldeteGeraete: 1 });
  u.team.daten = daten(1);
  const html = u.viewTeam();
  assert.match(html, /Im Control Center ist nur dieses Gerät angemeldet/);
  assert.match(html, /<button type="button" class="btn btn-sm" data-team-geraete-abmelden>Alle anderen Geräte abmelden…<\/button>/);
  assert.doesNotMatch(html, /data-team-geraete-abmelden[^>]*disabled/, 'ein Handy nur mit Social-Zugang muss abmeldbar sein');

  assert.equal(u.teamKlick(klickAuf('[data-team-geraete-abmelden]')), true);
  assert.match(u.root.innerHTML, /Im Control Center ist sonst kein Gerät angemeldet\. In der Social-Zentrale müssen sich danach alle neu anmelden – auch du\./);
  assert.doesNotMatch(u.root.innerHTML, /0 andere Geräte/);

  await u.ja();
  assert.deepEqual(u.schreiben.map(s => [s.pfad, JSON.stringify(s.daten)]), [['/api/sitzungen/abmelden', '{}']]);
  assert.deepEqual(u.toasts.at(-1), ['Im Control Center war kein anderes Gerät angemeldet · Social-Zentrale abgemeldet', undefined]);
  assert.equal(u.root.innerHTML, '');
});

test('Mehrere Geraete: Text und Rueckmeldung wie bisher; scheitert die Social-Zentrale, warnt die Rueckmeldung', async () => {
  const u = umgebung({ ok: true, abgemeldet: 2, social: true, angemeldeteGeraete: 1 });
  u.team.daten = daten(3);
  assert.match(u.viewTeam(), /Im Control Center sind 3 Geräte angemeldet/);
  u.teamKlick(klickAuf('[data-team-geraete-abmelden]'));
  assert.match(u.root.innerHTML, /2 andere Geräte müssen sich danach neu anmelden/);
  await u.ja();
  assert.deepEqual(u.toasts.at(-1), ['2 Geräte abgemeldet', undefined]);
  assert.equal(u.team.daten.angemeldeteGeraete, 1);

  const f = umgebung({ ok: true, abgemeldet: 0, social: false, angemeldeteGeraete: 1 });
  f.team.daten = daten(1);
  f.teamKlick(klickAuf('[data-team-geraete-abmelden]'));
  await f.ja();
  assert.deepEqual(f.toasts.at(-1), ['Im Control Center war kein anderes Gerät angemeldet – die Social-Zentrale aber nicht, bitte Fehler melden', 'warn']);
});
