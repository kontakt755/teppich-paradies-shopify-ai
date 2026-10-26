import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  berlinZeit, imFenster, auftragOhneKopf, promptKopf, claudeArgumente, bewerteLauf, vorpruefung,
  schreibStatus, liesStatus, routinenStand, nimmSperre, sperreBesetzt, pruefeGesundheit,
  GMAIL_LESEN, GMAIL_SCHREIBEN, LAEUFE, arbeitsOrdner, leseAusgabe, neuerSammler, sammle, abschliessen,
} from '../lib/routinen.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-routinen-'));
const ctx = { dienst: '/home/test/tp-dashboard', privat: '/home/test/analyse' };

/** Werte zwischen zwei Optionen (variadische Listen von --allowedTools usw.). */
function liste(args, name) {
  const r = [];
  for (let i = args.indexOf(name) + 1; i < args.length && !args[i].startsWith('--'); i += 1) r.push(args[i]);
  return r;
}

test('Zeitfenster Mo-Sa 7-19 Uhr in Europe/Berlin, auch ueber die Zeitumstellung', () => {
  // 26.10.2026 ist ein Montag nach der Umstellung auf Winterzeit (UTC+1).
  assert.equal(imFenster(new Date('2026-10-26T05:59:00Z')), false, '6:59 Uhr');
  assert.equal(imFenster(new Date('2026-10-26T06:00:00Z')), true, '7:00 Uhr');
  assert.equal(imFenster(new Date('2026-10-26T18:59:00Z')), true, '19:59 Uhr zaehlt noch zur Stunde 19');
  assert.equal(imFenster(new Date('2026-10-26T19:00:00Z')), false, '20:00 Uhr');
  assert.equal(imFenster(new Date('2026-10-31T18:45:00Z')), true, 'Samstag 19:45');
  assert.equal(imFenster(new Date('2026-11-01T10:00:00Z')), false, 'Sonntag');
  // Sommerzeit (UTC+2): Montag 6.7.2026 7:00 Uhr = 5:00Z.
  assert.equal(imFenster(new Date('2026-07-06T05:00:00Z')), true);
  assert.equal(imFenster(new Date('2026-07-06T04:59:00Z')), false);
  assert.deepEqual(berlinZeit(new Date('2026-10-26T06:00:00Z')), { wochentag: 1, stunde: 7, minute: 0, datum: '2026-10-26' });
});

test('Auftragstext: YAML-Kopf wird abgeschnitten, der Rest bleibt unveraendert', () => {
  const text = '---\nname: test\ndescription: x: y\n---\n\nSCHRITT 1 – tu etwas\nmit Zeile 2\n';
  assert.equal(auftragOhneKopf(text), 'SCHRITT 1 – tu etwas\nmit Zeile 2');
  assert.equal(auftragOhneKopf('ohne Kopf'), 'ohne Kopf');
  assert.equal(auftragOhneKopf('﻿---\na: 1\n---\nInhalt'), 'Inhalt');
});

test('Prompt-Kopf: Laufumgebung, Arbeitsordner statt Scratchpad, Gmail-Namen nur im Postfach', () => {
  const arbeit = arbeitsOrdner(ctx.privat, 'postfach');
  const k = promptKopf('postfach', LAEUFE.postfach.teile[0], { dienst: ctx.dienst, arbeit });
  assert.match(k, /claude -p/);
  assert.match(k, /Wochenlimit-Bremse .* gilt für diesen Lauf nicht/);
  assert.ok(k.includes(arbeit));
  assert.match(k, /Scratchpad-Verzeichnis“ nennt, nimm genau diesen Ordner/);
  for (const g of GMAIL_LESEN) assert.ok(k.includes(g), g);
  assert.match(k, /NICHT selbst löschen/);
  assert.ok(k.trimEnd().endsWith('AUFTRAG:'));
  const f = promptKopf('fehlermeldungen', LAEUFE.fehlermeldungen.teile[0], { dienst: ctx.dienst, arbeit: arbeitsOrdner(ctx.privat, 'fehlermeldungen') });
  assert.doesNotMatch(f, /Gmail/);
  assert.match(f, /select:ArtifactData,Artifact/);
  assert.doesNotMatch(`${k}${f}`, /claude\.ai\/artifact/, 'keine Werkbank-Adresse im Kopf');
});

