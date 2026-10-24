#!/usr/bin/env node
// Offene Uebergaben zwischen Claude, Codex und den Menschen - aus dem
// gemeinsamen Vault (Zusammenarbeit/Aufgaben/*.md), je Empfaenger.
//
//   npm run -s uebergaben                 alles Offene und Wartende mit Hinweisen
//   npm run -s uebergaben -- --an claude  nur, was bei Claude liegt (codex | mensch)
//   npm run -s uebergaben -- --kurz       hoechstens fuenf Zeilen; ohne Treffer still
//
// Warum: Eine Uebergabedatei startet keine Sitzung. Bis 2026-10-24 lag ein
// fertiger Auftrag an Claude vier Tage auf "offen", mit dem Hinweis, der
// Benutzer moege den Prompt in einen Claude-Chat kopieren. Jetzt zeigt der
// Sitzungsstart jeder Claude-Sitzung, was fuer Claude offen ist, und Codex
// ruft denselben Befehl zu Beginn auf (AGENTS.md "Zusammenarbeit").
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GROSS = 40 * 1024; // groessere Dateien werden bei jeder Uebernahme ganz gelesen
const OFFEN = new Set(['offen', 'in-arbeit']);
const ERLEDIGT = new Set(['fertig', 'erledigt', 'abgebrochen']);
const META = new Set(['Inbox.md', 'Vorlage.md']);

/** Einfache Frontmatter: oberste Ebene und eingerueckte Felder unter metadata:. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const f = {};
  if (!m) return f;
  for (const zeile of m[1].split(/\r?\n/)) {
    const t = /^\s*([a-z_]+):\s*(.*)$/.exec(zeile);
    if (!t || t[1] === 'metadata') continue;
    if (/^\s/.test(zeile) && t[1] in f) continue; // oberste Ebene gewinnt
    f[t[1]] = t[2].replace(/^["']|["']$/g, '').trim();
  }
  return f;
}

/** Empfaenger: claude, codex, mensch - mehrere moeglich. Ein gesetztes zustaendig entscheidet allein. */
export function empfaenger(f) {
  const erkenne = (text) => {
    const e = [];
    if (/claude/i.test(text)) e.push('claude');
    if (/codex|chatgpt|leitstelle/i.test(text)) e.push('codex');
    if (/inhaber|ahmet|tobias|betrieb|laden|mensch|benutzer/i.test(text)) e.push('mensch');
    return e;
  };
  const zustaendig = erkenne(f.zustaendig || '');
  return zustaendig.length ? zustaendig : erkenne(f.an || '');
}

export function eintrag(datei, text, bytes) {
  const f = frontmatter(text);
  const titel = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? path.basename(datei, '.md');
  const status = (f.status || 'ohne-status').toLowerCase();
  return { datei: path.basename(datei, '.md'), titel, status, an: f.an || '', zustaendig: f.zustaendig || '', aktualisiert: f.aktualisiert || f.erstellt || '', bytes, empfaenger: empfaenger(f) };
}

export function tageSeit(datum, heute) {
  const d = Date.parse(`${datum}T00:00:00Z`);
  return Number.isNaN(d) ? null : Math.floor((Date.parse(`${heute}T00:00:00Z`) - d) / 86400000);
}

export function hinweise(e, heute) {
  const h = [];
  if (e.empfaenger.filter((x) => x !== 'mensch').length > 1 && !e.zustaendig) h.push('mehrere Empfaenger, kein zustaendig');
  if (!e.empfaenger.length) h.push('Empfaenger unklar');
  if (e.bytes > GROSS) h.push(`${Math.round(e.bytes / 1024)} KB - Stand oben zusammenfassen, Verlauf archivieren`);
  const t = tageSeit(e.aktualisiert, heute);
  if (OFFEN.has(e.status) && t !== null && t > 3) h.push(`seit ${t} Tagen unveraendert`);
  return h;
}

/** Eine Gruppe je Uebergabe: wer ausser den Menschen etwas tun soll. */
export function gruppe(e) {
  const ki = e.empfaenger.filter((x) => x !== 'mensch');
  if (ki.length > 1) return 'geteilt';
  return ki[0] || (e.empfaenger.includes('mensch') ? 'mensch' : 'unklar');
}

