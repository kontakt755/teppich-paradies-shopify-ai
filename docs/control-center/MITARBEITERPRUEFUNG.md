# Mitarbeiterpruefung des Dashboards · 22.10.2026

Auftrag #1618: bestehende Arbeitswege verbessern, mit Bestellungen und Packstation zuerst.
Die Pruefung umfasst Navigation, Startseite, Bestellfilter, Wareneingang, Packen, Aufgaben,
Kundenfaelle, Suche sowie Lade- und Fehlerzustaende. Browserproben verwenden ausschliesslich
eine private Datenkopie; Regressionstests enthalten synthetische Faelle.

| Bereich | Belegtes Problem | Umsetzung |
| --- | --- | --- |
| Startseite | Wartende Umschlaege fehlen im direkten Packueberblick. | Anzahl und direkter Weg zu „Wartet auf Ware“; notwendige Bestellkontrollen separat erreichbar. |
| Startseite | Der Weg zu offenen Bestellungen startet mit den neuesten statt den dringenden Faellen. | Direkter Einstieg „Dringendes bearbeiten“; die regulaere Bestellsortierung bleibt erhalten. |
| Vollstaendigkeit | Noch ladende bzw. nicht verfuegbare Rueckrufe, Kundenfaelle oder Service-Anfragen koennen wie erledigte Arbeit aussehen. | Gemeinsame Quellenpruefung, sichtbarer Teilstand; kein pauschales „Alles erledigt“. |
| Bestellungen | „Zahlung offen“ prueft offenen Versand. Bereits versandte Zahlungsausstaende fehlen. | Gemeinsame Zahlungsregel fuer Browser und Server; auch alte explizite Zahlungstreffer erreichbar. |
| Handy | Ab der zweiten ungegliederten Bestellkarte fehlt der Kundenname. | Kartenaufruf erhaelt keine versehentliche Gruppierungsangabe aus dem Listenindex. |
| Sammelstatus | Nach jedem Artikel werden dieselben Listen erneut gelesen. | Ein gemeinsamer Abschlussabruf; vorhandene Listen bleiben bei Lesefehlern erhalten. |
| Wareneingang | Ein gemischter Auftrag kann Muster bereits beim Oeffnen als angekommen behandeln. | Ausdrueckliche Bestaetigung je Muster; Oeffnen und Abbrechen schreiben nichts. |
| Packstation | Nach einem Speicher- oder Lesefehler verschwindet die Arbeitsliste. | Letzten bestaetigten Stand erhalten, klare Unterscheidung gespeichert/nicht gespeichert, lesender Wiederholungsweg. |
| Gebuendelte Umschlaege | Bestell-/Versandlinks zeigen nur die erste enthaltene Bestellung. | Jede enthaltene Bestellung bleibt einzeln erreichbar. |
| Wareneingang | Beim Wechsel zum Umschlag geht der gewaehlte Partnerladen verloren. | Direkter Rueckweg zum vorher gewaehlten Laden. |
| Aufgaben | Geoeffnete Teamlisten zeigen spaetere Aenderungen anderer Arbeitsplaetze nicht. | Geschuetzter Nachladeweg im bestehenden 30-Sekunden-Takt; Detailformulare bleiben unangetastet. |
| Aufgaben und Kundenfaelle | Ein Lesefehler wirkt wie eine leere Liste; wartende Kunden fehlen im Leerzustand. | Sichtbare Stoerung mit gezieltem Neuabruf; wartende Kunden mit direktem Bestellweg. |
| Suche | Zentrale Bestell-/Packwege fehlen; alte Kundentreffer bleiben waehrend neuer Eingabe sichtbar. | Direkte Arbeitswege und Team-Aufgabensuche; Treffer der alten Eingabe sofort verwerfen. |

## Grenzen

Die bestehenden Ablagen und Fachablaeufe bleiben fuehrend. Keine zweite Bestellverwaltung,
keine neuen Zugaenge, keine automatische Lieferantenbestellung und keine automatische physische
Waren-, Pack- oder Versandbestaetigung. Ein geladener oder vorbereiteter Vorgang ist kein
Nachweis fuer Versand oder tatsaechlichen Eingang.

Das technische Ergebnis ersetzt die normale Bedienung mit Ware und Drucker nicht. Weitere
Entwicklung sollte an beobachteten Betriebsfaellen ansetzen: benoetigte Angaben direkt am
jeweiligen Arbeitsschritt und kuerzere Wege zwischen Bestellung, Eingang und Umschlag.
