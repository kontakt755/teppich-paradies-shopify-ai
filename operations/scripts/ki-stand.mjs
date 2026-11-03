#!/usr/bin/env node
/**
 * Stand der KI-Werkzeuge pruefen (launchd-Dienst net.teppich-paradies.ki-stand, stuendlich).
 * Stuendlich und ohne KI: Codex-Kontingent, native Musterautomatik. Montags ohne KI: Claude-Version
 * und Werkzeugprobe. Hoechstens einmal im Monat, nur bei neuen Changelog-Zeilen: ein Lauf `claude -p`
 * mit Sonnet ohne Werkzeuge, der hoechstens 3 Vorschlaege in eine private Datei schreibt.
 * Aendert selbst nichts und aktualisiert nie (Update nur mit Freigabe des Inhabers).
 *
 *   node operations/scripts/ki-stand.mjs            # pruefen, Status schreiben
 *   node operations/scripts/ki-stand.mjs --trocken  # nur anzeigen, ohne Netz, Probe und Schreiben
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privatDir, routinenDir, schreibStatus, liesStatus } from '../lib/routinen.mjs';
import { musterAutomatikDaten } from '../lib/muster-bestellautomatik.mjs';
import { letzteCodexLimits, bewerteCodex, bewerteMuster, bewerteClaude, claudeAbgleichFaellig, changelogSeit, vorschlagPrompt } from '../lib/ki-stand.mjs';
import { claudeUmgebung, mitteilung } from './claude-lauf.mjs';

const REGISTRY = 'https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags';
const CHANGELOG = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const TITEL = { 'codex-stand': 'Codex-Kontingent', 'muster-versand': 'Musterautomatik', 'claude-stand': 'Claude-Code-Stand' };

function installierteVersion(home) {
  try { return path.basename(fs.realpathSync(path.join(home, '.local', 'bin', 'claude'))).match(/^\d+\.\d+\.\d+$/)?.[0] || null; } catch { return null; }
}

async function holeText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function werkzeugprobe(env) {
  const skript = fileURLToPath(new URL('./claude-lauf.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [skript, 'fehlermeldungen', '--werkzeugprobe'], { env, encoding: 'utf8', timeout: 120_000 });
  return r.status === 0 ? { ok: true } : { ok: false, fehler: `Exit ${r.status}` };
}

/** Sonnet ohne Werkzeuge: das Ergebnis ist nur Text in einer privaten Datei. */
function monatsVorschlag(env, home, changelog) {
  const bin = env.TP_CLAUDE_BIN || path.join(home, '.local', 'bin', 'claude');
  return execFileSync(bin, ['-p', '--model', 'claude-sonnet-5-5', '--effort', 'medium', '--tools', '', '--setting-sources', 'user', '--strict-mcp-config', '--no-session-persistence'], {
    input: vorschlagPrompt(changelog), encoding: 'utf8', timeout: 300_000, cwd: os.tmpdir(),
    env: claudeUmgebung(env, 'ki-stand', { id: 'monat' }),
  }).trim();
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const melde = deps.melde || mitteilung;
  const home = env.HOME || os.homedir();
  const unbekannt = argv.filter(a => a !== '--trocken');
  if (unbekannt.length) { (deps.fehler || console.error)(`Unbekanntes Argument: ${unbekannt.join(' ')}`); return 2; }
  const trocken = argv.includes('--trocken');
  const privat = privatDir(env);
  let schlecht = false;
  const ablegen = (id, g) => {
    aus(`${jetzt.toISOString()} ${TITEL[id]}: ${g.ok ? 'ok' : `FEHLER (${g.art})`} – ${g.meldung}`);
    if (!g.ok) schlecht = true;
    if (trocken) return;
    const { mitteilen } = schreibStatus(privat, id, g, jetzt);
    if (mitteilen) melde(TITEL[id], g.meldung);
  };

  ablegen('codex-stand', bewerteCodex(letzteCodexLimits(env.TP_CODEX_DIR || path.join(home, '.codex'), jetzt), jetzt));

  let muster;
  try { muster = bewerteMuster(musterAutomatikDaten(privat), jetzt); } catch (e) { muster = { ok: false, art: 'unlesbar', meldung: e.message }; }
  ablegen('muster-versand', muster);

  let alt = {};
  try { alt = liesStatus(privat, 'claude-stand'); } catch { alt = {}; }
  if (trocken || !claudeAbgleichFaellig(alt.letzterAbgleich, jetzt)) return schlecht ? 1 : 0;

  const installiert = installierteVersion(home);
  let tags = null;
  try { tags = JSON.parse(await (deps.holeText || holeText)(REGISTRY)); } catch (e) { aus(`npm-Abruf: ${e.message}`); }
  const probe = (deps.probe || werkzeugprobe)(env);
  const g = { ...bewerteClaude({ installiert, tags, probe }), letzterAbgleich: jetzt.toISOString() };

  const monat = jetzt.toISOString().slice(0, 7);
  const seit = alt.vorschlagVersion || installiert;
  if (g.ok && installiert && alt.vorschlagMonat !== monat && tags?.latest) {
    try {
      const zeilen = changelogSeit(await (deps.holeText || holeText)(CHANGELOG), seit);
      if (zeilen) {
        const ordner = path.join(routinenDir(privat), 'ki-stand');
        fs.mkdirSync(ordner, { recursive: true, mode: 0o700 });
        const datei = path.join(ordner, `vorschlaege-${monat}.md`);
        fs.writeFileSync(datei, `${(deps.vorschlag || monatsVorschlag)(env, home, zeilen)}\n`, { mode: 0o600 });
        g.hinweis = [`Vorschläge: routinen/ki-stand/vorschlaege-${monat}.md.`, g.hinweis].filter(Boolean).join(' ');
      }
      g.vorschlagMonat = monat;
      g.vorschlagVersion = tags.latest;
    } catch (e) { aus(`Monatsvorschlag: ${e.message}`); }
  }
  ablegen('claude-stand', g);
  if (g.hinweis && g.hinweis !== alt.hinweis) melde(TITEL['claude-stand'], g.hinweis);
  return schlecht ? 1 : 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  process.exitCode = await main();
}
