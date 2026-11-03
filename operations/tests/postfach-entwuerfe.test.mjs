import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bekannt, gesendetZaehlen, liesMessung, messungPfad, nachDerMail, pruefeZeile, uebernehmen, vergleichen, zahlen } from '../lib/postfach-entwuerfe.mjs';
import { merkeEntwurf, spurPfad } from '../lib/routine-wache.mjs';
import { auftragPfad, entwuerfeBremsePfad, entwuerfeOrdner, ENTWUERFE_LABELS, liesStatus, sperrPfad } from '../lib/routinen.mjs';
import { main as lauf } from '../scripts/claude-lauf.mjs';
import { main as skript } from '../scripts/postfach-entwuerfe.mjs';

// Montag 26.10.2026, 10:00 Uhr in Berlin - im Zeitfenster.
const IM_FENSTER = new Date('2026-10-26T09:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-entwuerfe-'));
const TEXT = 'Guten Tag,\n\nvielen   Dank.\n\nMit freundlichen Grüßen\nTeppich Paradies';
const zeile = (o = {}) => ({ datum: '2026-10-26', mailId: 'aaaaaa1', threadId: 'bbbbbb1', klasse: 'E1', stufe: 'ENTWURF', entwurf: false, vertrauen: 0.8, ...o });
const spur = (privat, mailId, body = TEXT) => merkeEntwurf({ tool_name: 'mcp__claude_ai_Gmail__create_draft', tool_input: { replyToMessageId: mailId, body } }, { privat });

test('Messzeile: nur bekannte Felder, Stufe folgt der Klasse, kein Inhalt', () => {
  const { zeile: z } = pruefeZeile({ ...zeile(), betreff: 'Geheim', text: 'Kundentext' });
  assert.ok(!JSON.stringify(z).includes('Geheim') && !JSON.stringify(z).includes('Kundentext'));
  assert.match(pruefeZeile(zeile({ klasse: 'K3' })).fehler, /Klasse/);
  assert.match(pruefeZeile(zeile({ klasse: 'N1', stufe: 'ENTWURF' })).fehler, /Stufe/);
  assert.match(pruefeZeile(zeile({ klasse: 'K1', stufe: 'ENTWURF' })).fehler, /Stufe/);
  assert.equal(pruefeZeile(zeile({ klasse: 'F5', stufe: 'NUR-MENSCH' })).zeile.stufe, 'NUR-MENSCH');
  assert.equal(pruefeZeile(zeile({ klasse: 'F6', stufe: 'NICHT-ANTWORTEN' })).zeile.klasse, 'F6');
  assert.equal(pruefeZeile(zeile({ klasse: 'X1', stufe: 'NICHT-ANTWORTEN' })).zeile.klasse, 'X1');
  assert.match(pruefeZeile(zeile({ vertrauen: 2 })).fehler, /vertrauen/);
  assert.match(pruefeZeile(zeile({ grund: 'frei erfunden' })).fehler, /grund/);
  assert.match(pruefeZeile(zeile({ mailId: 'x y' })).fehler, /mailId/);
});

test('Uebernehmen: Entwurf zaehlt nach der Spur der Wache, Bekanntes nur einmal, Rechte 0600', () => {
  const privat = tmp();
  spur(privat, 'aaaaaa1');
  const r = uebernehmen(privat, [zeile({ entwurf: true }), zeile({ mailId: 'aaaaaa2', entwurf: true }), zeile({ klasse: 'X' })], IM_FENSTER);
  assert.deepEqual([r.neu, r.abweichungen, r.abgelehnt.length], [2, 1, 1]);
  const m = liesMessung(privat);
  assert.deepEqual(m.map(z => z.entwurf), [true, false], 'ohne Spur kein Entwurf, auch wenn Claude es behauptet');
  assert.equal(fs.statSync(messungPfad(privat)).mode & 0o777, 0o600);
  assert.equal(uebernehmen(privat, [zeile()], IM_FENSTER).neu, 0);
  assert.deepEqual(bekannt(privat), { mailIds: ['aaaaaa1', 'aaaaaa2'], threadsMitEntwurf: ['bbbbbb1'] });
  fs.appendFileSync(messungPfad(privat), '{kaputt\n');
  assert.throws(() => liesMessung(privat), 'kaputt nie still als leer');
});

