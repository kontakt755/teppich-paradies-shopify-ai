// Blockiert gefaehrliche Shopify-Mutationen auf dem CLI-Weg - in jedem
// Berechtigungsmodus, auch unter bypassPermissions.
//
// Warum es diesen Hook gibt: shopify-mcp-guard.mjs sperrt das Loeschen nur auf
// dem MCP-Weg. `shopify store execute --allow-mutations` ist global freigegeben
// und lief an jeder Grenze vorbei; die Pruefung des Aufbaus vom 2026-11-03 hat
// das mit productDelete nachgestellt. Datenpflege laeuft hier meist ueber
// --query-file, deshalb reicht der Befehlstext allein nicht: Der Hook liest die
// Dateien.
//
// Was verweigert wird:
//   - jeder Aufruf einer Loeschmutation aus shopify-mcp-guard.mjs und themeDelete,
//     auch wenn die IDs erst per Variable kommen,
//   - jede Mutation mit der ID des Fallback-Themes,
//   - dasselbe, wenn die Abfrage erst beim Lauf feststeht (Schleife ueber Dateien,
//     Datei entsteht im selben Befehl): Dann wird der ganze Befehlstext samt der
//     Dateien aus seinen Platzhaltern (batches/*.gql) durchsucht.
//
// Warum dort nicht einfach alles gesperrt wird: Nachgestellt an 456 alten Befehlen
// haette das 82 Massenlaeufe gestoppt, darunter freigegebene Rabattrueckstellungen.
// Ein Pfad aus einer Shell-Variable ohne Platzhalter bleibt damit ungeprueft.
//
// Geprueft wird auch ohne sichtbares --allow-mutations, denn die CLI erlaubt
// Mutationen ebenso per SHOPIFY_FLAG_ALLOW_MUTATIONS aus der Umgebung.
//
// Was bewusst durchlaeuft: Abfragen und alle uebrigen Mutationen, siehe
// shopify-mcp-guard.mjs. Archivieren ist kein Loeschen.
//
// Nicht abgedeckt: Skripte, die die CLI selbst aufrufen, zum Beispiel die vom
// Inhaber freigegebene Restbestand-Pruefung. Dieser Hook sieht nur den Befehl.

import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { pruefe, aufrufe, LOESCHEN, THEME_IMMER } from './shopify-mcp-guard.mjs';

const NAMEN = new Set([...THEME_IMMER, ...Object.keys(LOESCHEN)]);

/**
 * Zerlegt einen Befehl in Abschnitte aus Woertern. `offen` markiert ein Wort, das
 * die Shell erst beim Lauf einsetzt ($x, Befehlsersetzung): sein Wert ist hier unbekannt.
 */
export function zerlege(befehl) {
  const abschnitte = [[]];
  let wort = null;
  const fertig = () => { if (wort) abschnitte.at(-1).push(wort); wort = null; };
  const zeichen = (z, offen = false) => { wort ??= { text: '', offen: false }; wort.text += z; wort.offen ||= offen; };
  for (let i = 0; i < befehl.length; i += 1) {
    const z = befehl[i];
    if (z === "'") {
      const ende = befehl.indexOf("'", i + 1);
      const stueck = befehl.slice(i + 1, ende === -1 ? undefined : ende);
      wort ??= { text: '', offen: false };
      wort.text += stueck;
      i = ende === -1 ? befehl.length : ende;
    } else if (z === '"') {
      wort ??= { text: '', offen: false };
      for (i += 1; i < befehl.length && befehl[i] !== '"'; i += 1) {
        if (befehl[i] === '\\' && '"\\$`'.includes(befehl[i + 1])) { i += 1; zeichen(befehl[i]); } else zeichen(befehl[i], befehl[i] === '$' || befehl[i] === '`');
      }
    } else if (z === '\\') {
      i += 1;
      if (befehl[i] !== '\n' && i < befehl.length) zeichen(befehl[i]);
    } else if (z === ' ' || z === '\t') fertig();
    else if (z === '\n' || z === ';' || z === '|' || z === '&' || z === '(' || z === ')') { fertig(); if (abschnitte.at(-1).length) abschnitte.push([]); } else zeichen(z, z === '$' || z === '`');
  }
  fertig();
  return abschnitte.filter(a => a.length);
}

function wertVon(worte, i, lang, kurz) {
  const w = worte[i];
  if (w.text === lang || (kurz && w.text === kurz)) return worte[i + 1] ?? { text: '', offen: true };
  if (w.text.startsWith(`${lang}=`)) return { text: w.text.slice(lang.length + 1), offen: w.offen };
  return null;
}

function istStoreExecute(worte) {
  const t = worte.map(w => w.text);
  return t.some((x, i) => /(^|\/)shopify$/.test(x) && t.slice(i + 1).filter(y => !y.startsWith('-')).slice(0, 2).join(' ') === 'store execute');
}

