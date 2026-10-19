#!/usr/bin/env node
/**
 * Claude-Verbrauch der letzten 7 Tage fuer das Control Center (#671).
 *
 *   npm run verbrauch:sammeln
 *   npm run verbrauch:sammeln -- --tage 14
 *   npm run verbrauch:sammeln -- --ausgeben       # nur auf die Konsole, nichts schreiben
 *
 * Liest NUR die lokalen Sitzungsprotokolle von Claude Code
 * (~/.claude/projects/<dieses Repository und seine Worktrees>/*.jsonl samt
 * subagents/) und schreibt das Ergebnis nach
 * $TP_PRIVAT_DIR/verbrauch/claude.json - dieselbe Ablage wie alle anderen
 * Betriebsdaten, nicht im Git. Die Kachel auf "Insights" liest genau diese Datei.
 *
 * Uebernommen werden nur Zahlen, Modellnamen, Sitzungstitel, Namen geplanter
 * Aufgaben und Aufgabennummern - kein Text aus Anfragen oder Antworten.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { neuerSammler, tageFenster } from '../lib/claude-verbrauch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function argumente(argv) {
  const a = { tage: 7, ausgeben: false, projekte: null, ziel: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--tage') a.tage = Number(argv[++i]);
    else if (k === '--ausgeben') a.ausgeben = true;
    else if (k === '--projekte') a.projekte = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!Number.isInteger(a.tage) || a.tage < 1 || a.tage > 60) throw new Error('--tage muss eine ganze Zahl von 1 bis 60 sein');
  return a;
}

/** So benennt Claude Code den Projektordner: jedes Zeichen ausser Buchstabe/Ziffer wird '-'. */
export function projektName(pfad) {
  return pfad.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Hauptcheckout dieses Repositorys - auch wenn das Skript in einem Worktree
 * laeuft. Dessen Sitzungen liegen unter dem Namen des Hauptcheckouts plus
 * "--claude-worktrees-…", die von ~/Developer/tp-<thema> unter eigenem Namen.
 */
function hauptcheckout() {
  try {
    const gemeinsam = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
    return path.dirname(gemeinsam);
  } catch {
    return REPO;
  }
}

export function projektPraefixe({ haupt = hauptcheckout(), home = os.homedir() } = {}) {
  return [projektName(haupt), projektName(path.join(home, 'Developer', 'tp-'))];
}

function jsonlUnter(dir) {
  const liste = [];
  let eintraege;
  try { eintraege = fs.readdirSync(dir, { withFileTypes: true }); } catch { return liste; }
  for (const e of eintraege) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) liste.push(...jsonlUnter(p));
    else if (e.name.endsWith('.jsonl')) liste.push(p);
  }
  return liste;
}

function liesJson(datei) {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; return null; }
}

/** Alle Protokolldateien, die im Zeitraum geschrieben wurden. */
export function findeDateien({ projekteDir, praefixe, seitMs }) {
  const dateien = [];
  let ordner;
  try { ordner = fs.readdirSync(projekteDir, { withFileTypes: true }); } catch { return dateien; }
  for (const o of ordner) {
    if (!o.isDirectory() || !praefixe.some(p => o.name === p || o.name.startsWith(p))) continue;
    const dir = path.join(projekteDir, o.name);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const p = path.join(dir, e.name);
        if (fs.statSync(p).mtimeMs < seitMs) continue;
        const sitzungId = e.name.slice(0, -'.jsonl'.length);
        const titel = liesJson(path.join(dir, sitzungId, 'custom-title.json'))?.customTitle || null;
        dateien.push({ pfad: p, sitzungId, art: 'haupt', titel });
      } else if (e.isDirectory()) {
        const sitzungId = e.name;
        for (const p of jsonlUnter(path.join(dir, sitzungId, 'subagents'))) {
          if (fs.statSync(p).mtimeMs < seitMs) continue;
          const meta = liesJson(p.replace(/\.jsonl$/, '.meta.json'));
          dateien.push({ pfad: p, sitzungId, art: 'subagent', agentTyp: typeof meta?.agentType === 'string' ? meta.agentType : null });
        }
      }
    }
  }
  // Hauptsitzung vor ihren Subagenten: liegt eine Antwort in beiden, zaehlt sie dort.
  return dateien.sort((a, b) => (a.art === b.art ? 0 : a.art === 'haupt' ? -1 : 1));
}

const RELEVANT = ['"type":"assistant"', '"type":"user"', '"type":"custom-title"', '"type":"agent-name"'];

async function liesDatei(sammler, d) {
  const leser = sammler.datei({ sitzungId: d.sitzungId, art: d.art, agentTyp: d.agentTyp, titel: d.titel });
  const zeilen = readline.createInterface({ input: fs.createReadStream(d.pfad, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const roh of zeilen) {
    if (!RELEVANT.some(r => roh.includes(r))) continue;
    try { leser.zeile(JSON.parse(roh)); } catch { /* abgeschnittene letzte Zeile einer laufenden Sitzung */ }
  }
}

export async function sammle({ projekteDir = path.join(os.homedir(), '.claude', 'projects'), praefixe = projektPraefixe(), jetzt = new Date(), tage = 7 } = {}) {
  const fenster = tageFenster(jetzt, tage);
  // Einen Tag Puffer: eine Datei, die gestern Nacht zuletzt schrieb, kann trotzdem heute beginnen.
  const seitMs = new Date(`${fenster[0]}T00:00:00Z`).getTime() - 864e5;
  const dateien = findeDateien({ projekteDir, praefixe, seitMs });
  const sammler = neuerSammler({ jetzt, tage });
  for (const d of dateien) await liesDatei(sammler, d);
  return sammler.ergebnis();
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run verbrauch:sammeln [-- --tage 7] [--ausgeben] [--projekte <ordner>] [--ziel <datei>]');
    return;
  }
  const beginn = Date.now();
  const ergebnis = await sammle({ tage: a.tage, ...(a.projekte ? { projekteDir: a.projekte } : {}) });
  if (a.ausgeben) { console.log(JSON.stringify(ergebnis, null, 2)); return; }
  const ziel = a.ziel || path.join(privatDir(), 'verbrauch', 'claude.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  // Erst vollstaendig schreiben, dann umbenennen: die Kachel liest nie eine halbe Datei.
  const tmp = `${ziel}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ergebnis, null, 2));
  fs.renameSync(tmp, ziel);
  const s = ergebnis.summe;
  console.log(`Claude-Verbrauch ${ergebnis.zeitraum.von} bis ${ergebnis.zeitraum.bis}: ${s.sitzungen} Sitzungen, davon ${s.langsitzungen} lang, ${s.tokens.gesamt.toLocaleString('de-DE')} Tokens aus ${ergebnis.quelle.dateien} Dateien (${Math.round((Date.now() - beginn) / 1000)} s) -> ${ziel}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`Fehler: ${e.message}`); process.exit(1); });
}
