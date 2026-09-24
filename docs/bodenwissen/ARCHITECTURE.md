# Bodenwissen — Zielarchitektur

Stand 2026-09-23 · Aufgabe #505. Baut auf dem bestehenden Ratgeber auf
(`docs/ratgeber/README.md`, Aufgabe #422) und ersetzt ihn **nicht**.
Bestandsaufnahme: `AUDIT.md`.

## 1. Leitsatz

Der Bereich heisst nach aussen **Bodenwissen**. Technisch bleibt alles, was am
2026-09-21 live gegangen ist, an seinem Platz. Jede Erweiterung muss sich in
das Blog-Modell einfuegen; wo das nicht geht, steht hier begruendet, warum.

## 2. Informationsarchitektur

```
/pages/ratgeber                       Bodenwissen — Einstieg                 (page.ratgeber-start)
├─ Bereiche = je ein Shopify-Blog
│  ├─ /blogs/ratgeber-teppichboden    Teppichboden          live, 5 Artikel  (blog.ratgeber)
│  │  ├─ /tagged/Planen%20&%20Messen  Themengruppe          (dasselbe Template)
│  │  └─ /<artikel>                   Artikel                                (article.ratgeber)
│  ├─ /blogs/ratgeber-teppiche        Teppiche & Wunschmass      geplant
│  ├─ /blogs/ratgeber-vinylboden      Vinyl, PVC & CV            geplant
│  └─ /blogs/ratgeber-untergrund      Untergrund & Verlegen      geplant
├─ /pages/bodenlexikon                Bodenlexikon          (page.bodenwissen-lexikon)
├─ /pages/bodenprobleme               Problem-Finder        (page.bodenwissen-probleme)
└─ /pages/boden-rechner               Rechner               (page.bodenwissen-rechner)
```

### Warum ein Blog je Belag und nicht je Thema

Querschnittsthemen (Reinigung, Pflege, Messen, Verlegen) sind **Themengruppen
innerhalb** des Belag-Blogs, umgesetzt als Artikel-Tags. Die Hub-Section sortiert
danach und Shopify liefert zu jedem Tag eine eigene, crawlbare Ansicht
(`/blogs/<blog>/tagged/<tag>`) — ohne neues Template.

Das ist zugleich die **Kannibalisierungsregel auf Strukturebene**: „Teppichboden
reinigen" kann nicht gleichzeitig in einem Blog „Reinigung" und einem Blog
„Teppichboden" liegen, weil es nur einen Ort gibt.

Ein eigener Blog entsteht nur, wenn ein Thema **belagsuebergreifend** ist und
kein Belag ueberwiegt — das trifft auf Untergrund und Verlegetechnik zu
(Estrich pruefen, spachteln, grundieren, Restfeuchte), nicht auf Reinigung.

### Warum die URLs so bleiben

Der Auftrag wuenscht `/ratgeber/<thema>`. Shopify gibt `/blogs/<blog>/<handle>`
fest vor. Es bleibt dabei:

- Shopify bietet keinen unterstuetzten Weg dorthin; jeder Umweg (Seiten statt
  Artikel, Proxy, Rewrite) kostet Datum, Auszug, Tags, Autor, Sitemap und das
  Artikelobjekt — genau die Entscheidung, die am 2026-09-21 schon einmal gegen
  den Seiten-Aufbau gefallen ist.
- Die fuenf Artikel sind seit 2026-09-21 indexiert. Ein Wechsel kostet
  Weiterleitungen auf lebende URLs ohne Nutzen fuer den Besucher.

Die **Informationshierarchie** ist trotzdem dreistufig (Einstieg → Bereich →
Artikel) und wird ueber Brotkrumen und `BreadcrumbList` sichtbar gemacht. Die
URL bildet sie nicht ab; das ist zulaessig und im Auftrag ausdruecklich erlaubt
(Abschnitt 6: „Bestehende Shopify-Restriktionen beruecksichtigen").

## 3. Wo welche Daten liegen — die zentrale Trennung

Das ist die wichtigste Entscheidung dieses Dokuments.

| Ebene | Ort | Inhalt | Warum dort |
|---|---|---|---|
| **Redaktion** | `content/ratgeber/<bereich>/<handle>.json` im Repo | Cluster, Parent, Suchintention, Status, Quellen, Bildbedarf, verwandte Artikel, Pruefzyklus, Expert-Input-Fragen | Git versioniert, der PR ist das Review, Gates koennen pruefen. Diese Daten gehen den Shop nichts an. |
| **Storefront** | Shopify-Artikel-Metafelder `ratgeber.*` | Kurzantwort, Art, Eckdaten, Material, CTA, Produkte, Video, geprueft von/Stand | Wird gerendert. 19 Definitionen bestehen und sind **nicht umbenennbar**. |
| **Bruecke** | `scripts/ratgeber-payload.mjs` | baut aus der Redaktionsebene die `articleCreate`-Eingabe | besteht bereits, wird erweitert |

Daraus folgt die Regel: **Keine neuen Artikel-Metafelder fuer redaktionelle
Verwaltung.** Ein Feld kommt nur dann nach Shopify, wenn es auf der Seite
sichtbar wird oder in strukturierte Daten eingeht.

## 4. Neue Bausteine

### 4.1 Auffindbarkeit (Luecke L1) — hoechste Prioritaet

Die Shop-Suche fragt heute `type=product,collection,page`. Artikel fehlen.

- Sofortsuche und Ergebnisseite um `article` erweitern
  (`snippets/tp-suche-ergebnisse.liquid`, `sections/tp-header-suche.liquid`).
  Ratgeber-Treffer bekommen eine eigene Gruppe, damit sie nicht zwischen
  Produkten untergehen.
- **Bodenwissen-Suche** auf `/pages/ratgeber`: Feld mit `GET /search?q=…&type=article`
  — funktioniert ohne JavaScript. Mit JavaScript kommt Auto-Suggest aus einem
  Index, den die Section selbst als `<script type="application/json">` rendert
  (Artikel + Lexikonbegriffe + Problemeintraege). Kein Build-Schritt, damit der
  Index nicht veralten kann.
- Suchanfragen ohne Treffer werden als Ereignis gemeldet
  (`tp_bodenwissen_suche_leer`) — die Contentluecken-Quelle aus Auftrag 45.

### 4.2 Bodenlexikon (L3)

**Traeger: Metaobjekt `tp_lexikon`.** Nicht Blog, nicht Seite je Begriff.

Begruendung: Ein Lexikoneintrag ist kurz (Auftrag 17: „duerfen kurz sein").
60 eigene URLs mit je 40 Woertern sind genau die duennen Seiten, die Auftrag 62
nicht indexiert sehen will. Gleichzeitig verlangt Auftrag 18, denselben Text
**auf der Produktseite** zu zeigen — das geht nur mit einem referenzierbaren
Datenobjekt, nicht mit einem Blogartikel.

- Eine Seite `/pages/bodenlexikon` rendert alle Eintraege gruppiert, jeder mit
  `id`-Anker (`#nutzungsklasse`) — ein Ziel fuer interne Links und die Suche.
- Produkt- und Artikelseiten rendern denselben Eintrag **inline** (kurze
  Erklaerung an Ort und Stelle, optionaler Link auf den Anker). Kein Pop-up.
- **Beforderungsregel:** Waechst ein Begriff ueber eine kurze Definition hinaus,
  wird er ein richtiger Artikel; der Lexikoneintrag bleibt kurz und verlinkt
  dorthin. So entsteht keine Dublette.

### 4.3 Problem-Finder (L4)

**Traeger: Metaobjekt `tp_bodenproblem`** (Belag, Symptom, moegliche Ursachen,
Ziel-Artikel). Seite `/pages/bodenprobleme`.

- Gerendert wird eine **statische, crawlbare Liste** nach Belag gruppiert; das
  Filtern nach Belag/Symptom ist eine JavaScript-Zugabe, kein Zugangsweg.
- **Hartes Gate: Ein Problem erscheint nur, wenn es ein Ziel hat.** Eintraege
  ohne Ziel-Artikel bleiben unsichtbar und stehen im Backlog. Damit kann der
  Finder nicht zur Sackgasse werden und es entsteht keine erfundene Antwort
  (Auftrag 14).

### 4.4 Rechner (L5)

Seite `/pages/boden-rechner`, ein Section-Typ je Rechner.

Zuerst nur **Teppichbodenbedarf mit Rollenbreite** — die Rechnung, die der
Auftrag als „besonders wichtig" nennt und die wir vollstaendig aus eigenen Daten
belegen koennen (Rollenbreiten 400/500 cm, Zugabe-Regel aus dem Artikel
„Teppichboden richtig ausmessen"). Ergebnis: benoetigte Rollenlaenge,
Bestellflaeche, Bahnenaufteilung, Verschnitt.

**Nicht gebaut werden** Kleber-, Grundierungs- und Spachtelmengen: Verbrauch
haengt am Produkt des Herstellers. Solange dazu keine belegten Werte vorliegen,
waere jede Zahl erfunden (Auftrag 20 und 69). Steht als `EXPERT INPUT` in
`EXPERT_INPUT.md`.

Der bestehende Produkt-Rechner (`snippets/tp-rollware-rechner.liquid`) bleibt
unangetastet — er rechnet Preise, der Ratgeber-Rechner plant Material.

### 4.5 Praxiswissen (L12)

Zwei Module im Artikeltemplate, beide **nur mit echten Angaben**:

- **„Aus unserer Praxis"** — Fliesstext-Baustein im Artikel-HTML, ausgezeichnet
  als `<aside class="tp-rg-praxis">`. Kein Metafeld, weil der Text Teil des
  Artikels ist.
- **Praxisfall** — Verknuepfung zu einem bestehenden `tp_projekt`-Metaobjekt
  („Unsere Arbeit"). Damit tragen die vorhandenen echten Baustellenbilder den
  Ratgeber, statt neue Datensaetze anzulegen.

Beides bleibt leer, solange das Verlegeteam nichts bestaetigt hat. Die
Schnittstelle steht, der Inhalt ist Inhaberentscheidung.

## 5. Interne Verlinkung als Daten, nicht als Prosa

Beziehungen stehen in der Artikel-JSON, nicht nur im Text:

| Beziehung | Feld | Wirkung |
|---|---|---|
| PARENT | `parent` | Brotkrume, Hub-Zuordnung |
| RELATED | `verwandte` | Modul „Weitere Ratgeber" am Artikelende |
| NEXT STEP | `naechster_schritt` | ein hervorgehobener Verweis |
| GLOSSARY | `lexikon` | Begriffe, die der Artikel erklaert bekommt |
| PRODUCT / SERVICE / CALCULATOR | `metafields.produkte`, `metafields.cta` | bestehende Metafelder |

Vorteil: Ein Gate kann pruefen, ob jedes Ziel existiert, ob jeder Artikel
mindestens einen eingehenden Link hat und ob Ankertexte beschreibend sind.
Prosa-Links im Artikel-HTML bleiben erlaubt und werden mitgeprueft.

## 6. Was ausdruecklich nicht gebaut wird

- **Keine neue App, kein neuer Stack.** Alles laeuft in Theme, Metaobjekten und
  dem bestehenden Repo-Werkzeug.
- **Kein `HowTo`, `FAQPage`, `QAPage`, `AggregateRating`** — die Entscheidungen
  von 2026-09-21 gelten weiter (`AUDIT.md`, Abschnitt 2).
- **Keine Stadtseiten** („Bodenleger Berlin"). Lokales bleibt auf den
  bestehenden Service-Seiten (Auftrag 41, 68).
- **Kein Umzug der Artikel-URLs** (Abschnitt 2).
- **Keine automatische Veroeffentlichung.** `ratgeber:payload` legt grundsaetzlich
  unveroeffentlicht an; sichtbar schalten bleibt ein eigener Schritt.

## 7. Reihenfolge

Begruendung je Stufe in `AUDIT.md`, Abschnitt 6.

| Stufe | Inhalt | Abhaengig von |
|---|---|---|
| **1** | Redaktionsmodell + Gate (`bodenwissen:guard`), Dokumentation, Backlog | — |
| **2** | Auffindbarkeit: Artikel in die Shop-Suche, Bodenwissen-Suche | — (parallel zu 1) |
| **3** | Lexikon, Problem-Finder, Rechner (je Datenmodell + Section + Seite) | 1 |
| **4** | Einstiegsseite auf „Bodenwissen" umbauen, Werkzeuge einbinden | 2, 3 |
| **5** | Artikeltemplate: verwandte Ratgeber, Quellen, Praxis-Module | 1 |
| **6** | Inhalt: Pilotwelle 2, weitere Bereiche | 1, 5 |
| **7** | Messung: Search Console, Ratgeber-Bereich im Dashboard | 6 |

Stufe 1–3 sind untereinander konfliktfrei (getrennte Dateien) und koennen
parallel laufen. Stufe 4 fasst zusammen und gehoert in eine Hand.
