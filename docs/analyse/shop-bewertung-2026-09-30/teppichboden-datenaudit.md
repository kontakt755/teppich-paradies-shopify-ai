# Datenaudit Teppichboden: 111 Produkte der Kollektion `teppichboden`

Stand 2026-09-30, rein lesend über die Shopify Admin API. Gehört zu [README.md](README.md), dort stehen Methode, Auswertung und Vorschlag.

**Lesehilfe**

- *ist*-Spalten: Wert, wie er heute am Produkt steht. `custom.arten` ohne den Formatwert „Teppichfliesen“.
- *Konstruktion (Beleg)*: abgeleitet aus der Strukturangabe im Datenblatt von Lieferant A (Beleg **L**) oder, wo kein Datenblatt zuordenbar war, aus dem eigenen Produkttext (Beleg **T**, schwächer). Ohne Beleg steht **offen**.
- *Florklasse (rechnerisch)*: Einordnung der gepflegten Florhöhe nach dem Regelvorschlag im Bericht (Kurzflor bis 5,0 mm, Mittelflor über 5,0 bis unter 10 mm, Hochflor ab 10 mm). Nur gesetzt, wenn Shopwert und Polhöhe des Lieferanten übereinstimmen; „nur Shopwert“ heißt, ein Gegenbeleg fehlt.
- *Wolle*: ja nur bei belegter Schurwolle im Flor.
- Alle Tags `art:` lauten bei jedem Produkt `teppichboden` (Fliesen und Planken zusätzlich `teppichfliese`) und stehen deshalb nicht in der Tabelle. Tags zu Konstruktion oder Florhöhe gibt es an keinem aktiven Teppichboden.

## Rollenware (Meterware): 50 Produkte

