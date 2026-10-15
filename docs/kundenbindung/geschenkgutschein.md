# Geschenkgutschein (Werkbank w-034)

Entscheidung Inhaber 2026-10-15: Geschenkgutscheine vor Weihnachten anbieten,
ohne App, mit Shopify-Geschenkkarten.

## Stand

- Tarif: Geschenkkarten sind enthalten (`shop.features.giftCards = true`),
  im Shop aber noch **nicht aktiviert**: `productSet` mit `giftCard: true`
  antwortet `GIFT_CARDS_NOT_ACTIVATED`. Aktivieren ist eine Kontoeinstellung
  (Admin → Produkte → Geschenkgutscheine) und macht der Inhaber.
- Footer, Spalte „Service": Link „Geschenkgutschein“ erscheint automatisch,
  sobald das Produkt `geschenkgutschein` veroeffentlicht und verfuegbar ist
  (`blocks/tp-footer-links.liquid`). Kein Menueumbau.
- Produktseite: Standard-Template `product.json`; das Empfaengerformular
  (`gift_card_form`) ist dort schon eingeschaltet.

## Anlegen nach der Aktivierung (Entwurf)

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
  steht deshalb nur „im Onlineshop“.
- Gueltigkeit: Shopify setzt standardmaessig kein Ablaufdatum; gesetzlich
  gilt die regelmaessige Verjaehrung. Kein Ablaufdatum versprechen oder
  setzen, ohne dass der Inhaber entscheidet.
