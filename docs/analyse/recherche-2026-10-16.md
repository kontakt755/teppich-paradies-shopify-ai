# Recherche 16.10.2026: Was wir besser machen koennen

Auftrag des Inhabers (Chat 16.10.): „mach du selbst auch nochmal eine Recherche, was wir
vielleicht besser machen koennen“. Grundlage sind die Shopify-Daten der letzten 30 Tage
(16.09. bis 16.10.2026, ShopifyQL und Admin API, nur lesend). GA4, Search Console und
Merchant Center sind im Analyse-Plugin nicht verbunden; dazu Punkt 7.

Nicht wiederholt werden Befunde aus `docs/audits/` (Sept.) und dem Shopvergleich vom 15.10.;
Codex arbeitet parallel am technischen SEO/CRO-Audit (Branch `codex/shop-audit-20261016`).

## 1. Wo der Shop heute steht (30 Tage)

| Kennzahl | 16.09.–16.10. | Vorperiode | Lesart |
|---|---|---|---|
| Sitzungen | 3.536 | 2.977 | +19 % |
| Sitzungen mit Warenkorb | 92 (2,6 %) | 37 | mehr als verdoppelt |
| Checkout erreicht | 45 | 9 | |
| Checkout abgeschlossen | 17 (0,48 %) | 0 | darunter viele Musterbestellungen |
| Bestellungen gesamt | 36 | | 25 davon Musterservice (0 EUR) |
| Bezahlte Bestellungen | 7 | 1 (Sept.-Audit: 90 Tage, 0 EUR) | rund 1.620 EUR netto |

Umsatz nach Produktart: Unterlagen 340 EUR (3), Teppich nach Mass 336 EUR + Kettelservice
307 EUR (2 Bestellungen, 518 EUR und 273 EUR), Teppichboden 321 EUR (1), Vinyl von der Rolle
72 EUR (2), Bauchemie 45 EUR (1).

Der Shop verkauft also inzwischen, aber in kleinen Zahlen. Jede Massnahme unten ist deshalb
an einer Stelle angesetzt, an der heute schon messbar Nachfrage ankommt.

## 2. Handy: 70 % der Besucher, aber viermal seltener im Warenkorb

| Geraet | Sitzungen | mit Warenkorb | Quote | abgeschlossen |
|---|---|---|---|---|
| Handy | 2.475 | 35 | 1,4 % | 11 |
| Desktop | 1.019 | 55 | 5,4 % | 6 |

Am Handy kommt nur jede 70. Sitzung in den Warenkorb, am Desktop jede 19. Das ist der
groesste einzelne Hebel: wuerde das Handy nur die Haelfte der Desktop-Quote erreichen,
waeren das rund 30 zusaetzliche Warenkoerbe im Monat.

**Empfehlung (Aufwand M):** Die drei Kaufstrecken am Handy (Teppichboden-Rollenrechner,
Teppich-nach-Mass-Konfigurator, Paketware) einmal mit echten Nutzern oder per Screen-
Aufzeichnung beobachten, nicht nur per Screenshot pruefen. Verdaechtig sind Eingabefelder
mit Tastatur (Masse in cm), die Breitenwahl und der Weg vom Preis zum Kaufknopf. Erst dann
gezielt aendern. Messen: Warenkorbquote Handy je Woche (ShopifyQL, Abfrage in Abschnitt 8).

## 3. Service-Seiten: 23 % aller Besucher, fast keine Shop-Kaeufe, keine Erfassung

| Einstiegsseite | Sitzungen | davon ueber Suche | Warenkorb |
|---|---|---|---|
| /pages/teppichboden-verlegen-lassen | 356 | 325 | 1 |
| /pages/vinylboden-verlegen | 282 | 249 | 2 |
| /pages/treppenverlegung | 158 | 135 | 0 |
| /pages/liefer-verlegeservice | 37 | 31 | 0 |

833 Sitzungen (24 %) beginnen auf Service-Seiten; 57 % des gesamten Suchverkehrs landet
dort (11880-Kampagne und organisch). Diese Besucher wollen eine Verlegung, keinen Rollen-
rechner. Ob daraus Auftraege werden, ist heute nicht messbar (Werkbank w-030: Service-Anfragen
im Control Center, in Arbeit; Kampagnenfeld im Formular freigegeben 16.10.).

**Empfehlung (Aufwand S):** Auf den vier Seiten ist die eine Hauptaktion „Anfrage senden“
bzw. „Anrufen / WhatsApp“ oben und am Seitenende; die Anfrage bekommt das Kampagnenfeld
(w-030) und zaehlt als Ziel. Danach laesst sich erstmals sagen, was 11880 bringt (w-099, w-052).

## 4. Teppich nach Mass ist der Kaufmotor

