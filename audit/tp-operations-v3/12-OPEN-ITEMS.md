# 12 – Offene Punkte

## Inhaberentscheidungen (blockieren)

1. **Token #34 (D3):** `shpat_` mit Order-/Fulfillment-Scopes fuer den Betriebs-Mac. Ohne ihn kein Auftragsband.
2. **Metafeld-Schema `einkauf.*` (D2):** Keys sind unveraenderlich – Schema aus `02-DATA-MODEL.md` §2 vor dem Anlegen bestaetigen.
3. **Beratungspflichtfeld im Warenkorb (D9):** sichtbare Theme-Aenderung; Text und Pflichtcharakter freigeben.
4. **Rollen (D11):** Benutzerliste und wer welche Rolle hat.
5. **Bestellmail im Admin einsetzen** und **Versandrichtlinie veroeffentlichen** (nur Inhaber).
6. **Masterprompt ab §60:** Einkaufsstatus-Werte nach TEIL, Wareneingang, Versand, Probleme, Reklamationen, Lager, Auswertungen, Einstellungen – der Prompt ist abgeschnitten. Bitte nachreichen.

## Fachliche Klaerungen (Lieferanten, nur lokal unter `~/teppich-paradies-analyse/`)

- lfm-Raster und Verschnittzugabe je Lieferant fuer Rollenware.
- Mindestabnahme Paketware (VE) je Lieferant.
- Direktversand: Konditionen, Neutralitaet (Rechnung/Werbung/Tracking), Musterversand.
- Bestellweg je Lieferant (Mail-Adresse, Portal, Format).
- Bestandsfuehrung: Fuehrt TP eigenen Lager-/Musterbestand? Heute `tracksInventory: false`.
- Kettelservice-Whitelist (104 Varianten) – Freigabe steht seit #188 aus.

## Technische Restpunkte

- OPS-010/011 Sync-Bugs; OPS-014 Security-Reviewer; OPS-015 `npm test`; OPS-016 Doppelungen.
- Lieferschein ohne Properties (OPS-012): Kommissionierlisten-Spalte vs. eigener PDF-Lieferschein.
- Lexware: erst lesend, HIGH-Risk, NEEDS_AHMET.
- Der laufende Frontend-Audit meldet TP-014 (Notizpfad lokal deaktiviert) und TP-016 (Stueckpreis nach Reconnect) – beide beruehren Cart-Daten, die Operations spaeter liest; vor 3b abgleichen.
