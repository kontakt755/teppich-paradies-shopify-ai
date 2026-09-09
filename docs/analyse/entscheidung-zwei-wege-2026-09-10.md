# Entscheidung: Zwei Wege, Startseite und Landingpages — Stand 2026-09-10

Auftrag von Ahmet (2026-09-09 abends): "Schau es dir in Ruhe nochmal insgesamt an und
stell dir die Frage: macht es Sinn mit den Boxen, oder nicht. Wenn ja, sollten die
Landingpages beim Klick besser aussehen. Erstmal nur analysieren und Entscheidung
treffen — Ausfuehrung morgen."

Sein Einwand, der die Analyse traegt: *"Wenn ich Werbung ueber Ads mache, dann finden
die Leute die Seite eh ueber Keywords — Treppenverlegung — dann kommen sie auf die
Treppenverlegung-Seite."*

Grundlage: die Seiten im Wegwerf-Theme `204060885326` (Stand PR #168, fuenf Commits),
die Einstiegszahlen aus `SHOP_ANALYSE_2026-09-09.md`, die Ads-Planung in
`docs/GOOGLE_ADS_TODAY.md`, die Templates der vier Verlegeseiten.

---

## 1. Ist-Zustand: was PR #168 gebaut hat

| Phase | Baustein | Dateien |
|---|---|---|
| 1 | Zwei Boxen unter dem Hero, Hero als Band | `sections/Startseite.liquid`, `snippets/tp-zwei-wege.liquid` |
| 2 | Service-Startseite mit Produktrastern | `sections/tp-service-start.liquid`, `sections/tp-laden-hinweis.liquid`, `templates/page.verlegeservice.json` |
| 3 | Modus: `?modus=service`, localStorage, Streifen, Aufmass-Band | `snippets/tp-modus.liquid`, `snippets/tp-modus-band.liquid`, `assets/tp-modus.css`, `blocks/tp-modus-aufmass.liquid`, `layout/theme.liquid` |
| 4 | Einstiegsblock am Fuss der vier Verlegeseiten | `sections/tp-service-einstieg.liquid`, vier `page.*.json` |

Alles im Entwurf, nichts live.

## 2. Nutzerwege: wo Besucher ankommen und wohin sie gehen

Einstiege in 90 Tagen (ohne Ads, Shop in der Bauphase):

| Einstieg | Sitzungen | Anteil |
|---|---|---|
| Startseite `/` | 1.993 | 39 % |
| `/pages/teppichboden-verlegen-lassen` | 798 | 16 % |
| `/pages/vinylboden-verlegen` | 672 | 13 % |
| `/pages/treppenverlegung` | 349 | 7 % |
| `/pages/liefer-verlegeservice` | 98 | 2 % |
| alle Kollektions- und Produktseiten zusammen | < 500 | < 10 % |

**Schon heute landen 37 % direkt auf den drei Verlegeseiten** — ohne eine einzige Anzeige.
Mit Ads kippt das weiter: Suchanzeigen fuer "Treppenverlegung Oranienburg" fuehren auf die
Treppenseite, Shopping-Anzeigen (siehe `GOOGLE_ADS_TODAY.md`, Merchant Center) auf
Produktseiten. Die Startseite wird zu einem Einstieg unter mehreren, vor allem fuer
Markensuche und Direktaufrufe.

Drei Wege, die es real gibt:

```
Markensuche / direkt  ->  Startseite   ->  Box  ->  Sortiment oder Service-Startseite
Suchanzeige           ->  Verlegeseite ->  Angebot / Anruf / (Produkte?)
Shopping-Anzeige      ->  Produktseite ->  Warenkorb / (verlegen lassen?)
```

Die vier Phasen in PR #168 bauen den ersten Weg aus. Die beiden anderen — die mit Ads
die groesseren werden — beruehren sie kaum.

## 3. Befund je Baustein

### Die zwei Boxen (Phase 1)

Funktionieren als Wegweiser fuer den ersten Weg. Kosten nichts, sind ueber
Editor-Einstellungen reversibel. **Aber sie sind kein Hebel** fuer den Traffic, der
gekauft wird. Aesthetisch: reine Textkaesten mit Haekchen, keine Bilder — der Shop hat
noch keine fertigen Produktfotos, die Projektfotos aus dem Kundenbilder-Raster waeren die
einzige Bildquelle.

### Der Modus (Phase 3)

Schaltet sich nur ueber die Startseiten-Box oder einen Link mit `?modus=service` ein.
Wer per Anzeige auf der Treppenseite landet und dort "Zu Klickvinyl" klickt, kommt
**ohne Modus** im Shop an; wer per Shopping-Anzeige auf einer Produktseite landet, sieht
das Aufmass-Band **nie**. Fuer genau den Traffic, um den es geht, ist der Modus
wirkungslos — und kostet Zustand (localStorage), einen Streifen auf jeder Seite und
Erklaerungsbedarf.

### Der Block auf den Verlegeseiten (Phase 4)

Jede Verlegeseite hatte bereits einen guten Abschluss (`final-cta`): *"Teppichboden
verlegen lassen? → Angebot anfragen · Direkt anrufen · WhatsApp schreiben"*. Der neue
Block `tp-service-einstieg` steht **direkt darunter** mit derselben Botschaft, einem
zweiten Button und einer zweiten Telefonnummer. Das ist eine Verdopplung, kein Mehrwert.

### Der Radius

`teppichboden-verlegen-lassen` sagt: *"Lieferung & lose Verlegung kostenlos — im Umkreis
von 15 km"*. Die neuen Bausteine sagen an 13 Stellen *"50 km Umkreis"* (aus Ahmets
Nachricht uebernommen). Beides auf einer Seite liest sich als Fehler. Vermutlich meinen
sie Verschiedenes — 15 km kostenlos ab 649 EUR, 50 km Einsatzgebiet — aber das muss die
Seite sagen.

