# Google Ads – Startvorbereitung

Stand 2026-09-16. Alle Zahlen in diesem Dokument sind gemessen, nicht
geschätzt; die Messung steht jeweils dabei.

---

## 1. Technischer Stand

### Steht bereits

| Punkt | Befund |
|---|---|
| Google-Tag | `GT-NBPR47T2`, lädt über den Google-&-YouTube-Kanal |
| Consent Mode v2 | **aktiv** – `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` werden als `default` und als `update` gesetzt |
| Einwilligung | Vor dem Klick auf „Akzeptieren" geht **kein einziger** Google-Aufruf raus (im Browser gemessen) |
| Produktfeed | 225 Produkte im Kanal „Google & YouTube": 84 Klickvinyl + 141 Klebevinyl |
| Feed-Abgrenzung | **keine** Rollenware, **kein** Wunschmaß im Feed – deren Variantenpreise sind technische m²-Preise und wären als Angebot irreführend |
| Marken im Feed | alle 225 tragen ihre Produktlinie als `vendor` (Bergen, Porto, Odense, Solenta, Dornova …) |
| Versandkosten | Angaben auf `/pages/versand-lieferung` stimmen exakt mit den Versandprofilen: DE 4,99 € / ab 50 € frei, EU 13,99 €, international 19,99 €, Muster kostenlos |
| Rückgaberichtlinie | vorhanden (`/policies/refund-policy`), 14 Tage, mit korrektem Ausschluss für Zuschnittware |
| Landingpage-Qualität | Barrierefreiheit 100, SEO 100 auf Kategorie- und Produktseiten |
| Preisangabe | „Alle Preise inkl. MwSt., zzgl. Versandkosten" seit PR #359 auf jeder Produktseite |

### Muss vor dem ersten Klick erledigt sein

**1. Versandrichtlinie hinterlegen.** `/policies/shipping-policy` antwortet
mit 404. Das Merchant Center verlangt eine erreichbare Versandrichtlinie;
ohne sie werden Shopping-Anzeigen eingeschränkt oder abgelehnt. Fertiger
Text: `domains/shopify/versandrichtlinie-vorlage.md`. Einzufügen unter
Einstellungen → Richtlinien.

**2. Merchant-Center-Diagnose öffnen.** Die Feed-Produkte haben **keine
Barcodes (GTIN)** – bei Hausmarken normal, aber Google muss dann wissen,
dass keine Kennung existiert. Shopify setzt das in der Regel selbst; ob
es greift, steht schwarz auf weiß in der Diagnose. Dort auch prüfen, ob
Produkte wegen fehlender Attribute abgelehnt sind.

**3. Conversion-Aktionen anlegen und prüfen.** Ob im Konto schon welche
existieren, ist von außen nicht sichtbar. Vorschlag in Abschnitt 3.

**4. Zwei Kleinigkeiten in den Rechtstexten** (siehe
`domains/shopify/versandrichtlinie-vorlage.md`): stehengebliebene
Markdown-Sternchen in der Widerrufsbelehrung und zwei verschiedene
Telefonnummern zwischen Kontakt-Richtlinie und Impressum.

### Bekannte Grenze: Tempo

Lighthouse Mobil liegt bei 65–71. Das ist **nicht** das Theme: Eine fast
leere Rechtsseite ohne Produkt und Bild kostet bereits 199 Anfragen und
1,3 MB, davon 123 Anfragen und 948 KB Shopify selbst. Der Theme-Anteil
sind 59 Anfragen und 107 KB. Zwei Eingriffe wurden gemessen und
verworfen (Shop-Pay-Knopf entfernen: +1 Punkt; 18 ungenutzte Bausteine
löschen: −2 Punkte).

Für Ads heißt das: Der Qualitätsfaktor wird über Anzeigenrelevanz und
Zielseitenerfahrung gewonnen, nicht über Ladezeit. Desktop liegt bei 93.

---

## 2. Was beworben werden kann – und was nicht

| Kategorie | Produkte | Im Feed? | Warum |
|---|---|---|---|
| Klickvinyl | 85 | **ja** (84) | Paketpreise sind echte Kaufpreise |
| Klebevinyl | 141 | **ja** (141) | dito |
| Teppichboden | 113 | nein | m²-Preis ist kein kaufbarer Gesamtpreis |
| Vinyl von der Rolle | 63 | nein | dito |
| Teppichfliesen | 63 | nein | Bestand wächst gerade, prüfen |
| Teppiche nach Maß | 50 | nein | Preis entsteht erst aus Maß |
| Linoleum | 9 | nein | Rollenware |
| Bodenleisten | 9 | nein | prüfen – wären Fixpreisartikel und feedfähig |
| Zubehör | 46 | nein | prüfen – Fixpreisartikel, feedfähig |