| Produkt | `custom.arten` (ist) | `shopify.pile-type` (ist) | Florhöhe (ist) | Fasermaterial (ist) | Tags `material:` | Konstruktion (Beleg) | Florklasse (rechnerisch) | Wolle | Beleg | Abweichung / offen |
|---|---|---|---|---|---|---|---|---|---|---|
| Altessa | Schlinge | Kurzflor | 6 mm | Polypropylen | polypropylen | Schlinge | Mittelflor | nein | L | pile-type Kurzflor bei 6 mm |
| Alvento | Velours, Hochflor | Samt | 11,5 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |
| Amara | Schlinge | Kurzflor | 2,6 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Boucella | Schlinge, Wolle | Kurzflor | 3,3 mm | Schurwolle | schurwolle | Schlinge | Kurzflor | ja | L | Kurzflor fehlt in Arten; gewebt, nicht getuftet |
| Callista | Schlinge, Wolle | – | 3,6 mm | – | – | offen | offen | offen | – | Florhöhe 3,6 mm nicht gegenprüfbar, Lieferantendatenblatt ohne Polhöhe; Art Wolle gesetzt, aber kein Fasermaterial gepflegt und keines beim Lieferanten |
| Coralia | Velours | Hochflor | 8 mm | Polyamid | polyamid | Velours | Mittelflor | nein | L | pile-type Hochflor bei 8 mm |
| Corina | Velours | Hochflor | 7 mm | Polyester | polyester | Velours | Mittelflor | nein | L | pile-type Hochflor bei 7 mm |
| Corvella | Schlinge | Hochflor | 6 mm | Polyamid | polyamid | Schlinge | Mittelflor | nein | L | pile-type Hochflor bei 6 mm |
| Fibrella | Schlinge | Kurzflor | 2,2 mm | Sisal | sisal | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten; gewebt, nicht getuftet |
| Fortiva Nadelvlies | Nadelvlies | – | 5 mm | Polypropylen, Polyamid | polyamid, polypropylen | Nadelvlies | kein Flor | nein | L | Feld Florhöhe trägt 5 mm; laut Produkttext ist das die Stärke |
| Kalvea | Schlinge | Kurzflor | 2,3 mm | Polyamid | polyamid | Schlinge | Kurzflor (nur Shopwert) | nein | T | Kurzflor fehlt in Arten |
| Kerova | Velours | Hochflor | 9 mm | Polyester | polyester | Velours | Mittelflor | nein | L | pile-type Hochflor bei 9 mm |
| Kontura | Kurzflor | Kurzflor | 3,4 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten |
| Lanetta | Schlinge, Wolle | Kurzflor | 4 mm | Schurwolle | wolle | Schlinge | Kurzflor (nur Shopwert) | ja | T | Kurzflor fehlt in Arten |
| Lanova | Schlinge, Wolle | Kurzflor | 5 mm | Schurwolle | wolle | Schlinge | Kurzflor (nur Shopwert) | ja | T | Kurzflor fehlt in Arten |
| Merinda | Schlinge, Wolle | Kurzflor | 5 mm | Schurwolle | wolle | Schlinge | Kurzflor (nur Shopwert) | ja | T | Kurzflor fehlt in Arten |
| Nordica | Schlinge, Wolle | – | 8 mm | – | – | offen | offen | offen | – | Florhöhe 8 mm nicht gegenprüfbar, Lieferantendatenblatt ohne Polhöhe; Art Wolle gesetzt, aber kein Fasermaterial gepflegt und keines beim Lieferanten |
| Novaris | Schlinge | Hochflor | 5,5 mm | Polyamid | polyamid | Schlinge | Mittelflor | nein | L | pile-type Hochflor bei 5,5 mm |
| Nuvara | Velours | Samt | 7,5 mm | Polyester | polyester | Velours | Mittelflor | nein | L | – |
| Ombra | Schlinge | – | 4,5 mm | Polypropylen | polypropylen | Schlinge | offen | nein | L | gewebt, nicht getuftet; Feld Florhöhe trägt 4,5 mm; im Lieferantendatenblatt ist das die Gesamtstärke, eine Polhöhe fehlt dort |
| Palenza | Velours | Hochflor | 8 mm | Polyamid | polyamid | Velours | Mittelflor | nein | L | pile-type Hochflor bei 8 mm |
| Palura | Velours | Samt | 5 mm | Polypropylen | polypropylen | Velours | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Piumera | Velours, Hochflor | Samt | 19 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |
| Practiva | Schlinge | Kurzflor | 3,5 mm | Polypropylen | polypropylen | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Regalia | Velours, Wolle, Hochflor | Hochflor | 18 mm | Schurwolle | schurwolle | Velours | Hochflor | ja | L | – |
| Reganza | Velours, Hochflor | Hochflor | 12 mm | Polyamid | polyamid | Velours | Hochflor | nein | L | – |
| Rivena | Schlinge | Kurzflor | 3,5 mm | Polyester | polyester | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Rubira | Schlinge, Wolle | – | 5 mm | – | – | offen | offen | offen | – | Florhöhe 5 mm nicht gegenprüfbar, Lieferantendatenblatt ohne Polhöhe; Art Wolle gesetzt, aber kein Fasermaterial gepflegt und keines beim Lieferanten |
| Savena | Velours, Hochflor | Samt | 15 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |
| Sentira | Velours, Hochflor | Samt | 11,5 mm | Polyamid | polyamid | Velours | Hochflor | nein | L | – |
| Serena | Velours | Hochflor | 8 mm | Polyester | polyester | Velours | Mittelflor | nein | L | pile-type Hochflor bei 8 mm |
| Sisara | Schlinge | Kurzflor | 3 mm | Sisal | sisal | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten; gewebt, nicht getuftet |
| Sisola | Schlinge | Kurzflor | 3,5 mm | Sisal | sisal | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten; gewebt, nicht getuftet |
| Solera | Schlinge | Kurzflor | 3,5 mm | Polypropylen | polypropylen | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Solvana | Schlinge | Kurzflor | 4 mm | Polypropylen | polypropylen | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Tamira | Velours | Samt | 7 mm | Polyester | polyester | Velours | Mittelflor | nein | L | – |
| Tarona | Schlinge | – | 5,3 mm | Polypropylen | polypropylen | Schlinge | offen | nein | L | gewebt, nicht getuftet; Feld Florhöhe trägt 5,3 mm; im Lieferantendatenblatt ist das die Gesamtstärke, eine Polhöhe fehlt dort |
| Tessara | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Torvana | Velours | Hochflor | 5,6 mm | Polyamid | polyamid | Velours | Mittelflor | nein | L | pile-type Hochflor bei 5,6 mm |
| Vallora | Velours, Hochflor | Samt | 12 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |
| Vantana | Velours | Hochflor | 7 mm | Polyamid | polyamid | Velours | Mittelflor | nein | L | pile-type Hochflor bei 7 mm |
| Vellana | Schlinge, Wolle | Hochflor | 8 mm | Schurwolle | wolle | Schlinge | Mittelflor (nur Shopwert) | ja | T | pile-type Hochflor bei 8 mm |
| Velluna | Velours | Samt | 4 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Velory | Velours, Hochflor | Samt | 12 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |
| Verita | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Vireno | Velours | Samt | 9 mm | Polyester | polyester | Velours | Mittelflor | nein | L | – |
| Vivera | Schlinge | – | 5,1 mm | Polypropylen | polypropylen | Schlinge | offen | nein | L | gewebt, nicht getuftet; Feld Florhöhe trägt 5,1 mm; im Lieferantendatenblatt ist das die Gesamtstärke, eine Polhöhe fehlt dort |
| Woolara | Schlinge, Wolle | Hochflor | 6 mm | Schurwolle | wolle | Schlinge | Mittelflor | ja | L | pile-type Hochflor bei 6 mm |
| Wovena | Schlinge, Wolle | – | 3,2 mm | – | – | offen | offen | offen | – | Florhöhe 3,2 mm nicht gegenprüfbar, Lieferantendatenblatt ohne Polhöhe; Art Wolle gesetzt, aber kein Fasermaterial gepflegt und keines beim Lieferanten |
| Zafira | Velours, Hochflor | Samt | 10 mm | Polyester | polyester | Velours | Hochflor | nein | L | – |

