# Zubehör – Struktur, Zuordnung, Import-Regeln

Stand: 2026-09-08. Angelegt im Entwurfs-Theme „Zubehoer-Kategorie 2026-09-08 (Kopie Live)".
Die Theme-ID steht bewusst nicht hier (`npm run theme:guard`); sie ist über
`query { themes(first: 20) { nodes { id name role } } }` am Namen erkennbar.

## Datenmodell – ein Metafeld trägt alles

Zubehör wird über das bestehende Produkt-Metafeld **`custom.arten`**
(Typ `list.metaobject_reference`, Metaobjekt-Definition `teppich_art`) zugeordnet.
Dasselbe Metafeld treibt schon die Bodenleisten-Filter (`filter.p.m.custom.arten`)
und die Smart-Collections von Teppichboden/Vinyl. Ein Produkt, das einen dieser
Werte trägt, landet automatisch in „Zubehör" und in seiner Unterkategorie, und der
Storefront-Filter „Arten" zeigt den Wert ohne weitere Konfiguration.

| Unterkategorie | Metaobjekt (`teppich_art`) | Handle | Kollektion |
|---|---|---|---|
| Übergangsprofile | `gid://shopify/Metaobject/1724386279758` | `ubergangsprofile` | `zubehoer-uebergangsprofile` |
| Abschlussprofile | `gid://shopify/Metaobject/1724386509134` | `abschlussprofile` | `zubehoer-abschlussprofile` |
| Kleber & Fixierung | `gid://shopify/Metaobject/1724386640206` | `kleber-und-fixierung` | `zubehoer-kleber-fixierung` |
| Bauchemie | `gid://shopify/Metaobject/1805084295502` | `bauchemie` | `zubehoer-bauchemie` |
| Verlege- u. Dämmunterlagen | `gid://shopify/Metaobject/1805084328270` | `verlege-und-daemmunterlagen` | `zubehoer-verlegeunterlagen` |
| Reinigungsmittel | `gid://shopify/Metaobject/1805084361038` | `reinigungsmittel` | `zubehoer-reinigungsmittel` |
| Verlegeband | `gid://shopify/Metaobject/1805084393806` | `verlegeband` | `zubehoer-verlegeband` |
| Sauberlauf | `gid://shopify/Metaobject/1805084426574` | `sauberlauf` | `zubehoer-sauberlauf` |

Übergeordnet:

| Kollektion | Handle | Regel |
|---|---|---|
| Zubehör | `zubehoer` | ODER über alle acht Werte oben |
| Profile | `zubehoer-profile` | ODER über Übergangsprofile + Abschlussprofile |

Alle zehn Kollektionen sind Smart-Collections (Regel `PRODUCT_METAFIELD_DEFINITION`,
Definition `gid://shopify/MetafieldDefinition/439048896846`). Nichts wird von Hand
zugeordnet – **ein Produkt bekommt seinen Wert in `custom.arten`, fertig.**

Die Beschreibungstexte der Kollektionen sind die Kundentexte der Kacheln. Die
Kachel-Sektion liest sie aus, ein Editor-Override je Kachel ist möglich.

## Ein Produkt zuordnen

```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Product/<id>",
    namespace: "custom", key: "arten",
    type: "list.metaobject_reference",
    value: "[\"gid://shopify/Metaobject/1805084295502\"]"   # Beispiel: Bauchemie
  }]) { metafields { id } userErrors { field message } }
}
```

Danach gegenprüfen: `collection(id: ...) { products(first: 5) { nodes { title } } }` –
`userErrors: []` ist kein Beleg (siehe `produktimport-arbeitsweise.md`).

## Theme-Bausteine

| Datei | Zweck |
|---|---|
| `sections/tp-zubehoer-kacheln.liquid` | Kacheln (gross) oder Sprungleiste (chips); Blöcke = Kollektionen |
| `snippets/tp-zubehoer-icon.liquid` | Liniensymbole für Kacheln ohne Foto |
| `templates/collection.zubehoer.json` | Übersicht: Hero, 7 Kacheln, dann Produktraster mit Filtern |
| `templates/collection.zubehoer-profile.json` | Profile: 2 Kacheln (Übergang/Abschluss), Sprungleiste, Raster |
| `templates/collection.zubehoer-unterkategorie.json` | Alle Unterkategorien: Hero, Sprungleiste, Raster |
| `sections/Startseite.liquid` | fünfte Kategorie-Kachel „Zubehör" als letzter Punkt |
| `sections/header-group.json` | Menü `main-menu-zubehoer` |

Produktraster und Filter sind die von Bodenleisten (`_product-card` mit denselben
Blöcken, `npm run template:guard` hält das gleich).

## Navigation

Menü **`main-menu-zubehoer`** („Hauptmenü mit Zubehör", `gid://shopify/Menu/346703298894`)
ist eine Kopie von `main-menu` plus dem Punkt „Zubehör" nach Bodenleisten und vor
Service & Verlegung. Das Live-Theme nutzt weiter `main-menu`; beim Live-Gang entweder
das Theme mit `main-menu-zubehoer` veröffentlichen (passiert über das Repo) oder
den Punkt in `main-menu` nachziehen und den Handle zurückstellen.

Das Mega-Menü steht auf `featured_products` und zeigt Kollektionsbilder erst, wenn
die Zubehör-Kollektionen Bilder oder Produkte haben. Bis dahin erscheint der Punkt
als Textspalte – das ist Absicht, kein Fehler.

## Regeln für den Import von Jordan / M-Plus

- **Eigene, neutrale Produktnamen.** Kein Lieferantenname, keine Lieferanten-
  Artikelnummer im Titel. Muster: `<Produktart> <Eigenschaft>`, z. B.
  „Übergangsprofil Aluminium 40 mm silber", nicht „Jordan Alu-Profil 4711".
- **Keine Großhändler-Marken, Logos, Links** in Titel, Beschreibung, Bildern,
  Alt-Texten, Tags oder Metafeldern. Beschreibungen neu formulieren, nicht kopieren.
  Bilder vor dem Upload auf eingebrannte Logos prüfen.
- `vendor` = „Teppich Paradies" (kein Lieferant).
- Herstellermarken (z. B. ein Kleberhersteller) dürfen nur dann genannt werden,
  wenn der Kunde sie als Produktmarke kennt und der Name auf dem Produkt steht;
  Zweifel → weglassen und als offenen Fall notieren.
- Technische Daten nur aus dem Lieferantendatenblatt, nie aus Bildern ableiten.
- Pflicht je Produkt: `custom.arten` mit genau einem Wert aus der Tabelle oben.
  Optional für Filter: `custom.material`, Tags `material: …`, `raum: …` wie bei
  Bodenleisten.
- Lieferantenseiten per `curl` lesen, neue Produkte per `productSet`
  (`produktimport-arbeitsweise.md`, Skill `teppichparadies-jordanshop-import`).

## Offen

- Kollektionsbilder für die Kacheln und das Mega-Menü: erst mit echten Produkten
  aus dem eigenen Shop belegen (keine Lieferantenfotos mit Logo).
- Bodenleisten-Menü führt „Übergangsprofile/Abschlussprofile/Kleber" weiter als
  Filterlinks. Sobald Zubehör live ist, entscheiden, ob diese Punkte dort bleiben
  oder auf die Zubehör-Kollektionen zeigen.
