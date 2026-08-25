import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyProviderOutput, createLazyProviderDetector, decideProviderSwitch,
  detectCapability, detectProviders, resolveRole, runRole, PROVIDER_STATUS,
} from '../providers/index.mjs';
import { extractAgentResult } from '../providers/parse-result.mjs';
import * as claudeCode from '../providers/claude-code.mjs';
import * as codex from '../providers/codex.mjs';
import { normalizeAgentResult, redactSecrets, toCycleStatus } from '../agent-result.mjs';

const proc = (overrides = {}) => ({
  command: 'x', args: [], startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z',
  exitCode: 0, signal: null, timedOut: false, spawnError: null, stdout: '', stderr: '', ...overrides,
});

test('capability detection marks a missing CLI as UNAVAILABLE and never installs it', () => {
  const capability = detectCapability({
    command: 'claude',
    requiredFlags: ['--print'],
    run: () => proc({ exitCode: null, spawnError: { name: 'Error', code: 'ENOENT', message: 'not found' } }),
  });
  assert.equal(capability.status, PROVIDER_STATUS.UNAVAILABLE);
  assert.match(capability.reason, /nicht im PATH/);
});

test('capability detection rejects a CLI without the required non-interactive flag', () => {
  const capability = detectCapability({
    command: 'claude',
    requiredFlags: ['--print'],
    run: () => proc({ stdout: 'Usage: claude [options]\n  --interactive  only interactive mode\n' }),
  });
  assert.equal(capability.status, PROVIDER_STATUS.UNAVAILABLE);
  assert.deepEqual(capability.missingFlags, ['--print']);
});

test('capability detection reports AUTH_REQUIRED instead of pretending availability', () => {
  const capability = detectCapability({ command: 'codex', requiredFlags: ['exec'], run: () => proc({ exitCode: 1, stderr: 'Error: not logged in. Run codex login.' }) });
  assert.equal(capability.status, PROVIDER_STATUS.AUTH_REQUIRED);
});

