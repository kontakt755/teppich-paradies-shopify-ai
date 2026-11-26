/**
 * .claude/hooks/godmode-installieren.sh (aus session-start.sh, nur Remote):
 * installiert das Plugin godmode einmal je Rechner, weil `enabledPlugins` in
 * settings.json es nicht von selbst installiert. Getestet mit einem falschen
 * `claude` im PATH und einem Wegwerf-HOME.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SKRIPT = path.resolve(import.meta.dirname, 'godmode-installieren.sh');

function lauf({ cache = false, claudeExit = 0, extraEnv = {} } = {}) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'godmode-hook-'));
  const home = path.join(tmp, 'home');
  const bin = path.join(tmp, 'bin');
  const protokoll = path.join(tmp, 'aufrufe.txt');
  mkdirSync(home);
  mkdirSync(bin);
  if (cache) mkdirSync(path.join(home, '.claude/plugins/cache/godmode'), { recursive: true });
  writeFileSync(path.join(bin, 'claude'),
    `#!/bin/bash\necho "$TP_GODMODE_INSTALL|$*" >> "${protokoll}"\nexit ${claudeExit}\n`);
  chmodSync(path.join(bin, 'claude'), 0o755);
  const r = spawnSync('bash', [SKRIPT], {
    encoding: 'utf8',
    env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, ...extraEnv },
  });
  const aufrufe = existsSync(protokoll) ? readFileSync(protokoll, 'utf8').trim().split('\n') : [];
  rmSync(tmp, { recursive: true, force: true });
  return { ...r, aufrufe };
}

test('fehlt das Plugin, wird es einmal fuer das Projekt installiert', () => {
  const r = lauf();
  assert.equal(r.status, 0);
  assert.deepEqual(r.aufrufe, ['1|plugin install godmode --marketplace NoobyGains/godmode --scope project']);
});

test('ist das Plugin schon da, wird claude nicht aufgerufen', () => {
  const r = lauf({ cache: true });
  assert.equal(r.status, 0);
  assert.deepEqual(r.aufrufe, []);
});

test('ruft sich nicht selbst auf, wenn die Installation eine Sitzung startet', () => {
  const r = lauf({ extraEnv: { TP_GODMODE_INSTALL: '1' } });
  assert.equal(r.status, 0);
  assert.deepEqual(r.aufrufe, []);
});

test('ein Fehler bei der Installation haelt den Sitzungsstart nicht auf, wird aber gemeldet', () => {
  const r = lauf({ claudeExit: 1 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /godmode.*nicht installiert/);
});
