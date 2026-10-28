import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { imapText, alleNachrichtenOrdner, suchErgebnis, nachrichtenIds, suchenNurLesend, ImapFehler } from '../lib/imap-lesen.mjs';
import { suchenLieferbelege, SUCHEN_SERVICE, entscheide, nachErfolg, merkmal, postfachAbfragen, GESEHEN_MAX } from '../lib/postfach-vorpruefung.mjs';
import { mcpSperren, harmloseAblehnung, claudeArgumente, liesStatus, auftragPfad } from '../lib/routinen.mjs';
import { main, ergebnisBelegt } from '../scripts/claude-lauf.mjs';

// Montag 26.10.2026, 10:00 Uhr in Berlin - im Zeitfenster.
const IM_FENSTER = new Date('2026-10-26T09:00:00Z');

// --- IMAP -------------------------------------------------------------------

test('IMAP-Text: Anfuehrungszeichen und Backslash maskiert, Umlaute und Zeilenumbrueche abgelehnt', () => {
  assert.equal(imapText('from:a subject:"Neue Kundennachricht"'), '"from:a subject:\\"Neue Kundennachricht\\""');
  assert.equal(imapText('a\\b'), '"a\\\\b"');
  assert.throws(() => imapText('Größe'), ImapFehler);
  assert.throws(() => imapText('a\r\nA2 LOGOUT'), ImapFehler);
});

test('IMAP-Antworten: Ordner mit \\All (auch deutscher Name), UIDs, Gmail-IDs hexadezimal', () => {
  assert.equal(alleNachrichtenOrdner([
    '* LIST (\\HasNoChildren) "/" "INBOX"',
    '* LIST (\\All \\HasNoChildren) "/" "[Gmail]/Alle Nachrichten"',
  ]), '[Gmail]/Alle Nachrichten');
  assert.equal(alleNachrichtenOrdner(['* LIST (\\HasNoChildren) "/" "INBOX"']), null);
  assert.deepEqual(suchErgebnis(['* SEARCH 4 17 230']), [4, 17, 230]);
  assert.deepEqual(suchErgebnis(['* SEARCH']), []);
  // 1878447413727160872 = 0x1a1195f868756a28 (Format der Gmail-API wie in belege.json)
  assert.deepEqual(nachrichtenIds(['* 3 FETCH (X-GM-MSGID 1878447413727160872 UID 17)']), ['1a1195f868756a28']);
});

