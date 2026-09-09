import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, apply, referencedIssues, closingIssues, inferLabels, stripCode, MARKER } from '../../../scripts/task-automation.mjs';
import { parseArgs, run } from '../../../scripts/task.mjs';

const REPO = 'kontakt755/teppich-paradies-shopify-ai';

test('referencedIssues und closingIssues lesen Nummern aus PR-Text', () => {
  assert.deepEqual(referencedIssues('Fix Menü (#92) closes #34, siehe https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/41', REPO), [34, 41, 92]);
  assert.deepEqual(closingIssues('Closes #34 and fixes #12'), [34, 12]);
  assert.deepEqual(referencedIssues('kein bezug', REPO), []);
});

test('Issue-Nummern in Code-Bloecken und Inline-Code sind keine Referenzen', () => {
  const body = 'Zeigt den Brief:\n```\n  #34 Shopify Admin API - P0\n  #120 Dekorfilter\n```\nund `#7` inline. Echt: refs #92';
  assert.deepEqual(referencedIssues(body, REPO), [92]);
  assert.deepEqual(closingIssues('```\nCloses #34\n```\nfixes #12'), [12]);
  assert.equal(stripCode('a `b` c').includes('b'), false);
});

test('inferLabels ist deterministisch und liefert Typ und Bereich', () => {
  assert.deepEqual(inferLabels('Mega Menu mobil kaputt', ''), { type: 'type:bug', area: 'area:navigation' });
  assert.deepEqual(inferLabels('GA4 Conversion Tracking', ''), { type: 'type:technik', area: 'area:google' });
});

test('plan: neues Issue ohne Status -> Eingang mit Vorschlag, geschlossen -> Erledigt', () => {
  const opened = plan({ name: 'issues', payload: { action: 'opened', issue: { number: 5, title: 'Produktseite Text', body: '', labels: [] } } }, { repo: REPO });
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].add, ['status:eingang', 'type:content', 'area:produktseite']);
  assert.match(opened[0].comment, /Priorität fehlt/);
  assert.ok(opened[0].comment.includes(MARKER));
  const labeled = plan({ name: 'issues', payload: { action: 'opened', issue: { number: 5, title: 'x', labels: [{ name: 'status:geplant' }] } } }, { repo: REPO });
  assert.equal(labeled.length, 0, 'mit Status-Label keine Aenderung');
  const closed = plan({ name: 'issues', payload: { action: 'closed', issue: { number: 5, title: 'x', labels: [{ name: 'status:review' }] } } }, { repo: REPO });
  assert.deepEqual(closed[0].add, ['status:fertig']);
  assert.deepEqual(closed[0].remove, ['status:review']);
  const cancelled = plan({ name: 'issues', payload: { action: 'closed', issue: { number: 5, title: 'x', labels: [{ name: 'status:abgebrochen' }] } } }, { repo: REPO });
  assert.equal(cancelled.length, 0, 'abgebrochen bleibt abgebrochen');
});

test('plan: PR referenziert Issue -> In Arbeit, gemergt -> Review ausser bei Closes', () => {
  const pr = { number: 101, title: 'feat: Menü (#92)', body: 'Closes #34', draft: false };
  const opened = plan({ name: 'pull_request', payload: { action: 'opened', pull_request: pr } }, { repo: REPO });
  assert.deepEqual(opened.map(a => a.issue), [34, 92]);
  assert.deepEqual(opened[0].add, ['status:in-arbeit']);
  const merged = plan({ name: 'pull_request', payload: { action: 'closed', pull_request: { ...pr, merged: true } } }, { repo: REPO });
  assert.deepEqual(merged.map(a => a.issue), [92], '#34 wird von GitHub geschlossen und nicht doppelt behandelt');
  assert.deepEqual(merged[0].add, ['status:review']);
  const draft = plan({ name: 'pull_request', payload: { action: 'opened', pull_request: { ...pr, draft: true } } }, { repo: REPO });
  assert.equal(draft.length, 0);
});

test('apply: prueft aktuellen Status, ist idempotent und kommentiert', async () => {
  const calls = [];
  const labelsByIssue = { 92: ['status:review', 'priority:p2'], 34: ['status:geplant'] };
  const gh = async args => {
    calls.push(args);
    const m = args.join(' ').match(/issues\/(\d+)$/);
    if (m) return JSON.stringify({ number: Number(m[1]), labels: labelsByIssue[m[1]].map(name => ({ name })) });
    return '';
  };
  const actions = plan({ name: 'pull_request', payload: { action: 'opened', pull_request: { number: 1, title: 'x #92 #34', body: '', draft: false } } }, { repo: REPO });
  const done = await apply(actions, { gh, repo: REPO });
  assert.deepEqual(done.map(d => d.issue), [34], '#92 im Review wird nicht zurueckgesetzt');
  const edit = calls.find(c => c[0] === 'issue' && c[1] === 'edit');
  assert.ok(edit.includes('status:in-arbeit') && edit.includes('status:geplant'));
  assert.ok(calls.some(c => c[0] === 'issue' && c[1] === 'comment' && c.at(-1).includes(MARKER)));
});

test('task-CLI: parseArgs und Uebergaenge laufen ueber die Aktions-API', async () => {
  assert.deepEqual(parseArgs(['start', '92', '--owner', 'kontakt755', '--confirm']), { positional: ['start', '92'], flags: { owner: 'kontakt755', confirm: true } });
  const seen = [];
  const api = { transition: async (n, p) => { seen.push(['transition', n, p]); return { from: 'geplant', to: p.target, note: null }; }, comment: async (n, p) => { seen.push(['comment', n, p]); } };
  const gh = async args => { seen.push(['gh', args]); return args[1] === 'create' ? 'https://github.com/x/y/issues/7\n' : '[]'; };
  const lines = [];
  await run(['start', '92', '--owner', 'kontakt755', '--note', 'los'], { api, gh, out: l => lines.push(l) });
  assert.equal(seen[0][2].target, 'in-arbeit');
  assert.equal(seen[0][2].owner, 'kontakt755');
  await run(['done', '92', '--confirm'], { api, gh, out: l => lines.push(l) });
  assert.equal(seen[1][2].confirmAcceptance, true);
  await run(['approve', '42', '--note', 'Option 2'], { api, gh, out: l => lines.push(l) });
  assert.deepEqual([seen[2][2].target, seen[2][2].decision], ['bereit', 'approve']);
  await run(['create', 'Neue Aufgabe', '--area', 'google', '--prio', 'p1', '--owner', 'kontakt755'], { api, gh, out: l => lines.push(l) });
  const create = seen.find(s => s[0] === 'gh' && s[1][1] === 'create')[1];
  assert.ok(create.includes('status:eingang') && create.includes('area:google') && create.includes('priority:p1') && create.includes('--assignee'));
  assert.match(lines.at(-1), /issues\/7/);
});
