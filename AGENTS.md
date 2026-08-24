# TEPPICH PARADIES – AGENT PROJECT RULES

Diese Datei ist die zentrale, verbindliche Regelquelle für alle Agenten, die an diesem Repository arbeiten (Claude Code, Codex, ggf. weitere). Andere Regel-/Hinweisdateien (z. B. `CODEX_RULES.txt`) dürfen ausschließlich kurz auf diese Datei verweisen und keine eigenen, abweichenden fachlichen Regeln führen.

`AGENTS.md` bleibt bewusst providerneutral und die einzige automatisch geladene Regelquelle: Claude Code liest diese Datei nativ, genau wie Codex. Es wird deshalb absichtlich kein zusätzliches `CLAUDE.md` mit denselben fachlichen Regeln angelegt, um Redundanz und Drift zwischen zwei Regelquellen zu vermeiden. Rein Claude-spezifische Betriebshinweise (z. B. empfohlene Subagents/Skills) gehören, falls nötig, in ein schlankes `CLAUDE.md`, das diese Datei referenziert statt sie zu duplizieren.

## Projekt

Shopify-Onlineshop der Teppich Paradies Oranienburg GmbH.

- Öffentlicher Shop: https://www.teppich-paradies.net
- Shopify Store: `sjjyq1-6w.myshopify.com`

Arbeite immer im aktuellen Repository Root und verlasse dich nicht auf fest codierte absolute Windows- oder macOS-Pfade. Dieses Repository wird auf mehreren Rechnern (u. a. Windows und macOS) ausgecheckt; ein einzelner lokaler Pfad ist nie allgemeingültig. Falls ein absoluter Pfad in einem Script oder einer Notiz auftaucht, ist er als Hinweis auf einen einzelnen historischen Arbeitsplatz zu verstehen, nicht als Vorgabe.

Vor Änderungen, bei denen der aktuelle Live-Theme-Stand relevant ist, zuerst prüfen, welches Theme tatsächlich live ist. Nicht dauerhaft darauf vertrauen, dass eine gespeicherte Theme-ID aktuell bleibt.

Stand beim Erstellen dieser Datei:

- Live-Theme: `theme-productpage-v2-night`, ID `201829679438`
- Fallback-Theme: `Horizon`, ID `196301750606`

## Grundsätzliche Arbeitsweise

- Bestehenden Code zuerst verstehen und funktionierende Lösungen nicht unnötig neu schreiben.
- Kleine, klar abgegrenzte Aufgaben möglichst selbstständig vollständig durchführen.
- Nicht nach jedem normalen Terminal-, Browser-, Playwright-, Datei-, Netzwerk- oder Shopify-CLI-Schritt fragen.
- Bei einem Hindernis selbstständig eine sichere Alternative prüfen.
- Nicht wegen GitHub, Authentifizierung oder Nebeninfrastruktur unnötig vom eigentlichen Shopify-Auftrag abweichen.
- Keine unnötigen großen Refactorings durchführen, wenn eine kleine robuste Änderung reicht.
- Mobile und Desktop berücksichtigen und bestehende Funktionen regressionsprüfen.
- Nach Theme-Änderungen Shopify Theme Check verwenden, wenn sinnvoll.
- Vor dem Livegang die konkret betroffenen Funktionen risikobasiert testen.
- Nach dem Livegang den echten öffentlichen Shop ohne Preview-Parameter kontrollieren.
- Fallback-Theme erhalten; Theme-ID `196301750606` niemals löschen oder überschreiben.
- Bei kleinen, sicheren und getesteten Theme-Optimierungen darf direkt live veröffentlicht werden, sofern der Auftrag nichts anderes sagt.
- Bei größeren riskanten Architekturänderungen zuerst analysieren und berichten.
- Wenn eine irreversible oder geschäftskritische Änderung notwendig wäre, vorher fragen.

## NIEMALS ohne ausdrückliche Freigabe

