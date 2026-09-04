# Multi-Mac-Workflow

Dieses Repo wird auf mehreren Rechnern bearbeitet. Zwei dokumentierte Vorfälle
zeigen, was ohne diese Regeln passiert:

- **2026-08-13**: Ein Mac-Checkout (`/Users/deryakrky/Documents/teppich-paradies-live`)
  war stillschweigend von `origin/main` abgewichen. Musste per manuellem
  SHA-256-Hashvergleich Datei für Datei abgeglichen werden, siehe
  [`MAC_REMOTE_MERGE_VERIFICATION.md`](MAC_REMOTE_MERGE_VERIFICATION.md).
- **2026-09-04**: Ein Checkout lag unter `~/Documents`, synchronisiert per
  iCloud Drive ("Desktop & Dokumente"). Git-Dateisperren kollidierten mit der
  Cloud-Synchronisation - minutenlange Haenger bei gewoehnlichen
  `git status`/`git commit`-Aufrufen, am Ende eine beschaedigte
  Git-Objektdatenbank (fsck: "missing tree", "broken link"). Die Daten kamen
  nur zufaellig unbeschaedigt aus der Cloud zurueck.

## Die Kernregel

**Git-Repos liegen nie unter einem dateibasiert synchronisierten Ordner**
(iCloud Drive, Dropbox, OneDrive, Google Drive) - auch nicht unter `~/Desktop`
oder `~/Documents`, selbst wenn dort aktuell keine Synchronisation aktiv ist:
die Einstellung kann sich jederzeit unbemerkt aendern.

**GitHub ist der einzige Sync-Mechanismus zwischen Rechnern.** Kein
Dateisystem-Sync ganzer Arbeitsverzeichnisse, kein manuelles Kopieren von
`.git`. Ein Rechner arbeitet, committet, pusht; ein anderer Rechner pullt.

`npm run syncpath:guard` prueft das automatisch (laeuft bei jeder Claude-Code-
Sitzung ueber `.claude/hooks/session-start.sh`).

## Standard-Setup pro Mac

1. Checkout unter `~/Developer/teppich-paradies-shopify-ai` (nicht unter
   Desktop/Documents/einem Cloud-Ordner).
2. `git remote -v` prueft denselben Origin wie auf den anderen Rechnern.
3. `npm run syncpath:guard` laeuft grün, bevor mit Git gearbeitet wird.
4. `git pull --ff-only` vor Arbeitsbeginn - kein stiller Merge-Commit, der
   Abweichungen verschleiert.
5. `.env.local` wird auf jedem Mac lokal neu angelegt (siehe `.env.example`,
   falls vorhanden), nie kopiert, nie synchronisiert, nie committet.
6. `npm run secret:scan` vor jedem Commit, wenn neue Config-Dateien dazukommen.
7. Gleiche Node-Version (`.nvmrc` falls vorhanden, sonst in der README
   dokumentieren).

## Wenn zwei Checkouts bereits divergiert sind

Nicht direkt mergen. Reihenfolge (bestaetigt durch Codex-Review 2026-09-04):

1. Beide Staende einfrieren, nichts mehr aendern.
2. Von jedem Zustand ein Backup ausserhalb eines synchronisierten Ordners.
3. `git fsck --full --strict` in jedem Checkout - Korruption zuerst
   ausschliessen, bevor irgendetwas verglichen wird.
4. Alle uncommitteten Aenderungen als Commit sichern (eigener Branch, wenn
   unklar ist, ob sie behalten werden sollen).
5. GitHub-Remote ist die Integrationsbasis, nicht einer der lokalen Staende.
6. Eine Seite als Referenz bestimmen, die andere kontrolliert und
   commitweise uebernehmen - nicht in einem Rutsch.
7. Nach jedem Teilstueck: testen, reviewen, committen.

## Vor jeder groesseren Architekturentscheidung

`npm run workflow:route` zur Einstufung, danach Codex als unabhaengiger
Pruefer (`codex exec --sandbox workspace-write ...`) - nicht nur wenn der
Router ein Review verlangt, sondern auch bei Entscheidungen mit echtem
Gewicht wie dieser hier.
