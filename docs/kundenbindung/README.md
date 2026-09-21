# Kundenbindung, Marketing und Ratgeber – Bestand und Architektur

Stand 2026-09-21 · Aufgabe #422 · Grundregel: **Die Produktseite ist zum Kaufen da.**
Nichts aus diesem Paket steht zwischen Konfiguration und Warenkorb.

Verwandte Dokumente: `marketingcodes-und-aktionen.md`, `automationen.md`,
`funnel-events.md`, `pruefungen.md`, `../ratgeber/README.md`.

## 1. Bestand (gemessen, nicht geschätzt)

| Bereich | Befund | Quelle |
|---|---|---|
| Plan | Shopify Basic, eine Sprache (de), neue Kundenkonten | Admin API |
| Kunden | 12 Kunden, **0 E-Mail-Abonnenten**, 1 Anmeldung wartet auf Bestätigung | Admin API |
| Double-Opt-in | In Shopify **aktiv** (Opt-in-Level `CONFIRMED_OPT_IN`, Status `PENDING` vorhanden) | Admin API |
| Marketing-Häkchen im Checkout | vorhanden, **nicht vorausgewählt** (richtig so) | Admin, Checkout-Einstellungen |
| E-Mail-Werkzeug | **keines installiert.** „Shopify Messaging" (früher Shopify Email) fehlt, damit gibt es auch keine Automationen | Admin, Marketing → Automatisierungen |
| Warenkorbabbrecher | Eingebaute Mail ist **an** (nach 10 Std.), geht aber nur an E-Mail-Abonnenten – also an niemanden | Admin, Checkout-Einstellungen |
| Segmente | 7 Standardsegmente (Abonnenten, abgebrochene Checkouts 30 T., Käufer/Nichtkäufer, Firmen) | Admin API |
| Rabattcodes | 3 Altcodes aus Tests, kein Marketingcode, keine automatischen Rabatte | Admin API |
| Aktionspreise | Eigenes System: Streichpreis (`compare_at_price`) + Produkt-Metafelder `aktion.start/ende/klasse`, einzige Quelle im Theme `snippets/tp-aktion-aktiv.liquid`. Welle 1: 20 Teppichböden bis 2026-10-18 (#413) | Repo, `docs/shop-decisions.md` |
| Newsletter im Theme | Horizon-Block `email-signup` existiert, ist **nirgends eingebunden**; kein Einwilligungstext | Repo |
| Musterbestellung | fertig; jede Musterzeile trägt `_Quellprodukt`, `_Quellprodukt_ID`, `_Quellvariante_ID`, `_Produktlink`, `_Bild`, `Farbe` | Repo + echte Bestellungen |
| Tracking | Google-&-YouTube-App sendet nur Merchant-Center-Ereignisse; ein Custom Pixel mit Tag-Manager-Container; **kein GA4, kein Ads-Conversion-Label, kein Meta-Pixel**. Theme sendet Lead-Ereignisse (`tp_lead_*`) | Live-HTML, Repo |
| Funnel 30 Tage | 2.855 Sitzungen → 43 Warenkorb → 10 Checkout → **0 Käufe** | ShopifyQL |
| Ratgeber | Blog „News" leer, keine Ratgeber-Templates; „Service & Verlegung" enthält nur Dienstleistungsseiten | Admin API, Repo |
| Strukturierte Daten | Organization/Store, Service, ProductGroup mit €/m², BreadcrumbList (nur Produktseite) – fehlerfrei | Live-Crawl |
| Datenschutzerklärung | erwähnt **weder Newsletter noch Tag Manager/Google-Tag noch das Bewertungs-Widget** | Live-Text |

Apps mit Bezug: Such-/Filter-Apps, zwei Options-/Preisrechner-Apps (Checkout-Regeln
aktiv), eine Automations-Plattform (Make), eine Lieferanten-Sync-App (Lieferant A),
Übersetzungs-App. Keine Bewertungs-, Newsletter- oder Loyalty-App.

## 2. Architektur-Entscheidungen

1. **Kein zusätzliches kostenpflichtiges Werkzeug.** Newsletter, Willkommensserie,
   Muster-Nachfassmail und Warenkorbabbrecher laufen über Shopify Messaging
   (Shopify-eigen, Versand bis 10.000 Mails/Monat kostenlos, danach nutzungsabhängig).
   Die Installation ist eine Inhaberentscheidung (Kontoänderung, mögliche
   Folgekosten) – siehe Abschnitt 4.
2. **Eine Preiswahrheit.** Aktionen bleiben beim bestehenden Modell (Streichpreis +
   `aktion.*`). Automatische Shopify-Rabatte wurden geprüft und verworfen, weil sie
   Produktseite, Feed (Merchant Center) und strukturierte Daten auseinanderlaufen
   lassen. Details in `marketingcodes-und-aktionen.md`.
3. **Marketingcodes wirken nie auf Aktionsware.** Gelöst ohne App über die interne,
   unveröffentlichte Kollektion `intern-regulaerer-preis` (Regel: kein Streichpreis).
   Jeder Code gilt nur für diese Kollektion und kombiniert mit nichts. Im echten
   Warenkorb belegt (Abschnitt 5).
4. **Keine eigene Analytics-Plattform.** Ereignisse gehen über
   `Shopify.analytics.publish` an die Shopify-Kundenereignisse; von dort leitet ein
   Custom Pixel sie an GA4 weiter. Kampagnenquelle kommt aus UTM-Parametern und dem
   Rabattcode je Kanal.
5. **Ratgeber = Shopify-Blog**, ein Blog je Bodenbereich, eigene Templates,
   Artikel-Metafelder für Kurzantwort, Video, Verkaufsverknüpfung. Siehe
   `../ratgeber/README.md`.
6. **Newsletter-Anmeldung dezent:** ein Baustein (`snippets/tp-newsletter.liquid`),
   vorgesehen für Fußzeile und Artikelende im Ratgeber. Kein Popup. Nicht auf der
   Produktseite. Standardmäßig **aus**, bis die Datenschutzerklärung ergänzt ist.

## 3. Reihenfolge und Abhängigkeiten

```
Datenschutzerklärung ergänzen ─┐
Shopify Messaging installieren ─┼─> Newsletter aktivieren ─> Willkommensserie
                                │                         └> Warenkorbabbrecher wirkt
                                └─> Muster-Nachfassmail
GA4-Property + Mess-ID ─────────> Custom Pixel ─> Funnel-Auswertung
Rabatthöhen je Kanal ───────────> Marketingcodes anlegen (Vorlage fertig)
Ratgeber-Templates live ────────> Blog + Pilotartikel veröffentlichen ─> Menüpunkt
```

Theme-Teile (Ratgeber, Newsletter-Baustein, Funnel-Ereignisse) hängen von keiner
Geschäftsentscheidung ab und sind gebaut. Alles, was Kundenkontakt auslöst, wartet.

## 4. Offene Entscheidungen (Inhaber)

1. **Shopify Messaging installieren?** Voraussetzung für Newsletter, Serie,
   Nachfassmails. Kostenlos bis 10.000 Mails/Monat.
2. **Datenschutzerklärung:** Abschnitte zu Newsletter (Double-Opt-in, Versanddienst,
   Abmeldung), Tag Manager/Google-Tag und Bewertungs-Widget fehlen. Rechtstext ist
   Inhabersache. Vorher wird keine Anmeldung sichtbar geschaltet.
3. **Willkommensvorteil ja/nein und Höhe**, Rabatthöhe je Kanal, Laufzeiten.
4. **Newsletter-Rhythmus** (nirgends fest verdrahtet).
5. **GA4-Property anlegen** und Mess-ID nennen (#52). Ohne Ziel landen die
   Funnel-Ereignisse nur in den Shopify-Kundenereignissen.
6. **Alter Gratisversand-Code** ohne Ablauf, ohne Nutzungsgrenze, leicht zu erraten,
   kombinierbar mit allem: abschalten? (Name bewusst nicht im Repo.)
7. **Anreiz in Stufe 2** bei Warenkorbabbrechern und Musterkunden: ja/nein, Höhe.
8. **Texte:** Nutzenversprechen im Newsletter-Baustein, Firmen-/Autorenbox im
   Ratgeber, fachliche Freigabe der Pilotartikel.

## 5. Belege der Tests vom 2026-09-21

Rabattlogik im echten Storefront-Warenkorb (zwei Wegwerf-Codes, 5 %, 1 Nutzung,
danach deaktiviert, 0 Einlösungen):

| Fall | Ergebnis |
|---|---|
| Aktionsartikel + regulärer Artikel, ein Code | Rabatt nur auf den regulären Artikel (1,94 € von 38,90 €), Aktionsartikel unverändert |
| wie oben, zwei Codes gleichzeitig | nur ein Code `applicable`, Gesamtrabatt unverändert |
| nur Aktionsartikel, ein Code | Code `applicable: false`, Rabatt 0 |
| Kollektion gegen Aktionsliste | genau die 20 Produkte mit `aktion.ende` fehlen in der Kollektion, alle anderen sind drin |
