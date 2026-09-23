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

**Shopify lehnte `blocks/tp-produktinfo-tabelle.liquid` ab:** „Nested doc tags
are not allowed". `liquid:guard` und `schema:guard` waren gruen; nur das
Push-JSON zeigte es. Ursache: In zwei Kommentaren stand die Zeichenfolge
`{% doc %}` als Verweis („siehe {% doc %} oben") — der Parser sieht dort ein
echtes Tag. Ohne diesen Push waere die Datei still verworfen worden und die
technischen Daten waeren von der Produktseite verschwunden.

`liquid:guard` prueft seither die Balance der doc-Tags (`DOC_UNBALANCED`).
Gegenprobe: mit dem Fehlerbild meldet er die richtige Zeile, ohne es laufen alle
411 Dateien gruen.

## Nicht geprueft, weil noch nicht moeglich

- **Lexikon und Problem-Finder mit Inhalt.** Beide brauchen ihre Metaobjekte im
  Shop. Geprueft ist nur, dass die Seiten ohne sie sauber leer bleiben.
- **Lexikon auf der Produktseite.** Dasselbe: ohne `tp_lexikon` aendert sich an
  der Tabelle nichts. Belegt ist, dass sie unveraendert rendert.
- **Kuratierte Verweise im Artikel.** Braucht die beiden neuen Metafelder.
- **Mobile Darstellung und Lighthouse.** Steht aus; die Sections sind mobil
  zuerst gebaut, aber nicht auf einem Geraet gemessen.

Diese vier gehoeren in den Durchlauf **nach** dem Deploy, wenn die Shopify-
Objekte stehen. Die Reihenfolge steht in `README.md`, Abschnitt „Stand".
