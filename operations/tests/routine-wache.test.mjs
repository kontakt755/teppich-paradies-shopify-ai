import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruefeAufruf, wacheKontext, befehlsTeile, werkbankAus, woerter, liesSpuren, entwurfSha } from '../lib/routine-wache.mjs';
import { auftragPfad, arbeitsOrdner, sperrPfad, entwuerfeOrdner, ENTWUERFE_LABELS, ENTWUERFE_LABELS_NIE, ENTWUERFE_MAX_VERLAEUFE, GMAIL_LESEN, GMAIL_SCHREIBEN } from '../lib/routinen.mjs';

const WERKBANK = 'https://claude.ai/artifact/TESTWERKBANK1';
const SKRIPT = fileURLToPath(new URL('../scripts/routine-wache.mjs', import.meta.url));

function umgebung({ auftrag = `Werkbank: ${WERKBANK} – ${'x'.repeat(120)}` } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-wache-'));
  const privat = path.join(root, 'privat');
  const dienst = path.join(root, 'tp-dashboard');
  const home = path.join(root, 'home');
  if (auftrag !== null) {
    fs.mkdirSync(path.dirname(auftragPfad(privat, 'fehlermeldungen-werkbank')), { recursive: true });
    fs.writeFileSync(auftragPfad(privat, 'fehlermeldungen-werkbank'), auftrag);
  }
  return { root, privat, dienst, home };
}

const ja = r => assert.deepEqual(r, { erlaubt: true });
const nein = (r, muster) => { assert.equal(r.erlaubt, false); if (muster) assert.match(r.grund, muster); };

test('Bash-Zerlegung: nur && als Verbindung, Sonderzeichen nur in Anfuehrungszeichen', () => {
  assert.deepEqual(befehlsTeile('cd /x && npm run -s fehler -- abgleich'), ['cd /x', 'npm run -s fehler -- abgleich']);
  assert.deepEqual(befehlsTeile("jq -r '.[] | .id' /a/b.json"), ["jq -r '.[] | .id' /a/b.json"]);
  for (const b of ['ls; rm x', 'a | b', 'a & b', 'a > f', 'a < f', 'echo $(id)', 'echo `id`', 'echo "$HOME"', 'cat ~/x', 'ls *', 'a\nb', '', 'a && ', "echo 'offen", 'x # kommentar']) {
    assert.equal(befehlsTeile(b), null, b);
  }
  assert.deepEqual(woerter("npm run -s fehler -- verworfen F-003 --ergebnis 'In der Werkbank entfernt.'"), ['npm', 'run', '-s', 'fehler', '--', 'verworfen', 'F-003', '--ergebnis', 'In der Werkbank entfernt.']);
});

test('Werkbank-Adresse: genau eine Artefakt-Adresse im Auftragstext', () => {
  assert.equal(werkbankAus(`a ${WERKBANK} b ${WERKBANK}.`), WERKBANK);
  assert.equal(werkbankAus('keine Adresse'), null);
  assert.equal(werkbankAus(`${WERKBANK} https://claude.ai/artifact/ANDERE`), null, 'zwei verschiedene: unklar, also keine');
});

