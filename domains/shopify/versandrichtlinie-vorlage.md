# Versandrichtlinie – Vorlage zum Einfügen

**Status: fehlt im Shop.** `/policies/shipping-policy` antwortet mit 404
(geprüft 2026-09-16). Der Shop hat Kontakt, Impressum, Datenschutz,
Widerruf und AGB hinterlegt — die Versandrichtlinie nicht.

## Warum das vor einem Google-Ads-Start zählt

Das Google Merchant Center verlangt eine erreichbare Versandrichtlinie;
ohne sie werden Shopping-Anzeigen eingeschränkt oder abgelehnt. Shopify
verlinkt die Richtlinie außerdem im Checkout-Fuß — dort fehlt der Link
derzeit ersatzlos.

## Warum die Datei hier liegt und nicht direkt gesetzt wurde

Zwei Gründe:

1. Die Admin API verweigert `shopPolicyUpdate` mangels
   `write_legal_policies` — Rechtstexte sind dem Shop-Inhaber vorbehalten.
2. Auch mit Recht wäre das Anlegen eines Rechtstextes nichts, was ein
   Agent still erledigt.

## Einzufügen unter

Shopify-Admin → Einstellungen → Richtlinien → Versandrichtlinie

## Text

Der folgende Text ist **nicht neu formuliert**, sondern wortgleich der
Inhalt, der seit Längerem live auf `/pages/versand-lieferung` steht. Die
genannten Beträge stimmen mit den tatsächlichen Versandprofilen überein
(am 2026-09-16 gegen die Admin API geprüft: Deutschland 4,99 € und ab
50 € kostenlos, EU 13,99 €, international 19,99 €, Muster kostenlos).

---

Hier finden Sie die wichtigsten Informationen zur Lieferung unseres
regulären Online-Sortiments.

**Deutschlandweiter Versand**

Das reguläre Online-Sortiment wird deutschlandweit aus unserem
Liefernetzwerk versendet.

**Paket oder Spedition**

Je nach Produkt, Größe und Abmessungen erfolgt der Versand als Paket
oder per Spedition.

**Speditionslieferung**

Sperrige Bodenbeläge und Rollenware werden frei Bordsteinkante geliefert.

Frei Bordsteinkante bedeutet: Die Spedition bringt die Ware bis zur
nächstmöglichen, für das Lieferfahrzeug erreichbaren Stelle an Ihrer
Lieferadresse. Der Weitertransport ins Gebäude oder in die Wohnung ist
nicht Bestandteil der Lieferung.

**Lieferzeiten**

Lieferzeiten können produktabhängig sein. Die konkrete Angabe finden Sie
auf der jeweiligen Produktseite.

**Versandkosten**

Innerhalb Deutschlands 4,99 € je Bestellung, ab 50 € Bestellwert
versandkostenfrei. Muster verschicken wir innerhalb Deutschlands
kostenlos.

In andere EU-Länder 13,99 €, in weitere Länder (z. B. Schweiz, Norwegen,
Großbritannien) 19,99 €.

Den genauen Betrag sehen Sie im Checkout vor Abschluss der Bestellung.

**Fragen zur Lieferung**

Wir helfen Ihnen gerne persönlich weiter: Telefon 03301 573 37 20 oder
per E-Mail an kontakt@teppich-paradies.net.

---

## Zwei weitere Punkte an den Rechtstexten

Beide ebenfalls nur vom Inhaber änderbar:

**Sternchen in der Widerrufsbelehrung.** In der Aufzählung der vom
Widerruf ausgenommenen Waren tragen vier von fünf Punkten ein
stehengebliebenes `*` am Zeilenanfang („* PVC- oder Vinyl-Rollenware mit
kundenspezifischem Zuschnitt,"). Markdown-Reste in HTML — rein
kosmetisch, aber in einem Rechtstext sichtbar.

**Zwei verschiedene Telefonnummern.** Die Richtlinie „Kontakt" führt
`0176 57931322` (die WhatsApp-Mobilnummer) als Telefonnummer, das
Impressum dagegen `03301 5733720`. Im Checkout sieht der Kunde die
Mobilnummer. Falls das Absicht ist, bleibt es so — falls nicht, gehören
beide auf die Festnetznummer.