test('claude-Argumente Fehlermeldungen: restricted, Sonnet, nur die npm-Befehle des Auftrags', () => {
  const arbeit = arbeitsOrdner(ctx.privat, 'fehlermeldungen');
  const args = claudeArgumente('fehlermeldungen', { ...ctx, arbeit, prompt: '-beginnt mit Strich' });
  assert.equal(args[0], '-p');
  assert.deepEqual(args.slice(-2), ['--', '-beginnt mit Strich'], 'Prompt nach --, nie als Option gelesen');
  assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
  assert.ok(args.includes('--restricted'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
  assert.ok(args.includes('--no-session-persistence'));
  assert.equal(args[args.indexOf('--tools') + 1], 'Bash,ToolSearch,Artifact,ArtifactData');
  const frei = liste(args, '--allowedTools');
  assert.ok(frei.includes('Bash(npm run -s fehler -- abgleich)'));
  assert.ok(frei.includes(`Bash(cd ${ctx.dienst})`));
  assert.ok(frei.includes(`Edit(/${arbeit}/**)`), 'out_dir der Werkbank-Abfrage');
  assert.ok(!frei.includes('Bash'), 'nie Bash ohne Einschraenkung');
  assert.ok(frei.every(f => !/^Bash\((?!cd |npm run -s fehler -- |date -u )/.test(f)), frei.join(' '));
  const gesperrt = liste(args, '--disallowedTools');
  for (const g of ['Bash(git *)', 'Bash(gh *)', 'Bash(shopify *)', 'mcp__claude_ai_Shopify', 'ArtifactComments']) assert.ok(gesperrt.includes(g), g);
  assert.deepEqual(liste(args, '--add-dir').length, 1);
});

test('claude-Argumente Postfach: Gmail nur lesend, alle Schreibwerkzeuge gesperrt, ToolSearch an', () => {
  const arbeit = arbeitsOrdner(ctx.privat, 'postfach');
  const args = claudeArgumente('postfach', { ...ctx, arbeit, prompt: 'x' });
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'user');
  assert.ok(!args.includes('--restricted'));
  assert.ok(args[args.indexOf('--tools') + 1].split(',').includes('ToolSearch'), 'ohne ToolSearch laedt Claude alle MCP-Schemata sofort');
  const frei = liste(args, '--allowedTools');
  const gmailFrei = frei.filter(f => f.startsWith('mcp__claude_ai_Gmail__'));
  assert.deepEqual(gmailFrei.sort(), [...GMAIL_LESEN].sort());
  const gesperrt = liste(args, '--disallowedTools');
  for (const g of GMAIL_SCHREIBEN) assert.ok(gesperrt.includes(g), g);
  for (const g of ['mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__reply', 'mcp__claude_ai_Gmail__trash_thread', 'mcp__claude_ai_Gmail__label_thread', 'mcp__claude_ai_Gmail__create_draft']) assert.ok(gesperrt.includes(g), g);
  assert.ok(gesperrt.includes('Bash(npm run -s fehler *)'), 'Freigabe aus ~/.claude/settings.json gilt hier nicht');
  assert.ok(gesperrt.includes('Bash(rm *)'), 'Zwischendatei loescht der Dienst');
  assert.ok(frei.includes('Bash(npm run -s belege -- uebernehmen *)') && frei.includes('Bash(npm run -s service -- uebernehmen *)'));
  assert.ok(frei.includes(`Edit(/${arbeit}/**)`));
  assert.ok(!frei.some(f => f === 'Write' || f === 'Edit'), 'Schreiben nur im Arbeitsordner');
});

const ergebnis = (j) => ({ exitCode: 0, signal: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 4, duration_ms: 61_000, usage: { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 200 }, permission_denials: [], result: 'Ok.\n\nnichts zu tun', ...j }) });

test('Lauf bewerten: ok nur ohne Fehler und ohne abgelehnte Werkzeuge', () => {
  const ok = bewerteLauf(ergebnis({}));
  assert.equal(ok.ok, true);
  assert.equal(ok.meldung, 'nichts zu tun');
  assert.equal(ok.tokens, 6210);
  const abgelehnt = bewerteLauf(ergebnis({ permission_denials: [{ tool_name: 'Write', tool_input: { file_path: '/x/y.json', content: 'Kundendaten' } }] }));
  assert.equal(abgelehnt.ok, false);
  assert.equal(abgelehnt.art, 'abgelehnt');
  assert.match(abgelehnt.meldung, /Write \(\/x\/y\.json\)/);
  assert.doesNotMatch(abgelehnt.meldung, /Kundendaten/, 'Inhalte abgelehnter Aufrufe nie in Status oder Mitteilung');
  assert.equal(bewerteLauf(ergebnis({ is_error: true, subtype: 'error_max_turns' })).art, 'fehler');
  assert.equal(bewerteLauf({ exitCode: 1, stdout: 'kein json' }).art, 'antwort');
  assert.equal(bewerteLauf({ zeitlimit: true }).art, 'zeitlimit');
  assert.equal(bewerteLauf(ergebnis({ result: 'Skript noch nicht im Dienst (PR #1 noch nicht nachgezogen)' })).art, 'skript-fehlt');
});