test('Wache Fehlermeldungen: nur die Befehle des Auftrags, Werkbank nur lesen/anlegen, keine Loeschung', () => {
  const u = umgebung();
  const ctx = wacheKontext('fehlermeldungen', u);
  const arbeit = arbeitsOrdner(u.privat, 'fehlermeldungen');
  const p = (tool_name, tool_input) => pruefeAufruf('fehlermeldungen', { tool_name, tool_input }, ctx);
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- abgleich` }));
  ja(p('Bash', { command: 'date -u +%Y-%m-%dT%H:%M:%S.000Z' }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- uebernommen F-004 --werkbank F-004` }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- werkbank-stand --ordner ${arbeit}/werkbank-1/items` }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- verworfen F-003 --ergebnis 'In der Werkbank entfernt.'` }));
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- behoben F-003` }), /nicht freigegeben/);
  nein(p('Bash', { command: 'cat .env.local' }), /\.env/);
  nein(p('Bash', { command: `cd ${u.dienst} && node -e 1` }), /nicht freigegeben/);
  nein(p('Bash', { command: 'date -u -f /etc/passwd' }), /date nur/);
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- werkbank-stand --ordner /etc` }), /--ordner/);
  ja(p('ToolSearch', { query: 'select:ArtifactData,Artifact' }));
  nein(p('ArtifactComments', { url: WERKBANK }), /nicht vorgesehen/);
  nein(p('Read', { file_path: `${arbeit}/x.json` }), /nicht vorgesehen/);
  nein(p('WebFetch', { url: 'https://example.org' }), /nicht vorgesehen/);
  // ArtifactData
  ja(p('ArtifactData', { action: 'get', url: WERKBANK, collection: 'items', doc_id: 'F-004' }));
  ja(p('ArtifactData', { action: 'query', url: `${WERKBANK}/`, collection: 'items', query: { limit: 1000 }, out_dir: `${arbeit}/werkbank-1` }));
  ja(p('ArtifactData', { action: 'batch', url: WERKBANK, writes: [{ op: 'set', collection: 'items', doc_id: 'F-004', data: {} }] }));
  nein(p('ArtifactData', { action: 'get', url: 'https://claude.ai/artifact/ANDERE', collection: 'items', doc_id: 'F-004' }), /nur für die Werkbank/);
  nein(p('ArtifactData', { action: 'delete', url: WERKBANK, collection: 'items', doc_id: 'F-004' }), /nicht erlaubt/);
  nein(p('ArtifactData', { action: 'batch', url: WERKBANK, writes: [{ op: 'delete', collection: 'items', doc_id: 'F-004' }] }), /Löschen/);
  nein(p('ArtifactData', { action: 'batch', url: WERKBANK, writes: [{ op: 'set', collection: 'items', doc_id: 'w-030', data: {} }] }), /Meldungsnummer/);
  nein(p('ArtifactData', { action: 'set', url: WERKBANK, collection: 'nutzer', doc_id: 'F-004', data: {} }), /items/);
  nein(p('ArtifactData', { action: 'query', url: WERKBANK, collection: 'items', out_dir: '/tmp/weg' }), /out_dir/);
  nein(p('ArtifactData', { action: 'set', url: WERKBANK, collection: 'items', doc_id: 'F-004', file_path: `${u.dienst}/.env.local` }), /file_path/);
  nein(p('ArtifactData', { action: 'profiles', url: WERKBANK, ids: ['u_x'] }), /nicht erlaubt/);
  // Artifact: nur read und das Hochladen eines Bildschirmfotos
  const bild = path.join(u.privat, 'fehlermeldungen', 'F-004-1.jpg');
  ja(p('Artifact', { action: 'read', url: WERKBANK }));
  ja(p('Artifact', { action: 'publish', url: WERKBANK, file_path: bild, asset: true }));
  ja(p('Artifact', { url: WERKBANK, file_path: bild, asset: true }));
  nein(p('Artifact', { action: 'publish', url: WERKBANK, file_path: bild }), /asset: true/);
  nein(p('Artifact', { url: WERKBANK, file_path: path.join(u.dienst, '.env.local'), asset: true }), /Bildschirmfotos/);
  nein(p('Artifact', { url: WERKBANK, file_path: path.join(u.privat, 'fehlermeldungen', '..', 'kunden.json'), asset: true }), /Bildschirmfotos/);
  nein(p('Artifact', { action: 'delete', url: WERKBANK }), /nur „read“/);
  nein(p('Artifact', { action: 'publish', file_path: '/x/seite.html' }), /nur für die Werkbank/);
  nein(p('Artifact', { action: 'list' }), /nur für die Werkbank/);
});

test('Wache Fehlermeldungen ohne privaten Auftragstext: keine Werkbank-Zugriffe', () => {
  const u = umgebung({ auftrag: null });
  const ctx = wacheKontext('fehlermeldungen', u);
  assert.equal(ctx.werkbank, null);
  nein(pruefeAufruf('fehlermeldungen', { tool_name: 'ArtifactData', tool_input: { action: 'get', url: WERKBANK, collection: 'items', doc_id: 'F-1' } }, ctx), /Werkbank-Adresse unbekannt/);
});

