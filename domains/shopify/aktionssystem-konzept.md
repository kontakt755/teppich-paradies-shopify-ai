# Entscheidungsvorlage: zeitgesteuertes Aktionssystem

Stand 2026-09-21, read-only Recherche (Shopify Admin API + Theme-Code). Keine Aenderung
an Shopify oder Theme vorgenommen. Prozentsaetze, Zeitraeume und Regeln sind
Inhaberentscheidungen und werden hier nicht festgelegt.

## 0. Es gibt bereits ein Fundament - nicht bei Null anfangen

Der Shop hat seit **2026-09-20** (gestern, Inhaberentscheidung, dokumentiert in
`docs/shop-decisions.md`) ein Aktions-Datenmodell: Produkt-Metafelder im Namensraum
`aktion` (`aktion.start` Datum, `aktion.ende` Datum/leer, `aktion.klasse` Text-Enum
`preisanker|aktion|normal|kein-rabatt|premium`). Einzige Auswertung ist
`snippets/tp-aktion-aktiv.liquid`: "ja", wenn heute zwischen Start und Ende liegt.
Mindestens neun Stellen im Theme fragen bereits danach, bevor sie einen Streichpreis
zeigen: `snippets/price.liquid`, `snippets/tp-price-per-sqm.liquid`,
`snippets/cart-products.liquid`, `snippets/tp-teppich-ab-preis.liquid`,
`blocks/tp-einfass-konfigurator.liquid`, `blocks/tp-verlegeservice-hinweis.liquid` u. a.
Geschaeftsregel (Ahmet, 2026-09-20): Aktionspreis ist nie mit dem kostenlosen
Vor-Ort-Liefer-/Verlegeservice kombinierbar; die kostenlose Lieferung bis Bordsteinkante
bleibt in jedem Fall.

**Was das bereits loest:** Anzeige-Konsistenz (Streichpreis erscheint nur bei aktiver
Aktion, verschwindet automatisch nach `aktion.ende`), Kombinierbarkeit mit dem
Verlegeservice ist entschieden.

**Was es NICHT loest** (das ist die Luecke, die diese Vorlage schliesst): Es ist ein
reines **Anzeigefeld**. Der eigentliche Preis - `compare_at_price` und der Verkaufspreis
selbst - muss weiterhin von Hand je Variante geschrieben werden; das Metafeld schaltet
nur, ob ein vorhandener Streichpreis sichtbar wird. Es gibt **kein zentrales Aktions-Objekt**
(kein passendes Metaobjekt in der Definition-Liste, siehe unten) und **keinen
automatischen Shopify-Rabatt**, der den Checkout-Preis tatsaechlich senkt. Bei
5-25 % alle zwei Wochen auf ein wechselndes Sortiment ist "compare_at_price pflegen"
allein kein abrechnungswirksamer Rabatt, nur eine durchgestrichene Zahl.

## 1. Bestand (read-only erhoben)

- **Rabatte** (`discountNodes`, Titel/Codes nicht wiedergegeben): 3 Discount-Nodes.
  Zwei aktiv (ein Code-Rabatt seit Februar 2026 ohne Enddatum, ein Freeshipping-Code),
  einer **abgelaufen** (Code-Rabatt, 2 Tage Laufzeit im September). **Keine
  `DiscountAutomaticBasic`** vorhanden - also kein automatischer, zeitgesteuerter
  Rabatt im Einsatz.
- **compare_at_price > price, Anzahl Varianten:** nicht zuverlaessig ermittelt. Die
  Admin-Suche `productVariants(query: "compare_at_price:>0")` lieferte Treffer ohne
  gesetztes `compareAtPrice` zurueck (Stichprobe von 3, alle `null`) - der Suchfilter
  verhaelt sich hier nicht wie erwartet. **Als "nicht geprueft" kennzeichnen**, nicht
  raten.
- **Metafeld-Definitionen mit Aktionsbezug:** genau der Namensraum `aktion` (start,
  ende, klasse) auf Produktebene - siehe Abschnitt 0. **Kein Feld auf Variantenebene.**
- **Metaobjekt-Definitionen:** 22 vorhanden (`tp_farbe`, `tp_projekt`, diverse
  Standard-Taxonomie-Metaobjekte wie Material, Flortyp, Farbe). **Kein**
  Aktions-/Sale-Metaobjekt darunter.
