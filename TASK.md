# Langzeitaufgabe: Vollstaendiger Shop-Audit

## WATCHDOG EXECUTION OVERRIDE (2026-09-19, verbindlich)

```
EXECUTION MODE: SEQUENTIAL
SUBAGENTS: DISABLED
PARALLEL CODEX AGENTS: DISABLED
MAXIMUM ACTIVE CODEX INSTANCES: 1
```

Dieser Abschnitt hat bei widersprüchlichen Aussagen zur Parallelisierung
**Vorrang** vor allen späteren Abschnitten dieser Datei, insbesondere vor
"ARBEITSWEISE" (dort steht noch "Nutze mehrere spezialisierte Subagenten
parallel, wenn sinnvoll" und "Subagenten sinnvoll einsetzen" - das gilt fuer
diesen Watchdog-Betrieb NICHT mehr).

Grund: Mehrere parallel gestartete Subagenten/Bereiche (Architecture,
SEO/Performance, Navigation/Mobile gleichzeitig) haben das Nutzungskontingent
in sehr kurzer Zeit verbraucht. Ab jetzt gilt:

- **Ein Audit-Bereich nach dem anderen**, nicht mehrere gleichzeitig.
- **Keine proaktiv gestarteten Subagenten**, keine Hintergrundagenten, keine
  parallelen Tasks.
- Bereits abgeschlossene Prüfungen nicht unnötig wiederholen (siehe
  `audit/MASTER_STATUS.md`, `audit/SESSION_LOG.md`).
- Reihenfolge, falls `audit/MASTER_STATUS.md` noch keine konkrete nächste
  Aufgabe nennt: Preisberechnung → Warenkorb → Rechner (Teppich/Raummaß/
  Kettelservice/Sockelleisten) → Produktvarianten → JavaScript Runtime →
  Mobile → Navigation/Suche → SEO → Performance → UX → Cross-Feature-Tests →
  finaler Regressionstest.

Alle fachlichen Anforderungen weiter unten in dieser Datei (was geprüft,
dokumentiert und priorisiert werden muss) bleiben **vollständig und
unverändert** gültig. Nur die Ausführungsstrategie (parallel vs. sequenziell)
wird durch diesen Abschnitt überschrieben.

Backup der Fassung vor diesem Override: `TASK.md.orig-2026-09-19.bak`.

## Fortsetzungshinweis (vom Watchdog-Setup, 2026-09-19)

