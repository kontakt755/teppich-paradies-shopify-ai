#!/usr/bin/env node
/**
 * Dienst-Checkout (~/tp-dashboard, Zweig dashboard-betrieb) automatisch auf main nachziehen -
 * erst getestet, dann uebernommen, mit Rueckweg. Ersetzt die Handgriffe aus Skill
 * control-center, Schritt 9 (seit dem 12.10. rund 140-mal von Hand oder per KI-Lauf).
 *
 *   npm run -s betrieb:nachziehen              # einmal pruefen und bei Bedarf nachziehen
 *   npm run -s betrieb:nachziehen -- --probe   # pruefen und testen, nichts uebernehmen
 *   npm run -s betrieb:nachziehen -- --status  # letzten Stand anzeigen
 *
 * Laeuft alle 5 Minuten als launchd-Dienst net.teppich-paradies.nachziehen
 * (bash operations/scripts/dienste-einrichten.sh --nur-nachziehen). Ablauf:
 *  1. git fetch. Nichts Neues: fertig, ohne Ausgabe.
 *  2. Nur im Kopf zusammenfuehren (git merge-tree). Konflikt: haengt, der Dienst laeuft weiter.
 *  3. Den zusammengefuehrten Stand als Commit anlegen und genau diesen in einer Probekopie
 *     testen (git archive, Testsuiten je nach geaenderten Ordnern). Rot: haengt.
 *  4. Auf Ruhe warten: kein Codex-Lauf in diesem Checkout, zwei Minuten keine Eingabe im
 *     Dashboard. Nach zehn Minuten ohne Ruhe versucht es der naechste Lauf.
 *  5. Den getesteten Commit vorspulen (merge --ff-only), Abhaengigkeiten bei Bedarf neu,
 *     betroffene Dienste neu starten; das Dashboard muss danach antworten.
 *  6. Antwortet es nicht: zurueck auf den Stand von vorher (reset --keep auf den Commit, der
 *     Sekunden zuvor HEAD war; der Zweig traegt keine eigenen Inhalte), neu starten, haengt.
 * Ein gescheiterter main-Stand wird erst wieder versucht, wenn main weiterzieht.
 * Zustand: $TP_PRIVAT_DIR/betrieb-nachziehen.json, im Dashboard unter Systemzustand.
 * Nie pushen: gesichert ist alles ueber main.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  codexArbeitet, neustartNoetig, privatRuhe, probeTests, prZeilen,
  zustandLesen, zustandNach, zustandSchreiben,
} from '../lib/betrieb-nachziehen.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');

export const DIENSTE = Object.freeze({
  // Der Start baut erst issues.json (zwei GitHub-Abrufe mit je 60 s Zeitlimit), daher mehr Luft.
  dashboard: { label: 'net.teppich-paradies.dashboard', url: 'http://127.0.0.1:8001/login', ok: s => s === 200, startMs: 240000 },
  sync: { label: 'net.teppich-paradies.sync' },
  // Social antwortet ohne Anmeldung 401, ohne gesetzten Zugang 200: jede Antwort heisst "laeuft".
  social: { label: 'net.teppich-paradies.social', url: 'http://127.0.0.1:8020/api/status', ok: s => s < 500 },
});

const NAMEN = { dashboard: 'das Dashboard', sync: 'der Datenabgleich', social: 'der Social-Dienst', 'npm ci': 'die Programmbibliothek' };
const warte = ms => new Promise(r => setTimeout(r, ms));
const kurz = sha => String(sha || '').slice(0, 8);

function git(repo, args, { erlaubt = [0] } = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!erlaubt.includes(r.status)) {
    throw new Error(`git ${args[0]} fehlgeschlagen: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ')}`);
  }
  // Nur hinten kuerzen: `status --porcelain` beginnt mit einer bedeutsamen Leerstelle.
  return { code: r.status, out: (r.stdout || '').trimEnd() };
}

function npm(cwd, args, { env = process.env, timeoutMs = 15 * 60000 } = {}) {
  const r = spawnSync('npm', args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, ende: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-25).join('\n') };
}

/** Echte Dienststeuerung ueber launchd; Tests geben eigene Funktionen mit. */
export function launchdSteuerung({ uid = process.getuid?.() } = {}) {
  const ziel = label => `gui/${uid}/${label}`;
  const pid = label => {
    const r = spawnSync('launchctl', ['print', ziel(label)], { encoding: 'utf8' });
    if (r.status !== 0) return undefined; // nicht geladen
    return Number(r.stdout.match(/^\s*pid = (\d+)/m)?.[1]) || null;
  };
  return {
    geladen: label => pid(label) !== undefined,
    neustart: label => { execFileSync('launchctl', ['kickstart', '-k', ziel(label)]); },
    async gesund(dienst, { vorherPid } = {}) {
      const bis = Date.now() + (dienst.startMs || 120000);
      await warte(2000);
      while (Date.now() < bis) {
        const jetzt = pid(dienst.label);
        const neu = jetzt && jetzt !== vorherPid;
        // Ohne Adresse (Sync): dieselbe neue PID zehn Sekunden lang, sonst stuerzt er nur im Kreis ab.
        if (neu && !dienst.url) { await warte(10000); if (pid(dienst.label) === jetzt) return true; continue; }
        if (neu && dienst.url) {
          try {
            const r = await fetch(dienst.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
            if (dienst.ok(r.status)) return true;
          } catch { /* startet noch */ }
        }
        await warte(2000);
      }
      return false;
    },
    pid,
  };
}

// Probekopie als losgeloeste Arbeitskopie: einige Tests lesen den Dienststand aus git,
// ein reines Archiv ohne .git reicht deshalb nicht.
function probeKopie(repo, commit, { lockGeaendert, suiten, log }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-nachziehen-'));
  // Die Probe sieht nie die echten Betriebsdaten.
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-nachziehen-privat-'));
  try {
    git(repo, ['worktree', 'add', '--detach', '--quiet', dir, commit]);
    const module = path.join(repo, 'node_modules');
    if (!lockGeaendert && fs.existsSync(module)) fs.symlinkSync(module, path.join(dir, 'node_modules'));
    else if (fs.existsSync(path.join(dir, 'package-lock.json'))) {
      const ci = npm(dir, ['ci', '--no-audit', '--no-fund']);
      if (!ci.ok) return { ok: false, suite: 'npm ci', ende: ci.ende };
    }
    for (const suite of suiten) {
      log(`Probe: ${suite} …`);
      const r = npm(dir, ['run', '-s', suite], { env: { ...process.env, TP_PRIVAT_DIR: privat } });
      if (!r.ok) return { ok: false, suite, ende: r.ende };
    }
    return { ok: true };
  } finally {
    const weg = git(repo, ['worktree', 'remove', '--force', dir], { erlaubt: [0, 128] });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(privat, { recursive: true, force: true });
    // Nur wenn das Entfernen scheiterte, bleibt ein Eintrag ohne Ordner zurueck.
    if (weg.code !== 0) git(repo, ['worktree', 'prune'], { erlaubt: [0, 128] });
  }
}

/** Ein Lauf dauert hoechstens rund eine Stunde (10 Minuten Warten, Suiten mit Zeitlimit). */
export const SPERRE_ALT_MS = 3 * 3600000;

/**
 * Verwaist ist eine Sperre, deren Prozess nachweislich weg ist (ESRCH) oder die laenger
 * steht als jeder Lauf - sonst blockierte eine wiederverwendete PID den Automaten fuer immer.
 */
export function sperreVerwaist(datei, { jetzt = Date.now() } = {}) {
  let pid = 0;
  let alter = 0;
  try { pid = Number(fs.readFileSync(datei, 'utf8')); alter = jetzt - fs.statSync(datei).mtimeMs; }
  catch (e) { return e.code === 'ENOENT'; }
  if (alter > SPERRE_ALT_MS || !Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}

export function sperreNehmen(datei, { versuche = 2 } = {}) {
  try {
    fs.writeFileSync(datei, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST' || versuche <= 1 || !sperreVerwaist(datei)) return false;
    fs.rmSync(datei, { force: true });
    return sperreNehmen(datei, { versuche: versuche - 1 });
  }
}

/**
 * Ein Lauf. Gibt das Ergebnis zurueck und schreibt den Zustand. `steuerung` kapselt launchd
 * (geladen, neustart, gesund, pid); `ruhe` liefert { ruhig, grund }.
 */
export async function nachziehen({
  repo = REPO,
  privatDir = process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR,
  zweig = 'dashboard-betrieb',
  probe = false,
  steuerung = launchdSteuerung(),
  dienste = DIENSTE,
  ruhe,
  warteMs = 10 * 60000,
  pollMs = 15000,
  log = () => {},
  jetzt = () => new Date(),
} = {}) {
  fs.mkdirSync(privatDir, { recursive: true });
  const sperre = path.join(privatDir, 'betrieb-nachziehen.lock');
  if (!sperreNehmen(sperre)) return { stand: 'laeuft-schon' };
  const alt = zustandLesen(privatDir);
  // Eine Probe von Hand aendert nie den Zustand des Dienstes.
  const ende = ergebnis => {
    if (!probe) zustandSchreiben(privatDir, zustandNach(alt, ergebnis, jetzt()));
    // Derselbe Stand wie beim letzten Lauf: das Protokoll muss ihn nicht alle 5 Minuten wiederholen.
    return { ...ergebnis, wiederholt: alt.stand === ergebnis.stand && alt.grund === (ergebnis.grund ?? null) };
  };
  ruhe ||= () => {
    const codex = codexArbeitet({ automationsDir: path.join(os.homedir(), '.codex', 'automations'), sessionsDir: path.join(os.homedir(), '.codex', 'sessions'), checkout: repo, jetzt: jetzt() });
    if (codex.arbeitet) return { ruhig: false, grund: codex.grund };
    const eingabe = privatRuhe(privatDir, { jetzt: jetzt() });
    return eingabe.ruhig ? { ruhig: true } : { ruhig: false, grund: `Eingabe im Dashboard vor ${eingabe.alterSekunden} s (${eingabe.datei})` };
  };
  try {
    const aktuellerZweig = git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { erlaubt: [0, 1] }).out;
    if (aktuellerZweig !== zweig) return ende({ stand: 'haengt', art: 'zweig', grund: `Arbeitskopie steht auf „${aktuellerZweig || 'losgelöst'}“ statt „${zweig}“` });
    try { git(repo, ['fetch', '--quiet', 'origin']); }
    catch (e) { return ende({ stand: 'wartet', grund: `main nicht erreichbar (${e.message.slice(0, 120)})` }); }
    const head = git(repo, ['rev-parse', 'HEAD']).out;
    const main = git(repo, ['rev-parse', 'origin/main']).out;
    const rueckstand = Number(git(repo, ['rev-list', '--count', 'HEAD..origin/main']).out);
    const basis = { betrieb: kurz(head), main: kurz(main), rueckstand };
    if (rueckstand === 0) return ende({ stand: 'aktuell', ...basis });
    if (alt.gesperrt?.main === kurz(main) && !probe) return { stand: 'haengt', grund: alt.gesperrt.grund, ...basis, still: true };

    const schmutzig = git(repo, ['status', '--porcelain', '--untracked-files=no']).out;
    if (schmutzig) {
      const dateien = schmutzig.split('\n').map(z => z.slice(3)).slice(0, 5).join(', ');
      return ende({ stand: 'haengt', art: 'arbeitskopie', grund: `Im Dienst-Ordner liegen eigene Änderungen (${dateien})`, ...basis });
    }
    const baum = git(repo, ['merge-tree', '--write-tree', '--name-only', 'HEAD', 'origin/main'], { erlaubt: [0, 1] });
    if (baum.code === 1) {
      // Ausgabe: Baum, betroffene Dateien, Leerzeile, Meldungen.
      const rest = baum.out.split('\n').slice(1);
      const leer = rest.indexOf('');
      const dateien = (leer < 0 ? rest : rest.slice(0, leer)).slice(0, 5).join(', ');
      return ende({ stand: 'haengt', art: 'konflikt', grund: `Neue Version passt nicht zum laufenden Stand (Konflikt${dateien ? ` in ${dateien}` : ''})`, ...basis, sperren: true });
    }
    const tree = baum.out.split('\n')[0];
    const prs = prZeilen(git(repo, ['log', '--merges', '--first-parent', '--format=%s%x09%b', 'HEAD..origin/main']).out).slice(0, 15);
    const geaendert = git(repo, ['diff', '--name-only', head, tree]).out.split('\n').filter(Boolean);
    const lockGeaendert = geaendert.includes('package-lock.json');
    const stempel = jetzt().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
    const nachricht = [`merge: main nachgezogen (automatisch, ${stempel})`, '', ...prs].join('\n');
    const commit = git(repo, ['commit-tree', tree, '-p', head, '-p', main, '-m', nachricht]).out;

    // Derselbe Baum wurde schon gruen getestet (wartete nur auf Ruhe): nicht noch einmal.
    const schonGetestet = alt.getestet?.ok && alt.getestet.baum === tree && alt.getestet.head === kurz(head);
    if (!schonGetestet || probe) {
      const suiten = probeTests(geaendert);
      log(`${rueckstand} neue Commit(s) auf main, teste ${suiten.join(', ')} in einer Probekopie`);
      const r = probeKopie(repo, commit, { lockGeaendert, suiten, log });
      if (!r.ok) {
        log(`Probe rot (${r.suite}):\n${r.ende}`);
        return ende({ stand: 'haengt', art: 'probe', grund: `Prüfung der neuen Version fehlgeschlagen (${r.suite})`, ...basis, getestet: null, sperren: true });
      }
    }
    const getestet = { baum: tree, head: kurz(head), ok: true, am: jetzt().toISOString() };
    if (probe) return { stand: 'probe-gruen', ...basis, prs, geaendert: geaendert.length };

    const bis = Date.now() + warteMs;
    let r = ruhe();
    while (!r.ruhig && Date.now() < bis) { await warte(pollMs); r = ruhe(); }
    if (!r.ruhig) return ende({ stand: 'wartet', grund: `wartet auf eine ruhige Minute: ${r.grund}`, ...basis, getestet });
    if (git(repo, ['rev-parse', 'HEAD']).out !== head) return ende({ stand: 'wartet', grund: 'Arbeitskopie hat sich während des Wartens geändert', ...basis, getestet: null });

    const neuStarten = neustartNoetig(geaendert).filter(n => dienste[n] && steuerung.geladen(dienste[n].label));
    const starte = async () => {
      for (const n of neuStarten) {
        const vorherPid = steuerung.pid?.(dienste[n].label) ?? null;
        steuerung.neustart(dienste[n].label);
        if (!(await steuerung.gesund(dienste[n], { vorherPid }))) return n;
      }
      return null;
    };
    git(repo, ['merge', '--ff-only', '--quiet', commit]);
    log(`übernommen ${kurz(head)} → ${kurz(commit)}${prs.length ? ` (${prs.join('; ')})` : ''}`);
    // Ab hier ist HEAD vorgespult: jeder Fehler fuehrt ueber den Rueckweg, nie zu einem
    // Checkout mit neuem Code und Diensten auf altem Stand.
    let fehler = null;
    try {
      if (lockGeaendert && !npm(repo, ['ci', '--no-audit', '--no-fund']).ok) fehler = 'npm ci';
      if (!fehler) fehler = await starte();
    } catch (e) { fehler = `Neustart (${e.message.slice(0, 80)})`; }
    if (fehler) {
      log(`${fehler} antwortet nach dem Update nicht – zurück auf ${kurz(head)}`);
      let wieder;
      try {
        git(repo, ['reset', '--keep', head]);
        if (lockGeaendert) npm(repo, ['ci', '--no-audit', '--no-fund']);
        wieder = await starte();
      } catch (e) { wieder = `Rückweg (${e.message.slice(0, 80)})`; }
      const name = n => NAMEN[n] || n;
      const grund = wieder
        ? `Nach dem Update startete ${name(fehler)} nicht, und der bisherige Stand antwortet auch nicht (${name(wieder)})`
        : `Nach dem Update startete ${name(fehler)} nicht – der bisherige Stand läuft wieder`;
      return ende({ stand: 'haengt', art: wieder ? 'ausfall' : 'neustart', grund, ...basis, getestet: null, sperren: true });
    }
    return ende({ stand: 'aktuell', nachgezogen: true, von: kurz(head), nach: kurz(commit), prs, betrieb: kurz(commit), main: kurz(main), rueckstand: 0, getestet: null, neugestartet: neuStarten });
  } catch (e) {
    log(`Fehler: ${e.message}`);
    return ende({ stand: 'haengt', grund: `Unerwarteter Fehler: ${e.message.slice(0, 160)}` });
  } finally {
    fs.rmSync(sperre, { force: true });
  }
}

function statusText(z) {
  const zeit = iso => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–');
  return [
    `Stand: ${z.stand || 'nie gelaufen'}${z.grund ? ` – ${z.grund}` : ''}`,
    `Zuletzt geprüft: ${zeit(z.zuletztGeprueft)} · zuletzt übernommen: ${zeit(z.zuletztNachgezogen)}`,
    `Betrieb ${z.betrieb || '–'} · main ${z.main || '–'} · Rückstand ${z.rueckstand ?? '–'}`,
    ...(z.verlauf || []).slice(-5).map(v => `  ${zeit(v.wann)}  ${v.was}`),
  ].join('\n');
}

async function cli(argv) {
  const unbekannt = argv.filter(a => !['--probe', '--status'].includes(a));
  if (unbekannt.length) { console.error(`Unbekanntes Argument: ${unbekannt.join(' ')}`); return 2; }
  const privatDir = process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
  if (argv.includes('--status')) { console.log(statusText(zustandLesen(privatDir))); return 0; }
  const stempel = () => new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const log = text => console.log(`${stempel()}  ${text}`);
  // TP_NACHZIEHEN_ZWEIG nur fuer Tests: ein Zweig, den es nicht gibt, macht jeden Lauf harmlos.
  const r = await nachziehen({ probe: argv.includes('--probe'), log, zweig: process.env.TP_NACHZIEHEN_ZWEIG || 'dashboard-betrieb' });
  if (r.stand === 'laeuft-schon') { log('Ein anderer Lauf ist noch aktiv.'); return 0; }
  // Im Dienst (die Vorlage setzt TP_NACHZIEHEN_DIENST) bleiben Leerlaeufe und Wiederholungen
  // still, sonst waechst das Protokoll alle fuenf Minuten. Von Hand gibt es immer eine Antwort.
  const dienst = process.env.TP_NACHZIEHEN_DIENST === '1';
  if (dienst && r.stand === 'aktuell' && !r.nachgezogen) return 0;
  if (dienst && (r.still || (r.wiederholt && ['haengt', 'wartet'].includes(r.stand)))) return r.stand === 'haengt' ? 1 : 0;
  log(r.stand === 'aktuell' ? (r.nachgezogen ? `fertig, neu gestartet: ${r.neugestartet.join(', ') || 'nichts'}` : 'aktuell, nichts zu tun')
    : r.stand === 'probe-gruen' ? `Probe grün: ${r.rueckstand} Commit(s), ${r.geaendert} Datei(en) – nichts übernommen (--probe)`
      : `${r.stand}: ${r.grund}`);
  return r.stand === 'haengt' ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}

