import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as regeln from '../lib/akquise.mjs';

const quelltext = fs.readFileSync(new URL('../ansichten/akquise.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function umgebung() {
  const config = { bestaetigen: false, lesen: false, feld: null }, schreiben = [], kopien = [], fragen = [];
  const api = vm.runInNewContext(quelltext + '\n({ akquise, viewAkquise, akquiseKlick, akquiseAenderung })', {
    ...regeln, state: { route: { view: 'akquise' } }, esc, fmtDate: v => v, fmtDateTime: v => v,
    istNurLesend: () => config.lesen, render() {}, toast() {}, setTimeout() {},
    document: { getElementById: () => config.feld },
    window: { confirm: text => { fragen.push(text); return config.bestaetigen; }, scrollTo() {} },
    navigator: { clipboard: { writeText: async text => { kopien.push(text); } } },
    orgSchreiben: async (pfad, body) => { schreiben.push({ pfad, body: JSON.parse(JSON.stringify(body)) }); return { firma: { status: body.status } }; },
  });
  api.akquise.daten = { verfuegbar: true, vorlage: 'Betreff: Boden\n\nHallo [Firma]', firmen: [
    { id: 'eins', name: 'Muster Wohnbau', kontakt: 'kontakt@muster.example', status: 'neu' },
    { id: 'zwei', name: 'Beispiel Verwaltung', kontakt: 'kontakt@beispiel.example', status: 'neu' },
  ] };
  api.akquise.gewaehlt = 'eins';
  const klick = (selector, element) => api.akquiseKlick({ target: { closest: s => s === selector ? element : null }, preventDefault() { config.verhindert = true; } });
  return { ...api, config, schreiben, kopien, fragen, klick };
}

test('Nachricht ist editierbar, sicher ausgegeben und bleibt pro Firma im Browserzustand', () => {
  const u = umgebung();
  assert.match(u.viewAkquise(), /Nachricht ansehen und anpassen/);
  assert.match(u.viewAkquise(), /textarea id="akq-nachricht" data-akq-nachricht="eins"/);
  const text = 'Betreff: Eigen\n\n</textarea><script>unwirksam</script>';
  assert.equal(u.akquiseAenderung({ target: { dataset: { akqNachricht: 'eins' }, value: text } }), true);
  assert.match(u.viewAkquise(), /&lt;\/textarea&gt;&lt;script&gt;/);
  assert.ok(!u.viewAkquise().includes('<script>unwirksam'));
  u.akquise.gewaehlt = 'zwei';
  assert.ok(!u.viewAkquise().includes('unwirksam'));
  assert.equal(u.schreiben.length, 0);
  assert.equal(u.akquiseAenderung({ target: { dataset: { akqNachricht: 'fremd' }, value: text } }), false);
});

test('Kopieren nutzt die letzte Feldeingabe ohne change-Event und markiert nichts als angeschrieben', async () => {
  const u = umgebung();
  const text = 'Betreff: Individuell\n\nText mit Umlauten ä & Kontakt.';
  u.config.feld = { dataset: { akqNachricht: 'eins' }, value: text };
  u.klick('[data-akq-kopieren]', { dataset: { akqKopieren: 'eins' } }); await tick();
  assert.deepEqual(u.kopien, [text]);
  assert.equal(u.akquise.entwuerfe.eins, text);
  assert.equal(u.akquise.entwuerfe.zwei, undefined);
  assert.equal(u.schreiben.length, 0);
  assert.equal(u.fragen.length, 0);
});

test('E-Mail oeffnen uebergibt den bearbeiteten Betreff/Text; leeren Entwurf weder oeffnen noch kopieren', async () => {
  const u = umgebung(), mail = { dataset: { akqMail: 'eins' }, href: 'alt' };
  const text = 'Betreff: Eigener Betreff\n\nNeue Nachricht ä & b';
  u.config.feld = { dataset: { akqNachricht: 'eins' }, value: text };
  u.klick('[data-akq-mail]', mail);
  assert.equal(mail.href, regeln.mailtoLink('kontakt@muster.example', text));
  assert.equal(u.schreiben.length, 0);
  u.config.feld.value = '  ';
  u.klick('[data-akq-mail]', mail);
  u.klick('[data-akq-kopieren]', { dataset: { akqKopieren: 'eins' } }); await tick();
  assert.equal(u.config.verhindert, true);
  assert.equal(u.kopien.length, 0);
});

test('Angeschrieben erst nach bestaetigtem echtem Kontakt; Abbrechen schreibt nichts', async () => {
  const u = umgebung(), knopf = { dataset: { akqAktion: 'angeschrieben', akqId: 'eins' } };
  u.klick('[data-akq-aktion]', knopf); await tick();
  assert.equal(u.schreiben.length, 0);
  assert.match(u.fragen[0], /Muster Wohnbau tatsächlich angeschrieben oder angerufen/);
  assert.match(u.fragen[0], /Kopieren oder „E-Mail öffnen“ reicht dafür nicht/);
  u.config.bestaetigen = true;
  u.klick('[data-akq-aktion]', knopf); await tick();
  assert.deepEqual(u.schreiben, [{ pfad: '/api/akquise/aendern', body: { id: 'eins', status: 'angeschrieben' } }]);
  assert.equal(u.akquise.daten.firmen[0].status, 'angeschrieben');
});

test('Lesende Rolle bekommt keine Schaltflaeche zum Kontaktabschluss', () => {
  const u = umgebung(); u.config.lesen = true;
  assert.ok(!u.viewAkquise().includes('data-akq-aktion="angeschrieben"'));
});
