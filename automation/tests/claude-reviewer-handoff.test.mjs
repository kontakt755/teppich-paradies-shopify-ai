import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildClaudeContextPack, buildReviewerTaskPack, classifyClaudeRequest, prepareClaudeBridge } from '../core/claude-bridge.mjs';

// 2026-09-11: Die Handoff-Datei war zugleich der Pruefauftrag des Reviewers.
// Darin stand die Voranalyse eines kleinen Drittmodells ohne Repository-Zugriff
// ("Claude 3 Opus ist das leistungsfaehigste Modell", "Auf Claude 3 Opus
// umschalten") samt "Typ: IMPLEMENTATION" - auch bei einer reinen Frage. Der
// Reviewer bewertete die Arbeit gegen diesen ungepruefen Plan.
const VORANALYSE = 'Plan:\n- Claude 3 Opus ist das leistungsfaehigste Modell\n- Auf Claude 3 Opus umschalten';

async function bridge(t, task) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-reviewer-handoff-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  return prepareClaudeBridge({
    taskId: 'review pack', task, outputDir,
    execute: async () => ({ text: VORANALYSE, route: { model: 'fixture/flash-lite' }, usage: { costUsd: 0 }, attempts: [] }),
  });
}

test('der Reviewer-Handoff enthaelt Auftrag und Grenzen, aber keinen Voranalyse-Plan', async t => {
  const result = await bridge(t, 'Repariere den kleinen CSS-Abstand im Warenkorb.');
  assert.notEqual(result.reviewTaskPath, result.handoffPath);
  assert.match(result.reviewTaskPath, /REVIEW-PACK\.review\.md$/);
  const reviewer = fs.readFileSync(result.reviewTaskPath, 'utf8');
  assert.match(reviewer, /Repariere den kleinen CSS-Abstand im Warenkorb\./);
  assert.match(reviewer, /keine Shopify-Live-Veröffentlichung/i);
  assert.doesNotMatch(reviewer, /Claude 3 Opus|Plan:/);
  assert.doesNotMatch(reviewer, /Typ: IMPLEMENTATION/);
});

test('der Implementer behaelt die Voranalyse, aber ausdruecklich als ungepruefter Hinweis', async t => {
  const result = await bridge(t, 'Repariere den kleinen CSS-Abstand im Warenkorb.');
  const implementer = fs.readFileSync(result.handoffPath, 'utf8');
  assert.match(implementer, /## Ungeprüfte Voranalyse \(Hinweis, nicht verbindlich\)/);
  assert.match(implementer, /Auf Claude 3 Opus umschalten/);
  assert.doesNotMatch(implementer, /## OpenRouter-Analyse/);
});

// Die Einstufung wird bewusst nicht ueber Wortmuster korrigiert (siehe
// claude-bridge.test.mjs, Lexware-Prompt): Der Reviewer bekommt stattdessen
// keinen Plan vorgesetzt und bei leerem Diff die Schlussantwort des Agenten.
test('der Pruefauftrag nennt keine Router-Einstufung, auch wenn der Auftrag eine Frage ist', () => {
  const pack = buildReviewerTaskPack({ classified: classifyClaudeRequest({ task: 'Welches Modell ist in dieser Sitzung eingestellt?' }) });
  assert.match(pack, /Welches Modell ist in dieser Sitzung eingestellt\?/);
  assert.doesNotMatch(pack, /Typ:|ANALYSIS|IMPLEMENTATION|Risiko/);
  assert.match(pack, /ist ungeprüft und kein Maßstab/);
});

test('beide Packs tragen dieselben verbindlichen Grenzen', () => {
  const classified = classifyClaudeRequest({ task: 'Analysiere die Navigation' });
  const grenze = 'Ändere das Repository nur, soweit der Auftrag es verlangt';
  assert.ok(buildReviewerTaskPack({ classified }).includes(grenze));
  assert.ok(buildClaudeContextPack({ classified, policy: { modelRequirement: { class: 'LIGHT', effortLevel: 'low' }, autonomyLevel: 'FULL' }, analysis: 'Kurzbefund' }).includes(grenze));
});
