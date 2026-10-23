import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Dienststand beim Start einfrieren: Datenexporte und private Ablagen zaehlen nicht als Update. */
export function dienstversion(root) {
  const hash = createHash('sha256');
  const lesen = relativ => {
    for (const e of readdirSync(join(root, relativ), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === 'tests') continue;
      const p = join(relativ, e.name);
      if (e.isDirectory()) lesen(p);
      else if (/\.(?:m?js|html|css)$/.test(e.name)) hash.update(p).update('\0').update(readFileSync(join(root, p))).update('\0');
    }
  };
  for (const p of ['docs/ai-dashboard', 'scripts', 'operations/lib']) lesen(p);
  return hash.digest('hex').slice(0, 16);
}