- **Shop-Plan:** Basic (`shop.plan.displayName`), nicht Shopify Plus. Shopify Functions
  fuer Rabatte (Discount Functions) sind auf Basic ueber den App Store grundsaetzlich
  nutzbar, aber praktisch nur mit einer Rabatt-App - nativ eigene Functions zu
  deployen ist auf Basic eingeschraenkt/kostenpflichtig. **Nicht abschliessend
  geprueft**, welche App-Optionen genau auf diesem Plan freigeschaltet sind.
- **Installierte Apps mit Rabattbezug:** ueber die verfuegbaren GraphQL-Felder nicht
  abfragbar (`currentAppInstallations` existiert in diesem Schema nicht, kein anderer
  Read-Pfad gefunden). **Nicht geprueft.** Bekannt aus der Aufgabenstellung: ein
  App-Block `options-price-calculator` laeuft auf mehreren Produkt-Templates
  (Rechner-UI); ob diese App eigene Rabattlogik mitbringt, ist offen.
- **Theme - Streichpreis-Logik:** `snippets/price.liquid` (Zeilen ~202-210 Aktionspruefung,
  ~254-286 Sale-Darstellung inkl. €/m²-Suffix), `snippets/tp-price-per-sqm.liquid`
  (Zeilen ~22-31, rechnet den Paket-Streichpreis auf €/m² um). Beide zeigen den
  Streichpreis nur, wenn `tp-aktion-aktiv` "ja" liefert **und** `compare_at_price >
  price` - ein vergessener `compare_at_price` allein reicht nicht (S-20, 2026-09-20).
- **Rollenware-Rechner** (`blocks/tp-rollware-rechner.liquid`): Preisvorschau rechnet
  clientseitig aus `variant.price`, Menge = m² bzw. bei
  `custom.preis_pro_001_qm = true` Flaeche x 100 (Preis pro 0,01 m²). **Kein eigener
  Aktionspreis-Zweig im Rechner-JS gefunden** (nur Datenexport der Varianten inkl.
  `price`, kein `compare_at_price` im JSON-Block `data-rwc-data-*`) - der Rechner
  wuerde einen gesenkten `variant.price` automatisch uebernehmen (er liest den echten
  Shopify-Preis), zeigt aber keinen "vorher/nachher"-Vergleich in der eigenen
  Vorschau. Fuer eine Aktion auf Rollenware muesste das ergaenzt werden.
- **Einfasskonfigurator** (`blocks/tp-einfass-konfigurator.liquid`, Zeile ~39-42,
  ~335): fragt `tp-aktion-aktiv` bereits ab und gibt `compare_at_price` im
  JSON-Datenblock mit - ist also schon vorbereitet.
- **Warenkorb** (`snippets/cart-products.liquid`): rendert
  `item.line_level_discount_allocations` (Zeilen 279-318, fuer *automatische*
  Shopify-Rabatte gedacht) UND parallel die eigene `tp-aktion-aktiv`-Anzeige fuer
  `compare_at_price` (Zeilen 301-318). `final_line_price` (Zeile 402/405) ist der
  tatsaechlich abgerechnete Betrag inkl. aller Shopify-Rabatte. Zwei Anzeigepfade
  nebeneinander: ein echter automatischer Rabatt wuerde sauber in
  `discount_allocations` erscheinen, der jetzige `compare_at_price`-Pfad ist reine
  Kosmetik ohne Checkout-Wirkung.
- **Google-Feed** (`domains/shopify/google-feed-flaechenware.md`): Merchant Center
  gleicht Feedpreise gegen das Product-JSON-LD ab; Flaechenware traegt bereits eine
  UnitPriceSpecification (€/m²). Kein automatischer `sale_price` ohne echten
  `compare_at_price` am Produkt.

## 2. Optionen im Vergleich

