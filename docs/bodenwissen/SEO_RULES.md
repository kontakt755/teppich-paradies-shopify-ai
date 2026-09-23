# SEO-Regeln fuer Bodenwissen

Stand 2026-09-23. Der technische Stand des Shops steht in `AUDIT.md`, Abschnitt 3.
Hier stehen nur die Regeln, die beim Schreiben und Einbauen gelten.

## 1. Je Seite

- **Ein** `<h1>`. Bei Artikeln ist das der Artikeltitel — im HTML des Artikels
  darf keine weitere H1 stehen (`bodenwissen:guard` prueft das).
- Eindeutiger Title und eindeutige Description. Beide stehen in der Artikel-JSON
  unter `seo` und gehen als `global.title_tag` / `global.description_tag` mit.
- Canonical erzeugt Shopify. Kein Feld dafuer — ein gepflegtes Feld weicht ab,
  sobald es jemand vergisst.
- HTTP 200, indexierbar, in der Sitemap. Gegenprobe: `QA_CHECKLIST.md`.

## 2. Keine Keyword-Regeln

Es gibt keine Dichte, keine Mindestwortzahl, keine Vorgabe, wie oft ein Begriff
vorkommen soll. Ein Thema wird so ausfuehrlich behandelt, wie die Frage es
braucht. Der kuerzeste der fuenf Pilotartikel hat 668 Woerter und ist vollstaendig.

Synonyme kommen vor, weil man so spricht, nicht weil eine Liste es verlangt.

## 3. Verbotene Textmuster

Streichen, wo sie auftauchen:

- Einleitungen ohne Aussage („Seit Jahrhunderten…", „In der heutigen Zeit…",
  „Teppiche sind nicht nur Bodenbelaege, sondern…")
- Zusammenfassungen, die den Artikel wiederholen, ohne etwas hinzuzufuegen
- Fuellsaetze, die eine Frage ankuendigen, statt sie zu beantworten
- Aufzaehlungen ohne Inhalt („vielfaeltig", „hochwertig", „individuell")

Die Kurzantwort steht **vor** der Erklaerung, nicht danach.

## 4. Struktur fuer Antwortsysteme

Wo es passt: Frage als H2, direkte Antwort in zwei bis fuenf Saetzen, danach die
Details. Das hilft Lesern, Suchmaschinen und Antwortsystemen gleichermassen —
und es ist keine Optimierung, sondern gute Gliederung.

Keine „GEO-Hacks", keine erfundenen Spezialdateien, kein verstecktes Markup.
`llms.txt` und `agents.md` stellt Shopify selbst bereit; `robots.txt` laesst alle
Crawler einschliesslich der KI-Anbieter zu. Mehr ist nicht zu tun.

**Es gibt keine Garantie, dass ein KI-System den Shop nennt.** Wir sorgen nur
dafuer, dass die Inhalte klar, belegt und maschinenlesbar sind.

## 5. Strukturierte Daten

Ausgegeben wird, was `snippets/tp-ratgeber-structured-data.liquid` erzeugt:
`Article`, `BreadcrumbList`, `VideoObject` (nur mit vollstaendigen Videodaten).
Seitenweit bestehen `Organization`/`Store` und `WebSite`.

Nicht ausgegeben und nicht zu ergaenzen: `HowTo`, `FAQPage`, `QAPage`,
`AggregateRating` aus Fremdbewertungen. Begruendung: `AUDIT.md`, Abschnitt 2.

**Grundsatz: kein Schema-Typ ohne sichtbaren Inhalt, der ihn traegt.**

## 6. Indexierung

| Indexieren | Nicht indexieren |
|---|---|
| Ratgeber-Artikel | interne Suchergebnisse |
| Bereichsseiten (Blogs) | leere Filterkombinationen |
| Tag-Ansichten mit Artikeln | Tag-Ansichten ohne Artikel |
| Lexikonseite, Problem-Finder, Rechner | Vorschau- und Systemseiten |

Lexikonbegriffe bekommen **keine** eigene URL. Sie stehen als Anker auf einer
Seite. Sechzig Seiten mit je vierzig Woertern waeren duenne Seiten — genau das,
was hier nicht indexiert werden soll.

## 7. Kannibalisierung

Vor jedem neuen Artikel: Gibt es schon eine Seite zu dieser Nutzerfrage?

Das Gate prueft die harte Regel — **kein zweites Paar aus `begriff` und
`intent`**. Die weiche Regel prueft ein Mensch: Fuenf Formulierungen derselben
Frage („Teppich reinigen", „Teppich richtig reinigen", „Teppich sauber machen")
sind **ein** Artikel, nicht fuenf. Echte Unterthemen (Rotweinfleck, Wollteppich,
Tierurin) sind eigene Artikel.

Im Zweifel: bestehenden Artikel ausbauen.

## 8. Lokales trennen

Ratgeber wirken bundesweit. Kein „Teppich reinigen in Oranienburg" im
Ratgebertext. Lokale Leistung steht auf den Service-Seiten. Keine Stadtseiten
nach Muster mit ausgetauschtem Ortsnamen.
