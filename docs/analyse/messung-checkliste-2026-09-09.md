# Messung herstellen: Checkliste für Ahmet (Maßnahme 1)

Stand 2026-09-09. Gehört zu `SHOP_ANALYSE_2026-09-09.md`, Maßnahme 1.
Ausgangslage: 5.136 Sitzungen in 90 Tagen, 0 Checkouts — und niemand kann
sagen, ob das ein Kaufproblem oder ein Messproblem ist. Kein GA4-, Ads- oder
Meta-Tag liegt im Theme; im Admin existieren ein App-Pixel und ein Custom
Pixel, die nie per Testkauf verifiziert wurden. Aus der Remote-Session sind
Kundenereignisse, Google & YouTube-Kanal und GA4 nicht einsehbar (API-Scopes
`read_pixels` fehlen, Admin-Oberflächen nur im Browser).

Reihenfolge einhalten. Jeder Schritt hat ein „Fertig, wenn".

## A. Bestandsaufnahme im Admin (15 Minuten)

1. **Einstellungen → Kundenereignisse.** Für jedes Pixel notieren: Name,
   Status (verbunden/getrennt), Berechtigungen (Analyse/Marketing), und ob es
   ein App-Pixel (welche App) oder ein Custom Pixel (Code ansehen) ist.
   Fertig, wenn klar ist, welches Pixel an GA4, welches an Google Ads und
   welches an Meta sendet — und ob zwei Pixel dasselbe Ziel bedienen
   (Doppelzählung).
2. **Vertriebskanal Google & YouTube → Einstellungen.** Ist die
   GA4-Property verknüpft? Ist „Conversion-Tracking" aktiv? Welche
   Ads-Konto-ID? Fertig, wenn die GA4-Mess-ID (`G-…`) und die Ads-Konto-ID
   notiert sind.
3. **Einstellungen → Kundendatenschutz → Cookie-Banner.** Aktiv für EU?
   Standard „Zustimmung erforderlich"? Fertig, wenn bekannt ist, ob Besucher
   ohne Klick auf „Akzeptieren" gemessen werden (dann fehlen im Zweifel
   60–80 % der Sitzungen in GA4).

## B. Lead-Ereignisse anschließen (10 Minuten, nach Merge von PR #118)

4. Custom Pixel „TP Lead-Ereignisse" anlegen — Code und Erklärung in
   `docs/analyse/service-funnel-events.md`. GA4-Mess-ID aus Schritt 2
   eintragen.
5. In GA4 → Verwaltung → Ereignisse: `tp_lead_call` und
   `tp_lead_form_submit` als Schlüsselereignisse markieren.
6. In Google Ads → Ziele → Conversions: „Anruf über Website"
   (Import aus GA4: `tp_lead_call`) und „Anfrage über Formular"
   (`tp_lead_form_submit`) anlegen.
   Fertig, wenn ein Testklick auf „Direkt anrufen" auf
   `/pages/teppichboden-verlegen-lassen` in GA4 → Echtzeit als
   `tp_lead_call` erscheint.

## C. Testkauf (30 Minuten)

Vorbereitet ist der Rabattcode **`TESTKAUF-MESSUNG`** (100 %, einmal
einlösbar, 14 Tage gültig). Damit wird die Bestellung mit 0 € abgeschlossen,
ohne Zahlungsanbieter — alle Checkout-Ereignisse feuern trotzdem. Wer die
Conversion-*Werte* in Ads prüfen will, kauft stattdessen ohne Code ein
günstiges Zubehörprodukt (z. B. Acryl-Dichtstoff, 4,65 €) und erstattet danach.

7. Privates Browserfenster, Cookie-Banner **ablehnen**, ein Produkt öffnen und
   in den Warenkorb legen. Fertig, wenn in GA4 → Echtzeit **nichts**
   ankommt (sonst misst der Shop ohne Zustimmung).
8. Neues privates Fenster, Cookie-Banner **akzeptieren**. Produkt
   `alvora-eiche-bernstein-klebevinyl-2-5mm` öffnen → genau ein `view_item`.
   Ein Paket in den Warenkorb → genau ein `add_to_cart` mit Wert 162,72 €.
9. Zur Kasse → genau ein `begin_checkout` mit Warenkorbwert in EUR.
10. Code `TESTKAUF-MESSUNG` einlösen, Adresse Oranienburg, Bestellung
    abschließen → genau ein `purchase` mit Transaktions-ID und `EUR`.
11. In Google Ads → Conversions dieselbe Transaktions-ID prüfen, keine
    Doppelzählung. Meta nur dann als funktionsfähig werten, wenn der Events
    Manager Browser-/Server-Events und Deduplizierung zeigt.
12. Bestellung im Admin stornieren (Grund „Test"), Bestand ist nicht
    getrackt, nichts nachzubuchen. Rabattcode danach deaktivieren.
    Fertig, wenn Schritte 8–11 je genau ein Ereignis mit richtigem Wert
    zeigen. Jede Abweichung (0, 2, falscher Wert) ist ein Befund.

## D. Was danach gilt

- Erst wenn C bestanden ist, sind die Zahlen aus der Shop-Analyse
  („0 Checkouts") belastbar — und erst dann lohnt sich Google Ads (#55).
- Wöchentlich anschauen: Sitzungen → `add_to_cart` → `begin_checkout` →
  `purchase` **und** `tp_lead_call` + `tp_lead_form_submit`. Beide Trichter
  nebeneinander, weil der Shop beides ist: Onlineshop und Fachbetrieb.
- Ergebnis der Schritte 1–3 und 7–11 bitte als kurze Liste zurück (welches
  Pixel, welche IDs, welche Ereignisse mit welchen Werten). Damit kann der
  Agent die Doppelzählung ausschließen und die Analyse fortschreiben.

## Was der Agent schon erledigt hat

- Lead-Ereignisse im Theme (`snippets/tp-lead-events.liquid`, PR #118).
- Pixel-Code fertig (`service-funnel-events.md`).
- Rabattcode `TESTKAUF-MESSUNG` angelegt (100 %, 1 Nutzung, bis 2026-09-23).
