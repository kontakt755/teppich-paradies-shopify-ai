#!/usr/bin/env node
/**
 * Ablage und Auswertung des Laufs postfach-entwuerfe (operations/README.md).
 *
 *   npm run -s entwuerfe -- bekannt                  # Was der Lauf schon eingeordnet hat (Zeitfenster der Suche)
 *   npm run -s entwuerfe -- uebernehmen --datei X    # Messzeilen eines Laufs anhaengen
 *   npm run -s entwuerfe -- auswerten                # Zahlen je Klasse, per IMAP: Antworten nach Entwurf
 *   npm run -s entwuerfe -- auswerten --ohne-postfach
 *   npm run -s entwuerfe -- vergleichen --datei X    # [{mailId, text}]: unveraendert gesendet?
 *
 * Ausgabe nur Zahlen und Kennungen, nie Inhalte.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { privatDir } from '../lib/routinen.mjs';
import { bekanntAktuell, gesendetZaehlen, liesMessung, uebernehmen, vergleichen, zahlen } from '../lib/postfach-entwuerfe.mjs';
import { lesePostfach } from '../lib/nachfass-versand.mjs';
import { postfachZugangPfad } from '../lib/postfach-vorpruefung.mjs';
import { suchenNurLesend } from '../lib/imap-lesen.mjs';

const datei = (argv) => {
  const i = argv.indexOf('--datei');
  if (i < 0 || !argv[i + 1]) throw new Error('--datei fehlt');
  return JSON.parse(fs.readFileSync(argv[i + 1], 'utf8'));
};

export async function main(argv = process.argv.slice(2), { privat = privatDir(), aus = t => console.log(t), suchen = suchenNurLesend, zugangLesen = lesePostfach, jetzt = new Date() } = {}) {
  const [befehl, ...rest] = argv;
  if (befehl === 'bekannt') { aus(JSON.stringify(bekanntAktuell(privat, jetzt))); return 0; }
  if (befehl === 'uebernehmen') { aus(JSON.stringify(uebernehmen(privat, datei(rest)))); return 0; }
  if (befehl === 'vergleichen') { aus(JSON.stringify(vergleichen(privat, datei(rest)), null, 2)); return 0; }
  if (befehl === 'auswerten') {
    const messung = liesMessung(privat);
    const ergebnis = { ...zahlen(messung), gesendetNachEntwurf: null, unveraendertGesendet: 'nicht per IMAP lesbar: npm run -s entwuerfe -- vergleichen --datei X' };
    if (!rest.includes('--ohne-postfach')) {
      const zugang = zugangLesen(postfachZugangPfad(privat));
      if (zugang.zugang) {
        try { ergebnis.gesendetNachEntwurf = await gesendetZaehlen(messung, { zugang: zugang.zugang, suchen }); } catch (e) { ergebnis.gesendetNachEntwurf = `nicht möglich: ${String(e?.message || e).slice(0, 120)}`; }
      } else ergebnis.gesendetNachEntwurf = 'nicht möglich: kein Postfach-Zugang';
    }
    aus(JSON.stringify(ergebnis, null, 2));
    return 0;
  }
  throw new Error('Befehl: bekannt | uebernehmen --datei X | auswerten [--ohne-postfach] | vergleichen --datei X');
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 1; });
}
