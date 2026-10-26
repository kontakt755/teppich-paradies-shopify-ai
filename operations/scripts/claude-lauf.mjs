#!/usr/bin/env node
/**
 * Routinelaeufe mit Claude als Mac-Dienst (launchd) statt als geplante Aufgabe der Claude-App.
 *
 *   node operations/scripts/claude-lauf.mjs fehlermeldungen               # Vorpruefung; Claude nur bei echter Arbeit
 *   node operations/scripts/claude-lauf.mjs fehlermeldungen --erzwingen   # Claude auch ohne Arbeit/ausserhalb der Zeit
 *   node operations/scripts/claude-lauf.mjs postfach                      # Lieferbelege, danach Service-Anfragen
 *   node operations/scripts/claude-lauf.mjs <lauf> --trocken              # Befehl, Werkzeuglisten, Prompt-Kopf; startet nichts
 *   node operations/scripts/claude-lauf.mjs <lauf> --werkzeugprobe        # startet claude -p nur bis zum init-Ereignis
 *
 * Ablauf: Zeitfenster Mo-Sa 7-19 Uhr (Europe/Berlin) -> kein Nachziehen des Dienst-Checkouts
 * im Gang (#1715, betrieb-nachziehen.lock) -> Sperre gegen Doppelstart -> (fehlermeldungen)
 * `npm run -s fehler -- abgleich` ohne KI -> je Teil `claude -p` mit Sonnet, fester
 * Werkzeugliste, Wache (PreToolUse-Hook) und Zeitlimit -> Status nach $TP_PRIVAT_DIR/routinen/,
 * bei neuem Fehler eine Mitteilung auf dem Mac und ein To-do im Control Center (Heute).
 *
 * Den Auftragstext liest der Lauf aus der privaten Kopie $TP_PRIVAT_DIR/routinen/auftraege/
 * <aufgabe>.md (`dienste-einrichten.sh --routinen` legt sie einmalig aus der App-Aufgabe an;
 * enthaelt u. a. die Werkbank-Adresse) und stellt nur einen kurzen Kopf voran
 * (operations/lib/routinen.mjs, promptKopf). Mails und Meldungstexte sind fremde Daten - deshalb
 * die enge Freigabeliste, die Wache, `--permission-mode dontAsk` und keine Rueckfragen.
 *
 * Doku: operations/README.md, Abschnitt "Routinen als Mac-Dienst".
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LAEUFE, privatDir, dienstDir, routinenDir, arbeitsOrdner, auftragPfad, imFenster, berlinZeit,
  auftragOhneKopf, promptKopf, claudeArgumente, bewerteLauf, vorpruefung, liesStatus, schreibStatus,
  nimmSperre, sperrPfad, sperrAlterMs, neuerSammler, sammle, abschliessen, pruefeWerkzeuge,
} from '../lib/routinen.mjs';
import { werkbankAus } from '../lib/routine-wache.mjs';
import { sperreVerwaist } from './betrieb-nachziehen.mjs';

const PROTOKOLL_TAGE = 14;
/** So lange wartet ein Lauf auf ein laufendes Nachziehen (#1715), bevor er diesen Takt auslaesst. */
export const NACHZIEHEN_WARTEN_MS = 4 * 60_000;

