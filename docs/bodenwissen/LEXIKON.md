# Bodenlexikon

Stand 2026-09-23 · Aufgabe #505, Paket B. Zielarchitektur: `ARCHITECTURE.md`,
Abschnitt 4.2. Datenmodell: `CONTENT_MODEL.md`, Abschnitt 6. Diese Datei baut
nur das Fundament - im Shop existiert weder das Metaobjekt `tp_lexikon` noch
ein Eintrag; dafuer braucht es eine eigene Sitzung mit Shopify-Schreibzugriff.

## Wo die Daten liegen

```
content/lexikon/<handle>.json     Quelltext, im Repo - dieser Ordner
sections/tp-lexikon.liquid        Seite /pages/bodenlexikon: alle Eintraege, gruppiert
snippets/tp-lexikon-eintrag.liquid  Ein Begriff einzeln - inline (Produktseite) oder voll (Lexikonseite)
templates/page.bodenwissen-lexikon.json  Seitentemplate, bindet tp-lexikon ein
scripts/lexikon-payload.mjs       baut die metaobjectCreate-Eingabe, schreibt nichts in den Shop
```

Traeger im Shop ist ein Metaobjekt `tp_lexikon` (noch nicht angelegt), nicht
Blog oder Seite je Begriff - Begruendung in `ARCHITECTURE.md`, Abschnitt 4.2.

## Felder je Eintrag

| Feld | Pflicht | Zweck |
|---|---|---|
| `handle` | ja | Handle des Metaobjekts, zugleich Dateiname und `id`-Anker auf der Lexikonseite |
| `begriff` | ja | Anzeigename, z. B. „Nutzungsklasse" |
| `kurz` | ja | 1-3 Saetze, muss fuer sich alleine stehen - keine erfundenen Zahlen, Normen oder Herstellerangaben |
| `lang` | nein | laengere Erklaerung, nur auf der Lexikonseite sichtbar; leer lassen statt zu raten |
| `gruppe` | ja | eine von `Teppichboden`, `Vinyl`, `Untergrund`, `Allgemein` |
| `synonyme` | nein | Liste, fuer die Suche |
| `artikel` | nein | Handle eines Ratgeber-Artikels (siehe Beforderungsregel unten) |
| `status` | ja | `freigegeben` schaltet den Eintrag im Payload-Skript frei, jeder andere Wert sperrt |
| `expert_input` | nein | Liste offener Fachfragen - siehe unten |

`lang`, `synonyme` und `artikel` fehlen einfach, wenn sie nicht gebraucht
werden; `scripts/lexikon-payload.mjs` legt dafuer kein leeres Feld an.

## Wie ein Eintrag entsteht

1. Datei `content/lexikon/<handle>.json` anlegen, Felder wie oben befuellen.
2. `kurz` sachlich und kurz halten. Ist eine Angabe (Wert, Norm, Metafeld-Name)
   nicht sicher belegt, bleibt `kurz` bewusst allgemein und die offene Frage
   kommt in `expert_input` - nicht raten, nicht erfinden.
3. `node --test qa/tests/lexikon-payload.test.mjs` laufen lassen - prueft unter
   anderem, dass Dateiname und `handle` uebereinstimmen und kein Handle doppelt
   vergeben ist.
4. `node scripts/lexikon-payload.mjs` zeigt, ob der Eintrag bereit ist
   (`status: freigegeben`, `kurz` nicht leer, `gruppe` erlaubt, keine offene
   PRUEFEN-Marke). Das Skript schreibt nichts in den Shop.
5. Sobald das Metaobjekt `tp_lexikon` im Shop existiert, uebernimmt eine
   Sitzung mit Shopify-Schreibzugriff die `bereit`-Eintraege aus der
   Skript-Ausgabe per `metaobjectCreate` (Muster: `docs/ratgeber/README.md`,
   Abschnitt 9, fuer `articleCreate`).

## Beforderungsregel

