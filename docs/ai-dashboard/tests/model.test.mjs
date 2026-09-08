import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBody, parseDate, statusOf, normalizeTask, attentionScore, attentionList,
  requirementsFor, labelChangesFor, summarize, areaHealth, freshness, SAVED_VIEWS, matchesQuery,
} from '../lib/model.mjs';

const NOW = new Date('2026-09-08T12:00:00Z');

const issue = (over = {}) => ({
  number: 1, title: 'Beispiel', state: 'open', html_url: 'https://github.com/x/y/issues/1',
  labels: ['status:geplant', 'priority:p2', 'area:google'], assignee: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-07T00:00:00Z', closed_at: null, body: '', ...over,
});

test('parseDate versteht ISO, deutsches Datum und Kalenderwoche', () => {
  assert.equal(parseDate('2026-09-30'), '2026-09-30');
  assert.equal(parseDate('Fällig am 30.9.2026'), '2026-09-30');
  assert.equal(parseDate('1.10.26'), '2026-10-01');
  assert.equal(parseDate('KW 37 2026'), '2026-09-07');
  assert.equal(parseDate('irgendwann'), null);
});

test('parseBody liest die im Repo gebraeuchlichen Abschnitte', () => {
  const body = `## Ziel
118 Produkte nur aus Google & YouTube entfernen

## Akzeptanzkriterien
- [x] Online Store aktiv
- [ ] Google & YouTube aus
- [ ] 118 Produkte bestätigt

## Worker
Ahmet + beaufsichtigter Worker

## Risk
HIGH ⚠️ (Human Gate erforderlich)

## Abhängigkeiten
SHP-014, #12

## Frist
30.09.2026

## Nächster Schritt
Ahmet: Bitte Freigabe erteilen
<!-- tp-ai-fingerprint:abc123 -->`;
  const f = parseBody(body);
  assert.equal(f.goal, '118 Produkte nur aus Google & YouTube entfernen');
  assert.deepEqual({ total: f.acceptance.total, done: f.acceptance.done }, { total: 3, done: 1 });
  assert.equal(f.executor, 'Ahmet + beaufsichtigter Worker');
  assert.equal(f.risk, 'HIGH ⚠️ (Human Gate erforderlich)');
  assert.deepEqual(f.dependencies, ['#12', 'SHP-014']);
  assert.equal(f.due, '2026-09-30');
  assert.equal(f.nextStep, 'Ahmet: Bitte Freigabe erteilen');
  assert.equal(f.fingerprint, 'abc123');
});

test('parseBody erkennt Blocker aus dem Status-Abschnitt und Inline-Felder', () => {
  const f = parseBody(`## Problem
Brauchen Admin API Access.

## Status
**BLOCKIERT** - Warte auf Shopify API Credentials von Ahmet

Nächster Schritt: Ahmet bitte Admin API Key + Scopes geben`);
  assert.equal(f.blocker, 'Warte auf Shopify API Credentials von Ahmet');
  assert.equal(f.nextStep, 'Ahmet bitte Admin API Key + Scopes geben');
});

test('parseBody liest Entscheidungsvorlagen', () => {
  const f = parseBody(`## Frage
Sollen wir die Admin-API-Scopes write_products freigeben?

## Optionen
1. Nur read_products
2. read + write_products
3. Später entscheiden

## Empfehlung
Option 2, weil der Import sonst manuell bleibt.

## Entscheider
Ahmet

## Frist
2026-09-12`);
  assert.match(f.question, /write_products/);
  assert.equal(f.options.length, 3);
  assert.match(f.recommendation, /Option 2/);
  assert.equal(f.decider, 'Ahmet');
  assert.equal(f.due, '2026-09-12');
});

