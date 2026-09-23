# Was tatsaechlich geprueft wurde

Stand 2026-09-23 · Aufgabe #505 · Checkliste: `QA_CHECKLIST.md`.

Diese Datei haelt fest, was **ausgefuehrt** wurde — nicht, was gebaut wurde.
Ein gruener Guard ist kein Beleg dafuer, dass eine Seite rendert.

## Wie geprueft wurde

Ein Development-Theme (`shopify theme push --development --development-context
bodenwissen`), Seiten ueber `?preview_theme_id=…` abgerufen. Die drei Seiten, die
es im Shop noch nicht gibt, ueber `?view=<suffix>` auf `/pages/ratgeber`
gerendert — so laesst sich ein Template pruefen, ohne Shop-Daten anzulegen.

**Warum ueberhaupt gepusht wurde:** Der erste Push hat einen Fehler gezeigt, den
kein Gate sah (unten, „Gefunden"). Statische Pruefung allein reicht bei Liquid
nicht.

## Ergebnis

| Gegenstand | Beleg |
|---|---|
| `/pages/ratgeber` | HTTP 200. Suche, Bereichskarten und „Haeufig gesucht" mit 5 Links gerendert. Werkzeugkarten **nicht** gerendert — richtig, sie haben noch kein Ziel. |
| Suchindex | Gueltiges JSON, 5 Artikel mit korrektem Etikett und korrekter URL. |
| Suchvorschlaege | „ausmess" → 1 Treffer mit Etikett „Planung". „zimmerpflanze" → Liste verborgen, kein Fehler. |
| Barrierefreiheit der Suche | `role="combobox"`, `aria-expanded`, `aria-controls` werden **von JavaScript** gesetzt — ohne JS gibt es keine Liste, dann waere die Auszeichnung eine Luege. |
| Shop-Suche nach „ausmessen" | Vier Ratgeber-Artikel als eigene Gruppe „Ratgeber", je mit Inhalts-Etikett. **Damit ist Luecke L1 geschlossen.** |
| Artikelseite | HTTP 200, H1, Kurzantwort, „Weitere Beitraege" (3 Links), „Passend dazu". `Article` + `BreadcrumbList` valide. Keine Regression durch die Template-Aenderung. |
| Kuratierte Verweise | „Als Naechstes" erscheint **nicht** — richtig, das Metafeld gibt es im Shop noch nicht. Der Tag-Rueckfall traegt. |
| `/pages/boden-rechner` | HTTP 200, vollstaendig gerendert. |
| Rechner, echte Eingabe | 320 × 460 cm, 20 cm Zugabe → 400er: 19,20 m², Verschnitt 4,48 m² (30,4 %); 500er (Empfehlung, gedreht): 17,00 m², 2,28 m² (15,5 %). **Identisch mit dem Beispiel im Artikel „Verschnitt bei Teppichboden".** |
| Rechner, Fehlerfall | Leere und unsinnige Eingabe → sichtbarer Hinweis mit `role="alert"`, verstaendlicher Text. |
| `/pages/bodenlexikon`, `/pages/bodenprobleme` | HTTP 200. Ohne die Metaobjekte bleibt der Inhalt leer, die Seite bricht nicht — Brotkrume und Kopf stehen. |
| Ereignisse | Alle fuenf ausgeloest und in `dataLayer` belegt: `tp_bodenwissen_suche` (treffer 1), `tp_bodenwissen_suche_leer` (nur bei 0 Treffern), `tp_bodenwissen_rechner` (genau **einmal** je Seitenaufruf, zweiter Klick loest nichts aus). |

## Gefunden und behoben

Fuenf Fehler, die alle Gates gruen durchlaufen hatten. Keiner war ohne echtes
Rendern zu sehen.

**1. Shopify lehnte `blocks/tp-produktinfo-tabelle.liquid` ab:** „Nested doc tags
are not allowed". Ursache: In zwei Kommentaren stand die Zeichenfolge `{% doc %}`
als Verweis („siehe {% doc %} oben") — der Parser sieht dort ein echtes Tag. Ohne
diesen Push waere die Datei still verworfen worden und die technischen Daten
waeren von der Produktseite verschwunden. `liquid:guard` prueft seither die
Balance der doc-Tags (`DOC_UNBALANCED`).

**2. `article.handle` ist `<blog-handle>/<artikel-handle>`**, nicht der blanke
Handle. Jeder Vergleich mit einem gespeicherten Handle traf deshalb nie.
Betroffen an vier Stellen: der Problem-Finder blieb vollstaendig leer, obwohl
alle Daten stimmten; der Verweis „Ausfuehrlich" im Lexikon fehlte; und beide
kuratierten Verweise im Artikeltemplate fielen still auf die Tag-Ableitung
zurueck. Behoben mit `split: '/' | last`.

**3. Metaobjekte haben kein `.handle`, nur `.system.handle`.** Der Rueckfall im
Lexikon-Snippet verglich dadurch nil mit nil und lieferte immer den ersten
Eintrag — auf der Seite stand 16 Mal „Fixierung".

**4. Die Sortierung im Lexikon** baute Schluessel `<Rang>||<Begriff>||<Index>` und
holte den Eintrag ueber den Index zurueck. Der Rueckgriff griff nicht. Ersetzt
durch zwei schlichte Schleifen.

**5. `lang` war als `rich_text_field` angelegt**, das Payload-Skript liefert aber
Fliesstext und das Snippet rendert ihn in einem Absatz. Shopify wies zwei
Eintraege zurueck. Feldtyp auf `multi_line_text_field` korrigiert.

## Zweiter Durchlauf mit echten Daten

Nachdem die Metaobjekte (`tp_lexikon`, `tp_bodenproblem`) und die beiden neuen
Artikel-Metafelder im Shop angelegt waren:

| Gegenstand | Beleg |
|---|---|
| Bodenlexikon | 16 verschiedene Begriffe in vier Gruppen in der vorgesehenen Reihenfolge, Anker je Begriff, zwei Verweise auf ausfuehrliche Artikel. |
| Problem-Finder | 6 Symptome, drei verschiedene Ziel-Artikel, vier Profi-Hinweise. Die 15 Eintraege ohne Ziel erscheinen nicht — die Regel greift. |
| Kuratierte Verweise | „Als Naechstes: Rollenbreite waehlen und Bahnen planen" erscheint; der so verlinkte Artikel taucht in „Weitere Beitraege" korrekt **nicht** noch einmal auf. |

## Dritter Durchlauf: Produktseite und Handy

| Gegenstand | Beleg |
|---|---|
| Lexikon auf der Produktseite | `/products/kontura-teppichboden`: Drei der fuenf Zeilen tragen einen Aufklapper mit dem richtigen Text — Rueckenausstattung, Florhoehe, Poleneinsatzgewicht. Die Zeilen ohne passenden Begriff (Fasermaterial, Zimmer) bleiben unveraendert. |
| Kein Begriff, keine Aenderung | Auf `/products/piumera-teppich-nach-mass` (Teppich nach Mass, andere Kennwerte) erscheint kein leerer Aufklapper. |
| Handy, Rechner (375 px) | Kein horizontaler Ueberlauf, Eingabefelder und Knopf 52–54 px hoch, Ergebnis als Karten. Rechnung 400 × 620 cm → 400er-Rolle empfohlen, 25,60 m², Verschnitt 3,2 %. |
| Handy, Lexikon (375 px) | 16 Eintraege und 16 Sprungmarken, kein horizontaler Ueberlauf. |

## Nicht geprueft, weil noch nicht moeglich

- **Die drei Seiten unter ihrer echten URL.** Geprueft wurde ueber `?view=` auf
  `/pages/ratgeber`; die Seiten selbst gibt es im Shop erst nach dem Deploy —
  vorher wuerden sie auf das Standard-Template fallen (Regel vom 2026-09-21).
- **Lighthouse und Core Web Vitals.** Sinnvoll erst auf dem Preview-Theme.
- **Die vier neuen Bereiche** (Teppiche, Vinyl, Untergrund): Blogs existieren noch nicht.
