// Blockiert gefaehrliche Shopify-Mutationen auf dem MCP-Weg - in jedem
// Berechtigungsmodus, auch unter bypassPermissions.
//
// Warum es diesen Hook gibt: Alle uebrigen Guards haengen am Matcher "Bash"
// und lesen tool_input.command. Der Shopify-MCP (Werkzeug graphql_mutation)
// ist in .claude/settings.json pauschal freigegeben; ein Loeschen ueber ihn lief
// an jeder Grenze vorbei (Bericht docs/analyse/claude-system-2026-10-16.md,
// Optimieren Nr. 5). AGENTS.md "NIEMALS ohne ausdrueckliche Freigabe" war fuer
// diesen Weg nur Prosa.
//
// Was verweigert wird:
//   - themeDelete, immer (Rueckfallpunkt eines Live-Gangs, siehe
//     theme-delete-guard.mjs). Der MCP sperrt das heute selbst; dieser Hook
//     haengt nicht davon ab, dass das so bleibt.
//   - jede Mutation, die die Fallback-ID aus domains/shopify/live-theme.json
//     (fallback.themeId) traegt - damit auch themePublish/themeUpdate und
//     themeFilesUpsert auf das Fallback-Theme ("niemals loeschen oder
//     ueberschreiben").
//   - Loeschmutationen (LOESCHEN unten) mit mindestens einer ID.
//
// Was bewusst durchlaeuft: productUpdate, productSet, productVariantsBulkUpdate
// (auch Preise), metafieldsSet, publishablePublish, themeFilesUpsert auf andere
// Themes. Diese Aenderungen laufen nach Freigabe des Inhabers, z. B. die
// Rabatt-Rueckstellung am 19.10. - eine harte Sperre wuerde genau die
// freigegebenen Laeufe aufhalten. Archivieren (status ARCHIVED) ist kein
// Loeschen und bleibt erlaubt.
//
// Fail-open bei kaputtem Input: Ist stdin kein JSON oder fehlt die Query,
// laeuft der Aufruf durch. Der MCP validiert die Query ohnehin gegen sein
// Schema; ein Hook, der bei jedem Formatfehler blockiert, wuerde abgeschaltet.
//
// Ist eine Loeschung wirklich freigegeben, macht sie der Nutzer im
// Shopify-Admin - oder hebt die Regel hier bewusst auf, nicht der Agent.

import { readFileSync } from 'node:fs';

// Mutation -> Name des Arguments, dessen Liste die zu loeschenden IDs traegt.
// null: Einzelloeschung, jede ID im Argument zaehlt.
const LOESCHEN = {
  productDelete: null,
  productVariantsBulkDelete: 'variantsIds',
  collectionDelete: null,
  menuDelete: null,
  discountCodeDelete: null,
  fileDelete: 'fileIds',
};

const THEME_IMMER = new Set(['themeDelete']);

