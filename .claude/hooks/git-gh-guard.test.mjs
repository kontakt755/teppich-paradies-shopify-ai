// Test fuer git-gh-guard.mjs.  Aufruf: node .claude/hooks/git-gh-guard.test.mjs
//
// Die gefaehrlichen Befehle stehen hier bewusst zusammengesetzt ('git ' + '...'),
// damit der Guard nicht seinen eigenen Test blockiert, wenn diese Datei je
// ueber die Kommandozeile geschrieben wird.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'git-gh-guard.mjs');
const FORCE = 'git ' + 'push --force';
const HARD = 'git ' + 'reset --hard';

const FAELLE = [
  // --- muss blockieren: verwirft Arbeit oder ist unumkehrbar ---
  ['BLOCK', `${FORCE} origin main`],
  ['BLOCK', 'git ' + 'push -f'],
  ['BLOCK', 'git ' + 'push origin --delete alt'],
  ['BLOCK', `${HARD} origin/main`],
  ['BLOCK', 'git ' + 'clean -fd'],
  ['BLOCK', 'git ' + 'restore src/app.js'],
  ['BLOCK', 'git ' + 'checkout -- .'],
  ['BLOCK', 'git ' + 'branch -D feature/alt'],
  ['BLOCK', 'git ' + 'stash clear'],
  ['BLOCK', 'git ' + 'remote set-url origin https://anderswo'],
  ['BLOCK', 'git ' + 'reflog expire --all'],
  ['BLOCK', 'git ' + 'update-ref -d refs/heads/main'],
  ['BLOCK', 'git ' + 'gc --prune=now'],
  ['BLOCK', 'git ' + 'filter-branch --tree-filter x'],
  ['BLOCK', 'gh ' + 'repo delete kontakt755/teppich-paradies-shopify-ai'],
  ['BLOCK', 'gh ' + 'secret set SHOPIFY_ADMIN_TOKEN'],
  ['BLOCK', 'gh ' + 'auth logout'],
  ['BLOCK', 'gh ' + 'release delete v1.0'],
  ['BLOCK', 'gh ' + 'ssh-key add key.pub'],
  // verkettet - darf sich nicht hinter einem harmlosen Glied verstecken
  ['BLOCK', `npm test && ${FORCE} origin main`],
  ['BLOCK', `git status; ${HARD}`],
  ['BLOCK', 'echo ok | git ' + 'clean -fdx'],
  // echter Befehl nach einem Heredoc wird weiter erkannt
  ['BLOCK', `cat > d.md <<'EOF'\nText\nEOF\n${FORCE} origin main`],

  // --- muss durchlaufen: Alltag ---
  ['DURCH', 'git push origin main'],
  ['DURCH', 'git pull --rebase origin main'],
  ['DURCH', 'git rebase --continue'],
  ['DURCH', 'git status --short'],
  ['DURCH', 'git add -A'],
  ['DURCH', 'git commit -m fix'],
  ['DURCH', 'git stash push -m wip'],
  ['DURCH', 'git stash pop'],
  ['DURCH', 'git branch -a'],
  ['DURCH', 'git checkout -b feature/neu'],
  ['DURCH', 'git remote -v'],
  ['DURCH', 'git clean --dry-run'],
  ['DURCH', 'git log --oneline -5'],
  ['DURCH', 'git diff HEAD~1'],
  ['DURCH', 'git show HEAD'],
  ['DURCH', 'gh pr list'],
  ['DURCH', 'gh pr merge 12'],
  ['DURCH', 'gh auth status'],
  ['DURCH', 'gh run list'],
  ['DURCH', 'npm run workflow:doctor'],
  // Heredoc-Inhalt ist Text, kein Befehl. Ohne diese Regel blockiert der
  // Guard jede Commit-Message und jede Doku, die einen Befehl nur erwaehnt.
  ['DURCH', `git commit -F - <<'MSGEOF'\nchore: Guard gebaut\n${FORCE} wird blockiert.\nEbenso ${HARD}.\nMSGEOF`],
  ['DURCH', `cat > doku.md <<'EOF'\nNie ${FORCE} benutzen.\nEOF`],
  ['DURCH', `python3 - <<'PYEOF'\nprint("${FORCE}")\nPYEOF`],
  ['DURCH', `cat <<-EOT\n${HARD}\nEOT`],
];

let fehler = 0;
for (const [erwartet, cmd] of FAELLE) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf8',
  });
  const got = r.stdout.trim() ? 'BLOCK' : 'DURCH';
  if (got !== erwartet) {
    fehler++;
    console.log(`FEHLER erwartet=${erwartet} bekam=${got}  ${cmd.replace(/\n/g, ' \\n ')}`);
  }
}
console.log(`git-gh-guard: ${FAELLE.length} Faelle geprueft, ${fehler} Fehler.`);
process.exit(fehler ? 1 : 0);
