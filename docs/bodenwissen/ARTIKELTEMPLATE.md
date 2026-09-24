# Artikeltemplate — Quellen und Bausteine

Stand 2026-09-23 · Paket P1. Beschreibt `sections/tp-ratgeber-beitrag.liquid`
(Template `article.ratgeber`) auf Baustein-Ebene: was gerendert wird und woher
es kommt. Modell der Felder: `CONTENT_MODEL.md`. Verlinkungsregeln:
`INTERNAL_LINKING.md`. Architektur-Entscheidung fuer Praxiswissen:
`ARCHITECTURE.md`, Abschnitt 4.5.

## 1. Woher jeder Baustein seine Daten holt

| Baustein | Quelle | Typ |
|---|---|---|
| H1, Datum, Autor | Shopify-Artikel selbst | Artikelfeld |
| Art-Label, Kurzantwort, Dauer/Schwierigkeit/Personen, Material | `article.metafields.ratgeber.*` | Metafeld (bestehend) |
| Titelbild | `article.image` (Artikel-Feature-Bild) | Artikelfeld |
| Inhaltsverzeichnis | aus den H2 im Artikeltext erzeugt (`snippets/tp-ratgeber-inhalt.liquid`) | abgeleitet |
| Artikeltext | `article.content` (`<handle>.html` im Quelltext) | Quelltext-HTML |
| **Aus unserer Praxis / Warnhinweis** | **Quelltext-HTML**, mitten im Artikeltext | Quelltext-HTML |
| Video | `article.metafields.ratgeber.video_*`, `transkript` | Metafeld (bestehend) |
| Passend dazu (Rechner/Muster/Verlegeservice/Zubehoer, Produkte) | `article.metafields.ratgeber.cta`, `.produkte`, `.kollektion`, `.zubehoer_kollektion` | Metafeld (bestehend) |
| **Als Naechstes** | **`article.metafields.ratgeber.naechster_schritt`** (neu) | Metafeld (neu) |
| **Weitere Beitraege** | **`article.metafields.ratgeber.verwandte`** (neu), Rueckfall: Artikel-Tags | Metafeld (neu) + Ableitung |
| Ueberschriften, Ausweichlinks, Ein/Aus-Schalter fuer diese Bausteine | Theme-Editor | Section-Einstellung |
| Firmenbox, Newsletter | Theme-Editor | Section-Einstellung |

Die Regel aus `ARCHITECTURE.md`, Abschnitt 3, gilt weiter: Ein Feld kommt nur
dann als Shopify-Metafeld an, wenn es auf der Seite sichtbar wird. `verwandte`
und `naechster_schritt` bleiben zugleich **auch** Redaktionsfelder im
Quelltext (`content/ratgeber/<bereich>/<handle>.json`) — dort pflegt die
Redaktion sie, das Gate (`bodenwissen:guard`) prueft sie gegen den Quelltext,
und `scripts/ratgeber-payload.mjs` traegt sie zusaetzlich in die Metafelder
ein, weil erst das Template sie zur Laufzeit gegen den Blog aufloesen kann.

## 2. Neue Metafelder

| Metafeld | Typ | Inhalt |
|---|---|---|
| `ratgeber.verwandte` | `list.single_line_text_field` | Liste von Artikel-**Handles**, in Kurationsreihenfolge |
| `ratgeber.naechster_schritt` | `single_line_text_field` | ein Artikel-**Handle** |

**Warum Handles und keine `list.article_reference`:** Der Quelltext im Repo
kennt nur Handles (der Dateiname im Artikelordner). Eine echte Referenz
braucht die Artikel-GID, und die kennt erst der Shop, nachdem der Ziel-Artikel
dort angelegt wurde — bei jedem neuen Artikel entstuende ein Henne-Ei-Problem
plus eine zusaetzliche Aufloesungsrunde (Artikel anlegen, GID einsammeln,
Referenzfeld nachtragen), so wie es die `kollektionen.json`-Zuordnung fuer
`kollektion`/`zubehoer_kollektion` bereits heute braucht. Das Artikeltemplate
loest die Handles zur Laufzeit selbst gegen `blog.articles` auf und
ueberspringt nicht mehr vorhandene Handles still — das kann eine gepflegte
Referenz nicht leisten, ohne bei jeder Loeschung nachgepflegt zu werden.
Dieselbe Begruendung steht im Dateikopf von `scripts/ratgeber-payload.mjs`.

