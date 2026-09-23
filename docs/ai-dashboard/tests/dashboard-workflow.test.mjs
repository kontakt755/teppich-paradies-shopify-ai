// Prueft die Commit-Logik aus .github/workflows/dashboard-data.yml.
//
// Der Kern ist die Konfliktaufloesung nach einem abgelehnten Push. Sie stand
// bis 2026-09-23 auf "git checkout --ours" und nahm damit die AELTERE Fassung
// vom Server statt der im selben Lauf erzeugten. Der Kommentar daneben
// behauptete das Gegenteil - ein Kommentar ist keine Pruefung, deshalb dieser
// Test. Hintergrund: docs/lessons/rebase-ours-ist-der-upstream.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflowPfad = join(wurzel, '.github', 'workflows', 'dashboard-data.yml');
const workflow = readFileSync(workflowPfad, 'utf8');

// --- Schritt "Committen wenn geaendert" aus der YAML holen ------------------
// Bewusst ohne YAML-Parser (das Repo hat keinen): der Test soll an genau der
// Datei haengen, die GitHub ausfuehrt. Schlaegt die Extraktion fehl, wurde der
// Schritt umgebaut und dieser Test gehoert mit angepasst.

function schrittBlock(name, schluessel) {
  const zeilen = workflow.split('\n');
  const start = zeilen.findIndex((z) => z.trim() === `- name: ${name}`);
  assert.notEqual(start, -1, `Schritt "${name}" nicht in dashboard-data.yml gefunden`);

  const kopf = zeilen.findIndex((z, i) => i > start && z.trim() === `${schluessel}: |`);
  assert.notEqual(kopf, -1, `"${schluessel}: |" nach Schritt "${name}" nicht gefunden`);

  const einzug = zeilen[kopf].length - zeilen[kopf].trimStart().length;
  const koerper = [];
  for (let i = kopf + 1; i < zeilen.length; i += 1) {
    const zeile = zeilen[i];
    if (zeile.trim() === '') { koerper.push(''); continue; }
    if (zeile.length - zeile.trimStart().length <= einzug) break;
    koerper.push(zeile.slice(einzug + 2));
  }
  return koerper.join('\n').replace(/\n+$/, '\n');
}

function envWert(schluessel) {
  const treffer = workflow.match(new RegExp(`^\\s*${schluessel}:\\s*'([^']*)'`, 'm'));
  assert.ok(treffer, `env-Eintrag ${schluessel} nicht in dashboard-data.yml gefunden`);
  return treffer[1];
}

const commitSkript = schrittBlock('Committen wenn geaendert', 'run');
const DATEIEN = envWert('DATEIEN');

// --- Statische Zusicherung --------------------------------------------------

test('Bot-Dateien werden mit --theirs aufgeloest, nie mit --ours', () => {
  const aufloesungen = [...commitSkript.matchAll(/git checkout --(ours|theirs)\b/g)].map((m) => m[1]);

  assert.ok(aufloesungen.length > 0, 'keine Konfliktaufloesung im Commit-Schritt gefunden');
  assert.deepEqual(
    [...new Set(aufloesungen)],
    ['theirs'],
    'Waehrend eines Rebase ist "ours" der Upstream (origin/main) und "theirs" der ' +
      'eigene, gerade wiedergespielte Commit. Fuer die frisch erzeugten Bot-Dateien ' +
      'ist --theirs richtig; --ours wuerde den aelteren Serverstand behalten.',
  );
});

test('DATEIEN nennt genau die beiden erzeugten Dashboard-Dateien', () => {
  assert.deepEqual(DATEIEN.split(/\s+/).filter(Boolean), [
    'docs/ai-dashboard/issues.json',
    'docs/ai-dashboard/bodenwissen.json',
  ]);
});

// --- Verhaltensprobe: das echte Skript im Wegwerf-Repo ----------------------

const umgebung = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

