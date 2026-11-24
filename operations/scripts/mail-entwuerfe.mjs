#!/usr/bin/env node
/**
 * Legt Gmail-Entwuerfe mit Anhang aus $TP_PRIVAT_DIR/mail-entwuerfe/eingang/ an (lib/mail-entwuerfe.mjs).
 * Sendet nie. Laeuft als Mac-Dienst net.teppich-paradies.mail-entwuerfe alle 5 Minuten.
 *
 *   npm run -s mail-entwuerfe
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { privatDir } from '../lib/routinen.mjs';
import { lesePostfach } from '../lib/nachfass-versand.mjs';
import { postfachZugangPfad } from '../lib/postfach-vorpruefung.mjs';
import { durchgang, ordner } from '../lib/mail-entwuerfe.mjs';

export async function main({ privat = privatDir(), aus = t => console.log(t), zugangLesen = lesePostfach, ablegen } = {}) {
  const { eingang } = ordner(privat);
  // Leerer Eingang: nichts tun, auch keine Anmeldung.
  if (!fs.existsSync(eingang) || !fs.readdirSync(eingang).some(n => n.endsWith('.json') && !n.startsWith('.'))) return 0;
  const z = zugangLesen(postfachZugangPfad(privat));
  if (!z.zugang) throw new Error(`kein Postfach-Zugang (${z.hinweis || 'nachfassen/postfach.json'})`);
  const ergebnis = await durchgang({ privat, zugang: z.zugang, ...(ablegen ? { ablegen } : {}) });
  for (const e of ergebnis) aus(`${new Date().toISOString()} ${e.status} ${e.datei}${e.grund ? `: ${e.grund}` : ''}`);
  return ergebnis.some(e => e.status === 'fehler') ? 1 : 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(`${new Date().toISOString()} ${e.message}`); process.exitCode = 1; });
}
