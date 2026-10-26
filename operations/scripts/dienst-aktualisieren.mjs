#!/usr/bin/env node
/**
 * Dienst-Checkout des Control Centers taeglich auf main ziehen - ohne Claude.
 * Ersetzt die geplante Aufgabe "shop-zahlen-export" (Inhaber 2026-10-26): deren Schritt 0
 * steht hier als Skript, die Daten holt laengst der Sync-Dienst (net.teppich-paradies.sync).
 *
 *   node operations/scripts/dienst-aktualisieren.mjs                  # Takt (stuendlich per launchd)
 *   node operations/scripts/dienst-aktualisieren.mjs --trocken        # fetch + Konfliktpruefung, zeigt die Schritte, aendert nichts
 *   node operations/scripts/dienst-aktualisieren.mjs --jetzt          # Abgleich sofort (sonst einmal taeglich ab 6 Uhr)
 *   node operations/scripts/dienst-aktualisieren.mjs --nur-gesundheit # nur den Datenstand pruefen
 *
 * Jeder Takt prueft den Datenstand (aktualisierung.json: Alter, Erfolg je Teil). Der Abgleich
 * mit main laeuft einmal am Tag (erster Takt ab 6 Uhr) und genau in der Reihenfolge aus Skill
 * control-center, Schritt 9 - mit einem Unterschied: getestet wird VOR der Uebernahme, in einer
 * Wegwerf-Kopie des Merge-Ergebnisses. So bleibt der Dienst-Checkout bei Konflikt oder rotem
 * Test unberuehrt (nichts abzubrechen, nichts zurueckzusetzen):
 *
 *   1. Zweig dashboard-betrieb? keine lokalen Aenderungen ausser package-lock.json?
 *   2. git fetch; nichts Neues -> fertig
 *   3. git merge-tree --write-tree HEAD origin/main  (Exit 1 = Konflikt: melden, nichts tun)
 *   4. git commit-tree: der Merge-Commit, noch auf keinem Zweig
 *   5. Pruefkopie (git clone --shared, Merge-Commit ausgecheckt) -> npm ci -> npm run dashboard:test,
 *      operations:test (+ social:test)
 *      rot -> melden, nichts tun
 *   6. git merge --ff-only <Merge-Commit>  (= genau der gepruefte Stand; --autostash nur bei
 *      npm-Rauschen in package-lock.json), npm ci falls die Lockdatei sich aendert
 *   7. launchctl kickstart -k dashboard (+ sync bei operations/, + social bei social/)
 *   8. GET http://127.0.0.1:8001/login -> 200 (social: /api/status -> 401)
 *      sonst: git reset --keep auf den alten Stand, Dienste neu starten, melden
 *
 * Kein automatischer Claude-Reparaturlauf. Fehler -> Status unter
 * $TP_PRIVAT_DIR/routinen/dienst-aktualisieren/, Mitteilung auf dem Mac (nur bei neuem Fehler)
 * und ein rotes To-do im Control Center (Heute).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  privatDir, dienstDir, berlinZeit, liesStatus, schreibStatus, pruefeGesundheit,
  nimmSperre, sperrPfad, sperreBesetzt, LAEUFE,
} from '../lib/routinen.mjs';
import { mitteilung } from './claude-lauf.mjs';

export const ZWEIG = 'dashboard-betrieb';
export const ZIEL = 'origin/main';
export const AB_STUNDE = 6;
export const DIENSTE = Object.freeze({
  dashboard: { label: 'net.teppich-paradies.dashboard', url: 'http://127.0.0.1:8001/login', erwartet: 200 },
  sync: { label: 'net.teppich-paradies.sync' },
  social: { label: 'net.teppich-paradies.social', url: 'http://127.0.0.1:8020/api/status', erwartet: 401 },
});

/** Befehl ausfuehren; nie eine Shell, Argumente als Liste. */
export function befehl(cmd, args, { cwd, env, timeout = 600_000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status, stdout: r.stdout || '', stderr: r.stderr || (r.error ? String(r.error.message) : '') };
}

