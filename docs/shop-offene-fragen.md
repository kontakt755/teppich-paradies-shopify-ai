# Offene Punkte fuer Ahmet

Gesammelt waehrend der Orchestrator-Session, damit nichts im Chat verloren geht. Nichts davon
blockiert den Shop. Erledigtes hier streichen, nicht loeschen.

## Wartet auf dich
| # | Was | Warum ich es nicht selbst kann | Wo es weitergeht |
|---|---|---|---|
| 1 | 10 echte Kantenfotos der Kettelung (Anleitung: `docs/shop-bildworkflow.md`, Abschnitt 4) - oder Bescheid, dass keine Stuecke vorliegen | Das Original liegt in deiner Werkstatt; ein echtes Foto ist materialtreuer als jedes Bildmodell | S-14 |
| 2 | EK-Liste (Issue #397) | Keine Einkaufspreise in Shopify, ich rate keine | S-10; danach Nachrechnung der Welle-1-Rabatte |
| 3 | Fasermaterial fuer wovena, callista, rubira (Teppichboden, Metafeld `custom.fasermaterial`) | Gepflegt ist nur die Art "Wolle", die genaue Faser ist nicht belegt | S-25 |
| 4 | Merchant Center: uebernimmt der Feed die Aktionspreise als Sale-Preis? (Issue #415) | Kein Zugriff auf das Merchant Center | S-31 |
| 5 | Optik am Handy ansehen: Teppich-Karte, grosses Farbbild mit Lupe unter der Farbwahl, Aktionskarten im Teppichboden | Das Browserfenster der Sitzung lieferte durchgehend leere Screenshots - ich habe vermessen, nicht gesehen | - |
| 6 | Datenschutzerklaerung um Newsletter (Double-Opt-in, Versanddienst, Abmeldung), Tag Manager/Google-Tag und das Bewertungs-Widget ergaenzen | Rechtstext ist Inhabersache; vorher schalte ich keine Newsletter-Anmeldung sichtbar | #422, `docs/kundenbindung/README.md` Abschnitt 4 |
| 7 | Shopify Messaging (E-Mail) installieren: ja/nein. Ohne das gibt es weder Newsletter noch Willkommensserie noch Muster-Nachfassmail; kostenlos bis 10.000 Mails/Monat | App-Installation = Kontoaenderung mit moeglichen Folgekosten | #422, `docs/kundenbindung/automationen.md` |
| 8 | Rabatthoehe je Marketingkanal, Willkommensvorteil ja/nein, Anreiz in Stufe 2 (Warenkorb, Muster) ja/nein, Newsletter-Rhythmus | Geschaeftsentscheidungen; Technik und Vorlage sind fertig | #422, `docs/kundenbindung/marketingcodes-und-aktionen.md` |
| 9 | ~~Alter Gratisversand-Code ohne Ablauf und ohne Nutzungsgrenze, leicht zu erraten, mit allem kombinierbar: abschalten?~~ **Erledigt 2026-09-21** auf Wort des Inhabers: per `discountCodeDeactivate` abgeschaltet (Status EXPIRED, umkehrbar, nicht geloescht). Gegenprobe im echten Warenkorb: Code wird abgelehnt (`applicable: false`, Rabatt 0). | - | #422 |
| 10 | GA4-Property anlegen und Mess-ID nennen | Ohne Ziel landen die neuen Funnel-Ereignisse nur in den Shopify-Kundenereignissen | #52, `docs/kundenbindung/funnel-events.md` |
| 11 | Pilotartikel des Ratgebers fachlich pruefen (alle PRUEFEN-Marken beantworten), Texte fuer Firmenbox und Newsletter-Nutzen freigeben | Fachaussagen und sichtbare Versprechen erfinde ich nicht | #422, `content/ratgeber/teppichboden/README.md` |

## Termine
- **2026-10-18** endet Rabattaktion Welle 1. Anzeige und Hinweis stellen sich selbst zurueck, die PREISE nicht. Geplante Aufgabe `rabattaktion-welle1-beenden` (19.10., 8:00, nur bei geoeffneter App) und Issue #413.

## Entscheidungen, die ich fuer dich getroffen habe (bei Einwand: sagen, ich aendere es)
- Hinweise "Rund/Oval = umschliessendes Rechteck" und "Mindestpreis" bleiben unter dem Konfigurator-Preis.
- Teppich-Karte: Muster und Vergleichen als Textlinks unter "Jetzt konfigurieren".
- Farbwahl/Galerie: grosses Farbbild unter der Farbwahl (nur Handy) statt Umbau der Seitenreihenfolge.
- Google-Texte der Teppiche ohne Preiszahl ("Endpreis sofort im Rechner"), damit dort kein veralteter Preis stehen bleibt.
- Farbe ohne verfuegbare Rolle wird NICHT hart gesperrt, die Breite kommt dann aus den Rollen dieser Farbe.
- Kollektionen nach fester Regel sortiert (Mitte, Einstiegsanker, Mitte, gehoben; Premium ab Platz 9-12), nicht nach Bauchgefuehl.
- Rabatt-Auswahl Welle 1: mittlere Preisklasse mit den meisten Farben zuerst, Premium ohne Rabatt.

## Bekannte Luecken in den Tests
- Kein Checkout-Test mit Aktionspreis (ich loese keine Bestellungen aus).
- Streichpreis auf einer Teppich-KARTE nur per Unit-Test (das Testprodukt liegt in keiner Kollektion).
- Desktop durchgehend nur vermessen.
