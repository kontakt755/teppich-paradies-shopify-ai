import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { redact, sanitizeTask } from './dashboard-core.mjs';

export const DEFAULT_REPOSITORY = 'kontakt755/teppich-paradies-shopify-ai';
export const STATUS_LABELS = ['status:eingang', 'status:geplant', 'status:in-arbeit', 'status:review', 'status:blockiert'];
export const REVIEWER_LABELS = ['reviewer:codex', 'reviewer:mensch'];

function runGh(args, { exec = execFileSync, repository = process.env.DASHBOARD_GITHUB_REPO || DEFAULT_REPOSITORY } = {}) {
  return exec('gh', [...args, '--repo', repository], { encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024 }).trim();
}

export function parseIssueNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error('Bitte wähle eine gültige GitHub-Aufgabe.');
  return number;
}

export function listOpenIssues(options = {}) {
  const output = runGh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,url'], options);
  const issues = JSON.parse(output || '[]');
  return issues.map(issue => ({
    number: issue.number,
    title: redact(issue.title, 240),
    url: issue.url,
    labels: Array.isArray(issue.labels) ? issue.labels.map(label => label.name).filter(Boolean) : [],
  }));
}

export function getIssue(issueNumber, options = {}) {
  const number = parseIssueNumber(issueNumber);
  if (!number) return null;
  const output = runGh(['issue', 'view', String(number), '--json', 'number,title,body,labels,url'], options);
  const issue = JSON.parse(output || '{}');
  return {
    number: issue.number ?? number,
    title: redact(issue.title, 240),
    body: redact(issue.body, 6_000),
    url: issue.url,
    labels: Array.isArray(issue.labels) ? issue.labels.map(label => label.name).filter(Boolean) : [],
  };
}

export function buildIssueTaskContext(issue, task) {
  const title = issue.title ?? '';
  const body = issue.body?.trim() ?? '';
  const supplement = String(task ?? '').trim();
  const parts = [
    `## GitHub-Aufgabe #${issue.number}`,
    title ? `Titel: ${title}` : null,
    body ? `Beschreibung:\n${body}` : 'Beschreibung: (keine)',
    supplement ? `## Zusätzliche Angaben der Person\n${supplement}` : null,
  ].filter(Boolean);
  return parts.join('\n\n');
}

export function buildIssueTitle(task) {
  const compact = sanitizeTask(task).split('\n')[0].replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();
  return `🤖 ${redactPublicText(compact, 105)}`;
}

export function redactPublicText(value, maximum = 4_000) {
  return (redact(String(value), maximum) || '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[E-Mail geschützt]')
    .replace(/\b(passwort|password|zugangscode|api[- ]?key|token|secret|schlüssel)\b\s*[:=]?\s*\S+/gi, '$1: [geschützt]')
    .slice(0, maximum);
}

export function inferIssueLabels(task) {
  const text = sanitizeTask(task).toLowerCase();
  const priority = /kritisch|ausfall|checkout|zahlung|preis|live[- ]?theme|löschen/.test(text) ? 'priority:p0' : /fehler|bug|kaputt|blockiert|integration|tracking/.test(text) ? 'priority:p1' : 'priority:p2';
  const type = /fehler|bug|kaputt|reparier/.test(text) ? 'type:bug' : /\bseo\b|meta[- ]?title|suchmaschine/.test(text) ? 'type:seo' : /text|beschreibung|content|inhalt/.test(text) ? 'type:content' : /design|layout|mobil|ux|ansicht/.test(text) ? 'type:ux' : 'type:technik';
  const area = /google|merchant|analytics|\bads\b/.test(text) ? 'area:google' : /menü|menu|navigation|breadcrumb/.test(text) ? 'area:navigation' : /kategorie|collection/.test(text) ? 'area:kategorie' : /produkt|product/.test(text) ? 'area:produktseite' : /api|router|dashboard|github|automation|backend/.test(text) ? 'area:backend' : 'area:sonstiges';
  return ['status:in-arbeit', type, priority, area];
}

export function createOrReuseIssue(task, options = {}) {
  const cleanTask = sanitizeTask(task);
  const title = buildIssueTitle(cleanTask);
  const existing = listOpenIssues(options).find(issue => issue.title?.toLocaleLowerCase('de-DE') === title.toLocaleLowerCase('de-DE'));
  if (existing) return { ...existing, created: false, reused: true };
  const fingerprint = crypto.createHash('sha256').update(cleanTask).digest('hex').slice(0, 16);
  const body = `## Auftrag aus der AI-Steuerzentrale\n\n${redactPublicText(cleanTask, 4_000)}\n\n<!-- tp-ai-fingerprint:${fingerprint} -->`;
  const args = ['issue', 'create', '--title', title, '--body', body];
  for (const label of inferIssueLabels(cleanTask)) args.push('--label', label);
  const url = runGh(args, options).split('\n').find(line => /\/issues\/\d+\s*$/.test(line))?.trim();
  const number = Number(url?.match(/\/issues\/(\d+)$/)?.[1]);
  if (!url || !Number.isInteger(number)) throw new Error('GitHub hat keine gültige neue Aufgabenadresse zurückgegeben.');
  return { number, title, url, labels: inferIssueLabels(cleanTask), created: true, reused: false };
}

function targetForState(state) {
  if (state === 'PASS') return { status: 'status:review', reviewer: 'reviewer:codex', heading: 'Ergebnis bereit zur Prüfung' };
  if (state === 'HUMAN_GATE') return { status: 'status:blockiert', reviewer: 'reviewer:mensch', heading: 'Freigabe benötigt' };
  if (state === 'ERROR') return { status: 'status:blockiert', reviewer: 'reviewer:mensch', heading: 'Bearbeitung angehalten' };
  return { status: 'status:in-arbeit', reviewer: null, heading: 'KI-Bearbeitung gestartet' };
}

export function buildIssueComment(run, state) {
  const target = targetForState(state);
  const result = run.result?.result || run.result?.summary || run.message || '';
  const provider = run.result?.authMode === 'API' ? 'Claude API-Backup' : run.result?.authMode === 'SUBSCRIPTION' ? 'Claude Code Pro' : null;
  const lines = [
    `## AI-Steuerzentrale: ${target.heading}`,
    '',
    `- Dashboard-Lauf: \`${run.id}\``,
    `- Status: **${state}**`,
    provider ? `- Ausführung: ${provider}` : null,
    run.result?.reviewRound ? `- Codex-Review: Runde ${run.result.reviewRound}` : null,
    '',
    redact(result, 2_000) || 'Kein weiterer Ergebnistext verfügbar.',
  ].filter(Boolean);
  return lines.join('\n');
}

export function synchronizeIssue({ issueNumber, state, run }, options = {}) {
  const number = parseIssueNumber(issueNumber);
  if (!number) return null;
  const target = targetForState(state);
  const current = JSON.parse(runGh(['issue', 'view', String(number), '--json', 'labels'], options) || '{}');
  const currentLabels = Array.isArray(current.labels) ? current.labels.map(label => label.name) : [];
  const remove = currentLabels.filter(label => STATUS_LABELS.includes(label) || REVIEWER_LABELS.includes(label));
  const args = ['issue', 'edit', String(number)];
  for (const label of remove) args.push('--remove-label', label);
  args.push('--add-label', target.status);
  if (target.reviewer && !currentLabels.includes(target.reviewer)) args.push('--add-label', target.reviewer);
  runGh(args, options);
  runGh(['issue', 'comment', String(number), '--body', buildIssueComment(run, state)], options);
  return { number, status: target.status, reviewer: target.reviewer };
}
