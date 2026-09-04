import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeContextPack, classifyClaudeRequest, prepareClaudeBridge } from '../core/claude-bridge.mjs';

test('bridge classifies ordinary implementation as a low-risk compact handoff', async () => {
  const result = await prepareClaudeBridge({
    taskId: 'bridge 1', task: 'Repariere den kleinen CSS-Abstand im Warenkorb.', outputDir: '/tmp/claude-bridge-fixture',
    execute: async () => ({ text: 'Prüfe zuerst die bestehende CSS-Regel.', route: { model: 'fixture/model:free' }, usage: { costUsd: 0 }, attempts: [] }),
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.policy.modelRequirement.class, 'LIGHT');
  assert.match(result.handoffPath, /BRIDGE-1\.md$/);
});

test('bridge keeps protected requests out of both model and Claude execution', async () => {
  let invoked = false;
  const result = await prepareClaudeBridge({ task: 'Veröffentliche das Live Theme', execute: async () => { invoked = true; } });
  assert.equal(result.status, 'HUMAN_GATE');
  assert.equal(invoked, false);
});

test('context pack contains the task and constraints but no hidden source context', () => {
  const classified = classifyClaudeRequest({ task: 'Analysiere die Navigation' });
  const content = buildClaudeContextPack({ classified, policy: { modelRequirement: { class: 'LIGHT', effortLevel: 'low' }, autonomyLevel: 'FULL' }, analysis: 'Kurzbefund' });
  assert.match(content, /Analysiere die Navigation/);
  assert.match(content, /keine Shopify-Live-Veröffentlichung/i);
});

test('design and optimization requests are implementation work, not cheap analysis', () => {
  const result = classifyClaudeRequest({ task: 'Gestalte das Mega Menu für mobile Ansicht schöner und verbessere die Titel.' });
  assert.equal(result.taskType, 'IMPLEMENTATION');
});

test('a short retry prompt without any action verb keeps a forced original task type', () => {
  const unforced = classifyClaudeRequest({ task: 'Versuch es erneut. Letztes Mal hat das Analysebudget nicht gereicht.' });
  assert.equal(unforced.taskType, 'ANALYSIS');
  const forced = classifyClaudeRequest({ task: 'Versuch es erneut. Letztes Mal hat das Analysebudget nicht gereicht.', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(forced.taskType, 'IMPLEMENTATION');
});

test('an invalid or missing forceTaskType falls back to text classification', () => {
  const result = classifyClaudeRequest({ task: 'Analysiere die Navigation', forceTaskType: 'NOT_A_REAL_TYPE' });
  assert.equal(result.taskType, 'ANALYSIS');
});

// Realer Vorfall (Lauf ROUTER-SELF-CHECK-1, 2026-09-04): Der Auftrag lautete
// "Analysiere ... Verbesserungsmoeglichkeiten ... Nur lesen, nichts aendern".
// Das Substantiv "Verbesserungsmoeglichkeiten" traf die Verb-Wortliste, der
// Lauf startete mit --permission-mode auto und veraenderte Dateien.
test('a noun that merely contains an action verb never turns a read-only task into a writing run', () => {
  const result = classifyClaudeRequest({ task: 'Analysiere den Code auf konkrete Verbesserungsmoeglichkeiten. Nur lesen, nichts aendern.' });
  assert.equal(result.taskType, 'ANALYSIS');
  assert.equal(result.taskTypeSource, 'READ_ONLY_INTENT');
});

test('an explicitly declared task type always beats the word list', () => {
  const declaredRead = classifyClaudeRequest({ task: 'Gestalte das Mega Menu schöner und optimiere die Titel.', declaredTaskType: 'ANALYSIS' });
  assert.equal(declaredRead.taskType, 'ANALYSIS');
  assert.equal(declaredRead.taskTypeSource, 'DECLARED');
  const declaredWrite = classifyClaudeRequest({ task: 'Sieh dir die Navigation an.', declaredTaskType: 'IMPLEMENTATION' });
  assert.equal(declaredWrite.taskType, 'IMPLEMENTATION');
  // Die Deklaration schlaegt auch einen uebernommenen Typ aus einem Vorlauf.
  const declaredBeatsInherited = classifyClaudeRequest({ task: 'Versuch es erneut.', declaredTaskType: 'ANALYSIS', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(declaredBeatsInherited.taskType, 'ANALYSIS');
});

// Von der unabhaengigen Codex-Pruefung gefunden: der geerbte Typ eines
// Implementierungs-Laufs schlug frueher das Lese-Veto. Ein Folgebefehl
// "Nur lesen, nichts aendern" waere damit trotzdem schreibend ausgefuehrt worden.
test('an explicitly read-only follow-up beats the inherited implementation type', () => {
  const result = classifyClaudeRequest({ task: 'Nur lesen und berichten, nichts ändern.', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(result.taskType, 'ANALYSIS');
  assert.equal(result.taskTypeSource, 'READ_ONLY_INTENT');
  // Eine ausdrueckliche Deklaration darf das Veto weiterhin ueberstimmen.
  const declared = classifyClaudeRequest({ task: 'Nur lesen und berichten, nichts ändern.', declaredTaskType: 'IMPLEMENTATION', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(declared.taskType, 'IMPLEMENTATION');
  assert.equal(declared.taskTypeSource, 'DECLARED');
});

test('read-only intent is recognized in several natural German phrasings', () => {
  for (const task of [
    'Pruefe die Filteransicht, aendere nichts.',
    'Analysiere die Navigation und veraendere keine Dateien.',
    'Sieh dir das an, ohne Aenderungen vorzunehmen.',
    'Nur pruefen bitte.',
  ]) {
    assert.equal(classifyClaudeRequest({ task }).taskType, 'ANALYSIS', task);
  }
});

// JS-\b ist ASCII-basiert und greift vor einem Umlaut nicht; reale Auftraege
// kommen ausserdem oft ohne Umlaute herein.
test('protected operations stay HIGH with and without German umlauts', () => {
  for (const task of [
    'Ändere die SKU von Produkt X', 'Aendere die SKU von Produkt X',
    'Ändere die Varianten des Teppichs', 'Aendere die Varianten des Teppichs',
    'Passe die Steuer-Einstellungen an', 'Veroeffentliche das Theme',
    'Loesche das Produkt', 'Lösche das Produkt',
    'Merge den Branch nach main', 'Pushe die Aenderung',
  ]) {
    assert.equal(classifyClaudeRequest({ task }).risk, 'HIGH', task);
  }
});

test('deleting ordinary code is not a protected business deletion', () => {
  assert.equal(classifyClaudeRequest({ task: 'Loesche die tote CSS-Regel im Snippet.' }).risk, 'LOW');
});

test('risk can only escalate on a repeat run, never be silently downgraded', () => {
  const stillHigh = classifyClaudeRequest({ task: 'Versuch es erneut.', previousRisk: 'HIGH' });
  assert.equal(stillHigh.risk, 'HIGH');
  const staysLow = classifyClaudeRequest({ task: 'Versuch es erneut.', previousRisk: 'LOW' });
  assert.equal(staysLow.risk, 'LOW');
  const escalatesOnItsOwnText = classifyClaudeRequest({ task: 'Ändere den Preis der Kollektion.', previousRisk: null });
  assert.equal(escalatesOnItsOwnText.risk, 'HIGH');
});
