import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const skript = path.resolve(import.meta.dirname, '../../bin/tp');

// Der Orchestrator wird in keinem Test wirklich gestartet: geprueft werden nur
// die Faelle, die vor dem Aufruf abbrechen. Sonst kostete jeder Testlauf echte
// Modellaufrufe.
function ruf(argumente) {
  try {
    const stdout = execFileSync(skript, argumente, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.status, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

test('bin/tp existiert und ist ausfuehrbar', () => {
  assert.ok(fs.existsSync(skript), 'bin/tp fehlt');
  assert.doesNotThrow(() => fs.accessSync(skript, fs.constants.X_OK), 'bin/tp ist nicht ausfuehrbar');
});

test('ohne Argument: Nutzungsmeldung auf stderr, Exit-Code 1', () => {
  const ergebnis = ruf([]);
  assert.equal(ergebnis.code, 1);
  assert.match(ergebnis.stderr, /Aufruf: tp/);
  assert.equal(ergebnis.stdout, '', 'Nutzungsmeldung gehoert auf stderr, nicht auf stdout');
});

test('leerer Aufgabentext startet keinen Lauf', () => {
  const ergebnis = ruf(['   ']);
  assert.equal(ergebnis.code, 1);
  assert.match(ergebnis.stderr, /leer/);
});

// Der Aufgabentext darf nicht am ersten Leerzeichen abgeschnitten werden:
// `tp Mach den Fix` und `tp "Mach den Fix"` muessen denselben Auftrag ergeben.
test('das Skript fasst mehrere Argumente zu einem Aufgabentext zusammen', () => {
  const quelle = fs.readFileSync(skript, 'utf8');
  assert.match(quelle, /AUFGABE="\$\*"/, 'mehrere Argumente werden nicht zusammengefasst');
  assert.match(quelle, /--task "\$AUFGABE"/, 'der Aufgabentext wird nicht als ein Argument uebergeben');
});