| | Sitzungen | Warenkorb | Quote |
|---|---|---|---|
| /collections/teppich-nach-mass | 44 | 11 | 25 % |
| /collections/teppichboden | 233 | 4 | 1,7 % |
| /collections/teppiche | 31 | 4 | 13 % |
| Startseite | 933 | 26 | 2,8 % |

Zwei der sieben bezahlten Bestellungen sind Teppiche nach Mass, zugleich die groessten
Warenkoerbe. Die Musterbestellungen bestaetigen das: 19 der 25 Musterbestellungen betreffen
Teppiche nach Mass, und mindestens ein Weg Muster → Kauf ist belegt (Rivena-Muster 07.10.,
Kauf 13.10. ueber 518 EUR).

**Empfehlung (Aufwand S):** Teppich nach Mass auf der Startseite in den ersten Bildschirm
(heute: Kategorien gross, Teppich nach Mass weiter unten) und als eigene Anzeigengruppe
„Teppich nach Mass / Teppich auf Mass / Massteppich“ in der Suche mit der Kollektion als
Zielseite. Die Shopping-Kampagne Teppich nach Mass hatte 01.–15.10. nur 25 Klicks fuer 11 EUR
(docs/google/optimierung-2026-10-16.md), also kaum Reichweite. Budgetentscheidung bleibt beim
31.10. (w-052); dort ist das der Vorschlag mit dem besten Beleg. Vinyl bleibt draussen
(Inhaber 16.10.).

## 5. Muster: 70 % aller Bestellungen, kein Nachfassen

25 Musterbestellungen in 30 Tagen, im Schnitt drei Muster je Bestellung. Nach dem Versand
passiert nichts Systematisches: Shopify E-Mail ist nicht installiert (docs/shop-offene-
fragen.md Punkt 7, Inhaberentscheidung), eine Nachfass-Liste gibt es als geplante Aufgabe
`musterkunden-liste-montag`, aber ohne festen Ablauf im Laden.

**Empfehlung (Aufwand S, ohne neue App):**
1. Jedem Musterumschlag eine Karte beilegen: „So geht es weiter“ (Masse messen, Preis im
   Rechner, Rueckfrage per WhatsApp), Firmennummer, kein Rabattcode (Regel Marketingcodes).
2. Montagsliste im Control Center als Anruf-/WhatsApp-Liste nutzen: Musterkunden 7–10 Tage
   nach Versand einmal ansprechen, Ergebnis mit zwei Klicks eintragen (gekauft / offen / nein).
   Danach ist die Muster-Kaufquote zum ersten Mal eine Zahl.

## 6. Checkout: 28 von 45 brechen ab

45 Sitzungen erreichen den Checkout, 17 schliessen ab. Ein grosser Teil der Abbrecher sind
Musterbestellungen zu 0 EUR, die trotzdem Adresse und Versandart durchlaufen muessen.

**Idee (Aufwand M, spaeter):** Muster ueber ein kurzes eigenes Formular (Name, Adresse,
Farben) statt ueber den vollen Checkout. Vorher die 28 Abbrueche nach Warenkorbinhalt
aufschluesseln (Shopify Admin → abgebrochene Checkouts, 6 davon mit E-Mail), damit klar ist,
ob es Muster- oder Warenkaeufer sind.

## 7. Messen: GA4 und Search Console an die Analyse anschliessen

Das HYPD-Plugin sieht nur Google Ads. Ohne GA4 (Landingpage-Qualitaet, Absprung je Geraet)
und Search Console (welche Suchanfragen die Service- und Kategorieseiten bringen) bleibt
jede Analyse auf Shopify-Zaehler beschraenkt. **Inhaber:** im HYPD-Konto unter Connect →
Ad Platforms GA4-Property und Search-Console-Property verbinden (zwei Klicks, kostenlos).

## 8. Abfragen zum Nachmessen (ShopifyQL, Shopify-MCP `run-analytics-query`)

```
FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_completed_checkout
  GROUP BY session_device_type SINCE -30d UNTIL today
FROM sessions SHOW sessions, sessions_with_cart_additions
  GROUP BY landing_page_path ORDER BY sessions DESC LIMIT 25 SINCE -30d UNTIL today
FROM sales SHOW orders, net_sales GROUP BY product_type ORDER BY net_sales DESC SINCE -30d UNTIL today
```

## 9. Reihenfolge

1. Service-Seiten: Hauptaktion und Anfrage-Ziel (S, mit w-030)
2. Teppich nach Mass nach vorn + Anzeigengruppe vorbereiten (S, Budget am 31.10.)
3. Muster-Nachfass per Karte und Montagsliste (S, Ablauf im Laden)
4. Handy-Kaufstrecke beobachten, dann aendern (M)
5. GA4/Search Console verbinden (Inhaber, 2 Klicks)
6. Muster-Formular statt Checkout (M, spaeter)

Die drei S-Punkte stehen als Ideen in der Werkbank (w-111 bis w-113).
