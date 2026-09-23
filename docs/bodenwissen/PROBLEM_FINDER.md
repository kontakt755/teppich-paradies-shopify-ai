# Problem-Finder

Stand 2026-09-23 · Aufgabe #505, Paket C. Grundlage aus `ARCHITECTURE.md`,
Abschnitt 4.3, und `CONTENT_MODEL.md`, Abschnitt 6. Dieses Dokument beschreibt
nur den Problem-Finder; das Redaktionsmodell des Ratgebers selbst steht in
`CONTENT_MODEL.md`.

## 1. Was hier entstanden ist

| Datei | Zweck |
|---|---|
| `content/probleme/<handle>.json` | Quelltexte, 21 Eintraege |
| `sections/tp-bodenprobleme.liquid` | Rendert Metaobjekt `tp_bodenproblem`, gruppiert nach Belag |
| `templates/page.bodenwissen-probleme.json` | Bindet die Section auf `/pages/bodenwissen-probleme` ein |
| `scripts/probleme-payload.mjs` | Baut `metaobjectCreate`-Eingaben, sperrt ungueltige Eintraege |
| `qa/tests/probleme-payload.test.mjs` | Testet die Sperre, insbesondere ohne Ziel-Artikel |

Es wurde **kein** Metaobjekt in Shopify angelegt und **kein** Schreibzugriff
verwendet. Alles hier ist Repository-Grundlage; das Anlegen der Metaobjekte
ist ein eigener, spaeterer Schritt mit MCP-Zugriff.

## 2. Felder

Genau wie in `CONTENT_MODEL.md`, Abschnitt 6, plus zwei Repo-Felder, die nicht
ins Metaobjekt gehen:

| Feld | Repo oder Metaobjekt | Bedeutung |
|---|---|---|
| `handle` | nur Repo | Dateiname ohne `.json`, zugleich Metaobjekt-Handle |
| `symptom` | Metaobjekt | wie der Kunde es beschreibt, z. B. „Der Teppichboden wirft Wellen“ |
| `belag` | Metaobjekt | Teppichboden · Teppich · Vinyl · PVC |
| `ursachen` | Metaobjekt (Textliste) | moegliche Ursachen, keine Diagnose - bei mehreren moeglichen Ursachen werden alle genannt |
| `artikel` | Metaobjekt | Handle des Ziel-Artikels - **Pflichtfeld fuer die Anzeige** |
| `profi_noetig` | Metaobjekt (Boolean) | steuert den Hinweis „Das gehoert in Fachhaende“ |
| `status` | nur Repo | `idee` (Backlog, kein Ziel) oder `freigegeben` (hat ein Ziel, darf angelegt werden) |

`status` ist bewusst nur zweiwertig, anders als der siebenstufige Statusfluss
der Ratgeber-Artikel (`CONTENT_MODEL.md`, Abschnitt 3): Ein Problem-Eintrag
braucht keine Redaktionsstufen wie „seo_pruefung“ oder „fachpruefung“, weil er
selbst keinen Text schreibt, sondern nur auf einen bereits geprueften Artikel
zeigt. Die inhaltliche Pruefung passiert am Ziel-Artikel, nicht am Eintrag.

## 3. Die entscheidende Regel und warum sie zweimal steht

**Ein Problem erscheint nur, wenn `artikel` auf einen echten Ratgeber-Artikel
zeigt, der selbst `freigegeben` oder `veroeffentlicht` ist.** Ohne Ziel bleibt
der Eintrag unsichtbar und steht im Backlog (`status: idee`, `artikel: ""`).

Begruendung: Ein Problem-Finder, der ein Symptom zeigt, aber keine Antwort
liefern kann, waere schlimmer als gar keiner - er wuerde Vertrauen kosten,
genau wie eine Sackgasse oder eine erfundene Antwort. Lieber 21 Symptome
sammeln und nur 6 davon zeigen, als bei allen 21 irgendeinen Text erfinden.

Die Regel ist **doppelt eingebaut**, an zwei unabhaengigen Stellen:

