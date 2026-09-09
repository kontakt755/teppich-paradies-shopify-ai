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

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

const command = (await stdinJson())?.tool_input?.command ?? '';

for (const teil of segmente(command)) {
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