## Teppichfliesen 50 × 50 cm: 51 Produkte

| Produkt | `custom.arten` (ist) | `shopify.pile-type` (ist) | Florhöhe (ist) | Fasermaterial (ist) | Tags `material:` | Konstruktion (Beleg) | Florklasse (rechnerisch) | Wolle | Beleg | Abweichung / offen |
|---|---|---|---|---|---|---|---|---|---|---|
| Basalta | – | – | – | – | – | offen | offen | offen | – | – |
| Brixana | Sauberlauf | Hochflor | 5,8 mm | Polyamid | polyamid | offen (Sauberlauf, getuftet) | Mittelflor | nein | L | pile-type Hochflor bei 5,8 mm |
| Brixena | Sauberlauf | Hochflor | 7 mm | Polyamid | polyamid | offen (Sauberlauf, getuftet) | Mittelflor | nein | L | pile-type Hochflor bei 7 mm |
| Brixona *(archiviert)* | Sauberlauf | Hochflor | 6 mm | Polyamid | polyamid | offen (Sauberlauf, getuftet) | Mittelflor | nein | L | pile-type Hochflor bei 6 mm |
| Centora | Schlinge | Kurzflor | 3,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Citvara | – | Kurzflor | 2,9 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Cosmira | Velours | Kurzflor | 4 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Cosvena | – | – | – | – | – | offen | offen | offen | – | – |
| Diorena | – | Kurzflor | 2,7 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Elemara | Schlinge | Kurzflor | 3,2 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Elevara | Schlinge | – | – | Polyamid | polyamid | Schlinge | offen | nein | L | – |
| Equinora | Schlinge | Kurzflor | 4,1 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Ethona | Schlinge | Kurzflor | 3 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Ethvira | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Feluria | Schlinge | Kurzflor | 5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Flovena | Schlinge | Kurzflor | 3,3 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Glorena | Velours | Hochflor | 5,8 mm | Polyamid | polyamid | Velours | Mittelflor | nein | L | pile-type Hochflor bei 5,8 mm |
| Grandia | Velours | Hochflor | 5,4 mm | Polyamid | polyamid | Velours (Cut-Loop, Schlingenanteil offen) | Mittelflor | nein | L | pile-type Hochflor bei 5,4 mm |
| Granova | Nadelvlies | – | – | Polyamid, Polyester, Polypropylen | polyamid, polyester, polypropylen | Nadelvlies | kein Flor | nein | L | – |
| Hedrona | – | Kurzflor | 4,2 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Ideora | – | Kurzflor | 3 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Imagora | – | Kurzflor | 2,7 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Impresa | Schlinge | Kurzflor | 5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Inkaria | – | Kurzflor | 3,3 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Intervana | – | – | – | – | – | offen | offen | offen | – | – |
| Joinara | – | Kurzflor | 5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Karvena | Nadelvlies | – | – | Polyamid | polyamid | Nadelvlies | kein Flor | nein | L | – |
| Kenoria | – | Kurzflor | 3,8 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Lanvira | – | – | – | – | – | offen | offen | offen | – | – |
| Levora | – | – | – | – | – | offen | offen | offen | – | – |
| Lineva | Schlinge | Kurzflor | 2,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Lisarda | – | Kurzflor | 3,7 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Loopara | Schlinge | Kurzflor | 2,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Maidena | – | Kurzflor | 2,5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Melbara | – | – | – | – | – | offen | offen | offen | – | – |
| Minerva | – | Kurzflor | 1,1 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Optivia | – | – | – | – | – | offen | offen | offen | – | – |
| Pathora | – | Kurzflor | 2,7 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Quadra Nadelvlies | Nadelvlies | – | – | Polyamid, Polyester, Polypropylen | polyamid, polyester, polypropylen | Nadelvlies | kein Flor | nein | L | – |
| Rambora | – | Kurzflor | 2,9 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Rapidia | – | – | – | – | – | offen | offen | offen | – | – |
| Relvana | – | Kurzflor | 3,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Retvana | – | Kurzflor | 5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Savagia | – | Kurzflor | 3,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Sigmara | – | Kurzflor | 3,5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Silvena | – | Kurzflor | 3,1 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Skyrona | – | Kurzflor | 2,5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Titanea | Nadelvlies | – | – | Polypropylen | polypropylen | Nadelvlies | kein Flor | nein | L | – |
| Titarno | Nadelvlies | – | – | Polypropylen | polypropylen | Nadelvlies | kein Flor | nein | L | – |
| Urbenia | – | Hochflor | 7 mm | Polyamid | polyamid | Schlinge | Mittelflor | nein | L | Schlinge fehlt in Arten; pile-type Hochflor bei 7 mm |
| Yutona | Schlinge | Kurzflor | 2,9 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |

## Teppichplanken: 10 Produkte

| Produkt | `custom.arten` (ist) | `shopify.pile-type` (ist) | Florhöhe (ist) | Fasermaterial (ist) | Tags `material:` | Konstruktion (Beleg) | Florklasse (rechnerisch) | Wolle | Beleg | Abweichung / offen |
|---|---|---|---|---|---|---|---|---|---|---|
| Fairona | – | Kurzflor | 5 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Genvora | – | Kurzflor | 3 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Schlinge fehlt in Arten; Kurzflor fehlt in Arten |
| Joinvia | – | Kurzflor | 5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Karmena | – | Kurzflor | 2,5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Polvana | Velours | Kurzflor | 4 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Resora | – | Kurzflor | 0,7 mm | Polyamid | polyamid | offen (Flachgewebe) | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Seravia | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Sigmavia | – | Kurzflor | 3,5 mm | Polyamid | polyamid | Velours | Kurzflor | nein | L | Velours fehlt in Arten; Kurzflor fehlt in Arten |
| Terzana | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |
| Travera | Schlinge | Kurzflor | 4 mm | Polyamid | polyamid | Schlinge | Kurzflor | nein | L | Kurzflor fehlt in Arten |