test('Zahlen je Klasse und Stufe; Antwort nach dem Entwurf per Kennung', async () => {
  const privat = tmp();
  spur(privat, 'aaaaaa1');
  uebernehmen(privat, [zeile(), zeile({ mailId: 'aaaaaa2', threadId: 'bbbbbb2', klasse: 'N1', stufe: 'NUR-MENSCH', vertrauen: 0.5 })], IM_FENSTER);
  const m = liesMessung(privat);
  const z = zahlen(m);
  assert.deepEqual([z.mails, z.entwuerfe], [2, 1]);
  assert.deepEqual(z.klassen.E1, { mails: 1, entwuerfe: 1, vertrauen: 0.8 });
  assert.deepEqual(z.stufen, { ENTWURF: 1, 'NUR-MENSCH': 1 });
  assert.equal(nachDerMail(['aaaaaa0'], 'aaaaaa1'), false, 'frueher gesendet zaehlt nicht');
  assert.equal(nachDerMail(['aaaaaa2'], 'aaaaaa1'), true);
  let suchen = null;
  const r = await gesendetZaehlen(m, { zugang: {}, suchen: async (_, s) => { suchen = s; return [['aaaaab0']]; } });
  assert.deepEqual(suchen, [{ thread: 'bbbbbb1', roh: 'in:sent' }], 'nur Verlaeufe mit Entwurf');
  assert.deepEqual(r, { gesendet: 1, jeKlasse: { E1: 1 } });
});

test('Vergleichen: Anfang wie Entwurf = unveraendert, auch mit Signatur und Zitat dahinter', () => {
  const privat = tmp();
  spur(privat, 'aaaaaa1');
  spur(privat, 'aaaaaa2');
  uebernehmen(privat, [zeile(), zeile({ mailId: 'aaaaaa2', klasse: 'E2' })], IM_FENSTER);
  const r = vergleichen(privat, [
    { mailId: 'aaaaaa1', text: `${TEXT.replace('   ', ' ')}\n\nAm 26.10. schrieb Kunde:\n> Frage` },
    { mailId: 'aaaaaa2', text: 'Guten Tag,\n\nvielen Dank für alles.\n\nMit freundlichen Grüßen\nTeppich Paradies' },
    { mailId: 'ffffff1', text: 'x' },
  ]);
  assert.deepEqual([r.geprueft, r.unveraendert, r.geaendert, r.ohneSpur], [2, 1, 1, 1]);
  assert.deepEqual(r.jeKlasse.E2, { unveraendert: 0, geaendert: 1 });
});

test('Skript: auswerten ohne Postfach und bekannt geben nur Zahlen und Kennungen aus', async () => {
  const privat = tmp();
  uebernehmen(privat, [zeile()], IM_FENSTER);
  const a = [];
  await skript(['auswerten', '--ohne-postfach'], { privat, aus: t => a.push(t) });
  const j = JSON.parse(a[0]);
  assert.equal(j.mails, 1);
  assert.match(j.unveraendertGesendet, /vergleichen/);
  await skript(['bekannt'], { privat, aus: t => a.push(t) });
  assert.deepEqual(JSON.parse(a[1]).mailIds, ['aaaaaa1']);
  await assert.rejects(skript(['nix'], { privat, aus: () => {} }), /Befehl/);
});

// --- Ablauf im Dienst -----------------------------------------------------------

function umgebung({ labels = true } = {}) {
  const root = tmp();
  const privat = path.join(root, 'privat');
  fs.mkdirSync(path.dirname(auftragPfad(privat, 'postfach-entwuerfe')), { recursive: true });
  fs.writeFileSync(auftragPfad(privat, 'postfach-entwuerfe'), `Auftrag ${'x'.repeat(150)}\nABSCHLUSS: eine Zeile.\n`);
  fs.mkdirSync(entwuerfeOrdner(privat), { recursive: true });
  if (labels) fs.writeFileSync(path.join(entwuerfeOrdner(privat), 'labels.json'), JSON.stringify({ [ENTWUERFE_LABELS[0]]: 'Label_85', [ENTWUERFE_LABELS[1]]: 'Label_83' }));
  fs.mkdirSync(path.join(root, 'dienst'));
  return { privat, env: { TP_PRIVAT_DIR: privat, TP_DIENST_DIR: path.join(root, 'dienst'), TP_CLAUDE_BIN: '/bin/false', PATH: process.env.PATH } };
}

const antwort = (result, denials = []) => ({ exitCode: 0, signal: null, zeitlimit: false, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, usage: { input_tokens: 5 }, permission_denials: denials, result }) });