Waechst ein Begriff ueber eine kurze Definition hinaus - er braucht Bilder,
Schritte, Beispiele, mehr als drei Saetze - wird er kein langes `lang`-Feld,
sondern ein richtiger Ratgeber-Artikel unter `content/ratgeber/<bereich>/`.
Der Lexikoneintrag bleibt kurz und bekommt im Feld `artikel` den Handle des
Artikels; die Seite zeigt dann „Ausfuehrlich: …". So entsteht keine Dublette
zwischen Lexikon und Ratgeber (`ARCHITECTURE.md`, Abschnitt 4.2).

Zwei der 16 Eintraege nutzen das bereits, weil passende Artikel im Repo
liegen: `rollenbreite` verweist auf `rollenbreite-und-bahnen-planen`,
`fixierung` auf `teppichboden-verlegen-lose-fixieren-oder-kleben`.

## Offene Fachauskuenfte

Aus den `expert_input`-Feldern der 16 Eintraege gesammelt - jeweils Fragen,
bei denen die Definition selbst richtig, eine genauere oder shopspezifische
Angabe aber nicht sicher belegt ist:

- **Nutzungsklasse**: welche Norm-Skala im Shop einheitlich genannt werden
  soll, und ob `custom.nutzungsklassen` alle vorkommenden Klassen abdeckt
  (laut `domains/shopify/linoleum-rollenware-template.md` bislang nur
  Klasse 21-33 und 42).
- **Polgewicht**: ob und unter welchem Feldnamen es im Shop je Produkt
  gepflegt wird - kein passendes Metafeld bekannt.
- **Trittschall**: ob und wo Werte je Produkt gepflegt werden - kein
  passendes Metafeld gefunden.
- **Stuhlrolleneignung**: bei welchen Produkten sie tatsaechlich angegeben
  ist - bislang nur ueber Beschreibungstexte erkennbar, kein Metafeld.
- **Fussbodenheizung**: fuer welche Produktgruppen ausser Linoleum eine
  belastbare Aussage vorliegt. Fuer Linoleum ist die Eignung laut
  `domains/shopify/linoleum-rollenware-template.md` bewusst als
  Materialklassen-Wissen ohne Metafeld dokumentiert; fuer Teppichboden und
  Vinyl ist das offen.

## Technischer Vorbehalt: Artikel-Verlinkung

