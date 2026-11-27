# Malerarbeiten + Boden aus einer Hand: Kampagne und SEO

Datum: 2026-11-27. Status: **Entwurf; Umsetzung im Repository fertig, nicht live. Inhaber hat die offenen Punkte an Claude übergeben (27.11.2026).** Vorläufige Wahl nach `AGENTS.md` (Abschnitt godmode): Option B aus der Rationale, "kleine Version mit sauberer Messung".

## Intent

Teppich Paradies übernimmt Malerarbeiten (Wände und Decken innen) selbst und bewirbt sie zusammen mit der Bodenverlegung als "Boden und Wand aus einer Hand". Ziel: qualifizierte Anfragen aus Google (Suche und lokale Sichtbarkeit) im Einsatzgebiet Oranienburg + 30 bis 50 km und Berlin. Bisher kommen Bodenverlegungs-Anfragen auch über ein Handwerksportal; für Malerarbeiten gibt es weder Kampagne noch eigene Suchseite.

Erfolg (Testfenster 6 Wochen ab Start): messbare Anfragen über das Kontaktformular und Anrufe, Kosten je Anfrage im Rahmen, den der Inhaber vorab festlegt (Vorschlag, eigene Annahme: bis 50 Euro je Anfrage, weil ein Malerauftrag deutlich mehr einbringt).

## Ausgangslage (belegt)

- **Suchvolumen** (Keyword Planner, Deutschland, 12 Monate, abgerufen 27.11.2026): `maler oranienburg` 70/Monat (CPC ca. 1,20 €), `wohnung streichen lassen` 110 (2,75 €), `wand streichen lassen` 50, zuletzt 170 (2,77 €), `maler und bodenleger` 110 (4,69 €), `boden verlegen lassen` 210 (2,62 €), `renovierung wohnung` 1.000 (5,88 €), `maler berlin` 1.900 (5,33 €), `malerarbeiten` 2.900 (3,68 €, bundesweit). Das lokale Volumen ist klein; Berlin ist groß, aber teuer und umkämpft.
- **Search Console** (27.08. bis 24.11.): keine Sichtbarkeit für Malerthemen. "Verlegen lassen"-Suchen haben Impressionen, aber kaum Klicks (`boden verlegeservice` Position 31, `auslegware verlegen lassen kosten` Position 6,5).
- **Google Ads** (Konto 334-557-2870, 90 Tage): nur Shopping- und Produkt-Search-Kampagnen, keine Lead-Kampagne. Die Kampagne `TP | Search | Marke Teppich Paradies` hat 0 Impressionen.
- **Vorhanden im Repository:**
  - Seite `templates/page.boden-malerarbeiten.json` mit der Section `tp-service-einstieg` (Boden aussuchen, wir verlegen ihn, 50 km Umkreis).
  - `sections/tp-verlege-ablauf.liquid` hat einen Schalter "Malerarbeiten". Der Text sagt dort, Maler- und Tapezierarbeiten würden "teils zusammen mit einem Partnerbetrieb" ausgeführt. Das widerspricht der Aussage des Inhabers (selbst) und muss nach Bestätigung angepasst werden.
  - Ads-Vorarbeit: `docs/google/search-ads-entwurf-2026-09-29.md`, `search-ads-kontoeinrichtung-2026-09-29.md`, `lokale-konkurrenz-search-2026-09-29.md`. Die dort geplanten pausierten Bodenverlegungs-Kampagnen stehen nicht in der Kampagnenliste des Kontos.
  - Lead-Messung geplant: Conversion `Kontaktformular` über Pixel `tp_lead_form_submit`, Nachweis noch offen. GA4 hat keine ausgewählte Property.

## Ziele, Nicht-Ziele

Ziele:
1. Eigene Suchseite für Malerarbeiten + Kombi mit Ortsbezug.
2. Eine pausierte Lead-Search-Kampagne, nur auf Freigabe live.
3. Messung bis zur Anfrage, damit nach 6 Wochen entschieden werden kann.

Nicht-Ziele: Fassade und Außenarbeiten, Verkauf von Wandfarbe im Shop, Preis- oder Rabattänderungen an Shop-Produkten, Änderungen am Hauptmenü.