// stdio komplett einfangen: der Lauf erzeugt absichtlich einen abgelehnten
// Push und einen Rebase-Konflikt: deren git-Meldungen sind erwartet und haetten
// in der Testausgabe nichts verloren. Im Fehlerfall werden sie angehaengt.
function fuehreAus(befehl, args, cwd, extraEnv = {}) {
  try {
    return execFileSync(befehl, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...umgebung, ...extraEnv },
    });
  } catch (fehler) {
    fehler.message = `${fehler.message}\n--- stdout ---\n${fehler.stdout ?? ''}\n--- stderr ---\n${fehler.stderr ?? ''}`;
    throw fehler;
  }
}

const git = (args, cwd) => fuehreAus('git', args, cwd);

function schreibe(repo, datei, inhalt) {
  mkdirSync(join(repo, dirname(datei)), { recursive: true });
  writeFileSync(join(repo, datei), inhalt);
}

/**
 * Baut das Szenario des Workflows nach: der Bot hat ausgecheckt und die
 * Dateien neu erzeugt, waehrenddessen landet ein fremder Commit auf
 * origin/main, der dieselbe Datei anfasst. Der Push wird abgelehnt.
 * Gibt zurueck, was nach dem Lauf tatsaechlich auf origin/main steht.
 */
function laufMitFremdemCommit(basis) {
  const server = join(basis, 'server.git');
  const saat = join(basis, 'saat');
  const bot = join(basis, 'bot');

  git(['init', '-q', '--bare', '-b', 'main', server], basis);

  git(['clone', '-q', server, saat], basis);
  git(['checkout', '-q', '-B', 'main'], saat);
  schreibe(saat, 'docs/ai-dashboard/issues.json', '{"stand":"ALT"}\n');
  schreibe(saat, 'docs/ai-dashboard/bodenwissen.json', '{"stand":"ALT"}\n');
  git(['add', '--', 'docs/ai-dashboard/issues.json', 'docs/ai-dashboard/bodenwissen.json'], saat);
  git(['commit', '-qm', 'Ausgangsstand'], saat);
  git(['push', '-q', 'origin', 'main'], saat);

  // Der Bot-Lauf: Dateien neu erzeugt, noch nicht committet.
  git(['clone', '-q', server, bot], basis);
  schreibe(bot, 'docs/ai-dashboard/issues.json', '{"stand":"FRISCH"}\n');
  schreibe(bot, 'docs/ai-dashboard/bodenwissen.json', '{"stand":"FRISCH"}\n');

  // Parallel: fremder Commit auf origin/main, gleiche Datei.
  schreibe(saat, 'docs/ai-dashboard/issues.json', '{"stand":"FREMD"}\n');
  git(['add', '--', 'docs/ai-dashboard/issues.json'], saat);
  git(['commit', '-qm', 'fremder Commit'], saat);
  git(['push', '-q', 'origin', 'main'], saat);

  // Das echte Skript aus der Workflow-Datei. "sleep" wird ueberbrueckt, sonst
  // wartet der Test die Backoff-Sekunden des zweiten Versuchs ab.
  fuehreAus('bash', ['-c', `sleep() { :; }\n${commitSkript}`], bot, { DATEIEN });

  const pruefung = join(basis, 'pruefung');
  git(['clone', '-q', server, pruefung], basis);
  return {
    issues: readFileSync(join(pruefung, 'docs/ai-dashboard/issues.json'), 'utf8').trim(),
    bodenwissen: readFileSync(join(pruefung, 'docs/ai-dashboard/bodenwissen.json'), 'utf8').trim(),
    historie: git(['log', '--oneline', '-3'], pruefung),
  };
}

test('nach Rebase-Konflikt steht die frisch erzeugte Fassung auf origin/main', (t) => {
  const basis = mkdtempSync(join(tmpdir(), 'dashboard-workflow-'));
  t.after(() => rmSync(basis, { recursive: true, force: true }));

  const ergebnis = laufMitFremdemCommit(basis);

  assert.equal(
    ergebnis.issues,
    '{"stand":"FRISCH"}',
    'Die im Lauf erzeugte issues.json muss den Konflikt gewinnen, nicht der aeltere Serverstand',
  );
  assert.equal(ergebnis.bodenwissen, '{"stand":"FRISCH"}');
  assert.match(ergebnis.historie, /Dashboard-Daten aktualisieren/);
  assert.match(ergebnis.historie, /fremder Commit/, 'der fremde Commit bleibt erhalten');
});
