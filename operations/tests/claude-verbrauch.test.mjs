import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  neuerSammler, tageFenster, berlinTag, aufgabenAusBefehl, aufgabeAusBranch, geplanteAufgabe,
} from '../lib/claude-verbrauch.mjs';
import { sammle, findeDateien, projektName, argumente } from '../scripts/claude-verbrauch.mjs';

const JETZT = new Date('2026-10-16T10:00:00Z');
const GEHEIM = 'GEHEIMER-PROMPT-TEXT';

const antwort = (id, zeit, { modell = 'claude-opus-5-5', ausgabe = 10, cacheLesen = 1000, werkzeuge = [], effort = 'xhigh' } = {}) => ({
  type: 'assistant', timestamp: zeit, effort,
  message: {
    id, model: modell,
    usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: cacheLesen, output_tokens: ausgabe },
    content: werkzeuge.length
      ? werkzeuge.map(([wid, befehl]) => ({ type: 'tool_use', id: wid, name: 'Bash', input: { command: befehl } }))
      : [{ type: 'text', text: GEHEIM }],
  },
});
const auftrag = (zeit, text = GEHEIM, extra = {}) => ({ type: 'user', timestamp: zeit, message: { role: 'user', content: text }, ...extra });

test('Fenster und Tage in Berliner Zeit', () => {
  assert.deepEqual(tageFenster(JETZT, 3), ['2026-10-14', '2026-10-15', '2026-10-16']);
  // 23:30 UTC am 15.10. ist in Berlin schon der 16.10.
  assert.equal(berlinTag('2026-10-15T23:30:00Z'), '2026-10-16');
  assert.equal(tageFenster(JETZT).length, 7);
});

test('Aufgaben nur aus npm run task, Branch nur als task/<n>-', () => {
  assert.deepEqual(aufgabenAusBefehl('npm run task -- start 671 --owner x && npm run -s task -- review 672 --note "PR"'), [671, 672]);
  assert.deepEqual(aufgabenAusBefehl('npm run task -- list'), []);
  assert.deepEqual(aufgabenAusBefehl('gh pr view 1279'), []);
  assert.equal(aufgabeAusBranch('task/514-bodenwissen'), 514);
  assert.equal(aufgabeAusBranch('chore/live-theme-nach-1279-20261014'), null, 'PR-Nummern im Branch sind keine Aufgaben');
  assert.equal(geplanteAufgabe('<scheduled-task name="werkbank-abgleich" file="x">'), 'werkbank-abgleich');
  assert.equal(geplanteAufgabe('mach weiter'), null);
});

test('Sammler: doppelte Zeilen einmal, alte Tage nicht, Klassen, Langsitzung, Aufgaben', () => {
  const s = neuerSammler({ jetzt: JETZT, tage: 7 });
  // Interaktive Sitzung: 3 h aktiv in 10-Minuten-Schritten, Aufgabe 671 per npm run task.
  const zeilen = [{ type: 'custom-title', customTitle: 'Verbrauchskachel bauen' }, auftrag('2026-10-15T08:00:00Z', 'hallo', { turnOrigin: 'human' })];
  for (let i = 0; i <= 18; i++) {
    const zeit = new Date(Date.parse('2026-10-15T08:00:00Z') + i * 10 * 60_000).toISOString();
    zeilen.push(antwort(`m${i}`, zeit, { werkzeuge: i === 0 ? [['t0', 'npm run task -- start 671']] : [[`t${i}`, 'ls']] }));
  }
  // Dieselbe Antwort noch einmal (zweiter Inhaltsblock) - zaehlt nicht doppelt.
  zeilen.push(antwort('m0', '2026-10-15T08:00:01Z', { werkzeuge: [['t0', 'npm run task -- start 671']] }));
  // Antwort von vor zwei Wochen - ausserhalb des Fensters.
  zeilen.push(antwort('alt', '2026-10-01T08:00:00Z', { cacheLesen: 9e9 }));
  s.datei({ sitzungId: 'aaaaaaaa-1111', art: 'haupt' }, zeilen);
  // Subagent derselben Sitzung, anderes Modell.
  s.datei({ sitzungId: 'aaaaaaaa-1111', art: 'subagent', agentTyp: 'Explore' }, [antwort('sub1', '2026-10-15T09:00:00Z', { modell: 'claude-haiku-5-5', cacheLesen: 0 })]);
  // Geplante Aufgabe: kurz, Haiku.
  s.datei({ sitzungId: 'bbbbbbbb-2222', art: 'haupt' }, [
    auftrag('2026-10-16T06:00:00Z', '<scheduled-task name="werkbank-abgleich">' + GEHEIM, { turnOrigin: 'scheduled' }),
    antwort('g1', '2026-10-16T06:01:00Z', { modell: 'claude-haiku-5-5', effort: 'medium' }),
  ]);
  // Eine fortgesetzte Sitzung kopiert Antwort m1 mit - sie zaehlt dort nicht noch einmal.
  s.datei({ sitzungId: 'cccccccc-3333', art: 'haupt' }, [antwort('m1', '2026-10-15T08:10:00Z')]);

  const e = s.ergebnis();
  assert.equal(e.summe.sitzungen, 2);
  assert.equal(e.summe.langsitzungen, 1);
  const gross = e.sitzungen[0];
  assert.equal(gross.titel, 'Verbrauchskachel bauen');
  assert.equal(gross.klasse, 'interaktiv');
  assert.equal(gross.aktivMinuten, 180);
  assert.equal(gross.lang, true);
  assert.equal(gross.werkzeugaufrufe, 19, 'Werkzeugaufruf t0 nur einmal');
  assert.equal(gross.subagenten, 1);
  assert.deepEqual(gross.aufgaben, [671]);
  // 19 Antworten Hauptsitzung + 1 Subagent: je 2 + 100 + 1000 + 10, Subagent ohne Cache-Lesen
  assert.equal(gross.tokens.gesamt, 19 * 1112 + 112);
  const geplant = e.sitzungen.find(x => x.klasse === 'geplant');
  assert.equal(geplant.titel, 'werkbank-abgleich', 'ohne eigenen Titel traegt sie den Namen der geplanten Aufgabe');
  assert.equal(geplant.lang, false);
  assert.deepEqual(e.klassen.map(k => k.klasse), ['interaktiv', 'geplant', 'subagent']);
  assert.deepEqual(e.klassen.find(k => k.klasse === 'geplant').effort, [{ stufe: 'medium', antworten: 1 }]);
  assert.deepEqual(e.modelle.map(m => m.modell), ['claude-opus-5-5', 'claude-haiku-5-5']);
  assert.deepEqual(e.aufgaben, [{ nummer: 671, sitzungen: 1, tokens: gross.tokens.gesamt }]);
  assert.deepEqual(e.zuordnung, { mitAufgabe: 1, ohneAufgabe: 1 });
  const tag15 = e.tage.find(t => t.datum === '2026-10-15');
  assert.deepEqual([tag15.sitzungen, tag15.langsitzungen], [1, 1]);
  assert.equal(e.tage.length, 7);
  assert.ok(!JSON.stringify(e).includes(GEHEIM), 'kein Text aus Anfragen oder Antworten');
  assert.ok(!JSON.stringify(e).includes('npm run task'), 'keine Befehle');
});

