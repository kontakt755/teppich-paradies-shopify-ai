// Ersetzt eine jq-Pipeline, die auf diesem Rechner mangels installiertem jq
// nur '{}' ausgab und damit PreToolUse/PostToolUseFailure fuer Deploy-Befehle
// stillschweigend aussetzte (kein sichtbarer Fehler, kein Hinweis).
// Aufruf: node deploy-command-guard.mjs <hookEventName> <additionalContext>
const DEPLOY_PATTERN = /workflow:(preview|live)|theme (push|publish)/;

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

const [, , hookEventName, additionalContext] = process.argv;
const input = await stdinJson();
const command = input?.tool_input?.command ?? '';

if (DEPLOY_PATTERN.test(command)) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } })}\n`);
}