test('capability detection accepts a usable CLI', () => {
  const claude = claudeCode.detect({ run: () => proc({ stdout: 'Usage: claude\n  --print   print response and exit\n' }), probeAuth: false });
  const codexCapability = codex.detect({ run: () => proc({ stdout: 'Usage: codex\n  exec   run non-interactively\n' }), probeAuth: false });
  assert.equal(claude.status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(claude.provider, 'CLAUDE_CODE');
  assert.equal(codexCapability.status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(codexCapability.provider, 'CODEX');
});

test('an installed but unauthenticated CLI is AUTH_REQUIRED, not AVAILABLE', () => {
  // Regression: `--help` gelingt auch ohne Login. Ohne Statusabfrage waere der
  // Provider faelschlich AVAILABLE und der fehlende Login taeuchte erst
  // mitten im Agentenlauf als diffuses FAILED auf.
  const result = claudeCode.detect({
    run: (_command, args) => args.includes('--help')
      ? proc({ stdout: 'Usage: claude\n  --print   print response and exit\n' })
      : proc({ stdout: '{"loggedIn":false}' }),
  });
  assert.equal(result.status, PROVIDER_STATUS.AUTH_REQUIRED);
  assert.match(result.reason, /nicht angemeldet/);
});

test('logged-in CLIs stay AVAILABLE after token-free status checks', () => {
  const result = claudeCode.detect({
    run: (_cmd, args) => proc({
      stdout: args.includes('--help') ? 'Usage: claude\n  --print   print response and exit\n' : '{"loggedIn":true}',
    }),
  });
  const codexResult = codex.detect({
    run: (_cmd, args) => proc({
      stdout: args.includes('--help') ? 'Usage: codex\n  exec   run non-interactively\n' : 'Logged in using ChatGPT',
    }),
  });
  assert.equal(result.status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(codexResult.status, PROVIDER_STATUS.AVAILABLE);
});

test('provider detection uses login status commands and never starts a model', () => {
  const seenClaude = [];
  claudeCode.detect({
    run: (_cmd, args) => {
      seenClaude.push(args);
      return proc({ stdout: args.includes('--help') ? 'Usage: claude\n  --print\n' : '{"loggedIn":true}' });
    },
  });
  const seenCodex = [];
  codex.detect({
    run: (_cmd, args) => {
      seenCodex.push(args);
      return proc({ stdout: args.includes('--help') ? 'Usage: codex\n  exec\n' : 'Logged in using ChatGPT' });
    },
  });
  assert.deepEqual(seenClaude[1], ['auth', 'status']);
  assert.deepEqual(seenCodex[1], ['login', 'status']);
  assert.ok(seenClaude.every(args => !args.includes('--print')), 'Detection startet keinen Claude-Modelllauf');
  assert.ok(seenCodex.every(args => !args.includes('exec')), 'Detection startet keinen Codex-Agentenlauf');
});

test('lazy provider detection checks only the requested provider and reuses it in one run', () => {
  const commands = [];
  const detector = createLazyProviderDetector({
    run: (command, args) => {
      commands.push({ command, args });
      return proc({ stdout: args.includes('--help') ? 'Usage: claude\n  --print\n' : '{"loggedIn":true}' });
    },
  });
  assert.equal(detector.get('CLAUDE_CODE').status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(detector.get('CLAUDE_CODE').status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(commands.length, 2, 'ein Help- und ein Login-Status-Aufruf, danach Cache-Hit');
  assert.ok(commands.every(call => call.command === 'claude'), 'Codex wird nicht vorsorglich geprueft');
});

test('provider adapters never request unrestricted permissions', () => {
  const claudeArgs = claudeCode.buildArgs({ mode: 'READ_ONLY' });
  const claudeWrite = claudeCode.buildArgs({ mode: 'WRITE' });
  assert.ok(claudeArgs.includes('--print'));
  assert.ok(claudeArgs.includes('plan'), 'read-only laeuft im Planmodus');
  assert.ok(!claudeArgs.join(' ').includes('Bash'));
  assert.ok(!claudeWrite.join(' ').includes('--dangerously-skip-permissions'));
  assert.ok(!claudeWrite.join(' ').includes('bypassPermissions'), 'niemals alle Rechte');
  assert.ok(claudeWrite.includes('acceptEdits'), 'schreibend braucht acceptEdits, sonst passiert nichts');
  // Regression: --allowed-tools ist variadisch. Ein Prompt-Argument dahinter
  // wuerde verschluckt; der Prompt geht deshalb ueber stdin.
  assert.ok(!claudeWrite.includes('p'), 'kein Prompt in den Argumenten');

  const codexRead = codex.buildArgs({ prompt: 'p', mode: 'READ_ONLY' });
  const codexWrite = codex.buildArgs({ prompt: 'p', mode: 'WRITE' });
  assert.ok(codexRead.includes('read-only'));
  assert.ok(codexWrite.includes('workspace-write'));
  assert.ok(!codexWrite.includes('danger-full-access'));
});

test('output classification separates rate limits, auth and upstream errors', () => {
  assert.equal(classifyProviderOutput({ exitCode: 1, stderr: 'HTTP 429 rate limit' }), PROVIDER_STATUS.RATE_LIMITED);
  assert.equal(classifyProviderOutput({ exitCode: 1, stderr: 'unauthorized' }), PROVIDER_STATUS.AUTH_REQUIRED);
  assert.equal(classifyProviderOutput({ exitCode: 1, stderr: 'HTTP 503 service unavailable' }), 'BLOCKED');
  assert.equal(classifyProviderOutput({ exitCode: null, timedOut: true }), 'TIMEOUT');
  assert.equal(classifyProviderOutput({ exitCode: 0, stdout: 'ok' }), PROVIDER_STATUS.AVAILABLE);
});

test('F) a 429 never authorises an automatic provider switch', () => {
  const detected = { CODEX: { status: PROVIDER_STATUS.AVAILABLE }, CLAUDE_CODE: { status: PROVIDER_STATUS.AVAILABLE } };
  const decision = decideProviderSwitch({ currentProvider: 'CODEX', result: { status: 'RATE_LIMITED' }, attempts: 3, maxAttempts: 3, detected });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'RATE_LIMIT_NO_SWITCH');

  for (const status of ['TIMEOUT', 'BLOCKED', 'AUTH_REQUIRED', 'SECURITY_STOP']) {
    assert.equal(decideProviderSwitch({ currentProvider: 'CODEX', result: { status }, attempts: 3, maxAttempts: 3, detected }).allowed, false, status);
  }
});

test('a provider switch is only allowed after exhausted attempts on a real defect', () => {
  const detected = { CODEX: { status: PROVIDER_STATUS.AVAILABLE }, CLAUDE_CODE: { status: PROVIDER_STATUS.AVAILABLE } };
  assert.equal(decideProviderSwitch({ currentProvider: 'CODEX', result: { status: 'FAILED' }, attempts: 1, maxAttempts: 3, detected }).allowed, false);
  const allowed = decideProviderSwitch({ currentProvider: 'CODEX', result: { status: 'FAILED' }, attempts: 3, maxAttempts: 3, detected });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.target, 'CLAUDE_CODE');

  const unavailableTarget = decideProviderSwitch({
    currentProvider: 'CODEX', result: { status: 'FAILED' }, attempts: 3, maxAttempts: 3,
    detected: { ...detected, CLAUDE_CODE: { status: PROVIDER_STATUS.UNAVAILABLE } },
  });
  assert.equal(unavailableTarget.allowed, false);
  assert.equal(unavailableTarget.reason, 'TARGET_UNAVAILABLE');
});

test('E) an unavailable provider yields a clean UNAVAILABLE result, not a fallback', () => {
  const result = runRole({
    role: 'CODEX_LIGHT', agentRole: 'IMPLEMENTER', prompt: 'p',
    detected: { CODEX: { status: PROVIDER_STATUS.UNAVAILABLE, reason: 'codex ist nicht im PATH' } },
    run: () => { throw new Error('provider must not be started'); },
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.provider, 'CODEX');
  assert.equal(result.retryable, false);
  assert.match(result.blockers.join(' '), /nicht im PATH/);
});

test('SCRIPT role is not a model provider', () => {
  assert.deepEqual(resolveRole('SCRIPT'), { provider: null, model: null });
  const result = runRole({ role: 'SCRIPT', agentRole: 'IMPLEMENTER', prompt: 'p', detected: {} });
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.blockers.join(' '), /deterministisches Script/);
});

test('detectProviders never throws even when an adapter misbehaves', () => {
  const detected = detectProviders({ run: () => { throw new Error('boom'); } });
  // NEMOTRON ist ein HTTP-Adapter und ruft `run` in detect() gar nicht auf -
  // ohne NVIDIA_API_KEY in der Testumgebung ist AUTH_REQUIRED die korrekte,
  // nicht abgestuerzte Antwort. Der eigentliche Test bleibt: kein Absturz.
  for (const entry of Object.values(detected)) assert.ok(['UNAVAILABLE', 'FAILED', 'AUTH_REQUIRED'].includes(entry.status));
});

test('detectProviders can limit checks to providers needed by the current phase', () => {
  const commands = [];
  const detected = detectProviders({
    providers: ['CODEX'],
    run: (command, args) => {
      commands.push(command);
      return proc({ stdout: args.includes('--help') ? 'Usage: codex\n  exec\n' : 'Logged in using ChatGPT' });
    },
  });
  assert.deepEqual(Object.keys(detected), ['CODEX']);
  assert.ok(commands.every(command => command === 'codex'));
});

test('agent results are only accepted from an explicit result block', () => {
  const marked = extractAgentResult('bla bla\n<<<AGENT_RESULT>>>\n{"status":"PASS","summary":"ok"}\n<<<END_AGENT_RESULT>>>');
  assert.equal(marked.status, 'PASS');
  const fenced = extractAgentResult('text\n```json\n{"status":"FINDINGS","findings":[]}\n```\n');
  assert.equal(fenced.status, 'FINDINGS');
  const bare = extractAgentResult('noise {"status":"PASS","summary":"x"} tail');
  assert.equal(bare.status, 'PASS');
  assert.equal(extractAgentResult('kein resultat hier'), null);
  assert.equal(extractAgentResult(''), null);
});

test('a chatty agent without a result block is never treated as PASS', () => {
  const result = runRole({
    role: 'CODEX_LIGHT', agentRole: 'IMPLEMENTER', prompt: 'p',
    detected: { CODEX: { status: PROVIDER_STATUS.AVAILABLE } },
    run: () => proc({ exitCode: 0, stdout: 'Fertig! Habe alles erledigt.' }),
  });
  assert.equal(result.status, 'FAILED');
  assert.match(result.blockers.join(' '), /AGENT_RESULT/);
});

test('agent results are normalised, bounded and secret-free', () => {
  const result = normalizeAgentResult({
    provider: 'CODEX', role: 'IMPLEMENTER', status: 'pass',
    summary: 'Token shpat_abcdefghijklmnop wurde geloggt',
    changedFiles: ['a.mjs', '', 'b.mjs'],
    findings: [{ priority: 'nonsense', file: 'x' }],
    tests: { status: 'PASS', passed: 3, failed: 0 },
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.changedFiles, ['a.mjs', 'b.mjs']);
  assert.ok(!result.summary.includes('shpat_'));
  assert.match(result.summary, /REDACTED/);
  assert.equal(result.findings[0].priority, 'P2');
  assert.equal(result.findings[0].recommendedFix, 'ohne Vorschlag');
  assert.equal(normalizeAgentResult({ status: 'was-auch-immer' }).status, 'FAILED');
  // Der Platzhalter beginnt mit einer spitzen Klammer und kann daher kein
  // echter Key sein. redactSecrets erfasst ihn trotzdem, weil dessen
  // Zeichenklasse spitze Klammern zulaesst. Die Secret-Scan-Regel
  // GENERIC_API_KEY erwartet dagegen nur Buchstaben, Ziffern, Unterstrich und
  // Bindestrich und schlaegt hier bewusst nicht an.
  const fakeKeyLine = 'api_key: <not-a-real-key-placeholder>';
  const redactedKeyLine = redactSecrets(fakeKeyLine);
  assert.ok(!redactedKeyLine.includes('<not-a-real-key-placeholder>'));
  assert.match(redactedKeyLine, /REDACTED/);
});

test('cycle status mapping never turns a blocked agent into a pass', () => {
  assert.equal(toCycleStatus({ status: 'PASS' }), 'PASS');
  assert.equal(toCycleStatus({ status: 'FINDINGS' }), 'PASS');
  assert.equal(toCycleStatus({ status: 'RATE_LIMITED' }), 'BLOCKED');
  assert.equal(toCycleStatus({ status: 'UNAVAILABLE' }), 'BLOCKED');
  assert.equal(toCycleStatus({ status: 'SECURITY_STOP' }), 'SECURITY_STOP');
  assert.equal(toCycleStatus({ status: 'FAILED' }), 'HARD_FAIL');
});
