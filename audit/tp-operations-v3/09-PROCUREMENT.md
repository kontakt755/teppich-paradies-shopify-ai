# 09 – Einkauf / Beschaffung

## Ist

- Es gibt **keine Einkaufsfunktion**. Ablauf heute: Bestellmail lesen → manuell im Lieferantenportal/-mail bestellen. Volumen: 0 echte Bestellungen in 90 Tagen.
- Lieferanten (Pseudonyme, `domains/lieferanten/README.md`):

| | Lieferant A (+ Hausmarke von A) | Lieferant B | C / D |
|---|---|---|---|
| Anteil | 399 aktive Produkte | 5 Entwuerfe | nicht unabhaengig belegt |
| Bestellweg | Portal mit Kundenlogin; Preis/Bestand nur eingeloggt | Haendlerlogin | – |
| Direktversand | „ja, sofern Konditionen stehen" – unbelegt | ? | – |
| Kleinmenge Paketware | nein (teils mind. 5 VE) | nein (Gebinde 3,5–6 m²) | – |
| Kleinmenge Rollenware | ja (lfm) | ja (1 lfm, 200–500 cm) | – |
| Ketteln/Mass | Serviceartikel `TEPKETT_001/002` | kein Service | – |
| Musterversand | offen | offen | – |

- Datenbasis: `02-DATA-MODEL.md` §1. Deckung der Lieferantenfelder ist gering (OPS-002/003).

## Soll (Masterprompt §53–60)

**Gruppierung:** freigegebene Positionen → Gruppen nach `(lieferant, lieferziel, route)`. Direktversand-Positionen verschiedener Kunden werden **nie** zu einer Lieferadresse gemischt (§55).

**Einkaufs-ID:** `TP-EK-<JJMMTT>-<KUERZEL>-<NNN>`, Kuerzel = Pseudonym (A/B). Metaobjekt `tp_einkauf`.

**Einkaufsbestellung enthaelt:** Lieferant, Art.-Nr., Farbe, Farbnummer, Breite, Menge, Einheit, Kundenreferenz (Shopify-Bestellnummer), Lieferziel, Direktversandadresse falls Route SUPPLIER_DIRECT, interne Bemerkung.

**Mengenumrechnung:** `02-DATA-MODEL.md` §4. Offen: lfm-Raster je Lieferant, Mindestabnahmen, Verschnittzugabe fuer Rollenware beim Lieferanten.

**Bestellweg je Lieferant:** Feld `tp_lieferant.bestellweg` (mail/portal/pdf/csv/api). Start: **PDF + Mailentwurf, manuell gesendet** (D8). Portal-Automatisierung nur mit Freigabe und nie mit Zugangsdaten im Repo.

**Einkaufsstatus je Position:** OFFEN → FREIGEGEBEN → BESTELLT → BESTAETIGT → TEIL_GELIEFERT → GELIEFERT; daneben STORNIERT, PROBLEM. (Masterprompt §60 bricht nach „TEIL" ab – Werte ab TEIL sind Annahme, `12-OPEN-ITEMS.md`.)

**Blockaden vor Einkauf:** `ops.status` ∈ {BERATUNG_OFFEN, MASS_PRUEFUNG_OFFEN, PROBLEM} sperrt die Position.

## Produktampel / „Produkte unvollstaendig"

Berechnung nach `02-DATA-MODEL.md` §7. Ansicht listet aktive Varianten mit fehlenden Pflichtfeldern und dem konkreten Grund (Artikelnummer fehlt, Farbe fehlt, Lieferant fehlt, Route fehlt, Musterzuordnung fehlt). Kein neues Produkt geht live mit roter Ampel – Guard `npm run einkauf:guard` (geplant) analog `farbcode:guard`.

## Migration `grosshandel.sku` → `einkauf.*`

Der Freitext folgt meist dem Muster `SKU (Breite) / SKU (Breite) – Bezeichnung (Fb.NNN)` bzw. `Linie Jahr Qualitaet Farbnr Farbname`. Ein Skript zerlegt halbautomatisch, schreibt einen Report mit Konfidenz je Produkt; nur Treffer mit eindeutiger SKU-Zuordnung werden nach Freigabe geschrieben, der Rest bleibt `UNGEKLAERT`. Lieferantennamen im Freitext werden **nicht** in Reports uebernommen, die im Repo landen.