/** Liest Abfrage und Variablen eines Aufrufs; `offen` nennt den Grund, wenn das nicht geht. */
function aufrufDaten(worte, ordner, leseDatei) {
  let query; let variablen = {}; let offen = null;
  const lies = (w, art) => {
    if (w.offen) { offen = `${art} steht in einer Shell-Variable`; return null; }
    try { return leseDatei(path.resolve(ordner, w.text)); } catch { offen = `${art} ${w.text} ist nicht lesbar`; return null; }
  };
  const json = (text, art) => {
    try { return JSON.parse(text); } catch { offen = `${art} sind kein JSON`; return {}; }
  };
  for (let i = 0; i < worte.length; i += 1) {
    const q = wertVon(worte, i, '--query', '-q');
    const qd = wertVon(worte, i, '--query-file');
    const v = wertVon(worte, i, '--variables', '-v');
    const vd = wertVon(worte, i, '--variable-file');
    if (q) { if (q.offen) offen = 'die Abfrage steht in einer Shell-Variable'; else query = q.text; }
    if (qd) query = lies(qd, 'die Abfragedatei') ?? query;
    if (v) { if (v.offen) offen = 'die Variablen stehen in einer Shell-Variable'; else variablen = json(v.text, 'die Variablen'); }
    if (vd) { const t = lies(vd, 'die Variablendatei'); if (t !== null) variablen = json(t, 'die Variablen'); }
  }
  if (query === undefined) offen ??= 'die Abfrage fehlt';
  return { query, variablen, offen };
}

/** Abfrage steht erst beim Lauf fest: Befehlstext und Dateien aus Platzhaltern durchsuchen. */
function grobePruefung(befehl, abschnitte, ordner, leseDatei, opt) {
  const texte = [befehl];
  for (const w of abschnitte.flat()) {
    if (!w.text.includes('*') || w.text.includes('$')) continue;
    let dateien = [];
    try { dateien = globSync(w.text, { cwd: ordner }); } catch { dateien = []; }
    for (const d of dateien.slice(0, 5000)) {
      try { texte.push(leseDatei(path.resolve(ordner, d))); } catch { /* Verzeichnis oder nicht lesbar */ }
    }
  }
  const text = texte.join('\n');
  const treffer = [...NAMEN].find(n => new RegExp(`\\b${n}\\s*[({]`).test(text));
  if (treffer) return LOESCHGRUND(treffer);
  return pruefe({ query: text }, opt);
}

const LOESCHGRUND = name => `${name} loescht Daten - Loeschen braucht die ausdrueckliche Freigabe des Inhabers (AGENTS.md "NIEMALS ohne ausdrueckliche Freigabe"). Ausgelaufenes wird archiviert, nicht geloescht`;

/** Entscheidung fuer einen Bash-Befehl: Grund (Text), wenn er verweigert wird, sonst null. */
export function pruefeBefehl(befehl, { cwd = process.cwd(), leseDatei = p => readFileSync(p, 'utf8'), fallbackId, tiefe = 0 } = {}) {
  if (typeof befehl !== 'string' || !/shopify/.test(befehl)) return null;
  const opt = fallbackId === undefined ? {} : { fallbackId };
  const abschnitte = zerlege(befehl);
  // In $(...) und Backticks gelten eigene Anfuehrungszeichen, die zerlege nicht nachbildet.
  if (/\$\(|`/.test(befehl) && /shopify\s+store\s+execute/.test(befehl)) {
    const grund = grobePruefung(befehl, [], cwd, leseDatei, opt);
    if (grund) return grund;
  }
  let ordner = cwd;
  for (const worte of abschnitte) {
    if (worte[0]?.text === 'cd' && worte[1] && !worte[1].offen) ordner = path.resolve(ordner, worte[1].text);
    // Befehl in einem Wort: bash -c '...', x="$(...)", Backticks.
    if (tiefe < 3) {
      for (const w of worte) {
        if (!/shopify\s+store\s+execute/.test(w.text)) continue;
        const grund = pruefeBefehl(w.text.replaceAll('`', ' ; '), { cwd: ordner, leseDatei, fallbackId, tiefe: tiefe + 1 });
        if (grund) return grund;
      }
    }
    if (!istStoreExecute(worte)) continue;
    const { query, variablen, offen } = aufrufDaten(worte, ordner, leseDatei);
    if (query) {
      const grund = pruefe({ query, variables: variablen }, opt);
      if (grund) return grund;
      let treffer;
      try {
        treffer = aufrufe(query, variablen, NAMEN)[0]?.name;
      } catch {
        treffer = [...NAMEN].find(n => new RegExp(`\\b${n}\\s*[({]`).test(query));
      }
      if (treffer) return LOESCHGRUND(treffer);
    }
    if (offen) {
      const grund = grobePruefung(befehl, abschnitte, ordner, leseDatei, opt);
      if (grund) return grund;
    }
  }
  return null;
}

// Nur als Hook ausfuehren, nicht beim Import aus den Tests.
if (process.argv[1]?.endsWith('shopify-cli-guard.mjs')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  let eingabe = {};
  try { eingabe = JSON.parse(input || '{}'); } catch { process.exit(0); }
  const grund = pruefeBefehl(eingabe?.tool_input?.command, { cwd: eingabe?.cwd || process.cwd() });
  if (grund) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blockiert durch .claude/hooks/shopify-cli-guard.mjs: ${grund}. ` +
          'Nicht umgehen - ist das wirklich freigegeben, erledigt es der Nutzer im Shopify-Admin oder hebt die Regel in der Hook-Datei auf.',
      },
    })}\n`);
  }
}
