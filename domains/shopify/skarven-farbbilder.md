# Skarven Sockelleiste 60mm - Farbbilder vom Grosshaendler

Stand 2026-09-09. Quelle: Grosshaendler Lieferant A, Artikel
"Doellken S 60 TOP Kernsockelleisten". Einstieg z. B.
https://lieferant-a.example/de-DE/product/478364, der Farbwaehler dort fuehrt alle
62 Werte. Die Suche findet den Artikel nur mit dem Begriff "S60"; "S 60 flex life"
ergibt keinen Treffer. Die Suche laeuft clientseitig, also im Browser, die
Detailseiten dann per curl.

## 1. Sind 62 Farben echt?

Ja. Lieferant A fuehrt fuer diesen Artikel 62 Farbseiten, jede mit eigener Art.-Nr.
(ZUBSCHS60_*), und diese Nummern stimmen eins zu eins mit den 62 Varianten im
Shop ueberein. Die Nummern sind nicht durchgezaehlt, sondern haben Luecken -
also abgeschrieben, nicht erfunden. Ob alle 62 aktuell lieferbar sind, sagt die
Seite nicht; das klaert nur die Preisliste.

## 2. Zwei Bildsorten auf den Lieferant-A-Seiten - nur eine ist brauchbar

Jede Farbseite zeigt bis zu zwei Produktbilder:

- **525xxx-8FXC-prod.JPG** (grosses Hauptbild): **farblich unzuverlaessig.**
  Lieferant A zeigt hier fuer "beige" eine gruene, fuer "lichtgrau" eine blaue und
  fuer "weiss-grau" eine mintfarbene Leiste. Diese Bilder gehoeren nicht zur
  benannten Farbe und duerfen nicht als Farbmuster verwendet werden.
- **998xxx-8FXC-prod.JPG** (Alt-Text "Sockelleiste Doellken S 60 <Art.-Nr.>"):
  **farblich korrekt.** Gleicher Aufbau, gleicher Winkel, weisser Hintergrund.
  Das ist die Quelle, die wir verwenden.

Erkennung im HTML: das `<img>` mit `alt="Sockelleiste Doellken S 60 ZUBSCHS60_xxxx"`.
Der Bildpfad steckt base64-kodiert in der intellishop.cloud-URL.

## 3. Was am 2026-09-09 uebernommen wurde

17 Farben haben bei Lieferant A ein 998xxx-Farbfoto. Alle 17 wurden per
`productCreateMedia` + `productVariantsBulkUpdate(mediaId:)` an die passende
Variante gehaengt und vorher einzeln visuell gegengeprueft.

| Farbe (Lieferant A) | Art.-Nr. | Bild |
|---|---|---|
| 1148(4244) beige (B) | ZUBSCHS60_4244 | 998287-8FXC-prod.JPG |
| 4019/1082 braun (BR) | ZUBSCHS60_4019 | 998291-8FXC-prod.JPG |
| 1012(1202) lichtgrau (LG) | ZUBSCHS60_1202 | 998335-8FXC-prod.JPG |
| 1147(1184) grau (G) | ZUBSCHS60_1184 | 998337-8FXC-prod.JPG |
| 1144(1001) schwarz (S) | ZUBSCHS60_1001 | 998345-8FXC-prod.JPG |
| 2395 Nussbaum island | ZUBSCHS60_2395 | 998311-8FXC-prod.JPG |
| 2365 eiche hell | ZUBSCHS60_2365 | 998317-8FXC-prod.JPG |
| 2357 country gebeizt (EB) | ZUBSCHS60_2357 | 998327-8FXC-prod.JPG |
| 2339 eiche klassisch (EK) | ZUBSCHS60_2339 | 998329-8FXC-prod.JPG |
| 1005 schnee-weiß (SW) | ZUBSCHS60_1005 | 998343-8FXC-prod.JPG |
| 2782 quartett | ZUBSCHS60_TGS6 | 998265-8FXC-prod.JPG |
| 2781 salsa | ZUBSCHS60_TGS5 | 998267-8FXC-prod.JPG |
| 2780 boogie | ZUBSCHS60_TGS4 | 998269-8FXC-prod.JPG |
| 2485 smoked oak white | ZUBSCHS60_2485 | 998309-8FXC-prod.JPG |
| 2570 native oak | ZUBSCHS60_2570 | 998307-8FXC-prod.JPG |
| 2572 fashion oak | ZUBSCHS60_2572 | 998303-8FXC-prod.JPG |
| 2571 vintage desert | ZUBSCHS60_2571 | 998305-8FXC-prod.JPG |

