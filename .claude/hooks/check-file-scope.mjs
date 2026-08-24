#!/usr/bin/env node
// PreToolUse-Hook (Edit/Write): blockt Schreibzugriffe außerhalb der für den
// aktuellen Task deklarierten allowedFiles (siehe workflow/router.mjs
// normalizeAllowedFiles). Fail-open: ohne .workflow/task.json oder ohne
// deklarierten Scope wird nichts erzwungen - dieser Hook kann nur durchsetzen,
// was tatsächlich deklariert wurde (npm run workflow:route -- "..." --allowed-files "a/**,b/c.liquid").
// Ergänzt, ersetzt nicht die Postflight-Prüfung gegen den echten git diff.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { matchesAnyGlob } from '../../workflow/router.mjs';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (!['Edit', 'Write'].includes(payload.tool_name)) process.exit(0);

const targetPath = payload.tool_input?.file_path;
if (!targetPath) process.exit(0);

const root = process.cwd();
const taskPath = path.join(root, '.workflow', 'task.json');
if (!existsSync(taskPath)) process.exit(0);

let task;
try { task = JSON.parse(readFileSync(taskPath, 'utf8')); } catch { process.exit(0); }

const allowedFiles = task?.allowedFiles;
if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) process.exit(0);

const relative = path.isAbsolute(targetPath) ? path.relative(root, targetPath) : targetPath;
// Außerhalb des Repo-Roots (z. B. path.relative beginnt mit "..") ist per
// Definition nie im deklarierten Scope enthalten.
if (relative.startsWith('..') || matchesAnyGlob(relative, allowedFiles)) process.exit(0);

console.error(`BLOCKED: ${relative} liegt außerhalb der für ${task.taskId ?? 'diesen Task'} deklarierten allowedFiles (${allowedFiles.join(', ')}). Bei Bedarf npm run workflow:route erneut mit angepasstem --allowed-files ausführen.`);
process.exit(2);
