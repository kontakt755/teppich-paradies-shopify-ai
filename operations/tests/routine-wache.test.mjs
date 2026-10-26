import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruefeAufruf, wacheKontext, befehlsTeile, werkbankAus, woerter } from '../lib/routine-wache.mjs';
import { auftragPfad, arbeitsOrdner, GMAIL_LESEN, GMAIL_SCHREIBEN } from '../lib/routinen.mjs';

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
