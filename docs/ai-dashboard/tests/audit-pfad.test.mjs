import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// Auch ohne den Teststarter (rohes `node --test`) darf kein Servertest ins echte Audit schreiben.
test('Testumgebung lenkt das Audit-Protokoll in den Wegwerfordner', () => {
  assert.equal(process.env.TP_AUDIT_PATH, path.join(PRIVAT_DIR, 'control-center-audit.jsonl'));
});
