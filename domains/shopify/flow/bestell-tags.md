# Shopify Flow: Bestell-Tags aus Warenkorb-Angaben (Vorlage, nicht eingerichtet)

Stand 2026-09-22. Shopify Flow ist kostenlos und Shopify-nativ, aber im Shop
noch nicht installiert (Admin → Apps → Shopify Flow). Nach der Installation
die vier Workflows unten anlegen. Quelle der Daten: Cart-Attribute aus
`snippets/tp-cart-beratung.liquid` und Line-Item-Properties der Muster
(`_Muster_ID`). Prioritaeten und Owner setzt Flow nicht.

## 1. Bestelltyp (TYP-MUSTER / TYP-WARE / TYP-MISCHBESTELLUNG)

Trigger: Order created.
Bedingung A: alle `order.lineItems` haben `customAttributes` mit key `_Muster_ID`
  ODER `sku` beginnt mit `M-` oder ist `TP-MUSTER-000` → Tag `TYP-MUSTER`.
Bedingung B: kein Line Item ist Muster → Tag `TYP-WARE`.
Sonst → Tag `TYP-MISCHBESTELLUNG`.
(In Flow: "Check if all line items match" mit `lineItem.sku starts with M-`.)

## 2. Beratung

Trigger: Order created.
`order.customAttributes` enthaelt key `Beratung` mit value `Ja`
  → Tags `BERATUNG-JA`, `BERATUNG-OFFEN`; Aktion "Send internal email" an
    kontakt@teppich-paradies.net mit Telefon (`Telefon`), Zeitfenster
    (`Rückruf`), Thema (`Beratungsthema`), Bestellnummer.
value `Nein` → Tag `BERATUNG-NEIN`.
Mitarbeiter ersetzt `BERATUNG-OFFEN` nach dem Anruf von Hand durch
`BERATUNG-ERLEDIGT` (gespeicherte Ansicht "Beratung offen" = Tag BERATUNG-OFFEN).

## 3. Masspruefung

Trigger: Order created.
`order.customAttributes` key `Maßprüfung` value `Ja` → Tag `MASS-PRUEFUNG-OFFEN`
  + interne Mail. Nach der Pruefung von Hand `MASS-PRUEFUNG-ERLEDIGT`.

## 4. Verlegung

Trigger: Order created.
`order.customAttributes` key `Verlegung` value `Angefragt` → Tag
`VERLEGUNG-ANGEFRAGT` + interne Mail.

## Gespeicherte Bestellansichten (Admin → Bestellungen → Ansicht speichern)

| Ansicht | Filter |
|---|---|
| Warenbestellungen | Tag `TYP-WARE` |
| Muster | Tag `TYP-MUSTER` |
| Mischbestellungen | Tag `TYP-MISCHBESTELLUNG` |
| Beratung offen | Tag `BERATUNG-OFFEN` |
| Masspruefung offen | Tag `MASS-PRUEFUNG-OFFEN` |
| Verlegung angefragt | Tag `VERLEGUNG-ANGEFRAGT` |
| Versand offen | Fulfillment-Status unfulfilled, ohne `TYP-MUSTER` |

## Gegenprobe nach Einrichtung

Testbestellung (Tag `TESTBESTELLUNG` von Hand) mit Beratung Ja + Telefon →
Bestellung muss innerhalb einer Minute `TYP-*`, `BERATUNG-JA`,
`BERATUNG-OFFEN` tragen; Admin-API: `order { tags customAttributes { key value } }`.
