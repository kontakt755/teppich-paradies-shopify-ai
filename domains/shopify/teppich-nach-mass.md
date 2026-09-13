# Teppich nach Maß: Raummaß und Einfassprodukte

Stand 2026-09-11. Code im Branch `feature/masstepich-konfigurator`. Die Produktdaten sind **noch nicht**
angelegt, das braucht eine ausdrückliche Freigabe (siehe unten). Ohne diese Daten rendern alle neuen Teile
nichts, der Shop bleibt also unverändert.

## Was der Kunde bekommt

| Wo | Was |
|---|---|
| Rollenware-Seite (`tp-rollware-rechner`) | Breite als Auswahl: feste Rollenbreiten oder „Wunschmaß – eigene Breite“ (Raummaß). Gezeigt wird nur der Raummaß-Preis je m², nicht seine Herleitung. Dazu eine Rollengrafik mit Schnittkante und Rest. |
| ebenda | Optional Kettelleisten (Höhe, Meter, Vorschlag = Umfang) und Haftunterlage (Rollen nach Fläche). Sie gehen im selben Warenkorb-Aufruf mit, verbunden über `_Gruppe`. |
| ebenda | Chips „Lieber als fertigen Teppich nach Maß?“ zu den Einfassprodukten, mit derselben Farbe vorgewählt. |
| Einfassprodukt (`templates/product.einfassung.json`) | Konfigurator: Form (Rechteck, rund, oval, nach Schablone, nach Skizze), Maße, Bandfarbe, Vorschau mit echter Teppichstruktur, Rechnung mit Fläche, Kante in lfm und Mindestpreis. Schablone und Skizze laufen als Anfrage (Kontaktformular und Foto per WhatsApp), nicht über den Warenkorb. |
| ebenda (`tp-einfass-wechsel`) | Wechsel zwischen den vier Einfassarten und zurück zur Meterware, die Farbe bleibt erhalten. |

## Eine Wahrheit, fail closed

Die Storefront liest **nur** öffentliche `service.*`-Metafelder. Freigegeben ist ausschließlich der exakte
Wert `Verfügbar`. Alles andere blendet das Angebot vollständig aus: kein Feld, ein anderer Wert, ein Tippfehler,
ein neues Produkt. Es gibt dann keinen deaktivierten Knopf und keinen Hinweis „auf Anfrage“.

| Metafeld | Ebene | Bedeutung |
|---|---|---|
| `service.einfassen` | Variante | Diese Farbe darf eingefasst werden. Schaltet Chips, Kettelleisten, Haftunterlage und die Varianten des Einfassprodukts frei. |
| `service.raummass` | Variante „Wunschmaß“ | Diese Raummaß-Variante ist freigegeben. |
| `service.einfassung` | Einfassprodukt | `Cover`, `Ketteln`, `Einfassband` oder `Paspelband` |
| `service.max_breite_cm` / `service.max_laenge_cm` | Einfassprodukt | Grenzen. Beim Cover gilt Rollenbreite − 10 cm (die Kante wird umgeschlagen); die Länge beträgt höchstens 1000 cm. |
| `service.formen` | Einfassprodukt | Liste aus Rechteck, Rund, Oval, Schablone, Skizze. Ohne Angabe gibt es nur Rechteck. |
| `service.mindestpreis` | Einfassprodukt | EUR, optional |
| `service.einfass_gruppe` | Meterware und Einfassprodukte | die vier Einfassprodukte |
| `service.einfass_basis` | Einfassprodukt | die Meterware, aus der zugeschnitten wird |
| `service.basisvariante` | Variante des Einfassprodukts | die Meterware-Variante derselben Farbe. Die Farbe wird nie über Namen zugeordnet. |

Lieferantenbezug steht nie in `service.*` und nie im Theme. `npm run masstepich:guard` prüft das gegen eine
Namensliste, die nur intern liegt: in der Konfiguration außerhalb des Repositorys oder in `TP_LIEFERANTEN_NAMEN`.
Auch Hashes wären hier keine Lösung, denn kurze Namen lassen sich per Wörterbuch zurückrechnen. Fehlt die Liste,
meldet der Guard das ausdrücklich, statt still zu bestehen.