**Empfehlung:** Shopping nur für Paketware (das läuft schon richtig).
Bodenleisten und Zubehör sind Fixpreisartikel und könnten den Feed um
rund 55 Produkte erweitern – vorher prüfen, ob die Deckungsbeiträge
Klicks rechtfertigen.

Für Rollenware, Teppichboden und Teppiche nach Maß: **Suchkampagnen statt
Shopping.** Dort ist der Musterversand der natürliche erste Abschluss,
nicht der Kauf.

---

## 3. Conversion-Aktionen

Ein Bodenbelag wird selten beim ersten Besuch gekauft. Wer nur den Kauf
misst, optimiert auf ein Ereignis, das bei 6 Bestellungen im Monat zu
selten eintritt, als dass Googles Gebotsautomatik lernen könnte.
Deshalb mehrere Stufen:

| Aktion | Typ | Wert | Begründung |
|---|---|---|---|
| Kauf | primär | tatsächlicher Umsatz | Shopify liefert den Wert |
| Musterbestellung | **primär** | 15 € | Der eigentliche Einstieg. „Bis zu 3 Muster kostenlos" ist die kleinste Hürde im Shop |
| Anruf von der Website | sekundär | 25 € | Telefon steht auf jeder Produktseite und im Kaufbereich |
| WhatsApp-Klick | sekundär | 10 € | seit PR #359 auch im Kaufbereich |
| Warenkorb | sekundär | – | nur zur Beobachtung, nicht zur Optimierung |

Die Werte sind **Platzhalter**, die der Inhaber ersetzen muss: Sie sollten
dem tatsächlichen Deckungsbeitrag mal der Abschlusswahrscheinlichkeit
entsprechen. Ohne echte Zahlen optimiert die Automatik auf eine Fiktion.

**Enhanced Conversions** über den Google-&-YouTube-Kanal aktivieren –
das schließt die Lücke, die iOS und Cookie-Ablehnungen reißen.

---

## 4. Kampagnenstruktur

### A. Shopping (Performance Max oder Standard-Shopping)

Nur die 225 Feed-Produkte. Bei so wenig Conversion-Historie ist
**Standard-Shopping mit manuellem CPC** ehrlicher als Performance Max –
PMax braucht Signale, die der Shop noch nicht liefert. Umstieg auf PMax,
sobald 30 Conversions im Monat zusammenkommen.

Produktgruppen nach `vendor` (Bergen, Porto, Odense …), weil die Linien
sich in Aufbau und Preis unterscheiden.

### B. Suche – Marke

Eigener Name. Billig, schützt vor Wettbewerbern auf dem eigenen Namen.
Wenige Euro am Tag.

### C. Suche – Kategorie, bundesweit

Je eine Anzeigengruppe: Klickvinyl, Klebevinyl, Teppichboden Meterware,
Teppichfliesen, Linoleum. Zielseite ist immer die passende
Kategorieseite, nie die Startseite.

### D. Suche – Region, Oranienburg + Berlin

Der stärkste Hebel, weil hier der Verlegeservice dazukommt – etwas, das
reine Onlinehändler nicht bieten. Umkreis rund 50 km um Oranienburg.
Begriffe wie „Teppichboden verlegen lassen Berlin", „Bodenleger
Oranienburg", „Vinylboden verlegen Preise". Zielseite
`/pages/liefer-verlegeservice` oder `/pages/teppichboden-verlegen-lassen`.

Hier zählt der **Anruf** als Conversion mehr als der Warenkorb.

---

## 5. Auszuschließende Suchbegriffe

Bodenbeläge ziehen viele Suchen an, die nie zu einem Kauf führen. Diese
Liste gehört auf Kontoebene, **bevor** die erste Kampagne startet:

```
kostenlos, gratis, gebraucht, second hand, ebay, kleinanzeigen,
reinigen, reinigung, entfernen, entsorgen, ausbau, ausbauen,
reparieren, kleber lösen, geruch, schimmel, milben, allergie
selbst verlegen anleitung, youtube, video, tutorial, wie verlegt man
jobs, ausbildung, stellenangebot, gehalt, bodenleger werden
hersteller, großhandel, b2b einkauf, palette, restposten, muster gratis
test, testsieger, stiftung warentest, vergleich, erfahrungen forum
laminat, parkett, fliesen, kork, teppich waschen
```

