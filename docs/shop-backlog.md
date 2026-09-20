# Shop-Backlog

Zentrale Liste der Orchestrator-Session. Immer nur **ein** aktives Arbeitspaket.
Status: `offen` · `aktiv` · `review` (PR offen) · `erledigt` · `blockiert`.
GitHub-Issues bleiben die Aufgabenquelle des Dashboards; hier steht die Reihenfolge.

| ID | Aufgabe | Prio | Status | Abhaengig von | Codebereich | Agent | Test |
|---|---|---|---|---|---|---|---|
| S-01 | Raumansicht "Im Raum" aus Kundenansicht nehmen (Schalter, Standard aus) | P0 | erledigt (live 2026-09-20) | - | `blocks/tp-einfass-konfigurator.liquid` | Fable | Scratch, Preview, Live ok |
| S-02 | "So rechnen wir" aus Kundenansicht entfernen | P0 | erledigt (live 2026-09-20) | - | `blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js` | Fable | Scratch, Preview, Live ok |
| S-03 | Alt-Arbeiten pruefen: Issues #339, #188, #199, #282, #162 gegen Ist-Stand abgleichen, schliessen oder aktualisieren | P0 | erledigt (Abgleich), Issue-Pflege siehe unten | S-01, S-02 | nur Issues/Doku | Haiku-Worker | Ergebnis unten |
| S-04 | Teppich-Ab-Preis: Rechenregel (kleinstes kaufbares Mass + Pflicht-Kettelung + Mindestpreis) festlegen, eine Quelle bauen | P1 | review | S-02 | `snippets/tp-teppich-ab-preis.liquid`, `blocks/price.liquid` | Fable | 12 Unit-Tests, Scratch Desktop+Mobil ok |
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

## S-03 Ergebnis (2026-09-20)
| Issue | Befund | Empfehlung |
|---|---|---|
| #199 Teppiche-Bereich | komplett live (ueber PR #281) | schliessen |
| #339 Visualisierer | gebaut (PR #338), seit PR #388 abgeschaltet | offen: Entscheidung Ahmet Kauf-Tool vs. Eigenbau, gehoert zu S-16 |
| #188 Massteppich/Raummass | gemergt (PRs #195, #276, #281, Fixes #384/#385) | Abnahme durch Ahmet, dann schliessen |
| #282 Piumera | Basis da, Rechner/Warenkorb/Structured Data unvollstaendig | offen lassen |
| #162 Kaufbox Rollenware | Live-Gesamtpreis da; Rechenbeispiel und Eingabegrenzen-Text nicht belegbar | offen mit diesen zwei Resten |
| #164 Verschnitt-Option | nicht gebaut | offen |
| #264 Kettelservice-Zweig | Issue ohne Inhalt | zurueck in Triage |
