import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { INTENT, STATUS, ladeOrdner, pruefe, ratgeberLinks } from '../../scripts/bodenwissen-guard.mjs';

const artikel = (extra = {}) => ({
  datei: `content/ratgeber/teppichboden/${extra.handle || 'a'}.json`,
  html: '<p>Text.</p>',
  meta: {
    id: 'RAT-TB-900', handle: 'a', title: 'A', blog: 'ratgeber-teppichboden',
    cluster: 'teppichboden/auswahl', intent: 'kaufberatung', frage: 'Was?', begriff: 'begriff a',
    status: 'entwurf', ...extra,
  },
});
const texte = e => e.map(x => x.text);

test('fehlende Pflichtfelder sind Fehler', () => {
  const { fehler } = pruefe({ artikel: [artikel({ begriff: '', cluster: '' })] });
  assert.ok(texte(fehler).some(t => t.includes('"begriff"')));
  assert.ok(texte(fehler).some(t => t.includes('"cluster"')));
});

test('unbekannter Status oder Intent wird abgelehnt', () => {
  const { fehler } = pruefe({ artikel: [artikel({ status: 'live', intent: 'ratgeber' })] });
  assert.ok(texte(fehler).some(t => t.includes('status "live"')));
  assert.ok(texte(fehler).some(t => t.includes('intent "ratgeber"')));
  assert.ok(STATUS.includes('veroeffentlicht') && INTENT.includes('planung'));
});

test('zwei Artikel mit gleichem Begriff und gleicher Intention sind Kannibalisierung', () => {
  const { fehler } = pruefe({
    artikel: [
      artikel({ handle: 'a', id: 'RAT-1', begriff: 'Teppich reinigen', intent: 'anleitung' }),
      artikel({ handle: 'b', id: 'RAT-2', begriff: 'teppich  reinigen', intent: 'anleitung' }),
    ],
  });
  assert.ok(texte(fehler).some(t => t.includes('Kannibalisierung')), 'Gross-/Kleinschreibung und Leerzeichen duerfen nicht taeuschen');
});

test('derselbe Begriff mit anderer Suchintention ist erlaubt', () => {
  const { fehler } = pruefe({
    artikel: [
      artikel({ handle: 'a', id: 'RAT-1', begriff: 'teppich reinigen', intent: 'anleitung' }),
      artikel({ handle: 'b', id: 'RAT-2', begriff: 'teppich reinigen', intent: 'problem' }),
    ],
  });
  assert.equal(texte(fehler).filter(t => t.includes('Kannibalisierung')).length, 0);
});

test('doppelte id faellt auf', () => {
  const { fehler } = pruefe({ artikel: [artikel({ handle: 'a', begriff: 'x' }), artikel({ handle: 'b', begriff: 'y' })] });
  assert.ok(texte(fehler).some(t => t.includes('ist schon in')));
});

test('Verweis auf einen Artikel, den es nicht gibt', () => {
  const { fehler } = pruefe({ artikel: [artikel({ verwandte: ['gibt-es-nicht'], naechster_schritt: 'auch-nicht' })] });
  assert.ok(texte(fehler).some(t => t.includes('verwandte: "gibt-es-nicht"')));
  assert.ok(texte(fehler).some(t => t.includes('naechster_schritt: "auch-nicht"')));
});

test('Verweis auf sich selbst', () => {
  const { fehler } = pruefe({ artikel: [artikel({ handle: 'a', verwandte: ['a'] })] });
  assert.ok(texte(fehler).some(t => t.includes('auf sich selbst')));
});

test('toter Link im Artikeltext und nichtssagender Ankertext', () => {
  const eintrag = artikel({ handle: 'a' });
  eintrag.html = '<p><a href="/blogs/ratgeber-teppichboden/weg">Weg</a> <a href="/blogs/ratgeber-teppichboden/a">hier klicken</a></p>';
  const { fehler } = pruefe({ artikel: [eintrag] });
  assert.ok(texte(fehler).some(t => t.includes('toter Link')));
  assert.ok(texte(fehler).some(t => t.includes('Ankertext')));
});

