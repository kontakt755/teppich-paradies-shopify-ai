import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { laufenderDeploy, oeffneFenster, schliesseFenster, parseWorktrees, FENSTER_MAX_MS } from '../deploy-fenster.mjs';

const JETZT = Date.parse('2026-10-08T12:00:00Z');

function arbeitskopien() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-fenster-'));
  const deploy = path.join(basis, 'tp-deploy');
  const feature = path.join(basis, 'feature');
  fs.mkdirSync(deploy); fs.mkdirSync(feature);
  const porcelain = [
    `worktree ${feature}`, 'HEAD abc', 'branch refs/heads/feature/x', '',
    `worktree ${deploy}`, 'HEAD def', 'branch refs/heads/main', '',
  ].join('\n');
  return { deploy, feature, porcelain };
}

const frage = (porcelain, extra = {}) => laufenderDeploy({ worktreeListe: () => porcelain, now: JETZT, hostname: 'mac', isAlive: () => true, ...extra });

test('parseWorktrees liest Pfad und Branch', () => {
  const { porcelain, deploy } = arbeitskopien();
  assert.deepEqual(parseWorktrees(porcelain).find((w) => w.branch === 'main'), { pfad: deploy, branch: 'main' });
});

test('ohne Sperre und Fenster ist frei', () => {
  const { porcelain } = arbeitskopien();
  assert.equal(frage(porcelain), null);
});

test('offenes Fenster belegt, abgelaufenes oder geschlossenes nicht', () => {
  const { porcelain, deploy } = arbeitskopien();
  oeffneFenster(deploy, { head: 'fda3482f00', now: () => JETZT - 5 * 60 * 1000 });
  const belegt = frage(porcelain);
  assert.equal(belegt.pfad, deploy);
  assert.match(belegt.grund, /Deploy-Fenster offen.*fda3482f/);

  oeffneFenster(deploy, { head: 'x', now: () => JETZT - FENSTER_MAX_MS - 1000 });
  assert.equal(frage(porcelain), null);

  oeffneFenster(deploy, { head: 'x', now: () => JETZT });
  schliesseFenster(deploy);
  assert.equal(frage(porcelain), null);
});

test('laufende Preview-/Live-Sperre belegt, QA-Sperre und tote Prozesse nicht', () => {
  const { porcelain, deploy } = arbeitskopien();
  const sperre = (label) => {
    fs.mkdirSync(path.join(deploy, '.workflow'), { recursive: true });
    fs.writeFileSync(path.join(deploy, '.workflow/lock.json'), JSON.stringify({ label, pid: 4242, host: 'mac', startedAt: new Date(JETZT).toISOString() }));
  };
  sperre('workflow live');
  assert.match(frage(porcelain).grund, /workflow live/);
  assert.equal(frage(porcelain, { isAlive: () => false }), null);
  sperre('qa');
  assert.equal(frage(porcelain), null);
});

test('eine Sperre in einer Arbeitskopie ohne main zaehlt nicht', () => {
  const { porcelain, feature } = arbeitskopien();
  oeffneFenster(feature, { now: () => JETZT });
  assert.equal(frage(porcelain), null);
});

test('git nicht erreichbar: frei (fail-open)', () => {
  assert.equal(laufenderDeploy({ worktreeListe: () => { throw new Error('kein git'); } }), null);
});

test('Guard-Hook verweigert gh pr merge und Push nach main waehrend eines Deploys', () => {
  const hook = fileURLToPath(new URL('../../.claude/hooks/git-gh-guard.mjs', import.meta.url));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-hook-'));
  const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x');
  const lauf = (command) => {
    const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    return r.stdout.includes('"deny"') ? 'BLOCK' : 'DURCH';
  };
  assert.equal(lauf('gh pr merge 980 --merge'), 'DURCH');
  oeffneFenster(repo, { head: 'abc' });
  assert.equal(lauf('gh pr merge 980 --merge'), 'BLOCK');
  assert.equal(lauf('cd x && gh pr merge 980 --squash'), 'BLOCK');
  assert.equal(lauf('git push origin main'), 'BLOCK');
  assert.equal(lauf('git push origin HEAD:main'), 'BLOCK');
  assert.equal(lauf('git push -u origin feature/x'), 'DURCH');
  assert.equal(lauf('gh pr create --base main --title x'), 'DURCH');
  assert.equal(lauf('gh pr view 980'), 'DURCH');
  schliesseFenster(repo);
  assert.equal(lauf('gh pr merge 980 --merge'), 'DURCH');
});