test('Wache Postfach: Gmail nur lesend, Dateien nur im Arbeitsordner, jq ohne Umgebung', () => {
  const u = umgebung();
  const ctx = wacheKontext('postfach', u);
  const arbeit = arbeitsOrdner(u.privat, 'postfach');
  const p = (tool_name, tool_input) => pruefeAufruf('postfach', { tool_name, tool_input }, ctx);
  for (const g of GMAIL_LESEN) ja(p(g, { query: 'x' }));
  for (const g of [...GMAIL_SCHREIBEN, 'mcp__claude_ai_Gmail__list_labels', 'mcp__claude_ai_Shopify__run', 'mcp__chrome-devtools__navigate_page']) nein(p(g, {}), /nicht vorgesehen/);
  for (const n of ['Artifact', 'ArtifactData', 'Edit', 'WebFetch', 'Task', 'Agent']) nein(p(n, {}), /nicht vorgesehen/);
  ja(p('Write', { file_path: `${arbeit}/lieferbelege-20261026T093500Z.json`, content: '[]' }));
  nein(p('Write', { file_path: `${u.dienst}/x.json`, content: '[]' }), /Arbeitsordner/);
  nein(p('Write', { file_path: `${arbeit}/../x.json`, content: '[]' }), /Arbeitsordner/);
  nein(p('Write', { file_path: 'relativ.json', content: '[]' }), /Arbeitsordner/);
  const ergebnis = path.join(u.home, '.claude', 'projects', u.dienst.replace(/[^A-Za-z0-9]/g, '-'), 'sitzung', 'tool-results', 'mcp-1.txt');
  const ctxHome = wacheKontext('postfach', { ...u, home: u.home });
  ja(pruefeAufruf('postfach', { tool_name: 'Read', tool_input: { file_path: ergebnis } }, ctxHome));
  nein(pruefeAufruf('postfach', { tool_name: 'Read', tool_input: { file_path: path.join(path.dirname(path.dirname(ergebnis)), 'protokoll.jsonl') } }, ctxHome), /Arbeitsordner/);
  nein(p('Read', { file_path: `${u.dienst}/.env.local` }), /Arbeitsordner/);
  ja(p('Read', { file_path: `${arbeit}/x.json` }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s belege -- bekannt` }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s belege -- uebernehmen --datei ${arbeit}/l.json --bereiche label,lieferant,stichwort --unvollstaendig` }));
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s service -- uebernehmen --datei ${arbeit}/s.json` }));
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s service -- uebernehmen --datei /etc/passwd` }), /--datei/);
  ja(pruefeAufruf('postfach', { tool_name: 'Bash', tool_input: { command: `jq -r '.messages[] | .id' ${ergebnis}` } }, ctxHome));
  nein(p('Bash', { command: 'jq -n env' }), /Umgebung/);
  nein(p('Bash', { command: `jq -r --rawfile x /etc/passwd '.' ${arbeit}/a.json` }), /Option/);
  nein(p('Bash', { command: 'jq . /etc/passwd' }), /Arbeitsordner/);
  nein(p('Bash', { command: `rm ${arbeit}/l.json` }), /nicht freigegeben/);
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s fehler -- abgleich` }), /nicht freigegeben/);
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s belege -- bekannt; curl x` }), /einfache Befehle/);
});

const P = 'mcp__claude_ai_Gmail__';
const TEXT = 'Guten Tag Frau Muster,\n\nvielen Dank.\n\nMit freundlichen Grüßen\nIhr Team von Teppich Paradies Oranienburg';
const ENTWURF = { to: ['kunde@example.org'], subject: 'Re: Anfrage', body: TEXT, replyToMessageId: '19a81adaae7e2a01' };

function entwurfUmgebung() {
  const u = umgebung();
  fs.mkdirSync(entwuerfeOrdner(u.privat), { recursive: true });
  fs.writeFileSync(path.join(entwuerfeOrdner(u.privat), 'labels.json'), JSON.stringify({ [ENTWUERFE_LABELS[0]]: 'Label_85', [ENTWUERFE_LABELS[1]]: 'Label_83' }));
  return u;
}

