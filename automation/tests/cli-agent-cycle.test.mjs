import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeWorkPrompt, buildCodexReviewPrompt, describeClaudeActivities, parseReviewResult, runCliAgentCycle, runCodexReview } from '../core/cli-agent-cycle.mjs';

test('worker and reviewer prompts require the complete test-review-correct cycle', () => {
  assert.match(buildClaudeWorkPrompt('Fix'), /teste erneut/i);
  assert.match(buildClaudeWorkPrompt('Fix', [{ priority: 'P1' }]), /CODEX-BEFUNDE/);
  assert.match(buildCodexReviewPrompt('Fix'), /uncommitteten Änderungen/);
  assert.match(buildCodexReviewPrompt('Fix'), /verändere keine Dateien/);
});

test('runCodexReview stays strictly read-only and never routes through workspace-write approvals', () => {
  let capturedArgs = null;
  const io = {
    mkdirSync: () => {},
    readFileSync: () => JSON.stringify({ status: 'PASS', summary: 'ok', findings: [] }),
  };
  const spawn = (command, args) => {
    capturedArgs = args;
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = runCodexReview({ taskText: 'Fix', io, spawn });
  assert.equal(capturedArgs.includes('--sandbox'), true);
  assert.equal(capturedArgs[capturedArgs.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(capturedArgs.includes('--approve-for-me'), false);
  assert.equal(capturedArgs.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewer, 'CODEX');
});

test('review parser accepts only explicit terminal decisions', () => {
  assert.equal(parseReviewResult('{"status":"PASS","summary":"ok","findings":[]}').status, 'PASS');
  assert.throws(() => parseReviewResult('{"status":"MAYBE","findings":[]}'));
  assert.throws(() => parseReviewResult('not json'));
});

test('Claude stream events become compact safe dashboard activities', () => {
  assert.deepEqual(describeClaudeActivities({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'snippets/card.liquid' } }] } }), [{ kind: 'Read', message: 'Liest Datei: snippets/card.liquid' }]);
  assert.match(describeClaudeActivities({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'API_KEY=sk-ant-secret npm test' } }] } })[0].message, /\[geschützt\]/);
});

test('unattended loop stops high-risk work before spawning an agent', async () => {
  let spawned = false;
  const result = await runCliAgentCycle({ task: 'Veröffentliche das Live-Theme', spawn: () => { spawned = true; } });
  assert.equal(result.status, 'HUMAN_GATE');
  assert.equal(spawned, false);
});