/** Ein falscher IMAP-Server: merkt sich die Befehle, antwortet je nach Befehl. */
function falscherServer({ anmeldungOk = true, suchErgebnisse = [], literalImList = false } = {}) {
  const befehle = [];
  let suche = 0;
  const verbinden = () => {
    const sock = new EventEmitter();
    const senden = text => setImmediate(() => sock.emit('data', Buffer.from(text)));
    sock.write = (zeile) => {
      const [marke, ...rest] = zeile.trim().split(' ');
      const cmd = rest.join(' ');
      befehle.push(cmd);
      if (cmd.startsWith('LOGIN')) senden(anmeldungOk ? `${marke} OK angemeldet\r\n` : `${marke} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
      else if (cmd.startsWith('LIST')) {
        senden(literalImList
          ? `* LIST (\\HasNoChildren) "/" {5}\r\nINBOX\r\n* LIST (\\All) "/" {24}\r\n[Gmail]/Alle Nachrichten\r\n${marke} OK\r\n`
          : `* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\All \\HasNoChildren) "/" "[Gmail]/All Mail"\r\n${marke} OK\r\n`);
      } else if (cmd.startsWith('EXAMINE')) senden(`* 120 EXISTS\r\n${marke} OK [READ-ONLY]\r\n`);
      else if (cmd.startsWith('UID SEARCH')) {
        const uids = suchErgebnisse[suche++] || [];
        senden(`* SEARCH${uids.length ? ` ${uids.join(' ')}` : ''}\r\n${marke} OK\r\n`);
      } else if (cmd.startsWith('UID FETCH')) {
        const uids = cmd.split(' ')[2].split(',');
        senden(`${uids.map((u, i) => `* ${i + 1} FETCH (X-GM-MSGID ${BigInt(u) * 1000n} UID ${u})\r\n`).join('')}${marke} OK\r\n`);
      } else if (cmd.startsWith('LOGOUT')) senden(`* BYE\r\n${marke} OK\r\n`);
      else senden(`${marke} BAD unbekannt\r\n`);
      return true;
    };
    sock.destroy = () => {};
    sock.end = () => {};
    senden('* OK Gimap ready\r\n');
    return sock;
  };
  return { befehle, verbinden };
}

test('IMAP nur lesend: EXAMINE statt SELECT, nur X-GM-MSGID, je Suche die Kennungen', async () => {
  const s = falscherServer({ suchErgebnisse: [[10, 11], []] });
  const r = await suchenNurLesend({ benutzer: 'kontakt@example.invalid', passwort: 'test-passwort' }, ['label:a newer_than:3d', 'from:b'], { verbinden: s.verbinden });
  assert.deepEqual(r, [[(10000n).toString(16), (11000n).toString(16)], []]);
  assert.ok(s.befehle.includes('EXAMINE "[Gmail]/All Mail"'));
  assert.ok(!s.befehle.some(b => /^SELECT|STORE|COPY|MOVE|EXPUNGE|APPEND/.test(b)), 'nichts Schreibendes');
  assert.ok(s.befehle.some(b => b === 'UID FETCH 10,11 (X-GM-MSGID)'));
  assert.equal(s.befehle.at(-1), 'LOGOUT');
});

test('IMAP: Literale in der LIST-Antwort werden gelesen', async () => {
  const s = falscherServer({ literalImList: true, suchErgebnisse: [[5]] });
  await suchenNurLesend({ benutzer: 'a', passwort: 'test-passwort' }, ['x'], { verbinden: s.verbinden });
  assert.ok(s.befehle.includes('EXAMINE "[Gmail]/Alle Nachrichten"'));
});

test('IMAP: abgelehnte Anmeldung -> verstaendlicher Fehler ohne Passwort', async () => {
  const s = falscherServer({ anmeldungOk: false });
  await assert.rejects(
    suchenNurLesend({ benutzer: 'a', passwort: 'test-passwort' }, ['x'], { verbinden: s.verbinden }),
    (e) => e instanceof ImapFehler && /Anmeldung abgelehnt/.test(e.message) && !e.message.includes('test-passwort'),
  );
});

// --- Vorpruefung ------------------------------------------------------------

test('Suchen wie im Auftrag: 30 Tage ohne letzten Lauf, sonst 3; Domains in Gruppen zu 20; eigene und gesendete Mails raus', () => {
  const domains = Array.from({ length: 23 }, (_, i) => `d${i}.example`);
  const ohne = suchenLieferbelege({ domains, letzterLauf: null });
  assert.equal(ohne.length, 2 + 2 + 1);
  assert.ok(ohne.every(q => q.includes('newer_than:30d') && q.endsWith('-in:sent -from:teppich-paradies.net')));
  assert.match(ohne[2], /^from:\(d0\.example OR .* OR d19\.example\) newer_than:30d -label:inbox-ls-ab/);
  assert.match(ohne[3], /^from:\(d20\.example OR d21\.example OR d22\.example\)/);
  assert.ok(suchenLieferbelege({ domains: [], letzterLauf: '2026-10-26T08:00:00Z' }).every(q => q.includes('newer_than:3d')));
  assert.match(SUCHEN_SERVICE[0], /from:mailer@shopify\.com subject:"Neue Kundennachricht"/);
});

test('Entscheidung: Fehlschlag, Tageslauf, unvollstaendig, Domains, neue Mail - sonst kein Claude', () => {
  const heute = { letzterClaudeOk: true, letzterClaudeTag: '2026-10-26', vorpruefung: { gesehen: ['b'], merkmal: 'm1' } };
  assert.equal(entscheide({ status: { ...heute, letzterClaudeOk: false }, jetzt: IM_FENSTER }).starten, true);
  assert.match(entscheide({ status: { ...heute, letzterClaudeTag: '2026-10-25' }, jetzt: IM_FENSTER }).grund, /Tageslauf/);
  assert.match(entscheide({ status: {}, jetzt: IM_FENSTER }).grund, /Tageslauf/);
  assert.match(entscheide({ status: heute, jetzt: IM_FENSTER, unvollstaendig: true }).grund, /unvollständig/);
  assert.match(entscheide({ status: heute, jetzt: IM_FENSTER, merkmalNeu: 'm2' }).grund, /Domains geändert/);
  const neu = entscheide({ status: heute, jetzt: IM_FENSTER, gefunden: ['a', 'b', 'c'], bekannteIds: ['a'], merkmalNeu: 'm1' });
  assert.equal(neu.starten, true);
  assert.deepEqual(neu.neu, ['c']);
  const nichts = entscheide({ status: heute, jetzt: IM_FENSTER, gefunden: ['a', 'b', 'b'], bekannteIds: ['a'], merkmalNeu: 'm1' });
  assert.equal(nichts.starten, false);
  assert.match(nichts.grund, /nichts Neues \(2 Mails/);
});

test('Nach Erfolg: Tag in Berlin, gesehen begrenzt, Merkmal bleibt', () => {
  const r = nachErfolg({ gefunden: Array.from({ length: GESEHEN_MAX + 5 }, (_, i) => `id${String(i).padStart(5, '0')}`), merkmalNeu: 'm', jetzt: new Date('2026-10-26T23:30:00Z') });
  assert.equal(r.letzterClaudeTag, '2026-10-27', '0:30 Uhr in Berlin gehoert zum neuen Tag');
  assert.equal(r.vorpruefung.gesehen.length, GESEHEN_MAX);
  assert.equal(r.vorpruefung.merkmal, 'm');
  assert.equal(merkmal(['b', 'a']), merkmal(['a', 'b']));
});

function privatOrdner() {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-postfach-vp-'));
  fs.mkdirSync(path.join(privat, 'lieferbelege'), { recursive: true });
  fs.writeFileSync(path.join(privat, 'lieferbelege', 'belege.json'), JSON.stringify({
    version: 1, belege: { aa: { id: 'aa', domain: 'lief.example' } }, absender: {}, geprueft: {},
    laeufe: [{ am: '2026-10-26T06:35:00Z', vollstaendig: false }],
  }));
  return privat;
}

test('Postfach abfragen: eine Verbindung fuer beide Teile, Bekanntes und unvollstaendiger Lauf je Teil', async () => {
  const privat = privatOrdner();
  let aufrufe = 0;
  const r = await postfachAbfragen({
    privat,
    zugangLesen: () => ({ zugang: { benutzer: 'a', passwort: 'test-passwort' } }),
    suchen: async (zugang, suchen) => { aufrufe += 1; return suchen.map((q, i) => (q.includes('mailer@shopify.com') ? ['s1'] : i === 0 ? ['aa', 'bb'] : [])); },
  });
  assert.equal(aufrufe, 1);
  assert.deepEqual(r.lieferbelege.gefunden, ['aa', 'bb']);
  assert.deepEqual(r.lieferbelege.bekannteIds, ['aa']);
  assert.equal(r.lieferbelege.unvollstaendig, true);
  assert.deepEqual(r.serviceanfragen.gefunden, ['s1']);
  assert.match((await postfachAbfragen({ privat, zugangLesen: () => ({ fehlt: true, hinweis: 'fehlt' }) })).fehler, /kein Postfach-Zugang/);
  const kaputt = await postfachAbfragen({ privat, zugangLesen: () => ({ zugang: {} }), suchen: async () => { throw new ImapFehler('IMAP: ECONNREFUSED'); } });
  assert.match(kaputt.fehler, /ECONNREFUSED/);
});

// --- MCP-Sperren und Ablehnungen ----------------------------------------------

test('MCP-Sperren: alle Server ausser Gmail, Namen wie in den Werkzeugnamen', () => {
  const init = { mcp: [{ name: 'claude.ai Gmail', status: 'connected' }, { name: 'plugin:hypd-ai-ads:hypd', status: 'connected' }, { name: 'claude.ai monday.com', status: 'needs-auth' }, { name: 'chrome-devtools', status: 'pending' }] };
  assert.deepEqual(mcpSperren(init, ['claude.ai Gmail']), ['mcp__plugin_hypd-ai-ads_hypd', 'mcp__claude_ai_monday_com', 'mcp__chrome-devtools']);
  assert.deepEqual(mcpSperren(null, ['claude.ai Gmail']), []);
  const args = claudeArgumente('postfach', { dienst: '/d', arbeit: '/a', privat: '/p', prompt: 'x', mcpGesperrt: ['mcp__chrome-devtools'] });
  const i = args.indexOf('--disallowedTools');
  assert.ok(args.slice(i, args.indexOf('--add-dir')).includes('mcp__chrome-devtools'));
});

test('Ablehnung nur eines Dateipfads mit belegtem Ergebnis ist kein Fehler; Bash bleibt einer', () => {
  const b = { ok: false, art: 'abgelehnt', abschluss: 'neu 2 (AB 1, Rechnung 1)', ablehnungen: ['Write (/private/tmp/x/scratchpad/l.json)'] };
  const r = harmloseAblehnung(b, true);
  assert.equal(r.ok, true);
  assert.equal(r.meldung, 'neu 2 (AB 1, Rechnung 1)');
  assert.match(r.hinweis, /1 Dateizugriff/);
  assert.equal(harmloseAblehnung(b, false).ok, false, 'ohne Ergebnis bleibt es ein Fehler');
  assert.equal(harmloseAblehnung({ ...b, ablehnungen: ['Bash (curl evil)'] }, true).ok, false);
  assert.equal(harmloseAblehnung({ ...b, ablehnungen: ['Write (/x)', 'Bash (rm -rf /)'] }, true).ok, false);
});

test('Ergebnis belegt: Belege-Lauf seit dem Start; Service mit Uebernahme oder „nichts Neues“', () => {
  const privat = privatOrdner();
  assert.equal(ergebnisBelegt('lieferbelege', { privat, start: '2026-10-26T06:30:00Z' }), true);
  assert.equal(ergebnisBelegt('lieferbelege', { privat, start: '2026-10-26T06:40:00Z' }), false);
  assert.equal(ergebnisBelegt('serviceanfragen', { privat, start: 'x', bewertung: { aufrufe: ['Bash: cd /d && npm run -s service -- uebernehmen --datei /a/s.json'] } }), true);
  assert.equal(ergebnisBelegt('serviceanfragen', { privat, start: 'x', bewertung: { abschluss: 'nichts Neues' } }), true);
  assert.equal(ergebnisBelegt('serviceanfragen', { privat, start: 'x', bewertung: { abschluss: 'Fehler' } }), false);
});

// --- Ablauf im Dienst -----------------------------------------------------------

function umgebung() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-postfach-lauf-'));
  const privat = path.join(root, 'privat');
  for (const name of ['lieferbelege-postfach', 'serviceanfragen-postfach']) {
    fs.mkdirSync(path.dirname(auftragPfad(privat, name)), { recursive: true });
    fs.writeFileSync(auftragPfad(privat, name), `Auftrag ${name} ${'x'.repeat(150)}\nABSCHLUSS: eine Zeile.\n`);
  }
  fs.mkdirSync(path.join(root, 'dienst'));
  return { privat, env: { TP_PRIVAT_DIR: privat, TP_DIENST_DIR: path.join(root, 'dienst'), TP_CLAUDE_BIN: '/bin/false', PATH: process.env.PATH } };
}

function antwort(result) {
  return { exitCode: 0, signal: null, zeitlimit: false, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, usage: { input_tokens: 5 }, permission_denials: [], result }) };
}

test('Dienst: Tageslauf startet Claude, danach ohne Neues kein Claude mehr; neue Mail nur im betroffenen Teil', async () => {
  const { privat, env } = umgebung();
  const prompts = [];
  let gefunden = { lieferbelege: ['a1'], serviceanfragen: ['s1'] };
  const deps = {
    env, jetzt: IM_FENSTER, aus: () => {}, melde: () => {}, nachziehenAktiv: () => false,
    mcpSperren: async () => ['mcp__chrome-devtools'],
    postfachAbfragen: async () => ({
      lieferbelege: { gefunden: gefunden.lieferbelege, bekannteIds: [], unvollstaendig: false, merkmalNeu: 'm' },
      serviceanfragen: { gefunden: gefunden.serviceanfragen, bekannteIds: [], unvollstaendig: false, merkmalNeu: null },
    }),
    starte: async (bin, args) => { prompts.push(args); return antwort('nichts Neues'); },
  };
  assert.equal(await main(['postfach'], deps), 0);
  assert.equal(prompts.length, 2, 'erster Lauf des Tages: beide Teile');
  assert.ok(prompts[0].includes('mcp__chrome-devtools'), 'fremde MCP-Server gesperrt');
  const s = liesStatus(privat, 'lieferbelege');
  assert.equal(s.letzterClaudeTag, '2026-10-26');
  assert.deepEqual(s.vorpruefung.gesehen, ['a1']);

  prompts.length = 0;
  assert.equal(await main(['postfach'], deps), 0);
  assert.equal(prompts.length, 0, 'nichts Neues: kein Claude');
  assert.equal(liesStatus(privat, 'serviceanfragen').meldung, 'nichts Neues (Vorprüfung ohne KI)');
  assert.equal(liesStatus(privat, 'serviceanfragen').ok, true);

  gefunden = { lieferbelege: ['a1', 'a2'], serviceanfragen: ['s1'] };
  assert.equal(await main(['postfach'], deps), 0);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].at(-1), /Auftrag lieferbelege-postfach/);
});

test('Dienst: Vorpruefung nicht moeglich oder abgeschaltet -> Claude wie bisher', async () => {
  const { env } = umgebung();
  let starts = 0;
  const deps = { env, jetzt: IM_FENSTER, aus: () => {}, melde: () => {}, nachziehenAktiv: () => false, mcpSperren: async () => [], starte: async () => { starts += 1; return antwort('nichts Neues'); } };
  assert.equal(await main(['postfach'], { ...deps, postfachAbfragen: async () => ({ fehler: 'IMAP: ECONNREFUSED' }) }), 0);
  assert.equal(starts, 2);
  assert.match(liesStatus(env.TP_PRIVAT_DIR, 'lieferbelege').vorpruefungGrund, /Vorprüfung nicht möglich: IMAP: ECONNREFUSED/);
  let abgefragt = 0;
  assert.equal(await main(['postfach'], { ...deps, env: { ...env, TP_POSTFACH_VORPRUEFUNG: 'aus' }, postfachAbfragen: async () => { abgefragt += 1; return {}; } }), 0);
  assert.equal(abgefragt, 0);
  assert.equal(starts, 4);
});

test('Dienst: abgelehnter Scratchpad-Zugriff mit belegtem Ergebnis ist kein Fehler, keine Mitteilung', async () => {
  const { privat, env } = umgebung();
  fs.mkdirSync(path.join(privat, 'lieferbelege'), { recursive: true });
  const mitteilungen = [];
  const deps = {
    env, jetzt: IM_FENSTER, aus: () => {}, melde: t => mitteilungen.push(t), nachziehenAktiv: () => false, mcpSperren: async () => [],
    postfachAbfragen: async () => ({ fehler: 'aus im Test' }),
    starte: async (bin, args) => {
      if (/lieferbelege-postfach/.test(args.at(-1))) {
        // Wie am 28.10.: Write ins Scratchpad abgelehnt, Uebernahme lief trotzdem.
        fs.writeFileSync(path.join(privat, 'lieferbelege', 'belege.json'), JSON.stringify({ version: 1, belege: {}, absender: {}, geprueft: {}, laeufe: [{ am: new Date().toISOString(), vollstaendig: true }] }));
        return { ...antwort('neu 2 (AB 1, Rechnung 1)'), stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 9, usage: {}, permission_denials: [{ tool_name: 'Write', tool_input: { file_path: '/private/tmp/claude-1/x/scratchpad/l.json' } }], result: 'neu 2 (AB 1, Rechnung 1)' }) };
      }
      return antwort('nichts Neues');
    },
  };
  assert.equal(await main(['postfach'], deps), 0);
  const s = liesStatus(privat, 'lieferbelege');
  assert.equal(s.ok, true);
  assert.match(s.hinweis, /außerhalb des Arbeitsordners abgelehnt, Ergebnis trotzdem übernommen/);
  assert.deepEqual(mitteilungen, []);
});
