// Blockiert zerstoererische git- und gh-Befehle, auch wenn defaultMode auf
// bypassPermissions steht.
//
// Warum "deny" und nicht "ask": unter bypassPermissions ist am 2026-09-08
// nachgemessen worden, was tatsaechlich greift.
//
//   permissions.allow / permissions.ask   -> wirkungslos, wird nicht befragt
//   Hook permissionDecision "ask"         -> wirkungslos, Befehl laeuft durch
//   Hook permissionDecision "deny"        -> greift
//
// Deshalb steht hier nur, was hart blockiert gehoert. Alles Uebrige (git push,
// git rebase, gh pr merge, gh api mit POST ...) liegt in permissions.ask in
// .claude/settings.json und wird wirksam, sobald defaultMode nicht mehr
// bypassPermissions ist.
//
// Kein jq: auf diesem Rechner ist jq nicht installiert, eine jq-Pipeline
// wuerde still '{}' liefern und den Hook wirkungslos machen.
//
// Ist einer dieser Befehle wirklich noetig, hebt der Nutzer die Regel hier
// bewusst auf - nicht der Agent.

// Genau eine Ausnahme: die Bot-Datei docs/ai-dashboard/issues.json.
//
// Sie gehoert dem Sync-Workflow (dashboard-data.yml committet sie stuendlich)
// und wird lokal von "npm run task" und "npm run dashboard" neu erzeugt. Sie
// enthaelt nie Handarbeit - was hier verworfen wird, erzeugt der naechste Lauf
// identisch neu. Ohne die Ausnahme standen sich Hook und CLAUDE.md gegenueber.
//
// Bewusst eng: nur dieser eine Pfad, exakt am Segmentende verankert. Damit
// bleiben "git checkout -- ." und ein zweiter Pfad hinter der Datei blockiert.
// Eingefuehrt in b6cf711, von fe8631f (Branch-Loeschen) versehentlich
// ueberschrieben - qa/tests/git-gh-guard.test.mjs haelt sie seitdem fest und
// hat den Verlust auch gefunden: vier Tests fielen und blockierten die
// Deploy-Kette, bis 83931e4 die Ausnahme wiederherstellte.
//
// Angehaengte Umleitungen sind erlaubt, aber nur nach /dev/null oder als 2>&1.
// Nicht Umleitungen allgemein: "git checkout -- <botdatei> > wichtig.txt"
// wuerde wichtig.txt ueberschreiben - dann haette die Ausnahme fuer eine
// harmlose Datei ein Werkzeug freigegeben, das eine beliebige andere
// zerstoert.
const UMLEITUNG = '(\\s*(?:[12]?>{1,2}\\s*\\/dev\\/null|&>{1,2}\\s*\\/dev\\/null|2>&1))*\\s*$';
const BOTDATEI = '(?:\\.\\/)?docs\\/ai-dashboard\\/issues\\.json';

const AUSNAHMEN = [
  new RegExp(`^git\\s+checkout\\s+--\\s+${BOTDATEI}${UMLEITUNG}`),
  new RegExp(`^git\\s+restore\\s+(?:--worktree\\s+|--\\s+)?${BOTDATEI}${UMLEITUNG}`),
];

