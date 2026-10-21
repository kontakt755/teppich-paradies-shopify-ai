# Lokales SEO 2026-10-21 (Oranienburg, Berlin-Nord)

Nur lesendes Audit mit Schwerpunkt lokale Sichtbarkeit von Laden und
Verlegeservice: Google-Unternehmensprofil, Map-Pack, lokale Auszeichnung und
lokale Seitensignale. Ergaenzt [theme-audit-2026-10-16.md](theme-audit-2026-10-16.md);
was dort schon steht, wird hier nicht wiederholt.

- **Stand:** `origin/main` bei `ae43c987`, Live-Shop am 2026-10-21 zwischen 08:40 und 08:50 UTC
- **Modus:** nur lesend. Kein Edit am Theme, kein Shopify-Schreibzugriff, am Unternehmensprofil nichts geaendert (Dialoge nur geoeffnet und ohne Speichern geschlossen)
- **Live gemessen (rohes HTML per curl):** Startseite und elf Seiten unter `/pages/` (Kontakt, Ueber uns, Liefer- und Verlegeservice, Unsere Arbeit, Teppichboden verlegen lassen, Vinylboden verlegen, Treppenverlegung, Firmenkunden, Boden- und Malerarbeiten, Teppichreinigung, Impressum)
- **Google-Unternehmensprofil:** per Chrome in der angemeldeten Inhaber-Ansicht gelesen (Maps, Suche, Bearbeiten-Dialoge ohne Speichern)
- **Map-Pack:** Stichprobe mit drei Suchbegriffen in Google Maps, angemeldet (personalisiert, nur Anhaltspunkt)

## 1. Plugin "Claude SEO"

| | |
|---|---|
| Quelle | `AgriciDaniel/claude-seo`, Version 2.4.2, Commit `4b99de2` (2026-10-05), MIT, rund 19.500 Sterne |
| Umfang | 26 Skills, 19 Agenten, rund 60 Python-Skripte, 9 optionale Erweiterungen (DataForSEO, Firecrawl, Ahrefs, Bildgenerierung u. a., teils kostenpflichtig) |
| Risiken | Plugin bringt einen `PostToolUse`-Hook mit (startet nach jedem Edit/Write ein Python-Skript); Erweiterungen senden Daten an Dritte; Geo-Grid und Live-GBP-Daten nur ueber DataForSEO (kostenpflichtig) |
| Vorgehen | Mit `git clone --depth 1` in den Scratchpad geholt, gelesen, **nicht installiert** (kein Hook, keine globale Einstellung). Fuer diesen Lauf die Methodik von `seo-local`, `seo-maps` (Stufe 0, ohne bezahlte Schnittstellen) und der GBP-Checkliste `maps-gbp-checklist.md` von Hand angewendet. Kein Skript des Plugins ausgefuehrt, keine Erweiterung, keine Bilderzeugung. Klon nach dem Lauf geloescht |
| Bewertung | Brauchbar als Pruefliste fuer Profil, Bewertungen, NAP und lokales Schema. Schwaechen: viele Prozentzahlen aus US-Branchenstudien (Whitespark, BrightLocal, Sterling Sky), hier nicht nachpruefbar und nicht in diesen Bericht uebernommen; Verzeichnis-Empfehlungen (Yelp, BBB, Chamber of Commerce) sind US-zentriert. Fuer eine dauerhafte Uebernahme gibt es keinen Anlass - die lokalen Pruefpunkte koennten bei Bedarf als eigener Abschnitt in `.claude/skills/theme-audit/pruefliste.md` landen |

## 2. Abgleich mit dem Theme-Audit vom 16.10.

Bereits dort erfasst und hier nicht erneut bewertet: Organization/LocalBusiness
mit fester `@id`, `sameAs` mit Google-Profil, bewusst ohne fremdes
`aggregateRating` (gut umgesetzt); N3 (Service-Knoten ohne Verweis auf die
Organization-`@id`, `sections/tp-verlegegebiet.liquid`); R-H1 (Bing Webmaster
Tools). Neu in diesem Bericht ist alles zum Unternehmensprofil (Abschnitt 3),
die Koordinaten, die Ortsangaben in den Seitentiteln, Berlin und die
Verzeichnis-Eintraege (Abschnitt 4).

