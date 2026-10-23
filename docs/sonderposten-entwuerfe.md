# Restposten als Raummaß und Kettelteppich vorbereiten

## Ein physisches Stueck, ein Bestand

Jede zusammenhaengende Restrolle bekommt eine eigene Rollenquelle. Zwei
getrennte Stuecke derselben Qualitaet duerfen nicht als eine durchgehende
Laenge gefuehrt werden. Raummaß und Kettelteppich greifen auf dieselbe Quelle
zu; die Angebotsprodukte haben keinen zweiten physischen Bestand.

Ein vorbereiteter Kassenartikel bestaetigt noch kein gemessenes Reststueck.
Der Pilotplan legt deshalb pro vorbereiteter Position vier **DRAFTs** an:

- Rollenquelle: 1 m², tracked, DENY, Bestand 0.
- Versteckter Rollenzuschnitt: native Bundle-Varianten, je eine positive
  Preiseinheit; jede Variante verbraucht eine feste Menge derselben Quelle.
- Raummaß-Angebot: vorhandener Maßrechner, Rechteck, ohne Kettelzeile.
- Kettelteppich-Angebot: derselbe Materialpreisweg plus vorhandener Kettelservice.

Bei 4 m Nennbreite entspricht eine Quelleinheit 25 cm Rollenlaenge,
bei 5 m sind es 20 cm. Das vorbereitete Raster deckt bis 1000 cm ab;
es behauptet weder eine vorhandene Restlaenge noch eine fertige Maßfreigabe.

## Sperren und Preise

Neue Angebote tragen `custom.rollenzuschnitt_richtung = laengs`: die
eingegebene Breite liegt quer zur Rolle, die Laenge folgt der Rollenrichtung.
Es gibt keine automatische Drehung. Der bestehende Altweg bleibt unveraendert.

Die eigene Maximalbreite und -laenge starten bei 0. Die Variantenfreigabe
`service.einfassen = Verfügbar` wird nicht gesetzt. Neben der Freigabe prueft
`tp-restrolle-freigegeben` unter anderem positive eigene Grenzen, genau eine
passende Rollenquelle, deren Shopify-Bestandsfuehrung/DENY, positiven Bestand
und ein verfuegbares, positiv bepreistes Zuschnitt-Bundle.

Preisentscheidung des Inhabers vom 23.10.2026:

- Materialgrundpreis: Kassenpreis je m² + 5 EUR, centgenau.
- Wunschmaßpreis: Materialgrundpreis × 1,35, auf volle EUR/m² gerundet.
- Abrechnung im vorhandenen Format je 0,01 m². Eine Einheit kommt ueber den
  Rollenzuschnitt, die Hauptzeile enthaelt entsprechend eine Einheit weniger.
- Kettelung bleibt beim bestehenden Kettelservice; keine erfundenen
  Vergleichspreise, neuen Mindestpreise oder Versandkosten.

Bestellpruefung und interne Mail beruecksichtigen die feste Richtung und
pruefen verschiedene Rollenquellen getrennt. Ein Mehrabgang aus Rolle B
darf keinen fehlenden Abgang aus Rolle A verdecken.

## Lokaler Entwurfsplaner

`operations/restposten-entwurf.mjs` schreibt ausschliesslich private lokale
Plan-/Rollbackdateien, niemals direkt in Shopify. Eingabe, Plan, API-Resultate
und Readbacks bleiben ausserhalb des Repositorys. Die Neuanlage erfolgt ueber
den bereits angemeldeten Shopify-MCP nach Schema-/Operationspruefung.

Vor `productSet` alle geplanten Handles im Shop abgleichen und bereits
vorhandene Entwuerfe wiederverwenden. `productSet` nicht auf bestehende
Produkte anwenden. Neue Produkte und Varianten nach der Anlage zuruecklesen.
`bindeRestPlan` akzeptiert nur vollstaendige, unveroeffentlichte DRAFTs ohne
Bestand, mit passenden Preisen und Bestandsregeln. Vorhandene identische
Metafelder/Komponenten werden uebersprungen; Abweichungen brechen ab.
Fehlende Metafelder werden mit `compareDigest: null` geplant.

Der abschliessende `--snapshot <frischer Readback> --verify`-Lauf vergleicht
Preise, Bestandsvertrag, Referenzen und jede native Bundle-Komponente.
Erst die erfolgreiche Gegenprobe ergibt `write-log.json`; eine leere
`userErrors`-Liste genuegt nicht.

## Vor einer spaeteren Veroeffentlichung

1. Tatsaechliche Stuecke einzeln kennzeichnen, Nutzbreite/Restlaenge messen,
   Zustand und Artikelzuordnung bestaetigen. Nennbreite ist keine Nutzbreite.
2. Bilder und Versand-/Packdaten sowie Bearbeitungszeit ergaenzen. Fuer
   abweichende Nutzbreiten auch Quell- und Komponentenvertrag neu pruefen.
3. Echten Bestand ueber die vorhandene sichere Restlaengen-Inventur erfassen;
   eigene Maßgrenzen passend zur Quelle setzen und gezielt freigeben.
4. Bestellmix aus Raummaß, Kettelteppich und unterschiedlichen Quellen sowie
   Storno vor/nach Zuschnitt abnehmen. Die interne Mailvorlage muss den
   geaenderten Block enthalten, bevor gerichtete Angebote aktiviert werden.
5. Erst dann gezielt die erforderlichen Kanaele/Status aktivieren und den
   oeffentlichen Kaufweg pruefen. Keine pauschale Massenveroeffentlichung.

Solange SumUp nicht nachweislich verbunden ist, bleibt der bestehende
Ladenabzug im Control Center vor Zusage, Zahlung und Zuschnitt erforderlich.

## Viele Reste einfach aufnehmen

Die bestehende Sonderposten-Seite bietet Suche, Ladenabzug und Restinventur.
Ein spaeterer kleiner Aufnahme-Dialog sollte diese Quelle wiederverwenden:
Artikel/Vorlage waehlen, Einzelstueckmaße, Zustand und Lagerplatz erfassen,
als gesperrten Entwurf speichern; danach Inhaberfreigabe. „Naechstes Stueck
gleicher Ware“ kopiert Stammdaten, keine Restlaenge oder Bestaende.

Kleine Stuecke koennen als feste komplette Maße angeboten werden; groessere
Rollen erhalten Raummaß/Kettelwahl. Eine Kennung und ein QR-Aufkleber je
Stueck erleichtern Finden, Nachmessen und Buchen. Der Pilotplaner ersetzt
noch kein Aufnahmeformular oder eine automatische SumUp-Anbindung.
