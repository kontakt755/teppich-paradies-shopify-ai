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

**Der Punkt „Zubehör" steht im Live-Menü `main-menu`** (nach Bodenleisten, vor
Service & Verlegung, mit acht Unterpunkten). Von den beiden Wegen, die hier früher
zur Wahl standen, ist der zweite gegangen worden: der Punkt wurde in `main-menu`
nachgezogen, statt ein Theme mit einem anderen Menü-Handle zu veröffentlichen.
Das Live-Theme referenziert unverändert `"menu": "main-menu"` in
`sections/header-group.json` – nachgeprüft am Theme mit `role: MAIN`, nicht am Repo.

Das Kopie-Menü **`main-menu-zubehoer`** („Hauptmenü mit Zubehör") ist am
2026-09-09 nach Freigabe **gelöscht** worden. Es war kein Fallback: kein Theme
referenzierte es, und es führte nur 7 Punkte ohne Untermenüs, während `main-menu`
40 Items hat – also kein Ersatzstand, sondern ein veralteter Teilstand, der bei
jeder Änderung an `main-menu` weiter auseinandergelaufen wäre.

Der ausgelesene Baum liegt vor dem Löschen gesichert in
`domains/shopify/menu-main-menu-zubehoer-geloescht-2026-09-09.json`; zum
Wiederherstellen dient `menuCreate` (die MenuItem-IDs darin werden dabei neu
vergeben). Es gibt damit genau **ein** Hauptmenü, `main-menu` – wer hier ein
zweites anlegt, baut den Drift neu auf.

Vor dem Löschen eines Menüs: Menüs sind storeweit und wirken sofort. Prüfen heißt
alle Themes gegen `sections/header-group.json` **und** `config/settings_data.json`
abgleichen, nicht nur das Live-Theme, und zusätzlich das Repository.

Das Mega-Menü steht auf `menu_style: collection_images` und zeigt Kollektionsbilder
erst, wenn die Zubehör-Kollektionen Bilder haben. Bis dahin erscheint der Punkt als
Textspalte – das ist Absicht, kein Fehler.

## Regeln für den Import von Lieferant A / B

- **Eigene, neutrale Produktnamen.** Kein Lieferantenname, keine Lieferanten-
  Artikelnummer im Titel. Muster: `<Produktart> <Eigenschaft>`, z. B.
  „Übergangsprofil Aluminium 40 mm silber", nicht „Lieferant A Alu-Profil 4711".
- **Keine Großhändler-Marken, Logos, Links** in Titel, Beschreibung, Bildern,
  Alt-Texten, Tags oder Metafeldern. Beschreibungen neu formulieren, nicht kopieren.
  Bilder vor dem Upload auf eingebrannte Logos prüfen.
- `vendor` = „Teppich Paradies" (kein Lieferant).
- **Echte Herstellernamen bei Zubehör** (Vorgabe 2026-09-08): Titel = `<Hersteller> <Produktbezeichnung>`
  (z. B. Marke + „JK 27 Universalklebstoff“), Hersteller in Beschreibung, Tag `marke: …` und
  Metafeld `custom.marke`. Keine erfundenen Eigennamen – die gelten nur für Bodenbeläge.
  Generische Profile ohne Hersteller bleiben neutral benannt.
- Technische Daten nur aus dem Lieferantendatenblatt, nie aus Bildern ableiten.
- Pflicht je Produkt: `custom.arten` mit genau einem Wert aus der Tabelle oben.
  Optional für Filter: `custom.material`, Tags `material: …`, `raum: …` wie bei
  Bodenleisten.
- Lieferantenseiten per `curl` lesen, neue Produkte per `productSet`
  (`produktimport-arbeitsweise.md`, Import-Skill für Lieferant A).

## Offen

- Kollektionsbilder für die Kacheln und das Mega-Menü: erst mit echten Produkten
  aus dem eigenen Shop belegen (keine Lieferantenfotos mit Logo).

## Erledigt

**Bodenleisten-Menü zeigt auf die Zubehör-Kollektionen** (2026-09-09). Die drei
Punkte „Übergangsprofile/Abschlussprofile/Kleber & Fixierung" im Zweig Bodenleisten
waren `HTTP`-Filterlinks auf `/collections/bodenleisten?filter.p.m.custom.arten=…`
und lieferten ein leeres Raster. Sie sind jetzt `COLLECTION`-Punkte auf
`zubehoer-uebergangsprofile` (5 Produkte), `zubehoer-abschlussprofile` (5) und
`zubehoer-kleber-fixierung` (7). „Sockelleisten" bleibt Filterlink – der greift.

Nicht zu verwechseln mit dem Vinyl-Fall (Commit 108467d): dort trug kein Produkt
den gefilterten Metaobjekt-Wert. Hier war das Metafeld richtig gesetzt, nur der
**Scope** falsch – die Kollektion `bodenleisten` enthält 9 Produkte, die per
Admin API nachweislich alle nur `sockelleisten` tragen. Die Profil- und
Kleberprodukte liegen in den Smart-Collections, wo sie hingehören. Deshalb
umgehängt und nicht entfernt.

`menuUpdate` ersetzt den gesamten Item-Baum: vorher alle Zweige mit ihren
MenuItem-IDs auslesen und unverändert zurückschreiben. Gegenprobe war, dass
alle 40 MenuItem-IDs vor und nach dem Schreibvorgang identisch sind.

„Kleber & Fixierung" steht seitdem bewusst zweimal im Menü – unter Bodenleisten
und unter Zubehör, beide auf dieselbe Kollektion.