export function argumente(argv) {
  const a = { lauf: null, trocken: false, erzwingen: false, werkzeugprobe: false };
  for (const x of argv) {
    if (x === '--trocken') a.trocken = true;
    else if (x === '--erzwingen') a.erzwingen = true;
    else if (x === '--werkzeugprobe') a.werkzeugprobe = true;
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

/**
 * Umgebung fuer `claude -p`: dieselbe unter launchd wie von Hand aus einer Claude-Sitzung.
 * - Ohne USER findet claude die Abo-Anmeldung im Schluesselbund nicht (gemessen 26.10.2026:
 *   `env -i HOME=… claude auth status` -> loggedIn false, mit USER -> claude.ai/max).
 * - Kein API-Schluessel: der Dienst laeuft ueber das Abo.
 * - Variablen einer umgebenden Claude-Sitzung (CLAUDECODE, CLAUDE_CODE_*) fallen weg.
 * - CLAUDE_CODE_ENTRYPOINT=claude-desktop ist undokumentiert: ohne diese Kennung fehlen in
 *   `claude -p` die eingebauten Werkzeuge Artifact, ArtifactData und ArtifactComments (gemessen
 *   26.10.2026 mit claude 2.1.306 unter env -i: init meldete nur Bash, ToolSearch). Aendert eine
 *   kuenftige Version das, bricht die Pflichtpruefung am init-Ereignis den Lauf ab
 *   (art "werkzeug-fehlt") - nichts laeuft halb.
 */
export function claudeUmgebung(env, lauf, teil) {
  const sauber = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_)/.test(k)));
  const nutzer = env.USER || env.LOGNAME || os.userInfo().username;
  return { ...sauber, USER: nutzer, LOGNAME: env.LOGNAME || nutzer, CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', TP_ROUTINE: `${lauf}/${teil.id}` };
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
 * `claude -p` mit Zeitlimit, in eigener Prozessgruppe: beim Zeitlimit, bei fehlendem
 * Pflichtwerkzeug und wenn launchd den Dienst beendet, endet die ganze Gruppe (auch Hooks und
 * Befehle, die claude gestartet hat). Die stream-json-Ausgabe wird beim Lesen ausgewertet und
 * nicht aufbewahrt (sie enthaelt Mail-Inhalte): uebrig bleiben init, result, Aufrufliste und
 * die Gruende der Wache. `nurInit`: nach dem init-Ereignis beenden (Werkzeugprobe).
 */
export function starteClaude(bin, args, { cwd, env, zeitlimitMs, pflicht = [], nurInit = false }) {
  return new Promise((resolve) => {
    const kind = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const s = neuerSammler();
    let stderr = '';
    let zeitlimit = false;
    let werkzeuge = null;
    let haerter = null;
    const gruppe = (sig) => {
      try { process.kill(-kind.pid, sig); } catch { try { kind.kill(sig); } catch { /* schon weg */ } }
    };
    const beenden = () => {
      gruppe('SIGTERM');
      haerter ??= setTimeout(() => gruppe('SIGKILL'), 10_000);
    };
    // Beendet launchd den Dienst, darf claude nicht als Waise weiterlaufen.
    const weiter = sig => () => { gruppe('SIGTERM'); process.exit(128 + (os.constants.signals[sig] || 15)); };
    const signale = Object.fromEntries(['SIGTERM', 'SIGINT', 'SIGHUP'].map(sig => [sig, weiter(sig)]));
    for (const [sig, f] of Object.entries(signale)) process.once(sig, f);
    kind.stdout.setEncoding('utf8');
    kind.stdout.on('data', (d) => {
      sammle(s, d);
      if (s.init && !werkzeuge) {
        werkzeuge = pruefeWerkzeuge(s.init, pflicht);
        if (!werkzeuge.ok || nurInit) beenden();
      }
    });
    kind.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    const uhr = setTimeout(() => { zeitlimit = true; beenden(); }, zeitlimitMs);
    let fertigGemeldet = false;
    const fertig = (exitCode, signal, fehlerText) => {
      if (fertigGemeldet) return;
      fertigGemeldet = true;
      clearTimeout(uhr);
      if (haerter) clearTimeout(haerter);
      for (const [sig, f] of Object.entries(signale)) process.removeListener(sig, f);
      abschliessen(s);
      resolve({
        exitCode, signal, ergebnis: s.ergebnis, aufrufe: s.aufrufe, wache: s.wache, init: s.init,
        fehlend: werkzeuge && !werkzeuge.ok ? werkzeuge.fehlt : null, wartet: werkzeuge?.wartet || [],
        stderr: fehlerText ?? stderr, zeitlimit,
      });
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

/** Der private Auftragstext - nur aus $TP_PRIVAT_DIR/routinen/auftraege/, nie aus der App-Aufgabe. */
export function auftragLesen(privat, lauf, teil) {
  const datei = auftragPfad(privat, teil.aufgabe);
  if (!fs.existsSync(datei)) {
    throw Object.assign(new Error(`Auftragstext fehlt: ${datei} – einmalig mit „bash operations/scripts/dienste-einrichten.sh --routinen“ aus der App-Aufgabe ${teil.aufgabe} kopieren.`), { art: 'auftrag-fehlt' });
  }
  const text = auftragOhneKopf(fs.readFileSync(datei, 'utf8'));
  if (text.length < 100) throw Object.assign(new Error(`Auftragstext zu kurz: ${datei}`), { art: 'auftrag-fehlt' });
  if (lauf === 'fehlermeldungen' && !werkbankAus(text)) {
    throw Object.assign(new Error(`Auftragstext nennt keine eindeutige Werkbank-Adresse: ${datei}`), { art: 'auftrag-fehlt' });
  }
  return { datei, text };
}

/** Fuer --trocken: der Befehl ohne den (privaten) Auftragstext. */
export function befehlAnzeige(bin, args) {
  const q = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
  return [bin, ...args.slice(0, -1).map(q), '<PROMPT>'].join(' ');
}

/** Werkzeugnamen aus dem init-Ereignis, kurz: eingebaute vollstaendig, MCP nur gezaehlt (Gmail namentlich). */
export function initKurz(init) {
  if (!init) return 'kein init-Ereignis';
  const eingebaut = init.tools.filter(t => !t.startsWith('mcp__'));
  const mcp = init.tools.filter(t => t.startsWith('mcp__'));
  const gmail = mcp.filter(t => t.startsWith('mcp__claude_ai_Gmail__')).map(t => t.replace('mcp__claude_ai_Gmail__', ''));
  return `${eingebaut.join(', ')}${mcp.length ? ` · ${mcp.length} MCP-Werkzeuge${gmail.length ? ` (Gmail: ${gmail.join(', ')})` : ''}` : ''}`;
}

/**
 * Ein Teil = ein `claude -p`-Aufruf. Fehler bleiben im Teil: der Aufrufer macht mit dem
 * naechsten Teil weiter.
 */
export async function teilAusfuehren(lauf, teil, o) {
  const { privat, dienst, env, jetzt = new Date(), trocken = false, probe = false, aus = console.log, starte = starteClaude } = o;
  const def = LAEUFE[lauf];
  const arbeit = arbeitsOrdner(privat, lauf);
  const bin = claudeBin(env);
  const kopf = promptKopf(lauf, teil, { dienst, arbeit });
  const argsFuer = prompt => claudeArgumente(lauf, {
    dienst, arbeit, privat, prompt, modell: env.TP_ROUTINE_MODELL || 'sonnet', effort: env.TP_ROUTINE_EFFORT || 'medium', node: o.node, skript: o.skript,
  });
  if (probe) {
    const args = argsFuer('Antworte nur mit: OK');
    const r = await starte(bin, args, { cwd: dienst, env: claudeUmgebung(env, lauf, teil), zeitlimitMs: 120_000, pflicht: def.pflicht, nurInit: true });
    const w = pruefeWerkzeuge(r.init, def.pflicht);
    aus(`${teil.id}: init-Werkzeuge: ${initKurz(r.init)}`);
    aus(`${teil.id}: Pflicht (${def.pflicht.length}): ${r.init && w.ok ? 'alle da' : `FEHLT ${(r.init ? w.fehlt : def.pflicht).join(', ')}`}${w.wartet.length ? ` · wartet auf Verbindung: ${w.wartet.join(', ')}` : ''}`);
    return { ok: Boolean(r.init) && w.ok, probe: true };
  }
  const { datei, text } = auftragLesen(privat, lauf, teil);
  const args = argsFuer(`${kopf}\n${text}\n`);
  if (trocken) {
    const i = n => args.indexOf(n);
    const liste = (von) => { const r = []; for (let k = i(von) + 1; k < args.length && !args[k].startsWith('--'); k += 1) r.push(args[k]); return r; };
    aus(`\n== ${teil.titel} (${teil.id}) – trocken, startet nichts`);
    aus(`Auftrag:   ${datei} (${text.length} Zeichen, YAML-Kopf abgeschnitten)`);
    aus(`Ordner:    cwd ${dienst} · Arbeitsordner ${arbeit} · Zeitlimit ${def.zeitlimitMin} Min.`);
    aus(`Befehl:    ${befehlAnzeige(bin, args)}`);
    aus(`Werkzeuge (--tools): ${def.werkzeuge.join(', ')} · Pflicht beim Start: ${def.pflicht.join(', ')}`);
    aus(`Wache (PreToolUse-Hook, --settings): nur ${def.erlaubt.join(', ')}`);
    aus(`Freigaben (--allowedTools):\n  ${liste('--allowedTools').join('\n  ')}`);
    aus(`Sperren (--disallowedTools):\n  ${liste('--disallowedTools').join('\n  ')}`);
    aus(`Prompt-Kopf:\n${kopf}\n[… danach der Auftragstext aus ${path.basename(datei)}]`);
    return { ok: true, trocken: true };
  }
  leereOrdner(arbeit);
  const start = new Date();
  const r = await starte(bin, args, { cwd: dienst, env: claudeUmgebung(env, lauf, teil), zeitlimitMs: def.zeitlimitMin * 60_000, pflicht: def.pflicht });
  leereOrdner(arbeit);
  const bewertung = bewerteLauf(r);
  const protokolle = path.join(routinenDir(privat), lauf, 'laeufe');
  fs.mkdirSync(protokolle, { recursive: true, mode: 0o700 });
  alteProtokolleWeg(protokolle, jetzt);
  fs.writeFileSync(path.join(protokolle, `${stempel(start)}-${teil.id}.json`), `${JSON.stringify({
    teil: teil.id, start: start.toISOString(), ende: new Date().toISOString(), exitCode: r.exitCode, signal: r.signal,
    zeitlimit: r.zeitlimit, werkzeuge: r.init ? initKurz(r.init) : null, bewertung, stderr: String(r.stderr || '').slice(-2000),
  }, null, 2)}\n`, { mode: 0o600 });
  aus(`${new Date().toISOString()} ${teil.id}: ${bewertung.ok ? 'ok' : `FEHLER (${bewertung.art})`} · ${bewertung.meldung}${bewertung.tokens ? ` · ${bewertung.tokens} Tokens, ${bewertung.runden} Runden` : ''}`);
  return { ...bewertung, start: start.toISOString() };
}

/** Laeuft gerade ein Nachziehen des Dienst-Checkouts (#1715)? Frisch = Prozess lebt, juenger als dessen SPERRE_ALT_MS. */
export function nachziehenAktiv(privat) {
  return !sperreVerwaist(path.join(privat, 'betrieb-nachziehen.lock'));
}

const pause = ms => new Promise(r => setTimeout(r, ms));

/** Wartet bis zu `maxMs` auf das Ende eines Nachziehens. true = es laeuft immer noch. */
async function nachziehenAbwarten(privat, { aktiv, warte, maxMs }) {
  for (let gewartet = 0; aktiv(privat); gewartet += 15_000) {
    if (gewartet >= maxMs) return true;
    await warte(15_000);
  }
  return false;
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
  const o = { privat, dienst, env, jetzt, trocken: a.trocken, aus, starte: deps.starte, melde, node: deps.node, skript: deps.skript };
  const z = berlinZeit(jetzt);

  if (a.werkzeugprobe) {
    let ok = true;
    for (const teil of def.teile) ok = (await teilAusfuehren(a.lauf, teil, { ...o, probe: true })).ok && ok;
    return ok ? 0 : 1;
  }
  if (!a.erzwingen && !a.trocken && !imFenster(jetzt, def.fenster)) {
    aus(`${jetzt.toISOString()} ${a.lauf}: ausserhalb der Zeit (${z.datum} ${String(z.stunde).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}, Mo–Sa ${def.fenster.von}–${def.fenster.bis} Uhr) – nichts zu tun.`);
    return 0;
  }
  if (a.trocken) aus(`Zeitfenster: ${imFenster(jetzt, def.fenster) ? 'innerhalb' : 'ausserhalb'} (Mo–Sa ${def.fenster.von}–${def.fenster.bis} Uhr, jetzt ${z.datum} ${z.stunde}:${String(z.minute).padStart(2, '0')})`);

  // Uebersprungen ist kein Fehler: nur ein Lebenszeichen mit Grund. Bleibt der Erfolg zu lange
  // aus, meldet das die Stumm-Pruefung im Control Center (routinenStand).
  const ueberspringen = (hinweis) => {
    aus(`${jetzt.toISOString()} ${a.lauf}: ${hinweis} – übersprungen.`);
    for (const teil of def.teile) schreibStatus(privat, teil.id, { hinweis }, jetzt);
    return 0;
  };
  const aktiv = deps.nachziehenAktiv || nachziehenAktiv;
  if (!a.trocken && await nachziehenAbwarten(privat, { aktiv, warte: deps.warte || pause, maxMs: deps.nachziehenWartenMs ?? NACHZIEHEN_WARTEN_MS })) {
    return ueberspringen('wartet auf Nachziehen');
  }
  const sperre = a.trocken ? { freigeben() {} } : nimmSperre(sperrPfad(privat, a.lauf), { jetzt, maxAlterMs: sperrAlterMs(a.lauf) });
  if (!sperre) return ueberspringen('läuft noch (Sperre eines früheren Laufs)');
  // Erst die eigene Sperre, dann noch einmal nachsehen: so sieht entweder das Nachziehen die
  // Routine (routineLaeuft) oder die Routine das Nachziehen - nie keiner den anderen.
  if (!a.trocken && aktiv(privat)) { sperre.freigeben(); return ueberspringen('wartet auf Nachziehen'); }
  try {
    if (a.lauf === 'fehlermeldungen') return await fehlermeldungenLauf(a, o, deps);
    let alleOk = true;
    for (const teil of def.teile) {
      let r;
      try { r = await teilAusfuehren(a.lauf, teil, o); } catch (e) { r = { ok: false, art: e.art || 'start', meldung: e.message }; aus(`${teil.id}: FEHLER ${e.message}`); }
      if (a.trocken) continue;
      const { mitteilen } = schreibStatus(privat, teil.id, {
        ok: r.ok, art: r.art, meldung: r.meldung, hinweis: null, letzterClaudeLauf: r.start || jetzt.toISOString(), tokens: r.tokens ?? null,
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
      const { mitteilen } = schreibStatus(privat, teil.id, { ok: false, art: 'vorpruefung', meldung, hinweis: null }, jetzt);
      if (mitteilen) melde(teil.titel, meldung);
    }
    return 1;
  }
  let status = {};
  try { status = liesStatus(privat, teil.id); } catch { status = {}; }
  const ent = a.erzwingen ? { starten: true, grund: 'erzwungen' } : vorpruefung(vorher, status, jetzt);
  aus(`${jetzt.toISOString()} fehlermeldungen: Vorprüfung neu ${vorher.neu?.length || 0} · laufend ${vorher.laufend?.length || 0} · kürzlich erledigt ${vorher.kuerzlichErledigt?.length || 0} → ${ent.starten ? `Claude startet (${ent.grund})` : `Claude startet nicht (${ent.grund})`}`);
  if (a.trocken) {
    try { await teilAusfuehren('fehlermeldungen', teil, o); } catch (e) { aus(`fehlermeldungen: FEHLER ${e.message}`); return 1; }
    return 0;
  }
  if (!ent.starten) {
    // Liegt nichts mehr an, ist ein frueherer Fehlschlag erledigt. Wartet die Vorpruefung nur
    // auf den naechsten Abgleich und war der letzte Lauf gut, ist der Dienst gesund (Erfolg);
    // in der Pause nach einem Fehlschlag bleibt der Fehler sichtbar.
    const leer = ent.grund === 'nichts zu tun';
    schreibStatus(privat, teil.id, leer
      ? { ok: true, art: null, meldung: 'nichts zu tun', vorpruefung: ent.grund, hinweis: null }
      : { ...(status.ok !== false ? { ok: true } : {}), vorpruefung: ent.grund, hinweis: null }, jetzt);
    return 0;
  }
  let r;
  try { r = await teilAusfuehren('fehlermeldungen', teil, o); } catch (e) { r = { ok: false, art: e.art || 'start', meldung: e.message, start: jetzt.toISOString() }; }
  // Gegenprobe ohne KI: was vorher neu war, muss jetzt uebernommen sein.
  if (r.ok && vorher.neu?.length) {
    try {
      const nachher = abgleichen();
      const offen = vorher.neu.map(m => m.id).filter(id => nachher.neu?.some(m => m.id === id));
      if (offen.length) r = { ...r, ok: false, art: 'nicht-uebernommen', meldung: `Nach dem Lauf noch neu: ${offen.join(', ')} · ${r.meldung}` };
    } catch { /* die naechste Vorpruefung sieht es */ }
  }
  const { mitteilen } = schreibStatus(privat, teil.id, {
    ok: r.ok, art: r.art, meldung: r.meldung, vorpruefung: ent.grund, hinweis: null,
    letzterClaudeLauf: r.start || jetzt.toISOString(), letzterClaudeOk: r.ok, tokens: r.tokens ?? null,
  }, new Date());
  if (mitteilen) melde(teil.titel, r.meldung);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
}
