// Blockiert zerstoererische git- und gh-Befehle - in jedem Berechtigungsmodus,
// auch unter bypassPermissions.
//
// Warum "deny" und nicht "ask": Dieser Hook ist die einzige harte Grenze fuer
// git/gh. Seit 2026-09-11 gibt es in .claude/settings.json bewusst keine
// permissions.ask-Liste mehr. Laut Doku (code.claude.com/docs/en/permission-modes)
// fragt eine ask-Regel in JEDEM Modus nach, auch in Auto und Bypass; die Liste
// mit git push, gh pr create usw. hat genau die Rueckfragen erzeugt, die der
// Nutzer abgeschafft haben wollte. Die Messung vom 2026-09-08 ("ask unter
// bypass wirkungslos") widerspricht der Doku und dem, was in der Desktop-App
// tatsaechlich passierte.
//
// Deshalb steht hier nur, was Arbeit unwiederbringlich verwirft oder fremde
// Commits ueberschreibt. Alles Uebrige (git push, gh pr merge, gh api ...)
// laeuft ohne Rueckfrage.
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

// Ein Branchname, wie ihn jemand ausschreibt. Bewusst ohne "$", Backtick, "*"
// und "?": damit faellt jede Befehlsersetzung und jeder Platzhalter aus der
// Ausnahme heraus - "git branch -D $(git branch | grep alt)" bleibt blockiert.
const BRANCHNAME = '[A-Za-z0-9._][A-Za-z0-9._/-]*';

// Jede Ausnahme hier gilt nur fuer einen "nackten" Aufruf: das ganze Segment,
// hoechstens mit einem Pfad davor. Steht ein anderer Befehl davor, zaehlt sie
// nicht.
//
// Der Grund ist nicht Vorsicht, sondern eine gemessene Luecke vom 2026-09-12:
// Beide Ausnahmen lesen einen ausgeschriebenen Namen aus dem Befehlstext und
// schliessen daraus, dass jemand hingesehen hat. Unter xargs stimmt dieser
// Schluss nicht mehr, weil dort Argumente von stdin angehaengt werden, die im
// Text nicht vorkommen:
//
//   printf 'zweig-b\nzweig-c\n' | xargs echo "branch -D zweig-a"
//   -> branch -D zweig-a zweig-b zweig-c
//
// Der Hook sah "zweig-a", geloescht wurden drei Branches. Dasselbe galt fuer
// die Bot-Datei: "xargs git checkout -- <botdatei>" haette weitere Pfade von
// stdin mitverworfen.
const AUSNAHMEN = [
  new RegExp(`^git\\s+checkout\\s+--\\s+${BOTDATEI}${UMLEITUNG}`),
  new RegExp(`^git\\s+restore\\s+(?:--worktree\\s+|--\\s+)?${BOTDATEI}${UMLEITUNG}`),

  // Erzwungenes Branch-Loeschen mit ausgeschriebenen Namen. Seit 2026-09-12
  // auf Wunsch des Nutzers erlaubt, weil Aufraeumen sonst nicht geht: manche
  // Branches sind inhaltlich laengst in main, tragen aber andere Commit-IDs
  // (Squash-Merge, Neuaufbau) - fuer git bleiben sie "not fully merged", und
  // "-d" verweigert sie auf Dauer.
  //
  // Die Grenze liegt bei "ausgeschrieben": Wer den Namen tippt, hat den Branch
  // angesehen. Ein Sweep ueber eine Liste hat das nicht - und genau der loescht
  // im Zweifel die eine Arbeit, die noch nirgends sonst liegt.
  new RegExp(`^git\\s+branch\\s+(?:-D|--delete\\s+--force|--force\\s+--delete)(?:\\s+${BRANCHNAME})+${UMLEITUNG}`),
];

