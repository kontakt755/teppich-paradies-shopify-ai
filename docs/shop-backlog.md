# Shop-Backlog

Zentrale Liste der Orchestrator-Session. Immer nur **ein** aktives Arbeitspaket.
Status: `offen` · `aktiv` · `review` (PR offen) · `erledigt` · `blockiert`.
GitHub-Issues bleiben die Aufgabenquelle des Dashboards; hier steht die Reihenfolge.

| ID | Aufgabe | Prio | Status | Abhaengig von | Codebereich | Agent | Test |
|---|---|---|---|---|---|---|---|
| S-01 | Raumansicht "Im Raum" aus Kundenansicht nehmen (Schalter, Standard aus) | P0 | review | - | `blocks/tp-einfass-konfigurator.liquid` | Fable | Desktop+Mobil ok, siehe shop-tests |
| S-02 | "So rechnen wir" aus Kundenansicht entfernen | P0 | review | - | `blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js` | Fable | Desktop+Mobil ok |
| S-03 | Alt-Arbeiten pruefen: Issues #339, #188, #199, #282, #162 gegen Ist-Stand abgleichen, schliessen oder aktualisieren | P0 | offen | S-01, S-02 | nur Issues/Doku | guenstiger Worker | - |
| S-04 | Teppich-Ab-Preis: Rechenregel (kleinstes kaufbares Mass + Pflicht-Kettelung + Mindestpreis) festlegen, eine Quelle bauen | P1 | offen | S-02 | `assets/tp-masstepich-rechnung.js`, neues Snippet | Fable plant, mittleres Modell baut | - |
| S-05 | Trennung Teppich vs. Teppichboden in der Preisanzeige (Karte + PDP), keine globale Aenderung | P1 | offen | S-04 | Produktkarten-Snippets, `templates/collection.teppiche.json`, `templates/product.einfassung.json` | mittleres Modell | - |
| S-06 | Collection-Karte Teppiche: Name / ab XX EUR / Wunschmass verfuegbar / Jetzt konfigurieren | P1 | offen | S-05 | Produktkarte (gleicher Bereich wie S-05: seriell) | mittleres Modell | - |
| S-07 | PDP-Hierarchie Teppich: ab-Preis, Grundpreis dezent, Masse, Optionen, Endpreis | P1 | offen | S-05 | `templates/product.einfassung.json`, Preisblock | mittleres Modell | - |
| S-08 | Rabatt-Datenmodell: bestehende Metafelder inventarisieren, Vorschlag fuer Aktions-Felder | P1 | offen | - | Metafelder (nur Analyse) | Worker + Fable-Entscheid | - |
| S-09 | Verlegeservice-Logik verstehen, Aktionspreis-Hinweis daran anbinden (keine zweite Logik) | P1 | offen | S-08 | Service-Bloecke | Fable plant | - |
| S-10 | Produkttabelle VK/EK/Marge/Rabattklasse (EK nur aus belegter Quelle, nie geraten) | P1 | offen | S-08 | Daten, lokal ausserhalb des Repos | Worker | - |
| S-11 | Collection-Sortierung/Merchandising Teppichboden analysieren (Einstieg nicht ueber 200 EUR/m2) | P1 | offen | - | Collections, Sortierung (Analyse) | Worker | - |
| S-12 | Streichpreis-Struktur: belegbare Referenzpreise (30-Tage-Tiefstpreis), keine Fantasiepreise | P2 | offen | S-08 | Preis-Snippets | Fable | - |
| S-13 | Kettelungsbilder inventarisieren (Produkt, Bild, Zweck, Problem, Wunsch) | P2 | offen | - | nur Daten | Worker | - |
| S-14 | Externer Bild-Workflow fuer Kettelbilder vorbereiten | P2 | offen | S-13 | - | Fable plant | - |
| S-15 | Rabattaktionen ausrollen | P2 | offen | S-08 bis S-12, Freigabe Ahmet | Preise | - | - |
| S-16 | Bessere Raumvisualisierung (Ersatz fuer S-01) | P2 | offen | S-14 | Einfass-Konfigurator | - | - |
