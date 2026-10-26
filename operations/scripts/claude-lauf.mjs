#!/usr/bin/env node
/**
 * Routinelaeufe mit Claude als Mac-Dienst (launchd) statt als geplante Aufgabe der Claude-App.
 *
 *   node operations/scripts/claude-lauf.mjs fehlermeldungen             # Vorpruefung; Claude nur bei echter Arbeit
 *   node operations/scripts/claude-lauf.mjs fehlermeldungen --erzwingen # Claude auch ohne Arbeit/ausserhalb der Zeit
 *   node operations/scripts/claude-lauf.mjs postfach                    # Lieferbelege, danach Service-Anfragen
 *   node operations/scripts/claude-lauf.mjs <lauf> --trocken            # Befehl, Werkzeuglisten, Prompt-Kopf; startet nichts
 *
 * Ablauf: Zeitfenster Mo-Sa 7-19 Uhr (Europe/Berlin) -> Sperre gegen Doppelstart ->
 * (fehlermeldungen) `npm run -s fehler -- abgleich` ohne KI -> je Teil `claude -p` mit Sonnet,
 * fester Werkzeugliste und Zeitlimit -> Status nach $TP_PRIVAT_DIR/routinen/, bei neuem Fehler
 * eine Mitteilung auf dem Mac und ein To-do im Control Center (Heute).
 *
 * Den Auftragstext liest der Lauf zur Laufzeit aus ~/.claude/scheduled-tasks/<aufgabe>/SKILL.md
 * (privat: enthaelt u. a. die Werkbank-Adresse) und stellt nur einen kurzen Kopf voran
 * (operations/lib/routinen.mjs, promptKopf). Mails und Meldungstexte sind fremde Daten - deshalb
 * die enge Freigabeliste, `--permission-mode dontAsk` und keine Rueckfragen.
 *
 * Doku: operations/README.md, Abschnitt "Routinen als Mac-Dienst".
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LAEUFE, privatDir, dienstDir, aufgabenDir, routinenDir, arbeitsOrdner, imFenster, berlinZeit,
  auftragOhneKopf, promptKopf, claudeArgumente, bewerteLauf, vorpruefung, liesStatus, schreibStatus,
  nimmSperre, sperrPfad, neuerSammler, sammle, abschliessen,
} from '../lib/routinen.mjs';

const PROTOKOLL_TAGE = 14;

export function argumente(argv) {
  const a = { lauf: null, trocken: false, erzwingen: false };
  for (const x of argv) {
    if (x === '--trocken') a.trocken = true;
    else if (x === '--erzwingen') a.erzwingen = true;
    else if (!x.startsWith('-') && !a.lauf) a.lauf = x;
    else throw new Error(`Unbekanntes Argument: ${x}`);
  }
  if (!LAEUFE[a.lauf]) throw new Error(`Lauf fehlt oder unbekannt (erlaubt: ${Object.keys(LAEUFE).join(', ')})`);
  return a;
}

function claudeBin(env) {
  if (env.TP_CLAUDE_BIN) return env.TP_CLAUDE_BIN;
  const lokal = path.join(os.homedir(), '.local', 'bin', 'claude');
  return fs.existsSync(lokal) ? lokal : 'claude';
}

/** macOS-Mitteilung; der Text geht als Argument, nie in den AppleScript-Quelltext. */
export function mitteilung(titel, text, { ausfuehren = execFileSync } = {}) {
  try {
    ausfuehren('osascript', [
      '-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title "Teppich Paradies – Mac-Dienst" subtitle (item 1 of argv)', '-e', 'end run',
      String(titel).slice(0, 80), String(text).slice(0, 220),
    ], { stdio: 'ignore', timeout: 10_000 });
  } catch { /* ohne Mitteilung bleibt das To-do im Control Center */ }
}

function stempel(jetzt) {
  return jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Arbeitsordner leeren (Zwischendateien enthalten Mail- und Kundendaten). */
export function leereOrdner(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const e of fs.readdirSync(dir)) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}