Zu „laminat", „parkett", „fliesen": Der Shop führt sie nicht. Klicks
darauf sind verloren.

„muster gratis" ist bewusst ausgeschlossen, obwohl der Shop Muster
kostenlos versendet – wer danach sucht, will nur das Muster und kauft
nicht. Die Musterbestellung soll aus Kategoriesuchen entstehen.

---

## 6. Anzeigentexte

Alle Aussagen unten sind auf der jeweiligen Zielseite belegt – das
verlangt Google, und es wurde für jeden Punkt geprüft.

### Klickvinyl / Klebevinyl

**Titel:** Klickvinyl online kaufen · Vinylboden ab Lager · Bis zu 3
Muster kostenlos · Versandfrei ab 50 € · Fachhandel seit Jahren ·
Preis pro m² transparent

**Beschreibungen:**
- Klickvinyl in Holz- und Steindekoren. Muster vorab kostenlos bestellen und in Ruhe zu Hause vergleichen.
- Versandkostenfrei in Deutschland ab 50 €. Lieferung per Paket oder Spedition, je nach Menge.
- Persönliche Fachberatung am Telefon. Wir sagen Ihnen, wie viel Sie brauchen – auch ohne Bestellung.

### Teppichboden Meterware

**Titel:** Teppichboden nach Maß · Zuschnitt auf Ihr Maß · Preis pro m² ·
Muster kostenlos · Velours, Schlinge, Hochflor

**Beschreibungen:**
- Teppichboden als Meterware, zugeschnitten auf Ihr Maß. Alle Preise pro Quadratmeter.
- Bis zu drei Muster kostenlos nach Hause – Farbe und Flor in Ruhe im eigenen Licht prüfen.

### Region Oranienburg / Berlin

**Titel:** Teppichboden verlegen lassen · Bodenleger Oranienburg ·
Aufmaß und Verlegung · Berlin und Umland

**Beschreibungen:**
- Liefern, alten Belag entfernen, neu verlegen – aus einer Hand in Oranienburg, Berlin und Umgebung.
- Ab 649 € Warenwert liefern wir bis 15 km kostenlos. Termin telefonisch abstimmen.

**Anruferweiterung:** 03301 573 37 20 (Mo–Fr 8:30–18:00, Sa 8:30–14:30 –
diese Zeiten stehen so im Shop und müssen im Konto hinterlegt werden,
sonst laufen Anzeigen mit Anrufoption außerhalb der Öffnungszeiten).

### Erweiterungen für alle Kampagnen

- **Sitelinks:** Musterservice, Verlegeservice, Unsere Arbeit, Kontakt
- **Snippets „Marken":** Bergen, Porto, Odense, Solenta, Dornova
- **Zusatzinformationen:** Versandfrei ab 50 €, Bis zu 3 Muster kostenlos, Fachberatung am Telefon, Eigene Verlegung in der Region
- **Bewertungen:** 4,9 aus über 240 Google-Bewertungen. **Hinweis:** Verkäuferbewertungen in Anzeigen zieht Google aus eigenen Quellen; die Zahl im Shop erscheint dort nicht automatisch.

---

## 7. Was hier nicht entschieden wird

Budget, Gebotsstrategie und Zielregion sind Unternehmerentscheidungen.
Was sich sagen lässt: Bei 6 Bestellungen im Monat ist die
Datengrundlage für automatische Gebote dünn. Ein Start mit manuellem CPC
und kleinem Budget auf der Regionalkampagne liefert schneller
verwertbare Erkenntnisse als ein breiter Bundesstart.

---

## 8. Belege

Alles oben wurde am 2026-09-16 gegen den Live-Shop und die Admin API
geprüft:

- Consent Mode und Tag-ID: Browser, Netzwerkmitschnitt vor und nach der Einwilligung
- Feed-Umfang und Marken: `products(query: "publication_ids:367654764878")`
- Versandprofile: `deliveryProfiles`
- Richtlinien: `shop.shopPolicies` plus HTTP-Status je `/policies/*`
- Lighthouse: Kategorie- und Produktseite, mobil und Desktop
- Landingpages: Regressionslauf über 11 Seiten × 2 Geräte, kein Befund