## 3. Google-Unternehmensprofil (Stand 21.10., nur gelesen)

| Feld | Befund | |
|---|---|---|
| Name | Teppich Paradies Oranienburg GmbH | ok |
| Primaere Kategorie | Fachhandel fuer Bodenbelaege | ok |
| Weitere Kategorien | Teppichgeschaeft, Teppichverleger, Bodenleger | ok |
| Adresse | Saarlandstr 73-81, 16515 Oranienburg (Website: Saarlandstraße 73-81) | ok, nur Schreibweise |
| Telefon | 03301 5733720 (Festnetz, gleich wie Website) | ok |
| Website | Startseite | ok |
| Oeffnungszeiten | Mo-Fr 8:30-18:00, Sa 8:30-14:30, So zu - gleich wie Website und Schema | ok |
| Sonderoeffnungszeiten | **keine eingetragen** | fehlt (G5) |
| Beschreibung | vorhanden, aber allgemein: kein Ort, kein Einzugsgebiet, keine Verlegung, kein Onlineshop | schwach (G6) |
| Einzugsgebiet | 20 Orte (Oberhavel, Barnim-Rand, Berlin-Reinickendorf mit Wittenau und Frohnau) | ok, Grenze von 20 Eintraegen erreicht |
| Dienstleistungen | **keine einzige** - der Dialog oeffnet im Leerzustand | fehlt (G1) |
| Produkte | keine | fehlt (G9) |
| Logo | **keins** | fehlt (G3) |
| Fotos | Titelbild (Ladenschild) plus 15 eigene Baustellenfotos, alle aelter; keine Innenansicht des Ladens vom Inhaber; Google schlaegt "Fotos Aussenansicht" vor | schwach (G3) |
| Beitraege | ein Beitrag, vor 4 Jahren | fehlt (G4) |
| Attribute | rollstuhlgerechter Eingang und Parkplatz, WLAN, Zahlungsarten; **von Google geaendert und noch nicht bestaetigt** (u. a. "Lieferdienst" neu) | pruefen (G7) |
| Soziale Profile | nur Instagram, Facebook fehlt | klein (G8) |
| Chat | WhatsApp-Link hinterlegt | ok |
| Bewertungen | 4,9 Sterne aus 243; 216x 5, 22x 4, 5x 3, keine unter 3 Sternen | sehr gut |
| Neue Bewertungen | 56 in den letzten 12 Monaten (rund 4-5 je Monat), die juengsten vor 2-4 Wochen | gut |
| Antworten des Inhabers | 87 von 243 beantwortet, fast alle vor rund 2 Jahren; **in den letzten 12 Monaten 2 von 56** | fehlt (G2) |
| Aufrufe | laut Profil 3.851 Aufrufe im Monat, 1.239 Kundeninteraktionen | - |

Hinweis zur Verwechslung: In Berlin-Neukoelln (Hermannstrasse) gibt es ein
anderes Geschaeft namens "Teppich-Paradies GmbH" (3,7 Sterne, 31 Bewertungen).
Google zeigt es unter "Wird auch oft gesucht". Bei Suchen wie
"Teppich Paradies Berlin" kann es vor unserem Laden stehen; Bewertungen koennen
beim falschen Eintrag landen. Ebenfalls unter "Wird auch oft gesucht": ein
Eintrag "TEPPICH REINIGUNG ORANIENBURG" (Kategorie Waescherei, ohne
Bewertungen) - ob er zu uns gehoert, ist offen (G10).

## 4. Befunde

Schwere nach Wirkung auf die lokale Sichtbarkeit (Map-Pack, Kategorie- und
Leistungssuche). Die Punkte G1-G10 liegen im Unternehmensprofil und sind
Inhaber-Aufgaben (Werkbank); W1-W4 betreffen Theme oder Shopify-Seitendaten.

### Hoch

