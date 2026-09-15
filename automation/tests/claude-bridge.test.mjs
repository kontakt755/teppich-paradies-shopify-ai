import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeContextPack, classifyClaudeRequest, prepareClaudeBridge } from '../core/claude-bridge.mjs';

// Realer Vorfall 2026-09-11: eine Wissensfrage (woertlich, ohne Fragezeichen,
// mit Zeilenumbruechen) traf "erstell" und "lösch" in IMPLEMENTATION_TERMS und
// lief als Implementierungsauftrag durch drei Codex-Runden. Die Einstufung wird
// bewusst NICHT ueber Wortmuster korrigiert: eine Probe am 2026-09-11 ueber 485
// echte Nutzerprompts haette 36 davon auf "Frage" gekippt, darunter klare
// Auftraege - die Aenderung waere still ausgefallen. Stattdessen sieht der
// Reviewer bei leerem Diff die Schlussantwort des Agenten
// (reviewCandidateFromStop in review-scope.mjs) und kann den No-op bestaetigen.
// Dieser Test haelt fest, dass die Einstufung dafuer unveraendert bleibt.
test('der woertliche Lexware-Prompt bleibt IMPLEMENTATION/HEURISTIC wie auf origin/main', () => {
  const task = 'welche funktionen hast du alles mit lexware api \n\nich hab bei chatgpt schon eingestellt angebote erstellen \nbearbeiten geht aber nicht zum beispiel oder löschen \n\nwie ist dein funktionsumfang';
  const result = classifyClaudeRequest({ task });
  assert.equal(result.taskType, 'IMPLEMENTATION');
  assert.equal(result.taskTypeSource, 'HEURISTIC');
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

// Wortliste und trennbare Verben (2026-09-15).
//
// ANALYSIS ist der Rueckfall, wenn kein Wort trifft - jede Luecke in der Liste
// ist deshalb ein STILLER Leerlauf: Der Lauf startet im Lesemodus, meldet
// "completed" und schreibt nichts. Eine Messung an neun alltaeglichen
// Auftraegen ergab fuenf solche Faelle.
//
// Der haerteste war "Lege die Datei docs/probe.md an": Das trennbare Verb
// stand als "leg an" am Stueck in der Liste, und der Dateiname enthaelt Punkte,
// an denen die Satzgrenze falsch erkannt wurde.
for (const auftrag of [
  'Lege die Datei docs/probe.md an.',
  'Lege eine neue Section fuer die Startseite an.',
  'Ergaenze einen Hinweis in der README.',
  'Benenne den Block tp-alt in tp-neu um.',
  'Verschiebe die Preislogik in ein Snippet.',
  'Fuege dem Formular ein Pflichtfeld hinzu.',
  'Trage den neuen Wert in die Konfiguration ein.',
  'Aktualisiere die Versandschwelle im Theme.',
  'Ersetze den alten Filter durch den neuen.',
]) {
  test(`schreibender Auftrag wird als Umsetzung erkannt: ${auftrag}`, () => {
    assert.equal(classifyClaudeRequest({ taskId: 'T', task: auftrag }).taskType, 'IMPLEMENTATION');
  });
}

// Die Gegenrichtung ist genauso wichtig: Ein zu weites Muster wuerde Fragen und
// Analysen schreibend ausfuehren. "Lege dar, welche Optionen es gibt" ist die
// Falle - Verbstamm "leg" und spaeter ein "an" im Text.
for (const auftrag of [
  'Analysiere die Startseite und berichte.',
  'Welche Produkte haben kein Bild?',
  'Erklaere mir, wie der Router funktioniert.',
  'Lege dar, welche Optionen es gibt.',
  'Pruefe den Aufbau. Und nenne die Ursachen an dieser Stelle.',
]) {
  test(`lesender Auftrag bleibt Analyse: ${auftrag}`, () => {
    assert.equal(classifyClaudeRequest({ taskId: 'T', task: auftrag }).taskType, 'ANALYSIS');
  });
}

// Das ausdrueckliche Veto schlaegt auch die neuen Muster.
test('ausdrueckliches "nichts aendern" schlaegt die erweiterte Wortliste', () => {
  const result = classifyClaudeRequest({ taskId: 'T', task: 'Lege dir die Struktur zurecht an, aber aendere nichts.' });
  assert.equal(result.taskType, 'ANALYSIS');
  assert.equal(result.taskTypeSource, 'READ_ONLY_INTENT');
});

// Umfangsbegrenzung ist kein Leseverbot (2026-09-15, an einem echten Lauf
// gefunden). "Aendere SONST nichts" heisst "aendere nichts ANDERES" - der
// Auftrag lief trotzdem vollstaendig im Lesemodus und schrieb nichts.
//
// Das ist heikler als eine Luecke in der Verbliste: Solche Saetze haengt man
// an, wenn man einen Auftrag ENG halten will. Sorgfaeltiges Formulieren wurde
// damit bestraft.
for (const auftrag of [
  'Ergaenze eine Zeile in CLAUDE.md. Aendere sonst nichts.',
  'Korrigiere den Tippfehler. Sonst nichts aendern.',
  'Fuege das Feld hinzu und aendere darueber hinaus nichts.',
  'Repariere den Zaehler, aber aendere sonst keine Dateien.',
  'Setze den Wert auf 5. Weiter nichts aendern.',
  'Erstelle die Datei. Aendere ansonsten nichts.',
  'Lege die Datei docs/x.md an, sonst nichts aendern.',
]) {
  test(`Umfangsbegrenzung kippt den Auftrag nicht: ${auftrag}`, () => {
    assert.equal(classifyClaudeRequest({ taskId: 'T', task: auftrag }).taskType, 'IMPLEMENTATION');
  });
}

// Die Gegenrichtung ist die eigentliche Gefahr: Ein zu weit gefasster Fix
// wuerde Pruefauftraege schreibend ausfuehren. "Pruefe die Struktur und aendere
// sonst nichts" enthaelt eine Einschraenkung UND ein verneintes "aendere" -
// ohne das Herausschneiden der verneinten Stelle kippte genau dieser Fall.
for (const auftrag of [
  'Pruefe die Struktur und aendere nichts.',
  'Nur lesen, nichts aendern.',
  'Analysiere den Aufbau, ohne etwas zu aendern.',
  'Schau dir das an, aber aendere keine Dateien.',
  'Pruefe die Struktur und aendere sonst nichts.',
  'Untersuche den Fehler, aendere aber nichts.',
  'Berichte ueber den Aufbau. Aendere sonst nichts.',
]) {
  test(`echtes Leseverbot bleibt Analyse: ${auftrag}`, () => {
    assert.equal(classifyClaudeRequest({ taskId: 'T', task: auftrag }).taskType, 'ANALYSIS');
  });
}