## 4. Was der Grosshaendler nicht liefert

Fuer die uebrigen 45 Farben hat Lieferant A kein farbspezifisches Bild - dort steht
nur das generische Serienfoto (660852) bzw. im Shop das Raumfoto S60.jpg:

Sommerbuche natur, Sommereiche Greige, Sommereiche Natur, Natural Place, Grant Oak Brown, Blond Limed Oak, Spirit Oak Silver, Island Oak Honey, Rustic Pine Warm, Chene Gris, Ahorn Natur, Grey Limed Oak, Scandinavian Pine, Esche Blond, Country Oak, Western Oak, Sommereiche, Scandinavian Country Pl., Bleached Ash, Eiche grau, Eiche Classic, pinie, Wild Oak, Calistoga Cream, Aruba, Calistoga Grey, Alba Oak Cottage, Tuscany Walnut, Honigeiche, Eiche Orient, Victoriaeiche, Diele Rustikal, Fruchtbaum Medium, Esche weiss, Goldeiche Rustikal, Light Classic Oak, Twist, Vintage Oak Grey, platinsilber, weiß, (5012) weiß (W), weiß-grau (WG), alumetallic, anthrazit, champagner

Davon tragen 7 (champagner, anthrazit, alumetallic, weiss-grau, Weiss Standard,
Weiss RAL 9016, platinsilber) im Shop bereits eine Unifarb-Kachel (800x800 PNG)
aus einer frueheren Quelle. Die restlichen 38 - fast alle Holzdekore - haben
kein eigenes Bild. Das Theme zeigt sie deshalb als Namenskachel mit dem Hinweis
auf die kostenlose Musterbestellung, nicht mit einem fremden Foto.

Fuer Feldwin (Doellken Cubu flex life 40/60/80/100 und XL) fuehrt Lieferant A
ueberhaupt nur ein Bild je Hoehe - die technische Zeichnung. Dort ist vom
Grosshaendler nichts zu holen.

## 5. Geloeschte Fehlbilder

Am 2026-09-09 nach Freigabe durch Ahmet aus den Produktmedien entfernt, weil sie
Farben zeigten, die es in dieser Serie nicht gibt und die keiner Variante mehr
zugeordnet waren:

| Datei | zeigte |
|---|---|
| 525238-8FXC-prod.jpg | gruene Leiste |
| 525276-8FXC-prod.jpg | mintfarbene Leiste |
| 525278-8FXC-prod.jpg | hellblaue Leiste |

Die Originale liegen weiterhin beim Lieferanten unter
`https://media.lieferant-a.example/original/<nummer>-8FXC-prod.JPG` und liessen sich
jederzeit erneut laden.

## 6. Nachpruefung der verbliebenen 525xxx-Bilder

Am 2026-09-09 wurde jedes verbliebene 525xxx-Bild gegen das geprueft 998xxx-Foto
derselben Art.-Nr. gestellt (Sichtvergleich plus Mittelwert der Sichtflaeche in
HSV). Ergebnis: die 525xxx-Serie ist durchgehend gelb- bis olivstichig. Bei den
Holzdekoren weicht sie so weit ab, dass sie eine andere Farbe zeigt.

