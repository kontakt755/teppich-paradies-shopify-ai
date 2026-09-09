# Skarven Sockelleiste 60mm - Farbbilder vom Grosshaendler

Stand 2026-09-09. Quelle: jordanshop.de (W. & L. Jordan GmbH), Artikel
"Doellken S 60 TOP Kernsockelleisten". Einstieg z. B.
https://www.jordanshop.de/de-DE/product/478364, der Farbwaehler dort fuehrt alle
62 Werte. Die Suche findet den Artikel nur mit dem Begriff "S60"; "S 60 flex life"
ergibt keinen Treffer. Die Suche laeuft clientseitig, also im Browser, die
Detailseiten dann per curl.

## 1. Sind 62 Farben echt?

Ja. Jordan fuehrt fuer diesen Artikel 62 Farbseiten, jede mit eigener Art.-Nr.
(ZUBSCHS60_*), und diese Nummern stimmen eins zu eins mit den 62 Varianten im
Shop ueberein. Die Nummern sind nicht durchgezaehlt, sondern haben Luecken -
also abgeschrieben, nicht erfunden. Ob alle 62 aktuell lieferbar sind, sagt die
Seite nicht; das klaert nur die Preisliste.

## 2. Zwei Bildsorten auf den Jordan-Seiten - nur eine ist brauchbar

Jede Farbseite zeigt bis zu zwei Produktbilder:

- **525xxx-8FXC-prod.JPG** (grosses Hauptbild): **farblich unzuverlaessig.**
  Jordan zeigt hier fuer "beige" eine gruene, fuer "lichtgrau" eine blaue und
  fuer "weiss-grau" eine mintfarbene Leiste. Diese Bilder gehoeren nicht zur
  benannten Farbe und duerfen nicht als Farbmuster verwendet werden.
- **998xxx-8FXC-prod.JPG** (Alt-Text "Sockelleiste Doellken S 60 <Art.-Nr.>"):
  **farblich korrekt.** Gleicher Aufbau, gleicher Winkel, weisser Hintergrund.
  Das ist die Quelle, die wir verwenden.

Erkennung im HTML: das `<img>` mit `alt="Sockelleiste Doellken S 60 ZUBSCHS60_xxxx"`.
Der Bildpfad steckt base64-kodiert in der intellishop.cloud-URL.

## 3. Was am 2026-09-09 uebernommen wurde

17 Farben haben bei Jordan ein 998xxx-Farbfoto. Alle 17 wurden per
`productCreateMedia` + `productVariantsBulkUpdate(mediaId:)` an die passende
Variante gehaengt und vorher einzeln visuell gegengeprueft.

| Farbe (Jordan) | Art.-Nr. | Bild |
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

Fuer die uebrigen 45 Farben hat Jordan kein farbspezifisches Bild - dort steht
nur das generische Serienfoto (660852) bzw. im Shop das Raumfoto S60.jpg:

Sommerbuche natur, Sommereiche Greige, Sommereiche Natur, Natural Place, Grant Oak Brown, Blond Limed Oak, Spirit Oak Silver, Island Oak Honey, Rustic Pine Warm, Chene Gris, Ahorn Natur, Grey Limed Oak, Scandinavian Pine, Esche Blond, Country Oak, Western Oak, Sommereiche, Scandinavian Country Pl., Bleached Ash, Eiche grau, Eiche Classic, pinie, Wild Oak, Calistoga Cream, Aruba, Calistoga Grey, Alba Oak Cottage, Tuscany Walnut, Honigeiche, Eiche Orient, Victoriaeiche, Diele Rustikal, Fruchtbaum Medium, Esche weiss, Goldeiche Rustikal, Light Classic Oak, Twist, Vintage Oak Grey, platinsilber, weiß, (5012) weiß (W), weiß-grau (WG), alumetallic, anthrazit, champagner

Davon tragen 7 (champagner, anthrazit, alumetallic, weiss-grau, Weiss Standard,
Weiss RAL 9016, platinsilber) im Shop bereits eine Unifarb-Kachel (800x800 PNG)
aus einer frueheren Quelle. Die restlichen 38 - fast alle Holzdekore - haben
kein eigenes Bild. Das Theme zeigt sie deshalb als Namenskachel mit dem Hinweis
auf die kostenlose Musterbestellung, nicht mit einem fremden Foto.

Fuer Feldwin (Doellken Cubu flex life 40/60/80/100 und XL) fuehrt Jordan
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
`https://media.jordanshop.de/original/<nummer>-8FXC-prod.JPG` und liessen sich
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
liegen weiterhin unter `https://media.jordanshop.de/original/<nummer>-8FXC-prod.JPG`.
