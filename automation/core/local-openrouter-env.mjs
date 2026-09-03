import fs from 'node:fs';
import path from 'node:path';

const LINE = /^\s*export\s+(OPENROUTER_[A-Z0-9_]+)=('([^']*)'|"([^"]*)"|([^\s#]+))\s*$/;

export function loadLocalOpenRouterEnvironment({ filePath = '.env.local', env = process.env, io = fs } = {}) {
  const absolutePath = path.resolve(filePath);
  if (!io.existsSync(absolutePath)) return { loaded: [], filePath: absolutePath };
  const loaded = [];
  for (const line of io.readFileSync(absolutePath, 'utf8').split('\n')) {
    const match = line.match(LINE);
    if (!match || env[match[1]]) continue;
    env[match[1]] = match[3] ?? match[4] ?? match[5];
    loaded.push(match[1]);
  }
  return { loaded, filePath: absolutePath };
}
