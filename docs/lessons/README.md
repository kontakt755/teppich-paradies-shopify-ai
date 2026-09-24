# Lessons — was hier schiefging und warum die Regel so lautet

Die Regeln stehen in `CLAUDE.md` und `AGENTS.md`. Hier steht nur die Geschichte
dahinter: der Vorfall, was er gekostet hat, welche Diagnose verfuehrerisch und
falsch war. Diese Dateien werden **nicht** bei jedem Sessionstart geladen — sie
sind zum Nachlesen, wenn eine Regel unverstaendlich wirkt oder man versucht ist,
sie zu umgehen.

| Datei | Regel in CLAUDE.md | Was passierte |
|---|---|---|
| [theme-id-drift.md](theme-id-drift.md) | Welches Theme ist live? | Anweisungsdateien nannten wochenlang ein geloeschtes Theme als live |
| [ungemergte-branches.md](ungemergte-branches.md) | Fallstrick 6 | Fertige Features lagen auf nie gemergten Branches; Einzel-Cherry-Pick brach den Template-Push |
| [tote-menuelinks.md](tote-menuelinks.md) | Fallstrick 6b | Zwei Menuelinks lieferten leere Raster — zwei verschiedene Ursachen, gleiches Symptom |
| [produktimport.md](produktimport.md) | Fallstrick 7, Farbcodes | Sieben Produkte zweimal gebaut; 21 von 24 Farbvarianten erfunden |
| [pr-basis-und-historie.md](pr-basis-und-historie.md) | Fallstrick 9 | PRs ohne Checks, geschlossene PRs, ueberkreuzte Historie — alle mechanisch |
| [shopify-schreibzugriff.md](shopify-schreibzugriff.md) | Shopify-Schreibzugriff | Eine Sitzung Token-Suche, acht Runden Browser fuer eine Mutation, die im Schema stand |
| [router-belege.md](router-belege.md) | Laeuft der Router gerade? | Zwei erfundene Pruefpfade fuehrten zum Schluss, der Router laufe nicht |
| [codex-review-pruefbereich.md](codex-review-pruefbereich.md) | Wenn das Codex-Review fremde Arbeit anmahnt | Reviewer prueften den Working Tree anderer Sitzungen und verlangten, ihn zu „isolieren" |
| [dashboard-issues-json.md](dashboard-issues-json.md) | Dashboard | Stash pro Sitzung im geteilten Stash-Stack, weil Doku und Hook sich widersprachen |
| [rebase-ours-ist-der-upstream.md](rebase-ours-ist-der-upstream.md) | Dashboard | `dashboard-data.yml` loeste Konflikte mit `--ours` auf und verwarf damit die Datei, die es gerade erzeugt hatte |

Konvention: keine Theme-IDs, keine Lieferantennamen (nur Pseudonyme, siehe
CLAUDE.md Punkt 8). Eine neue Lesson bekommt eine Zeile in dieser Tabelle und
einen Einzeiler-Verweis an der Regel in `CLAUDE.md`.
