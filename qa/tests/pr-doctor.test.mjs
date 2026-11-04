import test from 'node:test';
import assert from 'node:assert/strict';
import { bewerte, bewerteAlle, zusammenfassung, REGELN, FIXES, CHANGELOG_ALT } from '../pr-doctor.mjs';

// Ein sauberer PR gegen main: keine Findings ausser hoechstens dem Hinweis auf
// fehlende Checks.
const sauber = {
  nummer: 1, head: 'feature/a', basis: 'main', draft: false,
  headExistiert: true, basisExistiert: null, basisGemergt: null,
  mergeBasen: 1, konflikte: [], checks: 2,
  githubMergeable: 'MERGEABLE', githubStatus: 'CLEAN', dateien: ['blocks/x.liquid'],
};

test('sauberer PR gegen main hat keinen Befund', () => {
  assert.deepEqual(bewerte(sauber), []);
});

test('gestapelter PR mit offener Basis: Hinweis, kein Fix', () => {
  const f = bewerte({ ...sauber, basis: 'feature/basis', basisExistiert: true, basisGemergt: false });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.BASIS_NICHT_MAIN);
  assert.equal(f[0].schwere, 'info');
  assert.equal(f[0].fix, null);
});

test('Basis bereits in main: auf main umzielen', () => {
  const f = bewerte({ ...sauber, basis: 'feature/basis', basisExistiert: true, basisGemergt: true });
  assert.equal(f[0].fix?.art, FIXES.UMZIELEN);
  assert.equal(f[0].fix?.neueBasis, 'main');
  assert.match(f[0].text, /bereits in main/);
});

// Der Fall vom 2026-09-15: #236 gemergt und Branch geloescht, #280 haengt an
// einer Basis, die es nicht mehr gibt.
test('Basis geloescht: auf main umzielen', () => {
  const f = bewerte({ ...sauber, basis: 'feature/weg', basisExistiert: false, basisGemergt: null });
  assert.equal(f[0].fix?.art, FIXES.UMZIELEN);
  assert.match(f[0].text, /geloescht/);
});

// Der Fall von #328: git merged sauber, GitHub sagt dirty.
test('mehrere Merge-Basen ohne Konflikt: begradigen', () => {
  const f = bewerte({ ...sauber, mergeBasen: 2 });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.MEHRERE_BASEN);
  assert.equal(f[0].fix?.art, FIXES.BEGRADIGEN);
});

test('mehrere Merge-Basen MIT Konflikt: nur der Konflikt, kein Begradigen', () => {
  const f = bewerte({ ...sauber, mergeBasen: 2, konflikte: ['a.liquid'] });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.KONFLIKT);
  assert.equal(f[0].fix, null);
});

test('Konflikte sind ein Fehler und nennen die Dateien', () => {
  const f = bewerte({ ...sauber, konflikte: ['blocks/x.liquid', 'templates/y.json'] });
  assert.equal(f[0].schwere, 'error');
  assert.match(f[0].text, /blocks\/x\.liquid, templates\/y\.json/);
});

test('fehlender Head-Branch: Fehler, sonst nichts', () => {
  const f = bewerte({ ...sauber, headExistiert: false, konflikte: ['egal'], mergeBasen: 3 });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.BRANCH_FEHLT);
});

test('keine Checks bei sauberem PR ist nur ein Hinweis', () => {
  const f = bewerte({ ...sauber, checks: 0 });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.KEINE_CHECKS);
  assert.equal(f[0].schwere, 'info');
});

test('Draft aendert die Bewertung nicht', () => {
  assert.deepEqual(bewerte({ ...sauber, draft: true }), []);
  assert.equal(bewerte({ ...sauber, draft: true, konflikte: ['a'] })[0].regel, REGELN.KONFLIKT);
});

test('Zusammenfassung zaehlt Fixes und Konflikte', () => {
  const prs = [
    sauber,
    { ...sauber, nummer: 2, mergeBasen: 2 },
    { ...sauber, nummer: 3, basis: 'b', basisExistiert: false, basisGemergt: null },
    { ...sauber, nummer: 4, konflikte: ['x'] },
  ];
  const z = zusammenfassung(bewerteAlle(prs));
  assert.deepEqual(z, { fehler: 1, warnungen: 2, konflikte: 1, umzielen: 1, begradigen: 1, changelog: 0 });
});

// Der Fall vom 2026-10-29: merge=union in .gitattributes machte den lokalen merge-tree
// blind, GitHub (ohne Merge-Treiber) meldete 6 von 7 PRs als CONFLICTING.
test('GitHub CONFLICTING bei sauberem merge-tree ist ein Konflikt, kein Hinweis auf fehlende Checks', () => {
  const f = bewerte({ ...sauber, checks: 0, githubMergeable: 'CONFLICTING', githubStatus: 'DIRTY' });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.KONFLIKT);
  assert.equal(f[0].schwere, 'error');
  assert.equal(f[0].fix, null);
  assert.match(f[0].text, /GitHub meldet CONFLICTING \(DIRTY\)/);
  assert.match(f[0].text, /--attr-source/);
  assert.equal(zusammenfassung(f).konflikte, 1);
});

test('GitHub CONFLICTING mit mehreren Merge-Basen: erst begradigen, dann neu rechnen', () => {
  const f = bewerte({ ...sauber, mergeBasen: 2, githubMergeable: 'CONFLICTING', githubStatus: 'DIRTY' });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.MEHRERE_BASEN);
  assert.equal(f[0].fix?.art, FIXES.BEGRADIGEN);
});

test('lokaler Konflikt und GitHub CONFLICTING werden nicht doppelt gemeldet', () => {
  const f = bewerte({ ...sauber, konflikte: ['a.liquid'], githubMergeable: 'CONFLICTING' });
  assert.equal(f.filter(x => x.regel === REGELN.KONFLIKT).length, 1);
  assert.match(f[0].text, /a\.liquid/);
});

test('GitHub UNKNOWN oder MERGEABLE, ohne Feld (alte Fakten): kein Befund', () => {
  assert.deepEqual(bewerte({ ...sauber, githubMergeable: 'UNKNOWN', githubStatus: 'UNKNOWN' }), []);
  const { githubMergeable, githubStatus, dateien, ...alt } = sauber;
  assert.deepEqual(bewerte(alt), []);
});

test('PR schreibt in die eingefrorene CHANGELOG.md: Warnung mit dem Weg, kein Fix', () => {
  const f = bewerte({ ...sauber, dateien: ['qa/x.mjs', CHANGELOG_ALT] });
  assert.equal(f.length, 1);
  assert.equal(f[0].regel, REGELN.CHANGELOG_DATEI);
  assert.equal(f[0].schwere, 'warn');
  assert.equal(f[0].fix, null);
  assert.match(f[0].text, /docs\/control-center\/changelog\//);
  assert.match(f[0].text, /changelog:guard/);
  assert.equal(zusammenfassung(f).changelog, 1);
  assert.deepEqual(bewerte({ ...sauber, dateien: ['docs/control-center/changelog/2026-10-29-a.md'] }), []);
});