`snippets/tp-lexikon-eintrag.liquid` loest das Feld `artikel` (nur ein
Artikel-Handle, keine Blog-Zuordnung) so auf: zuerst `metaobjects.tp_lexikon[handle]`
fuer die Einzelabfrage eines Begriffs, mit Ruckfall auf eine Suche in
`shop.metaobjects.tp_lexikon.values`; fuer den Artikel-Link wird ueber die vier
bekannten Bodenwissen-Blogs geloopt und nach passendem `article.handle`
gesucht. Beides ist in diesem Theme noch nicht an echten Shop-Daten erprobt
(das Metaobjekt existiert noch nicht, Storefront-Rendering ist aus dieser
Sitzung heraus nicht erreichbar - siehe `CLAUDE.md`, Abschnitt "In
Remote-Sessions"). Kein Treffer fuehrt in beiden Faellen zu stillem Weglassen,
nie zu einem Fehler - trotzdem sollte die erste Sitzung mit echtem Shop-Zugriff
das per Render-Test bestaetigen (`docs/lessons/reference_dev_theme_render_test.md`-Muster:
`shopify theme push --development` + Puppeteer), bevor die Seite beworben wird.

## Auf der Produktseite

Paket P2, Aufgabe #505. Traeger ist `blocks/tp-produktinfo-tabelle.liquid` -
die Tabelle der technischen Daten auf der Produktseite. Eine Zeile mit
passendem Lexikonbegriff bekommt ein zugeklapptes `<details>` in der
Wert-Zelle; aufgeklappt zeigt es die Kurzdefinition aus
`tp-lexikon-eintrag` im `modus: inline` (Kurztext plus Link "Im
Bodenlexikon nachlesen" auf den Anker der Lexikonseite). Die
Bezeichnung-Zelle bleibt unveraendert, es entsteht keine neue
Ueberschriftenebene und kein Pop-up.

### Warum `<details>` statt einer dauerhaft sichtbaren Zeile

Begriffe wie Nutzungsklasse oder Florhoehe stehen auf sehr vielen
Produktseiten. Eine immer sichtbare Erklaerungszeile je Begriff wuerde die
Tabelle genau so ueberladen, wie Abschnitt 18 des Auftrags es ausschliesst.
`<details>`/`<summary>` ist native HTML, tastaturbedienbar (Enter/Leertaste
auf dem fokussierten `<summary>`), zeigt einen sichtbaren Fokusrahmen und
bleibt standardmaessig zu - wer den Begriff schon kennt, sieht nur eine
kurze, unterstrichene Zeile mehr. `<details>` ist gueltiger Inhalt fuer
`<td>` (Flow Content), die Tabellenstruktur bleibt damit valide; eine
Definitionsliste war nicht noetig.

### Wie die Zuordnung funktioniert

Die Zeilen der Tabelle sind in `blocks/tp-produktinfo-tabelle.liquid` als
`Bezeichnung::metafeld::anzeigefeld` in `table_config` hinterlegt. Eine
zweite, davon unabhaengige Zuordnung `lexikon_zuordnung` (Format
`Bezeichnung::handle`) verbindet nur die Zeilen, deren Bezeichnung
eindeutig einem Lexikonbegriff entspricht, mit dem passenden Handle unter
`content/lexikon/`. Die Zuordnung ist bewusst manuell und unvollstaendig -
kein automatisches Ableiten aus dem Feldnamen, damit nichts geraten wird.
Aktuell zugeordnet: Florhoehe, Gesamtstaerke, Poleneinsatzgewicht,
Nutzungsklassen, Fussbodenheizung, Trittschallverbesserung und
Rueckenausstattung (-> `ruecken`).

Neue Zeile mit Lexikonbezug hinzufuegen:

1. Zeile wie gewohnt in `table_config` ergaenzen.
2. Passenden Eintrag unter `content/lexikon/<handle>.json` pruefen bzw.
   nach obigem Ablauf ("Wie ein Eintrag entsteht") anlegen.
3. In `lexikon_zuordnung` (`blocks/tp-produktinfo-tabelle.liquid`) die
   Zeile `Bezeichnung::handle` ergaenzen - die Bezeichnung muss exakt der
   `row_label`-Spalte aus `table_config` entsprechen.

### Solange das Metaobjekt `tp_lexikon` fehlt

`tp-lexikon-eintrag` findet dann zu jedem Handle keinen Eintrag und gibt
nichts aus (siehe Kommentar dort). Der Block faengt das ab, bevor er das
`<details>` ausgibt - keine leere Aufklappzeile, keine Fehlermeldung, die
Produktseite rendert exakt wie vorher. Sobald der Eintrag existiert,
erscheint die Erklaerung ohne weitere Theme-Aenderung.

## Was das noch nicht ist

- Das Metaobjekt `tp_lexikon` existiert im Shop noch nicht - diese Sitzung
  hatte keinen Shopify-Schreibzugriff und hat keins angelegt.
- Die Seite `/pages/bodenlexikon` und ihr Template sind vorbereitet, aber
  nicht deployed.
- `npm run bodenwissen:guard` (Kannibalisierung, Verweispruefung ueber das
  ganze Portal) ist aus `CONTENT_MODEL.md`, Abschnitt 7, beschrieben, aber
  nicht Teil dieses Pakets - `qa/tests/lexikon-payload.test.mjs` deckt nur
  das Lexikon selbst ab (Vollstaendigkeit, eindeutige Handles, dass jedes
  `artikel` auf eine vorhandene Datei zeigt).
