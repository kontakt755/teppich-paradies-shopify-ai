import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError, buildComment } from '../../../scripts/dashboard-api.mjs';

/** Fake-gh: merkt sich Aufrufe, liefert Issue/Labels/User. */
function fakeGh({ issue, labels = ['status:geplant', 'status:in-arbeit', 'status:review', 'status:blockiert', 'status:fertig', 'reviewer:mensch'], user = 'tobias' } = {}) {
  const calls = [];
  const gh = async args => {
    calls.push(args);
    const a = args.join(' ');
    if (a === 'api user --jq .login') return `${user}\n`;
    if (/api --paginate repos\/.*\/labels/.test(a)) return JSON.stringify(labels.map(name => ({ name })));
    if (/^api repos\/[^ ]+\/issues\/\d+$/.test(a)) return JSON.stringify(issue);
    if (/issues\/\d+\/events/.test(a)) return JSON.stringify([{ event: 'labeled', label: { name: 'status:in-arbeit' }, actor: { login: 'tobias' }, created_at: '2026-09-07T10:00:00Z' }]);
    if (/issues\/\d+\/comments/.test(a)) return JSON.stringify([{ body: 'Hallo <!-- tp-control-center -->', user: { login: 'tobias' }, created_at: '2026-09-07T11:00:00Z' }]);
    return '';
  };
  return { gh, calls };
}

const baseIssue = (over = {}) => ({
  number: 41, title: '[SHP-015] Live-Collection-Zuordnungen', state: 'open', html_url: 'https://github.com/x/y/issues/41',
  labels: [{ name: 'status:geplant' }, { name: 'priority:p1' }, { name: 'area:produktseite' }],
  assignee: null, assignees: [], comments: 0,
  body: '## Akzeptanzkriterien\n- [ ] Nur belegte Zuordnungen\n- [ ] Preise unverändert\n\n## Nächster Schritt\nIDs genehmigen',
  created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z', closed_at: null, ...over,
});

function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-api-')); }

test('capabilities meldet lokalen Modus mit Nutzer und Labels', async () => {
  const { gh } = fakeGh({});
  const api = createApi({ gh, root: tmpRoot() });
  const c = await api.capabilities();
  assert.equal(c.mode, 'local');
  assert.equal(c.user, 'tobias');
  assert.equal(c.actions, true);
  assert.ok(c.labelsAvailable.includes('status:geplant'));
});

test('transition lehnt fehlende Pflichtangaben serverseitig ab', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  await assert.rejects(() => api.transition(41, { target: 'in-arbeit' }), e => e instanceof ApiError && e.status === 400 && e.extra.missing[0].includes('Owner'));
  await assert.rejects(() => api.transition(41, { target: 'fertig' }), e => e.status === 400 && /nicht vorgesehen/.test(e.extra.missing[0]));
  await assert.rejects(() => api.transition(41, { target: 'unsinn' }), e => e.status === 400);
  assert.ok(!calls.some(c => c[0] === 'issue' && c[1] === 'edit'), 'kein Schreibzugriff bei Ablehnung');
});

test('transition setzt Labels, Assignee und Kommentar und protokolliert', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const root = tmpRoot();
  let rebuilt = 0;
  const api = createApi({ gh, root, rebuild: async () => { rebuilt += 1; } });
  const r = await api.transition(41, { target: 'in-arbeit', owner: 'ahmet' });
  assert.equal(r.ok, true);
  assert.equal(r.to, 'in-arbeit');
  const edit = calls.find(c => c[0] === 'issue' && c[1] === 'edit');
  assert.ok(edit.includes('--remove-label') && edit.includes('status:geplant'));
  assert.ok(edit.includes('--add-label') && edit.includes('status:in-arbeit'));
  assert.ok(edit.includes('--add-assignee') && edit.includes('ahmet'));
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /Control Center: Status Geplant → In Arbeit/);
  assert.match(comment[comment.length - 1], /Owner: @ahmet/);
  assert.equal(rebuilt, 1, 'issues.json wird nach dem Schreiben neu erzeugt');
  const audit = fs.readFileSync(path.join(root, '.router/control-center-audit.jsonl'), 'utf8');
  assert.match(audit, /"action":"transition"/);
});