function abhaengig(u, o = {}) {
  const starts = [];
  return {
    starts,
    deps: {
      env: u.env, jetzt: IM_FENSTER, aus: () => {}, melde: o.melde || (() => {}), nachziehenAktiv: () => false, mcpSperren: async () => [],
      entwuerfeAbfragen: o.abfragen || (async () => ({ gefunden: ['aaaaaa1'] })),
      starte: async (bin, args) => { starts.push(args); return o.starte ? o.starte(args) : antwort('neu 1'); },
    },
  };
}

test('Lauf: ohne neue Kennung kein Claude; neue Mail startet, Sperre wird freigegeben', async () => {
  const u = umgebung();
  const a = abhaengig(u, { abfragen: async () => ({ gefunden: [] }) });
  assert.equal(await lauf(['postfach-entwuerfe'], a.deps), 0);
  assert.equal(a.starts.length, 0);
  assert.equal(liesStatus(u.privat, 'postfach-entwuerfe').meldung, 'nichts Neues (Vorprüfung ohne KI)');
  const b = abhaengig(u, { starte: () => { uebernehmen(u.privat, [zeile()]); return antwort('neu 1'); } });
  assert.equal(await lauf(['postfach-entwuerfe'], b.deps), 0);
  assert.equal(b.starts.length, 1);
  assert.match(b.starts[0].at(-1), /Label_85/);
  assert.equal(liesStatus(u.privat, 'postfach-entwuerfe').ok, true);
  assert.ok(!fs.existsSync(sperrPfad(u.privat, 'postfach-entwuerfe')));
  // Dieselbe Kennung steht jetzt in der Messung: kein neuer Start.
  const c = abhaengig(u);
  assert.equal(await lauf(['postfach-entwuerfe'], c.deps), 0);
  assert.equal(c.starts.length, 0);
});

test('Lauf: Bremse ueberspringt, auch mit --erzwingen, ohne Stoerung', async () => {
  const u = umgebung();
  fs.writeFileSync(entwuerfeBremsePfad(u.privat), '');
  let abgefragt = 0;
  const a = abhaengig(u, { abfragen: async () => { abgefragt += 1; return { gefunden: ['aaaaaa1'] }; } });
  assert.equal(await lauf(['postfach-entwuerfe'], a.deps), 0);
  assert.equal(await lauf(['postfach-entwuerfe', '--erzwingen'], a.deps), 0);
  assert.deepEqual([a.starts.length, abgefragt], [0, 0]);
  const s = liesStatus(u.privat, 'postfach-entwuerfe');
  assert.equal(s.ok, true);
  assert.match(s.meldung, /Bremse aktiv/);
});

test('Lauf: ausserhalb der Zeit nichts; Vorpruefung kaputt oder Labels fehlen: Stoerung, kein Claude', async () => {
  const u = umgebung();
  const a = abhaengig(u);
  assert.equal(await lauf(['postfach-entwuerfe'], { ...a.deps, jetzt: new Date('2026-11-01T10:00:00Z') }), 0);
  assert.equal(a.starts.length, 0);
  const mitteilungen = [];
  const b = abhaengig(u, { abfragen: async () => ({ fehler: 'IMAP: weg' }), melde: t => mitteilungen.push(t) });
  assert.equal(await lauf(['postfach-entwuerfe'], b.deps), 1);
  assert.equal(b.starts.length, 0);
  assert.equal(liesStatus(u.privat, 'postfach-entwuerfe').art, 'vorpruefung');
  assert.equal(mitteilungen.length, 1);
  const o = umgebung({ labels: false });
  const c = abhaengig(o);
  assert.equal(await lauf(['postfach-entwuerfe'], c.deps), 1);
  assert.equal(c.starts.length, 0);
  assert.equal(liesStatus(o.privat, 'postfach-entwuerfe').art, 'labels-fehlen');
});

test('Lauf: keine Zeile in der Messung trotz neuer Mail ist Stoerung; abgelehntes Senden auch', async () => {
  const u = umgebung();
  const a = abhaengig(u);
  assert.equal(await lauf(['postfach-entwuerfe'], a.deps), 1);
  assert.equal(liesStatus(u.privat, 'postfach-entwuerfe').art, 'nicht-uebernommen');
  const v = umgebung();
  const b = abhaengig(v, { starte: () => { uebernehmen(v.privat, [zeile()]); return antwort('neu 1', [{ tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: {} }]); } });
  assert.equal(await lauf(['postfach-entwuerfe'], b.deps), 1);
  assert.equal(liesStatus(v.privat, 'postfach-entwuerfe').art, 'abgelehnt');
});

test('Spurdatei liegt privat im Ordner des Laufs', () => {
  assert.equal(path.dirname(spurPfad('/p')), entwuerfeOrdner('/p'));
});
