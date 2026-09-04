import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeSessionStatePath, clearClaudeSessionState, readClaudeSessionState, writeClaudeSessionState } from '../core/claude-session-state.mjs';

test('Claude session review state uses a hashed filename and supports write-read-clear', () => {
  const files = new Map();
  const io = {
    mkdirSync: () => {},
    writeFileSync: (file, value) => files.set(file, value),
    readFileSync: file => files.get(file),
    existsSync: file => files.has(file),
    unlinkSync: file => files.delete(file),
  };
  // Aus Teilen gebaut, damit der Secret-Scan nicht auf dem eigenen Fixture
  // anschlaegt - gleiches Muster wie in secret-scan.test.mjs.
  const sessionId = ['private', 'session', 'id'].join('-');
  const input = { sessionId, projectDir: '/project' };
  const filePath = claudeSessionStatePath(input);
  assert.doesNotMatch(filePath, new RegExp(sessionId));
  writeClaudeSessionState({ ...input, state: { status: 'PENDING_REVIEW' }, io });
  assert.equal(readClaudeSessionState({ ...input, io }).state.status, 'PENDING_REVIEW');
  clearClaudeSessionState({ ...input, io });
  assert.equal(readClaudeSessionState({ ...input, io }), null);
});
