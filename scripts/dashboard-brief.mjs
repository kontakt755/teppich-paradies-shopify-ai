#!/usr/bin/env node
/**
 * Kurzbrief des Control Centers fuer den SessionStart-Hook.
 *
 * Jede KI-Session sieht damit den Zustand des Unternehmens, bevor sie den
 * ersten Befehl tippt: Datenstand, Zaehler (offen, kritisch, blockiert,
 * Freigaben, Triage) und die drei dringendsten Aufgaben mit Begruendung.
 *
 * Liest ausschliesslich docs/ai-dashboard/issues.json - die Datei liegt im
 * Repo, also auch in Worktrees und Remote-Sessions ohne gh oder Netz. Regeln
 * kommen aus docs/ai-dashboard/lib/model.mjs, dieselben wie im Dashboard.
 * Fehlt die Datei oder ist sie kaputt, gibt es eine Zeile Hinweis, nie einen
 * Abbruch - der Hook darf den Sessionstart nicht blockieren.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTask, summarize, attentionList, freshness } from '../docs/ai-dashboard/lib/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = path.resolve(HERE, '..', 'docs/ai-dashboard/issues.json');
export const DASHBOARD_URL = 'https://kontakt755.github.io/teppich-paradies-shopify-ai/ai-dashboard/';

/** Reine Funktion: issues.json-Inhalt -> Zeilen. Testbar ohne Dateisystem. */
export function buildBrief(data, { now = new Date(), limit = 3 } = {}) {
  if (!data || !Array.isArray(data.issues)) return ['Control Center: issues.json fehlt oder ist ungueltig - npm run dashboard:data'];
  const tasks = data.issues.map(i => normalizeTask(i, { now }));
  const s = summarize(tasks, { now });
  const fr = freshness(data.generated_at, { now });
  const lines = [];
  lines.push(`Control Center (Stand ${fr.text}${fr.level === 'veraltet' ? ', VERALTET' : ''}): ${s.open} offen, ${s.critical} kritisch, ${s.blocked} blockiert, ${s.approvals} Freigabe${s.approvals === 1 ? '' : 'n'} offen, ${s.triage} mit Triage-Luecke`);
  const top = attentionList(tasks, { now, limit });
  for (const { task, reasons } of top) {
    const owner = task.owner ? `@${task.owner}` : 'ohne Owner';
    lines.push(`  #${task.number} ${task.title} - ${reasons.slice(0, 2).join(', ')} (${owner})`);
  }
  if (!top.length && s.open) lines.push('  Nichts draengt: keine P0, keine Blocker, keine offenen Freigaben.');
  lines.push(`  Aufgaben: npm run task -- list | eigene Arbeit: npm run task -- create/start/done | ${DASHBOARD_URL}`);
  return lines;
}

export function readBrief({ file = DATA_FILE, now = new Date() } = {}) {
  try {
    return buildBrief(JSON.parse(fs.readFileSync(file, 'utf8')), { now });
  } catch (error) {
    return [`Control Center: issues.json nicht lesbar (${String(error?.message ?? error).split('\n')[0].slice(0, 80)}) - npm run dashboard:data`];
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${readBrief().join('\n')}\n`);
}