**G1 - Keine Dienstleistungen im Profil.**
Verlegeservice, Treppenverlegung, Aufmass, Teppichreinigung, Kettel- und
Zuschnittservice stehen nirgends im Profil. Google gleicht Suchen wie
"Teppichboden verlegen" oder "Treppe mit Teppich belegen" auch gegen die
Leistungsliste ab; ohne Eintrag bleibt nur die Kategorie.
Vorschlag: unter "Dienstleistungen bearbeiten" die vorgeschlagenen Leistungen
der Kategorien ankreuzen und eigene Leistungen mit kurzer Beschreibung
ergaenzen, mindestens: Teppichboden verlegen, Vinylboden verlegen,
Treppenverlegung, Aufmass vor Ort, Teppichreinigung (Handwaesche), Kettelservice
und Zuschnitt nach Mass. Preise nur, wenn sie mit der Website uebereinstimmen
(z. B. "ab 649 EUR Warenwert bis 15 km Lieferung und lose Verlegung kostenlos").
Aufwand: 30 min.

**G2 - Bewertungen seit rund zwei Jahren fast nicht mehr beantwortet.**
2 von 56 Bewertungen der letzten 12 Monate haben eine Antwort, frueher war es
etwa jede zweite. Antworten zeigen Kunden, dass jemand mitliest, und sind in
den Profilrichtlinien ausdruecklich vorgesehen.
Vorschlag: die Bewertungen der letzten 12 Monate kurz und persoenlich
beantworten (keine Textbausteine, keine Kundendaten, nichts zum Auftrag, was
der Kunde nicht selbst geschrieben hat), danach jede neue innerhalb einer
Woche. Claude kann Entwuerfe vorbereiten; veroeffentlichen macht der Inhaber.
Aufwand: einmalig 1-2 Stunden, danach 5 min je Woche.

**G3 - Kein Logo, keine aktuellen eigenen Fotos vom Laden.**
Das Profil hat kein Logo. Die eigenen Fotos sind Baustellenbilder; eine
Innenansicht der Ausstellung gibt es nur von einem Kunden (vor 4 Wochen),
eine Aussenansicht nur als schraeges Titelbild.
Vorschlag: Logo hochladen (dasselbe wie auf der Website), 5-10 aktuelle Fotos:
Ladenfront mit Schild und Eingang, Ausstellung innen, Musterwand, Rollenlager,
Team beim Aufmass. Danach etwa monatlich ein neues Foto von einer
abgeschlossenen Verlegung (es gibt sie bereits fuer `/pages/unsere-arbeit`).
Keine KI-Bilder im Profil. Aufwand: 1 Stunde.

### Mittel

**G4 - Keine Beitraege seit 4 Jahren.**
Beitraege wirken nicht direkt auf die Platzierung, zeigen aber Aktivitaet und
koennen in der Profilansicht Leistungen und Aktionen tragen.
Vorschlag: zwei Beitraege im Monat, z. B. abgeschlossene Verlegung mit Foto,
neue Kollektion im Laden, Sonderposten. Claude kann Texte vorbereiten.
Aufwand: 15 min je Beitrag.

**G5 - Keine Sonderoeffnungszeiten.**
Der 31.10. (Reformationstag) ist in Brandenburg Feiertag; ohne Eintrag zeigt
Google "Geoeffnet". Dasselbe gilt fuer Weihnachten und Neujahr.
Vorschlag: Feiertage und Betriebsruhe als Sonderoeffnungszeiten eintragen,
zuerst den 31.10. Aufwand: 10 min.

**G6 - Beschreibung ohne Ort und ohne Verlegung.**
Die Beschreibung nennt Sortiment und allgemeine Werte, aber weder Oranienburg
noch das Einzugsgebiet, den Verlegeservice oder den Onlineshop. Die
Startseite und die Meta-Beschreibungen der Leistungsseiten sagen es bereits
konkret ("vom Fachgeschaeft in Oranienburg", "Verlegung bis 50 km").
Vorschlag: Beschreibung neu (bis 750 Zeichen) mit Laden in Oranienburg,
Teppichboden/Vinyl/Linoleum, Aufmass/Lieferung/Verlegung bis 50 km inkl.
Berlin-Nord, Onlineshop mit kostenlosen Mustern. Keine Preise, keine
Superlative. Claude kann einen Entwurf liefern. Aufwand: 15 min.

**G7 - Von Google geaenderte Attribute unbestaetigt.**
Im Bearbeiten-Dialog stehen mehrere Hinweise "Ihre Attribute wurden von
Google aktualisiert" (Serviceoptionen: "Lieferdienst" neu; Zahlungen). Google
uebernimmt solche Vorschlaege auch ohne Bestaetigung.
Vorschlag: jede Aenderung pruefen und bestaetigen oder zuruecksetzen
("Lieferdienst" stimmt nur, wenn die Lieferung mit Verlegung gemeint ist).
Aufwand: 10 min.