const VERBOTEN = [
  // --- git: verwirft Arbeit oder ueberschreibt fremde Commits ---
  [/^git\s+(.*\s)?push\b.*(--force\b|--force-with-lease\b|\s-f\b)/, 'git push --force ueberschreibt Commits auf dem Remote'],
  [/^git\s+(.*\s)?push\b.*--mirror\b/,                              'git push --mirror ueberschreibt saemtliche Refs auf dem Remote'],
  // Branch loeschen auf dem Remote ist seit 2026-09-09 auf Wunsch des Nutzers
  // erlaubt: aufgeraeumt wird nach dem Merge, und ein geloeschter Branch laesst
  // sich aus dem Commit wiederherstellen, solange die Commits woanders haengen.
  // Ein Tag dagegen ist eine Veroeffentlichung - das bleibt gesperrt.
  [/^git\s+(.*\s)?push\b.*--delete\b.*(\btag\b|refs\/tags\/)/,      'git push --delete auf ein Tag entfernt eine Veroeffentlichung'],
  [/^git\s+(.*\s)?reset\b.*(--hard\b|--merge\b|--keep\b)/,          'git reset --hard verwirft uncommittete Aenderungen'],
  [/^git\s+(.*\s)?clean\b\s+-[a-zA-Z]*[fdx]/,                       'git clean loescht nicht versionierte Dateien'],
  [/^git\s+(.*\s)?restore\b/,                                       'git restore verwirft Aenderungen im Working Tree'],
  [/^git\s+(.*\s)?checkout\b.*(\s--\s|\s\.\s*$)/,                   'git checkout -- verwirft Aenderungen im Working Tree'],
  [/^git\s+(.*\s)?branch\b.*\s(-D|--delete)\b/,                     'git branch -D loescht einen Branch'],
  [/^git\s+(.*\s)?(filter-branch|filter-repo)\b/,                   'filter-branch schreibt die gesamte Historie um'],
  [/^git\s+(.*\s)?reflog\s+(delete|expire)\b/,                      'reflog delete entfernt das letzte Sicherheitsnetz'],
  [/^git\s+(.*\s)?gc\b.*--prune/,                                   'git gc --prune raeumt unerreichbare Objekte endgueltig weg'],
  [/^git\s+(.*\s)?update-ref\b.*\s-d\b/,                            'update-ref -d loescht eine Referenz'],
  [/^git\s+(.*\s)?stash\s+(drop|clear)\b/,                          'stash drop verwirft gestashte Aenderungen'],
  [/^git\s+(.*\s)?remote\s+(remove|rm|set-url)\b/,                  'remote set-url aendert das Ziel aller kuenftigen Pushes'],

  // --- gh: irreversibel oder sicherheitsrelevant auf GitHub ---
  [/^gh\s+(.*\s)?repo\s+(delete|archive|rename)\b/,          'gh repo delete/archive ist nicht rueckgaengig zu machen'],
  [/^gh\s+(.*\s)?(secret|variable)\s+(set|delete|remove)\b/, 'gh secret schreibt ein Repository-Secret'],
  [/^gh\s+(.*\s)?(ssh-key|gpg-key)\s+(add|delete)\b/,        'gh key aendert die Schluessel des GitHub-Kontos'],
  [/^gh\s+(.*\s)?auth\s+(login|logout|refresh|token)\b/,     'gh auth aendert die Anmeldung'],
  [/^gh\s+(.*\s)?release\s+delete\b/,                        'gh release delete entfernt ein veroeffentlichtes Release'],
];

// Heredoc-Inhalte sind Daten, keine Befehle. Ohne diesen Schritt blockiert
// der Hook eine Commit-Message oder eine Doku, die einen der Befehle nur
// erwaehnt - genau das ist beim Anlegen dieses Hooks passiert.
function ohneHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    '<<HEREDOC-ENTFERNT',
  );
}

// Verkettete Befehle einzeln pruefen - sonst versteckt sich ein erzwungener
// Push hinter einem harmlosen ersten Glied.
function segmente(cmd) {
  return ohneHeredocs(cmd)
    .split(/\|\||&&|;|\||\n/)
    .map((s) => s.trim().replace(/^[({\s]+/, ''))
    .filter(Boolean);
}

// Ein git-Aufruf muss nicht am Segmentanfang stehen. Steckt er hinter einem
// Vorspann, greift eine Regel mit ^git nicht mehr:
//
//   xargs -n1 git update-ref -d        find . -exec git clean -fd {} +
//   env GIT_DIR=... git push --force   sudo git reset --hard
//   sh -c "git stash drop"             timeout 5 git push --delete
//
// Am 2026-09-09 ist genau das aufgefallen: "git update-ref -d" war blockiert,
// dieselbe Loeschung hinter "xargs" lief durch.
//
// Deshalb keine Liste erlaubter Vorspaenne - die bleibt immer unvollstaendig -
// sondern jede Stelle im Segment, an der ein git/gh-Aufruf beginnt. Das faellt
// bewusst fail-closed aus: steht "git push --force" nur als Text in einem
// Befehl, wird auch das blockiert. Ein zu viel blockierter Befehl kostet eine
// Rueckfrage, ein durchgerutschter kostet Arbeit.
function kandidaten(segment) {
  const out = [segment];
  for (const m of segment.matchAll(/(?<=^|[\s"'`({=])(?:git|gh)\s/g)) {
    if (m.index > 0) out.push(segment.slice(m.index));
  }
  return out;
}

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

const command = (await stdinJson())?.tool_input?.command ?? '';

for (const segment of segmente(command)) {
 for (const teil of kandidaten(segment)) {
  if (AUSNAHMEN.some((muster) => muster.test(teil))) continue;
  for (const [muster, grund] of VERBOTEN) {
    if (muster.test(teil)) {
      process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `Blockiert durch .claude/hooks/git-gh-guard.mjs: ${grund}. ` +
            `Befehl: ${teil}. Nicht umgehen - wenn das wirklich noetig ist, ` +
            `hebt der Nutzer die Regel in der Hook-Datei auf.`,
        },
      })}\n`);
      process.exit(0);
    }
  }
 }
}
