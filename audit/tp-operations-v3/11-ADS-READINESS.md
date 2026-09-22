# 11 – Ads-Readiness (Google Ads, Shopping, Merchant Center)

Stand aus `domains/marketing/google-ads-startvorbereitung.md` (2026-09-16) und `docs/google/tracking-und-feed-validierung-2026-09-11.md`.

## Was steht

Google-Tag aktiv, Consent Mode v2, 225 Feedprodukte (84 Klickvinyl + 141 Klebevinyl), Rollenware/Wunschmass bewusst ausgeschlossen, Rueckgaberichtlinie vorhanden, Preisangabe „inkl. MwSt., zzgl. Versand" auf jeder PDP.

## Blocker (in Reihenfolge)

| # | Blocker | Wer | Status |
|---|---|---|---|
| 1 | 225/225 Kanalprodukte `awaiting_review`, 0 approved | Merchant-Center-Diagnose oeffnen (Ahmet) | 🟠 |
| 2 | Versandrichtlinie `/policies/shipping-policy` 404 | Inhaber setzt Vorlage ein | 🟠 |
| 3 | 225/225 ohne GTIN und ohne `mm-google-shopping.custom_product=true` | per MCP setzbar (Massenschreiben, Freigabe) | ⬜ |
| 4 | Conversion-Aktionen fehlen (Kauf, Muster 15 € primaer; Anruf/WhatsApp sekundaer; Musterbestellung loest `purchase` 0 € aus) | Ads-Konto (Ahmet) | 🟠 |
| 5 | 8 SKUs doppelt an 16 Produkten, 41 Klebevinyl ohne SKU | Datenpflege (Freigabe, SKU-Grenze) | ⬜ |
| 6 | MPN-Schema: SKU = Lieferantennummer → alle Haendler desselben Lieferanten matchen; eigenes MPN-Schema noetig (`docs/MARKENSTRATEGIE.md:70-94`) | Entscheidung | ⬜ |
| 7 | Versand-/Rueckgabedaten im Merchant Center statt JSON-LD | Ahmet | 🟠 |
| 8 | Interne Verarbeitung skalierbar (dieses Vorhaben, Phasen 3a–3c) | Fable | ⬜ |

## Bedingung des Masterprompts

„Bevor wir mehr Besucher einkaufen, muss die komplette interne Verarbeitung skalierbar sein." Mindeststand vor dem ersten Klick: Order-Leseweg + Auftragsband + Beratungsfeld + Bestellmail eingesetzt + Ampel gruen fuer alle Feedprodukte (Paketware Lieferant A).

Kennzahlen: 5.258 Sitzungen / 40 Warenkorb / 15 Checkout / 0 Kaeufe (90 Tage). Mobile Lighthouse 65–71, zwei Eingriffe verworfen.