test('statusOf: Legacy-Freigabe, Konflikte, geschlossene Issues', () => {
  assert.deepEqual(statusOf({ state: 'open', labels: ['status:blockiert', 'reviewer:mensch'] }), { key: 'freigabe', conflicts: [], legacyApproval: true });
  assert.equal(statusOf({ state: 'open', labels: ['status:blockiert'] }).key, 'blockiert');
  assert.equal(statusOf({ state: 'open', labels: [] }).key, 'eingang');
  assert.equal(statusOf({ state: 'closed', labels: ['status:in-arbeit'] }).key, 'fertig');
  assert.equal(statusOf({ state: 'closed', labels: ['status:abgebrochen'] }).key, 'abgebrochen');
  const conflict = statusOf({ state: 'open', labels: ['status:geplant', 'status:review'] });
  assert.equal(conflict.conflicts.length, 2);
  assert.equal(statusOf({ state: 'open', labels: ['status:fertig'] }).conflicts.length, 1);
});

test('normalizeTask: Owner = Assignee, KI-Ausfuehrender am Praefix, Faelligkeit, Triage-Luecken', () => {
  const t = normalizeTask(issue({
    title: '🤖 Mega Menu', labels: ['status:in-arbeit', 'type:ux'], assignee: null,
    body: 'Frist: 2026-09-05',
  }), { now: NOW });
  assert.equal(t.status, 'in-arbeit');
  assert.equal(t.executor, 'KI-Agent');
  assert.equal(t.executorKind, 'ki');
  assert.equal(t.owner, null);
  assert.equal(t.due, '2026-09-05');
  assert.equal(t.daysToDue, -3);
  assert.equal(t.overdue, true);
  assert.ok(t.triage.includes('Owner fehlt'));
  assert.ok(t.triage.includes('Priorität fehlt'));
  assert.ok(t.triage.includes('Nächster Schritt fehlt'));
  assert.ok(t.triage.includes('Bereich fehlt'));
  assert.equal(t.areaGroup, 'sonstiges');
});

test('normalizeTask ordnet Bereiche der Portfolioebene zu', () => {
  assert.equal(normalizeTask(issue({ labels: ['area:google'] }), { now: NOW }).areaGroup, 'ads');
  assert.equal(normalizeTask(issue({ labels: ['area:produktseite'] }), { now: NOW }).areaGroup, 'shop');
  assert.equal(normalizeTask(issue({ labels: ['area:backend'] }), { now: NOW }).areaGroup, 'technik');
});

test('attentionScore liefert Punkte mit Begruendung', () => {
  const tasks = [
    normalizeTask(issue({ number: 42, title: '[SHP-023] Kanal', labels: ['status:blockiert', 'reviewer:mensch', 'priority:p0', 'area:google'], updated_at: '2026-09-03T00:00:00Z' }), { now: NOW }),
    normalizeTask(issue({ number: 41, title: '[SHP-015] Zuordnung', labels: ['status:geplant', 'priority:p1', 'area:produktseite'], body: '## Abhängigkeiten\nSHP-023' }), { now: NOW }),
    normalizeTask(issue({ number: 7, labels: ['status:geplant', 'priority:p3', 'area:seo'] }), { now: NOW }),
  ];
  const s = attentionScore(tasks[0], tasks, { now: NOW });
  assert.ok(s.score >= 50 + 40 + 8, `score ${s.score}`);
  assert.ok(s.reasons.includes('P0 kritisch'));
  assert.ok(s.reasons.includes('wartet auf Freigabe'));
  assert.ok(s.reasons.some(r => r.startsWith('hält 1 andere Aufgabe')));
  const list = attentionList(tasks, { now: NOW, limit: 5 });
  assert.equal(list[0].task.number, 42);
  assert.equal(list.length, 2, "P3 ohne weitere Gruende erscheint nicht");
});

test('Uebergaenge erzwingen Owner, Grund und Akzeptanzkriterien', () => {
  const planned = normalizeTask(issue({ labels: ['status:geplant', 'priority:p2', 'area:google'] }), { now: NOW });
  assert.deepEqual(requirementsFor(planned, 'in-arbeit'), ['Owner (Assignee) zuordnen']);
  assert.deepEqual(requirementsFor(planned, 'in-arbeit', { owner: 'ahmet' }), []);
  assert.match(requirementsFor(planned, 'fertig')[0], /nicht vorgesehen/);
  const working = normalizeTask(issue({ labels: ['status:in-arbeit', 'priority:p2', 'area:google'], assignee: 'ahmet', body: '## Akzeptanzkriterien\n- [x] a\n- [ ] b' }), { now: NOW });
  assert.deepEqual(requirementsFor(working, 'review'), ['Ergebnis oder Checkliste als Kommentar angeben']);
  assert.deepEqual(requirementsFor(working, 'review', { comment: 'PR #5 fertig' }), []);
  assert.match(requirementsFor(working, 'fertig')[0], /1\/2/);
  assert.deepEqual(requirementsFor(working, 'fertig', { confirmAcceptance: true }), []);
  assert.match(requirementsFor(working, 'blockiert')[0], /Blocker-Grund/);
  assert.match(requirementsFor(working, 'abgebrochen')[0], /Begründung/);
  assert.match(requirementsFor(working, 'unbekannt')[0], /Unbekannter Status/);
});