**W1 - Koordinaten im Schema 474 m neben dem Google-Pin.**
Ort: `sections/header.liquid:387-388` und `:396` (Organization und
`makesOffer`), `sections/tp-verlegegebiet.liquid:52-53` (Karte und
Service-Knoten). Dort steht 52.7378 / 13.2485; der Pin des
Unternehmensprofils liegt bei 52.73417 / 13.24482 (Saarlandstrasse 73-81).
Wirkung: Das Schema verortet den Laden rund einen halben Kilometer noerdlich;
der Mittelpunkt des 50-km-Kreises verschiebt sich mit. Fuer den Kreis ist das
unerheblich, fuer `geo` widerspricht es dem Profil.
Vorschlag: an allen vier Stellen die Pin-Koordinaten mit 5 Nachkommastellen
eintragen (beide Dateien zusammen, siehe Kommentar in `header.liquid`). Die
Karte in `tp-verlegegebiet` vorher ansehen, ob sie sichtbar verrutscht.
Aufwand: 15 min plus Deploy.

**W2 - Ort fehlt in den meisten Seitentiteln.**
Ort: Seitentitel (SEO-Titel der Shopify-Seiten, nicht das Theme).
Nur "Teppichreinigung Oranienburg ..." und "Unsere Arbeit - Referenzen
Bodenleger Oranienburg" nennen den Ort. Ohne Ort: Startseite
("Teppichboden & Vinylboden online kaufen"), Kontakt, Liefer- & Verlegeservice,
Teppichboden verlegen lassen, Vinylboden verlegen, Treppenverlegung,
Firmenkunden, Boden & Malerarbeiten. H1 und Meta-Beschreibungen nennen
Oranienburg meist schon.
Vorschlag: SEO-Titel der fuenf Leistungsseiten und der Kontaktseite um den Ort
ergaenzen, z. B. "Teppichboden verlegen lassen in Oranienburg & Berlin-Nord".
Startseite bewusst so lassen (der Onlineshop verkauft deutschlandweit).
Aufwand: 20 min, Shopify-Seitendaten, kein Theme-Deploy.

**W3 - Keine Seite fuer Berlin-Nord, Namensvetter in Berlin.**
Berlin kommt auf den Leistungsseiten ein- bis dreimal vor; das Profil fuehrt
Reinickendorf, Wittenau und Frohnau im Einzugsgebiet. Eine Suche nach
"Teppich Paradies Berlin" kann beim gleichnamigen Geschaeft in Neukoelln
landen.
Vorschlag: keine Stadtseiten-Serie (Gefahr von Brueckenseiten), sondern
hoechstens eine echte Seite "Verlegung in Berlin-Nord und Oberhavel" mit
Anfahrt, tatsaechlichen Referenzen aus Reinickendorf/Pankow/Hennigsdorf,
Lieferbedingungen je Entfernung und dem Hinweis "Laden in Oranienburg". Ob
Berlin ueberhaupt aktiv beworben werden soll, entscheidet der Inhaber.
Aufwand: halber Tag, wenn Referenzen vorhanden.

### Niedrig

**G8 - Facebook fehlt in den sozialen Profilen.** Website-Schema fuehrt
Google, Instagram und Facebook in `sameAs`, das Profil nur Instagram.
Aufwand: 2 min.

**G9 - Keine Produkte im Profil.** Optional: 5-10 Produktkacheln fuer die
Hauptgruppen (Teppichboden, Vinyl, Teppich nach Mass, Treppe) mit Link auf
die Kollektion. Aufwand: 30 min.

**G10 - Unklarer Eintrag "TEPPICH REINIGUNG ORANIENBURG".** Unter "Wird auch
oft gesucht" steht ein Eintrag mit Kategorie Waescherei und ohne Bewertungen.
Gehoert er zu uns, sollte er mit dem Hauptprofil zusammengelegt oder
geschlossen werden; gehoert er nicht zu uns, nichts tun. Aufwand: 5 min
klaeren.

