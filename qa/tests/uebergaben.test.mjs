// Tests fuer scripts/uebergaben.mjs - offene Uebergaben je Empfaenger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frontmatter, empfaenger, eintrag, gruppe, hinweise, bericht, laden, vaultOrdner } from '../../scripts/uebergaben.mjs';

const md = (kopf, titel = 'Titel', rumpf = '') => `---\n${kopf}\n---\n\n# ${titel}\n\n${rumpf}`;

test('frontmatter: oberste Ebene und metadata-Block, oberste Ebene gewinnt', () => {
  assert.deepEqual(frontmatter(md('status: offen\nan: Claude Code\naktualisiert: 2026-10-20')), { status: 'offen', an: 'Claude Code', aktualisiert: '2026-10-20' });
  const alt = frontmatter(md('metadata:\n  status: wartet-inhaber\n  an: "Codex / Claude Code"'));
  assert.equal(alt.status, 'wartet-inhaber');
  assert.equal(alt.an, 'Codex / Claude Code');
  assert.equal(frontmatter(md('status: offen\nmetadata:\n  status: fertig')).status, 'offen');
  assert.deepEqual(frontmatter('# ohne Kopf'), {});
});

test('empfaenger und gruppe: eine KI, beide oder nur Menschen', () => {
  assert.deepEqual(empfaenger({ an: 'Claude Code' }), ['claude']);
  assert.deepEqual(empfaenger({ an: 'Codex-Leitstelle / Claude' }), ['claude', 'codex']);
  assert.deepEqual(empfaenger({ an: 'Inhaber und Claude Code' }), ['claude', 'mensch']);
  assert.equal(gruppe({ empfaenger: ['claude', 'codex'] }), 'geteilt');
  assert.equal(gruppe({ empfaenger: ['claude', 'mensch'] }), 'claude');
  assert.equal(gruppe({ empfaenger: ['mensch'] }), 'mensch');
  assert.equal(gruppe({ empfaenger: [] }), 'unklar');
  // ein gesetztes zustaendig entscheidet allein
  assert.deepEqual(empfaenger({ an: 'Codex / Claude', zustaendig: 'codex' }), ['codex']);
  assert.deepEqual(empfaenger({ an: 'Codex / Claude', zustaendig: 'Codex, Koordinationspruefung 24.10.2026' }), ['codex']);
});

test('hinweise: unklare Zustaendigkeit, Groesse und Stillstand', () => {
  const e = { empfaenger: ['claude', 'codex'], zustaendig: '', bytes: 50 * 1024, status: 'offen', aktualisiert: '2026-10-10' };
  const h = hinweise(e, '2026-10-24');
  assert.ok(h.some((x) => /mehrere Empfaenger/.test(x)));
  assert.ok(h.some((x) => /50 KB/.test(x)));
  assert.ok(h.some((x) => /seit 14 Tagen/.test(x)));
  assert.deepEqual(hinweise({ ...e, zustaendig: 'codex', bytes: 100, aktualisiert: '2026-10-23' }, '2026-10-24'), []);
  assert.ok(!hinweise({ ...e, status: 'wartet', zustaendig: 'x', bytes: 1 }, '2026-10-24').some((x) => /seit/.test(x)), 'Warten ist kein Stillstand');
});

test('bericht --kurz: nur Offenes fuer den Empfaenger, ohne Treffer leer', () => {
  const liste = [
    eintrag('/v/a.md', md('status: offen\nan: Claude Code\naktualisiert: 2026-10-20', 'A'), 10),
    eintrag('/v/b.md', md('status: wartet\nan: Claude Code\naktualisiert: 2026-10-21', 'B'), 10),
    eintrag('/v/c.md', md('status: fertig\nan: Claude Code\naktualisiert: 2026-10-22', 'C'), 10),
    eintrag('/v/d.md', md('status: in-arbeit\nan: Codex\naktualisiert: 2026-10-22', 'D'), 10),
  ];
  const k = bericht(liste, { heute: '2026-10-24', an: 'claude', kurz: true });
  assert.match(k, /Offene Uebergaben an claude: 1/);
  assert.match(k, /offen +4T {2}a/);
  assert.doesNotMatch(k, /\bb\b|\bc\b|\bd\b/);
  assert.equal(bericht(liste.slice(1, 3), { heute: '2026-10-24', an: 'claude', kurz: true }), '');
  const voll = bericht(liste, { heute: '2026-10-24' });
  assert.match(voll, /Offen \/ in Arbeit: 2/);
  assert.match(voll, /Wartet: 1/);
  assert.doesNotMatch(voll, /\bc$/m, 'Erledigtes erscheint nicht');
});

test('laden: liest Aufgaben, laesst Inbox und Vorlage weg', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-uebergaben-'));
  const dir = path.join(vault, 'Zusammenarbeit', 'Aufgaben');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-10-24-x.md'), md('status: offen\nan: Codex', 'X'));
  fs.writeFileSync(path.join(dir, 'Inbox.md'), '# Inbox');
  fs.writeFileSync(path.join(dir, 'Vorlage.md'), md('status: offen\nan:', 'Vorlage'));
  const l = laden(vault);
  assert.equal(l.length, 1);
  assert.equal(l[0].titel, 'X');
  assert.deepEqual(l[0].empfaenger, ['codex']);
});

test('vaultOrdner: TP_GEDAECHTNIS_DIR hat Vorrang, sonst Hauptcheckout', () => {
  assert.equal(vaultOrdner({ TP_GEDAECHTNIS_DIR: '/x/memory' }), '/x/memory');
  const ausserhalb = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-kein-repo-'));
  assert.equal(vaultOrdner({ HOME: '/h' }, ausserhalb), path.join('/h', '.claude', 'projects', ausserhalb.replace(/\//g, '-'), 'memory'));
});
