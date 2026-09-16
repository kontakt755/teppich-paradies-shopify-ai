import test from 'node:test';
import assert from 'node:assert/strict';
import { BASH_MTIME_TOLERANCE_MS, SESSION_WRITES_MAX_PATHS, SESSION_WRITES_VERSION, bashTouchedPaths, porcelainCodes, readBashPreSnapshot, readSessionWrites, recordSessionWrite, recordSessionWrites, relativeRepoPath, writeBashPreSnapshot } from '../../automation/core/session-writes.mjs';
import { describeReviewScope, porcelainPaths, REVIEW_SCOPE_NONE, REVIEW_SCOPE_UNCOMMITTED } from '../../automation/core/review-scope.mjs';

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
  const io = fakeIo(JSON.stringify({ version: SESSION_WRITES_VERSION, paths: ['bin/tp'], truncated: false }));
  recordSessionWrite({ sessionId: 's1', projectDir: '/repo', file: 'bin/tp', io });
  assert.equal(io.dateien.size, 1, 'es wurde erneut geschrieben, obwohl der Pfad schon drin war');
});

test('kaputter oder fehlender Bestand liefert null statt zu werfen', () => {
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo() }), null);
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo('kein json') }), null);
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo('{"version":99,"paths":[]}') }), null);
});

// Version 1 kannte nur Edit/Write, nicht Bash. Sie darf nie als Filter dienen:
// ein alter Bestand liest sich wie keiner.
test('ein Bestand der Version 1 wird nicht mehr gelesen', () => {
  assert.equal(readSessionWrites({ sessionId: 's1', projectDir: '/repo', io: fakeIo('{"version":1,"paths":["a.txt"],"truncated":false}') }), null);
});

// Der Bestand wird beim ersten Prompt und vor jedem Bash-Befehl angelegt, auch
// ohne Pfad: Seine Existenz belegt, dass die Erfassung dieser Sitzung laeuft.
test('eine leere Liste legt den Bestand an, ein zweiter leerer Aufruf schreibt nicht erneut', () => {
  const io = fakeIo();
  recordSessionWrites({ sessionId: 's1', projectDir: '/repo', files: [], io });
  assert.equal(io.dateien.size, 1);
  const geschrieben = JSON.parse([...io.dateien.values()][0]);
  assert.deepEqual(geschrieben, { version: SESSION_WRITES_VERSION, paths: [], truncated: false });
  const io2 = fakeIo(JSON.stringify(geschrieben));
  recordSessionWrites({ sessionId: 's1', projectDir: '/repo', files: [], io: io2 });
  assert.equal(io2.dateien.size, 1, 'nichts Neues, also kein Schreibvorgang');
});

test('mehrere Pfade in einem Aufruf, Duplikate und Leerwerte werden ignoriert', () => {
  const io = fakeIo(JSON.stringify({ version: SESSION_WRITES_VERSION, paths: ['a.txt'], truncated: false }));
  recordSessionWrites({ sessionId: 's1', projectDir: '/repo', files: ['b.txt', 'a.txt', '', 'c.txt'], io });
  assert.deepEqual(JSON.parse([...io.dateien.values()].at(-1)).paths, ['a.txt', 'b.txt', 'c.txt']);
});

// --- Bash-Erfassung (fuenfte Luecke, 2026-09-15) -----------------------------

test('porcelainCodes liest Statuscodes je Pfad, Umbenennungen mit beiden Seiten', () => {
  const codes = porcelainCodes(' M a.txt\0?? neu.txt\0R  neu.md\0alt.md\0');
  assert.deepEqual(codes, { 'a.txt': [' M'], 'neu.txt': ['??'], 'neu.md': ['R '], 'alt.md': ['R  ->'] });
  assert.deepEqual(porcelainCodes(''), {});
});

test('bashTouchedPaths: neuer, geaenderter und verschwundener Statuscode zaehlen als angefasst', () => {
  const before = { 'gleich.txt': [' M'], 'weg.txt': ['??'], 'gestagt.txt': [' M'] };
  const after = { 'gleich.txt': [' M'], 'gestagt.txt': ['M '], 'neu.txt': ['??'] };
  const mtimeOf = () => 0;
  assert.deepEqual(bashTouchedPaths({ before, after, startedAt: 1_000_000, mtimeOf }), ['gestagt.txt', 'neu.txt', 'weg.txt']);
});

// Gleicher Statuscode, aber neu geschrieben (z. B. `sed -i` auf eine schon
// geaenderte Datei): nur die mtime verraet es.
test('bashTouchedPaths: gleicher Statuscode mit mtime nach dem Start zaehlt, davor nicht', () => {
  const before = { 'alt.txt': [' M'], 'frisch.txt': [' M'] };
  const startedAt = 1_000_000;
  const mtimeOf = file => (file === 'frisch.txt' ? startedAt + 10 : startedAt - BASH_MTIME_TOLERANCE_MS - 1);
  assert.deepEqual(bashTouchedPaths({ before, after: before, startedAt, mtimeOf }), ['frisch.txt']);
  // Innerhalb der Toleranz vor dem Start gilt als angefasst - lieber zu viel.
  assert.deepEqual(bashTouchedPaths({ before, after: before, startedAt, mtimeOf: () => startedAt - BASH_MTIME_TOLERANCE_MS }), ['alt.txt', 'frisch.txt']);
  // Nicht lesbare mtime (null) und fehlende Startzeit: nichts zusaetzlich.
  assert.deepEqual(bashTouchedPaths({ before, after: before, startedAt, mtimeOf: () => null }), []);
  assert.deepEqual(bashTouchedPaths({ before, after: before, mtimeOf: () => startedAt + 10 }), []);
});