1. **`scripts/probleme-payload.mjs`, `pruefeFreigabe()`.** Sperrt jeden
   Eintrag ohne `artikel`, dessen `artikel`-Handle nicht unter einem
   freigegebenen oder veroeffentlichten Artikel in `content/ratgeber/*/*.json`
   auftaucht, ohne `status: "freigegeben"`, ohne `symptom`, ohne `ursachen`
   oder mit einem `belag` ausserhalb der vier erlaubten Werte. Betroffene
   Eintraege landen im `gesperrt`-Teil der Ausgabe, nie im `bereit`-Teil.
2. **`sections/tp-bodenprobleme.liquid`.** Sucht fuer jeden Eintrag mit
   gesetztem `artikel`-Feld ueber alle Blogs hinweg nach einem Artikel mit
   genau diesem Handle. Findet sich keiner - weil das Metaobjekt-Feld leer
   ist, der Artikel nicht existiert oder (noch) nicht veroeffentlicht ist -,
   wird die Karte beim Rendern mit `continue` uebersprungen. Eine Belag-Gruppe
   ohne sichtbaren Eintrag wird gar nicht erst ausgegeben.

Die zweite Sperre ist kein Duplikat der ersten, sondern ein eigenstaendiges
Netz: Sie greift auch dann noch, wenn ein Metaobjekt direkt im Shopify-Admin
angelegt oder geaendert wird, ohne durch das Payload-Skript zu laufen - zum
Beispiel wenn jemand von Hand ein `artikel`-Feld leert oder ein referenzierter
Artikel spaeter zurueckgezogen wird. Ohne diese zweite Sperre koennte eine
Aenderung im Admin an der Skript-Pruefung vorbei eine Sackgasse erzeugen.

## 4. Warum die meisten Eintraege noch kein Ziel haben

Es gibt bisher nur fuenf Ratgeber-Artikel, alle im Bereich Teppichboden
(`content/ratgeber/teppichboden/`). Die Bereiche Teppich, Vinyl und PVC haben
noch keinen einzigen Artikel (`ARCHITECTURE.md`, Abschnitt 2: „geplant“).
Jedes Problem in diesen drei Beleagen bleibt deshalb zwangslaeufig ohne Ziel,
bis dort Artikel entstehen - das ist keine Luecke im Problem-Finder, sondern
eine Abbildung des tatsaechlichen Redaktionsstands.

## 5. Angelegte Probleme

6 von 21 Eintraegen haben bereits ein Ziel und sind `freigegeben`; 15 stehen
im Backlog (`status: idee`). Zeilen ohne Ziel sind der Content-Bedarf.

| Belag | Symptom | Ziel vorhanden | Ziel-Artikel |
|---|---|---|---|
| Teppichboden | Der Teppichboden wirft Wellen | ja | Teppichboden verlegen: lose, fixiert oder vollflächig verklebt? |
| Teppichboden | Flecken im Teppichboden | ja | Teppichboden pflegen und Flecken entfernen: Was wirklich hilft |
| Teppichboden | Der Flor wirkt je nach Stelle im Raum heller oder dunkler | ja | Rollenbreite wählen und Bahnen planen: 400 oder 500 cm? |
| Teppichboden | Die Naht zwischen zwei Bahnen ist deutlich sichtbar | ja | Rollenbreite wählen und Bahnen planen: 400 oder 500 cm? |
| Teppichboden | Unebenheiten des Untergrunds zeichnen sich durch den Teppichboden ab | ja | Teppichboden verlegen: lose, fixiert oder vollflächig verklebt? |
| Teppichboden | Ausgeblichene oder verfärbte Stellen im Teppichboden | ja | Teppichboden pflegen und Flecken entfernen: Was wirklich hilft |
| Teppichboden | Der Teppichboden riecht, auch nach dem Reinigen | **nein** | - |
| Teppich | Ecken oder Kanten des Teppichs rollen sich hoch | **nein** | - |
| Teppich | Druckstellen von Möbeln bleiben im Teppich stehen | **nein** | - |
| Teppich | Tierhaare lassen sich aus dem Teppich kaum entfernen | **nein** | - |
| Teppich | Der Teppich riecht unangenehm | **nein** | - |
| Teppich | Verfärbte oder ausgeblichene Stellen im Teppich | **nein** | - |
| Vinyl | Blasen unter dem Vinylboden | **nein** | - |
| Vinyl | Fugen zwischen den Vinylelementen gehen auf | **nein** | - |
| Vinyl | Kanten oder Ecken des Vinylbodens heben sich | **nein** | - |
| Vinyl | Kratzer in der Nutzschicht des Vinylbodens | **nein** | - |
| Vinyl | Der Vinylboden knackt beim Begehen | **nein** | - |
| PVC | Alte Fliesenfugen zeichnen sich durch den PVC-Boden ab | **nein** | - |
| PVC | Blasen im PVC-Boden | **nein** | - |
| PVC | Der PVC-Boden vergilbt oder verfärbt sich | **nein** | - |
| PVC | Der PVC-Boden liegt uneben oder wellig | **nein** | - |