### Die drei Verlegeseiten selbst

| Seite | Stand |
|---|---|
| `teppichboden-verlegen-lassen` | **gut**: echte Preise ("ab 649 EUR kostenlos geliefert und lose verlegt", "mit Band ab 8,95 EUR/m2"), Projektfotos (KaDeWe, Madame Tussauds, Kirche), klarer Abschluss |
| `vinylboden-verlegen` | **ordentlich**: drei Vinylarten mit Nutzen und Link, Abschluss; kein Preis, kein Foto im Kopf |
| `treppenverlegung` | **schwach**: Ueberschrift auf Weiss, drei Textabsaetze (Kokos, Sisal, Teppichlaeufer) ohne einen Produktlink, "Jahrelange Erfahrung" ohne Beleg, kein Preis. Fuer das Keyword mit der klarsten Kaufabsicht. |

## 4. Entscheidung

| Baustein | Entscheidung | Begruendung |
|---|---|---|
| Zwei Boxen (Phase 1) | **bleibt**, keine weitere Arbeit | Wegweiser fuer Marken-Traffic, reversibel |
| Service-Startseite (Phase 2) | **bleibt** als Menue-Ziel, keine weitere Arbeit | ordentlich, kostet nichts |
| Modus, Streifen, localStorage (Phase 3) | **raus** | erreicht Ads-Traffic nicht, kostet Zustand und Erklaerung |
| Aufmass-Band auf Produktseiten | **bleibt, immer sichtbar**, ohne Modus | ehrliches Angebot eines Verlegebetriebs, ein Satz mit Ort; Vorbild "Muster · Anfrage · Termin" bei der Teppichscheune |
| `tp-service-einstieg` (Phase 4) | **raus** aus den vier Templates | verdoppelt `final-cta` |
| Die drei Verlegeseiten | **hier gehoert die Arbeit hin** | dort landen die Anzeigen |

## 5. Was eine Landingpage braucht, die aus einer Anzeige traegt

Muster fuer alle drei, Treppenverlegung zuerst:

1. **Ein echtes Projektfoto im Kopf**, nicht eine Ueberschrift auf Weiss. Liegt im
   Kundenbilder-Raster ("Stufen und Podest verkleiden").
2. **Ort und Preisrahmen im ersten Bildschirm.** Die Teppichboden-Seite macht es vor.
   Fuer Treppen fehlt jede Zahl; selbst "ab X EUR pro Stufe" schlaegt "faire Preise".
3. **Ein Beleg, kein Versprechen:** Google-Bewertung mit Zahl oben, nicht erst unten.
4. **Produkte als verlinkte Auswahl mit Preis** — Kokos, Sisal, Teppichlaeufer sind heute
   Text ohne Ziel.
5. **Ein Weg zum Abschluss, mehrfach wiederholt** — nicht zwei verschiedene Bloecke.

Kein neuer Baustein, keine Architektur. Drei Seiten, jede fuer sich sauber.

## 6. Beantwortet von Ahmet (2026-09-10)

**Radius — drei Stufen, nicht eine Zahl:**

| Stufe | Bedeutung | Formulierung fuer die Seiten |
|---|---|---|
| 15 km | das Angebot: Lieferung und lose Verlegung kostenlos ab 649 EUR Warenwert | "kostenlos im Umkreis von 15 km" — nur dort, wo es um den Preis geht |
| 50 km | Einsatzgebiet, so weit wird gefahren | "in Oranienburg und 50 km Umkreis" — ueberall, wo es um das Ob geht |
| weiter | auf Anfrage, wenn es sich lohnt | "weiter auf Anfrage" als Nebensatz, kein Versprechen |

Damit ist der Widerspruch keiner: die Teppichboden-Seite spricht vom Angebot (15 km),
die Bausteine vom Einsatzgebiet (50 km). Beide Zahlen sind richtig — sie brauchen nur
jeweils das Wort, das sagt, was gemeint ist. Die 13 "50 km"-Stellen bleiben, die
Preisstellen sagen "15 km".

**Treppen — kein Preisanker.** "Treppen sind sehr unterschiedlich." Dann steht auf der
Seite auch kein Preis, und das Fehlen wird zum Argument statt zur Luecke:
*"Jede Treppe ist anders — offene oder geschlossene Stufen, Kanten, Podeste. Deshalb
schauen wir sie uns an und messen auf, kostenlos im Umkreis von 15 km."* Das Aufmass ist
der naechste Schritt, nicht der Preis. Genau so machen es die Wettbewerber mit
Massanfertigung (Teppichscheune: "Anfrage | Termin" statt Listenpreis).

## 7. Reihenfolge fuer die Ausfuehrung

1. **Rueckbau**: Modus raus (`tp-modus.liquid`, `tp-modus-band.liquid`, `tp-modus.css`,
   Verdrahtung in `layout/theme.liquid`, `?modus=` aus den Templates), `tp-service-einstieg`
   aus den vier Verlegeseiten, Aufmass-Band immer sichtbar, Radius vereinheitlichen.
2. **Treppenverlegung** neu aufbauen nach Abschnitt 5.
3. **Vinylboden-verlegen** nach demselben Muster nachziehen.
4. **Teppichboden-verlegen** nur angleichen — ist am weitesten.

**Status: Analyse und Entscheidung, offene Fragen beantwortet. Ausfuehrung nach Ahmets Freigabe — vorgesehen ab 2026-09-10.**
Die Kurzfassung steht als Kommentar in Issue #167.
