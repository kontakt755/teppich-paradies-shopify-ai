#!/usr/bin/env node
// Stop-Hook: verhindert, dass eine Session sich beendet, obwohl Änderungen im
// Working Tree liegen, für die keine frische PASS-Validierung (npm run
// workflow:validate) für den aktuellen HEAD vorliegt. Ergänzt, ersetzt nicht
// das CI-Evidence-Gate (workflow/verify-local-checks.mjs) - dieser Hook ist
// lokale, überspringbare Komfortschicht, kein Sicherheitsbeweis.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

// Verhindert Endlosschleife: wenn dieser Hook bereits einmal blockiert hat
// und Claude erneut versucht zu stoppen, nicht ein zweites Mal blockieren.
if (payload.stop_hook_active) process.exit(0);

const root = process.cwd();

function git(args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); } catch { return null; }
}

const status = git(['status', '--porcelain']);
if (status === null || status.trim() === '') process.exit(0); // nichts geändert, nichts zu validieren

const head = git(['rev-parse', 'HEAD'])?.trim();
const latestPath = path.join(root, '.workflow', 'latest.json');

if (!head || !existsSync(latestPath)) {
  console.error('BLOCKED: Working Tree hat Änderungen, aber es liegt keine .workflow/latest.json vor. Erst npm run workflow:validate ausführen, bevor die Session als fertig gilt.');
  process.exit(2);
}

let latest;
try { latest = JSON.parse(readFileSync(latestPath, 'utf8')); } catch { latest = null; }

if (!latest || latest.status !== 'PASS' || latest.commit !== head) {
  console.error(`BLOCKED: .workflow/latest.json ist nicht aktuell (status=${latest?.status ?? '-'}, commit=${latest?.commit ?? '-'} vs HEAD=${head}). Erst npm run workflow:validate für den aktuellen Stand ausführen.`);
  process.exit(2);
}

process.exit(0);