test('Vorpruefung: Claude nur bei neuen Meldungen oder alle zwei Stunden fuer laufende', () => {
  const jetzt = new Date('2026-10-26T10:00:00Z');
  const vor = min => new Date(jetzt.getTime() - min * 60_000).toISOString();
  const leer = { neu: [], laufend: [], kuerzlichErledigt: [] };
  assert.deepEqual(vorpruefung(leer, {}, jetzt), { starten: false, grund: 'nichts zu tun' });
  assert.equal(vorpruefung({ ...leer, neu: [{ id: 'F-001' }] }, { letzterClaudeLauf: vor(5) }, jetzt).starten, true);
  const laufend = { ...leer, laufend: [{ id: 'F-002', werkbankId: 'F-002' }] };
  assert.equal(vorpruefung(laufend, {}, jetzt).starten, true, 'noch nie gelaufen');
  assert.equal(vorpruefung(laufend, { letzterClaudeLauf: vor(119) }, jetzt).starten, false);
  assert.equal(vorpruefung(laufend, { letzterClaudeLauf: vor(121) }, jetzt).starten, true);
  assert.equal(vorpruefung({ ...leer, kuerzlichErledigt: [{ id: 'F-3' }] }, { letzterClaudeLauf: vor(130) }, jetzt).starten, true);
  // Nach einem Fehlschlag eine Stunde Pause - auch fuer neue Meldungen.
  const pause = vorpruefung({ ...leer, neu: [{ id: 'F-004' }] }, { letzterClaudeLauf: vor(20), letzterClaudeOk: false }, jetzt);
  assert.equal(pause.starten, false);
  assert.match(pause.grund, /Pause, nächster Versuch in 40 Min/);
  assert.equal(vorpruefung({ ...leer, neu: [{ id: 'F-004' }] }, { letzterClaudeLauf: vor(61), letzterClaudeOk: false }, jetzt).starten, true);
});

test('Status: seit bleibt, solange ok gleich bleibt; Mitteilung nur bei neuem Fehler', () => {
  const dir = tmp();
  const t = h => new Date(Date.UTC(2026, 9, 26, h));
  assert.deepEqual(liesStatus(dir, 'lieferbelege'), {});
  assert.equal(schreibStatus(dir, 'lieferbelege', { ok: true, meldung: 'nichts Neues' }, t(7)).mitteilen, false);
  const f1 = schreibStatus(dir, 'lieferbelege', { ok: false, art: 'abgelehnt', meldung: 'Werkzeug abgelehnt' }, t(9));
  assert.equal(f1.mitteilen, true);
  assert.equal(f1.stand.seit, t(9).toISOString());
  const f2 = schreibStatus(dir, 'lieferbelege', { ok: false, art: 'abgelehnt', meldung: 'Werkzeug abgelehnt' }, t(11));
  assert.equal(f2.mitteilen, false, 'derselbe Fehler meldet sich nicht jeden Lauf neu');
  assert.equal(f2.stand.seit, t(9).toISOString());
  assert.equal(schreibStatus(dir, 'lieferbelege', { ok: false, art: 'zeitlimit', meldung: 'Zeitlimit' }, t(13)).mitteilen, true, 'andere Fehlerart');
  const herz = schreibStatus(dir, 'lieferbelege', {}, t(14));
  assert.equal(herz.stand.ok, false, 'Lebenszeichen aendert ok nicht');
  assert.equal(herz.stand.seit, t(9).toISOString());
  const gut = schreibStatus(dir, 'lieferbelege', { ok: true, art: null, meldung: 'neu 1 (AB 1)' }, t(15));
  assert.equal(gut.stand.seit, t(15).toISOString());
  assert.equal((fs.statSync(path.join(dir, 'routinen', 'postfach', 'status-lieferbelege.json')).mode & 0o777), 0o600);
  const stand = routinenStand(dir);
  assert.equal(stand.length, 1);
  assert.deepEqual({ id: stand[0].id, ok: stand[0].ok, meldung: stand[0].meldung }, { id: 'lieferbelege', ok: true, meldung: 'neu 1 (AB 1)' });
  fs.writeFileSync(path.join(dir, 'routinen', 'postfach', 'status-lieferbelege.json'), '{kaputt');
  assert.equal(routinenStand(dir)[0].ok, false, 'kaputte Statusdatei ist ein Fehler, nicht "alles gut"');
  assert.equal(routinenStand(tmp()).length, 0);
});

