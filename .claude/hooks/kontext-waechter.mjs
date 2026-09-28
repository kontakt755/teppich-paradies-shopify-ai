#!/usr/bin/env node
// UserPromptSubmit-Hook: schlaegt einen Handoff vor, statt auf die Disziplin
// der Sitzung zu vertrauen (#361).
//
// Befund 2026-09-26: in langen Sitzungen sind ~84 % des Kontexts Verlauf,
// nicht Grundlast. Jede weitere Runde bezahlt den ganzen Verlauf erneut.
// Die Regel "eine Session pro Aufgabe" stand in CLAUDE.md und wurde bei
// sieben Aufgaben in einem Chat nicht bemerkt. Dieser Hook bemerkt es:
//
//   - Aufgabenwechsel: im Transkript wurde schon mindestens zweimal
//     `workflow:route` aufgerufen (jede neue Aufgabe beginnt damit).
//   - Kontextgroesse: letzter gemeldeter Eingabe-Kontext ueber der Schwelle
//     (TP_KONTEXT_SCHWELLE, Standard 250000 Tokens), danach je +150000 erneut.
//
// Er blockiert nie. Er meldet einmal je Stufe (Zustand in os.tmpdir je
// session_id) und nennt `npm run handoff` als naechsten Schritt.
// Fehler jeder Art: still beenden, Exit 0 — ein Hinweis-Hook darf nichts aufhalten.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SCHWELLE = Number(process.env.TP_KONTEXT_SCHWELLE) || 250000;
export const SCHRITT = 150000;

// Nur ein echter Aufruf zaehlt, nicht jeder Befehl, in dem der Text vorkommt
// (Commit-Texte, Heredocs, grep, echo enthalten ihn auch).
export function istRoute(cmd) {
  return cmd.split(/&&|;|\|\||\|/).some((teil) =>
    /^\s*(?:npm run(?: -s)? workflow:route|node (?:\.\/)?workflow\/cli\.mjs route)(?:\s|$)/.test(teil));
}

// Liest das JSONL-Transkript und liefert { kontext, routen }.
export function auswerten(text) {
  let kontext = 0;
  let routen = 0;
  for (const zeile of text.split('\n')) {
    if (!zeile.trim()) continue;
    let d;
    try { d = JSON.parse(zeile); } catch { continue; }
    if (d.isSidechain) continue;
    const m = d.message;
    if (d.type !== 'assistant' || !m || typeof m !== 'object') continue;
    const u = m.usage;
    if (u) {
      const summe = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (summe > 0) kontext = summe;
    }
    for (const teil of Array.isArray(m.content) ? m.content : []) {
      const cmd = teil?.type === 'tool_use' ? teil.input?.command : null;
      if (typeof cmd === 'string' && istRoute(cmd)) routen++;
    }
  }
  return { kontext, routen };
}

// Stufe, ab der gemeldet wird; 0 = nichts zu melden.
export function stufe({ kontext, routen }, schwelle = SCHWELLE) {
  const k = kontext >= schwelle ? 1 + Math.floor((kontext - schwelle) / SCHRITT) : 0;
  const r = routen >= 2 ? routen - 1 : 0;
  return { k, r, schluessel: `${k}:${r}`, melden: k > 0 || r > 0 };
}

export function hinweis({ kontext, routen }, s) {
  const teile = [];
  if (s.r > 0) teile.push(`In diesem Chat wurde bereits ${routen}-mal workflow:route aufgerufen — das ist die ${routen}. Aufgabe in einer Sitzung (Regel: eine Sitzung pro Aufgabe).`);
  if (s.k > 0) teile.push(`Kontext liegt bei rund ${Math.round(kontext / 1000)}k Tokens; jede weitere Runde bezahlt diesen Verlauf erneut.`);
  teile.push('Vorschlag: laufende Aufgabe abschliessen oder mit `npm run -s handoff` einen Uebergabetext erzeugen und die naechste Aufgabe in einer neuen Sitzung beginnen. Grosse Ausgaben gefiltert holen (`npm run -s kurz -- <art>`, siehe CLAUDE.md).');
  return teile.join(' ');
}

function main() {
  let eingabe;
  try { eingabe = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  const pfad = eingabe?.transcript_path;
  if (!pfad) return;
  let text;
  try { text = readFileSync(pfad, 'utf8'); } catch { return; }
  const werte = auswerten(text);
  const s = stufe(werte);
  if (!s.melden) return;
  const zustand = join(tmpdir(), `tp-kontext-waechter-${String(eingabe.session_id || 'x').replace(/[^\w-]/g, '')}`);
  let alt = '';
  try { alt = readFileSync(zustand, 'utf8'); } catch { /* erster Lauf */ }
  if (alt === s.schluessel) return;
  try { writeFileSync(zustand, s.schluessel); } catch { /* ohne Zustand meldet er eben erneut */ }
  const text2 = hinweis(werte, s);
  process.stdout.write(JSON.stringify({
    systemMessage: `Kontext-Waechter: ${text2}`,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Kontext-Waechter (#361): ${text2} Sage das dem Nutzer in einem Satz, bevor du weiterarbeitest.` },
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch { /* Hinweis-Hook: nie blockieren */ }
}
