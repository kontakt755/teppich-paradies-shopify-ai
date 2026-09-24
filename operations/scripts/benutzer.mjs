#!/usr/bin/env node
/**
 * Pflegeskript fuer Mitarbeiterzugaenge des Control Centers.
 *
 *   npm run benutzer -- anlegen
 *   npm run benutzer -- passwort <kuerzel>
 *   npm run benutzer -- deaktivieren <kuerzel>
 *   npm run benutzer -- aktivieren <kuerzel>
 *   npm run benutzer -- liste
 *
 * Passworteingabe ist verdeckt (kein Echo im Terminal) und wird nie geloggt.
 * Die Datei liegt unter $TP_PRIVAT_DIR/benutzer.json (chmod 600), nie im Repo.
 */

import readline from 'node:readline';
import {
  benutzerDateiPfad, leseBenutzer, schreibeBenutzer, benutzerAnlegen,
  passwortSetzen, benutzerDeaktivieren, ROLLEN, BenutzerFehler,
} from '../lib/benutzer.mjs';

function frage(rl, text) {
  return new Promise(resolve => rl.question(text, resolve));
}

/** Verdeckte Passworteingabe - kein Echo, nichts landet in Shell-Historie oder Logs. */
function fragePasswort(text) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(text);
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let eingabe = '';
    function onData(char) {
      char = String(char);
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
        stdin.pause();
        process.stdout.write('\n');
        resolve(eingabe);
        return;
      }
      if (char === '\u0003') { // Ctrl+C
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
        process.stdout.write('\n');
        reject(new Error('Abgebrochen'));
        return;
      }
      if (char === '\u007f' || char === '\b') { // Backspace
        eingabe = eingabe.slice(0, -1);
        return;
      }
      eingabe += char;
    }
    stdin.on('data', onData);
  });
}

function formatBenutzer(liste) {
  if (!liste.length) return '(keine Benutzer angelegt - Notzugang per Einzelpasswort aktiv)';
  const zeilen = liste.map(b => `${b.aktiv === false ? '✗' : '✓'}  ${b.kuerzel.padEnd(12)} ${b.name.padEnd(20)} ${b.rolle}`);
  return zeilen.join('\n');
}

async function main() {
  const [, , befehl, arg1] = process.argv;
  const file = benutzerDateiPfad();

  if (befehl === 'liste') {
    const liste = leseBenutzer(file);
    console.log(`Benutzerdatei: ${file}`);
    console.log(formatBenutzer(liste));
    return;
  }

  if (befehl === 'anlegen') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const name = (await frage(rl, 'Name (Klartext, z.B. "Ahmet"): ')).trim();
      const kuerzel = (await frage(rl, 'Kuerzel (fuer die Anmeldung): ')).trim();
      const rolle = (await frage(rl, `Rolle (${ROLLEN.join('|')}): `)).trim();
      rl.close();
      const passwort = await fragePasswort('Passwort (verdeckt): ');
      const passwortWdh = await fragePasswort('Passwort wiederholen: ');
      if (passwort !== passwortWdh) throw new BenutzerFehler('Passwoerter stimmen nicht ueberein');
      const liste = leseBenutzer(file);
      const neu = benutzerAnlegen(liste, { name, kuerzel, passwort, rolle });
      schreibeBenutzer(neu, file);
      console.log(`Benutzer "${kuerzel}" angelegt (Rolle: ${rolle}). Datei: ${file}`);
    } finally {
      if (!rl.closed) rl.close();
    }
    return;
  }

  if (befehl === 'passwort') {
    if (!arg1) { console.error('Kuerzel fehlt: npm run benutzer -- passwort <kuerzel>'); process.exitCode = 1; return; }
    const passwort = await fragePasswort('Neues Passwort (verdeckt): ');
    const passwortWdh = await fragePasswort('Passwort wiederholen: ');
    if (passwort !== passwortWdh) throw new BenutzerFehler('Passwoerter stimmen nicht ueberein');
    const liste = leseBenutzer(file);
    const neu = passwortSetzen(liste, arg1, passwort);
    schreibeBenutzer(neu, file);
    console.log(`Passwort fuer "${arg1}" gesetzt.`);
    return;
  }

  if (befehl === 'deaktivieren' || befehl === 'aktivieren') {
    if (!arg1) { console.error(`Kuerzel fehlt: npm run benutzer -- ${befehl} <kuerzel>`); process.exitCode = 1; return; }
    const liste = leseBenutzer(file);
    const neu = benutzerDeaktivieren(liste, arg1, befehl === 'aktivieren');
    schreibeBenutzer(neu, file);
    console.log(`Benutzer "${arg1}" ${befehl === 'aktivieren' ? 'aktiviert' : 'deaktiviert'}.`);
    return;
  }

  console.error('Befehle: anlegen | passwort <kuerzel> | deaktivieren <kuerzel> | aktivieren <kuerzel> | liste');
  process.exitCode = 1;
}

main().catch(e => {
  if (e instanceof BenutzerFehler) console.error(`Fehler: ${e.message}`);
  else console.error(`Fehler: ${e?.message || e}`);
  process.exitCode = 1;
});
