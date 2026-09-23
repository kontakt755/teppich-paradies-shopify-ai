# Audit: Was vor dem Bodenwissen-Ausbau bereits existiert

Stand 2026-09-23 · Aufgabe #505 · Grundlage `origin/main` (211c70f) und Live-Shop.

Zweck dieser Datei: festhalten, was **nicht neu gebaut werden darf**, und die
echten Luecken benennen. Keine vollstaendige Shop-Dokumentation — nur was den
Ratgeber betrifft.

## 1. Der Ratgeber existiert bereits und ist live

Seit 2026-09-21 (Aufgabe #422) laeuft ein Ratgeber-System im Shop. Es ist kein
Prototyp: Seiten liefern 200, Artikel stehen in `sitemap_blogs_1.xml`, der
Menuepunkt haengt unter „Service & Verlegung".

| Bestandteil | Ort | Zustand |
|---|---|---|
| Uebersichtsseite | `/pages/ratgeber` (Suffix `ratgeber-start`) | live, H1 „Ratgeber" |
| Bereichsseite | `/blogs/ratgeber-teppichboden` (Suffix `ratgeber`) | live, 4 Themengruppen |
| Artikel | `/blogs/ratgeber-teppichboden/<handle>` (Suffix `ratgeber`) | 5 veroeffentlicht |
| Artikel-Metafelder | Namespace `ratgeber` | 19 Definitionen angelegt |
| Quelltexte | `content/ratgeber/teppichboden/<handle>.{json,html}` | 5 Artikel, Status `freigegeben` |
| Redaktions-Gate | `scripts/ratgeber-payload.mjs` + `qa/tests/ratgeber-payload.test.mjs` | sperrt ungepruefte Artikel |
| Architekturdoku | `docs/ratgeber/README.md` | ausfuehrlich, gilt weiter |

Theme-Dateien: `sections/tp-ratgeber-{hub,bereiche,beitrag}.liquid`,
`snippets/tp-ratgeber-{karte,inhalt,breadcrumb,structured-data}.liquid`,
`assets/tp-ratgeber-beitrag.css`, drei Templates.

**Qualitaet:** hoch. Die Dateien tragen `{% doc %}`-Kopfe, sind mobil zuerst
gebaut (Karten werden auf dem Handy zur kompakten Zeile), haben sichtbaren
Fokus, echte HTML-Links statt JS-Events, `loading="eager"` nur fuer die ersten
beiden Karten. Das ist die Messlatte fuer alles Neue.

## 2. Entscheidungen, die schon gefallen sind

Diese stehen nicht zur Disposition — sie waren bewusst und sind begruendet:

- **Blog statt Seiten** (Inhaber, 2026-09-21). Ein Blog je Bodenbereich, ein
  Template fuer alle Artikel, Inhalte aus Artikel-Metafeldern. Der konkurrierende
  Seiten-Aufbau aus PR #424 wurde verworfen, weil jede Seite eine eigene
  Template-Datei gebraucht haette.
- **Kein `HowTo`-Schema** (Google zeigt seit 2023 keine Rich Results dafuer).
- **Kein `FAQPage`-Schema** (nur noch fuer Behoerden-/Gesundheitsseiten).
- **Kein `AggregateRating`** aus eingebundenen Fremdbewertungen.
- **Kein Schema ohne sichtbaren Inhalt, der ihn traegt.**
- **Ungeprueftes wird gestrichen, nicht vermutet.** Am 2026-09-21 hat der Inhaber
  entschieden, alle 71 unbestaetigten Fachaussagen aus den Pilotartikeln zu
  entfernen statt sie zu veroeffentlichen. Die Fragen liegen als Ausbauliste in
  `content/ratgeber/teppichboden/README.md`.

Der Masterauftrag deckt sich mit allen fuenf Punkten. Sie werden uebernommen.

## 3. Technischer SEO-Stand (Crawl 2026-09-21, weiterhin gueltig)

In Ordnung: `lang="de"`, Canonicals korrekt, Paginierung selbstreferenzierend,
JSON-LD fehlerfrei, TTFB ~0,1 s, `robots.txt` offen fuer alle Crawler inkl.
KI-Anbieter, `sitemap.xml` vollstaendig, `llms.txt`/`agents.md` von Shopify.
`WebSite`- und `Organization`-Schema seit #439 live. Brotkrumen seit #422 auf
Kollektions- und Inhaltsseiten (`snippets/tp-breadcrumb.liquid`).

Offen aus dem alten Befund, weiterhin relevant fuer den Ratgeber:
- `/pages/uber-uns` ist verwaist und steht auf Stand 2024. Die Firmenbox im
  Artikel verlinkt dorthin — ein Vertrauenssignal, das derzeit ins Leere zeigt.
- Leerer Blog „News" steht in der Sitemap; darin liegt ein unveroeffentlichter
  `technischer-testartikel-ratgeber` aus dem Livegang.

## 4. Was fuer den Kauftrichter schon misst

`snippets/tp-funnel-events.liquid` (eingebunden in `layout/theme.liquid`) sendet
an `Shopify.analytics.publish` und `window.dataLayer`, darunter bereits
`tp_ratgeber_cta_klick` mit `ziel` und `cta_typ`. Lead-Ereignisse stehen in
`tp-lead-events.liquid`. Dokumentation: `docs/kundenbindung/funnel-events.md`.

**Offen:** Die GA4-Property existiert noch nicht — die Anleitung fuer den Inhaber
liegt fertig in `docs/kundenbindung/ga4-anlegen.md`, die Mess-ID fehlt. Ohne sie
laufen die Ereignisse nur in Shopify auf.

## 5. Die echten Luecken

Gemessen am Masterauftrag, nach Wirkung sortiert.

| # | Luecke | Befund |
|---|---|---|
| L1 | **Artikel sind ueber die Shop-Suche nicht auffindbar** | Header- und Sofortsuche fragen `type=product,collection,page`. Artikel fehlen in der Ergebnisliste und im Link „alle Ergebnisse". Wer im Shop „teppichboden ausmessen" sucht, findet den Artikel dazu nicht. |
| L2 | Nur **ein** Bereich (Teppichboden), 5 Artikel | Vinylboden steht als Karte „In Vorbereitung" auf `/pages/ratgeber`. Teppiche, Reinigung, PVC, Untergrund, Messen, Probleme fehlen ganz. |
| L3 | Kein **Bodenlexikon** | Fachbegriffe (Nutzungsklasse, Florhoehe, Polgewicht, Schlinge …) stehen unerklaert auf Produktseiten. |
| L4 | Kein **Problem-Finder** | Problemorientierte Suchanfragen („Teppichboden wirft Wellen") haben keinen Einstieg. |
| L5 | Keine **Rechner im Ratgeber** | Rollenware- und Massteppich-Rechner sitzen ausschliesslich an der Produktseite (`snippets/tp-rollware-rechner.liquid`, `assets/tp-masstepich-rechnung.js`). |
| L6 | **Redaktionsmodell zu duenn** | Die Artikel-JSON kennt Titel, Tags, SEO, Metafelder, Status. Es fehlen Cluster, Parent, Suchintention, verwandte Artikel, Quellen, Bildbedarf, Pruefzyklus — also alles, was Kannibalisierung und Aktualisierung steuerbar macht. |
| L7 | **Keine Kannibalisierungspruefung** | Nichts verhindert zwei Artikel zur selben Nutzerfrage. |
| L8 | **Interne Verlinkung nur handgeschrieben** | Links stehen im Artikel-HTML. Keine Beziehungstypen, keine Gegenpruefung auf tote oder fehlende Verweise. |
| L9 | **Kein Backlog** | Die naechste Welle steht als 4-zeilige Tabelle in `docs/ratgeber/README.md`. |
| L10 | **Keine Messung je Artikel** | Kein Search-Console-Zugang im Repo, kein Ratgeber-Bereich im Dashboard. |
| L11 | Name **„Bodenwissen" fehlt** | Der Bereich heisst ueberall schlicht „Ratgeber". |
| L12 | **Praxiswissen unsichtbar** | Kein Modul fuer „Aus unserer Praxis", Praxisfaelle oder Praxistests; `tp_projekt`-Metaobjekte („Unsere Arbeit") sind mit dem Ratgeber nicht verbunden. |

## 6. Was daraus folgt

Der Masterauftrag beschreibt weitgehend ein System, dessen **Fundament steht**.
Neu gebaut wird nichts davon. Der Ausbau setzt an fuenf Stellen an:

1. **Auffindbarkeit** (L1) — der billigste und groesste Hebel, weil die Inhalte
   schon da sind.
2. **Redaktionsmodell** (L6–L9) — muss vor der naechsten Artikelwelle stehen,
   sonst entsteht genau der Textfriedhof, den der Auftrag verbietet.
3. **Neue Einstiege** (L3–L5) — Lexikon, Problem-Finder, Rechner.
4. **Inhalt in die Breite** (L2, L12) — weitere Bereiche, Praxiswissen.
5. **Messung** (L10) — erst danach sinnvoll, vorher gibt es nichts zu messen.

Die Reihenfolge steht in `ARCHITECTURE.md`, Abschnitt „Reihenfolge".