const kurz = sha => String(sha || '').slice(0, 8);
const letzteZeilen = (t, n = 3) => String(t || '').trim().split('\n').filter(Boolean).slice(-n).join(' | ').slice(0, 300);

/**
 * Laeuft gerade eine Codex-Automation in diesem Checkout? (Skill control-center, Schritt 9:
 * "Neue Muster automatisch bestellen" arbeitet alle 15 Minuten in ~/tp-dashboard.) Erkannt an
 * der Aenderungszeit ihres Threads unter ~/.codex/sessions: juenger als `ruheSek` = laeuft.
 */
export function codexAktiv(dienst, { codexDir = path.join(os.homedir(), '.codex'), jetzt = new Date(), ruheSek = 120 } = {}) {
  const auto = path.join(codexDir, 'automations');
  if (!fs.existsSync(auto)) return null;
  const threads = [];
  for (const name of fs.readdirSync(auto)) {
    const datei = path.join(auto, name, 'automation.toml');
    if (!fs.existsSync(datei)) continue;
    const t = fs.readFileSync(datei, 'utf8');
    const id = /^target_thread_id\s*=\s*"([^"]+)"/m.exec(t)?.[1];
    if (id && /^status\s*=\s*"ACTIVE"/m.test(t) && t.includes(dienst)) threads.push({ name, id });
  }
  if (!threads.length) return null;
  const sessions = path.join(codexDir, 'sessions');
  const stack = fs.existsSync(sessions) ? [[sessions, 0]] : [];
  while (stack.length) {
    const [dir, tiefe] = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && tiefe < 4) stack.push([p, tiefe + 1]);
      else if (e.isFile()) {
        const th = threads.find(x => e.name.endsWith(`${x.id}.jsonl`));
        if (th && (jetzt.getTime() - fs.statSync(p).mtimeMs) / 1000 < ruheSek) return th.name;
      }
    }
  }
  return null;
}

