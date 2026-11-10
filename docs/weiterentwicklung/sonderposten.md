# Sonderposten: Produktstruktur, Pflege und Ladenverkauf

Teil von `SHOPIFY_WEITERENTWICKLUNG.md` (Phasen 4 und 5). Stand 2026-10-10 (Review-Befunde vom 09.10. eingearbeitet); Abschnitt 12 (Ausbaukonzept) vom 2026-11-10.

## 1. Grundsatz

Ein Sonderposten ist **ein Shopify-Produkt je physischem Stück**: eine Variante,
feste Maße, ein Preis für das ganze Stück, Bestand 1. Keine Farb- oder
Breitenoptionen, kein Rechner, kein Zuschnitt.

Warum nicht als Variante am Ursprungsprodukt: Varianten der Rollenware tragen €/m²-Preise
und laufen durch Rollenrechner, Raummaß-Logik, Streichpreisregeln für beide Zuschnittarten
und den Google-Feed als Flächenware. Ein Reststück mit Stückpreis würde dort jede dieser
Regeln verletzen. Ein eigenes Produkt ist der kleinste sichere Weg.

## 2. Produkttyp, Vorlage, Kollektion

| Was | Wert | Wirkung |
|---|---|---|
| Produkttyp | `Sonderposten` | einziges Merkmal (`snippets/tp-ist-sonderposten.liquid`); schließt das Stück aus den Kategorie-Kollektionen aus (deren Regeln verlangen `TYPE = Teppichboden` usw.). **Nicht** aus Kollektionen, die nur Typen ausschließen – siehe „Wo ein Stück sonst landet“ unten |
| Theme-Vorlage | `sonderposten` (`templates/product.sonderposten.json`) | Maße, Fläche, Stückpreis, Zustand, Verfügbarkeit, kein Mengenfeld |
| Kollektion | „Reste & Sonderposten“, Handle `reste-sonderposten`, Vorlage `sonderposten` | Smart-Kollektion: `Produkttyp = Sonderposten` **und** `Bestand > 0` – verkaufte Stücke verschwinden von selbst |
| Bestand | Bestand verfolgen = an, Menge 1, „Verkauf bei Nichtverfügbarkeit fortsetzen“ = **aus** | kein Überverkauf, Shopify prüft serverseitig und beim Checkout. Fehlt eine der beiden Einstellungen, bietet das Theme das Stück **nicht** online an (`snippets/tp-sonderposten-kaufstatus.liquid`: „Online nicht bestellbar“, kein Kaufknopf, JSON-LD `OutOfStock`) und das Control Center bucht nichts. |
| SKU | `SP-0001`, fortlaufend | dieselbe Nummer steht auf dem Etikett am Stück im Laden und im SumUp-Artikel (siehe Abschnitt 6) |
| Grundpreis | Variante: Grundpreis-Messung Fläche = Fläche des Stücks, Referenz 1 m² (`showUnitPrice`) | Shopify zeigt €/m² nativ und gibt es an Google; der Block rechnet zusätzlich als Rückfall |

### Wo ein Stück sonst landet (geprüft 2026-10-10, Admin API)

Zwei Smart-Kollektionen schließen nur bestimmte Typen aus und nehmen deshalb auch
`Sonderposten` auf – abhängig davon, ob ein Vergleichspreis gesetzt ist:

| Stück | Kollektion | Regel | Folge |
|---|---|---|---|
| **mit** Vergleichspreis (Teststück, 243,46 €) | `angebote-leisten-zubehoer` „Angebote Leisten & Zubehör“ | Preis reduziert **und** Typ enthält nicht eppich/vinyl/Linoleum/Kunstrasen/Dekofell/Muster/Service; keine Bestandsregel | Stück steht als Zubehör-Angebot unter `/collections/angebote-leisten-zubehoer` (Standardvorlage, Karte ohne Maße), auch nach dem Verkauf („Verkauft“). Die Startseiten-Liste „Aktuelle Angebote → Leisten & Zubehör“ liest diese Kollektion. |
| **ohne** Vergleichspreis (Vorlage) | `intern-regulaerer-preis` „Intern: Regulärer Preis (rabattcode-fähig)“ | Preis reduziert nicht gesetzt | Marketingcodes (z. B. Newsletter) gelten auch für dieses Stück (`docs/kundenbindung/marketingcodes-und-aktionen.md`). |

Das widerspricht der Regel „Sonderposten zählen nie als Angebot“ (`angebote.md` §3).

- **Theme-Sicherung (gebaut):** Die Startseiten-Listen (`sections/product-list.liquid`, Weg
  `tp_je_linie_eins`, alle vier „Aktuelle Angebote“) überspringen Sonderposten, außer die
  Liste zeigt selbst eine Kollektion mit Vorlage `sonderposten`. Die Kollektionsseite selbst
  kann das Theme nicht filtern.
- **Datenänderung (wartet auf Freigabe des Inhabers, nichts geändert):**
  `angebote-leisten-zubehoer` bekommt die Regel *Typ enthält nicht `Sonderposten`*. Ob
  Marketingcodes für Sonderposten gelten sollen, entscheidet der Inhaber; wenn nein, bekommt
  `intern-regulaerer-preis` dieselbe Regel. Rückweg jeweils: Regel wieder entfernen.
  Gegenprobe: `product.inCollection` für Teststück und Vorlage (nicht `userErrors: []`).
