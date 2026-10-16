# Offene Punkte fuer Ahmet

Gesammelt waehrend der Orchestrator-Session, damit nichts im Chat verloren geht. Nichts davon
blockiert den Shop. Erledigtes hier streichen, nicht loeschen. Stand 2026-10-16: offene Inhaberpunkte
werden in der Werkbank „Shop & Technik“ (privates Board, Eintraege mit verantwortlich = Inhaber) gefuehrt;
diese Liste ist die Historie.

## Wartet auf dich
| # | Was | Warum ich es nicht selbst kann | Wo es weitergeht |
|---|---|---|---|
| 1 | ~~10 echte Kantenfotos der Kettelung~~ **Ueberholt 2026-10-11:** KI-Kettelbilder (gekettelte Kante + Kettelecke) fuer 880 Farben in 93 Linien nach Sichtfreigabe live; Kantenfotos auf Karten seit 11e0e3ec. Rest (19 Farben, Musterlinien, Wohnteppich nach Mass) steht in der Werkbank | - | S-14 |
| 2 | EK-Liste (Issue #397) - **teilweise belegt 15.10.:** Vorwerk, JAB und Lieferant B aus Preislisten/unitCost, Lieferant A abgeleitet; Rest A und Lieferant C offen (Werkbank w-100) | Keine Einkaufspreise in Shopify, ich rate keine | S-10, Werkbank |
| 3 | ~~Fasermaterial fuer wovena, callista, rubira~~ **Erledigt:** `custom.fasermaterial` traegt bei allen drei den Metaobjekt-Wert „Schurwolle“ (geprueft per Admin API 2026-10-16) | - | S-25 |
| 4 | ~~Merchant Center: Aktionspreise als Sale-Preis? (Issue #415)~~ **Erledigt:** Issue #415 geschlossen; Merchant Center seit 13.10. nur mit Shopify-Quelle, Zusatzquelle fuer Teppich nach Mass (#1283) | - | S-31 |
| 5 | Optik am Handy ansehen: Teppich-Karte, grosses Farbbild mit Lupe unter der Farbwahl, Aktionskarten im Teppichboden | Sichtpruefung ist Inhabersache; offene Sichtfreigaben stehen in der Werkbank | Werkbank |
| 6 | Datenschutzerklaerung um Newsletter (Double-Opt-in, Versanddienst, Abmeldung), Tag Manager/Google-Tag und das Bewertungs-Widget ergaenzen | Rechtstexte macht der Inhaber (Regel 14.10.); Faktenliste fuer den Rechtstext-Anbieter: `docs/kundenbindung/datenschutz-faktenliste.md`. Newsletter/Willkommensmail laufen seit 24./28.09. ueber Shopify Messaging | Werkbank (Inhaber), `docs/kundenbindung/README.md` Abschnitt 4 |
| 7 | ~~Shopify Messaging installieren~~ **Erledigt 2026-09-24:** installiert, Willkommensmail aktiv seit 28.09. (PRs #551/#552, #1012/#1013) | - | `docs/kundenbindung/automationen.md` |
| 8 | Rabatthoehe je Marketingkanal, ~~Willkommensvorteil ja/nein~~ (**entschieden:** Willkommensmail mit Vorteil aktiv seit 28.09., Newsletter-Gutschein einmal pro Kunde seit #1307; Codes nie im Repo), Anreiz in Stufe 2 (Warenkorb, Muster), Newsletter-Rhythmus | Geschaeftsentscheidungen des Inhabers | Werkbank, `docs/kundenbindung/marketingcodes-und-aktionen.md` |
| 9 | ~~Alter Gratisversand-Code ohne Ablauf und ohne Nutzungsgrenze, leicht zu erraten, mit allem kombinierbar: abschalten?~~ **Erledigt 2026-09-21** auf Wort des Inhabers: per `discountCodeDeactivate` abgeschaltet (Status EXPIRED, umkehrbar, nicht geloescht). Gegenprobe im echten Warenkorb: Code wird abgelehnt (`applicable: false`, Rabatt 0). | - | #422 |
| 10 | ~~GA4-Property anlegen und Mess-ID nennen~~ **Erledigt:** GA4 aktiv, `purchase` fuer Warenkaeufe im Funnel-Pixel (#1135, 12.10.), Musterbestellungen als eigenes Ereignis seit 07.10.; Issue #52 geschlossen | - | `docs/kundenbindung/funnel-events.md` |
| 11 | ~~Pilotartikel des Ratgebers fachlich pruefen~~ **Entschieden 2026-09-21:** Ungeprueftes gestrichen, Ratgeber veroeffentlicht. Weiter offen beim Inhaber: die 71 Fachfragen fuer den spaeteren Ausbau (Fragebogen-PDF liegt vor), Kartenbild und Firmenbox-Text im Theme-Editor; seit 02.10. duerfen Fachfragen per belegter Recherche beantwortet werden, nur Shop-eigene Zusagen bleiben offen | Fachaussagen und sichtbare Versprechen erfinde ich nicht | Werkbank, `content/ratgeber/teppichboden/README.md` |

## Termine
- **2026-10-18** endet Rabattaktion Welle 1. Anzeige und Hinweis stellen sich selbst zurueck, die PREISE nicht. Rueckstellung (Issue #413) am **13.10. freigegeben**, laeuft am 19.10. ueber zwei geplante Aufgaben (00:30 und 08:00); sie schreibt nur bei exakter Uebereinstimmung mit der freigegebenen Tabelle.

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