/** Pollt eine Adresse, bis der erwartete Status kommt (der Dashboard-Dienst baut nach dem Start erst issues.json). */
export async function warteAufStatus(url, erwartet, { sekunden = 90, abruf = fetch, schlafe = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const ende = Date.now() + sekunden * 1000;
  let zuletzt = null;
  do {
    try {
      const r = await abruf(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      zuletzt = r.status;
      if (r.status === erwartet) return { ok: true, status: r.status };
    } catch (e) { zuletzt = e.code || e.name; }
    await schlafe(2000);
  } while (Date.now() < ende);
  return { ok: false, status: zuletzt };
}

/**
 * Der Abgleich selbst. `deps` macht ihn testbar (Git-Repos im Temp-Ordner, launchctl und HTTP
 * als Attrappen). Gibt immer ein Ergebnis zurueck: { ok, art, meldung, ... } - art null bei ok.
 * `spaeter: true` heisst: kein Fehler, im naechsten Takt erneut versuchen.
 */
export async function abgleichen(o) {
  const {
    dienst, trocken = false, aus = console.log, run = befehl, launchctl = defaultLaunchctl, warte = warteAufStatus,
    jetzt = new Date(), tmpBasis = os.tmpdir(), uid = process.getuid?.() ?? 0, env = process.env, bekannterFehler = null,
  } = o;
  const git = (...args) => run('git', args, { cwd: dienst, env });
  const npm = (cwd, ...args) => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, env });
  const fehler = (art, meldung, extra = {}) => ({ ok: false, art, meldung, ...extra });
  const schritt = t => aus(`  · ${t}`);

  const zweig = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (zweig.status !== 0) return fehler('kein-checkout', `Kein Git-Checkout unter ${dienst}: ${letzteZeilen(zweig.stderr)}`);
  if (zweig.stdout.trim() !== ZWEIG) return fehler('falscher-zweig', `Dienst-Checkout steht auf „${zweig.stdout.trim()}“ statt ${ZWEIG} – nicht umgeschaltet, bitte von Hand klären.`);

  const fetch = git('fetch', '--quiet', 'origin');
  if (fetch.status !== 0) return fehler('fetch', `git fetch fehlgeschlagen: ${letzteZeilen(fetch.stderr)}`, { spaeter: true });
  const alt = git('rev-parse', 'HEAD').stdout.trim();
  const ziel = git('rev-parse', ZIEL).stdout.trim();
  const anzahl = Number(git('rev-list', '--count', `${alt}..${ziel}`).stdout.trim());
  if (!alt || !ziel || !Number.isInteger(anzahl)) return fehler('ziel-fehlt', `${ZIEL} oder HEAD nicht lesbar – nichts übernommen.`);
  schritt(`HEAD ${kurz(alt)}, ${ZIEL} ${kurz(ziel)}: ${anzahl} neue Commit(s)`);
  if (!anzahl) return { ok: true, art: null, ergebnis: 'aktuell', meldung: `aktuell (${kurz(alt)})`, ziel };
  // Derselbe Stand von main war schon Konflikt/rot: nicht stuendlich neu testen - erst ein neuer Commit.
  if (!trocken && bekannterFehler && bekannterFehler.ziel === ziel && WIEDERHOLT_SICH.includes(bekannterFehler.art)) {
    schritt(`unverändert: main ${kurz(ziel)} war schon „${bekannterFehler.art}“ – nicht erneut versucht`);
    return { ...bekannterFehler, ok: false, unveraendert: true };
  }

  const geaendert = git('diff', '--name-only', alt, ziel).stdout.split('\n').filter(Boolean);
  const lokal = git('status', '--porcelain', '--untracked-files=no').stdout.split('\n').filter(Boolean).map(z => z.slice(3).trim());
  const lockLokal = lokal.includes('package-lock.json');
  const andere = lokal.filter(f => f !== 'package-lock.json');
  if (andere.length) {
    return fehler('lokale-aenderungen', `Im Dienst-Checkout sind Dateien geändert (${andere.slice(0, 4).join(', ')}${andere.length > 4 ? ' …' : ''}) – nichts verworfen, nicht gemergt; bitte von Hand klären (Skill control-center, Schritt 9).`, { ziel });
  }
  const lockNeu = geaendert.includes('package-lock.json');
  if (lockLokal && lockNeu) {
    return fehler('lokale-aenderungen', 'package-lock.json ist lokal geändert und main ändert sie ebenfalls – nicht gemergt; bitte von Hand nachziehen (Skill control-center, Schritt 9).', { ziel });
  }

  const mt = git('merge-tree', '--write-tree', '--name-only', alt, ziel);
  if (mt.status === 1) {
    const dateien = mt.stdout.split('\n').slice(1).filter(z => z && !/^Auto-merging|^CONFLICT/.test(z));
    return fehler('konflikt', `Konflikt mit main in ${dateien.slice(0, 4).join(', ') || 'unbekannten Dateien'} – nicht gemergt, der Dienst läuft unverändert weiter.`, { ziel });
  }
  if (mt.status !== 0) return fehler('merge-tree', `git merge-tree fehlgeschlagen: ${letzteZeilen(mt.stderr)}`, { ziel });
  const baum = mt.stdout.split('\n')[0].trim();
  schritt(`merge-tree: konfliktfrei (Baum ${kurz(baum)}), ${geaendert.length} Datei(en) geändert`);

  // sync und social nur, wenn sie auf diesem Mac geladen sind; der Dashboard-Dienst muss es sein.
  const geladen = d => launchctl(['print', `gui/${uid}/${DIENSTE[d].label}`]).status === 0;
  if (!geladen('dashboard')) return fehler('dienst-fehlt', `${DIENSTE.dashboard.label} ist nicht geladen – nichts übernommen.`, { ziel });
  const neuStarten = ['dashboard',
    ...(geaendert.some(f => f.startsWith('operations/')) && geladen('sync') ? ['sync'] : []),
    ...(geaendert.some(f => f.startsWith('social/')) && geladen('social') ? ['social'] : [])];
  const suiten = ['dashboard:test', 'operations:test', ...(geaendert.some(f => f.startsWith('social/')) ? ['social:test'] : [])];
  if (trocken) {
    schritt(`würde: git commit-tree ${kurz(baum)} -p ${kurz(alt)} -p ${kurz(ziel)}`);
    schritt(`würde: Prüfkopie (git clone --shared) → npm ci → ${suiten.map(s => `npm run -s ${s}`).join(' → ')}`);
    schritt(`würde: git merge --ff-only${lockLokal ? ' --autostash' : ''} <Merge-Commit>${lockLokal ? ' → npm install --package-lock-only' : ''}${lockNeu ? ' → npm ci' : ''}`);
    schritt(`würde neu starten: ${neuStarten.map(d => `launchctl kickstart -k gui/${uid}/${DIENSTE[d].label}`).join(' ; ')}`);
    schritt(`würde prüfen: ${neuStarten.filter(d => DIENSTE[d].url).map(d => `${DIENSTE[d].url} → ${DIENSTE[d].erwartet}`).join(' ; ')}`);
    return { ok: true, art: null, ergebnis: 'trocken', meldung: `trocken: ${anzahl} Commit(s) konfliktfrei übernehmbar`, ziel };
  }

  const datum = berlinZeit(jetzt).datum;
  const ct = git('commit-tree', baum, '-p', alt, '-p', ziel, '-m', `merge: main nachgezogen (${datum}, Dienst-Aktualisierung)`);
  if (ct.status !== 0) return fehler('commit-tree', `git commit-tree fehlgeschlagen: ${letzteZeilen(ct.stderr)}`, { ziel });
  const commit = ct.stdout.trim();

  // Pruefkopie: genau der Commit, der gleich live geht - ausserhalb des Dienst-Checkouts und als
  // Git-Checkout (die Servertests lesen `git rev-parse HEAD`). `clone --shared` statt `worktree add`:
  // nichts wird im gemeinsamen Repository registriert, Wegraeumen ist ein rm.
  const basis = fs.mkdtempSync(path.join(tmpBasis, 'tp-dienst-pruefkopie-'));
  const kopie = path.join(basis, 'kopie');
  try {
    const kl = run('git', ['clone', '--quiet', '--shared', '--no-checkout', dienst, kopie], { cwd: basis, env });
    const co = kl.status === 0 ? run('git', ['checkout', '--quiet', '--detach', commit], { cwd: kopie, env }) : kl;
    if (co.status !== 0) return fehler('pruefkopie', `Prüfkopie nicht angelegt: ${letzteZeilen(co.stderr)}`, { ziel });
    const ci = npm(kopie, 'ci', '--no-audit', '--no-fund');
    if (ci.status !== 0) return fehler('test-rot', `npm ci in der Prüfkopie fehlgeschlagen: ${letzteZeilen(ci.stderr)} – nicht gemergt.`, { ziel });
    for (const s of suiten) {
      const t = npm(kopie, 'run', '-s', s);
      schritt(`${s}: ${t.status === 0 ? 'grün' : 'ROT'}`);
      if (t.status !== 0) {
        const fails = (`${t.stdout}\n${t.stderr}`).split('\n').filter(z => /^not ok|✖|# fail/.test(z.trim())).slice(0, 3).map(z => z.trim()).join(' | ');
        return fehler('test-rot', `${s} rot auf dem Stand main ${kurz(ziel)} (${fails || letzteZeilen(t.stdout)}) – nicht gemergt, der Dienst läuft unverändert weiter.`, { ziel });
      }
    }
  } finally {
    fs.rmSync(basis, { recursive: true, force: true });
  }

  if (git('rev-parse', 'HEAD').stdout.trim() !== alt) {
    return fehler('bewegt', 'Der Dienst-Checkout hat sich während der Prüfung bewegt – nichts übernommen, nächster Takt versucht es erneut.', { spaeter: true, ziel });
  }
  const ff = git('merge', '--ff-only', ...(lockLokal ? ['--autostash'] : []), commit);
  if (ff.status !== 0) return fehler('merge', `git merge --ff-only fehlgeschlagen: ${letzteZeilen(ff.stderr)} – der Dienst läuft unverändert weiter.`, { ziel });
  schritt(`übernommen: ${kurz(alt)} → ${kurz(commit)}`);
  if (lockLokal) npm(dienst, 'install', '--package-lock-only', '--no-audit', '--no-fund');
  const abhaengigkeiten = () => (lockNeu ? npm(dienst, 'ci', '--no-audit', '--no-fund') : { status: 0 });
  const starte = () => neuStarten.map(d => ({ d, r: launchctl(['kickstart', '-k', `gui/${uid}/${DIENSTE[d].label}`]) }));
  const pruefe = async () => {
    const fehlt = [];
    for (const d of neuStarten) {
      if (!DIENSTE[d].url) continue;
      const w = await warte(DIENSTE[d].url, DIENSTE[d].erwartet);
      if (!w.ok) fehlt.push(`${d} ${DIENSTE[d].url} → ${w.status ?? 'keine Antwort'} statt ${DIENSTE[d].erwartet}`);
    }
    return fehlt;
  };

  const ci = abhaengigkeiten();
  const gestartet = ci.status === 0 ? starte() : [];
  const kickFehler = gestartet.filter(x => x.r.status !== 0).map(x => `${x.d}: ${letzteZeilen(x.r.stderr, 1)}`);
  const httpFehler = ci.status === 0 && !kickFehler.length ? await pruefe() : [];
  if (ci.status === 0 && !kickFehler.length && !httpFehler.length) {
    const eigen = git('diff', '--quiet', ziel, 'HEAD').status !== 0;
    schritt(`neu gestartet: ${neuStarten.join(', ')}; Antwort ok`);
    return {
      ok: true, art: null, ergebnis: 'nachgezogen', ziel, von: alt, bis: commit, anzahl, dienste: neuStarten,
      meldung: `${anzahl} Commit(s) nachgezogen (${kurz(alt)} → ${kurz(commit)}), neu gestartet: ${neuStarten.join(', ')}${eigen ? ' · Achtung: Betrieb trägt eigenen Code (git diff origin/main HEAD nicht leer)' : ''}`,
    };
  }

  // Zurueck auf den alten Stand: --keep laesst lokale Aenderungen stehen und bricht ab, statt sie zu verwerfen.
  const grund = ci.status !== 0 ? `npm ci fehlgeschlagen (${letzteZeilen(ci.stderr, 1)})` : kickFehler.length ? `Neustart fehlgeschlagen (${kickFehler.join('; ')})` : `keine Antwort nach dem Neustart (${httpFehler.join('; ')})`;
  const rs = git('reset', '--keep', alt);
  let rueck = 'Rückweg fehlgeschlagen – bitte sofort von Hand prüfen';
  if (rs.status === 0) {
    const ci2 = abhaengigkeiten();
    const k2 = starte().filter(x => x.r.status !== 0);
    const h2 = ci2.status === 0 && !k2.length ? await pruefe() : ['nicht geprüft'];
    rueck = h2.length ? `zurückgesetzt auf ${kurz(alt)}, Dienst antwortet aber weiterhin nicht – bitte sofort prüfen` : `zurückgesetzt auf ${kurz(alt)}, Dienst läuft wieder`;
  }
  return fehler('neustart', `${grund} – ${rueck}.`, { ziel });
}

function defaultLaunchctl(args) {
  return befehl('launchctl', args, { timeout: 60_000 });
}

/** Fehler, die sich bei unveraendertem main genauso wiederholen wuerden. */
export const WIEDERHOLT_SICH = Object.freeze(['konflikt', 'test-rot', 'neustart']);

/** Einmal taeglich ab 6 Uhr: heute schon erfolgreich abgeglichen? Nach einem Fehler jeden Takt erneut. */
export function abgleichFaellig(status, jetzt = new Date(), abStunde = AB_STUNDE) {
  const z = berlinZeit(jetzt);
  if (z.stunde < abStunde) return { faellig: false, grund: `vor ${abStunde} Uhr` };
  if (status?.ok && status.abgleichTag === z.datum) return { faellig: false, grund: 'heute schon abgeglichen' };
  return { faellig: true, grund: status?.ok === false ? 'letzter Versuch fehlgeschlagen' : 'heute noch nicht abgeglichen' };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const melde = deps.melde || mitteilung;
  const unbekannt = argv.filter(a => !['--trocken', '--jetzt', '--nur-gesundheit'].includes(a));
  if (unbekannt.length) { (deps.fehler || console.error)(`Unbekanntes Argument: ${unbekannt.join(' ')}`); return 2; }
  const trocken = argv.includes('--trocken');
  const privat = privatDir(env);
  const dienst = dienstDir(env);
  let code = 0;

  // 1. Datenstand (jeder Takt)
  let aktualisierung = null;
  try { aktualisierung = JSON.parse(fs.readFileSync(path.join(privat, 'aktualisierung.json'), 'utf8')); } catch { aktualisierung = null; }
  const g = pruefeGesundheit(aktualisierung, jetzt);
  aus(`${jetzt.toISOString()} Datenstand: ${g.ok ? 'ok' : `FEHLER (${g.art})`} – ${g.meldung}`);
  if (!trocken) {
    const { mitteilen } = schreibStatus(privat, 'daten-gesundheit', { ok: g.ok, art: g.art, meldung: g.meldung, ...(g.ok ? { letzterErfolg: jetzt.toISOString() } : {}) }, jetzt);
    if (mitteilen) melde('Datenstand des Sync-Dienstes', g.meldung);
  }
  if (!g.ok) code = 1;
  if (argv.includes('--nur-gesundheit')) return code;

  // 2. Abgleich mit main (einmal taeglich)
  let status = {};
  try { status = liesStatus(privat, 'dienst-aktualisieren'); } catch { status = {}; }
  if (!trocken && !argv.includes('--jetzt')) {
    const f = abgleichFaellig(status, jetzt);
    if (!f.faellig) { aus(`${jetzt.toISOString()} Abgleich: nicht fällig (${f.grund}).`); schreibStatus(privat, 'dienst-aktualisieren', {}, jetzt); return code; }
  }
  const belegt = Object.keys(LAEUFE).find(l => sperreBesetzt(sperrPfad(privat, l)));
  const codex = (deps.codexAktiv || codexAktiv)(dienst, { jetzt });
  if (!trocken && (belegt || codex)) {
    aus(`${jetzt.toISOString()} Abgleich: später – ${belegt ? `Routine „${belegt}“ läuft` : `Codex-Automation „${codex}“ arbeitet gerade im Dienst-Checkout`}.`);
    schreibStatus(privat, 'dienst-aktualisieren', {}, jetzt);
    return code;
  }
  const sperre = trocken ? { freigeben() {} } : nimmSperre(sperrPfad(privat, 'dienst-aktualisieren'), { jetzt });
  if (!sperre) { aus('Abgleich läuft schon – übersprungen.'); return code; }
  try {
    aus(`${jetzt.toISOString()} Abgleich ${dienst} mit ${ZIEL}${trocken ? ' (trocken)' : ''}:`);
    const bekannterFehler = status.ok === false && status.ziel ? { art: status.art, meldung: status.meldung, ziel: status.ziel } : null;
    let r;
    try {
      r = await abgleichen({ dienst, trocken, aus, env, jetzt, bekannterFehler, ...deps.abgleich });
    } catch (e) { r = { ok: false, art: 'ausnahme', meldung: `Abbruch: ${e.message}` }; }
    aus(`${new Date().toISOString()} Abgleich: ${r.ok ? 'ok' : `FEHLER (${r.art})`} – ${r.meldung}`);
    if (!trocken) {
      if (r.spaeter) {
        schreibStatus(privat, 'dienst-aktualisieren', { hinweis: r.meldung }, jetzt);
      } else {
        const { mitteilen } = schreibStatus(privat, 'dienst-aktualisieren', {
          ok: r.ok, art: r.art, meldung: r.meldung, ziel: r.ziel || null, hinweis: null,
          ...(r.ok ? { abgleichTag: berlinZeit(jetzt).datum, ergebnis: r.ergebnis, letzterErfolg: new Date().toISOString() } : {}),
        }, new Date());
        if (mitteilen) melde('Control Center nachziehen', r.meldung);
      }
    }
    if (!r.ok && !r.spaeter) code = 1;
    return code;
  } finally {
    sperre.freigeben();
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 1; });
}
