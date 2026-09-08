# Control Center – Technische Bestandsaufnahme

Stand: 2026-09-08 · Branch `feature/control-center` · Basis `origin/main` (281bd69)

## 1. Was heute existiert: drei Oberflächen, ein Repository

| Oberfläche | Pfad | Start | Datenquelle | Schreibt? | Zweck |
|---|---|---|---|---|---|
| **Teppich Dashboard** („Online-Shop Dashboard") | `docs/ai-dashboard/` | `npm run dashboard` (Port 8001) oder GitHub Pages | `docs/ai-dashboard/issues.json` (aus GitHub Issues) | nein | Kennzahlen, „Was ist jetzt zu tun?", Kanban, Liste. **Das ist die App, die weiterentwickelt wird.** |
| TP AI Steuerzentrale | `automation/dashboard/` | `npm run automation:dashboard` (Port 4310, Zugangscode) | eigener Lauf-State in `~/Library/Application Support/TP AI Dashboard/`, `.router/ai-usage.jsonl`, GitHub Issues per `gh` | **ja** – setzt `status:*`/`reviewer:*`-Labels, schreibt Kommentare, legt Issues an | startet den Agenten-Zyklus (Router → Umsetzung → Codex-Review → Human Gate) |
| Automation Control Center „Stufe 1" | `control-center/` | `npm run control:center` (Port 4177) | `.workflow/*.json`, `qa/evidence`, `qa/results` | nein | read-only Repo-/Pipeline-Zustand des Deploy-Workflows |

Alle drei sind Vanilla-HTML/JS ohne Build-Schritt und ohne Framework. Node 26, keine Laufzeit-Abhängigkeiten
(nur `puppeteer`/`playwright-core` als devDependencies für QA-Screenshots).

Es gibt **keine** Fable-/Framework-App im engeren Sinn: „Teppich Dashboard" ist der `<title>` der PWA-fähigen
Seite `docs/ai-dashboard/index.html` (1.100 Zeilen, ein File, Inline-CSS und Inline-JS).

## 2. Datenfluss der bestehenden App

```
GitHub Issues (Labels status:/type:/priority:/area:/reviewer:, Assignee, Body)
   │  .github/workflows/dashboard-data.yml – bei jedem Issue-Event + stündlich + workflow_dispatch
   ▼
scripts/build-dashboard-data.mjs  (gh api, Filter: mindestens ein relevantes Label,
   │                               extrahiert nur "Nächster Schritt" aus dem Body)
   ▼
docs/ai-dashboard/issues.json     (wird nach main committet, "[skip ci]")
   │  fetch() gleiche Domain, kein Token, alle 2 Minuten
   ▼
docs/ai-dashboard/index.html      (Metriken, Nächste Schritte, Kanban 7 Spalten, Liste mit Filtern)
```

### Echte Daten vs. Demo-Daten

| Daten | Status |
|---|---|
| Issues, Labels, Assignee, Zeitstempel | **echt** (30 Issues, davon 24 offen am 2026-09-08) |
| „Nächster Schritt" | echt, aber nur wenn der Body die Überschrift `Nächster Schritt` enthält (bei 30 Issues: 3 Treffer) |
| Owner | **fehlt** – kein einziges offenes Issue hat einen Assignee; „Ahmet" steht nur als Text im Body |
| Blocker-Grund, seit wann, Freigabe-Bedarf, Frist, Akzeptanzkriterien | im Body vorhanden (z. B. #42, #41, #34), aber **nicht extrahiert** |
| KI-Läufe | nur in der Steuerzentrale (lokal, nicht im Repo) sichtbar; das Dashboard sieht sie nicht |
| KPIs (Shop, Ads, GA4) | **keine** – es gibt keine Demo-Kennzahlen, die als live ausgegeben würden |

Screenshots des Ist-Zustands: `docs/control-center/screenshots/ist-desktop-kanban.png`, `ist-desktop-liste.png`, `ist-mobile.png`.

## 3. Führende Quelle für Aufgaben

**GitHub Issues sind die einzige Aufgabenquelle** und bleiben es. Alle drei Oberflächen sind sich darin einig;
die Steuerzentrale schreibt bereits kontrolliert dorthin (`automation/dashboard/github-issues.mjs`:
Label-Wechsel, Kommentar, Issue-Anlage mit Fingerprint gegen Dubletten).

Label-Vokabular (Quelle: `setup-dashboard.sh`, tatsächlich im Repo vorhanden):

- `status:` eingang · geplant · in-arbeit · review · korrektur · blockiert · fertig
- `type:` bug · verbesserung · idee · ux · seo · content · technik
- `priority:` p0 · p1 · p2 · p3
- `area:` backend · checkout · design · filter · google · kategorie · navigation · produktseite · seo · sonstiges · versand · warenkorb
- `reviewer:` codex · claude · mensch

Konventionen im Body (nicht erzwungen, aber in Gebrauch): `## Ziel`, `## Akzeptanzkriterien` (Checkboxen),
`## Worker`, `## Risk`, `## Abhängigkeiten`, `## Nächster Schritt`, `## Status` mit `BLOCKIERT – Warte auf …`.
Von der Steuerzentrale erzeugte Issues tragen ein `🤖`-Präfix und `<!-- tp-ai-fingerprint:… -->`.

## 4. Risiken

| Risiko | Befund | Bewertung |
|---|---|---|
| **Datenfrische** | Header zeigt „vor 7 Std". Der Actions-Workflow läuft stündlich, aber `issues.json` wird nur bei Änderung committet. Die Seite kann nicht unterscheiden zwischen „nichts passiert" und „Sync tot". | hoch – untergräbt Vertrauen, genau der Punkt aus dem Auftrag |
| **GitHub Pages meldet `status: errored`** (`gh api …/pages`) | Die öffentliche URL wird ggf. nicht mehr aktualisiert. Lokal (`npm run dashboard`) unbeeinträchtigt. | hoch – Entscheidung nötig (siehe unten) |
| **Repository ist öffentlich** | Alles in `issues.json` und in Issues ist weltweit lesbar. Die Steuerzentrale redigiert deshalb E-Mails/Schlüssel vor dem Anlegen. | Muss für jede neue Datenart geprüft werden (keine Kundendaten, keine Umsätze in Issues) |
| **Sync-Konflikte auf `main`** | Der Bot committet `issues.json` nach `main`; lokale Pushes werden abgelehnt („fetch first"). Bekannt und in `CLAUDE.md` dokumentiert. | mittel – akzeptiert; kein Datenverlust, `issues.json` ist generiert |
| **Dubletten** | Steuerzentrale prüft nur exakten Titel-Match. Manuell angelegte Issues ohne relevantes Label sind im Dashboard unsichtbar. | mittel |
| **Kein Owner-Modell** | Assignee ungenutzt; Verantwortung steht als Freitext im Body. | hoch für den Auftrag, technisch leicht lösbar (Assignee + Body-Feld) |
| **Statusfluss unvollständig** | Kein Status für „Warten auf Freigabe" – Freigaben verstecken sich in `status:blockiert` + `reviewer:mensch`. Kein „Abgebrochen", kein „Beobachten". | hoch – Kern des Auftrags |
| **Keine Aktivitätshistorie** | `issues.json` enthält keine Kommentare/Events. Verlauf nur auf GitHub. | mittel |
| **Zwei Schreibpfade nach GitHub** | Steuerzentrale (`gh`) und Menschen im GitHub-UI. Beide arbeiten auf Labels, idempotent (remove alle status-Labels, add eins). Kein dritter Pfad nötig. | ok |
| **Secrets** | Browser braucht keinen Token. Actions nutzt `GITHUB_TOKEN` (issues: read, contents: write). Lokal: `gh auth` im Keychain. `.env.local` ist gitignored. | ok – so belassen |

## 5. Wiederverwendbar vs. ersetzen

**Wiederverwenden (bewährt):**

- `scripts/build-dashboard-data.mjs` – Pipeline lokal = Actions, wird erweitert (nicht ersetzt)
- `.github/workflows/dashboard-data.yml` – Event-getriggert + stündlich, Rebase-Retry
- `automation/dashboard/github-issues.mjs` – idempotenter Label-Wechsel, Kommentar-Format, Redaktion (`redactPublicText`)
- `scripts/serve-dashboard.mjs` – wird zum lokalen Server mit optionaler Aktions-API ausgebaut
- Label-System und Body-Konventionen – werden zum expliziten Schema erhoben

**Ersetzen:**

- `docs/ai-dashboard/index.html` – monolithisches Inline-JS ohne Tests, Emoji-lastig, keine Navigation, kein Detail, keine Deep Links → in `index.html` + `app.js` + `app.css` + testbares `lib/model.mjs` aufgeteilt

**Nicht anfassen:** `automation/dashboard/` (Steuerzentrale) und `control-center/` (Stufe 1) bleiben unverändert;
das Control Center liest deren Daten nur.

## 6. Offene Produktentscheidungen (Vorlage für Teppich Paradies)

1. **GitHub Pages reparieren oder nur lokal nutzen?** Pages ist `errored`. Empfehlung: Pages-Build im Repo
   prüfen (Settings → Pages), da die Seite als PWA auf dem Handy installiert ist. Das Control Center ist so
   gebaut, dass es statisch (read-only) und lokal (mit Aktionen) läuft – Pages ist deshalb kein Blocker.
2. **Neue Status-Labels anlegen** (`status:triage`, `status:bereit`, `status:freigabe`, `status:abgebrochen`,
   `status:beobachten`) – siehe `ARCHITEKTUR.md` Abschnitt Statusmodell. Betrifft ein öffentliches Repo,
   daher Freigabe nötig; das Script liegt bereit (`setup-dashboard.sh`).
3. **Owner-Pflicht**: Empfehlung Assignee auf GitHub als Owner. KI-Agenten sind keine GitHub-Nutzer;
   der Ausführende wird über `## Worker` bzw. `reviewer:`-Label abgebildet. Alternative wäre ein
   Label `owner:ahmet` – nicht empfohlen (zweites Vokabular).
4. **Repo-Sichtbarkeit**: solange das Repo öffentlich ist, dürfen weder Umsätze noch Kundendaten in
   Issues oder `issues.json` – Insights aus Shopify/Ads sind damit nur lokal (nie in `docs/`) zulässig.
