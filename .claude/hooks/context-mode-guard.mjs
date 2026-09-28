#!/usr/bin/env node
// PreToolUse-Bruecke fuer die Sandbox-Tools von Context Mode (ctx_execute,
// ctx_execute_file, ctx_batch_execute). Diese Tools fuehren Shell-Code aus,
// ohne dass das Bash-Tool beteiligt ist - die harten Grenzen in
// git-gh-guard.mjs und theme-delete-guard.mjs wuerden sonst nicht greifen.
//
// Regeln (fail closed):
// 1. Shell-Code (language "shell", jeder Befehl in ctx_batch_execute) laeuft
//    durch dieselben Guards wie ein Bash-Befehl. Deny dort = deny hier.
// 2. Erlaubt sind nur javascript, typescript, python und shell. Andere
//    Sprachen koennen Prozesse starten, die hier niemand prueft.
// 3. javascript/typescript/python duerfen keine Prozesse starten - dafuer ist
//    language "shell" da, das die Guards sieht.
// 4. Stuerzt ein Guard ab oder liefert Unlesbares: deny.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const GUARDS = ['git-gh-guard.mjs', 'theme-delete-guard.mjs'];
const SPRACHEN = new Set(['shell', 'javascript', 'typescript', 'python']);
const PROZESS = [
  /child_process/, /\bexecSync\b/, /\bexecFile(Sync)?\b/, /\bspawn(Sync)?\s*\(/, /\bfork\s*\(/,
  /\bsubprocess\b/, /\bos\.(system|popen|exec\w*|spawn\w*)\b/, /\bpty\b/, /\bcommands\.getoutput\b/,
  /\bBun\.(spawn|spawnSync|\$)/, /\bDeno\.(Command|run)\b/, /\$`/, /\bimport\s*\(\s*['"`]zx/,
];

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

function verweigern(grund) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Blockiert durch .claude/hooks/context-mode-guard.mjs: ${grund}`,
    },
  })}\n`);
  process.exit(0);
}

function guardUrteil(guard, command, input) {
  const lauf = spawnSync(process.execPath, [path.join(HIER, guard)], {
    input: JSON.stringify({ ...input, tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: process.env,
    timeout: 20000,
  });
  if (lauf.status !== 0 || lauf.error) return { deny: `${guard} lief nicht sauber (Status ${lauf.status})` };
  const text = (lauf.stdout || '').trim();
  if (!text) return {};
  try {
    const out = JSON.parse(text.split('\n').pop());
    const h = out?.hookSpecificOutput;
    if (h?.permissionDecision === 'deny') return { deny: h.permissionDecisionReason || guard };
    return {};
  } catch {
    return { deny: `${guard} lieferte keine lesbare Antwort` };
  }
}

let input;
try {
  input = await stdinJson();
} catch {
  verweigern('Hook-Eingabe nicht lesbar');
}

const tool = String(input?.tool_name ?? '');
const ti = input?.tool_input ?? {};
const shell = [];

if (/ctx_batch_execute$/.test(tool)) {
  let befehle = ti.commands;
  if (typeof befehle === 'string') {
    try { befehle = JSON.parse(befehle); } catch { verweigern('commands nicht lesbar'); }
  }
  for (const b of Array.isArray(befehle) ? befehle : []) {
    shell.push(typeof b === 'string' ? b : String(b?.command ?? ''));
  }
} else if (/ctx_execute(_file)?$/.test(tool)) {
  const sprache = String(ti.language ?? '').toLowerCase();
  const code = String(ti.code ?? '');
  if (!SPRACHEN.has(sprache)) verweigern(`Sprache "${sprache}" ist nicht freigegeben (nur ${[...SPRACHEN].join(', ')}).`);
  if (sprache === 'shell') shell.push(code);
  else if (PROZESS.some((m) => m.test(code))) {
    verweigern(`${sprache}-Code startet Prozesse. Shell-Befehle mit language "shell" ausfuehren, damit die Guards sie pruefen.`);
  }
}

for (const command of shell) {
  for (const guard of GUARDS) {
    const urteil = guardUrteil(guard, command, input);
    if (urteil.deny) verweigern(urteil.deny);
  }
}
process.exit(0);