Diese Aufgabe wurde zuerst in einer interaktiven Codex-Desktop-Session
(Thread `01a0b9d4-370b-7633-9409-559c26fe72aa`, "Shopify-Shop vollstaendig
auditieren") in einem separaten Scratch-Verzeichnis begonnen. Diese Session
ist wegen eines defekten Tool-Aufrufs in ihrer gespeicherten Historie nicht
mehr fortsetzbar (weder headless noch in der App). Der bisherige Fortschritt
war minimal (~5 %, siehe unten) und wurde nach `audit/` in dieses Repository
uebernommen:

- `audit/MASTER_STATUS.md` - Ausgangsstand (5 %, keine bestaetigten Issues,
  nur Repo-/Live-Theme-Identifikation abgeschlossen).
- `audit/evidence/` - erste gesammelte Belege (Screenshots, Runtime-/Source-
  Manifest von einer fruehen Pruefung des Piumera-Referenzprodukts).

Referenzierter Basis-Commit der alten Session: `66729099c4122385e19172a1f5ba14a7524c3bfb`
(liegt im main-Verlauf dieses Repos, vor dem heutigen Merge von PR #380).

**Setze den Audit auf Basis dieses Standes fort, nicht von Null.** Lies
zuerst `audit/MASTER_STATUS.md` und `audit/evidence/`, bevor du neu beginnst.

Alle folgenden Original-Anweisungen des Auftraggebers gelten unveraendert.

---

## Original-Auftrag (vom Nutzer, 2026-09-19)

Du arbeitest als leitender Senior Shopify Engineer, QA Engineer, UX-/Conversion-Spezialist, SEO-Spezialist und Performance Engineer.

Deine Aufgabe ist ein vollständiger technischer und funktionaler Audit unseres Shopify-Onlineshops Teppich-Paradies.

WICHTIG:

Dies ist zunächst ausschließlich eine ANALYSE.

NICHTS im produktiven Shop verändern.
KEINE Dateien überschreiben.
KEINE Funktionen entfernen.
KEINE automatischen „Cleanups" durchführen.
KEINE Reparaturen durchführen.

Erst Fehler finden, beweisen, dokumentieren, priorisieren und anschließend für einen separaten Coding-Agenten so aufbereiten, dass die Fehler später sicher umgesetzt werden können.

Der Shop wurde umfangreich individualisiert und enthält eigene Rechner, Produktlogiken, Variantenlogiken und Services. Deshalb darfst du nicht davon ausgehen, dass ungewöhnlicher Code automatisch überflüssig ist.

────────────────────────────
HAUPTZIEL
────────────────────────────

Untersuche den gesamten Shop so tief wie möglich und finde:

• technische Fehler
• versteckte Bugs
• JavaScript-Fehler
• Liquid-Fehler
• CSS-Probleme
• fehlerhafte Logiken
• mobile Darstellungsprobleme
• nicht funktionierende Buttons
• tote Links
• 404-Fehler
• fehlerhafte Weiterleitungen
• falsche Preisberechnungen
• Fehler bei Varianten
• Warenkorbprobleme
• Checkout-Hindernisse
• fehlerhafte Mengenberechnungen
• SEO-Probleme
• strukturierte-Daten-Probleme
• Performance-Probleme
• Conversion-Hindernisse
• inkonsistente UX
• Accessibility-Probleme
• Probleme mit Google Merchant Center / Google Ads relevanten Shopdaten
• unnötig schweres JavaScript
• doppelt geladenen Code
• alte oder nicht mehr verwendete Komponenten
• mögliche Race Conditions
• Fehler bei dynamisch geladenen Sections
• Fehler nach Browser-Zurück
• Fehler nach Reload
• Probleme mit lokalem Speicher / Session State
• Probleme bei ungewöhnlichen Eingaben
• fehlende Validierungen
• Fehler in individuellen Shopify-Funktionen

Ziel ist nicht, möglichst viele theoretische Probleme aufzuschreiben.

Ziel ist, tatsächlich relevante Probleme zu finden, zu reproduzieren und möglichst eindeutig auf ihre Ursache zurückzuführen.

────────────────────────────
ARBEITSWEISE
────────────────────────────

Nutze mehrere spezialisierte Subagenten parallel, wenn sinnvoll.

Teile den Audit mindestens in folgende Bereiche:

1. CODE / ARCHITEKTUR
2. JAVASCRIPT / RUNTIME / BROWSER
3. MOBILE / RESPONSIVE
4. PRODUKTSEITEN / SHOPIFY LOGIK
5. TEPPICHRECHNER / RAUMMASS / KETTELSERVICE
6. SOCKELLEISTEN-/MENGENRECHNER
7. SUCHE / NAVIGATION / PRODUKTFINDUNG
8. CART / CHECKOUT / CONVERSION
9. PERFORMANCE
10. SEO / GOOGLE
11. UX / CONVERSION
12. REGRESSION / CROSS-FEATURE TESTS

Jeder Agent muss seine Ergebnisse belegen und darf Vermutungen nicht als bestätigte Fehler eintragen.

────────────────────────────
SHOP-SPEZIFISCHE PRIORITÄTEN
────────────────────────────

Folgende Bereiche haben besondere Priorität:

• Teppichboden / Rollenware
• Raummaßrechner
• Teppichrechner
• Wunschmaß-Teppiche
• Kettelservice
• Kettelleisten
• Haftunterlage / Haftvlies
• Sockelleisten-Rechner
• Klickvinyl Paket-/Mengenrechner
• Klebevinyl
• PVC
• Produktvarianten
• Warenkorbpreis vs. Produktseitenpreis
• Such-Autosuggest
• Mega-Menü Desktop
• Mega-Menü Mobile
• Visualisierer
• Verlegeservice
• Musterbestellung
• Produktbilder / Galerie

────────────────────────────
PRODUKTLOGIK GRÜNDLICH TESTEN
────────────────────────────

Teste insbesondere:

• Variantenwechsel
• Preise
• Mengen
• Maßeingaben
• Mindestmengen
• maximale Eingaben
• Dezimalwerte
• Komma statt Punkt
• leere Eingaben
• 0
• negative Werte
• extrem große Werte
• Sonderzeichen
• schneller Variantenwechsel
• mehrfaches Klicken
• Reload
• Zurück-Navigation
• Warenkorb
• Warenkorb bearbeiten
• Produkt erneut öffnen

Achte besonders darauf, ob angezeigter Preis und Warenkorbpreis übereinstimmen.

────────────────────────────
KETTELSERVICE / RAUMMASS
────────────────────────────

Bei geeigneten Teppichprodukten existieren bzw. entstehen Funktionen für:

• Raummaß
• Wunschmaß
• Kettelung
• Kettelleiste
• Haftunterlage / Haftvlies
• verschiedene Teppichbreiten
• Länge
• Breite
• Umfang
• laufende Meter
• Quadratmeter
• Zusatzleistungen

Untersuche sämtliche Berechnungen mathematisch.

Teste Grenzfälle.

Prüfe:

• richtige Warenbreite
• richtige Länge
• richtige Fläche
• richtiger Materialpreis
• richtige Kettelung
• richtiger Umfang
• Rundung von laufenden Metern
• richtige Zusatzoptionen
• korrekter Warenkorb
• korrekte Line Item Properties

Nicht nur den sichtbaren Frontendpreis prüfen.

Immer auch den tatsächlich an Shopify übergebenen Warenkorbwert prüfen.

────────────────────────────
JORDAN / KETTELSERVICE
────────────────────────────

Kettelservice darf nicht pauschal allen Produkten angeboten werden.

Prüfe:

• welche Produkte Kettelservice erhalten
• ob falsche Produkte Ketteloptionen anzeigen
• ob richtige Produkte keine Ketteloption anzeigen
• Variantenlogik
• Preislogik
• Raummaßlogik
• Warenkorbübertragung

Lieferanteninformationen dürfen nicht unnötig kundenseitig sichtbar werden.

────────────────────────────
NICHT NUR HAPPY PATH TESTEN
────────────────────────────

Teste bewusst ungewöhnliche Nutzeraktionen:

• zweimal schnell klicken
• Felder leer lassen
• sehr große Zahlen
• 0
• Dezimalwerte
• Komma
• Punkt
• Copy/Paste
• Browser zurück
• Reload
• Tab wechseln
• Variante wechseln
• Option auswählen und zurückwechseln
• Produkt zweimal hinzufügen
• unterschiedliche Produkte kombinieren
• Menge im Warenkorb ändern
• Produkt entfernen
• Warenkorb erneut öffnen
• Bildschirmgröße ändern
• langsame Verbindung simulieren, soweit möglich

────────────────────────────
FEHLERPRIORISIERUNG
────────────────────────────

Ordne jeden bestätigten Fehler ein:

P0 – BLOCKER

Kunde kann nicht kaufen oder Preis/Berechnung ist erheblich falsch.

P1 – KRITISCH

Funktion stark beeinträchtigt, Conversion-/Bestellproblem oder Datenfehler.

P2 – HOCH

relevantes UX-, Mobile-, SEO- oder Performanceproblem.

P3 – MITTEL

merkliches Problem ohne unmittelbaren Kaufblocker.

P4 – NIEDRIG

kosmetisch, kleinere Verbesserung oder Codequalität.

────────────────────────────
FÜR JEDEN FEHLER DOKUMENTIEREN
────────────────────────────

Jeder bestätigte Fehler benötigt:

ID

Titel

Priorität

Bereich

URL / Template / Datei

betroffene Geräte

betroffene Browser soweit bekannt

Beschreibung

Schritte zur Reproduktion

erwartetes Verhalten

tatsächliches Verhalten

technische Ursache soweit ermittelbar

betroffene Datei(en)

betroffene Codezeile(n), wenn bestimmbar

Risiko

empfohlene Lösung

Aufwand grob:

S
M
L
XL

Sicherheit der Diagnose:

BESTÄTIGT
SEHR WAHRSCHEINLICH
VERDACHT

Keine Vermutung als bestätigten Fehler darstellen.

────────────────────────────
WICHTIG: OUTSOURCING AN CLAUDE CODE
────────────────────────────

Die spätere Umsetzung vieler Fehler erfolgt NICHT durch dich, sondern durch einen separaten Coding-Agenten, insbesondere Claude Code.

Deshalb muss jeder bestätigte Fehler zusätzlich einen klaren IMPLEMENTATION BRIEF erhalten.

Der Brief muss so konkret sein, dass ein anderer Coding-Agent den Fehler beheben kann, ohne den gesamten Audit neu durchführen zu müssen.

Für jeden Fehler zusätzlich dokumentieren:

IMPLEMENTATION BRIEF

Issue-ID:
Priorität:
Ziel:
Problem:
Root Cause:
Betroffene Dateien:
Betroffene Funktionen / Sections / Snippets:
Relevante Codebereiche:
Zu ändernde Logik:
Nicht verändern:
Abhängigkeiten:
Mögliche Seiteneffekte:
Akzeptanzkriterien:
Testfälle:
Regressionstests:
Rollback-Risiko:
Geschätzter Aufwand:
Empfohlene Reihenfolge:

WICHTIG:

Wenn die Root Cause nicht sicher bekannt ist, darfst du keinen aggressiven Fix vorschlagen.

Dann kennzeichnen:

ROOT CAUSE UNKLAR

und beschreiben, welche Untersuchung vor der Reparatur nötig ist.

────────────────────────────
CLAUDE-CODE-FIX-PAKETE
────────────────────────────

Erstelle zusätzlich einen Ordner:

/audit/fix-packs/

Dort sollen später logisch getrennte Arbeitspakete entstehen.

Zum Beispiel:

/audit/fix-packs/FIX_PACK_01_BLOCKERS.md

/audit/fix-packs/FIX_PACK_02_PRICING_CART.md

/audit/fix-packs/FIX_PACK_03_CALCULATORS.md

/audit/fix-packs/FIX_PACK_04_MOBILE.md

/audit/fix-packs/FIX_PACK_05_NAV_SEARCH.md

/audit/fix-packs/FIX_PACK_06_SEO.md

/audit/fix-packs/FIX_PACK_07_PERFORMANCE.md

/audit/fix-packs/FIX_PACK_08_UX.md

/audit/fix-packs/FIX_PACK_09_CODE_CLEANUP.md

/audit/fix-packs/FIX_PACK_10_FINAL_REGRESSION.md

Noch NICHT blind alle Dateien erzeugen.

Erzeuge Fix-Packs erst dann, wenn genügend bestätigte Issues für einen sinnvollen Arbeitsblock vorliegen.

────────────────────────────
REGELN FÜR FIX-PACKS
────────────────────────────

Ein Fix-Pack soll nicht einfach nur eine Liste von Fehlern sein.

Es soll einem anderen Agenten als vollständige Arbeitsanweisung dienen.

Jedes Fix-Pack enthält:

ZIEL

BETROFFENE ISSUES

PRIORITÄT

BETROFFENE DATEIEN

ABHÄNGIGKEITEN

NICHT VERÄNDERN

UMSETZUNGSREIHENFOLGE

ISSUE-BY-ISSUE IMPLEMENTATION BRIEF

AKZEPTANZTESTS

REGRESSIONSTESTS

ABSCHLUSSCHECK

────────────────────────────
FIX-PACK-GRÖSSE
────────────────────────────

Pakete sollen sinnvoll klein bleiben.

Kein Fix-Pack darf unnötig viele voneinander unabhängige Bereiche vermischen.

Bevorzugt:

3–10 zusammenhängende Issues pro Fix-Pack.

Wenn ein Problem sehr kritisch oder komplex ist:

eigenes Fix-Pack.

────────────────────────────
DATEIKONFLIKTE VERMEIDEN
────────────────────────────

Wenn mehrere Fix-Packs dieselben Kern-Dateien verändern würden, dokumentiere dies ausdrücklich.

Beispiel:

FILE CONFLICT:
assets/product-calculator.js

Fix-Pack A und Fix-Pack B dürfen nicht parallel umgesetzt werden.

Empfohlene Reihenfolge:

A → Test → Merge → B

Ziel ist, dass mehrere Coding-Agenten später nicht dieselben Dateien gleichzeitig verändern.

────────────────────────────
PARALLELISIERBARKEIT
────────────────────────────

Kennzeichne jedes Fix-Pack:

PARALLEL SAFE: YES / NO

Wenn YES:

Liste auf, mit welchen anderen Fix-Packs es gleichzeitig umgesetzt werden kann.

Wenn NO:

Begründe warum.

Beispiel:

PARALLEL SAFE: YES

Kann parallel mit:
FIX_PACK_06_SEO
FIX_PACK_08_UX

Nicht parallel mit:
FIX_PACK_03_CALCULATORS

Grund:
beide verändern product-form.js

────────────────────────────
CLAUDE-CODE-STARTPROMPT
────────────────────────────

Erstelle für jedes Fix-Pack am Anfang einen fertigen Prompt, den man direkt in Claude Code einfügen kann.

Format:

CLAUDE CODE TASK

Lies zuerst:

[relevante Audit-Dateien]

Ziel:

[Ziel des Pakets]

Arbeite ausschließlich an den Issues:

[IDs]

WICHTIG:

• nichts außerhalb des Scopes verändern
• keine unnötigen Refactorings
• keine Funktionen entfernen
• bestehende Shoplogik respektieren
• vor Änderungen betroffene Dateien lesen
• Änderungen minimal halten
• jeden Fix einzeln testen
• Regressionstests durchführen
• Änderungen dokumentieren

Nach Abschluss:

Erstelle:

/audit/fix-results/[FIX_PACK_NAME]_RESULT.md

mit:

• geänderte Dateien
• geänderte Funktionen
• erledigte Issues
• nicht erledigte Issues
• neue Auffälligkeiten
• Tests durchgeführt
• Testergebnisse
• mögliche Risiken

────────────────────────────
CLAUDE DARF NICHT BLIND REFACTORIEREN
────────────────────────────

Claude Code soll niemals folgende Aufgaben automatisch durchführen, sofern nicht explizit Teil des Issues:

• gesamten Code neu strukturieren
• globale CSS-Struktur ändern
• große JS-Dateien neu schreiben
• bestehende Produktlogik vereinfachen
• Apps entfernen
• Metafield-Strukturen ändern
• Liquid-Struktur umfassend umbauen
• Funktionen löschen, nur weil sie ungenutzt wirken

Minimal-invasive Fixes bevorzugen.

────────────────────────────
AUDIT-ORDNER
────────────────────────────

Lege an:

/audit/

Darin mindestens:

MASTER_STATUS.md
ISSUES.md
TEST_MATRIX.md
ARCHITECTURE.md
PERFORMANCE.md
SEO.md
UX.md
SESSION_LOG.md
DEPENDENCY_MAP.md
FIX_PACK_INDEX.md

Zusätzlich:

/audit/fix-packs/

/audit/fix-results/

────────────────────────────
DEPENDENCY_MAP.md
────────────────────────────

Dokumentiere:

welche Dateien kritisch miteinander verbunden sind.

Beispiel:

product-form.js
→ cart-drawer.js
→ custom-price.js
→ room-calculator.js

Kennzeichne:

CORE FILE

SHARED FILE

LOW RISK

HIGH RISK

Damit spätere Coding-Agenten erkennen, welche Änderungen besonders vorsichtig durchgeführt werden müssen.

────────────────────────────
FIX_PACK_INDEX.md
────────────────────────────

Enthält:

FIX_PACK

STATUS

PRIORITÄT

ISSUES

PARALLEL SAFE

ABHÄNGIGKEITEN

ZUSTÄNDIGER AGENT

Statuswerte:

NOT READY
READY
IN PROGRESS
DONE
QA FAILED
QA PASSED

────────────────────────────
MASTER_STATUS.md
────────────────────────────

MASTER_STATUS.md muss jederzeit enthalten:

AUDIT FORTSCHRITT: XX %

Abgeschlossen:

[✓] Bereich

In Arbeit:

[~] Bereich

Noch offen:

[ ] Bereich

Anzahl gefundener Issues:

P0:
P1:
P2:
P3:
P4:

Aktuell untersuchter Bereich:

Letzte abgeschlossene Aufgabe:

Nächste Aufgabe:

Wichtige offene Hypothesen:

Fix-Packs Ready:

Fix-Packs Done:

QA Passed:

QA Failed:

────────────────────────────
SESSION_LOG.md
────────────────────────────

Am Ende jeder Session dokumentieren:

Datum / Session

Was wurde untersucht?

Welche Dateien?

Welche Seiten?

Welche Funktionen?

Welche Fehler bestätigt?

Welche Hypothesen verworfen?

Welche Bereiche noch offen?

Welche Fix-Packs wurden vorbereitet?

Wo genau muss die nächste Session weiterarbeiten?

Welche Tests müssen wiederholt werden?

────────────────────────────
WENN SESSION ENDET
────────────────────────────

Nicht hektisch versuchen alles abzuschließen.

Vor Ende:

1. aktuellen Test sauber abschließen

2. ISSUES.md aktualisieren

3. MASTER_STATUS.md aktualisieren

4. TEST_MATRIX.md aktualisieren

5. SESSION_LOG.md aktualisieren

6. DEPENDENCY_MAP.md aktualisieren

7. FIX_PACK_INDEX.md aktualisieren

8. genaue nächste Aufgabe dokumentieren

────────────────────────────
FORTSETZUNGSREGEL
────────────────────────────

Wenn der Audit bereits begonnen wurde:

ZUERST lesen:

/audit/MASTER_STATUS.md

/audit/SESSION_LOG.md

/audit/ISSUES.md

/audit/TEST_MATRIX.md

/audit/DEPENDENCY_MAP.md

/audit/FIX_PACK_INDEX.md

Danach Repository-Status prüfen.

Dann exakt dort weitermachen, wo die letzte Session aufgehört hat.

Bereits vollständig geprüfte Bereiche nicht ohne Grund wiederholen.

────────────────────────────
PHASENMODELL
────────────────────────────

PHASE 1

Audit

Keine Reparaturen.

PHASE 2

Fix-Packs erstellen.

Noch keine Reparaturen.

PHASE 3

Claude Code setzt freigegebene Fix-Packs um.

PHASE 4

Du führst QA auf die Claude-Änderungen durch.

PHASE 5

Fehlerhafte Fixes gehen zurück an Claude.

PHASE 6

Finaler Regressionstest.

────────────────────────────
QA NACH CLAUDE
────────────────────────────

Wenn Fixes umgesetzt wurden:

Lies zuerst:

/audit/fix-results/

Vergleiche jeden Fix mit:

Issue
Implementation Brief
Akzeptanzkriterien

Teste anschließend selbst.

Nicht davon ausgehen, dass der Fix korrekt ist, nur weil Claude ihn als erledigt markiert.

Status pro Issue:

FIX CONFIRMED

PARTIAL FIX

FAILED FIX

REGRESSION FOUND

NEEDS RETEST

────────────────────────────
NEUE FEHLER DURCH FIX
────────────────────────────

Wenn durch einen Fix ein neuer Fehler entsteht:

Neue Issue-ID vergeben.

Ursprüngliche Issue verlinken.

Beispiel:

TP-082

REGRESSION FROM:
TP-014

Dadurch bleibt nachvollziehbar, woher neue Fehler stammen.

────────────────────────────
FINALER AUDIT
────────────────────────────

Vor Abschluss:

• sämtliche P0/P1 erneut testen
• Preislogik erneut testen
• Warenkorb erneut testen
• Rechner erneut testen
• Varianten erneut testen
• Mobile erneut testen
• Navigation erneut testen
• Suche erneut testen
• Console erneut prüfen
• Network erneut prüfen
• 404 prüfen
• SEO erneut prüfen
• Performance erneut prüfen
• Kombination verschiedener Funktionen testen

────────────────────────────
ABSCHLUSSBERICHT
────────────────────────────

Erstelle:

/audit/FINAL_REPORT.md

Struktur:

1. Executive Summary

2. Gesamtzustand

3. P0 Blocker

4. P1 kritische Fehler

5. P2 hohe Priorität

6. P3 mittlere Priorität

7. P4 niedrige Priorität

8. Performance

9. Mobile

10. SEO

11. Produktseiten

12. Rechner

13. Warenkorb / Checkout

14. Navigation / Suche

15. UX / Conversion

16. Codequalität / Architektur

17. technische Schulden

18. durch Claude umgesetzte Fixes

19. QA-Ergebnisse

20. verbliebene Risiken

21. empfohlene nächste Schritte

────────────────────────────
BEWERTUNG
────────────────────────────

Am Ende:

TECHNIK: /100
MOBILE: /100
PERFORMANCE: /100
SEO: /100
UX: /100
CONVERSION: /100
PRODUKTLOGIK: /100
STABILITÄT: /100

GESAMT: /100

Bewertung anhand tatsächlicher Audit-Ergebnisse.

────────────────────────────
BEGINN
────────────────────────────

Beginne jetzt.

1. Repository vollständig kartieren.

2. vorhandene Architektur verstehen.

3. vorhandene Audit-Dateien suchen.

4. falls bereits ein Audit existiert, dort weiterarbeiten.

5. falls nicht, Audit-Struktur initialisieren.

6. Subagenten sinnvoll einsetzen.

7. keine Shop-Dateien verändern.

8. mit den kritischsten Bereichen beginnen:

Preisberechnung

→ Warenkorb

→ Rechner

→ Produktvarianten

→ JavaScript Runtime

→ Mobile

9. Parallel bereits Abhängigkeiten kartieren.

10. Sobald bestätigte Fehler vorliegen, Implementation Briefs erstellen.

11. Sinnvolle Fix-Packs vorbereiten.

12. Noch keine Reparaturen durchführen.

Arbeite gründlich.

Beweise Fehler soweit möglich durch Reproduktion.

Quantität der Fehler ist nicht das Ziel.

Zuverlässigkeit des Shops und eine saubere Übergabe an Claude Code sind das Ziel.
