// Gibt bei echten Deploy-Befehlen einen Hinweis in den Kontext (PreToolUse:
// erst workflow:doctor; PostToolUseFailure: Troubleshooting-Datei pflegen).
// Blockiert nie.
//
// Ersetzt eine jq-Pipeline, die auf diesem Rechner mangels installiertem jq
// nur '{}' ausgab und damit PreToolUse/PostToolUseFailure fuer Deploy-Befehle
// stillschweigend aussetzte (kein sichtbarer Fehler, kein Hinweis).
// Aufruf: node deploy-command-guard.mjs <hookEventName> <additionalContext>
//
// Seit 2026-10-16 nur noch bei Befehlen, die wirklich deployen. Vorher genuegte
// das Wort irgendwo im Befehlstext: 769 Ausloesungen (09.09.-16.10.), nur rund
// 215 davon echte Deploys - der Rest grep/sed/jq ueber live-theme.json,
// PR-Texte und Kommentare (docs/analyse/claude-system-2026-10-16.md,
// Optimieren Nr. 6). Ein Hinweis, der dauernd kommt, wird nicht mehr gelesen.
//
// Geprueft wird jedes Segment (hinter &&, ;, |, Zeilenumbruch) auf seinen
// Anfang, nach Vorspann wie "FOO=1", env, time, timeout 600, caffeinate, npx.
// Text in Anfuehrungszeichen mit Leerzeichen (PR-Texte, echo "...") und
// Heredocs zaehlt nicht; "bash -c '...'" wird ausgepackt.

// Ein Segment, das so beginnt, deployt.
const DEPLOY = [
  /^npm\s+run(?:\s+(?:-s|--silent))?\s+workflow:(?:preview|live)\b/,
  /^node\s+(?:\S*\/)?workflow\/cli\.mjs\s+(?:preview|live)\b/,
  /^(?:\S*\/)?shopify\s+theme\s+(?:push|publish)\b/,
];

const VORSPANN = [
  /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, // FOO=bar befehl
  /^env(?:\s+-\S+)*\s+/,
  /^time\s+/,
  /^nohup\s+/,
  /^caffeinate(?:\s+-\w+)*\s+/,
  /^timeout\s+(?:-\S+\s+)*\S+\s+/,
  /^npx(?:\s+(?:-y|--yes))?\s+/,
];

function ohneHeredocs(cmd) {
  return cmd.replace(/<<-?\s*(['"`]?)(\w+)\1[\s\S]*?^\s*\2\s*$/gm, ' ');
}

/** Innerer Befehl von "bash -c '...'" (auch sh/zsh, -lc). */
function shellC(cmd) {
  return [...cmd.matchAll(/\b(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*?)\1/g)].map((m) => m[2]);
}

/**
 * Zitierter Text mit Leerraum ist Fliesstext (PR-Beschreibung, echo, Commit-
 * Nachricht) und wird entfernt. Ohne Leerraum ist es ein Pfad oder Wort
 * ("shopify", "$DIR/workflow/cli.mjs") und bleibt ohne Anfuehrungszeichen.
 */
function ohneZitate(cmd) {
  return cmd.replace(/(['"])([\s\S]*?)\1/g, (_, q, inhalt) => (/\s/.test(inhalt) ? "''" : inhalt));
}

function segmente(cmd) {
  return ohneZitate(ohneHeredocs(cmd))
    .split(/\|\||&&|;|\||&|\n/)
    .map((s) => s.trim().replace(/^[({\s!]+/, '').trim())
    .filter((s) => s && !s.startsWith('#'));
}

function ohneVorspann(seg) {
  // "npx @shopify/cli@3.70.0 theme push" ist derselbe Aufruf wie "shopify theme push".
  let s = seg.replace(/(^|\s)@shopify\/cli(?:@\S+)?(?=\s+theme\b)/, '$1shopify');
  for (let runde = 0; runde < 10; runde += 1) {
    const vorher = s;
    for (const v of VORSPANN) s = s.replace(v, '');
    if (s === vorher) break;
  }
  return s;
}

export function istDeploy(command) {
  if (typeof command !== 'string' || !command) return false;
  const befehle = [command, ...shellC(command)];
  return befehle.some((b) => segmente(b).some((seg) => DEPLOY.some((m) => m.test(ohneVorspann(seg)))));
}

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

// Nur als Hook ausfuehren, nicht beim Import aus den Tests.
if (process.argv[1]?.endsWith('deploy-command-guard.mjs')) {
  const [, , hookEventName, additionalContext] = process.argv;
  let input = {};
  try {
    input = await stdinJson();
  } catch {
    process.exit(0);
  }
  if (istDeploy(input?.tool_input?.command ?? '')) {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } })}\n`);
  }
}
