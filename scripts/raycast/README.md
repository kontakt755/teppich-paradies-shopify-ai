# Raycast fuer TeppichParadies

Raycast ist ein Starter fuer macOS (Ersatz fuer Spotlight, `⌘ Leertaste`).
Hier liegen fertige Skriptbefehle und Schnelllinks, damit die haeufigsten
Projektbefehle ohne Terminal laufen. Nur fuer den Mac.

## Einrichten (einmal je Mac, ca. 5 Minuten)

1. **Installieren:** `brew install --cask raycast` (oder Download von raycast.com).
   Die Grundversion ist kostenlos und reicht fuer alles hier.
   **Raycast Pro (KI, Cloud-Sync) kostet Geld** und braucht die Freigabe des
   Inhabers (AGENTS.md: keine Abos ohne Freigabe).
2. Raycast starten, Kurzbefehl auf `⌘ Leertaste` legen (Spotlight vorher in
   Systemeinstellungen → Tastatur → Tastaturkurzbefehle → Spotlight abschalten).
3. **Skriptbefehle:** Raycast-Einstellungen → Extensions → `+` → **Add Script Directory** → diesen Ordner
   `scripts/raycast` im **Hauptcheckout** waehlen. Der Hauptcheckout steht auf
   `origin/main` (AGENTS.md), die Befehle haben also den Stand von main beim letzten Aktualisieren.
4. **Schnelllinks:** Raycast → `Import Quicklinks` → `quicklinks.json` aus
   diesem Ordner waehlen.
5. Optional: Erweiterung **GitHub** aus dem Raycast Store (kostenlos) fuer PRs
   und Issues direkt aus Raycast.

## Was es gibt

| Befehl in Raycast | Fuehrt aus | Wann |
|---|---|---|
| Control Center oeffnen | `scripts/dashboard-app-starten.sh` | Dashboard im App-Fenster |
| Deploy frei? | `npm run -s deploy:frei` | vor jedem Merge nach main |
| Meine Aufgaben | `npm run -s task -- list --mine` | Tagesbeginn |
| Workflow-Doctor | `npm run -s workflow:doctor` im Deploy-Worktree | vor jedem Deploy |
| Worktrees mit offener Arbeit | `npm run -s kurz -- worktrees` | Aufraeumen (AGENTS.md Punkt 6) |
| Uebergabe kopieren | `npm run -s handoff` → Zwischenablage | Sitzungsende; Pfad der Arbeitskopie als Argument |

Schnelllinks (`TP …`): Shop, Shop-Suche, Shopify Admin, Produkt-/Bestellsuche
im Admin, Themes, Control Center, Pull Requests, Aufgabensuche. Bei den Links mit
Suche fragt Raycast nach dem Suchbegriff.

## Hinweise

- Raycast startet Skripte ohne Shell-Profil. `_umgebung.sh` ergaenzt die
  Homebrew-Pfade. Kommt Node per nvm/fnm, dort den Pfad ergaenzen.
- Der Deploy-Worktree wird unter `~/Developer/tp-deploy` erwartet; sonst
  `TP_DEPLOY_DIR` setzen.
- Hier nur lesende oder oeffnende Befehle. Deploys (`workflow:preview`,
  `workflow:live`) bewusst nicht als Raycast-Befehl: sie gehoeren in eine
  Sitzung mit Gates und Bericht (Skill `deploy`).
