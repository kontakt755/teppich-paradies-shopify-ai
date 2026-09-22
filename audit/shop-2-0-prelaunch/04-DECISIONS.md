# Entscheidungen

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-09-22 | Arbeit auf frischem Branch `feature/shop-2-0-prelaunch` von `origin/main`, nicht auf `audit/shop-audit` | Audit-Branch liegt 189 Commits hinter `main`; dessen Befunde (TP-001…017) werden als Referenz übernommen, nicht neu erhoben |
| 2026-09-22 | Theme-Änderungen nur per `--only` ins Arbeitstheme 204436144462, Live nur über PR → main → Deploy-Kette | Vorgabe Inhaber 2026-09-15; Live-Gate verlangt Preview = origin/main |
| 2026-09-22 | Analysen parallel (read-only Agenten), Änderungen sequenziell mit einem Writer je Datei | Auftrag § 2; TASK.md-Watchdog-Override gilt für den alten Audit-Branch |
| 2026-09-22 | Keine KI-generierten Raumbilder; Menükacheln nur mit echten Produktfotos | Auftrag § 6 Produktehrlichkeit |
| 2026-09-22 | Buy-now-Button (Dynamic Checkout) auf Produktseiten deaktiviert | Auftrag § 12: Beratung darf nicht technisch umgangen werden; Express-Buttons im Warenkorb bleiben, aber erst nach der Pflichtantwort sichtbar |
| 2026-09-22 | Cart-Attribute mit deutschen Klartext-Schlüsseln (`Beratung`, `Telefon`, `Rückruf`, `Beratungsthema`, `Maßprüfung`, `Verlegung`) | Mitarbeiter lesen sie direkt an der Bestellung; Flow filtert darauf |
| 2026-09-22 | Order-Tags über Shopify Flow (kostenlos, nativ), nicht über App oder Theme | Auftrag § 42; Theme kann keine Tags setzen |
| 2026-09-22 | PL-011/PL-012 (Versandschwelle, Google-Bewertung) sind keine Fehler: Werte kommen aus `settings_schema.json`-Defaults (50 / 4,9 / über 240) | belegt: Live-`settings_data.json` ohne tp_*-Keys, Live rendert 50 € und 4,9 |
| 2026-09-22 | Radius-Text bleibt „bis 50 km" (Einsatzgebiet); 15 km nur zusammen mit der 649-€-Schwelle nennen | `domains/shopify/verlegeservice-livegang-vorlage.md:80-82` (Inhaber-Vorlage): beide Aussagen sind richtig, „15 km inklusive" ohne Schwelle ist falsch – kein Theme-Text sagt das (nur Kommentare) → PL-009 geschlossen |
| 2026-09-22 | Lieferzeit einheitlich 5–7 Werktage, auch Teppich nach Maß | 6 von 7 Templates und AGB nennen 5–7; die längere Zusage ist die sichere |
| 2026-09-22 | Muster-Altmodell `TP-MUSTER-000` bleibt nur als Code-Fallback, keine Bereinigung der Historie | `musterartikel.md`: Umstellung 2026-09-16 abgeschlossen; alle Erkennungen (Mail, Pixel, Flow) prüfen beide Muster → PL-006 geschlossen |
| 2026-09-22 | Feedtitel nicht über Produkttitel-Umbenennung, sondern über Merchant-Center-Feedregel (Titel = Linie + Produktart + Struktur + Farbe + Breite) | `docs/MARKENSTRATEGIE.md`: Hausmarken-Name noch offen; Titeländerung an 250 Produkten wäre SEO-relevant und käme vor der Markenentscheidung |