| Art.-Nr. | Farbe | alt (525xxx) | geprueft (998xxx) | Delta Saettigung | Urteil |
|---|---|---|---|---|---|
| 2485 | smoked oak white | hell, entsaettigt | hell, entsaettigt | 4 | passt |
| 1005 | schnee-weiss | weiss | weiss | 3 | passt |
| 1001 | schwarz | schwarz | schwarz | 6 | passt |
| 2395 | Nussbaum island | kraeftig goldgelb | graubeiges Holz | 30 | weicht ab |
| 2365 | eiche hell | senfgelb | helles Natureiche | 27 | weicht ab |
| 2339 | eiche klassisch | senf-/goldgelb | warmes Natureiche | 30 | weicht ab |
| 2357 | country gebeizt | oliv-/moosgruen | graues Driftwood | 40 | weicht ab |

Die Saettigungsdifferenz trennt die Faelle sauber: bis 6 passt es, ab 27 zeigt
das alte Bild eine andere Farbe. Reiner Farbton- oder Helligkeitsvergleich
taugt hier nicht, weil beide Serien unterschiedlich ausgeleuchtet sind.

Am 2026-09-09 nach Freigabe durch Ahmet entfernt: 525250, 525258, 525268, 525270.
Erhalten bleiben 525248, 525282 und 525284 als zusaetzliche Galeriefotos.

Damit sind aus der 525xxx-Serie sieben Bilder entfernt (drei mit Farben, die es
in der Serie nicht gibt, vier mit deutlichem Gelb-/Olivstich). Alle Originale
liegen weiterhin unter `https://media.lieferant-a.example/original/<nummer>-8FXC-prod.JPG`.

## 7. Dekorbilder vom Hersteller (2026-09-09)

Fuer die 38 Holzdekore ohne Lieferant-A-Foto liefert der Hersteller selbst ein
Dekormuster: Die Produktseite "S 60 flex life Top" auf doellken-profiles.com
listet je Dekor ein Bild (915 x 355 px) mit Nummer und Name als Bildunterschrift.
Zwei Nummern (2487, 2976) stehen dort nicht, wohl aber mit Name auf der Seite
der Linie "EP 60/13 flex life"; die Datei liegt im selben Ordner. Alle 38 wurden
als Kontaktbogen gesichtet (Holzton und Name passen), per `productCreateMedia`
(originalSource = Hersteller-URL) angelegt und per `productVariantsBulkUpdate`
der Variante mit derselben Nummer im SKU-Suffix zugeordnet. Alt-Text:
"Skarven Sockelleiste 60mm in <Farbe> (Dekor <Nr>)".