- Produkte oder Varianten löschen
- SKUs oder Varianten verändern
- Preise verändern
- Checkout-Einstellungen verändern
- Zahlungsanbieter verändern
- Steuer-Einstellungen verändern
- Versand-Einstellungen verändern
- DNS oder Domains verändern
- Rechtstexte verändern
- kostenpflichtige Apps installieren
- Käufe oder Abonnements auslösen
- Fallback-Theme löschen oder überschreiben
- Horizon-Version migrieren
- große irreversible Shopify-Datenänderungen durchführen

## Produktdaten

Metafelder oder Collection-Zuordnungen nur verändern, wenn der jeweilige Auftrag dies ausdrücklich erlaubt oder wenn die Änderung eindeutig durch verlässliche vorhandene Produkt- oder Herstellerdaten belegt ist.

Nie technische Eigenschaften erfinden oder anhand eines Produktbildes allein ableiten.

Bei unklaren Produktdaten:

- nicht raten
- als offenen Fall dokumentieren
- mit der nächsten eindeutigen Aufgabe fortfahren

## Shopify Theme

Bestehende wichtige Funktionen nicht unnötig neu bauen:

- prominente €/m²-Darstellung bei Paketprodukten
- Paket-/Verschnittrechner
- deutsche Paket-/Bestellmengenanzeige
- Produktvergleich bis maximal 3 Produkte
- Musterbestellung
- Breadcrumb
- Produktvorteile
- Produktbeschreibung / Verkaufsbereich
- technische Daten
- neue Product-Card-Logik
- gekürzte sichtbare Kartentitel
- Predictive Search
- Startseiten-Struktur
- Vinylboden-Kategoriecarousel
- Mobile Peek / Carousel-Navigation

Der Paket-/Verschnittrechner und dessen Warenkorblogik sind bereits intensiv getestet. Nicht neu schreiben, außer der Benutzer beauftragt dies ausdrücklich.

Globo Mega Menu funktioniert aktuell. Nicht grundsätzlich umbauen, außer der Auftrag betrifft ausdrücklich das Menü.

Horizon 4.1.3 existiert als separates Update. Keine Migration durchführen, solange dies nicht ausdrücklich beauftragt wird.

## Preislogik

Bei Paketprodukten:

- €/m² ist die primäre Kundendarstellung.
- Der interne Shopify-Preis bleibt der Paketpreis.
- Den Paketpreis auf Collection-Karten normalerweise nicht prominent anzeigen.
- Die Produktdetailseite darf den Paketpreis sekundär zeigen.
- Warenkorb und Checkout müssen mit echten ganzen Paketen arbeiten.

Der Preisfilter bei Vinylboden ist bewusst ausgeblendet, solange Shopify nach Paketpreis statt sichtbarem €/m² filtert. Diese Logik nicht versehentlich zurückbauen.

## Produktkarten

Ziele:

- kurze sichtbare Titel
- echten vollständigen Produkttitel für Link und Barrierefreiheit erhalten
- klare €/m²-Darstellung
- nicht überladen
- Muster und Vergleichen nur dort, wo sinnvoll
- auf Mobile nichts abschneiden

Teppichboden-Titel mit angehängten Breiten wie „Piumera Teppichboden 400cm 500cm“ dürfen in der sichtbaren Karte beispielsweise als „Piumera“ dargestellt werden, ohne den echten Shopify-Produkttitel zu verändern.

## UX / Design

Stil:

- moderner Fachhandel
- hochwertig
- ruhig
- verständlich
- nicht überladen
- keine unnötige Marketing-Sprache
- vorhandene Teppich-Paradies-Farbwelt nutzen

Prioritäten:

1. Verständlichkeit
2. Kaufentscheidung erleichtern
3. Mobile Bedienbarkeit
4. Fachhandels-Vertrauen
5. saubere technische Umsetzung

Gute Konkurrenzseiten dürfen als UX-Benchmark untersucht werden. Keine Texte, Bilder oder Designs 1:1 kopieren.

## Bilder

- Vorhandene echte Produkt- und Herstellerbilder bevorzugen.
- Keine Produkteigenschaften durch erfundene Bilder falsch darstellen.
- Erklärende Kategorievisuals dürfen verwendet werden, wenn sie technisch korrekt sind.
- Above-the-fold-Bilder beim ersten Laden sinnvoll priorisieren.
- Lazy Loading nicht pauschal abschalten.