test('Tag-Ansicht eines Blogs gilt nicht als Artikel-Link', () => {
  const eintrag = artikel({ handle: 'a' });
  eintrag.html = '<p><a href="/blogs/ratgeber-teppichboden/tagged/Pflege">Alle Pflege-Themen</a></p>';
  assert.equal(pruefe({ artikel: [eintrag] }).fehler.length, 0);
});

test('offene PRUEFEN-Marke und h1 im Text sperren', () => {
  const eintrag = artikel();
  eintrag.html = '<h1>Titel</h1><p>PRUEFEN: stimmt das?</p>';
  const { fehler } = pruefe({ artikel: [eintrag] });
  assert.ok(texte(fehler).some(t => t.includes('PRUEFEN')));
  assert.ok(texte(fehler).some(t => t.includes('h1 im Text')));
});

test('freigegebener Artikel ohne Kurzantwort wird gesperrt', () => {
  const { fehler } = pruefe({ artikel: [artikel({ status: 'freigegeben' })] });
  assert.ok(texte(fehler).some(t => t.includes('kurzantwort fehlt')));
});

test('Artikel ohne eingehenden Link ist Hinweis, nicht Fehler', () => {
  const { fehler, hinweise } = pruefe({ artikel: [artikel({ status: 'veroeffentlicht', metafields: { kurzantwort: 'Ja.' } })] });
  assert.equal(fehler.length, 0);
  assert.ok(texte(hinweise).some(t => t.includes('kein eingehender Link')));
});

test('abgelaufenes Pruefdatum meldet sich als Hinweis', () => {
  const { hinweise } = pruefe({
    artikel: [artikel({ status: 'veroeffentlicht', metafields: { kurzantwort: 'Ja.' }, verwandte: [], pruefung: { naechste: '2020-01-01' } })],
    heute: new Date('2026-09-23'),
  });
  assert.ok(texte(hinweise).some(t => t.includes('Pruefdatum')));
});

test('ein freigegebenes Problem ohne Ziel-Artikel wird gesperrt', () => {
  const basis = [artikel({ handle: 'a', status: 'veroeffentlicht', metafields: { kurzantwort: 'Ja.' } })];
  const ohneZiel = pruefe({ artikel: basis, probleme: [{ datei: 'content/probleme/p.json', meta: { handle: 'p', status: 'freigegeben', artikel: '' } }] });
  assert.ok(texte(ohneZiel.fehler).some(t => t.includes('ohne Ziel-Artikel')));

  const falschesZiel = pruefe({ artikel: basis, probleme: [{ datei: 'content/probleme/p.json', meta: { handle: 'p', status: 'freigegeben', artikel: 'gibt-es-nicht' } }] });
  assert.ok(texte(falschesZiel.fehler).some(t => t.includes('gibt es nicht')));

  const idee = pruefe({ artikel: basis, probleme: [{ datei: 'content/probleme/p.json', meta: { handle: 'p', status: 'idee', artikel: '' } }] });
  assert.equal(idee.fehler.length, 0, 'ein Problem im Status idee darf ohne Ziel liegen bleiben');
});

test('Lexikon: Verweis auf einen Artikel, den es nicht gibt', () => {
  const { fehler } = pruefe({
    artikel: [artikel({ handle: 'a', status: 'veroeffentlicht', metafields: { kurzantwort: 'Ja.' } })],
    lexikon: [{ datei: 'content/lexikon/x.json', meta: { handle: 'x', status: 'freigegeben', kurz: 'Kurz.', artikel: 'weg' } }],
  });
  assert.ok(texte(fehler).some(t => t.includes('Artikel-Verweis "weg"')));
});

test('ratgeberLinks liest href und Ankertext', () => {
  const treffer = ratgeberLinks('<a class="x" href="/blogs/b/c?y=1#z">Teppichboden <em>messen</em></a>');
  assert.deepEqual(treffer, [{ href: '/blogs/b/c', text: 'Teppichboden messen' }]);
});

test('die echten Quelltexte bestehen das Gate', () => {
  const wurzel = path.resolve(import.meta.dirname, '../..');
  const echte = ladeOrdner(path.join(wurzel, 'content/ratgeber'));
  assert.ok(echte.length >= 5);
  const { fehler } = pruefe({ artikel: echte });
  assert.deepEqual(fehler.map(f => `${path.basename(f.datei)}: ${f.text}`), []);
});