export function bericht(eintraege, { heute, an = null, kurz = false } = {}) {
  const aktiv = eintraege.filter((e) => !ERLEDIGT.has(e.status) && (!an || e.empfaenger.includes(an)));
  const offen = aktiv.filter((e) => OFFEN.has(e.status));
  const wartet = aktiv.filter((e) => !OFFEN.has(e.status));
  const zeile = (e) => {
    const t = tageSeit(e.aktualisiert, heute);
    const h = hinweise(e, heute);
    return `  ${e.status.padEnd(14)} ${t === null ? '   ?' : `${String(t).padStart(3)}T`}  ${e.datei}${h.length ? `  [${h.join('; ')}]` : ''}`;
  };
  if (kurz) {
    if (!offen.length) return '';
    const z = [`Offene Uebergaben${an ? ` an ${an}` : ''}: ${offen.length} (Vault Zusammenarbeit/Aufgaben, aelteste zuerst)`];
    for (const e of [...offen].sort((x, y) => x.aktualisiert.localeCompare(y.aktualisiert)).slice(0, 4)) z.push(zeile(e));
    z.push(`  Alle mit Hinweisen: npm run -s uebergaben${an ? ` -- --an ${an}` : ''}. Uebernehmen = status in-arbeit, zustaendig setzen.`);
    return z.join('\n');
  }
  const z = [];
  for (const [name, liste] of [['Offen / in Arbeit', offen], ['Wartet', wartet]]) {
    z.push(`${name}: ${liste.length}`);
    for (const wer of ['claude', 'codex', 'geteilt', 'mensch', 'unklar']) {
      const teil = liste.filter((e) => gruppe(e) === wer);
      if (!teil.length) continue;
      z.push(` an ${wer === 'geteilt' ? 'Claude und Codex' : wer} (${teil.length}):`);
      for (const e of teil.sort((x, y) => x.aktualisiert.localeCompare(y.aktualisiert))) z.push(zeile(e));
    }
  }
  const unklar = aktiv.filter((e) => hinweise(e, heute).some((h) => /Empfaenger/.test(h))).length;
  if (unklar) z.push('', `${unklar} Uebergaben ohne eindeutige Zustaendigkeit: Feld zustaendig auf genau claude, codex oder mensch setzen.`);
  return z.join('\n');
}

/** Vault des Hauptcheckouts (auch aus einem Worktree), wie .claude/hooks/gedaechtnis-sync.sh. */
export function vaultOrdner(env = process.env, start = process.cwd()) {
  if (env.TP_GEDAECHTNIS_DIR) return env.TP_GEDAECHTNIS_DIR;
  let haupt = start;
  try {
    haupt = path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: start, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { /* ausserhalb eines Repositorys */ }
  return path.join(env.HOME || os.homedir(), '.claude', 'projects', haupt.replace(/\//g, '-'), 'memory');
}

export function laden(ordner) {
  const dir = path.join(ordner, 'Zusammenarbeit', 'Aufgaben');
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !META.has(n)).map((n) => {
    const p = path.join(dir, n);
    const text = fs.readFileSync(p, 'utf8');
    return eintrag(p, text, Buffer.byteLength(text));
  });
}

function main() {
  const argv = process.argv.slice(2);
  const an = argv.includes('--an') ? argv[argv.indexOf('--an') + 1] : null;
  if (an && !['claude', 'codex', 'mensch'].includes(an)) { console.error('--an claude | codex | mensch'); process.exit(2); }
  const kurz = argv.includes('--kurz');
  const ordner = vaultOrdner();
  let eintraege;
  try { eintraege = laden(ordner); } catch {
    if (!kurz) { console.error(`Kein Uebergabeordner unter ${ordner} (Vault fehlt auf diesem Rechner?).`); process.exit(1); }
    return;
  }
  const text = bericht(eintraege, { heute: new Date().toISOString().slice(0, 10), an, kurz });
  if (text) console.log(text);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