test('unattended loop retries with bounded API auth after subscription limit', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fixture-api-key';
  const authModes = [];
  const argsByMode = {};
  const events = [];
  const spawn = (_command, args, options) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    const mode = options.env.ANTHROPIC_API_KEY ? 'API' : 'SUBSCRIPTION';
    authModes.push(mode);
    argsByMode[mode] = args;
    if (mode === 'SUBSCRIPTION') return { status: 1, stdout: '', stderr: 'Usage limit reached; resets later' };
    return { status: 0, stdout: JSON.stringify({ result: 'implemented', usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 }), stderr: '' };
  };
  try {
    const result = await runCliAgentCycle({
      task: 'Repariere einen kleinen lokalen Testfehler',
      spawn,
      review: () => ({ status: 'PASS', findings: [] }),
      recordUsage: () => {},
      onState: event => events.push(event),
    });
    assert.equal(result.status, 'PASS');
    assert.equal(result.authMode, 'API');
    assert.equal(result.authAttempts[0].mode, 'SUBSCRIPTION');
    assert.equal(result.authAttempts[0].status, 'LIMIT_REACHED');
    assert.match(result.authAttempts[0].reason, /usage limit reached/i);
    assert.deepEqual(result.authAttempts[1], { mode: 'API', status: 'PASS' });
    assert.match(result.fallbackReason, /usage limit reached/i);
    assert.deepEqual(authModes, ['SUBSCRIPTION', 'API']);
    assert.equal(argsByMode.SUBSCRIPTION.includes('--max-budget-usd'), false);
    assert.equal(argsByMode.API[argsByMode.API.indexOf('--max-budget-usd') + 1], '1');
    assert.ok(events.some(event => event.status === 'ROUTED'));
    assert.ok(events.some(event => event.status === 'FALLBACK' && event.provider === 'Claude API Backup'));
    assert.ok(events.some(event => event.status === 'REVIEW'));
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test('a generic program/config error (e.g. api_error) never triggers the paid API fallback', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fixture-api-key';
  const authModes = [];
  const spawn = (_command, args, options) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    authModes.push(options.env.ANTHROPIC_API_KEY ? 'API' : 'SUBSCRIPTION');
    return { status: 1, stdout: JSON.stringify({ is_error: true, subtype: 'api_error', terminal_reason: 'api_error', result: 'Ein interner Fehler ist aufgetreten.' }), stderr: '' };
  };
  try {
    await assert.rejects(() => runCliAgentCycle({ task: 'Repariere einen kleinen lokalen Testfehler', spawn, review: () => ({ status: 'PASS', findings: [] }), recordUsage: () => {} }));
    assert.deepEqual(authModes, ['SUBSCRIPTION']);
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test('a technical Codex review failure never discards a completed Claude result and never re-spawns Claude', async () => {
  let claudeCalls = 0;
  const spawn = (_command, args) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    claudeCalls += 1;
    return { status: 0, stdout: JSON.stringify({ result: 'Fertig implementiert', usage: {}, total_cost_usd: 0 }), stderr: '' };
  };
  const result = await runCliAgentCycle({
    task: 'Repariere einen kleinen lokalen Testfehler',
    spawn,
    review: () => { throw new Error("codex exited with status 2: the argument '--sandbox <SANDBOX_MODE>' cannot be used with '--approve-for-me'"); },
    recordUsage: () => {},
  });
  assert.equal(result.status, 'REVIEW_INFRA_FAILED');
  assert.equal(result.result, 'Fertig implementiert');
  assert.match(result.reviewError, /--approve-for-me/);
  assert.equal(claudeCalls, 1);
});

// Von der unabhaengigen Codex-Pruefung gefunden: jeder P1/P2-Befund loeste
// automatisch eine weitere Claude-Runde aus - auch ueber das kostenpflichtige
// API-Backup und auch dann, wenn der Befund gar nicht zwingend richtig ist.
test('automatic correction rounds stop after one paid API round instead of spending three', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fixture-api-key';
  let apiWorkerCalls = 0;
  const finding = () => ({ priority: 'P1', file: 'automation/x.mjs', problem: 'Ein Problem', reason: 'Ein Grund', recommendedFix: 'Ein Fix' });
  const spawn = (_command, args, options) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    if (!options.env.ANTHROPIC_API_KEY) return { status: 1, stdout: '', stderr: 'Usage limit reached; resets later' };
    apiWorkerCalls += 1;
    return { status: 0, stdout: JSON.stringify({ result: 'ueber API erledigt', usage: {}, total_cost_usd: 0.13 }), stderr: '' };
  };
  try {
    const result = await runCliAgentCycle({
      task: 'Repariere einen kleinen lokalen Testfehler',
      spawn, recordUsage: () => {}, guardsEnabled: false, maxReviewRounds: 3,
      review: () => ({ status: 'CHANGES_REQUIRED', findings: [finding()] }),
    });
    assert.equal(result.status, 'PARKED');
    assert.equal(result.reason, 'API_CORRECTION_LIMIT');
    // Erster Lauf plus genau eine bezahlte Korrektur - nicht drei.
    assert.equal(apiWorkerCalls, 2);
    // Das bereits Erarbeitete bleibt erhalten.
    assert.equal(result.result, 'ueber API erledigt');
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test('correction rounds stay unlimited while the free Pro subscription is doing the work', async () => {
  let workerCalls = 0;
  let reviews = 0;
  const finding = () => ({ priority: 'P1', file: 'automation/x.mjs', problem: 'Ein Problem', reason: 'Ein Grund', recommendedFix: 'Ein Fix' });
  const spawn = (_command, args) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    workerCalls += 1;
    return { status: 0, stdout: JSON.stringify({ result: 'Pro erledigt', usage: {}, total_cost_usd: 0 }), stderr: '' };
  };
  const result = await runCliAgentCycle({
    task: 'Repariere einen kleinen lokalen Testfehler',
    spawn, recordUsage: () => {}, guardsEnabled: false, maxReviewRounds: 3,
    review: () => (++reviews >= 3 ? { status: 'PASS', findings: [] } : { status: 'CHANGES_REQUIRED', findings: [finding()] }),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(workerCalls, 3);
});

test('unattended loop refuses API spending when Pro is not logged in', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'fixture-api-key';
  const calls = [];
  const spawn = (_command, args, options) => {
    if (args[0] === 'auth') { calls.push('AUTH_STATUS'); return { status: 1, stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }), stderr: '' }; }
    calls.push(options.env.ANTHROPIC_API_KEY ? 'API' : 'SUBSCRIPTION');
    return { status: 0, stdout: JSON.stringify({ result: 'implemented', usage: {}, total_cost_usd: 0.01 }), stderr: '' };
  };
  try {
    await assert.rejects(() => runCliAgentCycle({ task: 'Repariere einen kleinen lokalen Testfehler', spawn, review: () => ({ status: 'PASS', findings: [] }), recordUsage: () => {} }), /Pro ist nicht angemeldet/);
    assert.deepEqual(calls, ['AUTH_STATUS']);
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test('subscription analysis uses read-only Haiku with more turns and no artificial dollar cap', async () => {
  const previousFallback = process.env.ANTHROPIC_FALLBACK_API_KEY;
  process.env.ANTHROPIC_FALLBACK_API_KEY = 'fixture-api-key';
  const records = [];
  let claudeArgs = [];
  const spawn = (_command, args) => {
    if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }), stderr: '' };
    claudeArgs = args;
    return {
      status: 1,
      stdout: JSON.stringify({ is_error: true, subtype: 'error_max_turns', terminal_reason: 'max_turns', result: 'Teilbericht', usage: { input_tokens: 20, output_tokens: 5 }, total_cost_usd: 0.002, modelUsage: { 'claude-haiku-test': {} } }),
      stderr: '',
    };
  };
  try {
    const result = await runCliAgentCycle({ task: 'Analysiere die Webseite auf Fehler', spawn, review: () => { throw new Error('must not review a parked result'); }, recordUsage: record => records.push(record) });
    assert.equal(result.status, 'PARKED');
    assert.equal(result.reason, 'MAX_TURNS');
    assert.equal(result.result, 'Teilbericht');
    assert.equal(claudeArgs[claudeArgs.indexOf('--permission-mode') + 1], 'plan');
    assert.equal(claudeArgs[claudeArgs.indexOf('--model') + 1], 'haiku');
    assert.equal(claudeArgs[claudeArgs.indexOf('--max-turns') + 1], '16');
    assert.equal(claudeArgs.includes('--max-budget-usd'), false);
    assert.equal(records[0].usage.costUsd, 0);
  } finally {
    if (previousFallback === undefined) delete process.env.ANTHROPIC_FALLBACK_API_KEY; else process.env.ANTHROPIC_FALLBACK_API_KEY = previousFallback;
  }
});