Anti-Ziele (wäre ein Fehlschlag): Anzeigen oder Seiten versprechen etwas, das der Betrieb nicht hält (Meistertitel, Festpreis, Rabatt, Termine); Kosten laufen ohne Lead-Messung.

## Ansätze

- **A (empfohlen, vorläufig):** Neue eigene Seite `maler-oranienburg` (Maler + Kombi), eine Search-Kampagne mit drei Anzeigengruppen, Gebotsanpassung nach Ort. Bestehende Seiten verlinken darauf.
- **B:** Nur die vorhandene Seite `boden-malerarbeiten` ausbauen. Weniger Aufwand, aber die Seite ist ein Einstieg ins Sortiment und taugt schlecht als Suchseite für "Maler Oranienburg".
- **C:** Nur Google Business Profile und Portal-Eintrag, keine Kampagne. Fast kostenlos, kaum Hebel.

## Design

### 1. Landingpage `maler-oranienburg`

- Template `page.maler-oranienburg.json` aus vorhandenen `tp-`-Blöcken (kein neuer Bautyp, vorher Skill `theme-regeln`).
- Inhalt: H1 "Maler Oranienburg: Wände streichen lassen" (Title unter 60 Zeichen); Leistungen nur, was der Inhaber bestätigt (Wände, Decken, tapezieren innen); Ablauf (kostenloses Aufmaß, Angebot, Termin); Block "Boden und Wand aus einer Hand"; Einsatzgebiet (Oranienburg, Oberhavel, Berlin); echte Vorher-Nachher-Fotos; kurze FAQ (Dauer, Möbel, Farbwahl, Kosten); Formular mit `?thema=maler`.
- Kontaktformular: Thema `maler` ist noch nicht vorhanden (`sections/contact-form.liquid` kennt `muster`, `verlegung`, `angebot`, `reklamation`) und wird ergänzt, damit Anfragen unterscheidbar sind.
- Strukturierte Daten: eigener Service-Knoten in `sections/tp-maler-service.liquid` mit `provider` auf `#organization` aus `sections/header.liquid` (kein zweites LocalBusiness); FAQ-Daten aus `tp-start-faq`. `snippets/tp-treppen-schema.liquid` ist kein JSON-LD, sondern eine SVG-Skizze.
- Verlinkung: von `verlegeservice`, `verlegung-berlin-nord`, `boden-malerarbeiten` und den Ratgeber-Seiten. Menü nur über `scripts/menue-umbau.mjs`, in diesem Vorhaben nicht angefasst.
- Korrektur: Text "Partnerbetrieb" in `tp-verlege-ablauf` an die Aussage des Inhabers anpassen.

### 2. Google Business Profile

Leistung "Malerarbeiten" und passende Zusatzkategorie ergänzen, Leistungsbeschreibung mit Ortsbezug, erste Beiträge mit echten Fotos. Das macht der Inhaber in seinem Profil; ich liefere Texte.

### 3. Kampagne (pausiert, nur als Entwurf)

- Name `TP | Search | Maler + Boden lokal`, Tagesbudget Vorschlag 8 €, Gebote zunächst "Klicks maximieren" mit CPC-Obergrenze; Umstellung auf Conversions erst nach genügend Anfragen.
- Standort: Radius um Oranienburg (ca. 50 km) und ganz Berlin. Gebotsanpassung: plus für Oranienburg/Oberhavel/Berlin-Nord, minus für weit entfernte Berliner Bezirke (Annahme, wird nach den ersten Suchbegriffen angepasst).
- Anzeigengruppen: (1) Maler: `wohnung streichen lassen`, `wände streichen lassen`, `maler oranienburg`, Ortsvarianten; (2) Kombi: `maler und bodenleger`, `renovierung wohnung`; (3) Boden verlegen lassen als Einstieg zur Kombi.
- Keyword-Typ Phrase und Exakt, keine breiten Keywords. Negative: selber, selbst, Anleitung, DIY, Wandfarbe kaufen, Ausbildung, Stellenangebot, Gehalt, Fassade, Auto.
- Anzeigentexte nur mit belegten Aussagen. Rabatt erst nennen, wenn der Inhaber ihn festlegt.
- Ziel für Gebote: `Kontaktformular`-Conversion nach Nachweis laut `search-ads-kontoeinrichtung-2026-09-29.md`; Anruf-Asset nur mit geprüfter Erreichbarkeit.
- Änderungen im Konto nur als Change-Draft, den du freigibst (HYPD), nur bei aktivierten Aktionen.

