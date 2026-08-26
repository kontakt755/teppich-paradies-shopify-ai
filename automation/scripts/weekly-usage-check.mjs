#!/usr/bin/env node
/**
 * Woechentlicher Verbrauchs-Check fuer den AI-Router - gedacht fuer einen
 * lokalen Cron-Job (macOS launchd/crontab), nicht fuer eine Cloud-Routine:
 * die Verbrauchsdaten unter .workflow/usage/ liegen ausschliesslich lokal
 * und sind nicht Teil des Git-Repos.
 *
 * Schreibt einen Klartext-Report nach .workflow/reports/usage-weekly-*.txt
 * und stoesst zusaetzlich eine macOS-Systembenachrichtigung an (best effort -
 * ein Fehlschlag dabei darf den Report selbst nie verhindern).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readUsageRange } from '../../workflow/usage-metrics.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const days = Number(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1] ?? 7);

const report = readUsageRange({ root, days });
const today = new Date().toISOString().slice(0, 10);
const reworkTotal = report.reworkStopReasons.reduce((sum, entry) => sum + entry.count, 0);

const lines = [
  `Wochenauswertung: ${today}`,
  `Zeitraum: ${report.days} Tage angefragt, ${report.daysWithData} mit Daten`,
  `Router-Laeufe: ${report.runs} (davon ${report.scriptOnlyRuns} ohne Modell)`,
  `Modellaufrufe: ${report.modelCalls}`,
  `Nach Provider: ${Object.entries(report.byProvider).map(([provider, count]) => `${provider}=${count}`).join(', ') || '-'}`,
  `Nach Klasse: ${Object.entries(report.byClass).map(([taskClass, count]) => `${taskClass}=${count}`).join(', ') || '-'}`,
  `Rework-Gruende (nicht DONE): ${report.reworkStopReasons.map(entry => `${entry.stopReason}=${entry.count}`).join(', ') || 'keine'}`,
];
const text = `${lines.join('\n')}\n`;
process.stdout.write(text);

const reportsDir = path.join(root, '.workflow/reports');
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, `usage-weekly-${today}.txt`), text);

const summary = `${report.runs} Laeufe, ${reworkTotal} mit Nacharbeit`.replaceAll('"', "'");
try {
  execFileSync('osascript', ['-e', `display notification "${summary}" with title "KI-Router Wochenauswertung"`]);
} catch {
  // Benachrichtigung ist ein Nice-to-have (z. B. kein Display-Server bei
  // einem headless-Cron) - der Report selbst wurde bereits geschrieben.
}