## Preise

Die Preislogik bleibt unverändert: Variantenpreis × Menge, abgerechnet durch Shopify.

- **Raummaß:** eine Variante „Wunschmaß“ je Farbe, Preis je m² = Meterware-Preis × 1,35, auf Cent gerundet.
  Abgerechnet wird wie bei der Meterware auf volle m² aufgerundet.
- **Einfassprodukte:** Der Variantenpreis gilt pro 0,01 m² (`custom.preis_pro_001_qm`). Deshalb sind
  **nur volle Euro je m²** exakt darstellbar: 129 € geht, 129,90 € nicht. Der Planer meldet das als Konflikt.
- **Rund und oval** werden nach dem umschließenden Rechteck abgerechnet, denn so viel Teppich wird zugeschnitten.

## Werkzeuge

```
npm run masstepich:plan -- --snapshot <produkte.json>                 # Plan, führt nichts aus
npm run masstepich:guard                                              # Theme
npm run masstepich:guard -- --snapshot <produkte.json>                # zusätzlich Produktdaten
node --test qa/tests/masstepich-*.test.mjs
```

Die Freigabeliste liegt zusammen mit Aufschlag und Preisen in einer internen Konfiguration außerhalb des
Repositorys, und zwar **je Variante**: Eine später hinzugekommene Farbe ist nicht freigegeben.

Bei jedem Konflikt plant der Planer für diese Farbe bzw. dieses Produkt nichts. Konflikte sind:
- ein mehrdeutiger Preis,
- ein von Hand gesetzter Wert, auch an einer Wunschmaß-Variante,
- eine neue Variante,
- verschieden breite Rollen je Farbe,
- eine cm-genaue Meterware,
- ein Lieferantenname im Titel.

Die Entscheidung trifft dann ein Mensch.

## Stolperfallen, die hier schon Zeit gekostet haben

- `<svg>` hat keine Eigenschaft `hidden`. `svg.hidden = false` setzt nur eine JS-Eigenschaft, das Attribut
  bleibt stehen. Deshalb `setAttribute('hidden', '')` bzw. `removeAttribute('hidden')` verwenden.
- Zahlenfelder im Block-Schema erlauben nur eine Nachkommastelle. `18.75` bricht den Theme-Push. Die
  Deckung der Haftunterlage ist deshalb ein Textfeld „18,75“.
- Die Farbnummer steht in `custom.farbcode` und weicht teils von der SKU-Endung ab (`99` statt `099`). Neue
  Varianten kopieren die Metafelder von der Meterware-Variante, statt die Nummer aus der SKU abzuleiten.

## Vor dem Veröffentlichen offen

1. Preise je Einfassart (und Mindestpreis). Solange sie fehlen, legt der Plan die Produkte nicht an.
2. Warenkorb-Zähler: Einheiten zu 0,01 m² zählen als Stückzahl (1000 statt 1). Das gilt schon heute für
   jedes cm-genaue Produkt und muss vor dem Veröffentlichen der Einfassprodukte gelöst sein.
3. Die Raummaß-Variante erscheint wie jede Variante im Google-Feed. Ob sie ausgeschlossen wird, ist zu entscheiden.
4. Produkt für Kettelleisten fehlt noch. Solange es fehlt, erscheint der Schritt nicht.
5. `templates/product.rolle.json`: Block-Einstellungen (Kettelleisten, Haftunterlage) erst nach dem Merge von PR #191 setzen.
6. **Reihenfolge:** Wunschmaß-Varianten erst anlegen, wenn dieser Code live ist. Der bisherige Rechner erkennt
   eine Breitenoption mit dem Wert „Wunschmaß“ nicht mehr als Breite und zeigt dann nur noch eine feste Breite.
7. Schnellkauf und Variantenwähler außerhalb des Rechners prüfen (Kollektionskarten, Quick-Add):
   „Wunschmaß“ darf dort nicht wählbar sein. Sonst landet 1 m² ohne Maßangabe im Warenkorb.