function fallbackThemeId() {
  try {
    const datei = new URL('../../domains/shopify/live-theme.json', import.meta.url);
    const id = String(JSON.parse(readFileSync(datei, 'utf8'))?.fallback?.themeId ?? '').trim();
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// --- Kleiner GraphQL-Leser: nur so viel, wie die Entscheidung braucht ---

function tokens(query) {
  const out = [];
  const re = /\s+|,|#[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\.\.\.|[$!():=@[\]{}|&]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[_A-Za-z][_0-9A-Za-z]*/gy;
  let m;
  while (re.lastIndex < query.length) {
    const start = re.lastIndex;
    m = re.exec(query);
    if (!m) throw new Error(`unlesbar ab Zeichen ${start}`);
    const t = m[0];
    if (/^(\s+|,|#.*)$/.test(t)) continue;
    if (t.startsWith('"""')) out.push({ art: 'string', wert: t.slice(3, -3) });
    else if (t.startsWith('"')) out.push({ art: 'string', wert: JSON.parse(t) });
    else if (/^[_A-Za-z]/.test(t)) out.push({ art: 'name', wert: t });
    else if (/^-?\d/.test(t)) out.push({ art: 'zahl', wert: Number(t) });
    else out.push({ art: 'p', wert: t });
  }
  return out;
}

/** Liest einen Wert ab Position i; gibt [wert, naechste Position] zurueck. */
function wert(tk, i, variablen) {
  const t = tk[i];
  if (!t) throw new Error('Wert fehlt');
  if (t.art === 'p' && t.wert === '$') {
    const name = tk[i + 1]?.wert;
    return [variablen?.[name], i + 2];
  }
  if (t.art === 'p' && t.wert === '[') {
    const liste = [];
    i += 1;
    while (!(tk[i]?.art === 'p' && tk[i].wert === ']')) {
      const [w, n] = wert(tk, i, variablen);
      liste.push(w);
      i = n;
    }
    return [liste, i + 1];
  }
  if (t.art === 'p' && t.wert === '{') {
    const obj = {};
    i += 1;
    while (!(tk[i]?.art === 'p' && tk[i].wert === '}')) {
      const schluessel = tk[i]?.wert;
      if (tk[i]?.art !== 'name' || tk[i + 1]?.wert !== ':') throw new Error('Objektfeld erwartet');
      const [w, n] = wert(tk, i + 2, variablen);
      obj[schluessel] = w;
      i = n;
    }
    return [obj, i + 1];
  }
  if (t.art === 'string' || t.art === 'zahl') return [t.wert, i + 1];
  if (t.art === 'name') {
    // true/false/null und Enum-Werte (z. B. synchronous: true) sind keine IDs.
    const w = { true: true, false: false, null: null }[t.wert];
    return [w === undefined ? Symbol.for(t.wert) : w, i + 1];
  }
  throw new Error(`unerwartet: ${t.wert}`);
}

/** Argumente "(a: 1, b: $x)" ab der oeffnenden Klammer. */
function argumente(tk, i, variablen) {
  const args = {};
  i += 1;
  while (!(tk[i]?.art === 'p' && tk[i].wert === ')')) {
    if (tk[i]?.art !== 'name' || tk[i + 1]?.wert !== ':') throw new Error('Argument erwartet');
    const [w, n] = wert(tk, i + 2, variablen);
    args[tk[i].wert] = w;
    i = n;
  }
  return args;
}

/** Alle nicht leeren Zeichenketten und Zahlen in einem Wertebaum (= IDs). */
function ids(w) {
  if (Array.isArray(w)) return w.flatMap(ids);
  if (w && typeof w === 'object') return Object.values(w).flatMap(ids);
  if (typeof w === 'number') return [String(w)];
  if (typeof w === 'string' && w.trim()) return [w.trim()];
  return [];
}

/**
 * Findet jeden Aufruf einer beobachteten Mutation samt Argumenten. Ein
 * gleichnamiger Operationsname ("mutation productDelete($id: ID!)") ist kein
 * Aufruf und wird uebersprungen.
 */
function aufrufe(query, variablen, namen) {
  const tk = tokens(query);
  const out = [];
  for (let i = 0; i < tk.length; i += 1) {
    const t = tk[i];
    if (t.art !== 'name' || !namen.has(t.wert)) continue;
    const davor = tk[i - 1];
    if (davor?.art === 'name' && /^(mutation|query|subscription|fragment)$/.test(davor.wert)) continue;
    if (tk[i + 1]?.wert !== '(') {
      out.push({ name: t.wert, args: {} });
      continue;
    }
    let args;
    try {
      args = argumente(tk, i + 1, variablen);
    } catch {
      args = null; // unlesbare Argumente: unten grob gezaehlt
    }
    out.push({ name: t.wert, args });
  }
  return out;
}

function grobeIdZahl(query, variablen) {
  const text = `${query}\n${JSON.stringify(variablen ?? {})}`;
  return (text.match(/gid:\/\/shopify\//g) ?? []).length;
}

/**
 * Entscheidung fuer eine Mutation. Gibt einen Grund (Text) zurueck, wenn sie
 * verweigert wird, sonst null.
 */
export function pruefe({ query, variables } = {}, { fallbackId = fallbackThemeId() } = {}) {
  if (typeof query !== 'string' || !query.trim()) return null;
  const variablen = variables && typeof variables === 'object' ? variables : {};

  if (fallbackId) {
    const muster = new RegExp(`(^|\\D)${fallbackId}(\\D|$)`);
    if (muster.test(query) || muster.test(JSON.stringify(variablen))) {
      return `die Mutation traegt die ID ${fallbackId} des Fallback-Themes (domains/shopify/live-theme.json, fallback). ` +
        'Dieses Theme wird nie geloescht, publiziert, umbenannt oder ueberschrieben';
    }
  }

  let gefunden;
  try {
    gefunden = aufrufe(query, variablen, new Set([...THEME_IMMER, ...Object.keys(LOESCHEN)]));
  } catch {
    // Query nicht lesbar: nur der grobe Namenstreffer zaehlt.
    const name = [...THEME_IMMER, ...Object.keys(LOESCHEN)].find((n) => new RegExp(`\\b${n}\\s*\\(`).test(query));
    if (!name) return null;
    gefunden = [{ name, args: null }];
  }

  for (const { name, args } of gefunden) {
    if (THEME_IMMER.has(name)) {
      return `${name} loescht ein Theme unwiederbringlich und nimmt den Rueckfallpunkt eines Live-Gangs weg`;
    }
    let anzahl;
    if (args === null) anzahl = grobeIdZahl(query, variablen);
    else if (LOESCHEN[name]) anzahl = ids(args[LOESCHEN[name]]).length;
    else anzahl = ids(args).length;
    if (anzahl > 0) {
      return `${name} loescht ${anzahl === 1 ? 'eine ID' : `${anzahl} IDs`} - Loeschen braucht die ausdrueckliche ` +
        'Freigabe des Inhabers (AGENTS.md "NIEMALS ohne ausdrueckliche Freigabe"). Ausgelaufenes wird archiviert ' +
        '(productUpdate status ARCHIVED), nicht geloescht';
    }
  }
  return null;
}

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

// Nur als Hook ausfuehren, nicht beim Import aus den Tests.
if (process.argv[1]?.endsWith('shopify-mcp-guard.mjs')) {
  let eingabe;
  try {
    eingabe = await stdinJson();
  } catch {
    process.exit(0);
  }
  const grund = pruefe(eingabe?.tool_input ?? {});
  if (grund) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blockiert durch .claude/hooks/shopify-mcp-guard.mjs: ${grund}. ` +
          'Nicht umgehen (auch nicht per curl oder shopify-CLI) - ist das wirklich freigegeben, ' +
          'erledigt es der Nutzer im Shopify-Admin oder hebt die Regel in der Hook-Datei auf.',
      },
    })}\n`);
  }
}