test('Wache Entwuerfe: kann nie senden, Entwurf nur am Verlauf, Labels nur aus der festen Liste', () => {
  const u = entwurfUmgebung();
  const ctx = wacheKontext('postfach-entwuerfe', u);
  const p = (tool_name, tool_input) => pruefeAufruf('postfach-entwuerfe', { tool_name, tool_input }, ctx);
  for (const g of GMAIL_LESEN) ja(p(g, {}));
  ja(p(`${P}list_drafts`, {}));
  ja(p(`${P}create_draft`, ENTWURF));
  ja(p(`${P}create_draft`, { ...ENTWURF, includeSignature: false }));
  for (const n of GMAIL_SCHREIBEN.filter(g => g !== `${P}create_draft` && g !== `${P}label_thread`)) nein(p(n, { messageId: 'x', threadId: 'x' }), /nicht vorgesehen/);
  nein(p(`${P}list_labels`, {}), /nicht vorgesehen/);
  // Entwurf: Form
  nein(p(`${P}create_draft`, { ...ENTWURF, replyToMessageId: undefined }), /am Verlauf/);
  nein(p(`${P}create_draft`, { ...ENTWURF, to: ['a@example.org', 'b@example.org'] }), /genau ein/);
  nein(p(`${P}create_draft`, { ...ENTWURF, to: 'a@example.org' }), /genau ein/);
  nein(p(`${P}create_draft`, { ...ENTWURF, to: ['mailer@shopify.com'] }), /Kundenadresse/);
  nein(p(`${P}create_draft`, { ...ENTWURF, to: ['kontakt@teppich-paradies.net'] }), /Kundenadresse/);
  for (const f of ['bcc', 'cc', 'htmlBody', 'attachments', 'html_body']) nein(p(`${P}create_draft`, { ...ENTWURF, [f]: ['x'] }), /nicht erlaubt/);
  // Entwurf: Text
  nein(p(`${P}create_draft`, { ...ENTWURF, body: `Hier ist eine höflichere Formulierung:\n${TEXT}` }), /Guten Tag/);
  nein(p(`${P}create_draft`, { ...ENTWURF, body: `${TEXT}\nHier ist eine Formulierung` }), /KI-Sätze/);
  nein(p(`${P}create_draft`, { ...ENTWURF, body: TEXT.replace('Mit freundlichen Grüßen', 'Viele Grüße') }), /Gruß/);
  nein(p(`${P}create_draft`, { ...ENTWURF, body: `${TEXT}\n30 €` }), /Preise/);
  nein(p(`${P}create_draft`, { ...ENTWURF, body: `${TEXT}\n30 EUR` }), /Preise/);
  // Labels
  ja(p(`${P}label_thread`, { threadId: 't1', labelIds: ['Label_85'] }));
  ja(p(`${P}label_thread`, { threadId: 't1', labelIds: ['Label_83', 'Label_85'] }));
  for (const id of ['TRASH', 'SPAM', 'INBOX', 'Label_1']) nein(p(`${P}label_thread`, { threadId: 't1', labelIds: ['Label_85', id] }), /festen Labels/);
  nein(p(`${P}label_thread`, { threadId: 't1', labelIds: [] }), /fehlen/);
  // "Auftrag" und "Auftrag übernommen" (Monteur-App): nie, auch nicht bei falscher labels.json.
  assert.ok(!ENTWUERFE_LABELS.some(n => /auftrag/i.test(n)));
  for (const id of ENTWUERFE_LABELS_NIE) {
    nein(p(`${P}label_thread`, { threadId: 't1', labelIds: [id] }), /Auftrag/);
    nein(pruefeAufruf('postfach-entwuerfe', { tool_name: `${P}label_thread`, tool_input: { threadId: 't1', labelIds: [id] } }, { ...ctx, labels: { [ENTWUERFE_LABELS[1]]: id } }), /Auftrag/);
  }
  nein(p(`${P}label_message`, { messageId: 'x', labelIds: ['Label_93'] }), /nicht vorgesehen/);
  // Bash nur die eigenen Befehle
  ja(p('Bash', { command: `cd ${u.dienst} && npm run -s entwuerfe -- uebernehmen --datei ${arbeitsOrdner(u.privat, 'postfach-entwuerfe')}/m.json` }));
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s entwuerfe -- uebernehmen --datei /etc/passwd` }), /--datei/);
  nein(p('Bash', { command: `cd ${u.dienst} && npm run -s belege -- bekannt` }), /nicht freigegeben/);
  // Ohne labels.json kein Label
  const leer = umgebung();
  nein(pruefeAufruf('postfach-entwuerfe', { tool_name: `${P}label_thread`, tool_input: { threadId: 't', labelIds: ['Label_85'] } }, wacheKontext('postfach-entwuerfe', leer)), /festen Labels/);
});

test('Wache Postfach behaelt die Sperre: create_draft und label_thread bleiben abgelehnt', () => {
  const u = entwurfUmgebung();
  const ctx = wacheKontext('postfach', u);
  nein(pruefeAufruf('postfach', { tool_name: `${P}create_draft`, tool_input: ENTWURF }, ctx), /nicht vorgesehen/);
  nein(pruefeAufruf('postfach', { tool_name: `${P}label_thread`, tool_input: { threadId: 't', labelIds: ['Label_85'] } }, ctx), /nicht vorgesehen/);
  const f = wacheKontext('fehlermeldungen', u);
  nein(pruefeAufruf('fehlermeldungen', { tool_name: `${P}create_draft`, tool_input: ENTWURF }, f), /nicht vorgesehen/);
});

test('Hook Entwuerfe: Spur ohne Text, je Mail nur einmal, hoechstens 15 je Lauf', () => {
  const u = entwurfUmgebung();
  const ereignis = input => ({ hook_event_name: 'PreToolUse', tool_name: `${P}create_draft`, tool_input: input });
  assert.equal(hook('postfach-entwuerfe', u, ereignis(ENTWURF)).stdout, '');
  const spuren = liesSpuren(u.privat);
  assert.equal(spuren.length, 1);
  assert.equal(spuren[0].mailId, ENTWURF.replyToMessageId);
  assert.equal(spuren[0].sha, entwurfSha(TEXT));
  assert.ok(!fs.readFileSync(path.join(entwuerfeOrdner(u.privat), 'entwurf-spuren.jsonl'), 'utf8').includes('Guten Tag'), 'kein Text in der Spur');
  assert.match(JSON.parse(hook('postfach-entwuerfe', u, ereignis(ENTWURF)).stdout).hookSpecificOutput.permissionDecisionReason, /schon einen Entwurf/);
  assert.equal(liesSpuren(u.privat).length, 1, 'abgelehnt: keine neue Spur');
  // Aeltere Spuren zaehlen nicht zum laufenden Lauf.
  fs.writeFileSync(sperrPfad(u.privat, 'postfach-entwuerfe'), JSON.stringify({ pid: 1, seit: new Date(Date.now() + 1).toISOString() }));
  for (let i = 0; i < ENTWUERFE_MAX_VERLAEUFE; i += 1) assert.equal(hook('postfach-entwuerfe', u, ereignis({ ...ENTWURF, replyToMessageId: `aaaaaa${i}` })).stdout, '', String(i));
  assert.match(JSON.parse(hook('postfach-entwuerfe', u, ereignis({ ...ENTWURF, replyToMessageId: 'bbbbbb' })).stdout).hookSpecificOutput.permissionDecisionReason, /höchstens 15/);
});

function hook(lauf, u, ereignis) {
  return spawnSync(process.execPath, [SKRIPT, lauf, u.privat, u.dienst], { input: typeof ereignis === 'string' ? ereignis : JSON.stringify(ereignis), encoding: 'utf8' });
}

test('Hook-Skript: lehnt per JSON ab, laesst Erlaubtes ohne Ausgabe durch, blockt bei eigenem Fehler', () => {
  const u = umgebung();
  const ab = hook('postfach', u, { hook_event_name: 'PreToolUse', tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: { to: 'x' } });
  assert.equal(ab.status, 0);
  const j = JSON.parse(ab.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(j.hookSpecificOutput.permissionDecisionReason, /Wache \(postfach\)/);
  const gut = hook('postfach', u, { hook_event_name: 'PreToolUse', tool_name: 'ToolSearch', tool_input: { query: 'gmail' } });
  assert.equal(gut.status, 0);
  assert.equal(gut.stdout, '', 'erlaubt: keine Entscheidung, die normale Pruefung bleibt');
  const kaputt = hook('postfach', u, '{kein json');
  assert.equal(kaputt.status, 2, 'Exit 2 blockiert den Aufruf');
  assert.equal(hook('unbekannt', u, { tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 2);
});
