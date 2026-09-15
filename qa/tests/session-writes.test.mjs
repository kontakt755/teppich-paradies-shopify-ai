import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_WRITES_MAX_PATHS, readSessionWrites, recordSessionWrite, relativeRepoPath } from '../../automation/core/session-writes.mjs';
import { describeReviewScope, porcelainPaths } from '../../automation/core/review-scope.mjs';

function fakeIo(inhalt = null) {
  const dateien = new Map();
  if (inhalt !== null) dateien.set('vorhanden', inhalt);
  return {
    dateien,
    mkdirSync: () => {},
    writeFileSync: (datei, text) => { dateien.set(datei, text); },
    readFileSync: () => { if (inhalt === null) throw new Error('ENOENT'); return inhalt; },
  };
}

// io.realpathSync gibt hier den Pfad unveraendert zurueck: getestet wird die
// Pfadrechnung, nicht das Dateisystem.
const durchreichen = { realpathSync: wert => wert };

test('Pfade werden relativ zur Repository-Wurzel gespeichert', () => {
  assert.equal(relativeRepoPath({ file: '/repo/bin/tp', repoRoot: '/repo', io: durchreichen }), 'bin/tp');
  assert.equal(relativeRepoPath({ file: '/repo/qa/tests/x.mjs', repoRoot: '/repo', io: durchreichen }), 'qa/tests/x.mjs');
});

// Symlink-Falle (Praxistest 2026-09-14): macOS loest /tmp auf /private/tmp auf.
// git meldet die aufgeloeste Wurzel, das Werkzeug den unaufgeloesten Pfad.
test('ein Symlink auf dem Weg verhindert die Erfassung nicht', () => {
  const io = { realpathSync: wert => String(wert).replace(/^\/tmp/, '/private/tmp') };
  assert.equal(relativeRepoPath({ file: '/tmp/repo/bin/tp', repoRoot: '/private/tmp/repo', io }), 'bin/tp');
});

// Zweiter Teil derselben Falle: Eine NEUE Datei in einem NEUEN Verzeichnis ist
// fuer realpath nicht aufloesbar. Fiele der Pfad dann unaufgeloest zurueck,
// schluge der Vergleich mit der aufgeloesten Wurzel fehl - im Praxistest wurde
// genau so eine neue Datei nicht erfasst.
test('eine neue Datei in einem neuen Verzeichnis wird erfasst', () => {
  const io = {
    realpathSync: wert => {
      const text = String(wert);
      // Noch nicht existierende Pfade werfen, wie das echte realpath.
      if (text.includes('/neu')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return text.replace(/^\/tmp/, '/private/tmp');
    },
  };
  assert.equal(relativeRepoPath({ file: '/tmp/repo/neu/tief/datei.txt', repoRoot: '/private/tmp/repo', io }), 'neu/tief/datei.txt');
});

// Speicherdateien und /tmp liegen ausserhalb und koennen im Pruefbereich nie
// auftauchen - sie werden gar nicht erst mitgeschrieben.
test('Pfade ausserhalb des Repositories werden verworfen', () => {
  assert.equal(relativeRepoPath({ file: '/woanders/datei.md', repoRoot: '/repo', io: durchreichen }), null);
  assert.equal(relativeRepoPath({ file: '/repo/../geheim', repoRoot: '/repo', io: durchreichen }), null);
});

test('derselbe Pfad wird nicht doppelt gespeichert', () => {
  const io = fakeIo(JSON.stringify({ version: 1, paths: ['bin/tp'], truncated: false }));
  recordSessionWrite({ sessionId: 's1', projectDir: '/repo', file: 'bin/tp', io });
  assert.equal(io.dateien.size, 1, 'es wurde erneut geschrieben, obwohl der Pfad schon drin war');
});

test('kaputter oder fehlender Bestand liefert null statt zu werfen', () => {
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo() }), null);
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo('kein json') }), null);
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo('{"version":99,"paths":[]}') }), null);
});

test('ein Schreibfehler stoert die Sitzung nicht', () => {
  const io = { mkdirSync: () => { throw new Error('ENOSPC'); }, writeFileSync: () => {}, readFileSync: () => { throw new Error('ENOENT'); } };
  assert.doesNotThrow(() => recordSessionWrite({ sessionId: 's1', projectDir: '/repo', file: 'a.txt', io }));
});

test('porcelainPaths liest Pfade aus beiden Zeilenformen', () => {
  assert.deepEqual(porcelainPaths(' M a.txt\n?? neu.txt\nR  neu.md -> alt.md'), ['a.txt', 'neu.txt', 'alt.md']);
  // Nach Abzug der Baseline steht nur noch der blosse Pfad da.
  assert.deepEqual(porcelainPaths('bin/tp\nqa/tests/x.mjs'), ['bin/tp', 'qa/tests/x.mjs']);
});

test('fremde Pfade werden im Pruefbereich benannt und als kein Befund erklaert', () => {
  const scope = describeReviewScope({ porcelain: ' M eigen.liquid\n M fremd.liquid', ownPaths: ['eigen.liquid'] });
  assert.deepEqual(scope.foreignPaths, ['fremd.liquid']);
  assert.match(scope.text, /fremd\.liquid/);
  assert.match(scope.text, /kein Befund/);
});

test('ohne fremde Pfade bleibt der Wortlaut unveraendert', () => {
  const ohne = describeReviewScope({ porcelain: ' M eigen.liquid' });
  const mit = describeReviewScope({ porcelain: ' M eigen.liquid', ownPaths: ['eigen.liquid'] });
  assert.equal(mit.text, ohne.text);
});

// Fail-safe: Ohne Liste, mit leerer Liste oder bei unvollstaendiger Erfassung
// muss der Pruefbereich Wort fuer Wort dem bisherigen Verhalten entsprechen.
test('fehlende, leere oder unvollstaendige Erfassung aendert nichts', () => {
  const bisher = describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid' }).text;
  assert.equal(describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid', ownPaths: null }).text, bisher);
  assert.equal(describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid', ownPaths: [] }).text, bisher);
  assert.equal(describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid', ownPaths: ['a.liquid'], ownPathsTruncated: true }).text, bisher);
});

test('die Erfassung ist gedeckelt und meldet Unvollstaendigkeit', () => {
  const paths = Array.from({ length: SESSION_WRITES_MAX_PATHS }, (_, i) => `datei-${i}.txt`);
  const io = fakeIo(JSON.stringify({ version: 1, paths, truncated: false }));
  recordSessionWrite({ sessionId: 's1', projectDir: '/repo', file: 'einer-zu-viel.txt', io });
  const geschrieben = JSON.parse([...io.dateien.values()].at(-1));
  assert.equal(geschrieben.truncated, true);
  assert.equal(geschrieben.paths.length, SESSION_WRITES_MAX_PATHS, 'ueber dem Deckel darf nichts mehr dazukommen');
});
