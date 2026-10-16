# Läufer nach Maß (Kokos und Sisal, Längen-Zuschnitt mit Einfassung)

Seit 2026-10-16. Kokos- und Sisalläufer, die Lieferant F auf die Länge des
Kunden zuschneidet, an beiden Schnittkanten einfasst und direkt an den Kunden
schickt. Der Kunde wählt Farbe, Breite und Rücken (Varianten), gibt Länge je
Läufer in cm und Anzahl an und wählt die Einfassung samt Bandfarbe.

Technisch ist das der Block `tp-laengen-zuschnitt` aus
[Profile nach Maß](profile-nach-mass.md) mit der Einstellung `modus = laeufer`.
Abrechnung, Warenkorbsperren und Maßprüfung gelten unverändert; hier steht nur,
was der Läufer-Modus zusätzlich tut.

## Produkte

| Handle | Inhalt |
|---|---|
| `cocora-kokoslaeufer-fischgrat-nach-mass` | Kokos Fischgrat, 11 Farben, 65–200 cm, teils Latexrücken |
| `cocora-kokoslaeufer-gemustert-nach-mass` | Kokos gemustert, 8 Dessins, teils Latexrücken (nur 200 cm) |
| `cocora-kokoslaeufer-panama-nach-mass` | Kokos Panama natur |
| `sisano-sisallaeufer-boucle-nach-mass` | Sisal Bouclé, 6 Farben, 65–200 cm, mit und ohne Latexrücken |
| `sisano-sisallaeufer-fischgrat-nach-mass` | Sisal Fischgrat und Zickzack, 11 Farben, 65–200 cm |
| `einfassung-laeufer-schnittkanten` | Einfassung beider Schnittkanten (Service, UNLISTED) |
| `wunschmass-pauschale` | 14,99 € Fertigungs- und Versandpauschale je Läufer (Service, UNLISTED, bestand schon) |

Eigennamen: Cocora (Kokos), Sisano (Sisal). Lieferantenlinie und Artikelnummer
stehen nur in `grosshandel.sku` und in den Einkaufsfeldern der Varianten
(`einkauf.artikelnummer`, `einkauf.lieferant_produktname`).

## Datenvertrag Läufer (Produkt)

Wie bei Profile nach Maß (`custom.preis_pro_001_lfm`, `service.max_laenge_cm`,
`service.min_seite_cm`, beide `number_integer`), dazu:

| Feld | Wert |
|---|---|
| Vorlage | `laeufer-nach-mass` (Block im Läufer-Modus, Einfass- und Pauschalprodukt sind dort gesetzt) |
| Produkttyp | `Läufer nach Maß` – nie „Service“ (verwaister Service) und nie „Teppich nach Maß“ (der Feed rechnet dort €/m²) |
| Option `Breite` | z. B. „90 cm“; **muss wörtlich** einer Breite des Einfassprodukts entsprechen |
| Option `Rücken` | „ohne Rücken“ / „Latexrücken“ |
| `service.lieferzeit` | „ca. 2–3 Wochen“ |
| SKU | `LFR<Breite 3-stellig>[L]_<Artikelnummer>`, z. B. `LFR090_1101`, `LFR200L_2208` |
| Tags | `laeufer-nach-mass`, `ohne-muster`, `material: kokos/sisal`, `raum: flur` |

`service.bohrung` brauchen Läufer nicht; der Block verlangt im Läufer-Modus
stattdessen ein Einfassprodukt und eine lieferbare Pauschale mit Preis > 0,
sonst rendert er nichts (fail closed).

## Einfassprodukt

`einfassung-laeufer-schnittkanten`: Option 1 `Breite` (65, 67, 90, 100, 120,
150, 160, 200 cm), Option 2 `Ausführung` (Baumwollband, Juteband), 16 Varianten,
SKU `LFR-EINF<Breite>_BW` / `_JUTE`. Die Bandfarben stehen nicht in Varianten,
sondern im JSON-Metafeld `service.bandfarben`
(`{"Baumwollband": ["Vanille", …], "Juteband": ["Natur"]}`) und landen als
Property `Bandfarbe` in der Zeile. Neue Breite bei einem Läufer = erst hier eine
Variante je Ausführung anlegen, sonst bietet der Block nur „ohne Einfassung“ an.

Der Kunde kann „ohne Einfassung – Schnittkanten offen“ wählen; der Block zeigt
dann einen Hinweis. Ketteln oder Gummiband bieten wir nicht an.

## Warenkorb und Bestellung

Ein Klick legt bis zu drei Zeilen mit derselben `_Gruppe` an:

1. Läufer: wie Profile nach Maß, statt `Bohrung` die Properties `Einfassung`
   und `Bandfarbe`.
2. Einfassung (falls gewählt): Menge = Anzahl Läufer, Properties `Zu Teppich`,
   `Ausführung`, `Einfassung`, `Bandfarbe`.
3. Pauschale: Menge = Anzahl Läufer, Properties `Zu Teppich`, `Ausführung`,
   `Läufer` – bewusst **ohne** `Maße`, weil die Maßprüfung `Maße` als Fläche liest.

Einfassung und Pauschale sind Service-Zeilen: Ohne Läufer in derselben Gruppe
sperren sie den Checkout, ihre Menge ist im Warenkorb gesperrt. Im Einkauf ist
die Pauschale Eigenleistung; die Einfassung wird bei Lieferant F mitbestellt.

Die interne Bestellmail zeigt bei Längenware mit `Einfassung` die Zeile
„Einfassung: Baumwollband, Bandfarbe Mohn“ statt der Bohrung. Nach einer
Änderung an `interne-bestellmail-block.liquid` die Admin-Vorlage per
`operations/scripts/bestellmail-admin-einsetzen.console.js` neu einsetzen
(erzeugt mit `node operations/scripts/build-bestellmail-console.mjs`).

## Preisregel (Inhaber 2026-10-16)

- **Läufer:** Meterpreis wie im Endkundenshop von Lieferant F, auf ganze Euro
  abgerundet; Variantenpreis = Meterpreis / 100 (je cm).
- **Einfassung:** Preis des Endkundenshops, 16,20 € je Meter Breite × Breite;
  67 cm wird wie 65 cm berechnet.
- **Pauschale:** 14,99 € je Läufer.
- **Einstandspreis je cm** = Coupon-Preis €/m² × Breite (m) × 1,04 × 0,85 / 100.
  Shopify speichert den Einstandspreis nur auf zwei Nachkommastellen
  (0,1253 → 0,13); die Marge im Admin weicht deshalb um bis zu 0,005 € je cm ab.
  Maßgeblich ist die Formel bzw. die Preistabelle in den Lieferantenrohdaten.
- Latex-Varianten, die der Endkundenshop nicht führt, sind nach der Regel
  1,8 × Coupon-Preis berechnet.

Preise ändern heißt Variantenpreise ändern: nur mit Freigabe des Inhabers.

## Veröffentlichung

Läufer nur im Onlineshop, nicht in Google & YouTube: Feed und Seite zeigen
verschiedene Preise (je cm gegenüber je Meter), Merchant Center lehnt das als
Preisabweichung ab. Kollektion: Teppiche (manuell sortiert, danach
`npm run -s auslauf:sortieren`). Keine Muster (`ohne-muster`); Muster bräuchten
das Versandprofil „Kostenlose Muster“ und damit eine Freigabe.

Rohdaten und Generator liegen außerhalb des Repositorys unter
`~/teppich-paradies-analyse/lieferantendaten/` (Läufer-Import vom 2026-10-15).