- Bis die Regel steht, sollte **kein Stück mit Vergleichspreis** in den Status Aktiv gehen,
  auch nicht das Teststück für eine Buchungsprobe (#986): Das Live-Theme kennt die
  Theme-Sicherung erst nach dem Livegang dieses PRs – siehe Abschnitt 9.

## 3. Metafelder (Namensraum `sonderposten`)

Noch **nicht angelegt** – braucht Freigabe (Abschnitt „Freigaben“ in der Projektdatei).
Alle Definitionen auf Produktebene, mit Admin-Anzeige, damit sie im Produktformular
untereinander stehen.

| Schlüssel | Typ | Pflicht | Auswahlwerte / Beispiel | Sichtbar im Shop |
|---|---|---|---|---|
| `art` | Einzeiliger Text, Auswahl | ja | Reststück · Restposten · Einzelstück · Auslaufartikel · Lagerüberhang | ja (Chip) |
| `zustand` | Einzeiliger Text, Auswahl | ja | Neuware · Ausstellungsstück · B-Ware (kleine Mängel) | ja; steuert `itemCondition` (neu/gebraucht) |
| `zustand_hinweis` | Mehrzeiliger Text | bei B-Ware | „Kleiner Druckstreifen 20 cm an der Längskante“ | ja |
| `breite_m` | Dezimalzahl, min 0,1 max 10 | ja | 4,00 | ja |
| `laenge_m` | Dezimalzahl, min 0,1 max 60 | ja | 2,35 | ja |
| `flaeche_m2` | Dezimalzahl | nein | nur bei unregelmäßigem Zuschnitt, sonst Breite × Länge | ja |
| `farbe` | Einzeiliger Text | ja | Grau | ja |
| `ursprungsprodukt` | Produktreferenz | nein | das reguläre Produkt (Eigenname), aus dem das Stück stammt | ja (Link „Aus der Kollektion“) |
| `preis_beleg` | Einzeiliger Text | nur mit Vergleichspreis | „regulär 25,90 €/m² × 9,40 m²“ (festes Format) | ja; ohne **prüfbaren** Beleg kein Streichpreis (Abschnitt 4) |
| `versand` | Einzeiliger Text, Auswahl | ja | Abholung oder Versand · Nur Abholung | ja; „Nur Abholung“ = nur im Geschäft, online nicht bestellbar (Abschnitt 8) |
| `lagerort` | Einzeiliger Text | nein | „Halle 2, Regal C“ | **nie** – nur intern |
| `verkauft_am` | Datum und Uhrzeit | – | schreibt der Ladenverkauf-Ablauf | nein |
| `verkauft_von` | Einzeiliger Text | – | Name aus der Dashboard-Anmeldung | nein |
| `verkauft_kanal` | Einzeiliger Text | – | Laden · Online | nein |

Material kommt aus dem vorhandenen `custom.material` (wie bei allen Produkten).
Lieferantennamen gehören nicht in diese Felder: Herkunft nur über `ursprungsprodukt`
(Eigenname im Shop).

## 4. Preis und Streichpreis

- **Preis der Variante = Preis für das ganze Stück** (z. B. 89,00 €).
- **Vergleichspreis** (compare-at) = regulärer Preis derselben Ware: regulärer €/m²-Preis
  des Ursprungsprodukts × Fläche (z. B. 25,90 × 9,40 = 243,46 €). Er erscheint nur mit einem
  Beleg, der zu genau diesem Stück passt (`snippets/tp-sonderposten-preisbeleg.liquid`, gefragt
  von `snippets/tp-rabatt-sichtbar.liquid`, Weg 3). Ein gepflegter Text allein reicht nicht – er
  würde beim Duplizieren mitkopiert. Alle Bedingungen:
  1. `preis_beleg` im Format „regulär <Meterpreis> €/m² × <Fläche> m²“ (auch „EUR/m2“, „x“).
  2. Die Fläche im Beleg ist die Fläche dieses Stücks (±0,005 m²).
  3. Meterpreis × Fläche = Vergleichspreis der Variante (±1 Cent), Vergleichspreis > Stückpreis.
  4. `ursprungsprodukt` ist gesetzt, und der Meterpreis im Beleg liegt nicht über dem
     günstigsten **aktuellen** Preis je m² dort (verkaufbare Rollenbreiten ohne Raummaß/Muster
     bzw. Paketpreis ÷ `custom.qm_pro_paket`). Lässt sich der Preis je m² nicht belegen, gibt es
     keinen Streichpreis.
- **Streichpreise nur einzeln:** Jeder Beleg wird je Stück vom Inhaber freigegeben; keine
  Sammelpflege, keine Übernahme aus der Vorlage oder einem duplizierten Stück – ein kopierter
  Beleg mit fremder Fläche wird ohnehin nicht angezeigt.
- Ersparnis in € und % rechnet das Theme aus Preis und Vergleichspreis, nichts wird
  gespeichert, was auseinanderlaufen könnte.
- **Rechtlicher Hinweis (keine Rechtsberatung):** § 11 PAngV verlangt bei
  Preisermäßigungen als Referenz den niedrigsten Preis der letzten 30 Tage *für dieselbe
  Ware*. Für ein neu eingestelltes Reststück gab es nie einen eigenen Vorpreis; der
  Vergleich mit dem regulären Meterpreis ist ein Vergleich mit dem eigenen Normalpreis der
  Meterware. Deshalb nennt der Shop die Herkunft des Vergleichswerts ausdrücklich, und zwar
  **überall, wo der Streichpreis steht**: auf der Produktseite „gegenüber 243,46 € (regulär
  25,90 €/m² × 9,40 m²)“, auf Karten, in Suche und Suchvorschlägen (`snippets/price.liquid`)
  und im Warenkorb (`snippets/cart-products.liquid`) die Zeile „Vergleichspreis = regulär
  25,90 €/m² × 9,40 m²“ (`snippets/tp-sonderposten-vergleich.liquid`, gleiche Bedingung wie
  der Streichpreis). Außerhalb des Themes kann der Shop das nicht: Ob Shopify im Checkout
  und in der Bestellbestätigung den Vergleichspreis durchgestrichen zeigt, ist nicht
  geprüft. Ob das genügt, entscheidet der
  Inhaber – die sichere Alternative ist „kein Vergleichspreis, nur Stückpreis und
  €/m²“; dafür `preis_beleg` **und** den Vergleichspreis leer lassen. Nebenwirkung: Ohne
  Vergleichspreis liegt das Stück in `intern-regulaerer-preis`, Marketingcodes greifen
  dann (Abschnitt 2, „Wo ein Stück sonst landet“).

## 5. Pflege im Shopify-Backend (Anleitung für Mitarbeiter)

1. Produkt „VORLAGE Sonderposten – nicht veröffentlichen“ öffnen → **Duplizieren**.
   (Die Vorlage ist ein Entwurf mit allen Feldern, Typ, Theme-Vorlage, Bestandsregeln.)
2. Titel nach Muster `<Kollektion> Reststück <Farbe> <Breite> × <Länge> m`, z. B.
   „Velory Reststück Grau 4,00 × 2,35 m“.
3. Fotos des echten Stücks hochladen (mind. ein Gesamtfoto, ein Detail, ein Foto mit
   Zollstock) – Benennung siehe `docs/weiterentwicklung/bilder.md`.
4. Preis = Stückpreis, ggf. Vergleichspreis + `preis_beleg`.
5. Metafelder ausfüllen (Abschnitt 3), SKU `SP-<nächste Nummer>`.
6. Bestand Saarlandstraße 73 = 1.
7. Status **Aktiv**, Vertriebskanäle: Onlineshop (Google erst nach Freigabe, siehe offene Punkte).
   Bei Zustand **Ausstellungsstück** oder **B-Ware**: im Google-&-YouTube-Kanal den Zustand des
   Produkts auf „Gebraucht“ stellen (Metafeld `mm-google-shopping.condition = used`). Die Seite
   meldet Google dann `UsedCondition`; ohne diese Einstellung schickt der Feed „neu“ und das
   Merchant Center meldet einen Widerspruch.
8. Etikett mit SKU ans Stück im Laden.

Die Smart-Kollektion nimmt das Stück automatisch auf; nichts muss von Hand zugeordnet werden.

## 6. Ladenverkauf (Phase 5) – Bewertung der Wege

Ausgangslage, geprüft 2026-10-08:
- Ein Shopify-Standort (Saarlandstraße 73, Oranienburg), Bestand wird heute **nirgends**
  geführt (alle Varianten `tracked: false`). Sonderposten sind die ersten Artikel mit Bestand.
- SumUp-REST-API (`developer.sumup.com`): Transaktionen lassen sich mit
  `GET /v2.1/merchants/{merchant_code}/transactions/history?changes_since=…` abholen
  (Scope `transactions.history`). Eine Transaktion enthält `products[]` mit **Name, Preis,
  Menge – aber keiner SKU**. Webhooks gibt es für Online-Checkouts (`checkout.status.updated`),
  nicht für Kassenverkäufe. Ob Barzahlungen der SumUp-Kasse in dieser Historie erscheinen
  und welche SumUp-Kassenlösung (App, Kassensystem Lite, Kassensystem Pro) im Laden läuft,
  ist **nicht geprüft** – Frage an den Inhaber.

| Weg | Zuverlässigkeit | Aufwand | Kosten | Bedienung | Automatisierung | Fehleranfälligkeit |
|---|---|---|---|---|---|---|
| **A** Bestand in der Shopify-App/Admin von Hand auf 0 | hoch, wenn es gemacht wird | keiner | 0 € | 5 Klicks, Suche nach SKU | keine | mittel: wird vergessen; Shopify protokolliert die Änderung mit Mitarbeiterkonto, aber Basic hat nur 2 Mitarbeiterkonten |
| **B** Button „Im Laden verkauft“ im Control Center | hoch | klein (1–2 Tage, vorhandenes Dashboard mit Anmeldung, Rollen, Protokoll) | 0 € | 1 Klick + Bestätigung, auch am Handy über Tailscale | halb | gering: setzt Bestand 0, schreibt `verkauft_*`-Felder, Protokolleintrag |
| **C** automatisch aus SumUp | mittel: Zuordnung nur über den Artikelnamen (SKU muss im SumUp-Artikelnamen stehen), Verzögerung durch Abfrageintervall | mittel (API-Schlüssel, Abgleich-Skript, Dauerbetrieb) | 0 € API, Betrieb auf dem Mac | keine | voll | mittel: Tippfehler im Namen, freie Beträge ohne Artikel, Stornos |
| **D** eigene Verwaltungsoberfläche | hoch | groß | 0 € | gut | halb | gering – ist im Ergebnis B, nur neu gebaut |
| (E) Shopify POS als zweite Kasse | hoch (Bestand synchron) | klein | POS Lite 0 € | doppelte Erfassung SumUp + POS | voll für Bestand | **Kassenrecht offen** (TSE/KassenSichV für eine zweite Kasse) – nicht empfohlen ohne Steuerberater |

**Empfehlung: B jetzt, A als Rückfallweg, C später optional als Sicherheitsnetz.**
B nutzt das vorhandene Control Center (Anmeldung mit Rollen `inhaber`/`mitarbeiter`,
Protokoll `protokoll.jsonl`), kostet nichts und erfüllt „wer, wann, welcher Artikel“.
C ergänzt B, sobald geklärt ist, welche SumUp-Lösung läuft: ein Abgleich alle 15 Minuten
sucht `SP-xxxx` im Artikelnamen neuer SumUp-Transaktionen und meldet Treffer, deren
Bestand noch 1 ist (erst melden, nicht selbst buchen).

### Ablauf B im Detail

1. Mitarbeiter öffnet im Control Center „Sonderposten“ (Liste mit Foto, SKU, Maßen, Preis,
   Lagerort) oder sucht die SKU vom Etikett.
2. Klick „Im Laden verkauft“ → Bestätigung zeigt Titel, SKU, Preis.
3. Server (`scripts/dashboard-api.mjs`, neue Route `POST /api/sonderposten/verkauft`):
   - `inventorySetQuantities` (Name `available`, Menge 0, `reason: "correction"`,
     `referenceDocumentUri: "tp://laden-verkauf/<SKU>/<Zeit>"`) – nur wenn der Bestand
     vorher 1 war (`compareQuantity: 1`), sonst Abbruch mit Hinweis „bereits verkauft“;
   - `metafieldsSet` für `verkauft_am`, `verkauft_von` (angemeldeter Benutzer), `verkauft_kanal = Laden`;
   - Eintrag in `protokoll.jsonl` (Zeit, Benutzer, SKU, Produkt-ID);
   - Gegenprobe: Bestand erneut lesen, Ergebnis anzeigen.
4. Shop: Kollektion nimmt das Stück sofort heraus (Regel `Bestand > 0`), die Produktseite
   zeigt „Verkauft“, der Kaufbutton ist gesperrt.

Voraussetzung: Die Shopify-Zugangsdaten des Dashboards (App „TP Operations“) brauchen
`write_inventory` und `write_products`. **Seit 2026-10-12 erteilt** (Version
`tp-operations-4`, im Shop bestätigt; echter Schreibtest am Testprodukt SP-TEST-0001
bestanden). Rechtevergabe macht der Inhaber selbst. Freigeben im Dev Dashboard allein
reicht nicht: im Shop-Admin unter Einstellungen → Apps → TP Operations → „App öffnen“
die neuen Berechtigungen bestätigen, danach den Dashboard-Dienst neu starten.

Gebaut (PR #986, #1115): Ansicht „Sonderposten“ im Control Center, auch für Restrollen
(Rollenware mit Tag `sonderposten`, Länge eingeben). Ohne persönliches Konto (gemeinsames
Passwort) fragt der Dialog „Wer hat verkauft?“ – Pflicht, steht im Protokoll und in
`verkauft_von`.

### Verkauft: verschwinden oder anzeigen?

- **Kollektion:** verschwindet sofort (Smart-Regel `Bestand > 0`). Keine Enttäuschung beim Stöbern.
- **Produktseite:** bleibt 30 Tage erreichbar mit „Verkauft“ und Kaufsperre (Links aus Google
  oder geteilte Links laufen nicht ins Leere), danach archiviert das Control Center das
  Produkt (Status `ARCHIVED`, kein Löschen).
- **Google:** Verfügbarkeit `OutOfStock` steht im JSON-LD; der Feed folgt dem Bestand.

## 7. Online-Verkauf eines Sonderpostens

Kein Zusatzaufwand: Shopify zieht den Bestand bei der Bestellung ab, das Stück verschwindet
aus der Kollektion. Der Mitarbeiter sieht die Bestellung wie jede andere; im Laden muss das
Stück mit der SKU zurückgelegt werden (Hinweis im Control Center unter „Heute“, Phase 5).

## 8. Versand und Abholung

**Entscheidung 2026-10-08 (Tobias):** Sonderposten werden **abgeholt und versendet**. Die
frühere Vorgabe „zuerst nur Abholung“ gilt nicht mehr; ein Profil „nur Abholung“ entfällt.

- Abholung am Standort Saarlandstraße 73 ist eingeschaltet (Bereitzeit „5+ Tage“, Hinweis
  „Abholung nur nach unserer Bestätigung …“) und bleibt im Checkout immer wählbar.
- Vorlage und Teststück tragen `sonderposten.versand = Abholung oder Versand`. Der Wert
  „Nur Abholung“ wird im Checkout **nicht** erzwungen (dafür bräuchte es ein eigenes
  Profil). Damit der Shop nichts verspricht, was der Checkout bricht (Codex-Review
  2026-10-09), gilt: Ein Stück mit „Nur Abholung“ ist **nur im Geschäft** erhältlich – die
  Seite zeigt „Nur im Geschäft“, keinen Kaufknopf und kein Versandversprechen
  (`snippets/tp-sonderposten-kaufstatus.liquid`, Status `laden`). Wer solche Stücke online mit
  reiner Abholung verkaufen will, braucht vorher ein eigenes Versandprofil (Checkout-Einstellung,
  nur mit Freigabe des Inhabers).
- Die Zeile „Abholung in Oranienburg oder Versand“ erscheint nur bei online bestellbaren
  Stücken (Status `frei`).

**Versandkosten – entschieden 2026-10-08 (Tobias):** wie bei allen Produkten (Allgemeines
Profil: Deutschland ab 50 € kostenlos, sonst 4,99 €; EU 13,99 €; International 19,99 €).
Kein eigenes Profil. Bewusst in Kauf genommen: Bei großen Reststücken können die echten
Versandkosten über dem liegen, was der Kunde zahlt.

## 9. Pilot: welche Stücke online gehen dürfen

Die Technik ist Vorbereitung, keine Freigabe für einzelne Artikel. Ein Stück geht erst online,
wenn alles davon belegt ist:

1. **Physisch gezählt und gekennzeichnet:** Stück liegt im Laden, Maße nachgemessen,
   Etikett mit der SKU (`SP-xxxx`) hängt am Stück.
2. **Bestand gesichert:** Bestand verfolgen = an, Menge = gezählte Stückzahl (Einzelstück 1),
   „Verkauf bei Nichtverfügbarkeit fortsetzen“ = aus. Sonst zeigt die Seite „Online nicht
   bestellbar“.
3. **Aktuelle eigene Fotos** des Stücks mit Nutzungsrecht (`docs/weiterentwicklung/bilder.md`).
4. **Preis kalkuliert** und vom Inhaber freigegeben; Vergleichspreis nur mit Beleg nach
   Abschnitt 4, je Stück einzeln.
5. **Versand oder Abholung** je Stück entschieden (Abschnitt 8).
6. **Nur mit Vergleichspreis:** `angebote-leisten-zubehoer` schließt den Typ `Sonderposten`
   aus (Abschnitt 2, „Wo ein Stück sonst landet“). Gegenprobe am Stück:
   `inCollection(angebote-leisten-zubehoer) = false`.

Fehlt einer der Punkte, bleibt das Produkt im Status Entwurf. Massenanlage auf Verdacht gibt es
nicht.

## 10. Restrollen nur auf Anfrage (seit 2026-10-26)

Restrollen aus dem Laden (Rollenware mit Tag `sonderposten`, Vorbereitung vom 23.10.) haben
keine gemessene Restlänge, und dieselben Rollen werden im Laden verkauft. Der Inhaber hat
deshalb entschieden: **vorerst nur auf Anfrage**, bis feststeht, ob sie Sofortkauf werden.

| Was | Wert | Wirkung |
|---|---|---|
| Theme-Vorlage | `rolle-anfrage` (`templates/product.rolle-anfrage.json`) | Bilder, Titel, Preis je m², Hinweis und Anfrageformular (`blocks/tp-anfrage-formular.liquid`); kein Rechner, kein Warenkorb, keine Kaufleiste, kein Musterknopf |
| Bestand | Rollen-Variante verfolgt, Menge 0, Überverkauf gesperrt | kaufen geht auch über einen Warenkorb-Link nicht |
| Produktkarte | Schild „Auf Anfrage“ statt „Ausverkauft“ (`blocks/_product-card-gallery.liquid`) | |
| JSON-LD | `LimitedAvailability` statt `OutOfStock` (`snippets/tp-product-structured-data.liquid`) | |
| Vertriebskanal | nur Onlineshop, nicht Google & YouTube | Google lehnt Produkte ohne Kaufmöglichkeit ab |
| Anfrage | Shopify-Kontaktformular, Betreff „ANFRAGE Restrolle – <Titel>“ mit Produkt, SKU, Link, Ausführung, Wunschmaß | keine Bestellung; der Laden prüft die Rolle und schickt ein Angebot |

Das einzige Merkmal ist die Vorlage. Zurück auf Sofortkauf: Restlänge im Control Center
messen (Abschnitt 6) – seit 2026-11-04 stellt die Inventur die Vorlage bei freiem Bestand selbst
wieder auf `rolle`. Den Kanal Google & YouTube danach im Admin zuschalten.

**Kollektion „Reste & Sonderposten“:** Damit die Restrollen dort stehen, gilt seit dem Livegang
die Regel *Tag = `sonderposten`* statt *Typ = Sonderposten und Bestand > 0* (Rückweg: alte
Regeln wieder setzen). Folge für spätere Einzelstücke (Abschnitt 2): Sie brauchen ebenfalls den
Tag `sonderposten`, und ein verkauftes Stück verschwindet nicht mehr von selbst aus der
Kollektion, sondern steht dort als „Verkauft“, bis es archiviert ist. Offen, sobald die ersten
Einzelstücke kommen.

## 11. Sammelseite Restposten & Auslauf (seit 2026-11-04)

Kollektion `restposten` („Restposten & Auslauf“, Vorlage `sonderposten`): Tag `sonderposten`
**oder** `auslauf`, neueste zuerst. Ziel des Hauptpunkts „Angebote & Reste“ bis zur Black Week
(`domains/shopify/menue-reste-bis-black-week-2026-11.json`); darunter Restrollen & Reststücke
(`reste-sonderposten`, unverändert, weil `blocks/tp-aktion-hinweis.liquid` dort die Restrollen
sucht) und die vier Auslauf-Kollektionen, die vorher verstreut in den Warengruppen standen
(`domains/shopify/menue-restposten-2026-11.json`). Die Beschreibung der Kollektion erklärt die
beiden Schilder (Sonderposten, Auslaufkollektion); die Chip-Leiste im Kopf kommt aus dem Menü
und blendet leere Ziele wie „Aktuelle Angebote“ aus.

## 12. Konzept: Ausbau zum eigenen Shopbereich (Entwurf 2026-11-10)

Nur Konzept. Nichts davon ist gebaut, kein Preis und kein Produkt wurde angefasst. Die
Entscheidungen des Inhabers aus den Abschnitten 8, 10 und 11 und aus dem Skill `preislogik`
(Sofortkauf, ein Artikel je Rolle, UVP mit Abstand in Rot, Endung ,95, Muster von der Rolle,
einfache Fotos, Ladenverkauf von Hand) gelten weiter und werden hier nicht neu aufgemacht.

### 12.1 Ist-Stand (Admin API und ShopifyQL, nur lesend, 2026-11-10)

**Was im Bereich steht** (`productsCount` und Produktliste zum Tag `sonderposten`):

| Art | Anzahl | Status | Bemerkung |
|---|---|---|---|
| Restrollen (Typ Teppichboden, Vorlage `rolle`) | 10 | aktiv | 718 m² Bestand, Warenwert zum Onlinepreis rund 24.700 €; 7 Rollen 4 m breit, 3 Rollen 5 m; Restlänge 4 bis 22,5 m; 27,95 bis 41,95 €/m², 34 bis 50 % unter UVP |
| Kettelteppich nach Maß aus der Restrolle | 10 | aktiv | eigenes Produkt je Rolle, in der Kollektionsliste ausgeblendet (`sections/main-collection.liquid`), erreichbar über den Link auf der Karte der Rolle |
| Raummaß-Produkte | 10 | UNLISTED | nur Abrechnungszeile, nie löschen |
| Neue Restrollen samt Zuschnitt, Raummaß, Kettel | 6 Rollen (24 Produkte) | Entwurf | 517 m², 23,95 bis 38,99 €/m²; je 1 Bild, ohne Tags `breite_boden:` und `farbe:`, eine Rolle ohne UVP |
| Einzelstücke (Typ `Sonderposten`, Abschnitte 1 bis 9) | 0 | – | es gibt nur Vorlage und Teststück, beide Entwurf |
| Auslaufware (Tag `auslauf`, aktiv) | 58 | aktiv | 29 Teppichboden, 24 Teppich nach Maß, 5 Klickvinyl; steht nur in `restposten` |

Die Kollektion `reste-sonderposten` zählt im Admin 54 Produkte, `restposten` 114; im Shop
sichtbar sind davon die aktiven. Der Shop hat insgesamt 3.033 aktive Produkte.

**Abweichungen, die beim Erheben auffielen** (nicht geändert):

- Abschnitt 3 nennt die Metafelder `sonderposten.*` „noch nicht angelegt“. Alle 14 Definitionen
  existieren inzwischen.
- 5 der 10 aktiven Rollen tragen keinen Tag `farbe:`. Ein Farbfilter zeigt sie nicht.
- Zwei aktive Rollen und zwei Entwürfe enden auf ,99 statt ,95 (`preislogik`, Regel vom 07.11.).
- Abschnitt 10: Ein verkauftes Einzelstück verschwände nicht mehr von selbst aus der
  Kollektion (Regel `Tag = sonderposten`). Bisher folgenlos, weil es keine Einzelstücke gibt.

**Wie Kunden hinkommen:**

| Weg | Stand |
|---|---|
| Hauptmenü „Angebote & Reste“ | zeigt bis 30.11. auf `/collections/angebote` (Black Week); die Reste stehen als 3. und 4. Unterpunkt („Alle Restposten & Auslauf“, „Restrollen & Reststücke“). Danach wieder `restposten` (`angebote.md` §6) |
| Startseite | Band `start_restrollen`, 5. Abschnitt, 8 Karten aus `reste-sonderposten`, Knopf „Alle Restrollen ansehen“ |
| Kategorien | die 10 Rollen stehen vorn in `teppichboden` und den Florarten, Plakette „Restrolle“ und rote Pille „−x % ggü. UVP“; auf „Teppich nach Maß“ eine eigene erste Reihe |
| Normale Produktseite | `blocks/tp-aktion-hinweis.liquid` zeigt „Von … auch als Restposten“, höchstens 2 Rollen, nur bei gleichem echtem Hersteller. Beim Hausnamen erscheint nichts, also bei den meisten Teppichböden |
| Suche | „restrolle“, „restposten“ führen auf beide Kollektionen (`snippets/tp-suche-thema.liquid`) |
| Leere Angebotsseite, Fußzeile | Link auf die Reste |
| Google & YouTube | Rollen stehen im Kanal; eine eigene Kampagne gibt es nicht (Werkbank w-250) |
| eBay | vorbereitet, nichts eingestellt (Werkbank w-313) |

**Die Seite selbst** (`templates/collection.sonderposten.json`): Titel, Beschreibung, Hinweis
„Im Laden ansehen, selbst abholen“, Filter und Sortierung, 24 Karten, darunter das
Ladensortiment mit „Reste-Regal“. Die Karte einer Rolle zeigt „Noch x m² · y m Restlänge“ und
den Link zum Kettelteppich. Die Rollenbreite steht nur im Titel. Preisklassen-Kacheln und der
Filter „Preis je m²“ sind dort nicht eingebunden, der Standard-Preisfilter ist ausgeblendet.

**Zahlen:**

| Was | Wert | Quelle |
|---|---|---|
| Online-Bestellungen mit Restrollen seit 09.10. | 0 | ShopifyQL `sales` nach Titel und Tag; Gegenprobe: Teppichboden gesamt 3 Bestellungen im selben Zeitraum |
| Sitzungen im Shop 29.10. bis 10.11. | 2.421, davon 96 mit Warenkorb, 34 mit Kauf | ShopifyQL `sessions` |
| Sitzungen, die auf einer Reste-Seite **einsteigen** | 19 (0,8 %), 0 mit Warenkorb | davon 5 `reste-sonderposten`, 1 `restposten`, 11 Rollen-Produktseiten |
| Ladenverkäufe von den Rollen | bis 06.11. keine Buchung im Protokoll | Stand laut Betriebsnotiz, hier nicht neu gelesen |

Nicht belegbar: Aufrufe der Reste-Seiten **innerhalb** eines Besuchs, Klicks auf Startseitenband
und Produktverweis (GA4 war über den Auswertungszugang nicht lesbar, ShopifyQL kennt nur die
Einstiegsseite), die Filter der Kollektion in Search & Discovery und echte Pflegezeiten im Laden.

**Lesart:** Die Technik für Sofortkauf steht. Es fehlen Besucher und Auswahl. Mit 10 Rollen und
ohne ein einziges Einzelstück ist „Bereich“ zu viel gesagt, und 19 Einstiege in zwölf Tagen
tragen keinen Verkauf. Ein Umbau der Seite allein ändert daran wenig.

### 12.2 Ziel und Zielkunde

**Ziel:** Lagerware dreht (Inhaber 04.11.: Umschlag vor Marge). Messbar: Verkäufe aus dem Bereich
je Monat und verkaufte m², nicht Seitenaufrufe.

**Für wen:**

1. **Kleiner Raum, kleines Budget** (Kinderzimmer, Flur, Keller, Mietwohnung, Vermieter): will
   wissen „reicht das Stück für meinen Raum, was kostet es fertig, wann ist es da“.
2. **Abholer und Kunden im Umkreis** (rund 50 km): wollen ansehen, mitnehmen oder liefern lassen.
3. **Teppich-nach-Maß-Käufer**: gekettelter Teppich aus Markenware deutlich unter UVP.

Alle drei fragen zuerst nach **Maß**, dann nach Farbe, dann nach Preis. Das unterscheidet den
Bereich vom normalen Sortiment, wo jede Länge lieferbar ist.

### 12.3 Seitenaufbau

**Einstieg: eine Seite, `/collections/restposten`.** `reste-sonderposten` bleibt als technische
Kollektion (Startseitenband, Produktverweis), wird aber nicht zweiter Einstieg.

1. **Kopf:** ein Satz („Lagerware zum kleinen Preis: sofort da, auf Ihr Maß geschnitten“) und
   drei Fakten als Zeile: sofort ab Lager · Zuschnitt und Kettelung möglich · Muster kostenlos.
   Vorhanden sind Titel, Beschreibung und Laden-Hinweis; neu wäre nur die Faktenzeile.
2. **„Passt es in meinen Raum?“** Zwei Felder (Breite, Länge in m). Die Seite blendet Rollen
   aus, deren Breite oder Restlänge nicht reicht, und sagt bei Räumen über 5 m, dass eine Naht
   nötig ist. Bei 10 bis 30 Rollen reicht dafür ein kleines Skript über Werte, die
   `snippets/tp-rollenrest.liquid` schon rechnet (als `data-`Attribute an der Karte). Kein
   neues Metafeld, kein Search-&-Discovery-Umbau.
3. **Drei Gruppen statt einer gemischten Liste:** Restrollen · Einzelstücke (sobald es welche
   gibt, sonst unsichtbar) · Auslaufkollektionen. Heute mischt „neueste zuerst“ 10 Rollen unter
   58 Auslaufprodukte.
4. **Filter** aus Search & Discovery, nur was Daten hat: Rollenbreite (`custom.rollenbreite`),
   Farbe (Tag `farbe:`), Preis je m² (`custom.meterpreis_bereich`, an allen 10 aktiven Rollen
   gesetzt). Ob sie für diese Kollektion schon eingeschaltet sind, ist nicht geprüft.
5. **Ladensortiment** mit Reste-Regal bleibt unten.

**Karte** (bestehende `_product-card`, nur `blocks/tp-card-aktion.liquid` ergänzen): Zeile
„4 m breit · noch 20 m“ statt nur m² und Restlänge. Plakette, rote UVP-Pille, Preis je m² und
Link zum Kettelteppich bleiben. Für Einzelstücke gibt es `blocks/tp-card-sonderposten.liquid`
(Art, Maße, Stückpreis) bereits.

**Produktseite:** bleibt. Rolle = Vorlage `rolle` mit Rechner für Meterware und Raummaß,
Restbestand, UVP-Zeile, Muster. Einzelstück = Vorlage `sonderposten`. Sinnvolle kleine
Ergänzungen an der Rolle: „zuletzt gemessen am …“ (Datum der letzten Inventur) und ein Satz zu
Abholung oder Lieferung im Umkreis. Rechner, Warenkorblogik und Musterbestellung werden nicht
angefasst.

**Zuführung** (wichtiger als die Seite selbst):

- Produktverweis auch beim Hausnamen: „Ähnlich als Restrolle: …“ nach Florart und Farbe statt
  nur nach Hersteller. Das ist eine Regeländerung in `blocks/tp-aktion-hinweis.liquid`.
- Schmales Band in den Teppichboden-Kategorien über den Karten („10 Restrollen ab 27,95 €/m²“).
- Hauptmenü ab 01.12. wieder auf `restposten` (Plan liegt vor).
- Shopping-Kampagne nur für Restrollen (w-250) und eBay (w-313) als zweite Kanäle.

### 12.4 Daten je Rest

| Angabe | Wofür | Quelle heute | Gepflegt? |
|---|---|---|---|
| Rollenbreite | Raum-Prüfung, Filter, Karte | `custom.rollenbreite`, Tag `breite_boden:` | aktive ja; 6 Entwürfe ohne Tag |
| Restlänge und Bestand in m² | Raum-Prüfung, „Noch x m²“, Kaufgrenze | `custom.max_roll_laenge_cm`, Bestand der Variante | ja, alle 16; Nachmessen alle 30 Tage im Control Center |
| Farbe | Filter | Tag `farbe:` | 5 von 10 aktiven, 0 von 6 Entwürfen |
| Preis je m² und Bereich | Karte, Filter | Variante, `custom.meterpreis_bereich` (stündlicher Abgleich) | aktive ja; Entwürfe erst nach Freischaltung |
| UVP mit Beleg | rote Pille | Vergleichspreis, `preis.vergleich_ist_uvp` | 10 von 10 aktiven; 1 Entwurf ohne |
| Florhöhe „ca.“ | Technik-Tabelle | `custom.florhohe`, von Hand gemessen | 9 von 10 aktiven; übrige Technikdaten lückenhaft |
| Fotos | Karte, Produktseite | Draufsicht plus Ecke von oben | aktive 1 bis 4 Bilder; Entwürfe je 1 |
| Datum der letzten Messung | Vertrauen | Protokoll im Control Center | intern ja, im Shop nicht sichtbar |
| Einzelstück: Maße, Art, Zustand, Herkunft, Preisbeleg | Karte, Vorlage `sonderposten` | Metafelder `sonderposten.*` (Abschnitt 3) | Definitionen da, kein Stück angelegt |
| Lagerplatz | Finden im Laden | `sonderposten.lagerort` | nein; Rollen sind im Laden rot markiert |
| Einkaufspreis | Kalkulation | privat, pauschal angesetzt | nicht je Rolle |

Für die Stufen 1 und 2 fehlt nur wenig: Farb-Tags an 5 Rollen, Tags und Bilder an den 6 Entwürfen.

### 12.5 Pflege im Laden

Zeiten sind Schätzungen, nicht gemessen.

| Vorgang | Heute | Aufwand | Schwachstelle |
|---|---|---|---|
| Rolle anlegen | messen, `npm run -s restrolle:plan`, Anlage von vier Produkten über die Admin API durch die KI | Laden rund 10 min je Rolle, Rest automatisch | Preis und UVP braucht jedes Mal den Inhaber |
| Foto | Ecke von oben aus der Hand plus Etikett | rund 5 min je Rolle | Bodenbild macht die KI, Sichtfreigabe nötig |
| Online-Verkauf | Bestand bucht sich selbst ab (Zuschnitt-Bündel) | keiner | Zuschnitt und Versand wie bei jeder Meterware |
| Ladenverkauf | von Hand im Control Center: Sonderposten → Rolle → „Ladenverkauf buchen“ | 1 min | wird es vergessen, verkauft der Shop Meter, die nicht mehr da sind; bisher keine Buchung im Protokoll |
| Nachmessen | alle 30 Tage, Zeile „Restrollen“ auf „Heute“ | rund 30 min für alle Rollen | einziges Netz gegen vergessene Ladenverkäufe |
| Einzelstück anlegen | Abschnitt 5 (Vorlage duplizieren, 8 Schritte) | rund 15 min je Stück | lohnt nur ab einer Mindestgröße und einem Mindestpreis |

Folgerung: Rollen kosten wenig Pflege je Euro Warenwert, Einzelstücke viel. Der Ausbau beginnt
deshalb bei den Rollen und nimmt Einzelstücke erst mit einer Größengrenze dazu.

### 12.6 Ausbaustufen

| Stufe | Inhalt | Aufwand | Nutzen | Braucht |
|---|---|---|---|---|
| **1 Sortiment und Daten vollständig** | 6 Entwurfsrollen freischalten (16 statt 10 Rollen, 1.235 statt 718 m²), Farb- und Breiten-Tags ergänzen, in die Kategorien einsortieren, Preisendungen klären; Basiszahlen festhalten (Einstiege, Verkäufe) und GA4 lesbar machen | S | mehr Auswahl sofort, Filter und Raum-Prüfung haben danach Daten, spätere Stufen werden messbar | Freigabe Preise und UVP je Rolle; kein Theme-Code |
| **2 Einstiegsseite nach Maß** | Faktenzeile, Raum-Prüfung, drei Gruppen, Karte mit Breite und Länge, Filter einschalten | M | beantwortet die erste Kundenfrage auf der Seite statt erst im Rechner | Stufe 1; Theme-PR, Test Desktop und 390 px |
| **3 Zuführung** | Verweis „ähnlich als Restrolle“ auch beim Hausnamen, Band in den Teppichboden-Kategorien, Menü ab 01.12. auf die Reste, Shopping-Kampagne, eBay | S bis M | hebt den Engpass Besucher; größter Hebel auf Verkäufe | Budget für die Kampagne, eBay-Freigaben (w-313) |
| **4 Einzelstücke** | Reste ab einer Mindestgröße als Stück mit festem Maß und Stückpreis (Technik aus Abschnitt 1 bis 9 ist gebaut), Kollektionsregel so, dass Verkauftes verschwindet, Gruppe „Einzelstücke“ wird sichtbar | M | macht aus 16 Artikeln einen Bereich zum Stöbern; verwertet Rollenenden | Regel Verkauf gegen Mustermaterial, Pilot nach Abschnitt 9 |
| **5 Fertigmaße und Laden-Abgleich** | gekettelte Teppiche in Standardmaßen aus Restrollen als fertige Artikel (deckt sich mit der eBay-Vorgabe), Meldung aus der Kasse bei nicht gebuchtem Ladenverkauf (Abschnitt 6, Weg C) | L | Kauf ohne Rechner, weniger Überverkaufsrisiko bei mehr Umsatz | Stufen 1 bis 4 laufen und verkaufen |

Reihenfolge: 1 vor 2, weil eine Maß-Suche über 10 Rollen wenig findet. 3 kann gleich nach 1
starten und parallel zu 2 laufen. 4 und 5 erst, wenn aus den Rollen Verkäufe kommen.

**Empfehlung: Stufe 1 zuerst.** Sie kostet am wenigsten, braucht keinen Theme-Code und liefert
die Zahlen, an denen sich die übrigen Stufen messen lassen.

### 12.7 Entscheidungen des Inhabers

Je Punkt eine Entscheidung, Empfehlung zuerst.

1. **Sechs Entwurfsrollen freischalten?** Empfehlung: ja, mit Preis und UVP je Rolle einzeln
   bestätigt; die Rolle ohne UVP geht ohne Pille online.
2. **Ab welcher Größe wird ein Rest verkauft statt Mustermaterial?** Empfehlung: ab 2 m Länge
   in voller Rollenbreite verkaufen, alles darunter bleibt Mustermaterial (Regel vom 21.10.).
3. **Auslaufware auf derselben Seite?** Empfehlung: ja, eine Einstiegsseite mit getrennten
   Gruppen; Alternative: Auslauf nur noch in den Warengruppen.
4. **Abholpreis zeigen?** Der Laden verkauft 5 €/m² günstiger als der Shop. Empfehlung: online
   ein Preis, dazu der Satz „Abholung in Oranienburg möglich“; ein zweiter Preis wäre eine
   Preis- und Checkout-Änderung.
5. **Werbebudget für Restrollen** (Shopping-Kampagne, w-250)? Empfehlung: kleines Tagesbudget
   für vier Wochen nach Stufe 1, dann an den Verkäufen entscheiden.
6. **Fertigmaße aus Restrollen** (Stufe 5)? Empfehlung: erst entscheiden, wenn eBay läuft;
   dieselben Maße dann in beiden Kanälen.

### 12.8 Entschieden am 2026-11-10 (Inhaber, per Klick)

| Nr. | Entscheidung |
|---|---|
| 1 | Die 6 Entwurfsrollen gehen online. Preise wie im Entwurf, die beiden auf ,99 werden ,95 (38,95 und 24,95 €/m²). Die Rolle ohne UVP geht ohne Pille online. |
| 2 | Reste ab 2 m Länge in voller Rollenbreite werden als Einzelstück verkauft, kleinere bleiben Mustermaterial. |
| 3 | Auslaufware bleibt auf der Einstiegsseite, in getrennten Gruppen (Restrollen, Einzelstücke, Auslauf). |
| 4 | Online ein Preis, kein Abholpreis. Nur der Satz „Abholung in Oranienburg möglich“. |
| 5 | Shopping-Kampagne nur für Restrollen: 10 € am Tag, 4 Wochen, danach an den Verkäufen entscheiden. Start nach Stufe 1. |
| 6 | Fertigmaße aus Restrollen (Stufe 5) werden eingeplant, sobald die Stufen 1 bis 4 laufen. |

Stufe 1 ist damit freigegeben und läuft als eigene Aufgabe. Die Stufen 2 bis 5 brauchen je
einen eigenen Auftrag.