### 4. Messung

Kontaktformular-Conversion nachweisen (Cookie abgelehnt/akzeptiert, interner Test), GA4-Property wählen, UTM nach `docs/google/utm-regeln.md`. Wöchentlich Suchbegriffe prüfen, Negative nachziehen.

### 5. Reihenfolge und Deploy

Branch, PR, `npm run -s pruefen`, main, Preview, Live nach Skill `deploy`. Remote-Sessions erreichen die Storefront nicht, Preview und Live laufen lokal auf dem Mac. Nach Live: echte Seite ohne Preview-Parameter prüfen (Desktop, Mobile 390 px, Formular).

## Spezifikation

### Offene Entscheidungen des Inhabers

| Punkt | Wer | Wirkung |
|---|---|---|
| Kombi-Rabatt (Höhe, Bedingung) | Inhaber | ohne Entscheidung kein Rabatt in Anzeigen und auf der Seite |
| Preisbeispiel (z. B. ab ... €/m² Wandfläche) | Inhaber | ohne Entscheidung nur "Festpreisangebot nach Aufmaß", falls Festpreis stimmt |
| Leistungsumfang (tapezieren, Spachteln, Decken) | Inhaber | nur Bestätigtes erscheint auf der Seite |
| Qualifikation/Meisterbetrieb, Versicherung | Inhaber | nur Belegtes wird behauptet |
| Vorher-Nachher-Fotos von Malerarbeiten | Inhaber | keine KI-Bilder für echte Referenzen |
| Tagesbudget, Zielpreis je Anfrage | Inhaber | Vorschlag 8 € und bis 50 €, Annahmen |

### Acceptance criteria

- [ ] Seite `maler-oranienburg` live, ohne Preview-Parameter erreichbar, Title unter 60 Zeichen, genau eine H1.
- [ ] Alle Aussagen auf Seite und in Anzeigen sind vom Inhaber bestätigt; keine Lieferantennamen.
- [ ] Formular mit Thema `maler` sendet an die richtige Adresse; Erfolg löst genau eine Conversion aus (Test mit Consent an/aus).
- [ ] Kampagne liegt als pausierter Entwurf im Konto, Budget und Standort wie freigegeben, negative Keywords gesetzt.
- [ ] `npm run -s pruefen` grün; Mobile (390 px) und Desktop geprüft.
- [ ] Nach 6 Wochen liegt ein kurzer Auswertungsbericht vor (Suchbegriffe, Kosten, Anfragen, Empfehlung).

### Außerhalb des Umfangs

Fassade, Shop-Produkte für Wandfarbe, Preisänderungen, Hauptmenü, bestehende Kampagnen (Ausnahme: Hinweis auf die Marken-Kampagne ohne Impressionen).

## Entscheidungen (agent's call, vorläufig)

- Kein Rabatt und kein Preis auf Seite und in Anzeigen; leere Zeile `kombi_vorteil` in der Section.
- Leistungen: Wände, Decken, tapezieren innen. Keine Fassade.
- Berlin ganz im Zielgebiet, Gebote nach Nähe angepasst; Budget 8 €/Tag und Zielpreis bis 50 € je Anfrage sind Annahmen.
- Umsetzung: `templates/page.maler-oranienburg.json`, `sections/tp-maler-service.liquid`, Formular-Thema `maler`, Control-Center-Leistung `maler`, Entwürfe unter `docs/google/maler-boden-search-entwurf-2026-11-27.md`, `docs/seo/gbp-malerarbeiten-2026-11-27.md`, Livegang in `domains/shopify/maler-oranienburg-livegang.md`.
