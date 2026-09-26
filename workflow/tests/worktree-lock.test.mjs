import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  LOCK_ENV, LOCK_RELATIVE_PATH, acquireWorktreeLock, describeLock, isProcessAlive, lockIsStale, readLock, releaseOnProcessExit,
} from '../worktree-lock.mjs';

const neuerWorktree = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-worktree-lock-'));
// Eigene Umgebung je Fall: acquire schreibt den Token hinein, ein geteiltes
// Objekt wuerde die Faelle voneinander abhaengig machen.
const basis = (root, extra = {}) => ({ root, env: {}, hostname: 'test-rechner', isAlive: () => true, ...extra });
// assert.throws gibt den Fehler nicht zurueck; geprueft werden soll aber der
// Code UND der Text der Meldung.
const faengt = fn => { try { fn(); } catch (error) { return error; } return null; };

test('acquire legt die Sperre an und release entfernt sie wieder', () => {
  const root = neuerWorktree();
  const ziel = path.join(root, LOCK_RELATIVE_PATH);
  const lock = acquireWorktreeLock(basis(root, { label: 'workflow preview', pid: 4242 }));

  assert.equal(fs.existsSync(ziel), true);
  const inhalt = readLock({ root });
  assert.equal(inhalt.pid, 4242);
  assert.equal(inhalt.label, 'workflow preview');
  assert.equal(inhalt.token, lock.token);
  assert.equal(lock.reentrant, false);

  lock.release();
  assert.equal(fs.existsSync(ziel), false);
});

test('ein zweiter Lauf im selben Worktree wird abgewiesen, nicht durchgelassen', () => {
  const root = neuerWorktree();
  acquireWorktreeLock(basis(root, { label: 'workflow live', pid: 111 }));

  const fehler = faengt(() => acquireWorktreeLock(basis(root, { label: 'qa', pid: 222 })));
  assert.ok(fehler, 'zweiter Lauf haette abgewiesen werden muessen');
  assert.equal(fehler.code, 'WORKTREE_BUSY');
  // Die Meldung muss sagen, WER blockiert - sonst bleibt nur Raten.
  assert.match(fehler.message, /workflow live/);
  assert.match(fehler.message, /111/);
});

test('der eigene Kindprozess laeuft durch, statt sich selbst zu blockieren', () => {
  // Genau der Fall aus der Praxis: workflow preview ruft qa/run-qa.mjs auf.
  const root = neuerWorktree();
  const env = {};
  const eltern = acquireWorktreeLock(basis(root, { env, label: 'workflow preview', pid: 111 }));
  assert.equal(env[LOCK_ENV], eltern.token);

  const kind = acquireWorktreeLock(basis(root, { env, label: 'qa', pid: 222 }));
  assert.equal(kind.reentrant, true);

  // Das Kind darf die Sperre der Eltern nicht abraeumen.
  kind.release();
  assert.equal(readLock({ root }).token, eltern.token);
  eltern.release();
  assert.equal(fs.existsSync(path.join(root, LOCK_RELATIVE_PATH)), false);
});

test('ein fremder Token im env gilt nicht als eigener Lauf', () => {
  const root = neuerWorktree();
  acquireWorktreeLock(basis(root, { label: 'workflow live', pid: 111 }));
  const fehler = faengt(() => acquireWorktreeLock(basis(root, { env: { [LOCK_ENV]: 'fremder-token' }, pid: 222 })));
  assert.ok(fehler, 'fremder Token haette abgewiesen werden muessen');
  assert.equal(fehler.code, 'WORKTREE_BUSY');
});

test('eine verwaiste Sperre eines toten Prozesses wird uebernommen', () => {
  const root = neuerWorktree();
  acquireWorktreeLock(basis(root, { label: 'abgestuerzter Lauf', pid: 111 }));

  const lock = acquireWorktreeLock(basis(root, { env: {}, pid: 222, isAlive: () => false }));
  assert.equal(lock.reentrant, false);
  assert.equal(lock.tookOver.pid, 111);
  assert.equal(readLock({ root }).pid, 222);
});

test('eine unlesbare Sperrdatei blockiert den Deploy nicht dauerhaft', () => {
  const root = neuerWorktree();
  fs.mkdirSync(path.join(root, '.workflow'), { recursive: true });
  fs.writeFileSync(path.join(root, LOCK_RELATIVE_PATH), 'kein json {{{');
  const lock = acquireWorktreeLock(basis(root, { pid: 333 }));
  assert.equal(readLock({ root }).pid, 333);
  lock.release();
});

