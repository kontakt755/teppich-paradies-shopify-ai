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
  const input = { sessionId: 'private-session-id', projectDir: '/project' };
  const filePath = claudeSessionStatePath(input);
  assert.doesNotMatch(filePath, /private-session-id/);
  writeClaudeSessionState({ ...input, state: { status: 'PENDING_REVIEW' }, io });
  assert.equal(readClaudeSessionState({ ...input, io }).state.status, 'PENDING_REVIEW');
  clearClaudeSessionState({ ...input, io });
  assert.equal(readClaudeSessionState({ ...input, io }), null);
});