| | a) Automatischer Shopify-Rabatt | b) compare_at_price geplant | c) Hybrid (Metafeld/-objekt + Rabatt) | d) Functions/Rabatt-App |
|---|---|---|---|---|
| Sichtbar auf PDP/Karte ohne Zusatz | Nein - wirkt erst im Warenkorb/Checkout | Ja, ueberall | Ja (Anzeige) + Ja (Abrechnung) | Ja, je App |
| Checkout-wirksam | Ja | Nein (nur Kosmetik) | Ja | Ja |
| Aufwand alle 2 Wochen | Start/Ende + Ziel im Rabatt-Editor setzen, ein Objekt | Preisschreibzugriff auf hunderte Varianten | Ein zentrales Feld/Objekt pflegen, Rabatt spiegelt es | App-UI, je nach App |
| Passt zu Menge = m² / x100 (0,01-m²-Preise) | Unklar: prozentualer automatischer Rabatt rechnet auf den Zeilenpreis, nicht auf den angezeigten €/m²-Rechnerpreis - **Rechner muesste den Rabatt selbst nachbilden, sonst weicht Vorschau vom Checkout ab** | Direkt: `variant.price`/`compare_at_price` sind schon die Rechengroessen des Rechners | Wie a), plus die Anzeige-Seite kennt den Prozentsatz fuer die Rechner-Vorschau | Wie a) |
| Zubehoer (Kettelleiste, Haftunterlage) in derselben Gruppe | Muss explizit in die Rabatt-Zielauswahl (Kollektion/Produkte) aufgenommen werden, sonst rabattiert nur der Hauptartikel | Muss einzeln gepflegt werden | Muss einzeln in die Zielmenge/-kollektion aufgenommen werden | Je App |
| Musterprodukte (0 EUR, `kostenloses-muster`) | Ausschliessen (Preis 0, Rabatt sinnlos) | Nicht betroffen (kein compare_at) | Ausschliessen | Ausschliessen |
| Mindestpreis-Logik Einfasskonfigurator (99 EUR ueber Menge, nicht Preis) | Rabatt senkt den Stueckpreis, die Mindestmenge-Regel bleibt in JS - **muss gegengeprueft werden, dass der rabattierte Preis die 99 EUR nicht unterschreitet, ohne dass der Konfigurator das weiss** | Betrifft die Anzeige, Mindestpreis-JS bleibt unberuehrt, aber Konfigurator liest aktuell `compare_at_price` schon mit | Beide Seiten sauber getrennt: Anzeige-Feld informiert den Konfigurator, Rabatt regelt den Checkout | Je App |
| Versandfrei-Schwelle | Warenkorbsumme sinkt durch den Rabatt - ein Kunde knapp ueber der Schwelle kann darunter rutschen; Kommunikation pruefen | Keine Wirkung auf Warenkorbsumme (nicht checkout-wirksam) | Wie a) | Wie a) |
| Kosten | 0 (Bordmittel) | 0 (Bordmittel) | 0 (Bordmittel, mehr Code/Guard-Pflege) | App-Gebuehr, hier nicht empfohlen ohne Kennzeichnung |
| Risiko | Anzeige und Abrechnung koennen auseinanderlaufen (PDP zeigt Normalpreis, Kasse rechnet weniger) | PAngV-Risiko bei rollierenden 2-Wochen-Zyklen (siehe Abschnitt 3), hoher Pflegeaufwand | Zwei Quellen muessen synchron sein - braucht einen Guard | Abhaengigkeit von Drittanbieter, Plan-Grenzen (Basic) pruefen |

**d) Functions/Rabatt-App** wird nur genannt, nicht empfohlen: Shop-Plan ist Basic,
Kosten und Funktionsumfang nicht recherchiert (kostenpflichtige App-Installation faellt
ohnehin unter die Sicherheitsgrenzen von `CLAUDE.md` und braucht Freigabe).

## 3. Recht und Plattform (Hinweis, keine Rechtsberatung)

- **PAngV §11 (Streichpreis-Regel):** Der als durchgestrichen gezeigte Preis muss der
  niedrigste Preis der letzten 30 Tage sein. Bei einer Aktion alle zwei Wochen ist das
  ein wiederkehrendes Problem: Aktion 1 endet, der Preis geht auf "normal" zurueck -
  aber wenn Aktion 2 zwei Wochen spaeter startet, war der "alte" Preis, den man jetzt
  wieder als Streichpreis zeigen will, in den letzten 30 Tagen selbst schon einmal der
  (hoehere) Ausgangspreis einer anderen Aktion. Das jetzige `aktion.klasse`-Feld
  (`preisanker`, `normal` etc.) deutet an, dass diese Frage schon gesehen wurde, aber
  die Auswertung dieser Klasse gegen die 30-Tage-Regel ist in `tp-aktion-aktiv.liquid`
  **nicht** implementiert - die Snippet-Logik prueft nur Start/Ende, keine Preishistorie.
  Das ist ein offener rechtlicher Befund, kein Kleinteil.
- **Google Merchant Center:** `sale_price`/`sale_price_effective_date` verlangen einen
  vorher real gueltigen Basispreis. Ohne `compare_at_price` am Produkt kommt bei einem
  rein automatischen Rabatt **kein** `sale_price` in den Feed - dafuer braucht es
  entweder weiterhin `compare_at_price` (Option b/c) oder Merchant-Center-Promotions
  als separaten Mechanismus (hier nicht recherchiert).
  Der Grundpreis €/m² (`tp-price-per-sqm.liquid`, `price.liquid`) muss den
  Aktionspreis zeigen, nicht den Paket-/Listenpreis - das ist bereits so gebaut.