**Wichtig beim Deploy:** Beide Metafeld-Definitionen bestehen bisher nur im
Code (dieses Dokument, `scripts/ratgeber-payload.mjs`, das Template). Sie
muessen vor dem ersten Einsatz **im Shop angelegt werden** (Admin ›
Einstellungen › Metafelder › Artikel, Namespace `ratgeber`, Schluessel und Typ
wie in der Tabelle oben) — genau wie die 19 bestehenden `ratgeber.*`-Felder.
Metafeld-Schluessel sind nach dem Anlegen unveraenderlich, also Namen und Typ
vor dem Anlegen gegen diese Tabelle gegenpruefen.

## 3. Rangfolge: kuratiert vor Tags

`article.metafields.ratgeber.verwandte` hat Vorrang, **in genau der
hinterlegten Reihenfolge**:

1. Ist das Metafeld gefuellt, loest das Template jedes Handle gegen die
   Artikel desselben Blogs auf (`blog.articles`, die 50 neuesten).
2. Ein Handle, der im Blog nicht gefunden wird — zum Beispiel weil der
   Zielartikel geloescht wurde — wird **still uebersprungen**. Kein Fehler,
   keine Luecke im Layout.
3. Der Artikel aus `naechster_schritt` (falls er aufloest) wird aus dieser
   Liste entfernt, damit er nicht doppelt erscheint.
4. Ergibt die kuratierte Liste **keinen einzigen** Treffer — Feld leer oder
   alle Handles unaufloesbar — greift die bisherige Ableitung: Artikel
   desselben Blogs mit mindestens einem gemeinsamen Tag, danach mit den
   neuesten Artikeln aufgefuellt, maximal drei.

Es gibt kein Mischen: entweder die kuratierte Liste liefert mindestens einen
Treffer und wird komplett verwendet, oder sie liefert nichts und die
Tag-Ableitung uebernimmt komplett. Die Darstellung (Karten, Raster) ist in
beiden Faellen identisch — nur die Auswahl unterscheidet sich.

`article.metafields.ratgeber.naechster_schritt` erscheint als eigener,
hervorgehobener Verweis **vor** dem Abschnitt „Weitere Beitraege" — unabhaengig
davon, ob dieser Abschnitt in den Section-Einstellungen eingeschaltet ist.
Loest das Handle nicht auf (leer oder kein Treffer im Blog), entfaellt der
Baustein ersatzlos.

## 4. Praxis-Bausteine

Zwei Bausteine, beide **redaktionell direkt im Artikel-HTML** gesetzt (im
`<handle>.html`, nicht als Metafeld — der Text ist Teil des Artikels, siehe
`ARCHITECTURE.md` Abschnitt 4.5). Beide sind optional; ohne echte, vom
Verlegeteam bestaetigte Angaben bleibt der Abschnitt einfach weg.

### „Aus unserer Praxis" — `aside.tp-rg-praxis`

Ein praktischer Erfahrungswert aus dem Verlegealltag, ruhig ausgezeichnet
(abgesetzter Kasten, kein Ausrufezeichen-Ton, kein Icon):

```html
<aside class="tp-rg-praxis">
  <h3>Aus unserer Praxis</h3>
  <p>Bei Raumbreiten knapp über 400 cm lohnt sich fast immer die 500er Rolle:
  eine Naht mitten im Raum sieht man später öfter, als man beim Verlegen
  denkt.</p>
</aside>
```

### Warnhinweis — `aside.tp-rg-warnung`

Fuer Hinweise, deren Missachtung ein Ergebnis sichtbar verschlechtert (z. B.
Nutzungsklasse, Restfeuchte, Florrichtung). Gleiche ruhige Bauweise, andere
Akzentfarbe zur Unterscheidung:

```html
<aside class="tp-rg-warnung">
  <h3>Vor dem Verlegen prüfen</h3>
  <p>Estrich immer mit einem CM-Gerät auf Restfeuchte prüfen. Ein optisch
  trockener Estrich kann darunter noch feucht sein.</p>
</aside>
```

Beide Bausteine sind mobil zuerst gestaltet (kein horizontales Scrollen, keine
festen Hoehen), unterbrechen die Textspalte nicht mit eigenem Layout und
tragen keinen zusaetzlichen Rand ausser dem eigenen Abstand — der Lesefluss
bleibt eine einzige Spalte. CSS: `assets/tp-ratgeber-beitrag.css`.

## 5. Section-Einstellungen zu diesem Paket

| Einstellung | Standard | Wirkung |
|---|---|---|
| „Naechster Schritt" › Ueberschrift (`naechster_heading`) | „Als Nächstes" | Beschriftung des hervorgehobenen Verweises |
| „Weitere Beitraege" › anzeigen / Ueberschrift | unveraendert | steuert weiterhin nur den Abschnitt darunter, nicht „Als Naechstes" |