Die drei Treffer im Bereich Teppichboden, die auf denselben Artikel zielen
(„Rollenbreite waehlen und Bahnen planen“ bzw. „Teppichboden verlegen“), sind
kein Fehler: Ein Ziel-Artikel darf mehrere Probleme beantworten, solange er
sie inhaltlich wirklich abdeckt. Jede Zuordnung wurde am tatsaechlichen
Artikeltext geprueft, nicht an Titel oder Thema erraten - siehe Belegstellen
unten.

### Belegstellen der sechs Zuordnungen

- **Wellen** → „Teppichboden verlegen“ nennt woertlich: „kann ein lose
  liegender Belag Wellen werfen“.
- **Flecken** → „Teppichboden pflegen und Flecken entfernen“ behandelt genau
  dieses Thema als Hauptinhalt.
- **Flor liegt unterschiedlich** → „Rollenbreite waehlen und Bahnen planen“,
  Abschnitt „Florrichtung: alle Bahnen laufen gleich“, erklaert exakt dieses
  Symptom und seine Ursache.
- **Sichtbare Naht** → derselbe Artikel behandelt Rollenbreite, Nahtlage und
  Chargenunterschiede ausfuehrlich.
- **Boden ist uneben** → „Teppichboden verlegen“ nennt woertlich:
  „Unebenheiten zeichnen sich durch den Teppichboden ab und muessen vorher
  ausgeglichen werden“.
- **Verfaerbung** → „Teppichboden pflegen und Flecken entfernen“ nennt
  ausgeblichene Stellen durch Sonne oder falsches Mittel als eigenen Fall.

Bewusst **nicht** zugeordnet: „Geruch“ (der Pflege-Artikel erwaehnt
wiederkehrenden Geruch nur als eines von mehreren Signalen fuer einen
Austausch, behandelt aber keine Ursachen oder Abhilfe - das reicht nicht als
echtes Ziel) sowie alle Symptome bei Teppich, Vinyl und PVC (kein Artikel
vorhanden).

## 6. Fehlende Artikel, die am dringendsten waeren

Nach Anzahl der wartenden Probleme und praktischer Haeufigkeit:

1. **Ein Pflege-/Reinigungsartikel fuer Teppich (lose Ware).** Deckt auf
   einen Schlag Druckstellen, Tierhaare, Geruch und Verfaerbung ab - vier der
   fuenf offenen Teppich-Probleme.
2. **Ein Verlege-/Untergrundartikel fuer Vinyl** (Blasen, Fugen, Kanten,
   Knacken) - deckt vier der fuenf offenen Vinyl-Probleme, analog zum
   bestehenden „Teppichboden verlegen“.
3. **Ein Artikel zu PVC auf altem Fliesenboden** (Fliesenfugen zeichnen sich
   ab, Unebenheiten, Blasen) - drei der vier offenen PVC-Probleme und ein
   Thema, zu dem im Shop bislang gar nichts existiert.

## 7. Rendering-Grenzen, die dokumentiert gehoeren

- `shop.metaobjects.tp_bodenproblem.values` wird wie in
  `sections/tp-arbeiten-galerie.liquid` per `paginate ... by 250` ueber die
  50er-Grenze gehoben.
- Die Aufloesung von `artikel` (ein reiner Handle-String, keine
  Artikel-Referenz) durchsucht alle Blogs, aber **ohne** `paginate` auf
  `blog.articles`. Das reicht bis 50 Artikel je Blog; waechst ein Bereich
  darueber hinaus, muss die Section ergaenzt werden (Kommentar im Kopf der
  Datei verweist darauf).
