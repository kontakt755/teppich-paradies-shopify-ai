# Ratgeber / Bodenwissen – Architektur, Redaktion, SEO- und KI-Grundlage

Stand 2026-09-21 · Aufgabe #422. Ziel: ein Wissensbereich unter „Service &
Verlegung", der Menschen hilft, für Suchmaschinen und Antwortsysteme sauber lesbar
ist und mit dem Verkauf verbunden ist, ohne zur Werbeseite zu werden.
**Es gibt keine Garantie, dass ein KI-System den Shop nennt** – wir sorgen nur
dafür, dass die Inhalte klar, belegt und maschinenlesbar sind.

## 1. Informationsarchitektur

```
/pages/ratgeber                        Übersicht aller Bereiche   (page.ratgeber-start)
└─ /blogs/ratgeber-teppichboden        Bereich, gruppiert nach Thema (blog.ratgeber)
   └─ /blogs/ratgeber-teppichboden/<artikel>                     (article.ratgeber)
später: /blogs/ratgeber-vinylboden, -laminat, -parkett, -sockelleisten, …
```

- **Ein Shopify-Blog je Bodenbereich.** Neue Bereiche brauchen kein neues Template,
  nur einen neuen Blog mit Template-Suffix `ratgeber` und einen Block auf der
  Übersichtsseite.
- **Themengruppen sind Artikel-Tags**, Reihenfolge steht in den Einstellungen der
  Hub-Section: Auswahl & Kaufberatung · Planen & Messen · Vorbereiten · Verlegen ·
  Abschluss & Leisten · Pflege · Fehler vermeiden.
- **Art des Inhalts** (`ratgeber.art`): Kaufberatung, Anleitung, Planung, Pflege –
  steht als Etikett auf jeder Karte, damit „welches Produkt" und „wie verlegen"
  auf einen Blick unterscheidbar sind.
- Brotkrumen überall: Startseite › Ratgeber › Bereich › Artikel (sichtbar +
  `BreadcrumbList`).

Benchmark (Baumarkt- und Fachhandelsratgeber, nur Struktur ausgewertet): Die guten
Beispiele haben drei Ebenen, eine Kurzantwort oder Eckdaten-Box oben, nummerierte
Schritte, eine Materialliste, kontextnahe Produktverweise und ein dichtes
„Weitere Ratgeber"-Modul. Schwach sind flache Magazin-Seiten mit Fließtext, der in
einem Kaufaufruf endet. Kein ausgewerteter Fachhändler deckt Teppichboden in der
Tiefe ab – das ist die Lücke.

### Entschieden: Blog-Aufbau (Inhaber, 2026-09-21)

Parallel war in PR #424 (#420) ein Ratgeber auf Basis von Shopify-**Seiten**
entstanden. Der Inhaber hat den Blog-Aufbau gewählt; die sechs Ratgeber-Dateien
sind aus #424 entfernt (Commit `c06f058`). Ausschlaggebend: Beim Seiten-Aufbau
lagen Kurzfazit, Eckdaten und Schritte in Section-Einstellungen – die gelten je
Template-Datei, jeder Artikel hätte also eine eigene Datei gebraucht. Beim Blog
kommt alles aus Artikel-Metafeldern mit **einem** Template; Datum, Titelbild,
Auszug, Tags, Sitemap und das Artikelobjekt bringt Shopify mit.

Die Dateinamen hier (`tp-ratgeber-beitrag`, `tp-ratgeber-bereiche`,
`page.ratgeber-start`) bleiben so – sie waren zur Entflechtung gewählt und sind
inzwischen im Entwicklungs-Theme geprüft.

Aus dem Entwurf übernommen: der Gedanke „Belag ist eine zweite Achse" (hier: ein
Blog je Belag statt Umschalter), die Menü-Vorlage
(`domains/shopify/menu-main-menu-ratgeber-vorlage.md`, an den Blog angepasst) und
die Artikelliste der nächsten Welle (Abschnitt 8).

## 2. Aufbau eines Artikels

