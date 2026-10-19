# Geschenkgutschein (Werkbank w-034)

Entscheidung Inhaber 2026-10-15: Geschenkgutscheine vor Weihnachten anbieten,
ohne App, mit Shopify-Geschenkkarten.

## Stand

- Tarif: Geschenkkarten sind enthalten (`shop.features.giftCards = true`).
  **Aktiviert seit 2026-10-16.** Einen eigenen Schalter gibt es im Admin nicht
  mehr: Vorher antwortete `productSet` mit `giftCard: true` noch
  `GIFT_CARDS_NOT_ACTIVATED`. Danach wurde unter Produkte → Gutscheine
  „Geschenkgutschein-Produkt hinzufügen“ geoeffnet, ohne zu speichern, und
  derselbe Aufruf ging durch. Die Gutschein-Einstellungen (Ablaufdatum,
  Apple Wallet) liegen unter Einstellungen → Zahlungen und sind unveraendert.
  Lesen per API scheitert ohne den Zugriffsbereich `read_gift_cards`.
- Entwurf angelegt 2026-10-16: Produkt `gid://shopify/Product/16160748994894`
  (Status DRAFT, in keinem Kanal), Daten wie unten; Bild aus der Werkbank
  (Gutscheinkarte mit Logo, ohne Betrag) haengt dran.
- Footer, Spalte „Service": Link „Geschenkgutschein“ erscheint automatisch,
  sobald das Produkt `geschenkgutschein` veroeffentlicht und verfuegbar ist
  (`blocks/tp-footer-links.liquid`). Kein Menueumbau.
- Produktseite: Standard-Template `product.json`; das Empfaengerformular
  (`gift_card_form`) ist dort schon eingeschaltet.

## Entwurf (angelegt 2026-10-16)

`productSet` mit `status: DRAFT`, `giftCard: true`, Handle `geschenkgutschein`,
Titel „Geschenkgutschein“, Hersteller „Teppich Paradies“, Produktart
„Geschenkgutschein“, Option „Betrag“ mit 25 / 50 / 100 / 250 €
(SKU `GUTSCHEIN-<Betrag>`, `inventoryItem: {tracked: false, requiresShipping: false}`),
Bild im Shop-Stil (Logo, Rot `#b0303f`, Sand `#e9c8a1`, ohne Betrag).

Beschreibung:

> Der Geschenkgutschein gilt für das gesamte Sortiment im Onlineshop von
> Teppich Paradies – Teppichboden, Teppiche, Vinyl-, Laminat- und Parkettböden
> sowie Zubehör.
> - Zustellung per E-Mail direkt nach der Bezahlung – auf Wunsch an die
>   beschenkte Person und zu einem gewählten Datum.
> - Eingelöst wird an der Kasse mit dem Gutscheincode. Ein Restbetrag bleibt
>   auf dem Gutschein erhalten.
> - Kein Postversand, keine Versandkosten.

Danach gegenpruefen (Produkt lesen: `isGiftCard`, Varianten, Bildstatus) und
erst nach Freigabe von Betraegen und Bild durch den Inhaber veroeffentlichen
(Onlineshop und Marktkatalog Deutschland). Nach dem Veroeffentlichen Lexikon
exportieren.

## Offen, nicht von Agenten zu entscheiden

- **Steuer:** Ein Gutschein fuer das ganze Sortiment ist in Deutschland in der
  Regel ein Mehrzweckgutschein (Umsatzsteuer erst bei Einloesung). Wie das in
  Shopify und in der Buchhaltung (Lexware) abgebildet wird, klaert der
  Inhaber mit der Steuerberatung.
- Einloesen im Laden: Der Laden kassiert nicht ueber Shopify POS; im Text
  steht deshalb nur „im Onlineshop“. Die Gutscheinseite
  (`templates/gift_card.liquid`) sagt das ebenfalls
  (`gift_cards.issued.how_to_use_gift_card` in `locales/de.json`); den
  QR-Code zeigt Horizon trotzdem an.
- Gueltigkeit: Shopify setzt standardmaessig kein Ablaufdatum; gesetzlich
  gilt die regelmaessige Verjaehrung. Kein Ablaufdatum versprechen oder
  setzen, ohne dass der Inhaber entscheidet.