test('transition nach Freigabe nutzt die Uebergangsregel, wenn status:freigabe fehlt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:in-arbeit' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  const r = await api.transition(41, { target: 'freigabe', reason: 'Scopes write_products freigeben?' });
  assert.deepEqual(r.labels.add, ['status:blockiert', 'reviewer:mensch']);
  assert.match(r.note, /Übergangsregel/);
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /write_products/);
});

test('Freigabe erteilen: Legacy-Marker wird entfernt, Entscheidung im Kommentar benannt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:blockiert' }, { name: 'reviewer:mensch' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  const r = await api.transition(41, { target: 'bereit', decision: 'approve', reason: 'Option 2' });
  assert.equal(r.from, 'freigabe');
  const edit = calls.find(c => c[0] === 'issue' && c[1] === 'edit');
  assert.ok(edit.includes('reviewer:mensch'), 'Legacy-Marker entfernt');
  const comment = calls.find(c => c[0] === 'issue' && c[1] === 'comment');
  assert.match(comment[comment.length - 1], /Freigabe erteilt/);
});

test('Erledigt schliesst das Issue nur mit Bestaetigung', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue({ labels: [{ name: 'status:review' }, { name: 'priority:p1' }, { name: 'area:produktseite' }], assignee: { login: 'ahmet' }, assignees: [{ login: 'ahmet' }] }) });
  const api = createApi({ gh, root: tmpRoot() });
  await assert.rejects(() => api.transition(41, { target: 'fertig' }), e => /0\/2/.test(e.extra.missing[0]));
  await api.transition(41, { target: 'fertig', confirmAcceptance: true });
  assert.ok(calls.some(c => c[0] === 'issue' && c[1] === 'close'));
});

test('assign und comment schreiben ueber gh; ohne Login gesperrt', async () => {
  const { gh, calls } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  await api.assign(41, { owner: '@ahmet' });
  assert.ok(calls.some(c => c.includes('--add-assignee') && c.includes('ahmet')));
  await assert.rejects(() => api.comment(41, { body: '  ' }), e => e.status === 400);
  await api.comment(41, { body: 'Rückfrage: welche IDs?', decision: 'question' });
  assert.match(calls.at(-1).at(-1), /Rückfrage/);
  const noUser = createApi({ gh: fakeGh({ issue: baseIssue(), user: '' }).gh, root: tmpRoot() });
  await assert.rejects(() => noUser.comment(41, { body: 'x' }), e => e.status === 403);
});

test('activityForTask mischt Events und Kommentare, erkennt Control-Center-Kommentare', async () => {
  const { gh } = fakeGh({ issue: baseIssue() });
  const api = createApi({ gh, root: tmpRoot() });
  const a = await api.activityForTask(41);
  assert.equal(a.events.length, 2);
  assert.equal(a.events[0].type, 'Control Center');
  assert.match(a.events[1].text, /status:in-arbeit/);
});

test('agentRuns liest Steuerzentrale-State und Ledger read-only', () => {
  const dir = tmpRoot();
  fs.writeFileSync(path.join(dir, 'dashboard-state.json'), JSON.stringify({ current: null, history: [{ id: 'DASH-1', state: 'PASS', task: 'Mega Menu', issue: { number: 92, title: 'Mega Menu' }, startedAt: '2026-09-04T05:00:00Z', finishedAt: '2026-09-04T05:10:00Z', result: { status: 'PASS', costUsd: 0.42, summary: 'Fertig', findings: [{}, {}] } }] }));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, `${JSON.stringify({ timestamp: '2026-09-08T13:26:06Z', provider: 'GEMINI_FREE', model: 'g', usage: { costUsd: 0 } })}\n${JSON.stringify({ timestamp: '2026-09-08T12:00:00Z', provider: 'OPENROUTER', model: 'x', usage: { costUsd: 0.05 } })}\n`);
  const api = createApi({ gh: async () => '', root: dir, stateDir: dir, ledgerPath: ledger });
  const r = api.agentRuns();
  assert.equal(r.runs.length, 1);
  assert.equal(r.runs[0].issue.number, 92);
  assert.equal(r.runs[0].findings, 2);
  assert.equal(r.usage.requests, 2);
  assert.equal(r.usage.last.provider, 'GEMINI_FREE');
});

test('buildComment traegt Marker und Actor', () => {
  const c = buildComment({ actor: 'tobias', heading: 'Kommentar', text: 'Hallo' });
  assert.match(c, /^## Control Center: Kommentar/);
  assert.match(c, /@tobias/);
  assert.match(c, /tp-control-center/);
});
