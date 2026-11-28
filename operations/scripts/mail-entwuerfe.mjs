#!/usr/bin/env node
/**
 * Legt Gmail-Entwuerfe mit Anhang aus $TP_PRIVAT_DIR/mail-entwuerfe/eingang/ an (lib/mail-entwuerfe.mjs).
 * Sendet nie. Laeuft als Mac-Dienst net.teppich-paradies.mail-entwuerfe alle 5 Minuten.
 *
 *   npm run -s mail-entwuerfe
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { liesStatus, privatDir, schreibStatus } from '../lib/routinen.mjs';
import { mitteilung } from '../lib/mac-mitteilung.mjs';
import { lesePostfach } from '../lib/nachfass-versand.mjs';
import { postfachZugangPfad } from '../lib/postfach-vorpruefung.mjs';
import { dropboxOrdner, dropboxStand, durchgang, holeAusDropbox, ordner } from '../lib/mail-entwuerfe.mjs';

export async function main({ privat = privatDir(), dropbox = dropboxOrdner(), aus = t => console.log(t), zugangLesen = lesePostfach, ablegen, fuellen, kopieren, melden = mitteilung, jetzt = new Date() } = {}) {
  const { eingang } = ordner(privat);
  const { geholt, fehler } = holeAusDropbox(dropbox, eingang, kopieren ? { kopieren } : {});
  for (const n of geholt) aus(`${new Date().toISOString()} aus Dropbox geholt: ${n}`);
  for (const f of fehler) aus(`${new Date().toISOString()} Dropbox-Datei bleibt liegen: ${f.datei}: ${f.grund}`);
  // Status fuers Control Center (rotes To-do "Mac-Dienst gestoert"), bevor der Eingang laeuft.
  let alt = {};
  try { alt = liesStatus(privat, 'mail-entwuerfe'); } catch { alt = {}; }
  const { stand, mitteilen } = schreibStatus(privat, 'mail-entwuerfe', dropboxStand(fehler, alt, jetzt), jetzt);
  if (mitteilen) melden('Mail-Entwürfe', stand.meldung);
  // Leerer Eingang: nichts tun, auch keine Anmeldung.
  if (!fs.existsSync(eingang) || !fs.readdirSync(eingang).some(n => n.endsWith('.json') && !n.startsWith('.'))) return 0;
  const z = zugangLesen(postfachZugangPfad(privat));
  if (!z.zugang) throw new Error(`kein Postfach-Zugang (${z.hinweis || 'nachfassen/postfach.json'})`);
  const ergebnis = await durchgang({ privat, zugang: z.zugang, ...(ablegen ? { ablegen } : {}), ...(fuellen ? { fuellen } : {}) });
  for (const e of ergebnis) aus(`${new Date().toISOString()} ${e.status} ${e.datei}${e.grund ? `: ${e.grund}` : ''}`);
  return ergebnis.some(e => e.status === 'fehler') ? 1 : 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(`${new Date().toISOString()} ${e.message}`); process.exitCode = 1; });
}
