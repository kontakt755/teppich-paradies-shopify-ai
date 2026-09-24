---
name: shopify-massendaten
description: Viele Produkt- oder Variantenfelder in Shopify auf einmal setzen (Metafelder wie einkauf.*, custom.*, Tags, Metaobjekt-Verweise) - Plan, Rollback, Batchdateien, Schreiben ueber den MCP und Gegenprobe. Verwenden, sobald mehr als etwa 50 Werte geschrieben werden sollen, bei Lieferanten- und Einkaufsdaten, bei technischen Produktdaten, und immer bevor jemand "userErrors ist leer, passt schon" sagt.
---

# Massendaten in Shopify schreiben

Ein Lauf ueber tausende Varianten ist kein groesserer Einzelschreibvorgang,
sondern ein eigenes Vorgehen: erst ein Plan, den ein Mensch lesen kann, dann
Pakete, dann das Schreiben, dann der **Beleg**. Ohne den letzten Schritt weiss
niemand, ob die Daten wirklich im Shop stehen.

## Die vier Dateien

Alles Lokale liegt unter `~/teppich-paradies-analyse/<vorhaben>/` – nie im
Repository, weil dort Lieferanten- und Kundendaten stehen (CLAUDE.md Punkt 8).

| Datei | Inhalt |
|---|---|
| `plan.json` | je Wert: ownerId, namespace, key, type, value **plus Quelle und Sicherheit** |
| `rollback.json` | der Wert, der vorher dort stand (meist `null`) |
| `batches/xNNN.gql` | fertige Mutationen, 8 aliasierte `metafieldsSet` je Datei, hoechstens 25 Metafelder je Aufruf |
| `write-log.json` | nach dem Lauf: Anzahl, Zeitpunkt, Ergebnis der Gegenprobe |

Dazu `offen.json`: was **nicht** geschrieben wird, mit Grund und naechstem
Schritt. Diese Datei ist so wichtig wie der Plan – sie verhindert, dass beim
naechsten Lauf wieder jemand dieselben Sackgassen abklappert.

## Ablauf

1. **Lesen, was schon da ist.** `bulkOperationRunQuery` (ein Lesevorgang, ueber
   den MCP erlaubt) exportiert alle Produkte/Varianten samt Metafeldern als
   JSONL. Achtung: Varianten- und Produkt-Metafelder haengen beide per
   `__parentId` am Elternobjekt – wer sie vermischt, schreibt Varianten-Werte
   auf Produkte.
2. **Typen aus den Definitionen holen**, nie raten:
   `metafieldDefinitions(ownerType: PRODUCTVARIANT, namespace: "einkauf")`.
   `einkauf.lieferant` ist eine **Metaobjekt-Referenz** (Wert = GID), `lieferant_url`
   ist `url` (nicht `single_line_text_field` – sonst weist Shopify ab),
   Listenfelder heissen `list.metaobject_reference` und erwarten ein
   JSON-Array als String.
3. **Plan bauen, mit Quelle je Wert.** Nur schreiben, was belegt ist. Alles
   andere nach `offen.json`. Fuer Metaobjekt-Verweise gilt: nur bei exakter
   Entsprechung zuordnen; fehlt ein Eintrag, ist das eine Inhaberfrage, kein
   Grund zum Anlegen nebenbei.
4. **Vorhandene Werte nie ueberschreiben**, solange der Auftrag nur „fuellen"
   lautet. Der Abgleich laeuft gegen den Export aus Schritt 1.
5. **Pakete erzeugen** (Format siehe oben). Eine Datei ist rund 30 KB gross –
   das ist die Obergrenze, die sich zuverlaessig durch ein Werkzeug schieben laesst.
6. **Schreiben.** `bulkOperationRunMutation` ist ueber den MCP **gesperrt**;
   der Weg ist `graphql_mutation` mit dem Dateiinhalt. Mehrere Dateien parallel
   ueber Relay-Agenten, jede Datei genau einmal, Ergebnis als
   `result-xNNN.json`. `metafieldsSet` ist idempotent – doppeltes Senden schadet nicht.
7. **Gegenprobe.** Frischer Export, jeder geplante `(ownerId, namespace, key)`
   muss **exakt** den geplanten Wert tragen. Zaehlen: gleich / fehlend /
   abweichend, mit Beispielen. Erst danach gilt der Lauf als erledigt.
8. **Rollback-Datei schreiben**: `metafieldsDelete` fuer alles, was vorher leer
   war, `metafieldsSet` mit dem Altwert fuer den Rest.

## Was jedes Mal schiefgeht

- **`userErrors: []` ist kein Beleg.** Es sagt nur, dass Shopify die Anfrage
  angenommen hat. Ob der Wert dort steht, sagt nur der Export.
- **Einheiten fehlen.** Lieferanten fuehren die Einheit in der Spaltenueberschrift
  und liefern nackte Zahlen („14", „7.5"). Im Shop steht aber „14 dB", „7,5 mm".
  Einheit und deutsches Komma beim Aufbereiten ergaenzen, sonst sieht die
  Produktseite gemischt aus.
- **Pseudonyme landen in echten Daten.** Wer Quelldateien zum Berichten
  pseudonymisiert (`lieferant-a.example`), schreibt sonst genau diese
  Platzhalter als Lieferanten-URL in den Shop. Vor dem Schreiben pruefen:
  `grep -c "example" plan.json`.
- **Entwurfsstatus macht Daten unsichtbar.** Ein Metaobjekt-Eintrag mit
  `publishable.status = DRAFT` wird an der Storefront als leer ausgeliefert –
  das Feld sieht im Admin gefuellt aus und fehlt im Shop trotzdem. Nach dem
  Anlegen pruefen: `capabilities { publishable { status } }`.
- **Agenten verweigern Massenschreiben zu Recht**, wenn die Anweisung die
  Freigabe nur behauptet. Belege in den Auftrag schreiben: Pfad zu
  `plan.json`, zum `write-log.json` des vorigen Laufs und zur Rollback-Datei.
  Eine Behauptung im Prompt ersetzt keine Freigabe.
- **Das Zeitfenster des Lieferanten beachten.** `robots.txt` kann
  `Crawl-delay: 120` oder feste Uhrzeiten vorgeben. Das ist kein Hindernis, das
  man umgeht, sondern eine Laufzeit, die man einplant (2.258 Seiten = 75 Stunden).

## Danach

Die Ansichten, die diese Daten zeigen, lesen lokale Dateien – nach jedem Lauf
`npm run daten:aktualisieren` bzw. die geplante Aufgabe laufen lassen, sonst
zeigt das Control Center den alten Stand und jemand haelt die Arbeit fuer
verloren.