test('Sperre: zweiter Start ist besetzt, die Sperre eines beendeten Prozesses wird uebernommen', () => {
  const datei = path.join(tmp(), 'lauf', 'sperre');
  const s = nimmSperre(datei);
  assert.ok(s);
  assert.equal(nimmSperre(datei), null);
  assert.equal(sperreBesetzt(datei), true);
  s.freigeben();
  assert.equal(sperreBesetzt(datei), false);
  fs.writeFileSync(datei, JSON.stringify({ pid: 999_999_99, seit: 'x' }));
  const neu = nimmSperre(datei);
  assert.ok(neu, 'tote Sperre uebernommen');
  neu.freigeben();
  assert.equal(fs.existsSync(datei), false);
});

test('Datengesundheit: frisch, alt, Teil fehlgeschlagen, Teil veraltet, fehlt', () => {
  const jetzt = new Date('2026-10-26T12:00:00Z');
  const vor = min => new Date(jetzt.getTime() - min * 60_000).toISOString();
  const a = (teile, gesamt = 5) => ({ aktualisiertAm: vor(gesamt), teile });
  const gut = { bestellungen: { zeitpunkt: vor(5), erfolg: true }, lexikon: { zeitpunkt: vor(100), erfolg: true } };
  assert.equal(pruefeGesundheit(a(gut), jetzt).ok, true);
  assert.equal(pruefeGesundheit(a(gut, 61), jetzt).art, 'alt');
  assert.equal(pruefeGesundheit(a({ ...gut, kunden: { zeitpunkt: vor(5), erfolg: false, meldung: 'THROTTLED' } }), jetzt).art, 'teil-fehler');
  assert.match(pruefeGesundheit(a({ ...gut, lexikon: { zeitpunkt: vor(200), erfolg: true } }), jetzt).meldung, /lexikon \(200 Min\.\)/);
  assert.equal(pruefeGesundheit(a({ ...gut, angebote: { zeitpunkt: vor(70), erfolg: true } }), jetzt).art, 'teil-alt');
  assert.equal(pruefeGesundheit(null, jetzt).art, 'fehlt');
});

test('stream-json: nur result und die Aufrufliste bleiben - Befehle und Pfade, keine Inhalte, keine Werkbank-Adresse', () => {
  const zeilen = [
    { type: 'system', subtype: 'init', tools: ['Bash'] },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'los' }, { type: 'tool_use', name: 'Bash', input: { command: 'cd /x && npm run -s fehler -- abgleich' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'Kundin Erika Musterfrau' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ArtifactData', input: { action: 'query', url: 'https://claude.ai/artifact/GEHEIM', collection: 'items' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/a/b.json', content: '[{"text":"Kundendaten"}]' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__claude_ai_Gmail__get_thread', input: { threadId: 't1' } }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'nichts zu tun', permission_denials: [], usage: {} },
  ].map(z => JSON.stringify(z)).join('\n');
  const a = leseAusgabe(zeilen);
  assert.equal(a.ergebnis.result, 'nichts zu tun');
  assert.deepEqual(a.aufrufe, ['Bash: cd /x && npm run -s fehler -- abgleich', 'ArtifactData: query items', 'Write: /a/b.json', 'mcp__claude_ai_Gmail__get_thread']);
  assert.doesNotMatch(JSON.stringify(a.aufrufe), /GEHEIM|Kundendaten|Erika/);
  // Stueckweise gelesen (wie aus der Pipe) ergibt dasselbe.
  const s = neuerSammler();
  for (let i = 0; i < zeilen.length; i += 7) sammle(s, zeilen.slice(i, i + 7));
  assert.deepEqual(abschliessen(s).aufrufe, a.aufrufe);
  assert.equal(bewerteLauf({ exitCode: 0, stdout: zeilen }).aufrufe.length, 4);
});
