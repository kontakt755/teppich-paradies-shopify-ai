# Lieferant I – Fertigteppiche per Dropshipping

Stand 2026-10-22. Klarname, Portal-URL und Bestands-URL stehen nur lokal
(`~/teppich-paradies-analyse/lieferantendaten/INHALT.md`, `.env.local` im
Dienst-Checkout) und im Shop-Admin (Vendor, Metaobjekt `tp_lieferant` Handle
`lieferant-i`) – nie im Repository (AGENTS.md, Punkt 8).

## Sortiment im Shop

- Quelle: Artikelliste des Lieferanten (xlsx, rund 6.300 Artikel, Spalte
  „Status“ mit `Online`, `Neu`, `Auslaufware`). **Auslaufware wird nicht angelegt.**
- Ein Produkt je `HAUPT_ARTIKEL` (Qualitaet + Design + Farbe), Groessen als Varianten.
  Stand 22.10.: 305 Produkte, 2.953 Varianten aus 39 Qualitaeten.
- **Originalnamen** (Inhaber-Wunsch, Abweichung von der Eigennamen-Regel in
  `domains/shopify/produktimport-arbeitsweise.md`): Titel = Qualitaet, Designnummer,
  Farbe aus dem Artikeltext, Kategorie – z. B. „Pisa 4706 Grey Hochflor Teppich“.
  Vendor = Name des Lieferanten.
- Optionen: `Farbe` (deutsch, eine je Produkt) und `Größe`
  („160 × 230 cm“, „Ø 160 cm rund“). Reihenfolge: rechteckig, Laeufer
  (Laenge ≥ 2,5 × Breite), quadratisch, rund – je nach Flaeche. Der Block
  `tp-groessen-form` gruppiert die Kacheln danach (PR #1586).
- SKU = `ARTIKELNR`, Barcode = EAN, Kosten = „Stueckpreis Netto“, Gewicht = Brutto.
- Vorlage `dekofell`, Produktart `Wohnteppich`, Kategorie Heim & Garten > Dekoration > Teppiche,
  Kollektionen `teppiche` und `teppiche-standardgroessen`. Keine Muster.
- Variantenfelder: `einkauf.lieferant` → `lieferant-i`, `einkauf.route = SUPPLIER_DIRECT`,
  `einkauf.artikelnummer`, `einkauf.lieferant_produktname` (Artikeltext), `bestelleinheit = stueck`.
- Produktfelder: `service.lieferzeit = 3–5 Werktage`, `custom.material`, `custom.bildnachweis`.
- Bilder: alle Bild-URLs der Artikelliste, Variantenbild = erstes Bild des Artikels.

## Preis (Inhaber 2026-10-22)

```
VK brutto = (EK netto + 8,50 € Versand) × 2,0 × 1,19, aufgerundet auf ,99
```

- 8,50 € netto je Paket: in allen 32 Portal-Bestellungen 2022–2026 (auch 280 × 370 cm
  und Lieferung an eine Privatadresse); mehrere Pakete = Vielfache. Lieferseite und AGB
  nennen keinen Betrag („individuell festgelegt“).
- Faktor 2,0: Median VK netto / EK der 76 Teppiche in Standardgroessen (Spanne 1,7–2,5).
- Beispiele: EK 19,44 → 66,99 €; EK 55,57 → 152,99 €; EK 80,62 → 212,99 €.
- Der Listen-EK liegt teils ueber den zuletzt bezahlten Portalpreisen; bei einer neuen
  Preisliste Preise neu rechnen (Freigabe Inhaber, AGENTS.md).

## Bestandsabgleich

`npm run -s bestand:abgleich [-- --schreiben]` (`operations/scripts/bestand-abgleich.mjs`,
Logik in `operations/lib/lieferanten-bestand.mjs`, Tests in
`operations/tests/lieferanten-bestand.test.mjs`).

- Laedt die feste Bestands-CSV des Lieferanten (Semikolon; `item_no`, `EAN1`, `available`).
- Setzt fuer jede verfolgte Variante des Vendors den Wert `available` am eigenen Standort
  (Zuordnung per SKU, Ersatz per EAN). `available = 0` → ausverkauft (inventoryPolicy `DENY`).
  Varianten, die in der Datei fehlen, gehen auf 0.
- Schutz: weniger als 1.000 Artikel in der Datei, mehr als 20 % unserer Varianten fehlen
  oder mehr als 50 % gingen auf 0 → Abbruch ohne Schreiben (Exit 2).
  Geschrieben wird mit `changeFromQuantity`; kollidiert eine Bestellung, gleicht der naechste Lauf nach.
- Ohne `--schreiben` nur Plan und Beispiele.
- Status: `~/teppich-paradies-analyse/lieferant-i/bestand-status.json`, Protokoll `bestand.log` daneben.

### Betrieb

LaunchAgent `operations/launchagents/net.teppich-paradies.bestand-lieferant-i.plist.vorlage`,
sechsmal taeglich (6:10 bis 21:10, alle drei Stunden) aus `~/tp-dashboard`.
`.env.local` dort braucht `TP_LIEFERANT_I_BESTAND_URL`, `TP_LIEFERANT_I_VENDOR` und den
Shopify-Zugang mit `write_inventory` (wie der Sync-Dienst).

```
sed "s#__HOME__#$HOME#g" operations/launchagents/net.teppich-paradies.bestand-lieferant-i.plist.vorlage \
  > ~/Library/LaunchAgents/net.teppich-paradies.bestand-lieferant-i.plist
launchctl load ~/Library/LaunchAgents/net.teppich-paradies.bestand-lieferant-i.plist
launchctl kickstart -k gui/$(id -u)/net.teppich-paradies.bestand-lieferant-i   # sofort einmal
```

## Bestellen

Dropshipping ueber das B2B-Portal des Lieferanten (Login im Chrome des Inhabers):
Lieferadresse = Kunde, Versand UPS etwa 2 Tage nach Zahlung. Mehrere Artikel einer
Kundenbestellung in **eine** Portalbestellung legen – jede Bestellung kostet eigene Versandkosten.

## Neue Artikel / Auslauf

Erzeugungsskript und Rohdaten liegen lokal unter
`~/teppich-paradies-analyse/lieferantendaten/lieferant-i/`. Neue Artikelliste → Skript erneut
laufen lassen, nur neue Handles anlegen. Faellt ein Artikel auf „Auslaufware“, gilt die
Auslauf-Regel aus AGENTS.md (archivieren + 301).
