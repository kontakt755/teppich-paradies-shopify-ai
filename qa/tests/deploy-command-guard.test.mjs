/**
 * Der Deploy-Hinweis (.claude/hooks/deploy-command-guard.mjs) kommt nur bei
 * Befehlen, die wirklich deployen - nicht bei grep, sed, jq, echo, PR-Texten
 * oder Kommentaren, die die Woerter nur enthalten.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const hook = path.resolve(import.meta.dirname, '../../.claude/hooks/deploy-command-guard.mjs');
const { istDeploy } = await import(hook);

test('Hook-Prozess: Hinweis bei echtem Deploy, sonst still', () => {
  const lauf = (command) => spawnSync(process.execPath, [hook, 'PreToolUse', 'erst doctor'], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  const ja = lauf('npm run workflow:preview');
  assert.equal(ja.status, 0);
  assert.deepEqual(JSON.parse(ja.stdout), { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'erst doctor' } });
  const nein = lauf('grep -n workflow:preview AGENTS.md');
  assert.equal(nein.status, 0);
  assert.equal(nein.stdout.trim(), '');
});

test('Hook-Prozess: kaputter Input bleibt still', () => {
  const res = spawnSync(process.execPath, [hook, 'PreToolUse', 'x'], { input: 'kein json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

for (const cmd of [
  'npm run workflow:preview',
  'npm run workflow:live -- --approve-live',
  'npm run -s workflow:live',
  'npm run --silent workflow:preview -- --theme-id 1',
  'node workflow/cli.mjs preview --theme-id 1',
  'node ./workflow/cli.mjs live',
  'node "$HOME/Developer/tp-deploy/workflow/cli.mjs" live',
  'shopify theme push --theme 1 --only sections/a.liquid',
  'shopify theme publish --theme 1',
  '/opt/homebrew/bin/shopify theme push --development',
  '"shopify" theme push --theme 1',
  'npx shopify theme push --theme 1',
  'npx @shopify/cli@3.70.0 theme push --theme 1',
  'cd ~/Developer/tp-deploy && npm run workflow:doctor && npm run workflow:preview',
  'git fetch origin; node workflow/cli.mjs live 2>&1 | tail -20',
  '(cd ../tp-deploy && npm run workflow:live)',
  'CI=1 npm run workflow:preview',
  'env SHOPIFY_FLAG_STORE=x shopify theme push --theme 1',
  'timeout 600 npm run workflow:live',
  'caffeinate -i npm run workflow:preview',
  "bash -lc 'npm run workflow:preview'",
]) {
  test(`Hinweis: ${cmd}`, () => assert.equal(istDeploy(cmd), true));
}

for (const cmd of [
  'grep -n "workflow:preview" AGENTS.md',
  'grep -rn workflow:live docs/',
  'cat .claude/hooks/deploy-command-guard.mjs | grep theme push',
  'echo "jetzt npm run workflow:live"',
  "sed -n '1,40p' docs/WORKFLOW.md # workflow:preview erklaert",
  '# npm run workflow:live',
  'jq \'{live,preview}\' domains/shopify/live-theme.json',
  'gh pr create --title "Deploy" --body "Danach npm run workflow:preview und shopify theme push"',
  'gh pr create --title x --body "Ablauf:\nnpm run workflow:live\nfertig"',
  "git commit -F - <<'MSG'\nnpm run workflow:live laeuft danach\nMSG",
  'npm run workflow:doctor',
  'npm run -s kurz -- push',
  'node workflow/cli.mjs validate --static',
  'shopify theme pull --theme 1',
  'shopify theme list',
  'shopify theme check',
  'python3 -c "print(1)" # theme push',
  'rg "theme (push|publish)" .claude',
  '',
]) {
  test(`still: ${JSON.stringify(cmd)}`, () => assert.equal(istDeploy(cmd), false));
}