// ---------------------------------------------------------------------------
// lockIsStale: die Entscheidung, ob uebernommen werden darf
// ---------------------------------------------------------------------------

const jetzt = Date.parse('2026-09-26T10:00:00.000Z');
const stunde = 60 * 60 * 1000;
const pruefe = (lock, extra = {}) => lockIsStale(lock, { now: jetzt, hostname: 'test-rechner', isAlive: () => true, staleAfterMs: stunde, ...extra });

test('lockIsStale: lebender Prozess auf demselben Rechner ist nie verwaist', () => {
  const lock = { pid: 1, host: 'test-rechner', startedAt: new Date(jetzt - 10 * stunde).toISOString() };
  // Auch uralt nicht: ein Lauf darf lange dauern, solange er laeuft.
  assert.equal(pruefe(lock), false);
  assert.equal(pruefe(lock, { isAlive: () => false }), true);
});

test('lockIsStale: auf fremdem Rechner entscheidet allein das Alter', () => {
  const frisch = { pid: 1, host: 'anderer-rechner', startedAt: new Date(jetzt - 5 * 60_000).toISOString() };
  const alt = { pid: 1, host: 'anderer-rechner', startedAt: new Date(jetzt - 2 * stunde).toISOString() };
  // Der Prozess ist dort nicht pruefbar - isAlive darf keine Rolle spielen.
  assert.equal(pruefe(frisch, { isAlive: () => false }), false);
  assert.equal(pruefe(alt, { isAlive: () => true }), true);
});

test('lockIsStale: ohne brauchbaren Zeitstempel gilt eine fremde Sperre als verwaist', () => {
  assert.equal(pruefe({ pid: 1, host: 'anderer-rechner' }), true);
  assert.equal(pruefe({ pid: 1, host: 'anderer-rechner', startedAt: 'unsinn' }), true);
  assert.equal(pruefe(null), true);
});

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

test('isProcessAlive erkennt den eigenen Prozess und lehnt Unsinn ab', () => {
  assert.equal(isProcessAlive(process.pid), true);
  for (const wert of [0, -1, null, undefined, 'abc', 1.5]) assert.equal(isProcessAlive(wert), false, String(wert));
});

test('describeLock nennt Label, PID und Startzeit', () => {
  const text = describeLock({ label: 'workflow live', pid: 99, host: 'mac', startedAt: '2026-09-26T10:00:00.000Z' });
  for (const teil of ['workflow live', '99', 'mac', '2026-09-26']) assert.match(text, new RegExp(teil));
  assert.equal(describeLock(null), 'unbekannter Lauf');
});

test('release ist doppelt aufrufbar und raeumt keine fremde Sperre ab', () => {
  const root = neuerWorktree();
  const env = {};
  const lock = acquireWorktreeLock(basis(root, { env, pid: 111 }));
  lock.release();
  // Ein anderer Lauf holt sich die Sperre - der alte release darf sie nicht treffen.
  acquireWorktreeLock(basis(root, { pid: 222 }));
  lock.release();
  assert.equal(readLock({ root }).pid, 222);
});

test('releaseOnProcessExit gibt die Sperre bei Abbruch frei, nicht aber im Kindprozess', () => {
  const root = neuerWorktree();
  const lock = acquireWorktreeLock(basis(root, { pid: 111 }));
  const handler = new Map();
  const onProcess = { once: (name, fn) => handler.set(name, fn), exit: () => {} };

  releaseOnProcessExit(lock, { onProcess });
  for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP']) assert.equal(typeof handler.get(signal), 'function', signal);
  handler.get('SIGINT')();
  assert.equal(fs.existsSync(path.join(root, LOCK_RELATIVE_PATH)), false);

  // Ein wiedereintretender Lauf registriert nichts - sonst raeumte der
  // Kindprozess beim Beenden die Sperre der Eltern ab.
  const leer = new Map();
  releaseOnProcessExit({ reentrant: true, release() { throw new Error('darf nicht aufgerufen werden'); } },
    { onProcess: { once: (name, fn) => leer.set(name, fn), exit: () => {} } });
  assert.equal(leer.size, 0);
});