## Tests

Vor bzw. nach relevanten Theme-Änderungen bevorzugt `npm run qa` verwenden, statt dieselben mechanischen Browser- und Theme-Checks manuell mit Modellarbeit zu wiederholen.

Weitere verfügbare, rein lesende lokale Checks: `npm run seo:check`, `npm run compare:check`, `npm run qa:evidence:test`, `npm run secret:scan`. `npm run sales:check` ist ein Live-Storefront-Test ohne Kaufabschluss: Er verändert einen anonymen Test-Warenkorb und kann bis zum Checkout navigieren. Vor einem Commit sollte `npm run secret:scan` laufen, wenn neue Dateien mit potenziell sensiblem Inhalt hinzugekommen sind.

Je nach Änderung sinnvoll und risikobasiert prüfen:

- Desktop
- Mobile bei ca. 390 px
- Browser-Konsole
- Theme Check
- Links und Bilder
- Produktkarten und Varianten
- Warenkorb
- Vergleich und Muster
- Rollenware und Fixpreis
- Teppichboden
- Klickvinyl und Klebevinyl

Nicht für jede Miniänderung den gesamten Shop unnötig testen.

## Kommunikation

Der Benutzer möchte möglichst wenig Rückfragen.

Bei klaren, reversiblen Aufgaben: analysieren → umsetzen → testen → live prüfen → kurz berichten.

Nur nachfragen, wenn:

- eine wichtige geschäftliche Entscheidung fehlt
- Daten nicht eindeutig belegbar sind
- eine irreversible oder riskante Änderung nötig wäre
- Kosten ausgelöst würden
- mehrere fachlich unterschiedliche Lösungen erhebliche Auswirkungen hätten

Abschlussberichte kompakt halten:

- was geändert wurde
- was getestet wurde
- ob live
- offene echte Probleme

## AI Router und Handoff

Neue Aufgaben zuerst mit `npm run workflow:route -- "Neue Aufgabe: ..."` routen. `npm run workflow:status`, `workflow:next` und `workflow:continue` leiten den nächsten sicheren Schritt aus Task, Git-Diff und commitgebundener Evidence ab. `.workflow/state.json` ist nur eine generierte Momentaufnahme; `CURRENT_STATE.md` und `NEXT_ACTION.md` sind keine Workflow-Wahrheit.

- Scripts erledigen deterministische Mechanik und reine Testausführung zuerst.
- CLASS A benötigt kein Zweitmodell; CLASS B nur bei sensiblen Dateien; CLASS C normalerweise und CLASS D immer.
- Externe 429/503/Timeouts wechseln keinen Agenten und erhalten höchstens einen unmittelbaren Script-Retry. Cloud-/Proxy-403 bei Storefront-Zugriff geht an den lokalen Mac-Runner.
- Maximal drei autonome Reparaturrunden; danach Human Escalation. Reviewer erhalten bevorzugt nur Diff, Testreport und Findings.
- Human Approval wird nie gespeichert und gilt nur für den konkret geprüften Commit. Merge nach `main`, Live-Publish, Shopify Writes an Preisen/SKUs/Varianten, Massenanlage, Checkout/Payment/Shipping, DNS und irreversible Änderungen bleiben gesperrt.
- Der Router empfiehlt Rollen, startet aber keine externen Agenten und ruft keine Modell-API auf.

## Aktueller wichtiger Backlog

Nicht automatisch bearbeiten, aber bei zukünftigen Aufgaben berücksichtigen:

- Teppichboden Mobile-Menü optimieren
- fehlendes oder graues Kategoriebild bei Teppichboden-Unterseiten endgültig beheben
- Hochflor-/Mittelflor-Zuordnung fachlich verbessern
- ecoVella-/Wolle-Zuordnung sauber prüfen
- Raumplaner / Roomvo evaluieren beziehungsweise später integrieren
- Horizon 4.1.3 später separat migrieren
- Produktbilder langfristig verbessern
- Reste & Sonderposten später als eigenen starken Shopbereich aufbauen
