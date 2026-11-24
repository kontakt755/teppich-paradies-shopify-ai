// Blockiert das Loeschen von Shopify-Themes - in jedem Berechtigungsmodus,
// auch unter bypassPermissions.
//
// Warum es diesen Hook gibt: Am 2026-09-15 waren mehrere Themes aus der Admin
// API verschwunden. Darunter 203558781262, das live-theme.json als Preview
// fuehrte und das zugleich der Rueckfallpunkt des Live-Gangs vom selben Tag
// war - workflow:preview brach danach mit THEME_ID_AMBIGUOUS ab. Ebenfalls
// weg: 196301750606 ("Horizon"), das in live-theme.json seit jeher mit dem
// Vermerk "Niemals loeschen oder ueberschreiben" steht. Der Vermerk stand nur
// in einer JSON-Datei und hat nichts aufgehalten.
//
// Ein Rueckfall-Theme ist die einzige schnelle Rueckabwicklung eines
// Live-Gangs: Zurueckschalten ist ein Publish, Wiederherstellen dagegen ein
// kompletter Neuaufbau aus git - und der trifft nie die Theme-Einstellungen,
// die in config/settings_data.json auf dem Theme liegen und NICHT im
// Repository gepflegt werden.
//
// Shopify selbst kennt keine Sperre gegen das Loeschen eines Themes. Diese
// Grenze ist deshalb die einzige, die hier ueberhaupt moeglich ist - sie gilt
// fuer Agenten, die ueber dieses Repository arbeiten. Ein Mensch im
// Shopify-Admin bleibt davon unberuehrt; das ist Absicht.
//
// Einzige Ausnahme (Benutzer 24.11.2026): `shopify theme delete` fuer
// Wegwerf-Themes. Belegt ueber istWegwerfTheme aus shopify-mcp-guard.mjs
// (Name "Wegwerf", unveroeffentlicht, nicht in live-theme.json); jede
// genannte ID muss das erfuellen. themeDelete per curl bleibt gesperrt.
//
// Kein jq: auf diesem Rechner ist jq nicht installiert, eine jq-Pipeline
// wuerde still '{}' liefern und den Hook wirkungslos machen.

/**
 * Segmente wie im git-gh-guard: Ein Befehl kann hinter &&, ;, | oder in einer
 * Subshell stehen. Heredocs werden vorher entfernt, damit Fliesstext, der so
 * einen Befehl nur erwaehnt, nicht blockiert.
 */
function ohneHeredocs(cmd) {
  return cmd.replace(/<<-?\s*(['"`]?)(\w+)\1[\s\S]*?^\s*\2\s*$/gm, ' ');
}

function segmente(cmd) {
  return ohneHeredocs(cmd)
    .split(/\|\||&&|;|\||\n/)
    .map((s) => s.trim().replace(/^[({\s]+/, ''))
    .filter(Boolean);
}

/**
 * Der Aufruf muss nicht am Segmentanfang stehen. Dieselbe Luecke wie beim
 * git-gh-guard am 2026-09-09: "shopify theme delete" war blockiert, dieselbe
 * Loeschung hinter "xargs" oder "env ..." lief durch. Deshalb wird jede Stelle
 * geprueft, an der ein shopify-Aufruf beginnt - auch mit Pfad davor.
 */
function kandidaten(segment) {
  const out = [segment];
  for (const m of segment.matchAll(/(?<=^|[\s"'`({=])shopify["'`]?\s/g)) {
    if (m.index > 0) out.push(segment.slice(m.index));
  }
  for (const m of segment.matchAll(/(?<=^|[\s"'`({=])[\w.~/-]*\/shopify(?=["'`]?\s)/g)) {
    out.push(segment.slice(m.index + m[0].length - 'shopify'.length));
  }
  return out;
}

import { istWegwerfTheme } from './shopify-mcp-guard.mjs';
import { readFileSync } from 'node:fs';

/** IDs hinter -t/--theme; null, wenn keine eindeutig lesbar ist. */
export function themeIds(teil) {
  const ids = [...teil.matchAll(/(?:^|\s)(?:-t|--theme)(?:=|\s+)["']?([^\s"']+)/g)].map((m) => m[1]);
  return ids.length && ids.every((x) => /^\d+$/.test(x)) ? ids : null;
}

// Nur fuer Tests: Themeliste aus einer Datei statt live aus Shopify.
function themen() {
  const f = process.env.TP_THEMELISTE_TEST;
  return f ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
}

const REGELN = [
  [
    /^shopify["'`]?\s+theme\s+delete\b/,
    'ein Theme zu loeschen nimmt den Rueckfallpunkt eines Live-Gangs weg',
  ],
  // Der Weg ueber die Admin API direkt, z. B. per curl. Der Shopify-MCP
  // blockiert themeDelete bereits selbst; curl kennt diese Grenze nicht.
  [
    /\bthemeDelete\b/,
    'themeDelete ueber die Admin API loescht ein Theme unwiederbringlich',
  ],
];

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

const command = (await stdinJson())?.tool_input?.command ?? '';

for (const segment of segmente(command)) {
  for (const teil of kandidaten(segment)) {
    for (const [muster, grund] of REGELN) {
      if (muster.test(teil)) {
        if (muster === REGELN[0][0]) {
          const ids = themeIds(teil);
          const liste = themen();
          if (ids && ids.every((id) => istWegwerfTheme(id, liste ? { themen: liste } : undefined))) continue;
        }
        process.stdout.write(`${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              `Blockiert durch .claude/hooks/theme-delete-guard.mjs: ${grund}. ` +
              `Befehl: ${teil}. Nicht umgehen - ein Theme loescht der Nutzer im ` +
              `Shopify-Admin, nicht der Agent.`,
          },
        })}\n`);
        process.exit(0);
      }
    }
  }
}