/** Protokolle aelter als 14 Tage weg - sie enthalten Abschlusszeilen, keine Mail-Inhalte, bleiben aber privat. */
export function alteProtokolleWeg(dir, jetzt = new Date(), tage = PROTOKOLL_TAGE) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    if (jetzt.getTime() - fs.statSync(p).mtimeMs > tage * 86_400_000) fs.rmSync(p, { force: true });
  }
}

/**
 * `claude -p` mit Zeitlimit. Die stream-json-Ausgabe wird beim Lesen ausgewertet und nicht
 * aufbewahrt (sie enthaelt Mail-Inhalte): uebrig bleiben das result-Ereignis und die Aufrufliste.
 */
export function starteClaude(bin, args, { cwd, env, zeitlimitMs }) {
  return new Promise((resolve) => {
    const kind = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const s = neuerSammler();
    let stderr = '';
    let zeitlimit = false;
    kind.stdout.setEncoding('utf8');
    kind.stdout.on('data', d => sammle(s, d));
    kind.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    const uhr = setTimeout(() => {
      zeitlimit = true;
      kind.kill('SIGTERM');
      setTimeout(() => kind.kill('SIGKILL'), 10_000).unref();
    }, zeitlimitMs);
    const fertig = (exitCode, signal, fehlerText) => {
      clearTimeout(uhr);
      abschliessen(s);
      resolve({ exitCode, signal, ergebnis: s.ergebnis, aufrufe: s.aufrufe, stderr: fehlerText ?? stderr, zeitlimit });
    };
    kind.on('error', e => fertig(127, null, String(e.message)));
    kind.on('close', (exitCode, signal) => fertig(exitCode, signal));
  });
}

