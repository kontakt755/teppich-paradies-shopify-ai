# Lessons — was hier schiefging und warum die Regel so lautet

Die Regeln stehen in `AGENTS.md` (von `CLAUDE.md` eingebunden) oder im zustaendigen Skill unter `.claude/skills/`. Hier steht nur die Geschichte
dahinter: der Vorfall, was er gekostet hat, welche Diagnose verfuehrerisch und
falsch war. Diese Dateien werden **nicht** bei jedem Sessionstart geladen — sie
sind zum Nachlesen, wenn eine Regel unverstaendlich wirkt oder man versucht ist,
sie zu umgehen.

| Datei | Regel in AGENTS.md | Was passierte |
|---|---|---|
| [theme-id-drift.md](theme-id-drift.md) | Welches Theme ist live? | Anweisungsdateien nannten wochenlang ein geloeschtes Theme als live |
| [ungemergte-branches.md](ungemergte-branches.md) | Fallstrick 6 | Fertige Features lagen auf nie gemergten Branches; Einzel-Cherry-Pick brach den Template-Push |
| [tote-menuelinks.md](tote-menuelinks.md) | Fallstrick 6b | Zwei Menuelinks lieferten leere Raster — zwei verschiedene Ursachen, gleiches Symptom |
| [produktimport.md](produktimport.md) | Fallstrick 7, Farbcodes | Sieben Produkte zweimal gebaut; 21 von 24 Farbvarianten erfunden |
| [pr-basis-und-historie.md](pr-basis-und-historie.md) | Fallstrick 9 | PRs ohne Checks, geschlossene PRs, ueberkreuzte Historie — alle mechanisch |
| [shopify-schreibzugriff.md](shopify-schreibzugriff.md) | Shopify-Schreibzugriff | Eine Sitzung Token-Suche, acht Runden Browser fuer eine Mutation, die im Schema stand |
| [dashboard-issues-json.md](dashboard-issues-json.md) | – (Vorgeschichte, erledigt 2026-09-30; heute „Arbeitskopien“) | Stash pro Sitzung im geteilten Stash-Stack, weil Doku und Hook sich widersprachen |
| [rebase-ours-ist-der-upstream.md](rebase-ours-ist-der-upstream.md) | – (Vorgeschichte; gilt weiter fuer `.claude/hooks/gedaechtnis-sync.sh`) | `dashboard-data.yml` loeste Konflikte mit `--ours` auf und verwarf damit die Datei, die es gerade erzeugt hatte |
| [renderzeit-kollektionsseite.md](renderzeit-kollektionsseite.md) | Skill `werkzeuge` (`teppich:basis-daten`) | Teppich nach Mass lief ab ~200 Produkten in den Render-Timeout; Ursache war nicht die vermutete Gruppierung, sondern Produktreferenzen je Karte |
| [ki-bilder.md](ki-bilder.md) | Theme, Produktkarten, Design, Bilder (Skill `theme-regeln`, Abschnitt Bilder) | Gemusterter Wohnteppich in drei Modellen gleich falsch; 38 von 38 KI-Bildern ohne KI-Kennzeichnung |

Konvention: keine Theme-IDs, keine Lieferantennamen (nur Pseudonyme, siehe
AGENTS.md Punkt 8). Eine neue Lesson bekommt eine Zeile in dieser Tabelle und
einen Einzeiler-Verweis an der Regel (in `AGENTS.md` oder im Skill).