test('Vor-Snapshot: schreiben, lesen, kaputt oder fehlend liefert null', () => {
  const io = fakeIo();
  writeBashPreSnapshot({ sessionId: 's1', projectDir: '/repo', codes: { 'a.txt': [' M'] }, startedAt: 42, io });
  const text = [...io.dateien.values()][0];
  const gelesen = readBashPreSnapshot({ sessionId: 's1', projectDir: '/repo', io: fakeIo(text) });
  assert.deepEqual(gelesen, { startedAt: 42, codes: { 'a.txt': [' M'] } });
  assert.equal(readBashPreSnapshot({ sessionId: 's1', projectDir: '/repo', io: fakeIo() }), null);
  assert.equal(readBashPreSnapshot({ sessionId: 's1', projectDir: '/repo', io: fakeIo('{"version":1,"startedAt":1,"codes":{}}') }), null);
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

test('fremde Pfade verlassen den Pruefbereich und werden als kein Befund erklaert', () => {
  const scope = describeReviewScope({ porcelain: ' M eigen.liquid\n M fremd.liquid', ownPaths: ['eigen.liquid'] });
  assert.deepEqual(scope.foreignPaths, ['fremd.liquid']);
  assert.deepEqual(scope.scopePaths, ['eigen.liquid']);
  assert.match(scope.text, /fremd\.liquid/);
  assert.match(scope.text, /kein Befund/);
  assert.match(scope.text, /Isolierung/);
});

// Eine Sitzung, die nur liest, hat einen Bestand ohne Pfade: Alles im Working
// Tree ist dann fremd, der Pruefbereich ist leer (No-op) statt fremde Arbeit.
test('leerer Bestand: alles ist fremd, der Pruefbereich ist leer', () => {
  const scope = describeReviewScope({ porcelain: ' M fremd.liquid\n?? fremd2.md', ownPaths: [] });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.deepEqual(scope.foreignPaths, ['fremd.liquid', 'fremd2.md']);
  assert.deepEqual(scope.scopePaths, []);
});

// Ein vorbestehender Pfad, der aus git status verschwand: nur ein Befund
// dieser Sitzung, wenn sie ihn selbst angefasst hat.
test('fremdes Zuruecksetzen zaehlt nicht als eigene Aenderung', () => {
  const fremd = describeReviewScope({ porcelain: '', reverted: ['fremd.txt'], ownPaths: ['eigen.txt'] });
  assert.equal(fremd.kind, REVIEW_SCOPE_NONE);
  assert.match(fremd.text, /fremd\.txt/);
  const eigen = describeReviewScope({ porcelain: '', reverted: ['eigen.txt'], ownPaths: ['eigen.txt'] });
  assert.equal(eigen.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.match(eigen.text, /zurückgesetzt/);
});

test('ohne fremde Pfade bleibt der Wortlaut unveraendert', () => {
  const ohne = describeReviewScope({ porcelain: ' M eigen.liquid' });
  const mit = describeReviewScope({ porcelain: ' M eigen.liquid', ownPaths: ['eigen.liquid'] });
  assert.equal(mit.text, ohne.text);
});

// Fail-safe: Ohne Bestand oder bei gedeckelter Erfassung muss der
// Pruefbereich Wort fuer Wort dem bisherigen Verhalten entsprechen.
test('fehlende oder unvollstaendige Erfassung aendert nichts', () => {
  const bisher = describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid' }).text;
  assert.equal(describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid', ownPaths: null }).text, bisher);
  assert.equal(describeReviewScope({ porcelain: ' M a.liquid\n M b.liquid', ownPaths: ['a.liquid'], ownPathsTruncated: true }).text, bisher);
});

test('die Erfassung ist gedeckelt und meldet Unvollstaendigkeit', () => {
  const paths = Array.from({ length: SESSION_WRITES_MAX_PATHS }, (_, i) => `datei-${i}.txt`);
  const io = fakeIo(JSON.stringify({ version: SESSION_WRITES_VERSION, paths, truncated: false }));
  recordSessionWrite({ sessionId: 's1', projectDir: '/repo', file: 'einer-zu-viel.txt', io });
  const geschrieben = JSON.parse([...io.dateien.values()].at(-1));
  assert.equal(geschrieben.truncated, true);
  assert.equal(geschrieben.paths.length, SESSION_WRITES_MAX_PATHS, 'ueber dem Deckel darf nichts mehr dazukommen');
});