test('Sammler: ueber 500 Aufrufe ist lang, auch wenn kurz', () => {
  const s = neuerSammler({ jetzt: JETZT });
  const werkzeuge = Array.from({ length: 501 }, (_, i) => [`w${i}`, 'ls']);
  s.datei({ sitzungId: 'dddd', art: 'haupt' }, [antwort('x', '2026-10-16T08:00:00Z', { werkzeuge })]);
  const e = s.ergebnis();
  assert.equal(e.sitzungen[0].werkzeugaufrufe, 501);
  assert.equal(e.sitzungen[0].lang, true);
});

test('Skript: findet Hauptcheckout, Worktrees und Subagenten, schreibt nur Zahlen', async () => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-verbrauch-'));
  const haupt = projektName('/Users/test/teppich');
  const wt = `${haupt}--claude-worktrees-abc`;
  const fremd = projektName('/Users/test/anderes-projekt');
  for (const d of [haupt, wt, fremd]) fs.mkdirSync(path.join(basis, d), { recursive: true });
  const schreibe = (datei, zeilen) => fs.writeFileSync(datei, zeilen.map(z => JSON.stringify(z)).join('\n') + '\n{"abgeschnitten');
  schreibe(path.join(basis, haupt, 'eins.jsonl'), [auftrag('2026-10-16T07:00:00Z'), antwort('a1', '2026-10-16T07:00:05Z')]);
  fs.mkdirSync(path.join(basis, haupt, 'eins', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(basis, haupt, 'eins', 'custom-title.json'), JSON.stringify({ customTitle: 'Titel aus Datei' }));
  schreibe(path.join(basis, haupt, 'eins', 'subagents', 'agent-x.jsonl'), [antwort('s1', '2026-10-16T07:01:00Z', { modell: 'claude-sonnet-5-5' })]);
  fs.writeFileSync(path.join(basis, haupt, 'eins', 'subagents', 'agent-x.meta.json'), JSON.stringify({ agentType: 'Explore', description: GEHEIM }));
  schreibe(path.join(basis, wt, 'zwei.jsonl'), [antwort('a2', '2026-10-15T07:00:00Z')]);
  schreibe(path.join(basis, fremd, 'drei.jsonl'), [antwort('a3', '2026-10-15T07:00:00Z')]);

  const dateien = findeDateien({ projekteDir: basis, praefixe: [haupt], seitMs: 0 });
  assert.deepEqual(dateien.map(d => `${d.sitzungId}:${d.art}`).sort(), ['eins:haupt', 'eins:subagent', 'zwei:haupt']);
  assert.equal(dateien[dateien.length - 1].art, 'subagent', 'Subagenten nach den Hauptsitzungen');

  const e = await sammle({ projekteDir: basis, praefixe: [haupt], jetzt: JETZT });
  assert.equal(e.summe.sitzungen, 2);
  assert.equal(e.sitzungen.find(x => x.id === 'eins').titel, 'Titel aus Datei');
  assert.deepEqual(e.klassen.map(k => k.klasse), ['interaktiv', 'subagent']);
  assert.ok(!JSON.stringify(e).includes(GEHEIM));
});

test('Skript: Argumente', () => {
  assert.equal(argumente([]).tage, 7);
  assert.equal(argumente(['--tage', '14']).tage, 14);
  assert.throws(() => argumente(['--tage', '0']), /--tage/);
  assert.throws(() => argumente(['--irgendwas']), /Unbekanntes Argument/);
});