test('labelChangesFor: Uebergangsregel ohne status:freigabe-Label, Schliessen bei Erledigt', () => {
  const working = normalizeTask(issue({ labels: ['status:in-arbeit', 'priority:p2', 'area:google'], assignee: 'ahmet' }), { now: NOW });
  const legacy = labelChangesFor(working, 'freigabe', { hasLabel: l => l !== 'status:freigabe' });
  assert.deepEqual(legacy.add, ['status:blockiert', 'reviewer:mensch']);
  assert.deepEqual(legacy.remove, ['status:in-arbeit']);
  assert.match(legacy.note, /Übergangsregel/);
  const modern = labelChangesFor(working, 'freigabe');
  assert.deepEqual(modern.add, ['status:freigabe']);
  assert.equal(modern.note, null);
  const done = labelChangesFor(working, 'fertig');
  assert.equal(done.close, true);
  const approved = normalizeTask(issue({ labels: ['status:blockiert', 'reviewer:mensch', 'priority:p0', 'area:google'] }), { now: NOW });
  const back = labelChangesFor(approved, 'bereit');
  assert.ok(back.remove.includes('reviewer:mensch'), 'Legacy-Marker wird entfernt');
});

test('summarize, areaHealth, freshness und gespeicherte Ansichten', () => {
  const tasks = [
    normalizeTask(issue({ number: 1, labels: ['status:blockiert', 'priority:p0', 'area:google'], body: '## Blocker\nAPI-Key' }), { now: NOW }),
    normalizeTask(issue({ number: 2, labels: ['status:in-arbeit', 'priority:p1', 'area:produktseite'], updated_at: '2026-08-20T00:00:00Z' }), { now: NOW }),
    normalizeTask(issue({ number: 3, state: 'closed', labels: ['status:fertig', 'priority:p2', 'area:seo'], closed_at: '2026-09-06T00:00:00Z' }), { now: NOW }),
    normalizeTask(issue({ number: 4, labels: ['status:blockiert', 'reviewer:mensch', 'priority:p1', 'area:backend'] }), { now: NOW }),
  ];
  const s = summarize(tasks, { now: NOW });
  assert.equal(s.open, 3);
  assert.equal(s.critical, 1);
  assert.equal(s.blocked, 1);
  assert.equal(s.approvals, 1);
  assert.equal(s.doneThisWeek, 1);
  assert.equal(s.unassigned, 3);
  const health = areaHealth(tasks, { now: NOW });
  const ads = health.find(a => a.key === 'ads');
  assert.equal(ads.level, 'kritisch');
  assert.ok(ads.reasons.includes('1 P0 offen'));
  const shop = health.find(a => a.key === 'shop');
  assert.equal(shop.level, 'achtung');
  assert.equal(freshness('2026-09-08T11:50:00Z', { now: NOW }).level, 'frisch');
  assert.equal(freshness('2026-09-08T04:00:00Z', { now: NOW }).level, 'veraltet');
  assert.equal(freshness(null).level, 'unbekannt');
  const view = k => SAVED_VIEWS.find(v => v.key === k);
  assert.deepEqual(tasks.filter(t => view('stale').filter(t, {})).map(t => t.number), [2]);
  assert.deepEqual(tasks.filter(t => view('freigabe').filter(t, {})).map(t => t.number), [4]);
  assert.ok(matchesQuery(tasks[0], 'api-key'));
  assert.ok(!matchesQuery(tasks[0], 'nirgends'));
});