Frage → kurze direkte Antwort → Erklärung → Schritt für Schritt → Bild/Video →
passende Produkte, Rechner, Service.

1. Brotkrumen, Inhaltsart, **eine** H1, Datum (veröffentlicht/aktualisiert),
   optional „Fachlich geprüft von …"
2. **Kurz beantwortet** (`ratgeber.kurzantwort`, 2–4 Sätze, für sich verständlich)
3. Eckdaten bei Anleitungen: Dauer, Schwierigkeit, Personen; Material & Werkzeug
4. Titelbild, Inhaltsverzeichnis aus den H2
5. Text: H2 je Abschnitt, Schritte als `H3 „Schritt 1: …"`
6. Video mit Transkript (sobald vorhanden)
7. **Passend dazu** – erst nach dem Inhalt, höchstens vier Verweise
8. Weitere Ratgeber · Firmenbox · optional Newsletter (Standard: aus)

### Artikel-Metafelder (Namespace `ratgeber`, alle optional)

| Schlüssel | Typ | Zweck |
|---|---|---|
| `kurzantwort` | mehrzeiliger Text | direkte Antwort; auch `description` im Schema |
| `art` | Text (Auswahl) | Kaufberatung · Anleitung · Planung · Pflege |
| `dauer`, `schwierigkeit`, `personen` | Text | Eckdaten |
| `material` | Textliste | Material & Werkzeug |
| `video_url`, `video_titel`, `video_beschreibung`, `video_datum`, `video_vorschaubild`, `video_dauer_iso`, `transkript` | URL, Text, Datum, Datei | Video; `VideoObject` nur, wenn URL, Titel, Vorschaubild und Datum da sind |
| `produkte` | Produktliste | bis 4 passende Produkte (ohne Preislogik) |
| `kollektion`, `zubehoer_kollektion` | Kollektion | Ziel der Verweise „Rechner" und „Zubehör" |
| `cta` | Textliste (Auswahl) | `rechner`, `muster`, `verlegeservice`, `zubehoer` |
| `geprueft_von`, `stand` | Text, Datum | fachliche Prüfung |

Metafeld-Schlüssel sind nach dem Anlegen nicht mehr umbenennbar – diese Liste ist
die Namenskonvention.

## 3. Verknüpfung mit dem Verkauf – und ihre Grenze

| Artikel | Verweis |
|---|---|
| richtig ausmessen, Rollenbreite wählen | `rechner` → Kollektion; der Rechner sitzt am Produkt |
| welcher Teppichboden für welchen Raum | `produkte` / gefilterte Kollektion, `muster` |
| verlegen, fixieren, kleben | `zubehoer` (Kleber, Verlegeband, Leisten), `verlegeservice` |
| unsicher bei der Farbe | `muster` |

Regeln: Verweise stehen **nach** dem Inhalt, nie in der Einleitung. Höchstens vier.
Kein Preis, kein Rabatt, kein „jetzt kaufen" im Fließtext. Umgekehrt gilt die
Produktseiten-Regel: Auf der Produktseite erscheint der Ratgeber höchstens als
Textlink **unterhalb** des Warenkorb-Knopfs – nichts zwischen Konfiguration und
Kauf.

## 4. Strukturierte Daten – was wir ausgeben und was nicht

