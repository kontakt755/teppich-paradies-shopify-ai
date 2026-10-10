# Sonderposten: Produktstruktur, Pflege und Ladenverkauf

Teil von `SHOPIFY_WEITERENTWICKLUNG.md` (Phasen 4 und 5). Stand 2026-10-10 (Review-Befunde vom 09.10. eingearbeitet).

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
| Produkttyp | `Sonderposten` | einziges Merkmal (`snippets/tp-ist-sonderposten.liquid`); schließt das Stück aus allen Kategorie-Kollektionen aus (deren Regeln verlangen `TYPE = Teppichboden` usw.) |
| Theme-Vorlage | `sonderposten` (`templates/product.sonderposten.json`) | Maße, Fläche, Stückpreis, Zustand, Verfügbarkeit, kein Mengenfeld |
| Kollektion | „Reste & Sonderposten“, Handle `reste-sonderposten`, Vorlage `sonderposten` | Smart-Kollektion: `Produkttyp = Sonderposten` **und** `Bestand > 0` – verkaufte Stücke verschwinden von selbst |
| Bestand | Bestand verfolgen = an, Menge 1, „Verkauf bei Nichtverfügbarkeit fortsetzen“ = **aus** | kein Überverkauf, Shopify prüft serverseitig und beim Checkout. Fehlt eine der beiden Einstellungen, bietet das Theme das Stück **nicht** online an (`snippets/tp-sonderposten-kaufstatus.liquid`: „Online nicht bestellbar“, kein Kaufknopf, JSON-LD `OutOfStock`) und das Control Center bucht nichts. |
| SKU | `SP-0001`, fortlaufend | dieselbe Nummer steht auf dem Etikett am Stück im Laden und im SumUp-Artikel (siehe Abschnitt 6) |
| Grundpreis | Variante: Grundpreis-Messung Fläche = Fläche des Stücks, Referenz 1 m² (`showUnitPrice`) | Shopify zeigt €/m² nativ und gibt es an Google; der Block rechnet zusätzlich als Rückfall |

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
  Meterware. Deshalb nennt der Shop die Herkunft des Vergleichswerts ausdrücklich
  („gegenüber 243,46 € (regulär 25,90 €/m² × 9,40 m²)“). Ob das genügt, entscheidet der
  Inhaber – die sichere Alternative ist „kein Vergleichspreis, nur Stückpreis und
  €/m²“; dafür einfach `preis_beleg` leer lassen.

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

Voraussetzung: Die Shopify-Zugangsdaten des Dashboards brauchen zusätzlich
`write_inventory` und `write_products` (heute `read_products,write_products` in
`scripts/shopify-oauth.mjs`). Rechtevergabe macht der Inhaber selbst (Gedächtnis:
keine Rechtevergabe im Dev Dashboard durch Agenten).

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

Fehlt einer der Punkte, bleibt das Produkt im Status Entwurf. Massenanlage auf Verdacht gibt es
nicht.