- **Designregeln** (festhalten, nicht neu erfinden): keine Fake-Countdowns, keine
  kuenstliche Verknappung ("nur noch 2 Stueck", wenn Bestand nicht getrackt wird - der
  Shop trackt bei Rollenware ohnehin keinen Bestand), keine Dauer-Sonderangebote (ein
  `aktion.ende`, das nie erreicht wird, ist im Effekt ein Dauerrabatt und hoehlt sowohl
  die PAngV-Referenz als auch die Kundenwirkung aus).

## 4. Empfehlung

**Hybrid (Option c), auf dem bestehenden Fundament aufgebaut, nicht neu gebaut:**

1. Das Produkt-Metafeld `aktion.*` bleibt die **einzige Anzeige-Quelle** (Anzeige
   bereits an ~9 Stellen verdrahtet - Neubau waere Rueckschritt).
2. Ergaenzen um `aktion.prozent` (Zahl) als zusaetzliches Feld, damit Anzeige-Stellen
   (insbesondere der Rollenware-Rechner, der heute keinen Prozentsatz kennt) den
   Rabatt konsistent vorrechnen koennen, ohne den Prozentsatz doppelt zu pflegen.
3. **Parallel dazu** ein `DiscountAutomaticBasic` mit identischem Zeitraum
   (Start/Ende) und identischem Ziel (Kollektion/Produkte) als **Abrechnungsquelle** -
   das ist der fehlende Teil, ohne den PDP und Kasse auseinanderlaufen.
4. Ein Guard-Skript (`npm run aktion:guard`, analog zu den bestehenden Guards),
   das je aktivem `aktion.*`-Metafeld prueft, ob ein passender automatischer Rabatt
   mit demselben Zeitraum existiert - und umgekehrt meldet, wenn ein Rabatt laeuft,
   fuer den keine Anzeige gesetzt ist.
5. PAngV: `aktion.klasse` um eine belegte 30-Tage-Referenzpreis-Pruefung ergaenzen,
   bevor eine zweite Aktion in Folge auf dasselbe Produkt läuft - sonst lieber ganz
   auf den durchgestrichenen Vergleichspreis verzichten und nur den Aktionspreis mit
   Prozent-Badge zeigen (siehe offene Entscheidung unten).

**Begruendung:** Das bestehende Metafeld-System ist bereits das Anzeige-Rueckgrat und
funktioniert nachweislich (S-15/S-20/S-19, mehrere gemergte PRs). Es fehlt nur die
Abrechnungsseite und die Synchronisations-Absicherung - das ist deutlich weniger
Aufwand und Risiko als ein neues zentrales Metaobjekt oder ein Voll-Rabatt-System von
Grund auf, und es haelt sich an "wartungsarm": eine Pflegehandlung (Metafeld setzen),
kein doppelter manueller Preisschreibzugriff auf hunderte Varianten alle zwei Wochen.

## Offene Entscheidungen fuer den Inhaber

- Prozentsaetze je Aktion und Rhythmus (Start/Ende je Welle) - Geschaeftsentscheidung.
- Welche Sortimente/Kollektionen pro Welle - und ob Muster, Zubehoer (Kettelleiste,
  Haftunterlage), Musterservice und Verlegeservice **ausdruecklich ausgenommen**
  bleiben (die Nicht-Kombinierbarkeit mit dem kostenlosen Liefer-/Verlegeservice ist
  bereits entschieden, 2026-09-20).
- Kombinierbar mit bestehenden Rabattcodes (aktuell 1 aktiver Code seit Februar ohne
  Enddatum) - ja/nein, sonst Doppelrabatt moeglich.
- Streichpreis weiter anzeigen trotz PAngV-30-Tage-Risiko bei Zwei-Wochen-Rhythmus,
  oder nur Aktionspreis mit Badge ohne durchgestrichenen Vergleichspreis zeigen?
- Feed-Strategie: `compare_at_price` fuer Google weiterhin mitfuehren (wie heute
  vorbereitet) oder Merchant-Promotions statt Produktfeed-Preisaenderung?
- Soll die Versandfrei-Schwelle in der Kommunikation angepasst werden, wenn Rabatte
  Warenkorbsummen unter die Schwelle druecken koennen?

## Umsetzungsplan in Phasen