| Typ | Wo | Anmerkung |
|---|---|---|
| `Article` | jeder Artikel | headline, description, image, datePublished, dateModified, author/publisher = das Unternehmen, articleSection, inLanguage |
| `BreadcrumbList` | Übersicht, Bereich, Artikel | entspricht der sichtbaren Brotkrume |
| `VideoObject` | nur mit echtem Video | sonst nichts |
| `Organization`/`Store` | seitenweit (besteht) | Adresse, Öffnungszeiten, Geo |
| ~~`HowTo`~~ | – | Google zeigt dafür seit 2023 keine Rich Results mehr; Schritte stehen als sauberes HTML im Text |
| ~~`FAQPage`~~ | – | Rich Results nur noch für Behörden-/Gesundheitsseiten; FAQ bleibt normales HTML. Bestehende Shop-Entscheidung („kein FAQ-Schema") bleibt |
| ~~`AggregateRating` aus Google-Bewertungen~~ | – | selbst eingebundene Fremdbewertungen am eigenen Unternehmen sind nach Googles Richtlinien nicht zulässig |

Grundsatz: Kein Schema-Typ ohne sichtbaren Inhalt, der ihn trägt.

## 5. Technischer SEO-Befund (Live-Crawl 2026-09-21)

In Ordnung: `lang="de"` überall · Canonicals korrekt (Varianten, Filter,
Kollektions-Produktpfade fallen auf die Produkt-URL) · Paginierung
selbstreferenzierend · kein fehlerhaftes JSON-LD · Produktlinks ohne
Kollektionspfad · TTFB ≈ 0,1 s · `robots.txt` lässt alle Crawler zu, auch die der
KI-Anbieter (keine Sonderregeln nötig) · `sitemap.xml` vollständig · `llms.txt`
und `agents.md` stellt Shopify selbst bereit.

Offen, nach Wirkung sortiert – **nicht Teil dieses Pakets**, jeweils eigene kleine
Aufgabe:

1. Zwei praktisch identische Seiten: `/pages/firmenkunden` und
   `/pages/fur-geschaftskunden` (gleiche H1, beide in der Sitemap, letztere ohne
   Meta-Description und ohne eingehenden Link) → eine behalten, die andere
   weiterleiten.
2. `/pages/uber-uns` ist verwaist (kein interner Link), Description 320 Zeichen,
   Stand 2024. Für Vertrauen und Autorensignal wichtig → aktualisieren, in Fußzeile
   und Ratgeber-Firmenbox verlinken.
3. Brotkrumen fehlen auf Kollektions- und Inhaltsseiten (nur Produktseite hat sie).
4. Paketprodukte (Klick-/Klebevinyl) und Leisten nutzen das Standard-Schema ohne
   €/m²; Rollenware hat `UnitPriceSpecification`. Angleichen – mit Blick auf den
   Merchant-Center-Abgleich (#415) als eigene Aufgabe.
5. `/pages/hochflor-teppichboden` verwaist; leerer Blog „News" in der Sitemap.
6. 58 von 110 Bildern der Startseite ohne `width`/`height` (mögliche
   Layoutverschiebung).
7. `WebSite`-Schema fehlt (nur Namenssignal; die Suchbox-Auszeichnung gibt es bei
   Google nicht mehr).

## 6. Vertrauenssignale im Ratgeber

- Firmenbox am Artikelende mit Link auf „Über uns" und das Ladengeschäft –
  **Texte kommen vom Inhaber**, im Template stehen keine erfundenen Zahlen.
- „Fachlich geprüft von … · Stand …" je Artikel, nur wenn wirklich geprüft.
- Eigene Fotos und später eigene Praxisvideos schlagen Stockmaterial. Vorhandene
  Referenzen („Unsere Arbeit") aus passenden Artikeln verlinken.
- `dateModified` ehrlich halten: Artikel bei fachlicher Änderung aktualisieren,
  nicht kosmetisch.

## 7. Video – vorbereitet, nicht produziert

Der Videoplatz lädt **nichts** von YouTube/Vimeo, bevor der Besucher klickt
(eigenes Vorschaubild, danach `youtube-nocookie`), oder spielt eine eigene
MP4-Datei. Zu jedem Video gehören Titel, Beschreibung, Datum, Vorschaubild und ein
Transkript – das Transkript ist der Teil, den Suchmaschinen und Antwortsysteme
tatsächlich lesen. Reihenfolge der Quellen: eigene Praxisvideos vor Erklärgrafik
vor KI-Visualisierung.

## 8. Redaktionsregeln (gegen den Textfriedhof)

1. Erst die vier bis fünf Pilotartikel, dann messen, dann erweitern.
2. Ein Artikel beantwortet **eine** Frage vollständig; keine Dubletten zum selben
   Suchbegriff – lieber einen Artikel ausbauen.
3. Jede fachliche Aussage stammt aus der eigenen Verlegepraxis oder einer
   Herstellerangabe. Keine erfundenen Produkteigenschaften, keine geschätzten
   Zahlen. Unsicheres bleibt draußen.
4. Freigabe durch den Inhaber vor Veröffentlichung; Entwürfe liegen unveröffentlicht
   im Blog, Quelltexte unter `content/ratgeber/`.
5. Keine Lieferantennamen (öffentliches Repo und öffentliche Seite: nur
   Eigenmarken/Shopnamen).
6. Jeder Artikel verlinkt zwei bis drei verwandte Artikel und höchstens vier
   Verkaufsziele.

Pilotthemen (Kaufnähe × Nachfrage): Teppichboden richtig ausmessen · Rollenbreite
und Bahnen planen · Welcher Teppichboden für welchen Raum · Teppichboden verlegen:
lose, fixiert oder verklebt · Pflege und Fleckentfernung.

**Stand der Pilotwelle:** alle fünf Entwürfe liegen unter
`content/ratgeber/teppichboden/` (ausmessen · Rollenbreite und Bahnen · welcher
Teppichboden für welchen Raum · lose/fixiert/verklebt · pflegen und Flecken
entfernen). Offen sind 71 `PRUEFEN`-Fragen an das Verlegeteam, gesammelt in der
dortigen `README.md`; `npm run ratgeber:payload` sperrt jeden Artikel, bis seine
Fragen beantwortet sind und der Status auf `freigegeben` steht.

**Nächste Welle** (aus dem Entwurf in #424 übernommen, Reihenfolge nach Nähe zur
Fehlbestellung bzw. zum Kaufvorbehalt):

| Themengruppe | Arbeitstitel | Frage des Kunden | Verweise |
|---|---|---|---|
| Verlegen | Bahnen verbinden – Nähte bei Nadelvlies und Velours | „Sieht man die Naht?" | `verlegeservice`, `zubehoer` |
| Vorbereiten | Untergrund prüfen und vorbereiten | „Muss ich am Boden vorher etwas machen?" | `verlegeservice` |
| Abschluss & Leisten | Teppichfußleisten passend auswählen | „Welche Leiste passt farblich und technisch?" | Kollektion Bodenleisten |
| Planen & Messen | Teppichboden richtig transportieren | „Passt die Rolle ins Treppenhaus?" | `verlegeservice` |

## 9. Livegang-Reihenfolge (noch nicht ausgeführt)

1. Theme mit den `ratgeber`-Templates über die normale Kette live
   (PR → `main` → Preview → Live). **Erst danach** Shopify-Objekte anlegen – eine
   Seite oder ein Blog mit fehlendem Template fällt sonst auf das Standard-Template
   zurück (bei Seiten ist das hier die B2B-Seite).
2. Blog `ratgeber-teppichboden` und Seite `ratgeber` anlegen (die 19
   Metafelddefinitionen bestehen seit 2026-09-21). Artikel anlegen mit
   `npm run ratgeber:payload -- content/ratgeber/teppichboden --blog-id <gid>
   --kollektionen <datei>`: Das Skript baut die Eingaben für `articleCreate` und
   **sperrt jeden Artikel**, der nicht `"status": "freigegeben"` trägt oder noch
   eine `PRUEFEN`-Marke enthält. Angelegt wird immer unveröffentlicht; sichtbar
   schalten ist ein eigener, freigegebener Schritt.
3. Menü „Service & Verlegung" um „Ratgeber" ergänzen. `menuUpdate` ersetzt den
   ganzen Baum: vorher auslesen, alle Zweige mit IDs zurückschreiben, Gegenprobe
   ist die identische ID-Menge (`docs/lessons/tote-menuelinks.md`).
4. Sitemap prüfen (`sitemap_blogs_1.xml` enthält die Artikel), strukturierte Daten
   je Seitentyp validieren, interne Links zählen.