const VERBOTEN = [
  // --- git: verwirft Arbeit oder ueberschreibt fremde Commits ---
  // "\s-[a-zA-Z]*f" statt "\s-f\b": git fasst Kurzflags zusammen, "-fq" und
  // "-qf" sind dasselbe wie "-f -q". Mit "\s-f\b" rutschten beide durch -
  // belegt am 2026-09-12 an einem Wegwerf-Repo: der normale Push wurde als
  // non-fast-forward abgewiesen, "git push -fq" hat den Remote-Commit
  // ueberschrieben, und der Hook sagte nichts.
  //
  // Dieselbe Luecke hatte kurz zuvor die Branch-Regel ("-df" statt "-D").
  // Eine Regel, die ein einzelnes Kurzflag mit "\b" abschliesst, ist deshalb
  // grundsaetzlich verdaechtig - siehe "git clean", das es von Anfang an
  // richtig machte.
  [/^git\s+(.*\s)?push\b.*(--force\b|--force-with-lease\b|\s-[a-zA-Z]*f)/, 'git push --force ueberschreibt Commits auf dem Remote'],
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
  // Branch loeschen ist seit 2026-09-12 auf Wunsch des Nutzers in der sicheren
  // Form erlaubt: "git branch -d" verweigert git selbst, solange die Commits
  // nirgends sonst haengen. Die Pruefung macht also git, nicht dieser Hook -
  // und sie ist genauer, als eine Regex sie treffen koennte.
  //
  // Gesperrt bleibt, was genau diese Pruefung aushebelt: "-D" und jedes "-d"
  // neben "--force". Wer einen ungemergten Branch wegwerfen will, soll vorher
  // nachsehen, was darauf liegt - am 2026-09-09 lagen auf drei solchen
  // Branches Fixes, die nur deshalb nicht verloren waren, weil main sie
  // inzwischen auf anderem Weg trug.
  [/^git\s+(.*\s)?branch\b.*\s-[a-zA-Z]*D/,                         'git branch -D loescht auch einen ungemergten Branch - mit -d pruefen lassen'],
  [/^git\s+(.*\s)?branch\b.*\s(-[a-zA-Z]*d\b|--delete\b).*\s(--force\b|-[a-zA-Z]*f\b)/, 'git branch --delete --force hebt die Merge-Pruefung auf'],
  [/^git\s+(.*\s)?branch\b.*\s(--force\b|-[a-zA-Z]*f\b).*\s(-[a-zA-Z]*d\b|--delete\b)/, 'git branch --force --delete hebt die Merge-Pruefung auf'],
  // Ein einzelnes Kurzflag, das d und f zusammenfasst: "-df" und "-fd". Die drei
  // Regeln darueber greifen dabei nicht - die erste braucht ein grosses D, die
  // beiden anderen zwei getrennte Token. Bis 2026-09-12 waren damit auch Sweeps
  // offen ("git branch -df $(git branch ...)", "| xargs git branch -df"),
  // gemessen durch die unabhaengige Pruefung. Die Absicht war nie eine andere:
  // Der Test zu "git branch -rD" nennt kombinierte Kurzflags ausdruecklich als
  // "nicht ausgeschrieben genug". Wer erzwungen loeschen will, schreibt -D <name>.
  [/^git\s+(.*\s)?branch\b.*\s-[a-zA-Z]*d[a-zA-Z]*f/,               'kombiniertes Kurzflag wie -df hebt die Merge-Pruefung auf - ausgeschrieben loeschen: git branch -D <name>'],
  [/^git\s+(.*\s)?branch\b.*\s-[a-zA-Z]*f[a-zA-Z]*d/,               'kombiniertes Kurzflag wie -fd hebt die Merge-Pruefung auf - ausgeschrieben loeschen: git branch -D <name>'],
  [/^git\s+(.*\s)?(filter-branch|filter-repo)\b/,                   'filter-branch schreibt die gesamte Historie um'],
  [/^git\s+(.*\s)?reflog\s+(delete|expire)\b/,                      'reflog delete entfernt das letzte Sicherheitsnetz'],
  [/^git\s+(.*\s)?gc\b.*--prune/,                                   'git gc --prune raeumt unerreichbare Objekte endgueltig weg'],
  // Auch hier ohne "\b" am Ende: "git update-ref -zd" waere sonst offen.
  [/^git\s+(.*\s)?update-ref\b.*\s-[a-zA-Z]*d/,                     'update-ref -d loescht eine Referenz'],
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
// Dasselbe gilt fuer den Aufruf ueber einen Pfad. "/usr/bin/git push --force"
// und "./git branch -df alt" sind derselbe Befehl, das Praefix steht aber vor
// dem Token - die Erkennung oben sieht kein "git" nach Zeilenanfang, Leerzeichen
// oder Klammer, und keine Regel mit ^git greift. Am 2026-09-12 ist das an
// "/usr/bin/git branch -df" aufgefallen (unabhaengige Pruefung): damit war
// nicht nur die Sweep-Sperre offen, sondern jede Regel dieser Datei.
// Der Pfad wird deshalb abgeschnitten, sodass der Rest wie ein nackter Aufruf
// geprueft wird - inklusive der Ausnahmen, "/usr/bin/git branch -D name" bleibt
// also erlaubt. Nicht abgedeckt: ein Executable in Anfuehrungszeichen
// ("/usr/bin/git" branch). Fail-closed bleibt die Linie: lieber eine Rueckfrage
// zu viel als ein durchgerutschter Befehl.
// "nackt" heisst: vor dem Aufruf steht nichts ausser hoechstens einem Pfad.
// Nur solche Kandidaten duerfen eine Ausnahme in Anspruch nehmen - siehe die
// Begruendung bei AUSNAHMEN.
function kandidaten(segment) {
  // Ein Anfuehrungszeichen direkt hinter dem Befehlsnamen gehoert zur Schreibweise
  // des Aufrufs, nicht zum Argument: "/usr/bin/git" checkout ist derselbe Befehl
  // wie /usr/bin/git checkout. Ohne dieses Abstreifen beginnt der Kandidat mit
  // 'git"' und jedes VERBOTEN-Muster (^git\s) laeuft daneben - gemessen am
  // 2026-09-12, damals liefen checkout --, restore und branch -D so komplett
  // am Hook vorbei.
  const ohneQuote = (t) => t.replace(/^(git|gh)["'`](?=\s)/, '$1');
  const out = [{ teil: segment, nackt: true }];
  for (const m of segment.matchAll(/(?<=^|[\s"'`({=])(?:git|gh)["'`]?\s/g)) {
    if (m.index > 0) out.push({ teil: ohneQuote(segment.slice(m.index)), nackt: false });
  }
  for (const m of segment.matchAll(/(?<=^|[\s"'`({=])[\w.~/-]*\/(git|gh)(?=["'`]?\s)/g)) {
    const start = m.index + m[0].length - m[1].length;
    // Ein Pfad am Segmentanfang ist nur eine andere Schreibweise desselben
    // Aufrufs; dahinter steht kein zweiter Befehl, der Argumente nachreicht.
    out.push({ teil: ohneQuote(segment.slice(start)), nackt: m.index === 0 });
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
 for (const { teil, nackt } of kandidaten(segment)) {
  if (nackt && AUSNAHMEN.some((muster) => muster.test(teil))) continue;
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
