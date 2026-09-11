import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeContextPack, classifyClaudeRequest, isPureQuestion, prepareClaudeBridge } from '../core/claude-bridge.mjs';

// Realer Vorfall 2026-09-11: woertlicher Nutzerprompt, ohne Fragezeichen, mit
// Zeilenumbruechen. "erstellen" und "löschen" trafen IMPLEMENTATION_TERMS, der
// Stop-Hook startete Codex-Runden gegen einen vermeintlichen Implementierungsauftrag.
const LEXWARE_PROMPT = 'welche funktionen hast du alles mit lexware api \n\nich hab bei chatgpt schon eingestellt angebote erstellen \nbearbeiten geht aber nicht zum beispiel oder löschen \n\nwie ist dein funktionsumfang';

test('der woertliche Lexware-Prompt ist eine reine Frage, keine Implementierung', () => {
  const result = classifyClaudeRequest({ task: LEXWARE_PROMPT });
  assert.equal(result.taskType, 'ANALYSIS');
  assert.equal(result.taskTypeSource, 'QUESTION');
});

test('Positivkorpus: Fragen mit Implementierungswort sind ANALYSIS/QUESTION', () => {
  for (const task of [
    'Welche Dateien muss ich ändern, um X zu bauen?',
    'Wie kann ich die SKU ändern?',
    'was kostet der router pro tag',
    'Warum hat Codex das Löschen verlangt?',
    'gibt es schon einen Test für den Rechner',
    'ok und wo liegt der Rechner eigentlich',
    'Kurze Frage: wie funktioniert der Fix für den Filter?',
    'Weißt du, warum die Karte grün ist?',
  ]) {
    const result = classifyClaudeRequest({ task });
    assert.equal(result.taskType, 'ANALYSIS', task);
    assert.equal(result.taskTypeSource, 'QUESTION', task);
  }
});

test('Negativkorpus: jede Aufforderung schlaegt die Frage, es bleibt bei IMPLEMENTATION', () => {
  for (const task of [
    'Kannst du den Header ändern?',
    'Ändere die SKU',
    'Aendere die SKU',
    'ja mach das',
    'Warum ist der Filter kaputt? Fix das.',
    'bitte lösche die tote CSS-Regel',
    'Wie ist der Stand? Mach weiter.',
    'kannst du das bitte bauen',
    'Füge den Block tp-card-specs hinzu',
    // weitere Aufforderungsformen neben einer Frage
    'Welche Farbe hat der Button? Ändere sie auf Grün.',
    'Was ist kaputt und fix es',
    'Wie ist der Stand, dann mach weiter',
    'Wie besprochen: ändere den Header.',
    'Könntest du prüfen, ob man das umbauen und die Karte anpassen kann?',
    'Was meinst du, sollten wir den Header ändern?',
    'Ich möchte wissen, was fehlt, und ich möchte, dass du es behebst. Was fehlt?',
  ]) {
    const result = classifyClaudeRequest({ task });
    assert.equal(result.taskType, 'IMPLEMENTATION', task);
    assert.equal(result.taskTypeSource, 'HEURISTIC', task);
  }
});

// Diese beiden stehen im Negativkorpus des Auftrags, trafen aber schon vor der
// Fragenerkennung kein Wort aus IMPLEMENTATION_TERMS ("geändert" hat vor
// "änder" keine Wortgrenze, "grüner wird" ist gar kein Verb der Liste). Die
// Fragenerkennung darf sie nicht anfassen - sie bleiben bei der unveraenderten
// Wortliste. Dass die Wortliste sie nicht als IMPLEMENTATION erkennt, ist eine
// vorbestehende Luecke und nicht Teil dieses Fixes.
test('Aufforderungen ohne Fragesatz bleiben bei der unveraenderten Wortliste', () => {
  for (const task of ['ich möchte, dass die Karte grüner wird', 'Das sollte geändert werden.']) {
    const result = classifyClaudeRequest({ task });
    assert.equal(result.taskTypeSource, 'HEURISTIC', task);
    assert.equal(isPureQuestion(task), false, task);
  }
  // Als Frage formuliert greift das Veto (soll + Partizip, Modal-Bitte).
  assert.equal(isPureQuestion('Sollte das geändert werden?'), false);
  assert.equal(isPureQuestion('Kann man den Header ändern?'), false);
});

test('Fragenerkennung steht nach DECLARED, READ_ONLY_INTENT und INHERITED', () => {
  const inherited = classifyClaudeRequest({ task: 'Was kostet der Router?', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(inherited.taskType, 'IMPLEMENTATION');
  assert.equal(inherited.taskTypeSource, 'INHERITED');
  const declared = classifyClaudeRequest({ task: 'Was kostet der Router?', declaredTaskType: 'IMPLEMENTATION' });
  assert.equal(declared.taskTypeSource, 'DECLARED');
  const readOnly = classifyClaudeRequest({ task: 'Was ist los? Nur lesen, nichts ändern.' });
  assert.equal(readOnly.taskTypeSource, 'READ_ONLY_INTENT');
});

test('eine Frage senkt das Risiko nicht', () => {
  const result = classifyClaudeRequest({ task: 'Wie kann ich die SKU ändern?' });
  assert.equal(result.taskTypeSource, 'QUESTION');
  assert.equal(result.risk, 'HIGH');
});

test('isPureQuestion ist ohne Text false', () => {
  assert.equal(isPureQuestion(''), false);
  assert.equal(isPureQuestion(null), false);
  assert.equal(isPureQuestion('Der Header ist zu groß.'), false);
});

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