**C1 - Verzeichnis-Eintraege leicht abweichend.** Das Oertliche, Gelbe
Seiten und werkenntdenbesten schreiben "Teppich-Paradies Oranienburg GmbH"
(mit Bindestrich) und "Saarlandstr."; werkenntdenbesten nennt zusaetzlich eine
Mobilnummer. Telefon und Hausnummer stimmen ueberall. Vorschlag: bei
Gelegenheit vereinheitlichen; die Mobilnummer nur lassen, wenn sie
oeffentlich sein soll. Bing Places und Apple Business wurden nicht geprueft
(kein Zugang in diesem Lauf) - beide speisen Karten- und Assistenzdienste
ausserhalb von Google; der Inhaber sollte pruefen, ob der Laden dort
beansprucht ist. Aufwand: 30 min.

**W4 - Rechtlicher Name fehlt im Schema.** `sections/header.liquid:347`
fuehrt "Teppich Paradies" mit `alternateName` "TeppichParadies"; Profil,
Fusszeile und Impressum heissen "Teppich Paradies Oranienburg GmbH".
Vorschlag: `legalName` ergaenzen. Aufwand: 5 min, gut zusammen mit W1 und N3
aus dem Theme-Audit.

## 5. Was gut ist

- **NAP ueberall gleich:** Fusszeile jeder Seite (Name, Strasse, PLZ/Ort,
  Oeffnungszeiten, Festnetz), Kontaktseite, Schema und Profil stimmen in
  Telefon, Hausnummernbereich und Oeffnungszeiten ueberein; `tel:`-Links auf
  jeder Seite.
- **Kontaktseite** mit eingebetteter Google-Karte des Profils; Leistungsseiten
  mit Routenlink auf das Profil.
- **Leistungsseiten je Leistung** (Teppichboden, Vinyl, Treppe, Teppichreinigung,
  Firmenkunden) mit eigener H1, Meta-Beschreibung mit Ort und `Service`-Schema
  mit Einzugsgebiet.
- **Schema-Typ** `HomeAndConstructionBusiness` + `Store` passt zu Laden mit
  Verlegung; `areaServed` Deutschland fuer den Shop und 50-km-Kreis fuer die
  Verlegung sind sauber getrennt.
- **Bewertungsprofil** stark (4,9 aus 243, stetiger Zulauf); Kategorien
  sinnvoll gewaehlt.

## 6. Map-Pack-Stichprobe (angemeldet, nur Anhaltspunkt)

| Suche (Kartenmitte) | Platz ohne Anzeigen | Bemerkung |
|---|---|---|
| "Teppichboden" (Oranienburg) | 1 | zusaetzlich eigene Kartenanzeige |
| "Bodenleger" (Oranienburg) | 3 | zwei Handwerksbetriebe davor; eigene Kartenanzeige an Platz 2 |
| "Teppichboden verlegen" (Berlin-Nord) | 1 | Wettbewerber aus Berlin dahinter |

Eine belastbare Messung (Raster ueber Oberhavel und Berlin-Nord, nicht
angemeldet) braucht einen Dienst wie DataForSEO und kostet Geld - nicht
gelaufen.

## 7. Nicht geprueft

- Search Console nach lokalen Suchanfragen: In dieser Sitzung war keine
  Search-Console-Verbindung verfuegbar.
- Bing Places, Apple Business, Facebook-Seite im Detail.
- Leistungsbericht des Profils (Anrufe, Routen, Suchbegriffe) - nur die
  Kennzahl im Kopf gelesen.
- Die Anzeigenpfade der Kartenanzeigen (`/teppich/verlegen`) liefern als URL
  404; das ist bei Anzeigenpfaden normal (nur Anzeige), die tatsaechliche
  Ziel-URL der Anzeigen wurde nicht geprueft.

## 8. Empfohlene Reihenfolge

1. G1 Dienstleistungen eintragen und G5 Sonderoeffnungszeiten (31.10.) - 40 min, groesste Luecke.
2. G2 Bewertungen der letzten 12 Monate beantworten (Entwuerfe von Claude).
3. G3 Logo und aktuelle Ladenfotos, G6 neue Beschreibung, G7 Attribute bestaetigen.
4. Ein kleiner Theme-PR fuer W1 und W4 (zusammen mit N1-N3 aus dem Theme-Audit), dazu W2 in den Seitendaten.
5. W3 nur nach Entscheidung des Inhabers zu Berlin; G4 Beitraege als laufende Gewohnheit.