**Nicht uebernommen:** die Unifarben. Doellkens Datei `dekore/1245.jpg`
("szampański") zeigt ein Olivgrau (#676656), kein Champagner - die Datei ist
beim Hersteller falsch. Die 7 Unifarb-Kacheln (RAL-Hex) bleiben deshalb.

| Nr. | Farbe (Shop, Stand 2026-09-09) | SKU | Datei beim Hersteller | Beleg (Bildunterschrift) | Media-ID |
|---|---|---|---|---|---|
| 2022 | Vintage Eiche Grau | ZUBSCHS60_2022 | /fileadmin/dekorfinder/dekore/alle_produkte/2022.jpg | 2022 vintage oak grey | 73590395601230 |
| 2032 | Twist | ZUBSCHS60_2032 | /fileadmin/dekorfinder/dekore/alle_produkte/2032.jpg | 2032 twist | 73590395633998 |
| 2254 | Eiche Klassisch Hell | ZUBSCHS60_2254 | /fileadmin/dekorfinder/dekore/alle_produkte/2254.jpg | 2254 light classic oak | 73590395666766 |
| 2324 | Goldeiche Rustikal | ZUBSCHS60_2324 | /fileadmin/dekorfinder/dekore/alle_produkte/2324.jpg | 2324 goldeiche rustikal | 73590395699534 |
| 2330 | Esche Weiß | ZUBSCHS60_2330 | /fileadmin/dekorfinder/dekore/alle_produkte/2330.jpg | 2330 esche weiß | 73590395732302 |
| 2364 | Fruchtbaum Mittel | ZUBSCHS60_2364 | /fileadmin/dekorfinder/dekore/alle_produkte/2364.jpg | 2364 fruchtbaum medium | 73590395765070 |
| 2369 | Diele Rustikal | ZUBSCHS60_2369 | /fileadmin/dekorfinder/dekore/alle_produkte/2369.jpg | 2369 diele rustikal | 73590395797838 |
| 2388 | Victoriaeiche | ZUBSCHS60_2388 | /fileadmin/dekorfinder/dekore/alle_produkte/2388.jpg | 2388 victoriaeiche | 73590395830606 |
| 2396 | Eiche Orient | ZUBSCHS60_2396 | /fileadmin/dekorfinder/dekore/alle_produkte/2396.jpg | 2396 eiche orient | 73590395863374 |
| 2402 | Honigeiche | ZUBSCHS60_2402 | /fileadmin/dekorfinder/dekore/alle_produkte/2402.jpg | 2402 honigeiche | 73590395896142 |
| 2412 | Nussbaum Toskana | ZUBSCHS60_2412 | /fileadmin/user_upload/2412.jpg | 2412 tuscany walnut | 73590395928910 |
| 2425 | Alba Eiche Landhaus | ZUBSCHS60_2425 | /fileadmin/dekorfinder/dekore/alle_produkte/2425.jpg | 2425 alba oak cottage | 73590395961678 |
| 2447 | Calistoga Grau | ZUBSCHS60_2447 | /fileadmin/dekorfinder/dekore/alle_produkte/2447.jpg | 2447 calistoga grey | 73590395994446 |
| 2449 | Aruba | ZUBSCHS60_2449 | /fileadmin/dekorfinder/dekore/alle_produkte/2449.jpg | 2449 aruba | 73590396027214 |
| 2452 | Calistoga Creme | ZUBSCHS60_2452 | /fileadmin/dekorfinder/dekore/alle_produkte/2452.jpg | 2452 calistoga cream | 73590396059982 |
| 2487 | Wildeiche | ZUBSCHS60_2487 | /fileadmin/dekorfinder/dekore/2487.jpg | 2487 wild oak (Seite EP 60/13 flex life) | 73590396092750 |
| 2491 | Pinie | ZUBSCHS60_2491 | /fileadmin/dekorfinder/dekore/alle_produkte/2491.jpg | 2491 pinie weiß | 73590396125518 |
| 2493 | Eiche Klassik | ZUBSCHS60_2493 | /fileadmin/dekorfinder/dekore/alle_produkte/2493.jpg | 2493 eiche classic | 73590396158286 |
| 2495 | Eiche Grau | ZUBSCHS60_2495 | /fileadmin/dekorfinder/dekore/alle_produkte/2495.jpg | 2495 eiche grau | 73590396191054 |
| 2511 | Esche Gebleicht | ZUBSCHS60_2511 | /fileadmin/dekorfinder/dekore/alle_produkte/2511.jpg | 2511 bleached ash | 73590396223822 |
| 2518 | Skandinavische Landhausdiele | ZUBSCHS60_2518 | /fileadmin/dekorfinder/dekore/alle_produkte/2518.jpg | 2518 scandin. country plank | 73590396256590 |
| 2567 | Sommereiche | ZUBSCHS60_2567 | /fileadmin/dekorfinder/dekore/alle_produkte/2567.jpg | 2567 sommereiche | 73590396289358 |
| 2573 | Eiche Western | ZUBSCHS60_2573 | /fileadmin/dekorfinder/dekore/alle_produkte/2573.jpg | 2573 western oak | 73590396322126 |
| 2574 | Eiche Landhaus | ZUBSCHS60_2574 | /fileadmin/dekorfinder/dekore/alle_produkte/2574.jpg | 2574 country oak | 73590396354894 |
| 2619 | Esche Blond | ZUBSCHS60_2619 | /fileadmin/dekorfinder/dekore/alle_produkte/2619.jpg | 2619 esche blond | 73590396387662 |
| 2639 | Kiefer Skandinavisch | ZUBSCHS60_2639 | /fileadmin/dekorfinder/dekore/alle_produkte/2639.jpg | 2639 scandinavian pine | 73590396420430 |
| 2645 | Eiche Grau Gekalkt | ZUBSCHS60_2645 | /fileadmin/dekorfinder/dekore/alle_produkte/2645.jpg | 2645 grey limed oak | 73590396453198 |
| 2646 | Ahorn Natur | ZUBSCHS60_2646 | /fileadmin/dekorfinder/dekore/alle_produkte/2646.jpg | 2646 ahorn natur | 73590396485966 |
| 2660 | Chene Gris | ZUBSCHS60_2660 | /fileadmin/dekorfinder/dekore/alle_produkte/2660.jpg | 2660 chene gris | 73590396518734 |
| 2698 | Kiefer Rustikal Warm | ZUBSCHS60_2698 | /fileadmin/dekorfinder/dekore/alle_produkte/2698.jpg | 2698 rustic pine warm | 73590396551502 |
| 2813 | Island Eiche Honig | ZUBSCHS60_2813 | /fileadmin/dekorfinder/dekore/alle_produkte/2813.jpg | 2813 island oak honey | 73590396584270 |
| 2976 | Spirit Eiche Silber | ZUBSCHS60_2976 | /fileadmin/dekorfinder/dekore/2976.jpg | 2976 spirit oak silver (Seite EP 60/13 flex life) | 73590396617038 |
| 2989 | Eiche Blond Gekalkt | ZUBSCHS60_2989 | /fileadmin/dekorfinder/dekore/alle_produkte/2989.jpg | 2989 blond limed oak | 73590396649806 |
| 3101 | Grant Eiche Braun | ZUBSCHS60_3101 | /fileadmin/dekorfinder/dekore/alle_produkte/3101.jpg | 3101 grant oak brown | 73590396682574 |
| 3483 | Natural Place | ZUBSCHS60_3483 | /fileadmin/dekorfinder/dekore/alle_produkte/3483.jpg | 3483 natural place | 73590396715342 |
| 3606 | Sommereiche Natur | ZUBSCHS60_3606 | /fileadmin/dekorfinder/dekore/alle_produkte/3606.jpg | 3606 sommereiche natur | 73590396748110 |
| 3621 | Sommereiche Greige | ZUBSCHS60_3621 | /fileadmin/dekorfinder/dekore/alle_produkte/3621.jpg | 3621 sommereiche greige | 73590396780878 |
| 3889 | Sommerbuche Natur | ZUBSCHS60_3889 | /fileadmin/dekorfinder/dekore/alle_produkte/3889.jpg | 3889 sommerbuche natur | 73590396813646 |

## 8. Geloeschte Unifarb-Kacheln (2026-09-09)

Nach Freigabe durch Ahmet per `productDeleteMedia` entfernt: sechs 800x800-PNGs
(Unifarb-Kacheln fuer beige, braun, lichtgrau, grau, schwarz, schnee-weiss aus der
Zeit vor dem Lieferant-A-Fotoimport). Sie hingen an keiner Variante mehr und erschienen
in der Galerie als leere Farbquadrate. Media-IDs 73579091722574, 73579091755342,
73579091788110, 73579091820878, 73579091886414, 73579091919182. Die sieben
Unifarb-Kacheln, die noch an Varianten haengen (champagner, anthrazit, alumetallic,
weiss-grau, Weiss Standard, Weiss RAL 9016, platinsilber), bleiben.
