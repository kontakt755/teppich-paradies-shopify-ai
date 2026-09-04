import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const tailscaleCli = fs.existsSync('/Applications/Tailscale.app/Contents/MacOS/Tailscale')
  ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  : 'tailscale';
const ip = execFileSync(tailscaleCli, ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0];
if (!/^100\./.test(ip)) throw new Error('Keine private Tailscale-IPv4-Adresse gefunden.');
const stateDir = path.join(os.homedir(), 'Library/Application Support/TP AI Dashboard');
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const serverPath = path.join(root, 'automation/dashboard/server.mjs');
const pidPath = path.join(stateDir, 'server.pid');
if (fs.existsSync(pidPath)) {
  const previousPid = Number(fs.readFileSync(pidPath, 'utf8').trim());
  if (Number.isInteger(previousPid) && previousPid > 1) {
    try {
      const commandLine = execFileSync('ps', ['-p', String(previousPid), '-o', 'command='], { encoding: 'utf8' });
      if (commandLine.includes(serverPath)) process.kill(previousPid, 'SIGTERM');
    } catch { /* already stopped */ }
  }
}
try { execFileSync('screen', ['-S', 'tp-ai-dashboard', '-X', 'quit'], { stdio: 'ignore' }); } catch { /* not running */ }
await new Promise(resolve => setTimeout(resolve, 500));
const command = `cd /private/tmp && exec env DASHBOARD_HOST=${ip} DASHBOARD_PORT=4310 DASHBOARD_STATE_DIR=${JSON.stringify(stateDir)} ${JSON.stringify(process.execPath)} ${JSON.stringify(serverPath)}`;
execFileSync('screen', ['-dmS', 'tp-ai-dashboard', '/bin/sh', '-lc', command]);
let ready = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 150));
  try { ready = (await fetch(`http://${ip}:4310/health`)).ok; } catch { /* still starting */ }
  if (ready) break;
}
if (!ready) throw new Error('Dashboard wurde nicht innerhalb von 12 Sekunden erreichbar.');
console.log(JSON.stringify({ status: 'STARTED', address: `http://${ip}:4310`, session: 'tp-ai-dashboard' }));