/** `npm run -s fehler -- abgleich` ohne KI - dasselbe Skript, das Claude in Schritt 1 aufruft. */
export function fehlerAbgleich(dienst, { ausfuehren = execFileSync } = {}) {
  const aus = ausfuehren(process.execPath, [path.join(dienst, 'operations', 'scripts', 'fehlermeldungen.mjs'), 'abgleich'], {
    cwd: dienst, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(aus);
}

function auftragLesen(aufgaben, name) {
  const datei = path.join(aufgaben, name, 'SKILL.md');
  if (!fs.existsSync(datei)) throw new Error(`Auftragstext fehlt: ${datei}`);
  const text = auftragOhneKopf(fs.readFileSync(datei, 'utf8'));
  if (text.length < 100) throw new Error(`Auftragstext zu kurz: ${datei}`);
  return { datei, text };
}

/** Fuer --trocken: der Befehl ohne den (privaten) Auftragstext. */
export function befehlAnzeige(bin, args) {
  const q = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
  return [bin, ...args.slice(0, -1).map(q), '<PROMPT>'].join(' ');
}

/**
 * Ein Teil = ein `claude -p`-Aufruf. Fehler bleiben im Teil: der Aufrufer macht mit dem
 * naechsten Teil weiter.
 */
export async function teilAusfuehren(lauf, teil, o) {
  const { privat, dienst, aufgaben, env, jetzt = new Date(), trocken = false, aus = console.log, starte = starteClaude, melde = mitteilung } = o;
  const def = LAEUFE[lauf];
  const arbeit = arbeitsOrdner(privat, lauf);
  const { datei, text } = auftragLesen(aufgaben, teil.aufgabe);
  const kopf = promptKopf(lauf, teil, { dienst, arbeit });
  const prompt = `${kopf}\n${text}\n`;
  const args = claudeArgumente(lauf, {
    dienst, arbeit, privat, prompt, modell: env.TP_ROUTINE_MODELL || 'sonnet', effort: env.TP_ROUTINE_EFFORT || 'medium',
  });
  const bin = claudeBin(env);
  if (trocken) {
    const i = n => args.indexOf(n);
    const liste = (von) => { const r = []; for (let k = i(von) + 1; k < args.length && !args[k].startsWith('--'); k += 1) r.push(args[k]); return r; };
    aus(`\n== ${teil.titel} (${teil.id}) – trocken, startet nichts`);
    aus(`Auftrag:   ${datei} (${text.length} Zeichen, YAML-Kopf abgeschnitten)`);
    aus(`Ordner:    cwd ${dienst} · Arbeitsordner ${arbeit} · Zeitlimit ${def.zeitlimitMin} Min.`);
    aus(`Befehl:    ${befehlAnzeige(bin, args)}`);
    aus(`Werkzeuge (--tools): ${def.werkzeuge.join(', ')}`);
    aus(`Freigaben (--allowedTools):\n  ${liste('--allowedTools').join('\n  ')}`);
    aus(`Sperren (--disallowedTools):\n  ${liste('--disallowedTools').join('\n  ')}`);
    aus(`Prompt-Kopf:\n${kopf}\n[… danach der Auftragstext aus ${path.basename(path.dirname(datei))}/SKILL.md]`);
    return { ok: true, trocken: true };
  }
  leereOrdner(arbeit);
  const start = new Date();
  const r = await starte(bin, args, { cwd: dienst, env: { ...env, TP_ROUTINE: `${lauf}/${teil.id}` }, zeitlimitMs: def.zeitlimitMin * 60_000 });
  leereOrdner(arbeit);
  const bewertung = bewerteLauf(r);
  const protokolle = path.join(routinenDir(privat), lauf, 'laeufe');
  fs.mkdirSync(protokolle, { recursive: true, mode: 0o700 });
  alteProtokolleWeg(protokolle, jetzt);
  fs.writeFileSync(path.join(protokolle, `${stempel(start)}-${teil.id}.json`), `${JSON.stringify({
    teil: teil.id, start: start.toISOString(), ende: new Date().toISOString(), exitCode: r.exitCode, signal: r.signal,
    zeitlimit: r.zeitlimit, bewertung, stderr: String(r.stderr || '').slice(-2000),
  }, null, 2)}\n`, { mode: 0o600 });
  aus(`${new Date().toISOString()} ${teil.id}: ${bewertung.ok ? 'ok' : `FEHLER (${bewertung.art})`} · ${bewertung.meldung}${bewertung.tokens ? ` · ${bewertung.tokens} Tokens, ${bewertung.runden} Runden` : ''}`);
  return { ...bewertung, start: start.toISOString() };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const melde = deps.melde || mitteilung;
  let a;
  try { a = argumente(argv); } catch (e) { (deps.fehler || console.error)(e.message); return 2; }
  const def = LAEUFE[a.lauf];
  const privat = privatDir(env);
  const dienst = dienstDir(env);
  const aufgaben = aufgabenDir(env);
  const o = { privat, dienst, aufgaben, env, jetzt, trocken: a.trocken, aus, starte: deps.starte, melde };
  const z = berlinZeit(jetzt);

  if (!a.erzwingen && !a.trocken && !imFenster(jetzt, def.fenster)) {
    aus(`${jetzt.toISOString()} ${a.lauf}: ausserhalb der Zeit (${z.datum} ${String(z.stunde).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}, Mo–Sa ${def.fenster.von}–${def.fenster.bis} Uhr) – nichts zu tun.`);
    return 0;
  }
  if (a.trocken) aus(`Zeitfenster: ${imFenster(jetzt, def.fenster) ? 'innerhalb' : 'ausserhalb'} (Mo–Sa ${def.fenster.von}–${def.fenster.bis} Uhr, jetzt ${z.datum} ${z.stunde}:${String(z.minute).padStart(2, '0')})`);

  const sperre = a.trocken ? { freigeben() {} } : nimmSperre(sperrPfad(privat, a.lauf), { jetzt });
  if (!sperre) { aus(`${jetzt.toISOString()} ${a.lauf}: läuft schon (Sperre ${sperrPfad(privat, a.lauf)}) – übersprungen.`); return 0; }
  try {
    if (a.lauf === 'fehlermeldungen') return await fehlermeldungenLauf(a, o, deps);
    let alleOk = true;
    for (const teil of def.teile) {
      let r;
      try { r = await teilAusfuehren(a.lauf, teil, o); } catch (e) { r = { ok: false, art: 'start', meldung: e.message }; aus(`${teil.id}: FEHLER ${e.message}`); }
      if (a.trocken) continue;
      const { mitteilen } = schreibStatus(privat, teil.id, {
        ok: r.ok, art: r.art, meldung: r.meldung, letzterClaudeLauf: r.start || jetzt.toISOString(), tokens: r.tokens ?? null,
      }, new Date());
      if (mitteilen) melde(teil.titel, r.meldung);
      alleOk &&= r.ok;
    }
    return alleOk ? 0 : 1;
  } finally {
    sperre.freigeben();
  }
}

async function fehlermeldungenLauf(a, o, deps) {
  const { privat, dienst, aus, melde, jetzt } = o;
  const teil = LAEUFE.fehlermeldungen.teile[0];
  const abgleichen = deps.abgleich || (() => fehlerAbgleich(dienst));
  let vorher;
  try { vorher = abgleichen(); } catch (e) {
    const meldung = `Vorprüfung fehlgeschlagen (npm run -s fehler -- abgleich): ${String(e.stderr || e.message).trim().split('\n').at(-1).slice(0, 200)}`;
    aus(`${jetzt.toISOString()} fehlermeldungen: ${meldung}`);
    if (!a.trocken) {
      const { mitteilen } = schreibStatus(privat, teil.id, { ok: false, art: 'vorpruefung', meldung }, jetzt);
      if (mitteilen) melde(teil.titel, meldung);
    }
    return 1;
  }
  let status = {};
  try { status = liesStatus(privat, teil.id); } catch { status = {}; }
  const ent = a.erzwingen ? { starten: true, grund: 'erzwungen' } : vorpruefung(vorher, status, jetzt);
  aus(`${jetzt.toISOString()} fehlermeldungen: Vorprüfung neu ${vorher.neu?.length || 0} · laufend ${vorher.laufend?.length || 0} · kürzlich erledigt ${vorher.kuerzlichErledigt?.length || 0} → ${ent.starten ? `Claude startet (${ent.grund})` : `Claude startet nicht (${ent.grund})`}`);
  if (a.trocken) { await teilAusfuehren('fehlermeldungen', teil, o); return 0; }
  if (!ent.starten) {
    // Liegt nichts mehr an, ist ein frueherer Fehlschlag erledigt; sonst bleibt er sichtbar.
    const leer = ent.grund === 'nichts zu tun';
    schreibStatus(privat, teil.id, leer ? { ok: true, art: null, meldung: 'nichts zu tun', vorpruefung: ent.grund } : { vorpruefung: ent.grund }, jetzt);
    return 0;
  }
  let r;
  try { r = await teilAusfuehren('fehlermeldungen', teil, o); } catch (e) { r = { ok: false, art: 'start', meldung: e.message, start: jetzt.toISOString() }; }
  // Gegenprobe ohne KI: was vorher neu war, muss jetzt uebernommen sein.
  if (r.ok && vorher.neu?.length) {
    try {
      const nachher = abgleichen();
      const offen = vorher.neu.map(m => m.id).filter(id => nachher.neu?.some(m => m.id === id));
      if (offen.length) r = { ...r, ok: false, art: 'nicht-uebernommen', meldung: `Nach dem Lauf noch neu: ${offen.join(', ')} · ${r.meldung}` };
    } catch { /* die naechste Vorpruefung sieht es */ }
  }
  const { mitteilen } = schreibStatus(privat, teil.id, {
    ok: r.ok, art: r.art, meldung: r.meldung, vorpruefung: ent.grund,
    letzterClaudeLauf: r.start || jetzt.toISOString(), letzterClaudeOk: r.ok, tokens: r.tokens ?? null,
  }, new Date());
  if (mitteilen) melde(teil.titel, r.meldung);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
}
