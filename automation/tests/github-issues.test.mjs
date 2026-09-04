import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIssueComment, buildIssueTaskContext, buildIssueTitle, createOrReuseIssue, getIssue, inferIssueLabels, listOpenIssues, parseIssueNumber, redactPublicText, synchronizeIssue } from '../dashboard/github-issues.mjs';

test('issue number accepts only positive integer values', () => {
  assert.equal(parseIssueNumber('42'), 42);
  assert.equal(parseIssueNumber(''), null);
  assert.throws(() => parseIssueNumber('4.2'), /gültige/);
});

test('public issue text removes common credentials and email addresses', () => {
  const safe = redactPublicText('Kontakt test@example.com Passwort: geheim API-Key=abc123');
  assert.doesNotMatch(safe, /test@example\.com|geheim|abc123/);
  assert.match(safe, /geschützt/);
});

test('issue list exposes only safe public fields', () => {
  const issues = listOpenIssues({ exec: () => JSON.stringify([{ number: 42, title: 'Fix sk-or-secret', url: 'https://github.test/issues/42', labels: [{ name: 'status:geplant' }] }]) });
  assert.equal(issues[0].number, 42);
  assert.match(issues[0].title, /\[geschützt\]/);
  assert.deepEqual(issues[0].labels, ['status:geplant']);
});

test('new dashboard problem creates one labeled issue without model usage', () => {
  const commands = [];
  const exec = (_command, args) => {
    commands.push(args);
    if (args.includes('list')) return '[]';
    if (args.includes('create')) return 'https://github.com/kontakt755/teppich-paradies-shopify-ai/issues/61\n';
    return '';
  };
  const issue = createOrReuseIssue('Mobilansicht hat einen Fehler im Produktlayout', { exec });
  assert.equal(issue.number, 61);
  assert.equal(issue.created, true);
  assert.match(issue.title, /^🤖 /);
  assert.deepEqual(inferIssueLabels('Mobilansicht hat einen Fehler im Produktlayout'), ['status:in-arbeit', 'type:bug', 'priority:p1', 'area:produktseite']);
  const create = commands.find(args => args.includes('create'));
  assert.ok(create.includes('status:in-arbeit'));
  assert.ok(create.includes('type:bug'));
  assert.match(buildIssueTitle('  Prüfe den Router  '), /Prüfe den Router/);
});

test('same generated title reuses an existing open issue', () => {
  const title = buildIssueTitle('Prüfe den Router');
  const issue = createOrReuseIssue('Prüfe den Router', { exec: (_command, args) => args.includes('list') ? JSON.stringify([{ number: 62, title, url: 'https://github.test/issues/62', labels: [] }]) : assert.fail('must not create a duplicate') });
  assert.equal(issue.number, 62);
  assert.equal(issue.reused, true);
  assert.equal(issue.created, false);
});

test('getIssue loads title and body so an existing issue is never used bare', () => {
  const exec = (_command, args) => {
    assert.ok(args.includes('view'));
    return JSON.stringify({ number: 92, title: 'Mega-Menü überarbeiten', body: 'Bitte die Kategorien im Mega-Menü neu strukturieren.', labels: [], url: 'https://github.test/issues/92' });
  };
  const issue = getIssue(92, { exec });
  assert.equal(issue.number, 92);
  assert.match(issue.title, /Mega-Menü/);
  assert.match(issue.body, /Kategorien/);
});

test('an existing issue supplies task context even when the person adds only a short note', () => {
  const issue = { number: 92, title: 'Mega-Menü überarbeiten', body: 'Bitte die Kategorien im Mega-Menü neu strukturieren.' };
  const context = buildIssueTaskContext(issue, 'Versuch es erneut');
  assert.match(context, /#92/);
  assert.match(context, /Mega-Menü überarbeiten/);
  assert.match(context, /Kategorien im Mega-Menü neu strukturieren/);
  assert.match(context, /Versuch es erneut/);
});

test('successful issue synchronization moves only workflow labels and adds a compact comment', () => {
  const commands = [];
  const exec = (_command, args) => {
    commands.push(args);
    if (args.includes('view')) return JSON.stringify({ labels: [{ name: 'status:in-arbeit' }, { name: 'reviewer:mensch' }, { name: 'priority:p1' }] });
    return '';
  };
  const sync = synchronizeIssue({ issueNumber: 44, state: 'PASS', run: { id: 'DASH-1', message: 'Fertig', result: { authMode: 'SUBSCRIPTION', reviewRound: 1, result: 'Erledigt' } } }, { exec });
  assert.deepEqual(sync, { number: 44, status: 'status:review', reviewer: 'reviewer:codex' });
  const edit = commands.find(args => args.includes('edit'));
  assert.ok(edit.includes('status:in-arbeit'));
  assert.ok(edit.includes('reviewer:mensch'));
  assert.ok(edit.includes('status:review'));
  assert.ok(edit.includes('reviewer:codex'));
  assert.ok(commands.some(args => args.includes('comment')));
  assert.match(buildIssueComment({ id: 'DASH-1', message: 'sk-or-secret' }, 'HUMAN_GATE'), /\[geschützt\]/);
});
