#!/usr/bin/env node
/**
 * npm test mit eigenem Temp-Ordner (#1457): Die Suiten legen per mkdtemp viele Ordner an
 * (cc-api-*, tp-worktree-lock-*, ops-server-* ...) und raeumen sie nicht weg. Hier zeigt
 * TMPDIR fuer alle Suiten auf einen Ordner, der nach dem Lauf - auch bei Fehlern oder
 * Abbruch - geloescht wird. Aufruf: node scripts/test-mit-temp.mjs <befehl...>
 * (die Suitenkette steht in package.json unter test:suiten).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-npm-test-'));
const weg = () => fs.rmSync(tmp, { recursive: true, force: true });
process.on('exit', weg);
for (const [s, c] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(s, () => process.exit(c));

const [befehl, ...argumente] = process.argv.slice(2);
const r = spawnSync(befehl, argumente, { stdio: 'inherit', env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