- **Phase 0 - Entscheidung:** Inhaber beantwortet die offenen Punkte oben.
- **Phase 1 - Anzeige-Infrastruktur im Arbeitstheme, hinter Schalter:**
  `aktion.prozent`-Metafeld ergaenzen; Rollenware-Rechner
  (`blocks/tp-rollware-rechner.liquid`) um Aktionspreis-Anzeige erweitern (bisher
  keiner); `npm run aktion:guard` bauen. Betroffene Dateien:
  `snippets/tp-aktion-aktiv.liquid`, `snippets/price.liquid`,
  `snippets/tp-price-per-sqm.liquid`, `blocks/tp-rollware-rechner.liquid` + zugehoeriges
  JS, `blocks/tp-einfass-konfigurator.liquid`, ein neues `workflow/`- oder `qa/`-Guard-Skript.
- **Phase 2 - Testaktion mit einem Testprodukt:** ein `DiscountAutomaticBasic` mit
  kurzer Laufzeit auf ein einzelnes Testprodukt, `aktion.*`-Metafelder identisch
  gesetzt; Guard-Skript gegenpruefen lassen.
- **Phase 3 - Live:** nach Freigabe auf die erste echte Welle ausrollen.
- **Tests vor jeder Phase:** Warenkorb (`item.line_level_discount_allocations` zeigt
  den Rabatt, `final_line_price` stimmt auf den Cent), Checkout-Summe gegen die
  PDP-Anzeige, €/m²-Anzeige (`tp-price-per-sqm.liquid`, `price.liquid`) zeigt den
  rabattierten Wert, Rechner-Vorschau (`tp-rollware-rechner.liquid`,
  `tp-einfass-konfigurator.liquid`) = tatsaechlicher Checkout-Preis auf den Cent,
  Mindestpreis-Logik des Einfasskonfigurators bleibt unterhalb/oberhalb der 99-EUR-
  Schwelle korrekt, Versandfrei-Schwelle wird bei rabattierter Warenkorbsumme richtig
  angezeigt.

## Umgesetzt 2026-09-22 (Anzeige) und Bedienung

**Entscheidungen des Inhabers (2026-09-22):** Abrechnung ueber einen automatischen
Shopify-Rabatt; kein durchgestrichener Vergleichspreis, sondern Hinweis mit Prozent und
Enddatum; nicht kombinierbar mit anderen Rabattcodes. Feste Ausnahmen wurden nicht
festgelegt - eine Aktion gilt nur fuer die Kollektion, die pro Welle gewaehlt wird.

**Gebaut:**
- Metaobjekt-Definition `tp_aktion` ("Aktion (TP)"): titel, prozent (1-50), kollektion,
  start, ende (Pflicht - keine Dauer-Sonderangebote), aktiv (Hauptschalter).
- `snippets/tp-aktion-laufend.liquid`: einzige Quelle der Frage "laeuft fuer dieses
  Produkt eine Aktion?"; bei Ueberschneidung gilt der hoechste Prozentsatz.
- `blocks/tp-aktion-hinweis.liquid`: "−15 % Aktion bis TT.MM.JJJJ – wird im Warenkorb
  abgezogen", in allen Produktvorlagen vor der Bewertungszeile; ohne laufende Aktion
  unsichtbar.
- Rollenrechner: Zeile "Aktion −15 %: −75,39 €" und Gesamtpreis nach Abzug; Abzug je
  Hauptposition auf den Cent gerundet wie Shopify. Zubehoer (Fussleiste,
  Haftunterlage) wird ohne Abzug gezeigt.

**Eine Aktion starten (beide Schritte, gleiche Werte):**
1. Shopify-Admin > Rabatte > Rabatt erstellen > "Betrag auf Produkte" > automatisch.
   Prozentsatz, gilt fuer die gewaehlte Kollektion, Startdatum, Enddatum (Pflicht),
   Kombination mit anderen Rabatten: alles aus.
2. Shopify-Admin > Inhalt > Metaobjekte > Aktion (TP) > Eintrag hinzufuegen: gleicher
   Prozentsatz, gleiche Kollektion, gleicher erster und letzter Tag, Aktiv an.

**Vor dem Start pruefen:** Produktseite eines Artikels der Kollektion zeigt Hinweis und
Rechnerabzug; ein Artikel ausserhalb zeigt nichts; Testwarenkorb zeigt denselben
Abzug wie der Rechner. **Nach dem Ende:** beide Seiten laufen durch ihr Enddatum von
selbst aus.

**Offen:** Produktkarten in Kollektionen zeigen die Aktion noch nicht; Zubehoer in der
Aktionskollektion wird im Rechner ohne Abzug angezeigt (im Warenkorb zieht Shopify ihn
trotzdem ab); Google-Feed bekommt keinen sale_price (Merchant-Promotions waeren der Weg).
