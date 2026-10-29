# Control Center – Fortschritt

Format je Inkrement: Änderung · Test · offene Risiken/Annahmen · nächste Stufe.

## 2026-10-29 · Packstation: „Verschickt“ ganz oder gar nicht, Suche ohne Fertiges (#1811)

- **Geaendert:** Fortsetzung von #1810 nach Wunsch des Mitarbeiters vom 29.10.
  - „Verschickt – Kunde informieren“ ist jetzt ein einziger Aufruf (`aktion: 'verschickt'`) statt je
    Bestellung aus dem Browser. Der Server prüft erst alle Bestellungen des Umschlags (Fehlmenge,
    Musterautomatik). Geht eine nicht, kommt „Nicht verschickt, keine Mail – #…“ und nichts ist
    geschrieben. Danach stehen alle lokalen Schritte „raus“, bevor Shopify antwortet. Bisher zerfiel
    ein Umschlag mit zwei Bestellungen nach der ersten, und der Rest stand ohne Gepackt-Vermerk wieder
    im Packen.
  - Was in Shopify nicht sicher als versendet gemeldet ist, bleibt als roter Hinweis oben in der
    Packstation stehen, mit Link zur Bestellung, bis „Verstanden“ geklickt wird. Bisher kam nur ein
    Toast, und der Umschlag war schon weg.
  - Suche und „Muster kommt an“ zeigen nur offene Arbeit. Gepackte Umschläge und versandte
    Bestellungen zählen nicht mehr mit. Vorher verdrängte ein fertiger Kunde mit dem besseren Treffer
    den Kunden, der das Muster braucht. Unter der Suche steht „N fertige Bestellungen passen auch –
    Trotzdem zeigen“. Das gilt nur für diese eine Suche, die Fertigen stehen dann hinten.
  - Versandbestätigung im Shopify-Admin: Fußzeile in Sie-Form (README Benachrichtigungen).
- **Getestet:** `packstation-versandmail.test.mjs` neu, 8 Tests mit der Versand-Attrappe:
  - Gepackt bucht nichts. Verschickt bucht mit Mail.
  - Zweiter Klick und Zurücknehmen ändern Shopify nicht.
  - Ohne Zugang wird nachgebucht.
  - Vorbeigebrachte Muster gehen ohne Mail raus.
  - Rolle „lesen“ bekommt 403.
  - Zwei Bestellungen mit Sperre ergeben 409 ohne Schreiben.
  - Bei zwei Bestellungen stehen beide lokal auf „raus“, bevor Shopify antwortet.

  `muster-packen.test.mjs` (`offeneSuche`, `handTreffer`) und `packstation-arbeitslisten.test.mjs`
  (Hinweis, gebundenes `mpfertig`, Storniert bleibt sichtbar) sind angepasst. Die 22 bis zum 29.10.
  gepackten Bestellungen sind von Hand in Shopify gebucht, die 11 vom 28./29.10. mit Mail.
  Unabhängige Prüfung des Diffs (4 Blickwinkel, jeder Befund gegengeprüft): 14 Befunde, behoben u. a.
  Verschickt nur bei vollständig abgehaktem Umschlag, kein Haken mehr an Gepacktem, Status
  `nicht-eingetragen` statt falscher Shopify-Meldung, 500 wenn nichts eingetragen wurde, Netzfehler
  ohne falsche Gewissheit, Rest-Umschlag nur aus genau den stehen gebliebenen Bestellungen, Suche aus
  Gepackt/Erledigt mit Fertigen, Fehlwörter der offenen Treffer bleiben sichtbar.
- **Risiken:** Den Fall „ein lokaler Schritt scheitert trotz Vorprüfung“ (z. B. ein Schreibfehler)
  deckt kein Test ab. Die Zahl „N fertige Bestellungen passen auch“ zählt alle Bestellungen eines
  gepackten Umschlags und auch schwächere Treffer (bewusst grob, nur Hinweis). Der Klick gegen
  das echte Shopify ist auf der Datenkopie nicht geprüft. Die Buchung ist der bestehende Weg
  `versandBuchen`.
- **Naechste Stufe:** Beileger zum Drucken für den Umschlag („Sind Sie zufrieden? …“). Die Texte
  entscheidet der Inhaber.

## 2026-10-29 · Kettler-Weg: +3 cm Zuschnittpuffer je Länge und Breite (#1684)

- **Geaendert:** Bestellregel des Inhabers vom 25.10. Teppiche, die der Lieferant ungekettelt an
  unseren Kettler schickt, werden im Zuschnittmaß bestellt: Fertigmaß + 3 cm je Länge und Breite,
  einmal je Dimension und je Stück (180 × 250 → 183 × 253 cm, rund Ø 200 → Ø 203 cm).
  - Zentral in `operations/lib/kettelpuffer.mjs` (`kettelZuschnitt`, `wirdGekettelt`,
    `KETTEL_PUFFER_CM`): die Bestellmail an den Lieferanten nennt nur „Zuschnittmaß: 183 × 253 cm“
    und „bitte genau im Zuschnittmaß zuschneiden, nicht ketteln“; die Kopierliste (Portal, eigene
    Mail) hängt „über unseren Kettler: Zuschnitt 183 × 253 cm (+3 cm je Länge und Breite)“ an.
    Gerechnet wird immer vom Fertigmaß aus – erneutes Öffnen oder Erzeugen schlägt nichts doppelt auf.
  - Nur echtes Ketteln („Einfassung: Gekettelt“). Raummaß („ohne Einfassung“), Matten
    („Zugeschnitten“), „Fertig eingefasst“ und Bänder bleiben im Fertigmaß.
  - Maße nur in cm als „B × L“ oder „Ø D“ (auch „180x250“, Dezimalkomma, Zeilenumbruch); Meter oder
    ein einzelnes Maß ohne Ø gelten als unlesbar und werden geklärt statt falsch gerechnet.
  - Fertigmaß bleibt in den Auftragsdaten (Kettler, Packhilfe, Kunde); Kundenpreise und bestehende
    Bestellungen ändern sich nicht.
  - Kettelt der Lieferant selbst (Ziel Laden/Kunde, kein Kettler hinterlegt) oder wird nicht
    gekettelt, bleibt es beim Fertigmaß ohne Puffer.
  - Klärung statt stiller Kürzung: passt das Zuschnittmaß nicht mehr in die Rolle, aus der
    zugeschnitten wird (kürzere Seite + 3 cm > Rollenbreite), oder fehlt ein lesbares Fertigmaß, steht
    die Position unter „fehlt“ mit Grund und geht nicht in die Mail. Rollenbreite: „_Zuschnitt aus
    Rolle“ (schreibt der Konfigurator seit 14.10. nicht mehr), sonst `custom.rollenbreite`; ist keine
    bekannt, sagt der Dialog „Rollenbreite unbekannt – bitte prüfen“.
  - Bestelldialog: Hinweis „+3 cm Zuschnittpuffer je Länge und Breite für anschließendes Ketteln“
    mit Fertigmaß → Zuschnittmaß je Teppich, direkt über dem Mailtext.
- **Getestet:** `operations/tests/lieferanten.test.mjs` 61/61 (10 neue Tests: Rechnung, 180 × 250 →
  183 × 253 auch bei Wiederholung, Lieferant kettelt selbst, Ware ohne Ketteln, Raummaß/Matte/Band,
  Schreibweisen, Kopierliste, rund, Rollenbreite inkl. gedreht passend und unbekannt),
  `kettelpuffer-hinweis.test.mjs` 2/2, `npm run -s pruefen` alle 9 Schritte grün. Zwei unabhängige
  Prüfer (Regel, Nebenwirkungen) – ihre Befunde sind eingearbeitet.
- **Risiken:** Lieferanten-Schrittmaße (Zuschnitt nur in 5-cm-Schritten o. ä.) sind nicht hinterlegt und
  werden nicht geprüft. Unverändert seit 19.10.: die automatische Kettler-Weiche nimmt jede Einfassung,
  also auch Raummaß „ohne Einfassung“ und „Fertig eingefasst“ (Inhaber-Frage, nicht Teil dieses PRs).
  Ob Bänder/Cover beim Kettler ebenfalls Puffer brauchen, ist offen. Der GEL-Kostenvergleich (eigenes Ketteln gegen fertig gekettelt beziehen) aus
  #1684 fehlt noch: er braucht echte Gewichte, Verpackungsmaße und EK eines konkreten großen Teppichs.
- **Naechste Stufe:** GEL-Vergleich an einem echten Auftrag rechnen.
## 2026-10-29 · Ein Wort je Sache: „Aufkleber“, „Muster kommt an“, Lieferant mit Namen im Lexikon

- **Geaendert:** Rundgang mit Rollen vom 29.10. (Befunde T6, T11, T8 Teil Name; vom Kritiker bestätigt).
  - Heute › Muster & Packstation: „Muster-Wareneingang“ führte in die Bestellen-Liste, die Packstation hat
    für dasselbe den Reiter „Muster kommt an“ (BEGRIFFE.md). Der Knopf heißt jetzt so und führt dorthin.
  - „Etiketten-Druckliste“ / „Gemeinsame Druckliste“ heißen überall „Aufkleber-Druckliste“ (Heute,
    Lexikon, Kundenakte, Aufkleber prüfen, Seitentitel); im Musterlager „Aufkleber“ / „Aufkleber drucken…“
    statt „Etikett“. „Etikett“ bleibt für Rolle und Drucker.
  - Bestellen: „Alle N angekommen“ → „Alle N als angekommen eintragen“ (der Knopf bucht).
  - Lexikon: die Spalte „Lieferant“ zeigte das Kürzel („A“), Packstation und Bestellen den Namen aus
    den Stammdaten. Jetzt `lieferantName()` mit `/api/einkauf/lieferanten`; ohne Stammdaten „Lieferant A“.
    Nach dem Laden zeichnet das Lexikon neu.
- **Getestet:** `start-bestellarbeit-ansicht.test.mjs` angepasst (Knopf „Muster kommt an“, keine alten
  Wörter), `lexikon-lieferantenname.test.mjs` neu. `npm run -s dashboard:test` 1057/1057, `npm run -s pruefen` alle 9 Schritte grün; `dashboard:pruefen` Heute, Lexikon-Detail, Druckliste und Musterlager bei 390/1440 px ohne Überlauf.
- **Risiken:** Wer den Weg „Muster-Wareneingang“ über die Bestellen-Liste gewohnt ist, findet ihn
  weiter unter Bestellen › Je Lieferant; nur der Knopf auf Heute führt jetzt zur Packstation.
- **Naechste Stufe:** Reihenfolge im Lexikon-Detail („Zum Bestellen“ weiter oben) – Werkbank.
## 2026-10-29 · Packstation: Knopf „Verschickt – Kunde informieren“ und Reiter „Erledigt“

- **Geaendert:** Ein gepackter Umschlag geht sofort raus (Benutzer 29.10.). Bisher bekam der Kunde
  keine Mail, solange niemand den Versand separat über „Versand prüfen…“ buchte. Gepackte Umschläge
  haben jetzt den Hauptknopf „Verschickt – Kunde informieren“; „Großbrief vorbereiten“ bleibt daneben.
  Nach einer Rückfrage setzt der Knopf je Bestellung des Umschlags den Schritt „raus“ für genau ihre
  Muster. Der Server bucht dabei wie der Versanddialog den Versand in Shopify mit Versandbestätigung an
  den Kunden (ohne Sendungsnummer, Mail nach Hausregel: nicht bei „holt im Laden ab“). Danach fällt der
  Umschlag aus der Packliste. Der neue Reiter „Erledigt“ zeigt die versandten oder erledigten
  Musterbestellungen der letzten 14 Tage, nur zum Nachsehen, mit Link zur Bestellung.
- **Test:** `packstation-arbeitslisten.test.mjs` (Hauptknopf bei Gepackt, Reiter Erledigt mit Zeitraum
  und Leerzustand).
- **Risiko:** Die Buchung selbst ist der bestehende Weg (`auftragsSchrittSetzen` → `versandBuchen`) und
  dort getestet; der Klick gegen Shopify ist auf der Datenkopie nicht geprüft. Scheitert die Buchung,
  zeigt die Meldung den Grund, der Schritt „raus“ bleibt gesetzt, „Versand nachholen“ greift wie bisher.
  Der Reiter zählt nach Bestelldatum, nicht nach Versanddatum.
- **Nächste Stufe:** Packen und Verschicken in einem Klick, falls der Inhaber den Zwischenstand nicht braucht.

## 2026-10-29 · Packstation: Kopfzeile einheitlich, Lieferanten-Bestelldatum auf jeder Karte

- **Geaendert:** Die Angaben rechts im Kartenkopf („N Muster · …“, „bestellt am … · wartet seit …“)
  sprangen von Karte zu Karte, weil der Block nach einem Umbruch nach links rutschte.
  `.mp-meta` hält ihn jetzt per `margin-left:auto` rechtsbündig (Handy bleibt linksbündig).
  „beim Lieferanten bestellt am …“ stand nur, solange noch Muster fehlten; `lib/muster-packen.mjs`
  behält `bestelltAm` jetzt auch nach der Ankunft, `datumHtml()` zeigt es auf jeder Karte, auch
  packbereit und gepackt. Der Stand je Muster („beim Lieferanten bestellt am …“) bleibt nur bei
  noch bestellten Mustern.
- **Test:** `packstation-arbeitslisten.test.mjs` (packbereit und gepackt mit Lieferantendatum),
  `muster-packen.test.mjs` (Datum bleibt bei Stand „da“).
- **Risiko:** PR #1794 ändert dieselben Dateien; wer zuerst gemergt wird, der andere zieht nach.
- **Nächste Stufe:** keine.

## 2026-10-29 · Rote Betriebsmeldungen mit Weg, Entfernt-Zeile kürzer

- **Geaendert:** Rundgang mit Rollen vom 29.10. (Befunde A5, A7, A1, A12, vom Kritiker bestätigt bzw.
  teilweise bestätigt).
  - „Mac-Dienst gestört“ (rot) hatte keinen Knopf und nannte nur die erste Routine und „+3 weitere“;
    die Shop-Kontrolle listete keine Routinen. Jetzt: `gestoerteRoutinen()` in `lib/todos.mjs` für To-do
    und Shop-Kontrolle; das To-do nennt alle, „Claude Bescheid geben: „Mac-Dienst gestört““ und den
    Knopf „Ansehen“ → `#/shopwache`; dort ein roter Kasten mit jeder gestörten Routine (nur bei Störung).
  - Speicher-Hinweis: „Alte Bildordner auslagern (nach Rückfrage)“ widersprach w-170 (Aufräumen am 28.10.
    an Claude gegeben). Neu: „Claude Bescheid geben: „Speicher aufräumen“ – Claude lagert nur aus, was
    sich wiederherstellen lässt.“ Gilt für To-do und Shop-Kontrolle (ein Text).
  - „Aus Bestellung entfernt“: die Zeile führte die Artikelnamen mit und war am Handy rund 260 px hoch.
    Jetzt nur Kunde, Anzahl, Lieferant, Datum; die Artikel stehen im Dialog „Abhaken…“, der zusätzlich
    „Bestellung ansehen“ verlinkt (vorher nur über den Tooltip bzw. gar nicht erreichbar).
- **Getestet:** `todos.test.mjs` angepasst und neu (Knopf, alle Routinen, Speichertext),
  `betriebsmeldungen.test.mjs` neu (Entfernt-Zeile ohne Artikelnamen, Routinenliste in der
  Shop-Kontrolle nur bei Störung). `npm run -s dashboard:test` 1058/1058, `npm run -s pruefen` alle 9 Schritte grün; `dashboard:pruefen` Gesamtübersicht und Shop-Kontrolle bei 390/1440 px ohne Überlauf.
- **Risiken:** Viele gestörte Routinen machen den Kontext lang; es sind derzeit höchstens vier.
## 2026-10-29 · Entscheidungen: nur zählen, was beim Inhaber liegt und entscheidbar ist

- **Geaendert:** Rundgang mit Rollen vom 29.10. (Befund A8, vom Kritiker nachgemessen). Inhaberzeile,
  Seitenleiste und „Mehr“ zeigten „4 Entscheidungen offen“; entscheiden konnte der Inhaber davon eine.
  Mitgezählt wurden eine Freigabe, die bei Tobias liegt, eine Vorlage ohne Entscheider und ohne
  Optionen und eine Entscheidung, die zugleich unter „Zur Prüfung“ stand (dort doppelt).
  - `entscheidungsGruppen()` in `lib/model.mjs`: `fuerDich` (Inhaber oder ohne Entscheider,
    entscheidbar), `vorbereitet` (Entscheidungsvorlage ohne Optionen, noch nicht im Freigabe-Status),
    `beiAnderen`; Einträge mit Status „Zur Prüfung“ zählen nicht als offen. `offeneEntscheidungen()`
    = `fuerDich`; Zähler und Liste bleiben dieselbe Menge.
  - `#/freigaben`: neuer Abschnitt „Noch nicht für dich (N) – zählt nicht als offen“ mit Grund je
    Zeile. Entscheider mit Klarnamen (`personName`, „Tobias“ statt GitHub-Kennung).
- **Getestet:** `inhaber-ueberblick.test.mjs` neu (Gruppen, Zähler = Liste, Abschnitt, Klarname, keine
  Doppelung). Gegen die aktuelle `issues.json`: vorher 4, jetzt 1 offen, 2 „noch nicht für dich“, 1 unter
  „Zur Prüfung“. `npm run -s dashboard:test` 1056/1056, `npm run -s pruefen` alle 9 Schritte grün; `dashboard:pruefen` Entscheidungen und Heute bei 390/1440 px ohne Überlauf.
- **Risiken:** Eine Vorlage ohne Optionen zählt erst, wenn jemand Optionen ergänzt oder sie auf
  „Warten auf Freigabe“ setzt.
- **Naechste Stufe:** keine.
## 2026-10-29 · Warenkunden zuerst: Bestellen › Je Auftrag und Warenbestellungen auf Heute

- **Geaendert:** Rundgang mit Rollen vom 29.10. (Befunde T2 und T4, vom Kritiker bestätigt).
  - Bestellen › Je Auftrag: „Jetzt zu tun“ stand nur nach Datum sortiert; der erste zahlende
    Warenauftrag stand auf Platz 21 hinter 20 Karten „Muster verschicken“. Jetzt zuerst Aufträge mit
    bestellen, klären, Kunde informieren oder nachfragen, danach reiner Musterversand, darin älteste
    zuerst (`jetztRang()` in `lib/auftrags-ablauf.mjs`). Der Einleitungssatz sagt das.
  - Heute › Warenbestellungen: Eine Bestellung, bei der die Ware nur noch beim Lieferanten unterwegs
    ist, stand ganz oben und trug den Hauptknopf. `shopBestellarbeit()` gibt jetzt `wartet`
    (`lieferant` | `kunde`) mit; innerhalb gleicher Zahlungslage stehen Zeilen mit eigenem Schritt
    vorn. Wartende zeigen „wartet auf Lieferant/Kunde“ und „Bestellung ansehen“, der Hauptknopf sitzt
    auf der ersten Zeile mit eigenem Schritt. Prüf-, Zahlungs- und Klärfälle gelten nie als wartend.
- **Getestet:** `shop-bestellarbeit.test.mjs` neu (wartende ältere Bestellung hinter eigener Arbeit,
  Hauptknopf und Text, nur Wartende ohne Hauptknopf), `auftrags-ablauf.test.mjs` neu (`jetztRang`).
  `dashboard:pruefen` Heute und Bestellen bei 390 und 1440 px auf der Datenkopie: 0 px Überlauf,
  keine Fehler; Heute zeigt vier Bestellungen mit „Ware bestellen“ vor der wartenden, Je Auftrag die
  vier Warenaufträge vor 23 Musterkarten. `npm run -s dashboard:test` 1057/1057, `npm run -s pruefen` alle 9 Schritte grün.
- **Risiken:** Eine wartende Bestellung mit offener Zahlung bleibt wegen `zahlungsRang` hinter
  bezahlten mit eigenem Schritt – wie bisher.
## 2026-10-29 · Alle Ratgeber jederzeit druckbar, fünf neue Bodenarten

- **Geaendert:** Kunden → Bestellungen zeigt bei „Waren“ (auch „Waren und Muster“, nicht bei „Muster“)
  oben den aufklappbaren Bereich „Ratgeber zum Ausdrucken · 12“. Jeder Knopf öffnet die leere
  Druckvorlage einer Bodenart, ohne Bezug zu einer Bestellung, für Laden, Abholer und Beratung. Das ist
  dieselbe Datei wie in Shopify, ausgeliefert über `GET /api/kunden/ratgeber-vorlage?schluessel=…`
  (rein lesend). Die Liste kommt als `ratgeberVorlagen` mit der Bestellliste. Neu sind die Ratgeber
  Linoleum, Kautschuk, Korkboden, Kunstrasen und Sauberlauf. Damit erscheint „Ratgeber drucken“ auch
  bei diesen Bestellungen.
- **Getestet:** `ratgeber-druck-api.test.mjs` 5/5 (neu: jede Vorlage liefert ein PDF, unbekannter
  Schlüssel 404), `dashboard:test` 1056/1056, `dashboard:pruefen` 39 Ansichten ohne Überlauf.
  Klickstrecke gegen die Kopie, Desktop und 390 px: Bei Waren sind 12 Knöpfe da, bei Muster keiner.
  Sauberlauf lieferte 200 `application/pdf` mit 212.670 Bytes, JS-Fehler gab es keine.
- **Risiken:** Die Vorlagen kommen aus `domains/shopify/ratgeber-pdf/pdf/`. Nach einer Textänderung
  muss die Datei neu gebaut und auch in Shopify ersetzt werden (README dort).

## 2026-10-29 · Shop-Übersicht: rote To-dos als „Probleme“ ganz oben (w-206)

- **Geaendert:** Fehlersuche vom 28.10. (Werkbank w-206). Seit dem Rundgang vom 26.10. zeigte die
  Standard-Startseite „Shop-Übersicht“ keine To-do-Liste mehr; rote Meldungen (Mac-Dienst gestört,
  Speicher fast voll, Sicherung fehlgeschlagen, aus der Bestellung entfernte Positionen,
  überschrittener Liefertermin) standen nur in den Alltagssichten hinter „Weitere Bereiche“ und
  wurden übersehen.
  - Neuer Block „Probleme · N“ direkt unter dem Titel (`ansichten/heute/probleme.mjs`, reine
    Funktion): nur rote To-dos, drei sichtbar, der Rest klappt auf, ohne Rot kein Block. Die Zeilen
    zeichnet derselbe `todoZeile()` wie in der Arbeitsliste – Knöpfe und Dialoge („Abhaken…“, „In
    Shopify nachbuchen“, „Ansehen“) bleiben dieselben.
  - `heute.mjs`: die Ableitung der Liste einer Sicht steht jetzt einmal in `todosDerSicht()` (To-dos
    aus `lib/todos.mjs` plus Nachfragen, Versandfehler, Belege, Shopify-Abgleich, Datenstand);
    Shop-Übersicht und Alltagssichten rechnen dasselbe. Der Inhaber sieht alles Rote (Sicht
    `alles`, wie seine Sicht in `fuerSicht`), Mitarbeiter ihre Sicht `laden` ohne Website/Technik.
    Dafür lädt die Shop-Übersicht zusätzlich Rückrufe, Shopify-Abgleich und Lieferantenbelege
    (lokal, zwischengespeichert – die Alltagssichten brauchen sie ohnehin).
  - Nicht oben: Laden-/Treppenanfragen, Angebote aus Kundenfällen und Team-Aufgaben
    (`NEBENBEREICH_ARTEN`), auch wenn rot. Der Inhaber hat sie am 22.10. in „Weitere Bereiche“
    geschoben, die Anfragen stehen dort mit Zahl und Alter. In der ersten Probe auf der Datenkopie
    waren sonst 6 von 8 „Problemen“ zwei Wochen alte Treppenanfragen, und die Warenbestellungen
    rutschten am Handy aus dem Bild. Gelbes und Normales bleibt ebenfalls hinter „Weitere
    Bereiche“, damit die Warenbestellungen direkt darunter zuerst kommen. Begriff „Probleme“ in
    `BEGRIFFE.md`.
- **Getestet:** `shop-start-probleme.test.mjs` neu (nur Rot zählt, ohne Rot kein Block, Zahl und Satz,
  Aufklappen ab der vierten Zeile, Nebenbereich-Arten bleiben weg), `shop-start.test.mjs` erweitert
  (Block vor den Warenbestellungen, gelb und Laden-Anfragen bleiben weg, derselbe Abhaken-Knopf,
  Inhaber `alles`/Mitarbeiter `laden`, Shop-Kontrolle nur beim Inhaber, Kundenfälle/Aufgaben nicht
  geladen, übrige Reihenfolge unverändert). `npm run -s dashboard:test` grün (1060 Tests, 1060 bestanden, 0 fehlgeschlagen; ein Zeitfenster-Test der Aktualisierung schlug nur einmal unter Last durch den parallelen Puppeteer-Lauf fehl, isoliert und im zweiten Lauf grün).
  Klickprüfung gegen die Datenkopie (`dashboard:pruefen -- --offen --rollen`, Heute bei 390 und
  1440 px, Rollen Inhaber/Mitarbeiter/lesen): Inhaber „Probleme · 3“ (Muster bei drei Lieferanten seit
  14–30 Tagen nicht bestellt), Mitarbeiter „Probleme · 1“ („Aus Bestellung entfernt: #1056 –
  Lieferantenbestellung stornieren?“ mit „Abhaken…“), Warenbestellungen direkt darunter, 0 px
  Überlauf bei 390 px, keine JS-Fehler. Vor der Nebenbereich-Regel standen dort 8 Probleme, davon 6
  Treppenanfragen. Der Puppeteer-Browser der Prüfung schloss sich unter Last zweimal nicht
  rechtzeitig (Exit 2, 3 s Frist in `dashboard-pruefung-lauf.mjs`); die Screenshots lagen trotzdem vor.
- **Risiken:** Eine rote Treppenanfrage oder überfällige Team-Aufgabe steht weiter nur hinter
  „Weitere Bereiche“ (bewusst, Inhaber 22.10.); wer sie oben erwartet, findet dort nur die Zahl der
  Anfragen. Schlägt eine Quelle fehl, fehlt ihr rotes To-do oben still; die Datenzeile und die
  Alltagssichten melden den Ausfall weiter.
## 2026-10-28 · Nachfass-Mails: Firmenangaben unter dem Gruß (Werkbank w-172 Punkt 2, #1772)

- **Geaendert:** Die Nachfass-Mails („Muster nachfassen“) endeten ohne Rechtsform, Anschrift,
  Registergericht und Geschäftsführerin; für eine GmbH gehört das in geschäftliche Mails (Inhaber
  28.10.: ja). `fuelleText()` in `docs/ai-dashboard/lib/muster-nachfassen.mjs` hängt jetzt
  `FIRMENANGABEN` als eigenen Absatz hinter den Gruß: Firma und Anschrift · Telefon, E-Mail, Shop ·
  Sitz, Amtsgericht Neuruppin HRB 9141 NP, Geschäftsführerin (Stand Impressum 28.10.2026). Der
  Abmelde-Hinweis bleibt die letzte Zeile. Weil alle Wege durch `fuelleText()` laufen, gilt das für
  den täglichen Versand, den Knopf „Nachfassen“ und die Mail „Muster nicht verfügbar“, auch mit der
  Inhaber-Vorlage aus dem Privatordner. Steht die Registernummer schon in einer Vorlage, kommt der
  Block nicht doppelt. USt-ID und Fax bewusst weggelassen.
- **Getestet:** `docs/ai-dashboard/tests/nachfassen-firmenangaben.test.mjs` neu; der Test, der „endet
  mit Freundliche Grüße“ erwartete, prüft jetzt den Gruß mit den Firmenangaben dahinter.
  `npm run -s dashboard:test` 1035/1035, `npm run -s dashboard:pruefen` (Datenkopie) nur OK-Zeilen.
  Seit 29.10. im Betrieb (`betrieb:nachziehen -- --status`: Rückstand 0).
- **Risiken:** Kein echter Versand an ein Postfach getestet. Ändern sich Anschrift, Registergericht
  oder Geschäftsführung, muss `FIRMENANGABEN` mit dem Impressum nachgezogen werden.
- **Naechste Stufe:** keine.
## 2026-10-29 · Packstation: Muster ohne eigene Einkaufsdaten zeigen Lieferant und Farbnummer

- **Geaendert:** Muster aus "Teppich nach Maß" zeigten "kein Farbbild / keine Farbnummer hinterlegt",
  weil die TnM-Variante dieselbe Artikelnummer mit anderem Lieferantennamen (andere Breite) fuehrt und
  der Index die SKU dadurch als mehrdeutig verwarf. Jetzt geht die Meterware-Variante mit genau der
  Aufkleber-SKU vor; Varianten ohne jede Einkaufsangabe zaehlen nicht mit. Widersprechen sich die
  Angaben trotzdem, steht "Farbnummer unklar – prüfen" (nie geraten). "Was ist da?" nennt den
  Kurznamen ohne Warengruppe und Breite, z. B. "Tempra Sprint 027 (Farbnr. 18)".
- **Getestet:** neuer Fall in `tests/muster-packen.test.mjs` (30/30), `dashboard:test` 1055/0,
  `npm test` ohne Fehler, `dashboard:pruefen` nur OK; gegen das echte Lexikon (nur lesend) liefert
  das TnM-Muster der Farbe 18 Lieferant A, Farbnr. 18 und Farbbild.
- **Risiken:** keine Schreibaktion geaendert.
- **Naechste Stufe:** –

## 2026-10-28 · Postfach-Lauf: Claude nur bei neuer Mail, nur mit Gmail

- **Geaendert:** Fehlersuche vom 28.10. (Punkt 5). Der Postfach-Dienst startete alle zwei Stunden
  Claude für beide Teile, auch ohne neue Mail, und lud dabei alle 14 MCP-Server des Kontos (304
  Werkzeuge, davon 6 von Gmail).
  - Vorprüfung ohne KI (`operations/lib/postfach-vorpruefung.mjs`, `imap-lesen.mjs`): Der Dienst fragt
    per IMAP nur lesend die Kennungen der Mails ab, die dieselben Gmail-Suchen finden wie die
    Auftragstexte. Claude startet je Teil nur bei einer unbekannten Kennung, nach einem Fehlschlag,
    nach einem unvollständigen Belege-Lauf, bei geänderten Lieferanten-Domains und einmal am Tag.
    Geht die Vorprüfung nicht, startet Claude wie bisher. Abschalten: `TP_POSTFACH_VORPRUEFUNG=aus`.
  - Nur Gmail: Eine init-Probe ohne Modellaufruf liest die Serverliste, die übrigen 13 Server werden
    per `--disallowedTools mcp__<server>` gesperrt.
  - Wache: Lehnt sie nur Lese-/Schreibzugriffe in Claudes eigenem Scratchpad ab und das Ergebnis steht
    trotzdem in der Ablage (neuer Belege-Lauf; bei Service jede offene Kennung angelegt oder geprüft),
    gilt der Lauf als erfolgreich mit Hinweis. Jeder andere abgelehnte Pfad (`.env*`, Zugangsdateien,
    LaunchAgents) bleibt „FEHLER“ mit Mitteilung – das Signal für einen Prompt-Injection-Versuch.
  - Service: als gesehen gilt nur, was in der Ablage steht; eine nicht übernommene Mail startet den
    nächsten Takt wieder. Die MCP-Serverprobe läuft nur, wenn ein Teil wirklich startet.
- **Tokens** (gemessen in den `laeufe/`-Protokollen 26.–28.10., je 16 Läufe):
  - Vorher: Lieferbelege Ø 410.152 Tokens (12,8 Runden), Service Ø 136.259 (4,5 Runden), 7 Takte am
    Tag → rund 3,8 Mio. Tokens je Tag.
  - Grundlast je Runde gemessen (Aufruf „Antworte nur mit: OK“): alle Server 29.472, nur Gmail 20.391
    → 9.081 weniger je Runde (−31 %). Lieferbelege also ~294k je Lauf, Service ~95k.
  - Starts: Lieferbelege hatte 12 von 16 Läufen Neues (→ ~5–6 Läufe je Tag), Service 2 von 16
    (→ ~2 Läufe je Tag mit Tageslauf).
  - Nachher rund 1,7–1,9 Mio. Tokens je Tag, also etwa −2 Mio. je Tag (−50 bis −55 %). IMAP und
    init-Probe kosten keine Tokens.
- **Getestet:** `operations/tests/postfach-vorpruefung.test.mjs` neu (15 Tests: IMAP mit falschem
  Server, nur EXAMINE und X-GM-MSGID, Literale, abgelehnte Anmeldung ohne Passwort im Text,
  Startregeln, Tageswechsel Berlin, MCP-Sperren, harmlose Ablehnung, Dienstablauf mit Überspringen und
  Rückfall). Echte Werkzeugprobe `claude-lauf.mjs postfach --werkzeugprobe`: „MCP: nur claude.ai Gmail ·
  13 andere Server gesperrt“, je Teil 6 Gmail-Werkzeuge, alle 7 Pflichtwerkzeuge da, Exit 0.
- **Risiken:** Die Vorprüfung nutzt das App-Passwort des Nachfass-Versands jetzt auch für IMAP (nur
  lesend). Weichen die Suchen im privaten Auftragstext von denen im Code ab, fängt das der Tageslauf
  einmal am Tag auf; eine Mail, die nur der private Text findet, wartet bis dahin.
- **Naechste Stufe:** Die neuen Kennungen an Claude übergeben, damit der Lauf nicht selbst suchen
  muss (weniger Runden).
## 2026-10-28 · Auslauf-To-do: archivierte Produkte zählen nicht mehr

- **Geaendert:** Fehlersuche vom 28.10. (Punkt 7). Das Auslauf-To-do blieb rot bis zur nächsten
  Montagsprüfung, obwohl alle 15 Befunde vom 26.10. am selben Tag archiviert wurden. Der Knopf „Im
  Lexikon“ führte dabei ins Leere. Jetzt gleicht `/api/shopwache/status` die Befunde mit dem
  Lexikon-Export ab: Steht kein Handle eines Befunds mehr darin (das Lexikon führt nur aktive und
  unsichtbare Produkte), gilt er als erledigt und fällt weg. Die Ampel wird aus den offenen
  Befunden neu bestimmt, `archiviert` zählt die weggefallenen. Ist nur das Hauptprodukt archiviert,
  das Musterprodukt aber nicht, bleibt der Befund offen. Ohne Lexikon-Export bleibt alles wie bisher.
- **Getestet:** `api.test.mjs` neu „Auslauf-Befunde archivierter Produkte fallen weg“ (ohne Lexikon,
  teilweise archiviert, Musterprodukt noch aktiv, alles archiviert → gelb bzw. grün). Lesend gegen
  die echten Daten: 15 Befunde → 0 offen, 15 archiviert, Ampel grün, kein Auslauf-To-do mehr.
- **Risiken:** Hängt der Lexikon-Export nach (er läuft mit dem Sync-Dienst), erscheint ein frisch
  archiviertes Produkt bis zum nächsten Export noch als offen.
- **Naechste Stufe:** keine.
## 2026-10-28 · Sicherung: Uhrzeit im Log, Fehlervermerk und To-do bei Ausfall

- **Geaendert:** Fehlersuche vom 28.10. (Punkt 3). Die Lücke vom 22.10. war nur in der Datenzeile
  des Systemzustands zu sehen. Das Log der Sicherung hatte keine Uhrzeit, ein gescheiterter Lauf
  stand nirgends.
  - `operations/scripts/sicherung.mjs`: jede Logzeile mit Uhrzeit und eine Schlusszeile („fertig“
    bzw. „mit Fehler beendet“). Scheitert der Lauf, steht `letzterFehler` (Zeit, Meldung) in
    `sicherungsstand.json`. `letzterErfolg` bleibt unverändert, der nächste Erfolg entfernt den Vermerk.
  - Die Prüfung gab es schon (`sicherungsstand()` in `operations/lib/betriebszustand.mjs`: verpasst =
    nach 23:00 Uhr keine Sicherung vom selben Abend, also strenger als 26 Std.). Sie liefert jetzt
    auch `letzterFehler` und kommt mit `/api/shopwache/status` auf „Heute“.
  - Neues To-do (Website, der Inhaber sieht es, sobald es rot ist): gelb „Sicherung der Betriebsdaten
    überfällig“ nach einem verpassten Termin, rot ab 48 Std. ohne Sicherung, rot „fehlgeschlagen“ mit
    der Meldung, rot bei unlesbarem Stand, gelb „Sicherungsstand fehlt“, wenn es gar keinen Stand gibt
    (die Sicherung lief auf diesem Mac nie).
- **Getestet:** `sicherung.test.mjs` neu (Fehlervermerk mit und ohne bisherigen Stand, Rechte 0600,
  älterer Fehler zählt nicht, Erfolg löscht den Vermerk, kaputter Stand bleibt unangetastet),
  `todos.test.mjs` neu (gelb/rot/nichts, Laden ohne, Inhaber nur rot), `api.test.mjs` neu (Stand kommt
  mit der Shop-Wache). Lesend gegen den echten Stand: jetzt kein To-do; 26 Std. später ohne neuen
  Lauf „Sicherung der Betriebsdaten überfällig · letzte Sicherung Di., 27.10., 22:30“.
- **Risiken:** Ist der Mac um 22:30 Uhr aus, startet launchd die Sicherung beim nächsten Einschalten.
  Bis dahin steht das gelbe To-do.
- **Naechste Stufe:** Kopie außer Haus (w-163) nach der Entscheidung des Inhabers.
## 2026-10-28 · Aus der Bestellung entfernt, beim Lieferanten bestellt: rotes To-do

- **Geaendert:** Fehlersuche vom 28.10. (Punkt 4). Bei #1056 wurden drei Positionen nach dem Vermerk
  „bestellt“ aus der Bestellung genommen (Menge 0). Im Dashboard blieben sie still, weil Positionen
  mit Menge 0 überall herausfallen; die Bestellung ist in Shopify außerdem schon geschlossen.
  - `operations/lib/shopify-abgleich.mjs`: `shopifyPositionen` kennt `entfernt` (bestellt war mehr als
    0, aktuelle Menge 0). Neu `entfernteBestellt()`: Positionen mit Status „bestellt“, die aus der
    Bestellung entfernt sind, je Bestellung eine Zeile; ohne stornierte Bestellungen und Tests.
  - `GET /api/einkauf/shopify-abgleich` liefert sie als `entfernt` mit Titel, Farbe und Lieferant.
  - „Heute“ (Laden): rotes To-do „Aus Bestellung entfernt: #… – Lieferantenbestellung stornieren?“ mit
    Kunde, Lieferant, Bestelldatum und Artikeln. „Abhaken…“ fragt, was mit der Lieferantenbestellung
    ist (Pflicht), und setzt die Artikel über die vorhandene Aktion „zurück auf offen“ zurück – ohne
    Shopify, der Vermerk bleibt im Verlauf. Rolle „lesen“ bekommt nur „Ansehen“.
- **Getestet:** `shopify-abgleich.test.mjs` neu (entfernt/nicht entfernt, alter Export ohne aktuelle
  Menge, storniert, Test, schon abgehakt, nach dem Zurücksetzen leer), `shopify-abgleich-api.test.mjs`
  neu (steht im Abgleich, Rolle „lesen“ 403, Abhaken ohne Shopify-Aufruf, die verbliebene Position
  bleibt). Klickstrecke gegen die Datenkopie (`dashboard:pruefen --offen`, Puppeteer, `#/heute?sicht=laden`):
  1 To-do #1056 mit 3 Artikeln, Dialog, nach „Abhaken“ To-do weg, 3 Positionen in der Kopie mit
  Notiz zurück auf offen, keine JS-Fehler. `dashboard:pruefen` Heute 360–1440 px ohne Überlauf.
- **Risiken:** Die Standard-Startseite „Shop-Übersicht“ zeigt seit dem Rundgang vom 26.10. keine
  To-do-Liste; das To-do steht unter „Weitere Bereiche → Laden & Anfragen“ bzw. „Bisherige
  Gesamtübersicht“ (wie alle anderen To-dos). Ware, die schon geliefert ist, meldet es nicht.
- **Naechste Stufe:** Rote To-dos auch auf der Shop-Übersicht zeigen (gilt für alle To-dos).
## 2026-10-28 · Speicher: Bremse für Bildläufe, Mac-Mitteilung bei Rot

- **Geaendert:** Fehlersuche vom 28.10. (Punkt 1, Teile 2 und 3). Die Platte stand bei 12 bis 17 GiB
  frei, der Monteur-Upload sperrte schon zeitweise. Die Warnung gab es nur im Control Center, und
  Bildläufe hatten keine Bremse.
  - `npm run -s speicher:pruefen` (`operations/scripts/speicher-pruefen.mjs`, `bildlaufFrei` in
    `operations/lib/speicher.mjs`): Exit ungleich 0 heißt nicht starten (1 = unter 20 GiB frei,
    2 = falsche Angabe), `--min <GiB>` für eine eigene Grenze, nicht messbar = darf starten. Die Bildlauf-Skripte liegen privat unter `$TP_PRIVAT_DIR`; Skill
    `raumbilder-recherche`, Skill `werkzeuge` und `operations/README.md` schreiben den Aufruf vor jedem
    Lauf vor (aus Python per `subprocess.run`).
  - Shop-Wache: bei Rot zusätzlich eine Mac-Mitteilung, höchstens einmal je Berliner Kalendertag und
    nur in der Arbeitszeit Mo–Sa 7–19 Uhr (`speicherMelden`, Tag in `shopwache/speicher-mitteilung.json`).
    Gemeldet wird vor dem Schreiben von `status.json` (`meldenUndAblegen`), damit eine volle Platte
    die Mitteilung nicht verhindert. Die Mitteilung liegt jetzt in
    `operations/lib/mac-mitteilung.mjs`; `claude-lauf.mjs` exportiert sie unverändert weiter.
- **Getestet:** `freier-speicher.test.mjs` neu (Bremse unter/über 20 GiB, eigene Grenze, Messfehler,
  Befehl mit Exit-Codes und falschen Optionen, Mitteilung nur bei Rot, einmal je Tag, Tageswechsel
  23:30 UTC = nächster Berliner Tag, kaputte Merkdatei). Echter Aufruf auf dem Mac:
  „Speicher: 19 GiB frei (96 % belegt, ROT) · Bildlauf NICHT starten“, Exit 1; mit `--min 10` Exit 0.
  Die Mac-Mitteilung selbst nicht ausgelöst (gleiche Funktion wie bei den Routinen).
- **Risiken:** Die privaten Bildlauf-Skripte rufen die Prüfung erst, wenn sie die eine Zeile
  bekommen; bis dahin bremst nur die Anweisung im Skill.
- **Naechste Stufe:** Aufräumen nach w-170 (anderer Chat); die privaten Skripte um den Aufruf ergänzen.
## 2026-10-28 · Eigener Bereich „Hausverwaltungen“ (Werkbank w-154, #1768)

- **Geaendert:** Entscheidung des Inhabers vom 26.10.: „eigener Bereich für Hausverwaltungen mit
  Ansprechpartnern, Objekten und Angeboten“. Neu unter „Kunden & Einkauf“ → **Hausverwaltungen**
  (`#/hausverwaltungen`):
  - Liste: je Verwaltung Ansprechpartner, Telefon und E-Mail (anklickbar), Stand, Zahl der Objekte,
    Wohnungen und offenen Angebote. Wer heute wieder dran ist, steht oben („wieder melden“ in Bernstein);
    „kein Interesse“ liegt zugeklappt darunter.
  - Klick auf den Namen: Verwaltung mit Notiz, „Anrufen“, „E-Mail schreiben“, „Bearbeiten“ (Stand,
    „Wieder melden am“), darunter die Objekte (Adresse, Wohnungen, Ansprechpartner vor Ort) und je Objekt
    die Angebote bzw. Aufträge (Lexware-Nummer, Auftrag in der Auftrags-App, Datum, Stand). Offene Angebote
    ab 14 Tagen: „seit N Tagen offen – nachfassen“.
  - Auf „Heute“ in der Gesamtübersicht (`#/heute?sicht=inhaber`, wie das To-do der Genossenschaften) das
    To-do „Hausverwaltungen: N wieder melden“; bei genau einer Verwaltung führt „Ansehen“ direkt zu ihr.
  - Gespeichert lokal unter `$TP_PRIVAT_DIR/hausverwaltungen/verwaltungen.json`, in der nächtlichen Sicherung.
  - Die Seite „Genossenschaften“ verweist mit einem Satz auf den neuen Bereich; Hilfe, Zugänge-Text und
    Befehlspalette nennen ihn.
- **Getestet:**
  - `tests/hausverwaltungen.test.mjs` 9 neu (Regeln, Doppelname, Entfernen-Schutz, Wiedervorlage, To-do, API mit
    kaputtem JSON, Rollen lesen 403 / Mitarbeiter 200, Ansicht escaped); `dashboard:test` 1040 grün.
  - `dashboard:pruefen -- --rollen`: 500 Zeilen OK (100 Ansichten × 5 Breiten, je Rolle), 0 px seitlicher Überlauf.
  - Klickstrecke in der Datenkopie (Mitarbeiter 390 px, Inhaber 1440 px, Rolle lesen), nur ausgedachte Daten:
    Leerzustand → „Name fehlt“ → Verwaltung angelegt (angeschrieben, Wiedervorlage +14 Tage) → Objekt →
    Angebot ohne Angabe abgelehnt → Angebot gespeichert → Objekt mit Angebot entfernen abgelehnt → Liste mit
    fälliger Verwaltung oben und „1 Verwaltung ohne Interesse“ zugeklappt → To-do in der Gesamtübersicht →
    Rolle lesen: keine Knöpfe, Schreiben 403. Datei mit Rechten 600, 5 Protokollzeilen, keine JS-Fehler.
  - Dabei gefunden und behoben: alte Fehlermeldung blieb im Dialog stehen; „Bearbeiten“ brach am Handy im Wort um.
- **Risiken:** Der Bereich ist wie „Genossenschaften“ für Mitarbeiter offen (Menütest angepasst). Soll ihn nur
  der Inhaber sehen: `hausverwaltungen: 'inhaber'` in `ANSICHT_ROLLEN` und `data-nur-inhaber` am Menüpunkt.
  Lexware und Auftrags-App sind nur Textfelder, es gibt keine Prüfung, ob die Nummer existiert.
- **Naechste Stufe:** Suche und Seiten zu 25, sobald die Liste wächst; eine Verwaltung aus „Genossenschaften“
  mit einem Klick übernehmen.

## 2026-10-28 · Adressaufkleber auf 50 × 80 quer

- **Geaendert:** Inhaber: „die Adresse soll quer sein bei 50 × 80, nicht hoch“.
  - Auf hohen Rollen (50 × 80 und 50 × 100) läuft die Adresse jetzt entlang der langen Seite.
  - Die Empfängerschrift wächst mit (bis 47 px statt 36 px auf 50 × 80).
  - 50 × 50 und die Musteraufkleber bleiben unverändert.
  - Das Layout rechnet im gedrehten Format, der Druckdialog dreht das Bild um 90° auf die Rolle.
- **Getestet:**
  - `muster-packen.test.mjs` neu „Adresse liegt auf hohen Rollen quer“: 50 × 50 nicht quer; 50 × 80 und 50 × 100
    quer, passend, Zeilen länger als die Rollenbreite, innerhalb der Ränder, Empfänger größer. Die beiden
    Adresstests prüfen die Ränder im gedrehten Format.
  - Druckdialog in der Datenkopie mit Druckerattrappe auf 50 × 80:
    - Vorschau 400 × 640 mit querer Adresse.
    - Druckbild 384 × 640, Tinte innerhalb von 32 px Rand.
    - Keine JS-Fehler.
- **Risiken:** Die Drehrichtung ist im Uhrzeigersinn (Schrift läuft von oben nach unten aus der Rolle). Soll
  sie andersherum laufen, ist es ein Vorzeichen in `zeichne()`.
- **Naechste Stufe:** keine geplant.
## 2026-10-28 · Packstation: Filter nach Umschlagstand (#1761)

- **Geaendert:** Wunsch des Inhabers vom 28.10.: „packstation noch etwas besser filtern umschlag vorbereitet
  und muss noch vorbereitet werden“. Unter den Reitern steht eine zweite Chipzeile „Umschlag:“ mit alle ·
  noch vorbereiten · vorbereitet · Muster schon drin. Jeder Chip hat eine Zahl und wirkt zusammen mit dem
  Reiter (`mpumschlag` neben `mpbereich`).
  - „Noch vorbereiten“ sind die Karten, bei denen Schritt 1 „Bestellung drucken“ leuchtet.
  - Dort druckt „Diese n Umschläge vorbereiten“ genau die gezeigten Umschläge in Listenreihenfolge und
    vermerkt sie danach als vorbereitet.
  - Bei Suche, Direktlink und „Gepackt“ gilt der Filter nicht.
  - Eine leere Auswahl sagt, was los ist, und verlinkt alle Umschläge der Liste.
- **Getestet:**
  - `packstation-arbeitslisten.test.mjs`: Zahlen, Kombination mit dem Reiter, Knopf, Hinweis ohne
    Zuordnung, Leertext, Ausnahmen; 17/17.
  - `dashboard-abschlusskorrekturen.test.mjs`: Klick druckt in Listenreihenfolge ohne Gepacktes oder
    Unzugeordnetes und vermerkt erst nach dem Druck; 8/8.
  - `dashboard:test` 1032/1032 (nach dem Merge von main), `pruefen` 9/9, `dashboard:pruefen` 0 px Überlauf von 360 bis 1440 px.
  - Klickstrecke gegen die Datenkopie (Playwright, Chrome):
    - Zahlen 19 · 0 · 18 · 2 passen zum Packstand.
    - Druckvermerk an #1075 zurückgenommen → 1 · 17. Liste #1075, Knopf „Diesen Umschlag vorbereiten
      (4 Aufkleber)“, Druckdialog „Aufkleber · 1 Umschlag vorbereiten“.
    - Schließen ohne Druck: 0 Schreibaufrufe, keine JS-Fehler.
    - Sichtprüfung 1024 und 360 px.
- **Risiken:** Den Druck selbst habe ich nicht ausgelöst (kein Drucker). Der Vermerk danach läuft über den
  vorhandenen `druckFertig`-Weg.
- **Naechste Stufe:** keine.

## 2026-10-28 · Packstation: Bestelldatum auf jeder Karte (#1757)

- **Geaendert:** Wunsch des Inhabers vom 28.10.: „wichtig ist auch, dass ich sehen muss, an welchem Datum
  bestellt wurde“. Die Kopfzeile jeder Packstation-Karte zeigt jetzt ohne Aufklappen:
  - „bestellt am Di., 20.10. · wartet seit 8 Tagen“, mit Wochentag und nach Berliner Kalendertag wie die
    Wartetage (#1754). Bei mehreren Bestellungen in einem Umschlag steht „erste Bestellung am …“.
  - Fehlen noch Muster und sind sie beim Lieferanten bestellt: „beim Lieferanten bestellt am …“, bei
    verschiedenen Daten „zwischen … und …“. Das stand bisher nur aufgeklappt im Hinweis.
  - Aufgeklappt steht bei mehreren Bestellungen das Datum jeder Bestellnummer.
  Die Daten kamen schon vom Server (`seit`, `bestellungen[].datum`, `bestelltAm`), geändert ist nur die
  Ansicht `ansichten/kunden/muster-packen.mjs`.
- **Getestet:** `packstation-arbeitslisten.test.mjs` mit neuem Test (Kopfzeile ein/zwei Bestellungen,
  Lieferantenzeile nur bei fehlenden Mustern, nicht bei Gepacktem, ohne Datum nur die Wartezeit) 16/16,
  `dashboard:test` 1025/1025. `dashboard:pruefen` mit Datenkopie: alle Ansichten OK, kein seitliches
  Scrollen von 360 bis 1440 px. Sichtprüfung der Packstation mit 19 offenen Umschlägen bei 1024 und 360 px.
- **Risiken:** Auf schmalen Handys braucht die Kopfzeile eine Zeile mehr.
- **Naechste Stufe:** keine.

## 2026-10-28 · Ratgeber zum Beilegen drucken (#1763)

- **Geaendert:** Ware mit Kurz-Ratgeber (Teppich, Teppichboden, Vinyl, Klickvinyl, Klebevinyl, Laminat,
  Parkett) bekommt in Kunden → Bestellungen, aufgeklappte Zeile, den Knopf „Ratgeber drucken“. Er öffnet
  im neuen Tab ein PDF zum Ausdrucken, zwei Seiten je Bodenart. Bestellnummer, Produkt und Farbe, Maß
  und Kaufdatum sind schon eingetragen. Der Dialog „An Kunden raus“/„Übergeben“ zeigt „Bitte beilegen:
  Ratgeber …“ mit demselben Knopf, aber nur wenn die Ware bei uns liegt („Geliefert an uns“) oder
  abgeholt wird. Bei Direktversand vom Lieferanten packt niemand von uns, deshalb kein Hinweis. Die
  Zuordnung steht am Bestellmodell (`auftrag.ratgeber`), wie in der Bestellbestätigung über den
  Produkttyp, Muster zählen nicht. Das PDF liefert `GET /api/kunden/ratgeber-druck?orderId=…`, rein lesend.
  Chromium startet erst beim Klick (`domains/shopify/ratgeber-pdf/pdf.mjs`).
- **Getestet:** `ratgeber-druck-api.test.mjs` 4/4 (Zuordnung, PDF-Inhalt mit Ersatz-Drucker, 400/404/405
  über HTTP), `dashboard:test` 1026/1026, `dashboard:pruefen` 38 Ansichten ohne Überlauf. Klickstrecke
  gegen die Kopie: 12 von 77 Bestellungen mit Ratgeber, PDF in 1,6 s (2 Seiten A4, Schriften eingebettet).
  Der Knopf öffnet einen neuen Tab, am Handy bleibt die Seite 390 px breit. Der Dialog zeigt den Hinweis
  erst, nachdem #1070 in der Kopie auf „Geliefert an uns“ stand. Geschlossen wurde ohne Buchung, JS-Fehler
  gab es keine.
- **Risiken:** Braucht Chrome auf dem Dienst-Mac (wie `dashboard:pruefen`). Fehlt er, kommt die übliche
  Fehlermeldung, der Grund steht im Protokoll. Ob der Ratgeber wirklich beigelegt wurde, merkt sich das
  Dashboard nicht.
- **Entschieden (Inhaber, 28.10.):** Bei Direktversand vom Lieferanten schicken wir keinen Brief hinterher.
  Dort reicht das PDF aus der Bestellbestätigung. Beigelegt wird nur, was durch unsere Hände geht.

## 2026-10-28 · Auslauf-Prüfung meldet Farben ohne Handmuster (#1755)

- **Geaendert:** Lieferant A führt einzelne Farben mit dem Zusatz „(nur in Format)“ in der Kurzbeschreibung
  der Schnellsuche. Für solche Farben gibt es kein Handmuster, der Shop bot sie trotzdem gratis als Muster an.
  Aufgefallen ist das erst, als eine Kundin auf das Muster wartete. Die Wochenprüfung hatte den Text schon,
  sie prüfte bei A aber nur, ob die Artikelnummer gefunden wird. Jetzt wertet sie Name und Kurzbeschreibung
  des Treffers aus: „nur in Format“ ergibt den neuen Befund `ohne-muster`, Auslauf-Wörter (wie bei
  C/D/E) den Befund `hinweis`. Auf „Heute“ erscheint dafür ein eigenes To-do: „Muster nicht lieferbar:
  … kein Handmuster“, Kontext Artikelnummer, Produkt und „Muster im Shop sperren, offene Musterbestellungen
  prüfen“. Es landet nicht im Auslauf-To-do, weil die Ware bleibt und nur das Muster gesperrt wird.
- **Getestet:** `operations/tests/auslauf.test.mjs` 9/9 (neu: Kurzbeschreibung mit und ohne Leerzeichen
  vor der Klammer, Kollektionsname „Format Object“ und Farbcodes in Klammern bleiben `ok`), `todos.test.mjs`
  31/31, `dashboard:test` 1023/1023. Abgleich mit den lokalen Schnellsuche-Daten (Stand 12.10.,
  2.349 von 2.423 Musterartikeln von A): Der Zusatz steht nur bei einer Farbe, in beiden Breiten.
  Auslauf-Wörter hat dort keiner unserer Artikel. Der erste echte Lauf bringt also ein To-do mit, kein
  Rauschen.
- **Risiken:** Ein Handmuster kann auch ohne diesen Zusatz fehlen, so zuletzt bei drei Farben einer
  anderen Linie, die A nur per Mail genannt hatte. Diese Fälle findet die Prüfung nicht. Die Sperre selbst
  bleibt Handarbeit, Grund ist das Problem mit doppelten Muster-SKUs (#1749).
- **Naechste Stufe:** Nach #1749 kann das To-do direkt die Mustersperre auslösen.

## 2026-10-28 · Mustersperre: doppelte Muster-SKUs sperren und freigeben (#1745)

- **Geaendert:** „Muster nicht verfügbar“ sperrte nichts, sobald eine Muster-SKU auf mehr als einer
  Variante lag („gibt es im Shop mehrfach – bitte in Shopify von Hand sperren“). Das trifft laut Lexikon
  2028 von 3911 Muster-SKUs: dieselbe Farbe steht im Teppichboden-Muster und im Nach-Maß-Muster. Am 28.10.
  musste deshalb eine Linie von Lieferant A (3 Farben, 6 Varianten) von Hand gesperrt werden.
  - `operations/lib/mustersperre.mjs`: `leseVarianten()` liefert alle exakten Treffer. Liegen alle in
    `muster-*`-Produkten, sperrt `sperreImShop()` jede Variante (je Variante eigener `@idempotent`-
    Schlüssel) und prüft jede gegen. Erst alle prüfen, dann schreiben: verletzt eine die Vorbedingung,
    wird keine gesperrt. Ein Treffer außerhalb der Musterprodukte bleibt ein Abbruch (`mehrdeutig`) –
    bisher gewann dann still die Mustervariante. Mehr Treffer als eine Abfrageseite ebenfalls.
  - Das Ereignis in `mustersperre.json` nennt alle Varianten (`shopify.varianten`, je mit Vorstand und
    ob sie schon angefasst sein kann). `stand()` führt den Rückweg je Variante; alte Ereignisse mit einer
    Variante (`variantId`/`vorher` direkt unter `shopify`) liest `variantenVon()` als Liste mit einer.
  - „Wieder verfügbar“ stellt jede gesperrte Variante auf ihren eigenen Vorstand zurück. Varianten
    derselben SKU, die keine Sperre angefasst hat (später angelegt oder nach einem Abbruch nie erreicht),
    bleiben unberührt (`stand().varianten[].betroffen`). Die betroffenen liest die Freigabe per ID
    (`leseVariantenNachId`, `nodes(ids:)`): auch nach einer SKU-Änderung wird keine vergessen, eine
    gelöschte ist nichts mehr freizugeben (Codex-Review Runde 1, P2).
  - Sehr alte Ereignisse mit Vorstand, aber ohne `variantId`: der Vorstand geht als früherer Rückweg an
    die Variante von damals (die eine, die ein späteres Ereignis nennt, oder die eine schon gesperrte) und
    wird nicht von einem späteren Lesestand verdrängt (Codex-Review Runde 1, P2). Lässt er sich keiner
    Variante sicher zuordnen, schreibt „Wieder verfügbar“ nichts und verlangt die Freigabe von Hand; sind
    danach alle Varianten bestellbar, ist der Eintrag erledigt (`vorherUnklar`, Runde 2, P2). Ohne jede
    bekannte Variante gibt die Freigabe bei mehreren Varianten nur die nicht bestellbaren frei.
  - Musterlager: bei mehreren Varianten führt „In Shopify öffnen“ zur Produktsuche nach der SKU.
- **Getestet:**
  - `mustersperre.test.mjs` (Proxy-Attrappe): zwei Mustervarianten mit verschiedenem Ausgangsstand
    gesperrt und je auf den eigenen Vorstand freigegeben, zweiter Klick schreibt nichts; Gegenprobe je
    Variante (eine bleibt bestellbar → kein Erfolg; Freigabe halb → Wiederholung schreibt nur den Rest);
    Vorbedingung einer Variante verletzt → keine gesperrt; zweite Variante abgelehnt → nur die erste legt
    einen Rückweg fest, und „Wieder verfügbar“ lässt die nie angefasste zweite Variante, wie sie ist;
    Freigabe per ID trotz geänderter SKU, gelöschte Variante übergangen; alter Vorstand ohne
    `variantId` bleibt Rückweg, unklar zuzuordnen → nichts geschrieben, nach Handfreigabe erledigt;
    fremder Treffer → Abbruch ohne Schreiben; altes Einzel-Ereignis bleibt lesbar
    und freigebbar; zu viele Treffer → Abbruch.
  - `mustersperre-api.test.mjs`: Schritt im Dashboard sperrt beide, Ereignis nennt beide, Liste zeigt
    die Produktsuche, „Wieder verfügbar“ gibt beide frei; fremder Treffer → „im Shop noch zu sperren“,
    lokal entfernbar; alte Ablage → Liste mit Variantenlink und Freigabe.
  - Lesend gegen den Shop (MCP): die SKU-Suche ist exakt, die gesperrte Linie liegt auf je zwei
    Mustervarianten.
- **Risiken:** Ein Muster-SKU, die zugleich auf einem Nicht-Musterprodukt liegt, sperrt jetzt gar nicht
  mehr automatisch (vorher nur die Mustervariante). Laut Lexikon gibt es keine solche SKU.
- **Nächste Stufe:** Die Handsperre vom 28.10. als Ereignis nachtragen, damit „Wieder verfügbar“ sie
  kennt – freigegeben am 28.10., läuft nach dem Deploy (Skript im privaten Datenordner).

## 2026-10-28 · Starter-Test: Zeitlimit nur noch gegen Hänger (#1752)

- **Geaendert:** Das automatische Nachziehen des Dienstes hing am 28.10. um 11:04 an einem roten Probelauf.
  `dashboard-app-starten.test.mjs` („ausbleibender Dienst … leeres App-Fenster“) brach nach dem 8-s-Zeitlimit
  von `spawnSync` ab (`status: null`). Normal braucht der Test unter 1 s, die ganze Testreihe lief in der
  Probe aber 88 statt 12 s, weil der Mac ausgelastet war. Das Zeitlimit liegt jetzt bei 30 s
  (`ZEITLIMIT_MS`). Es soll nur einen Hänger abfangen, die Startdauer misst der Test nicht.
- **Getestet:** Die Datei 14/14, `dashboard:test` 1022/1022, `pruefen` 9/9. Die Probe von Hand
  (`betrieb:nachziehen -- --probe`) war am 28.10. um 11:08 auf demselben Stand grün.
- **Risiken:** Unter künstlicher Last wurde nichts nachgestellt, um den laufenden Dienst nicht zu bremsen.
  Ein echter Hänger fällt jetzt erst nach 30 statt nach 8 s auf.

## 2026-10-28 · „wartet seit“ zählt überall Kalendertage

- **Geaendert:** Die Wartezeiten zählten volle 24 Stunden seit der Bestellung. Eine Bestellung vom 19.10.
  nachmittags stand am 28.10. mittags bei „8 Tagen“ statt 9 (Rückmeldung Inhaber: „muss immer stimmen“).
  Neu `lib/kalendertage.mjs` (Kalendertage in Berlin), verwendet in Packstation (`muster-packen`),
  Bestellungen (`kunden-bestellgruppen`, `shop-bestellarbeit`), Start/Bestellarbeit, Lieferanten-Wartetage
  (`einkauf-lieferanten`), Lieferbelege und Muster-Nachfassen. Das Datum selbst kommt unverändert aus
  Shopify bzw. dem Auftragsfluss.
- **Getestet:** `kalendertage.test.mjs` (Nachmittag, kurz vor Mitternacht, Zeitumstellung, ohne Datum),
  neuer Fall in `muster-packen.test.mjs`; `npm run dashboard:test` und `npm run -s pruefen -- --ohne themecheck`.
- **Risiken:** Schwellen der Aufräumliste und der To-dos rechnen weiter in 24 Stunden (nicht angezeigt).
  Manche Zahlen springen um 1 nach oben, und Warnfarben können einen Tag früher kommen.

- **Naechste Stufe:** keine.

## 2026-10-28 · Etiketten drucken: nur ausgewählte Motive

- **Geaendert:** In der Druckvorschau hat jedes Motiv ein Häkchen „drucken“ (gilt für alle Kopien),
  darüber „alle wählen“ / „keine“. Der Druckknopf zählt nur die ausgewählten Aufkleber, abgewählte
  sind in der Vorschau blass. Ein Teildruck markiert nichts als gedruckt (kein `druckFertig`, keine
  Bestätigung): erledigt ist ein Auftrag erst mit dem vollständigen Lauf. Anlass: der Inhaber wollte
  eine fehlende Reihe nachdrucken, ohne alles neu zu drucken.
- **Getestet:** `npm run dashboard:test` ohne Fehler (die abgebrochenen `laden-zahlen`-Tests brechen in
  der Remote-Sitzung auch auf main ab). Playwright gegen die Vorschau mit 4 Aufklebern/3 Motiven bei
  390 px: Abwählen 4 → 3, „keine“ → 0 und Knopf gesperrt, „alle wählen“ → 4, kein seitliches Scrollen.
- **Risiken:** Druck selbst nicht getestet (kein Drucker in der Remote-Sitzung). Motive jenseits der
  Vorschaugrenze lassen sich nur über „keine“ abwählen.
- **Naechste Stufe:** keine geplant.

## 2026-10-28 · Aufräumliste: „direkt an den Kunden“ nur noch mit Beleg (#1740)

- **Geaendert:** Am 26.10. wurde #1033 über die Aufräumliste mit „wohl direkt vom Lieferanten an den
  Kunden (nicht belegt)“ abgeschlossen und in Shopify gebucht. Die Muster waren aber nie verschickt: Die
  Bestellung bei Lieferant A ging an uns und wurde dort nie erfasst. Die Liste nahm „direkt“ für jede
  Musterbestellung vor dem 24.10. an, die nie angekommen war.
  - „Direkt an den Kunden“ gilt nur noch mit dem Vermerk beim Bestellen (`ueber: 'kunde'`) an jeder
    noch offenen Position. Dann lautet der Vorschlag „laut Bestellung“, und der Beleg steht dabei. Eine
    nie bestellte Position daneben verhindert den Vermerk (Codex-Review: sonst würde sie ohne Rückfrage
    mit abgeschlossen).
  - Sonst heißt es „Die Muster kamen nie an – beim Lieferanten nachfragen“ (bei Bestellungen vor dem
    24.10. mit dem Hinweis, dass das Lieferziel damals nicht gespeichert wurde). Ein Vermerk wird nicht
    vorgegeben (`notiz: null`).
  - Ohne vorgegebenen Vermerk heißt der Knopf „Abschließen…“. Er fragt, woher wir wissen, dass es
    erledigt ist. Ohne Eingabe passiert nichts, sonst wird „Aufgeräumt: <Grund>“ der Vermerk.
- **Getestet:**
  - `aufraeumen.test.mjs`:
    - ohne Vermerk kein „wohl“ und `notiz: null` (vor und nach dem 24.10.)
    - mit Vermerk an allen Mustern „laut Bestellung“, bei nur einem von zwei nicht
    - Knopf „Abschließen“ bzw. „Abschließen…“
  - `dashboard:test` 1021/1021.
  - Klickstrecke gegen die Prüf-Instanz (`--offen`):
    - Der Knopf heißt „Abschließen…“ und fragt nach dem Grund.
    - Abbrechen: kein Aufruf.
    - Mit Grund: genau ein `POST /api/kunden/bestellung-fertig` mit „Aufgeräumt: <Grund>“ (abgefangen,
      nichts geschrieben).
    - Kein JS-Fehler.
  - Datenkopie, heute: unverändert 7 Fälle (gepackte Umschläge vom 22.10.).
  - Datenkopie, durchgespielt für den 10.11.: Die alte Liste hätte bei 9 Bestellungen (#1033,
    #1049–#1060) „wohl direkt an den Kunden“ vorgeschlagen. Darunter sind #1050 und #1051, deren Muster
    laut Avisierung an uns geliefert werden. Die neue Liste schlägt dort „nachfragen“ vor, ohne Vermerk.
- **Risiken:** Alte Fälle lassen sich nicht mehr mit einem Klick abschließen, man muss einen Grund
  tippen. Das ist so gewollt.
- **Nächste Stufe:** keine.

## 2026-10-26 · Inhaberzeile: Frist nach Berliner Kalendertag (Codex-Review #1731)

- **Geaendert:** „nächste Frist“/„Frist überschritten“ vergleicht mit dem Kalendertag in
  Europe/Berlin statt mit dem UTC-Tag. Vorher stand die Frist von gestern bis 01:00 Uhr
  (Sommerzeit 02:00 Uhr) noch als „nächste Frist“ da.
- **Getestet:** `tests/inhaber-ueberblick.test.mjs` mit 00:30 Uhr Winterzeit, 23:30 Uhr und
  00:30 Uhr Sommerzeit; gruen auch mit `TZ=UTC` und `TZ=America/Los_Angeles`.
- **Risiken:** keine; reine Funktion ohne DOM.
- **Naechste Stufe:** –

## 2026-10-26 · Rundgang: Versand, Kundenakte, Inhaberzeile, Hilfe, Anmeldung (Paket P5)

- **Geaendert:** Versand: steht dieselbe Sendungsnummer schon an einer anderen Bestellung, bucht
  der Dialog nicht, sondern nennt die Bestellung; erst „Trotzdem buchen“ trägt sie ein (mit
  Protokoll). Der Server prüft das, bevor er etwas schreibt (#30).
- **Geaendert:** Kundenakte, Schritt „Ware beim Lieferanten bestellen“: je offenem Lieferanten
  „Bestellmail öffnen (Name)“, danach „Ware ist bestellt…“ mit Rückfrage statt Ein-Klick für
  alle Lieferanten. Lieferantennamen aus den Stammdaten über eine gemeinsame Funktion
  (Kundenakte, Heute, Lieferantenpost, Je Auftrag); UNGEKLAERT heißt „Lieferant nicht
  zugeordnet“, „Default Title“ erscheint nicht mehr als Farbe (#40).
- **Geaendert:** Shop-Übersicht, nur Inhaber: eine Zeile unter den Warenbestellungen „Shop in
  Ordnung · 7 Tage … € Umsatz · N Entscheidungen offen · nächste Frist“, jeder Teil verlinkt;
  der Umsatz klappt die Kennzahlen auf. „Weitere Bereiche“ zeigt Zahl und Alter der offenen
  Anfragen (#44). Entscheidungen: Zähler und Liste zählen dieselben Einträge; Link zu „Ideen &
  Fragen“; Genossenschaften sagt bei knapper Frist nicht mehr „nur zur Kenntnis“ (#43).
- **Geaendert:** Hilfe nach der heutigen Seitenleiste (Bestellungen, Muster bestellen,
  Packstation mit „Bestellung packen“/„Muster kommt an“, Lieferantenpost, Fehler melden), neuer
  Ablauf „Muster packen“; „nie automatisch bestellt“ korrigiert (kostenlose Muster bestellt das
  Dashboard selbst). Menüpunkt „Bestellen“ statt „Einkauf & Wareneingang“, „Lieferant“ statt
  „Partnerladen“, Packstation „nicht eingelegt · laut Bestand da – im Regal suchen“ (#41).
- **Geaendert:** Heute sagt bei frischen Shop-Daten „Daten aktuell“ (Werkbank-Rückmeldung zählt
  nicht mehr mit); Sonderposten ohne Shopify-Zugang: verständlicher Satz und „Fehler melden“,
  die Einrichtungsanleitung nur im Dienstprotokoll (#34).
- **Geaendert:** Anmeldung: ein neues gemeinsames Passwort meldet alle damit angemeldeten Geräte
  ab (Abdruck je Sitzung, bestehende Sitzungen übernehmen das jetzige Passwort); Sperre nach
  Fehlversuchen je Gerät auch hinter `tailscale serve`; Zugänge › „Alle anderen Geräte
  abmelden…“ für Control Center und Social-Zentrale (#58).
- **Getestet:** `npm test` 4.188 Tests grün (Dashboard 1.004, darin neu `hilfe-menue`,
  `inhaber-ueberblick`, `zeitleiste-bestellweg`, 5 Anmeldetests, Doppelnummer-Test; Social
  1 neuer Test); `npm run -s pruefen` alle 9 Schritte grün. `dashboard:pruefen --rollen`
  (GH_TOKEN gesperrt) über alle Ansichten: 479 von 485 OK, kein seitlicher Überlauf bei
  1440/1024/800/390/360 px; die 5 Fehler auf „Verlauf“ kommen von der gesperrten GitHub-Anmeldung
  (`/api/activity` antwortet „Bad credentials“, Code unverändert), einer war ein
  Ladezeit-Ausreißer auf „Vorbereiten“. Nachlauf der geänderten und betroffenen Ansichten
  (12 Ansichten, 3 Rollen, 5 Breiten): 150 von 150 OK. Klickstrecken gegen die Datenkopie
  (Playwright headless, 1440 und 390 px): 59 von 59 Prüfpunkten – doppelte Nummer warnt und
  schreibt nichts (auch mit Leerzeichen und Kleinschreibung), „Trotzdem buchen“ trägt ein und
  protokolliert; Kundenakte „Bestellmail öffnen“ öffnet den Dialog (nichts gesendet), „Ware ist
  bestellt…“ fragt zurück und setzt erst nach „Ja“; Inhaberzeile und Kennzahlen auf/zu;
  Entscheidungen Zähler 4 = Liste 4 = Karten 4; Sonderposten-Hinweis; Hilfe und Begriffe;
  „Alle anderen Geräte abmelden“ (8 abgemeldet, eigenes Gerät bleibt, Stempel für die
  Social-Zentrale geschrieben). Instanz danach beendet, Datenkopie entfernt.
- **Nachgebessert (Prüfung):** Eine direkt geöffnete Kundenakte lädt jetzt den Positionsstand
  nach; vorher behielt ein schon bestellter Lieferant dort seinen Knopf „Bestellmail öffnen“
  und stand in der Rückfrage „Ware ist bestellt…“ (Test in `zeitleiste-bestellweg`).
- **Nachgebessert (Codex-Review Runde 1):** „Rückgängig“ direkt nach „Als bestellt markieren“ im
  Bestellmail-Dialog lädt jetzt Kundenakte und Bestellliste nach; vorher blieb die Zeitleiste beim
  Wareneingang stehen und „Bestellmail öffnen“ fehlte (Test in `bestellvorbereitung-dialog`).
  `ladeStandNeu` holt die offene Kundenakte nur noch einmal statt doppelt
  (`auftragsfluss-arbeitslisten`). „Alle anderen Geräte abmelden…“ ist nicht mehr gesperrt, wenn im
  Control Center nur dieses Gerät angemeldet ist – ein Handy nur mit Social-Zugang ließ sich sonst
  nicht abmelden; Dialog und Rückmeldung sagen dann, dass nur die Social-Zentrale abgemeldet wird
  (`team-geraete`, Servertest in `auth`). Getestet: die neuen Tests schlagen mit dem alten Code fehl;
  `dashboard:test` 1.012 grün; `dashboard:pruefen --rollen` auf Zugänge, Kunden, Bestellungen,
  Bestellen und Shop-Übersicht 80 von 80 OK; Klickstrecken gegen die Datenkopie bei 1440 und 390 px
  38 von 38 (alter Code: Akte blieb nach „Rückgängig“ bei „Lieferant liefert die Ware an uns“, der
  Abmeldeknopf war bei einem Gerät gesperrt).
- **Risiken:** Ob `tailscale serve` `X-Forwarded-For` mitschickt, ist im Betrieb nicht
  nachgemessen; ohne den Kopf gilt das Tailscale-Konto, ohne beides bleibt es bei 127.0.0.1
  wie bisher. Die Social-Zentrale übernimmt Abdruck und Abmeldestempel erst nach ihrem
  Neustart. Die Shop-Übersicht lädt beim Inhaber zwei Abrufe mehr (Kennzahlen, Shop-Kontrolle),
  für alle die Service-Anfragen.
- **Naechste Stufe:** Werkbank-/Issue-Bereinigung aus #43 (Verweise, Label, neue Frage)
  entscheidet der Inhaber; Richtigstellung an die Kunden mit derselben Sendungsnummer (#30)
  ebenfalls.

## 2026-10-26 · Speicher am Mac mini, Upload-Links mit Ablaufdatum (Rundgang P7)

- **Geaendert:** Die Shop-Wache misst stuendlich den freien Speicher (`operations/lib/speicher.mjs`)
  und liefert ihn als Feld `speicher` ueber `/api/shopwache/status`. Unter 40 GiB steht auf „Heute“
  (Website-Sicht, nur Inhaber) das To-do „Mac mini: Speicher wird knapp“, unter 20 GiB „… fast
  voll“ (rot). Derselbe Text steht als Hinweis oben in der Shop-Kontrolle. Unter „Social Media“
  steht je Upload-Link „Gültig bis …“: Links laufen nach 180 Tagen ab, abgelaufene verschwinden
  aus der Liste.
- **Getestet:** `npm run dashboard:test` (neue Faelle in `todos.test.mjs`, `api.test.mjs`,
  `social.test.mjs`). `npm run dashboard:pruefen -- --ansichten heute,shopwache,social,insights
  --breiten 390,1440`: alle OK, 0 px Ueberlauf. Mit `--offen` und einem eingespielten Stand
  „23 GiB frei, gelb“ in der Datenkopie zeigen Heute und Shop-Kontrolle den Hinweis bei 390 und
  1440 px, ohne JS-Fehler. Social zeigt beim Link vom 30.09. „Gültig seit 30.9.2026 bis 29.3.2027“.
- **Risiken:** Die Messung kommt mit der Shop-Wache; laeuft sie nicht, bleibt der letzte Stand
  stehen (dafuer gibt es das To-do „Shop-Kontrolle meldet sich nicht“). Kein Hinweis vor dem
  Ablauf eines Upload-Links; das Datum steht nur unter „Social Media“.
- **Naechste Stufe:** keine geplant.

## 2026-10-26 · Service-Anfragen: Wunschzeitraum und „Mieterwechsel / mehrere Wohnungen“

- **Geaendert:** Das Anfrageformular der Serviceseiten (`sections/tp-start-kontakt.liquid`) fragt jetzt
  freiwillig einen Wunschzeitraum ab und bietet unter „Ich möchte“ die Auswahl „Mieterwechsel / mehrere
  Wohnungen“ (Rundgang 26.10., Vermieter mit mehreren Objekten). Der Mail-Leser
  (`docs/ai-dashboard/lib/serviceanfragen.mjs`) kennt das Feld `Wunschzeitraum` und schreibt es in die Notiz
  („Wunschzeitraum: …“). Die neue Auswahl zählt als Verlegeservice und wird von der Startseite automatisch
  übernommen.
- **Getestet:** neue Tests für Mail mit und ohne Wunschzeitraum, Feld und Wert in einer Zeile, Postfach-Übernahme
  einer Startseiten-Mail; ein Theme-Test prüft, dass jedes Feld und jedes Anliegen aus dem Formular im Mail-Leser
  eingeordnet ist (neue Felder fallen so beim nächsten Testlauf auf).
- **Risiken:** Den Feldnamen „Wunschzeitraum“ in der Shopify-Mail kennen wir noch nicht aus einer echten Mail;
  Shopify übernimmt Feldnamen bisher unverändert (nur Großschreibung wie „Plz“).
- **Naechste Stufe:** keine geplant.

## 2026-10-26 · Musteretiketten: Maßartikel auch über die Lieferanten-Artikelnummer (#1723)

- **Geaendert:** Bestellung #1051 stand in der Packstation unter „Zu klären“, weil ein Muster als
  „Originalzuordnung fehlt“ galt. Grund: Die Maßvariante trägt die Einkaufsnummer von Lieferant A
  (`…_043`), die Shop-SKU des Teppichbodens schreibt dieselbe Nummer ohne führende Null (`…_43`).
  Die Zuordnung verglich nur mit der Shop-SKU.
  - `etikettenAusLexikon` gibt je Zeile zusätzlich `artikelnummer` mit, die Einkaufsnummer der
    Quellvariante. Sie wird nicht gedruckt.
  - Bei Maßartikeln passt eine Zeile jetzt, wenn die Artikelnummer der Maßvariante zur Shop-SKU
    **oder** zu dieser Einkaufsnummer passt. Die Farbe muss weiterhin übereinstimmen.
  - Keine SKU geändert, das Etikett zeigt weiter die Shop-SKU.
- **Getestet:**
  - Neuer Test in `bestellungs-musteretiketten.test.mjs`: Schreibweise `_043` gegen `_43` wird
    zugeordnet. Gleiche Nummer bei anderer Farbe bleibt offen, ebenso passende Farbe mit fremder Nummer.
  - Gegenprobe: Mit dem alten Code schlägt genau dieser Test fehl.
  - `dashboard:test` 986/986.
  - Datenkopie, alle 136 Musterzeilen: #1051 wird zugeordnet („Espresso (43) · TEPLORN04_43“), sonst
    keine Änderung. Offen bleiben wie vorher 6 Zeilen aus #1005 bis #1008 (andere Ursache).
  - Alle Maßartikel-Farben im Lexikon: 985 → 1023 zugeordnet. Das sind genau die 38 Farben von fünf
    Linien von Lieferant A mit dieser Schreibweise.
- **Risiken:** Keine neuen. Zwei passende Zeilen ergeben weiter „fehlt“ statt einer Auswahl.
- **Nächste Stufe:** keine.

## 2026-10-26 · Packstation: vorbereitete und angefangene Umschläge stark sichtbar (#1720)

- **Geaendert:** Inhaber zu einem vorbereiteten Umschlag, in dem schon ein Muster lag: „solche Sachen
  müssen stark sichtbar sein“. Bisher stand der Druck klein in der grauen Metazeile, ein eingelegtes
  Muster nur als „1 von 3 abgehakt“. Jetzt gilt:
  - Unter dem Namen jedes offenen Umschlags stehen Marken, also ohne Aufklappen sichtbar:
    - „Umschlag vorbereitet · TT.MM.“ kräftig neutral, mit dunklem Rahmen.
    - Liegen schon Muster im Umschlag: „x von n Mustern schon im Umschlag“ (bzw. „Alle n Muster im
      Umschlag“) in vollem Bernstein, dazu ein Bernstein-Balken links an der Karte.
  - Diese angefangenen Umschläge stehen in ihrer Gruppe oben („Alle offenen“ und jeder Bereich).
  - „Muster kommt an“ zeigt dieselben Marken beim Ziel-Umschlag.
  - Die stille Zeile „x von n abgehakt“ entfällt.
  - Lücke geschlossen: Wer erst abhakt und den Druck nie vermerkt hat, findet „Schon gedruckt – Umschlag
    vorbereitet“ jetzt auch in Schritt 2/3 unter „Mehr …“ (bisher nur in Schritt 1 und „Zu klären“).
- **Getestet:** `packstation-arbeitslisten.test.mjs` neu „Muster schon im Umschlag“:
  - Reihenfolge in „Alle offenen“ und „Wartet auf Ware“.
  - Klasse `mp-angefangen`, beide Marken, keine Marke bei Gepacktem.
  - „Schon gedruckt“ in Schritt 2, Karte in „Muster kommt an“.

  `dashboard:test` 984/984. `dashboard:pruefen`: alle Ansichten OK, kein Überlauf bei 1440–360 px.

  Klickstrecke gegen die Datenkopie:
  - 12 von 14 wartenden Umschlägen tragen „vorbereitet“, der angefangene steht oben.
  - Haken in einem leeren Umschlag: Balken und Marke erscheinen, „Schon gedruckt“ ist anklickbar, der
    Server hat den Vermerk.
  - Sichtprüfung hell und dunkel bei 1440 und 390 px.
- **Risiken:** Marken stehen auf 12 von 17 offenen Umschlägen; auffallen soll vor allem der Bernstein.
  Werden fast alle Umschläge angefangen, verliert die Sortierung ihre Wirkung.
- **Naechste Stufe:** keine geplant.

## 2026-10-26 · Packstation: Info fuer den Packer zu Herstelleretiketten

- **Geaendert:** Oben in der Packstation („Nach Kunde packen“ und „Wareneingang nach Partnerladen“) steht als Info: „Wichtig beim Packen:
  Herstelleretiketten von den Mustern entfernen – außer bei Vorwerk und JAB. Dort bleibt das
  Herstelleretikett dran.“ Wunsch des Inhabers vom 26.10.; nur eine Info, kein Pflichtschritt.
- **Getestet:** neuer Fall in `packstation-arbeitslisten.test.mjs` (Info genau einmal, auch unter „Gepackt“);
  `dashboard:pruefen` Packstation bei 1440/390 px ohne Fehler und ohne Ueberlauf.
- **Risiken:** keine; die Info gilt fuer alle Umschlaege, eine Kennzeichnung je Muster gibt es nicht.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen.

## 2026-10-26 · Nachziehen tauscht Bibliotheken ohne npm ci im Betrieb (#1716)

- **Geaendert:** Aendert sich `package-lock.json`, lief bisher `npm ci` im Dienst-Checkout,
  waehrend Dashboard, Sync und Social noch liefen. Gemessen in einer Wegwerfkopie: `npm ci`
  loescht `node_modules` zuerst, `puppeteer` fehlte bis 291 ms, 6 von 23 frischen Importen
  scheiterten (Social laedt es erst beim Rendern); ohne erreichbare Paketquelle blieb
  `node_modules` leer, und der Rueckweg haette wieder `npm ci` gebraucht. Jetzt hebt die Probe
  ihre frisch installierten, getesteten Bibliotheken auf, und der Lauf tauscht sie per
  Umbenennen ein, bevor er vorspult. Der Rueckweg tauscht ohne Netz zurueck; Reste eines
  Abbruchs raeumt der naechste Lauf auf.
- **Getestet:** Messung mit Beobachter (alle 5 ms Datei, alle 100 ms frischer Import):
  Tausch 0/27 Luecken, 0/10 Importfehler; Tausch plus Rueckweg 6 ms, 0/9 Importfehler.
  Neue Tests mit echter lokaler Bibliothek (offline installiert, Marke aus der Probe):
  Tausch, Warten ohne Ruhe, Rueckweg; derselbe Test scheitert gegen den alten Ablauf.
  Codex-Review Runde 1 (0 P1, 2 P2) behoben: Abbruch nach dem Tausch vor dem Vorspulen
  (Marke mit dem HEAD von vorher) und scheiterndes zweites Umbenennen (sofort zurueck),
  beide Faelle mit Test. Runde 3 (nach #1711, 1 P2): das Zuruecknehmen nach einem Abbruch
  wartet jetzt ebenfalls auf Ruhe (laufende Claude-Routine), mit Ablauf-Test.
- **Risiken:** Probe und Dienst-Checkout muessen auf demselben Laufwerk liegen, sonst kopiert
  die Probe (`cpSync`) statt umzubenennen. Wartet ein Lauf mit neuen Bibliotheken auf Ruhe,
  installiert und testet der naechste erneut (rund 30 s).
- **Naechste Stufe:** keine geplant.

## 2026-10-26 · Packstation: „Umschlag vorbereitet“ für alle Geräte sichtbar (#1718)

- **Geaendert:** Inhaber: „wichtig ist, dass ich es in der Packstation sehen muss – Etikett ausgedruckt
  bedeutet, dass ich einen Briefumschlag vorbereitet habe und auf Ware/Muster warte“ (Beispiel: ein
  Umschlag gedruckt, zwei Muster fehlen seit zwei Wochen). Bisher merkte sich nur der Browser des druckenden
  Geräts den Druck, und der Druck schaltete nur den Schritt im Umschlag weiter. Jetzt gilt:
  - Der Vermerk `gedruckt` steht zentral in `muster-packen.json` und ist auf jedem Gerät sichtbar.
  - Er wird gesetzt, sobald ein Druck aus der Packstation vollständig beim Drucker ist (neuer Rückruf
    `druckFertig` im Druckdialog), oder mit „Schon gedruckt“. Zurücknehmen geht unter „Mehr …“.
  - Die Kopfzeile jedes offenen Umschlags zeigt dann „Umschlag vorbereitet · TT.MM.“, auch in „Zu klären“.
  - Schritt 1 zeigt „gedruckt TT.MM., hh:mm · Person“.
  - „Zu klären“ bekommt einen Satz im Umschlag; dort lässt sich der Vermerk unter „Mehr …“ auch nachtragen.
  - Alte Gerätevermerke werden beim ersten Laden mit ihrem Druckzeitpunkt übernommen.
- **Getestet:** `muster-packen-api.test.mjs` neu „POST gedruckt“: lesen 403, ohne Angabe 400, fremder
  Umschlag 409, `seit` nur bis 30 Tage zurück, Haken lassen den Vermerk stehen, zurücknehmen,
  gepackt 409. `packstation-arbeitslisten.test.mjs` neu „Umschlag vorbereitet“: Kopfzeile, Schritt 1
  mit Zeit und Person, „Zu klären“ mit Satz und „Schon gedruckt – Umschlag vorbereitet“ unter
  „Mehr …“, der Hauptknopf bleibt. Gesamtlauf siehe PR.
- **Risiken:** Ein abgebrochener Druck vermerkt nichts. Wer dann trotzdem alle Aufkleber hat, wählt
  „Schon gedruckt“. Was auf einem Gerät vor diesem Stand gedruckt wurde, erscheint erst, wenn dieses
  Gerät die Packstation einmal öffnet. Für Drucke ganz ohne Packstation (Lexikon) bleibt „Schon gedruckt“.
- **Naechste Stufe:** Nach Merge den Dienst nachziehen und die schon gedruckten Umschläge mit „Schon gedruckt“ nachtragen.

## 2026-10-26 · Routinen als Mac-Dienst: Fehlermeldungen, Postfach, Datenstand (Inhaber 26.10.)

- **Geaendert:** Drei launchd-Dienste ersetzen teure App-Aufgaben (je Start ~105k Tokens). `claude-lauf.mjs
  fehlermeldungen` prueft alle 15 Min. ohne KI und startet `claude -p` (Sonnet, dontAsk, feste Werkzeugliste)
  nur bei neuen Meldungen bzw. hoechstens alle 2 Std. fuer laufende; `claude-lauf.mjs postfach` alle 2 Std.
  zwei getrennte Laeufe (Lieferbelege, Service-Anfragen), Gmail nur lesend; `datenstand-pruefen.mjs`
  prueft stuendlich `aktualisierung.json` (ohne KI). Eine Wache (PreToolUse-Hook per `--settings`,
  `lib/routine-wache.mjs`) lehnt jeden Aufruf ausserhalb der festen Liste ab, auch kuenftige Freigaben aus
  `~/.claude/settings.json`; Werkbank nur per Adresse aus dem privaten Auftragstext, ohne Loeschen.
  `claude -p` laeuft mit `USER` und `CLAUDE_CODE_ENTRYPOINT=claude-desktop` (sonst fehlen Anmeldung bzw.
  Artifact/ArtifactData); das init-Ereignis wird gegen die Pflichtwerkzeuge geprueft, sonst Abbruch
  „werkzeug-fehlt“. Auftragstexte privat unter `routinen/auftraege/` (einmalig kopiert). Zusammenspiel mit
  #1715: `routineLaeuft` in dessen Ruhe-Pruefung (eine Zeile in `betrieb-nachziehen.mjs`), Routinen
  warten auf `betrieb-nachziehen.lock`. Sperre verfaellt nach Zeitlimit plus Puffer; Ueberspringen
  schreibt ein Lebenszeichen; die Stumm-Pruefung kennt das Zeitfenster und meldet auch nie gestartete
  Dienste. Rotes To-do „Mac-Dienst gestört“ auf Heute. `dienste-einrichten.sh --routinen` nutzt
  `vorlage_einrichten`, prueft Skripte und Werkzeuge und laedt erst dann. Der fruehere Nachzieh-Teil
  (`dienst-aktualisieren.mjs`) ist gestrichen - das macht #1715.
- **Getestet:** `routinen.test.mjs` (Zeitfenster, Werkzeuglisten, Bewertung, Pflichtwerkzeuge, Vorpruefung,
  Status, Stumm-Pruefung mit Fenster, Sperre mit Altersgrenze und EPERM, `routineLaeuft`), `routine-wache.test.mjs`
  (Bash-Zerlegung, beide Laeufe, Hook-Skript inkl. Notbremse), `claude-lauf.test.mjs` (u. a. Nachziehen-Wartezeit,
  falsches `claude` fuer fehlendes Werkzeug, Zeitlimit mit Enkelprozess, Werkzeugprobe), `datenstand-pruefen.test.mjs`,
  `todos.test.mjs`, `api.test.mjs`, `betrieb-nachziehen.test.mjs` unveraendert gruen. Echt unter `env -i` wie in
  der Plist: Werkzeugprobe beider Laeufe (alle Pflichtwerkzeuge da), Wache lehnt `ls /` unter `--restricted`
  und `mcp__claude_ai_Gmail__list_labels` im Postfach ab, `fehlermeldungen --erzwingen` → „nichts zu tun“,
  0 Ablehnungen, 3 Runden, 53k Tokens.
- **Risiken:** `CLAUDE_CODE_ENTRYPOINT=claude-desktop` ist undokumentiert (die Pflichtpruefung faengt eine
  Aenderung ab). Die echten Postfach-Laeufe und der Bildschirmfoto-Upload sind nur trocken bzw. per Probe
  geprueft; wo `claude -p` grosse Gmail-Ergebnisse ablegt, ist aus dem Programm gelesen
  (`~/.claude/projects/<Dienst>/…/tool-results/`), nicht im Lauf beobachtet - liegt es anderswo, lehnt die
  Wache das Lesen ab und der Lauf meldet sich als gestört.
- **Naechste Stufe:** Einschalten nach der Schrittliste (App-Aufgaben pausieren, `--routinen`), ersten
  Postfach-Lauf im Log ansehen.

## 2026-10-26 · Gepackte Umschläge ohne Versandvermerk: richtiger nächster Schritt, nach 3 Tagen aufräumen (#1709)

- **Geaendert:**
  - Ist ein Musterumschlag gepackt, heißt der nächste Schritt „Umschlag gepackt am TT.MM. – zur Post
    bringen und als verschickt eintragen“ statt „Muster labeln und an den Kunden schicken“.
  - Gepackte Umschläge ohne Versandvermerk stehen nach 3 Tagen in „Alte Bestellungen aufräumen“, mit
    „Ist verschickt…“ (Versanddialog, Versandmail vorab aus) und „Liegt noch hier“. Abschließen gibt es
    dort bewusst nicht, damit das Nachfassen weiterläuft.
  - Anlass: Befund aus #1706. #1043–#1047 sind seit dem 22.10. gepackt, ohne eingetragenen Versand.
- **Getestet:**
  - `auftragsverlauf.test.mjs`: neuer Test für den nächsten Schritt.
  - `aufraeumen.test.mjs`: 9 Tests, davon 2 neu (Regel und Knöpfe, API mit Packablage). Eine alte Prüfung
    wurde umgekehrt: gepackt vor 4 Tagen war bisher bewusst kein Fall.
  - Läufe: `dashboard:test` 977/977 (nach Rebase), `npm run -s pruefen` 9/9, `dashboard:pruefen` ohne Befund.
  - Klickstrecke gegen die Datenkopie: Liste 7 (#1013, #1037, #1043–#1047) → 6. „Ist verschickt…“
    öffnete „An Kunden raus · #1013“ mit Mail aus und setzte 3 Artikel auf „raus“ mit Vermerk und
    `versandMail: false`. Die Shopify-Buchung war in der Prüfinstanz erwartungsgemäß „nicht gebucht“.
- **Risiken:** Ob ein gepackter Umschlag wirklich zur Post ging, weiß das Dashboard nicht. Entschieden
  wird per Klick.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen.

## 2026-10-26 · Betrieb zieht main automatisch nach (#1710)

- **Geaendert:** Neuer Dienst `net.teppich-paradies.nachziehen` (alle 5 Minuten,
  `operations/scripts/betrieb-nachziehen.mjs`) ersetzt die Handgriffe aus Skill
  `control-center`, Schritt 9. Seit dem 12.10. wurde `~/tp-dashboard` 142-mal von Hand oder
  per KI-Lauf nachgezogen, jedes Mal mit Abpassen des Codex-Musterlaufs. Der Lauf testet den
  zusammengefuehrten Stand zuerst in einer losgeloesten Probekopie (ohne echte Betriebsdaten),
  wartet auf Ruhe (kein Codex-Lauf in diesem Checkout, zwei Minuten keine Eingabe), spult genau
  den getesteten Commit vor, startet nur betroffene Dienste neu (Dashboard; Sync bei
  `operations/`, Social bei `social/`; reine Theme- und Regelaenderungen gar nichts) und prueft,
  dass sie antworten. Sonst Rueckweg auf den Stand von vorher. Systemzustand zeigt
  „Dashboard-Update hängt“, langes Warten oder einen stehengebliebenen Dienst;
  `dienste-einrichten.sh --nur-nachziehen` richtet ihn ein (gemeinsame Vorlagenfunktion mit der
  Sicherung). Skills `control-center` und `ship` verweisen auf `--status` statt der sieben Schritte.
  Dazu: `npm run dashboard` startet bei einem GitHub-Ausfall mit der bisherigen `issues.json`
  (`build-dashboard-data.mjs --weiter-mit-alten-daten`); vorher verhinderte ein gescheiterter
  Abruf jeden Neustart, von Hand wie automatisch.
- **Getestet:** `operations/tests/betrieb-nachziehen.test.mjs` (12 Tests, davon 6 mit echtem git aus
  origin, Entwicklerklon und Dienst-Checkout: nichts Neues, Uebernahme mit Merge-Commit auf
  `dashboard-betrieb`, reine Theme-Aenderung ohne Neustart, rote Probe und Konflikt lassen HEAD
  stehen und werden fuer denselben main-Stand nicht wiederholt, Rueckweg bei fehlendem Neustart,
  Warten ohne erneuten Testlauf, eigene Aenderungen, losgeloester Kopf, Probe von Hand schreibt
  nichts, Sperre nach Absturz, Laufmarker nur als JSON-Ereignis, CLI im Dienst still und von Hand
  immer mit Antwort). `vereinfachung.test.mjs`: Systemzustand-Zeilen ohne Pfade oder Befehle, keine Zeile
  ohne Einrichtung; `build-data.test.mjs`: Start bei GitHub-Ausfall. Claude-Pruefung (`/code-review`,
  Codex-Kontingent war erschoepft) fand 14 Punkte; behoben u. a. Background-Drosselung der Probe,
  Sperre ohne Altersgrenze, starrer Social-Statuscode, Sync-Pruefung nur per PID, Pfade im Systemzustand. Echte Probe gegen einen Wegwerf-Klon
  mit 14 neuen Commits aus main: Probe gruen in rund 10 s, Uebernahme mit Attrappen-Neustart.
  Erste Fassung testete in einem `git archive`-Export; der fiel in `fehler-melden-api.test.mjs`
  durch (Dienststand kommt aus git), deshalb jetzt `git worktree add --detach`.
- **Risiken:** Die Ruhe-Erkennung fuer Codex liest dessen Protokoll (`task_started`/`task_complete`);
  aendert Codex das Format, gilt ein Lauf ohne Marker nach 5 Minuten Stille als beendet. Eingaben
  erkennt der Lauf an Dateien direkt im Privatordner; wer laenger als zwei Minuten nichts speichert
  und dann mitten im Neustart speichert, bekommt eine Fehlermeldung und muss den Klick wiederholen.
  Der Rueckweg setzt den Betriebszweig per `reset --keep` auf den Commit von Sekunden vorher; der
  Zweig traegt keine eigenen Inhalte.
  Ungetestet: der Weg mit geaendertem `package-lock.json` (`npm ci` im laufenden Checkout, die alten
  Dienste laufen dabei noch) und die echte launchd-Steuerung; die greift erst im Betrieb.
- **Naechste Stufe:** Nach dem Merge einmal von Hand nachziehen, Dienst einrichten, ersten echten
  Lauf beobachten. Danach die geplante Aufgabe „Dashboard-Daten aktualisieren“ ohne ihren
  Nachziehschritt (naechster Vorschlag: KI-Laeufe ohne Arbeit sparen).

## 2026-10-26 · Musteraufkleber: QR-Code auf ganzen Kästchen, Druck so schlank wie die Vorschau (#1708)

- **Geaendert:** Nach dem Testdruck Modena 3N55 auf 50 × 50 und 50 × 80 (Foto Inhaber) gab es zwei Befunde.
  (1) Der QR-Code sass auf 50 × 50 tiefer und weiter links als geplant. `layout()` gab ihm 140 px, gezeichnet
  wird aber in ganzen Druckpunkten je Kästchen (37 Kästchen × 3 px = 111 px). Den Rest von 29 px liess die
  Zeichnung oben und rechts frei. Jetzt legt `qrRaster()` die Fläche schon im Layout auf das Kästchenraster:
  Der Code steht im Querformat bündig am rechten Rand und mit der Oberkante auf Höhe der ersten Technikzeile.
  Die frei werdende Breite geht an die Technikspalte. (2) Der Druck war fetter als die Vorschau. niimbluelib
  druckt jedes nicht ganz weisse Pixel schwarz, auch die grauen Kantenpixel der Schrift. `zeichne()` setzt das
  Bild deshalb am Ende mit `schwarzWeiss()` auf reines Schwarz/Weiss (Schwelle 150 von 255). Vorschau, PNG und
  Druck zeigen damit dasselbe Bild, kleine Schrift wie „Fußbodenheizung“ läuft nicht mehr zu. Die Schwelle ist
  aus dem Vergleich 128/150/180 gewählt: 128 wird bei 2,5 mm Schrift dünn, 180 wieder fett.
- **Getestet:** `muster-etiketten.test.mjs` 27/27, neu: `qrRaster` (Vielfache, ohne URL 0), `schwarzWeiss`
  (Grenze genau bei `SCHWELLE`), QR im Querformat bündig rechts und oben auf Technikhöhe, jede QR-Fläche in
  allen Zufallsetiketten ein Vielfaches der Kästchenzahl. `dashboard:test` 975/975. Pixelprüfung im Browser
  (Puppeteer, echte Canvas-Schrift) über alle Lexikonprodukte, 3000 Zufalls- und 800 Adressetiketten in
  50 × 50, 50 × 80 und 50 × 100 (Ergebnis siehe PR).
- **Risiken:** Im Hochformat mit sehr langem Namen bleibt ein QR-Code mit 2 Punkten je Kästchen (z. B. 74 px
  bei 37 Kästchen). Gedruckt wurde dort schon vorher genau so viel, das Layout meldet die Grösse jetzt nur
  ehrlich. Die Schwelle ist am Bildschirm gewählt; der nächste Testdruck bestätigt sie.
- **Naechste Stufe:** Testdruck Modena 50 × 50 und 50 × 80 mit dem neuen Stand. Wirkt der Druck dann zu dünn,
  `SCHWELLE` in `lib/muster-etiketten.mjs` anheben.

## 2026-10-26 · Packstation: Eingelegt und gepackt bestätigen den Wareneingang (#1706)

- **Geaendert:** „Eingelegt ✓“ und „Umschlag gepackt“ setzen die betroffenen Muster im Auftragsfluss
  von „bestellt“ auf „geliefert“, nur vorwärts. Ausgenommen sind Direktversand an den Kunden, die
  laufende Musterautomatik und offene Fehlmengen. Die Packstation meldet die Zahl bzw. einen Fehler.
  Dazu kommt `packstationWareneingangNachholen()` für die Haken und Umschläge von vorher. Anlass:
  Befund aus #1698. Gepackte Muster standen weiter auf „bestellt“ und erzeugten „Beim Lieferanten
  nachhaken“ und Aufräumfälle. Lieferantenbelege (Idee aus derselben Runde) helfen bei Mustern nicht,
  weil Lieferant A dafür weder AB noch Lieferschein schickt.
- **Getestet:** `packstation-wareneingang.test.mjs` (6 Tests: Haken setzt nur die abgehakte bestellte
  Position, Rücknahme stuft nicht zurück; Gepackt erfasst alle, schon gelieferte bleiben unverändert,
  nie bestellte bekommen keinen Status; Musterautomatik bleibt; Direktversand bleibt; Rolle „lesen“ 403
  ohne Schreibzugriff; Nachholen mit Datum im Vermerk, zweiter Lauf 0). `dashboard:test` 972/972 (nach Rebase),
  `npm run -s pruefen` 9/9, `dashboard:pruefen` 38 Ansichten in allen Breiten OK.
- **Risiken:** Wer versehentlich einen Haken setzt und wieder zurücknimmt, hinterlässt „geliefert“.
  Das ist gewollt, denn ein Muster verschwindet nicht wieder, und es lässt sich in der Zeitleiste
  korrigieren.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen und die vorhandenen Haken bzw. Umschläge
  einmal nachholen (bei angehaltenem Dienst).

## 2026-10-26 · Musteraufkleber: 4 mm Rand, ruhiger Aufbau, Eckdaten, Druckversatz einstellbar

- **Geaendert:** Nach den ersten vier Ausdrucken (Foto Inhaber: letzte Ziffer der Art.-Nr. rechts halb weg, einmal
  die Shopadresse oben, „mittiger und besser angeordnet“, danach „noch besser und professioneller“): Rand rundum
  4 mm statt 2,25 mm (B1-Druckkopf nur 48 mm, Rolle sitzt nicht auf den Millimeter). Neuer Aufbau mit einer
  Stimme je Ebene: Shopadresse klein und normal, Serie gross und fett, Farbe normal, duenne Linie, Mittelteil,
  duenne Linie, „Art.-Nr.“ normal und die Nummer fett in einer Zeile. Paketware zeigt die Technik als Tabelle
  (Bezeichnung links, Wert fett rechtsbuendig; Staerke und Nutzschicht je eine Zeile) - auf 50 × 50 neben dem
  QR-Code, dadurch bleibt die Serie gross statt auf 24 px zu schrumpfen. Namen nehmen lieber eine kleinere Schrift
  als eine Zeile mehr („Vorwerk Modena“ auf 50 × 80 einzeilig statt zweizeilig). QR-Code hoechstens 20 mm
  (50 × 50); auf 50 × 80 steht bei genug Platz „Produkt im Shop ansehen“ darunter. Neu unter
  „Drucker-Einstellungen“: Versatz waagerecht/senkrecht bis 3 mm in 0,5-mm-Schritten, je Rechner gemerkt; er
  verschiebt nur das Druckbild, die Vorschau bleibt mittig. Eckdaten (Inhaber: „wenn so viel Platz ist, ein paar
  Eckdaten auch zu den anderen Sachen … Qualitaet und verfuegbare Meterbreite“): Teppichboden und andere Ware ohne
  Paket zeigen Material, Breite (Rollenbreiten der Farbe aus den Varianten, z. B. „400 / 500 cm“), Florhoehe
  (sonst Staerke) und Nutzungsklasse, alle Ware dazu „Fußbodenheizung: ja“, wenn im Lexikon belegt. Diese Zeilen
  sind Zusatz: `layout()` nimmt sie der Reihe nach nur, solange Serie und Technik dafuer nicht kleiner werden -
  auf 50 × 80 meist alle, auf 50 × 50 so viele, wie neben den QR-Code passen. Druckbild jetzt genau so breit
  wie der B1-Druckkopf (384 statt 400 px, mittig ausgeschnitten - es fallen nur weisse Randspalten weg);
  bisher legte die Firmware das zu breite Bild nach eigenem Gutduenken auf den Kopf.
- **Getestet:** `muster-etiketten.test.mjs` angepasst (zwei Linien, Art.-Nr. normal/Nummer fett in einer Zeile,
  Tabelle, Name einzeilig auf 50 × 50 und 50 × 80, Hinweis nur auf 50 × 80, 4-mm-Rand links/rechts/oben/unten);
  Eckdaten nur wo Platz, Reihenfolge, sperrige Zeile faellt allein weg, feste Zeilen bleiben, `breitenAus`;
  Zufallstest mischt feste und Zusatzzeilen). Klicktest gegen die Datenkopie: Versatz 1 mm links/0,5 mm unten
  gemerkt, auch nach Neuladen, Hinweis „Versatz eingestellt“, Vorschau bleibt mittig (32/32 px), 390 px ohne
  seitliches Scrollen, keine JS-Fehler; `dashboard:pruefen` 38 Ansichten ohne Ueberlauf. Druckbild Modena 3N55
  50 × 80 in Chrome mit niimbluelib kodiert: 384 × 640 Punkte, alle 42 324 schwarzen Punkte der Vorschau
  enthalten, je 24 Punkte Rand links/rechts auf dem Kopf. Pixelpruefung in Chrome (Arial, jedes Teil einzeln
  gezeichnet): alle 20 675 verschiedenen Etiketten des Lexikon-Exports passen im neuen Aufbau in 50 × 50,
  50 × 80 und 50 × 100, 0 Beruehrungen, keine Tinte ausserhalb des 4-mm-Rands; 800 Zufallsadressen ebenso.
  `npm run -s pruefen`: alle 9 Schritte bestanden.
- **Risiken:** Der Versatz ist eine Schaetzung je Rolle/Drucker; erst ein neues Foto zeigt, ob 4 mm Rand allein
  reichen. Die Technik-Tabelle auf 50 × 50 setzt Werte in 16-20 px (2-2,5 mm) - lesbar, aber kleiner als vorher.
  Bestellungen, deren Muster schon vor dem Update vorgemerkt waren, melden in „Muster vormerken“ „Produktdaten
  geaendert“, weil das Etikett jetzt Eckdaten traegt - einmal neu vormerken.
- **Naechste Stufe:** Vier Etiketten neu drucken, Foto; wenn noch etwas schief sitzt, Versatz einstellen.
## 2026-10-26 · Packstation baby-einfach: Bestellung in drei Schritten, „Muster kommt an“ (#1701)

- **Geaendert:** Ein geoeffneter Umschlag fuehrt in drei Schritten - Bestellung drucken (Aufkleber und
  Adresse), Was ist da? (Da/Fehlt), Zukleben - und zeigt je Schritt genau einen Hauptknopf; Seltenes steht
  unter „Mehr …“. Neuer Reiter „Muster kommt an“: ein grosses Feld, darunter je passendem Muster eine grosse
  Karte mit Ziel-Umschlag, „Aufkleber drucken“ und „Eingelegt ✓“ (leert das Feld fuer das naechste Muster);
  ohne Eingabe der Wareneingang je Partnerladen. Anlass: Inhaber 26.10. („baby einfach … ich drucke immer
  eine Bestellung aus samt Adresse und schaue, was da ist und was fehlt“).
- **Getestet:** `packstation-arbeitslisten.test.mjs` (Schritte 1-3 mit genau einem Hauptknopf, Zu klaeren
  und Gepackt, Reiter „Muster kommt an“ mit Karten, Reihenfolge, Schon eingelegt, Nichts gefunden),
  `muster-packen.test.mjs` (`handTreffer`, `aufkleberFuer` nur offene), `dashboard-abschlusskorrekturen.test.mjs`
  („Eingelegt ✓“ leert das Feld und setzt den Fokus nur nach bestaetigtem Haken).
- **Risiken:** Der Druckstand gilt je Geraet; nach Browserwechsel steht wieder Schritt 1 („Schon gedruckt –
  weiter“ hilft). Ein abgehaktes Muster gilt als gedruckt.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen (nur Dashboard). Danach eine Woche Praxis, dann
  ggf. drei Stapel statt fuenf Listen.

## 2026-10-26 · Alte Bestellungen aufräumen: belegt fertige fallen heraus, der Rest per Klick (#1698)

- **Geaendert:** Bestellungen, die in Shopify archiviert oder voll erstattet sind, gelten als belegt fertig
  und fallen ohne Klick aus „Offen“ (`belegtFertigGrund`). Neu auf der Shop-Übersicht: „Alte Bestellungen
  aufräumen“ - offene Bestellungen ohne Bewegung seit 14 Tagen (Ware 30), mit den vorhandenen Belegen und
  einem Vorschlag; Knöpfe „Abschließen“ (wie „Kunde fertig“, Vermerk = Vorschlag, Shopify-Buchung ohne
  Mail) und „Läuft noch“ (Notiz, fragt später wieder). Anlass: Inhaber 26.10., sehr alte Bestellungen im
  Dashboard. Befund im echten Bestand (Kopie): Storno und Test waren schon ausgeblendet; 5 Musterbestellungen
  vom 30.09. bis 11.10. hingen auf „bestellt“, eine davon laut Notiz „nicht verfügbar“, die übrigen
  vermutlich direkt vom Lieferanten verschickt (Lieferziel vor dem 24.10. nicht gespeichert).
- **Getestet:** `aufraeumen.test.mjs` (7 Tests: belegt fertig, Ausschlüsse, Grenzen 13/14 und 29/31 Tage,
  jede Bewegungsart setzt die Uhr zurück, alle Vorschlagsarten, Block escaped und ohne Knöpfe für „lesen“,
  API mit Uhr: Fall nach 25 Tagen, archiviert nie, „Läuft noch“ bis Tag 15). `dashboard:test` 959/959,
  `npm run -s pruefen` 9/9. `dashboard:pruefen` heute/kunden alle Breiten OK, 0 px Überlauf. Klickstrecke
  gegen die Datenkopie: Liste 5 → 4 („Läuft noch“, Notiz gespeichert) → 3 („Abschließen“, alle Artikel
  erledigt mit Vermerk; Shopify-Buchung in der Prüfinstanz ohne Zugang erwartungsgemäß „nicht gebucht“).
- **Risiken:** „Abschließen“ bucht im Betrieb in Shopify als versendet (ohne Mail) - gewollt nach
  Abschnitt 24, aber nicht in der Prüfinstanz nachweisbar. Die Notizerkennung „nicht verfügbar“ ist ein
  Vorschlag, kein Beleg; entschieden wird per Klick.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen (nur Dashboard und `scripts/`, kein `operations/`).

## 2026-10-26 · Packstation: alles finden, je Muster neu etikettieren, mit einem Klick packen (#1694)

- **Geaendert:** Die Suche steht auch im Wareneingang und findet zusaetzlich Musterbestellungen ausserhalb
  der Packliste (Zahlung offen, geschlossen, storniert, schon versandt/erledigt) - mit Grund und Link,
  ohne Packaktion. Jedes Muster hat „Aufkleber drucken“ (nur dieses Muster), gepackte Umschlaege
  „Aufkleber erneut drucken“. „Alle n Muster eingelegt – Umschlag gepackt“ hakt in einem Schritt ab und
  packt; im Wareneingang wird direkt in der Zeile abgehakt. Anlass: Inhaber 26.10. („alles finden … sehr
  einfach packen und neu etikettieren“); bisher druckte die Packstation nur ganze Umschlaege, und in der
  Ablage stand noch kein einziger Haken.
- **Getestet:** `muster-packen.test.mjs` (Gruende ausserhalb, Suche nur bei gleich gutem Treffer,
  `aufkleberFuerMuster`), `muster-packen-api.test.mjs` („Alle eingelegt“ mit veralteter Seite 409 ohne
  Schreiben, Rolle lesen 403, ausserhalb im GET), `packstation-arbeitslisten.test.mjs` (Druck je Muster,
  erneut drucken, Hauptaktion nur bei Packbereit, Wareneingang mit Haken/Druck/Suche, Abschnitt
  „Außerhalb der Packliste“).
- **Risiken:** „Alle eingelegt“ verlaesst sich auf die Person am Packtisch - bei „Wartet auf Ware“ fragt
  es deshalb einmal nach. Treffer ausserhalb stehen nur, wenn sie mindestens so gut passen wie ein offener
  Umschlag.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen (nur Dashboard, kein `operations/`).

## 2026-10-26 · Musteraufkleber auch 50 × 80 mm; nichts ueberlappt, nichts wird abgeschnitten

- **Geaendert:** Im Druckfenster „Etikettengröße“ jetzt 50 × 50, 50 × 80 (neu, 400 × 640 px, alles 1,3-mal so
  gross) oder 50 × 100 mm, passend zur eingelegten Rolle; der Browser merkt sich die Wahl. Wunsch des Inhabers:
  „nix darf ueberlappen oder abgeschnitten sein, egal wie lang oder kurz die Texte“. `layout()` prueft jetzt
  jeden Entwurf (`layoutProbleme`: im Rand, keine zwei Teile beruehren sich, keine Kuerzung, kein getrenntes
  Wort, Schrift ab 12 px, QR-Modul ab 2 Druckpunkten) und setzt das Etikett sonst schrittweise kleiner.
  Zeilenabstaende beruecksichtigen Umlaut-Akzente und Unterlaengen (in Chrome gemessen) und 1 px
  Kantenglaettung, weil niimbluelib jedes nicht ganz weisse Pixel schwarz druckt. Technikwerte und
  Adresszeilen brechen an Wortgrenzen um, statt winzig zu werden. Passt ein Etikett auch in Mindestschrift
  nicht, zeigt die Vorschau „Passt nicht auf …“ und Druck/PNG bleiben gesperrt. Im Hochformat reserviert die
  Technik jetzt Platz fuer den QR-Code darunter (vorher konnte er bei vielen Technikzeilen wegfallen).
- **Getestet:** `dashboard:test` 939/939; neu in `muster-etiketten.test.mjs` u. a. 400 Zufallsetiketten (kurz bis
  sehr lang, Umlaute, Klammern, bis 5 Technikzeilen) in allen drei Formaten, Sperre bei zu langer
  Artikelnummer; `muster-packen.test.mjs`: ellenlange Adresszeilen brechen um. Pixelpruefung in Chrome (Arial,
  jedes Teil einzeln gezeichnet, Abstand ≥ 1 px, Tinte im Rand, alle Woerter vorhanden): alle 20 675
  verschiedenen Etiketten des Lexikon-Exports vom 26.10. (24 690 Varianten) passen in allen drei Formaten, 0
  Pixelfehler, kleinste Schrift 16 px (50 × 50) bzw. 18 px, kleinster QR-Code 100 / 130 / 160 px; dazu 3000
  Zufallsetiketten und 800 Adressen ohne Pixelfehler (136 Zufallsetiketten mit Artikelnummern von 40+
  Zeichen ohne Leerzeichen werden gesperrt).
  Klickstrecke gegen die Datenkopie: Auswahl 50 × 50 / 50 × 80 / 50 × 100, Vorschau 400 × 640, Wahl gemerkt,
  zu langes Etikett gesperrt, 0 JS-Fehler; `dashboard:pruefen` (Lexikon, Einkauf; 1440/390 px) ohne Fehler.
- **Risiken:** Echter Druck auf der 50 × 80-Rolle am B1 erst nach dem Nachziehen von `~/tp-dashboard` (labelType 1
  wie bisher). Die Tintenmasse gelten fuer Arial; auf einem Rechner ohne Arial nimmt der Browser Helvetica
  bzw. eine serifenlose Ersatzschrift.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen, Seite neu laden, Testetikett auf 50 × 80 drucken.

## 2026-10-26 · Packstation: alle Musterbestellungen sofort, mit Anmerkung und Herstellersuche (#1691)

- **Geaendert:** Die Packstation oeffnet mit „Alle offenen“; wartende Umschlaege sagen, was noch fehlt und
  wann (automatisch) bestellt wurde. Die Suche findet ein Muster ueber das, was darauf steht (Hersteller,
  Produkt, Kollektion, Farb-/Artikelnummer), klappt bis zu drei Umschlaege auf und markiert das Muster.
  Direktversand an den Kunden (`ueber: 'kunde'`) steht unter „Zu klaeren“. Anlass: Inhaber 26.10. – seit
  der Musterautomatik standen 17 Umschlaege unter „Wartet auf Ware“, Standardliste und Menuezahl zeigten 0.
- **Getestet:** neue Faelle in `muster-packen.test.mjs` (Anmerkung, Direktversand, `packSuche`) und
  `packstation-arbeitslisten.test.mjs` (Standard „Alle offenen“, Reihenfolge, Anmerkung, Suche mit
  unbekanntem Wort); der alte Test „Standard nur Packbereit“ ist durch die Entscheidung ersetzt.
- **Risiken:** Packbereit braucht weiterhin Abhaken oder „angekommen“; die Liste ist laenger als vorher.
  Die Suche zeigt nur die besten Treffer – ein Tippfehler in der Farbnummer kann auf ein aehnliches Muster
  fuehren; die markierte Farbnummer vor dem Einlegen vergleichen.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen (nur Dashboard, kein `operations/`).

## 2026-10-25 · Musteretiketten: Art bei Vinyl von der Rolle, „Auch als“ bei gleichem Dekor (#1682)

- **Geaendert:** Der Lexikon-Export setzt `gleicherDekor` an Vinyl-Produkten, deren Dekor belegt auch in
  einer anderen Vinyl-Art im Shop ist (gleicher Shop-Name vor dem Gedankenstrich, gleicher Lieferant,
  gemeinsame Dekornummer in dessen Artikel- oder Farbnummer). Das Muster-Etikett zeigt darunter „Auch als
  Klickvinyl“ bzw. „Klebevinyl“. Vinyl von der Rolle bekommt die Zeile „Art“ (bisher nur Paketware).
  Wunsch des Inhabers vom 20.10.
- **Getestet:** neue Faelle in `lexikon.test.mjs` (Beleg und vier Gegenfaelle: andere Dekornummer,
  anderer Lieferant, Entwurf, gleiche Art) und `muster-etiketten.test.mjs` (Technikzeilen, `andereArten`,
  Layout mit fuenf Zeilen in 50 × 50 und 50 × 100, Rollenware). Probe auf dem echten Lexikon, nur
  lesend: 184 Produkte (92 Paare) bekommen den Hinweis, alle bei einem Lieferanten; 186 aktive
  Rollenvinyl bekommen die Art.
- **Risiken:** Mit dem Hinweis sinkt die Technikschrift auf dem 50 × 50-Etikett auf 16/20 px. Lieferant A
  bleibt ohne Hinweis, weil Klick- und Klebelinien dort verschieden heissen; die Dekornummern allein
  belegen den gleichen Dekor nicht. Der Hinweis erscheint erst nach dem naechsten Lexikon-Export.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen und den Sync-Dienst neu starten
  (`operations/` betroffen); danach ein Etikett am B1 drucken und ansehen.

## 2026-10-24 · Drei Ablaufreibungen: Muster direkt, Teil-Wareneingang, Service-Stand (#1680)

- **Geaendert:** (1) Muster mit Lieferziel „Kunden“ tragen beim Bestellen `ueber: 'kunde'`; Zeitleiste
  und Einkauf ueberspringen „bei uns angekommen“ und bieten „Ist an den Kunden raus…“ (Versanddialog,
  Shopify-Buchung, danach Nachfassen). (2) Der Versanddialog zeigt eine offene Fehlmenge vorher statt nach
  einem 409 und fuehrt mit „Wareneingang ergänzen…“ in den Mengendialog; dieser nennt die Restmenge, die
  Rueckmeldung einer Teilbestaetigung sagt „bleibt offen“. (3) Service-Anfrage aus „Heute“: Stand mit einem
  Klick statt Bearbeiten → Auswahl → Speichern. Anlaesse: fuenf Musterauftraege seit 15.–22.10. auf „bei uns
  angekommen“, eine Warenbestellung am 19.10. (vier Bestaetigungen 2/3, drei abgelehnte Buchungen), vier Anfragen seit
  16.10. auf „Neu“.
- **Getestet:** neue Faelle in `auftragsverlauf`, `auftragsstatus`, `einkauf-uebersicht`; `npm test`
  8 Suiten ohne Fehler, `dashboard:test` 929/929. `dashboard:pruefen`: 38 Ansichten in 5 Breiten ohne
  JS-Fehler und Ueberlauf. Klickstrecke gegen die Datenkopie (Instanz ohne Shopify-Zugang, 19/19): Statusknopf
  schreibt „Neu → Kontaktiert“ samt Verlauf; Versanddialog bei 3/4 lfm ohne Buchen-Knopf, Teilbestaetigung meldet
  „1 lfm fehlen … bleibt offen“, 4/4 → geliefert und wieder buchbar; Musterauftrag mit Vermerk zeigt keinen
  Eingangsschritt, „Ist an den Kunden raus…“ setzt alle drei auf raus, Zeitleiste „Vom Lieferanten direkt
  an den Kunden verschickt“.
- **Risiken:** Alte Direktmuster ohne Vermerk bleiben, wie sie sind; der Inhaber traegt sie ueber „Etwas
  anderes ist passiert …“ nach. Die Musterautomatik steht seit 23.10. auf „Laden“, der Direktweg greift
  also nur bei Hand gewaehltem Ziel. Der Versanddialog prueft gegen den geladenen Stand; der Server bleibt
  die Sperre. Kein Shopify-Schreibzugriff im Test.
- **Naechste Stufe:** Nach Merge `~/tp-dashboard` nachziehen (Abschnitt 9 im Skill) inklusive Neustart
  des Dienstes, weil `operations/` betroffen ist.

## 2026-10-23 · Gemessene Restlaenge im bestehenden Rollenbestand (#1643)

- **Geaendert:** Inhaber tragen die gemessene Restlaenge direkt bei der vorhandenen Restrolle ein.
  Feste Breite, Vorschau und konservative Abrundung in volle m²; ausschliesslich physischer Bestand
  mit atomarer Gegenpruefung, Vorgangs-ID, Protokoll und Read-back. Gebundene, reservierte,
  zurueckgehaltene oder unbekannte Mengen sperren die Inventur. Der bestehende Ladenknopf
  verlangt die Buchung vor Zahlung und Zuschnitt.
- **Getestet:** Nur Attrappen: 12 m Bestand / 10 m Laden / 5 m Online in beiden Reihenfolgen
  und gleichzeitig; Inventursperren, Dezimallaengen, 4-/5-m-Breite, leere Rolle, falsche Einheit,
  alter Dialog, gleichzeitige physische Aenderung, erhaltene Onlinebindung, Berechtigungen und
  Antwortverlust. Shopify-Operationen gegen das aktuelle Schema validiert. 916 Dashboard- und
  892 Operationstests bestanden; Browser bei 390/1440 px: Inventur speichern, Ladenlaenge
  abbuchen, gebundene Ware gesperrt, keine JavaScript-Fehler oder Seitenueberlaeufe.
- **Risiken:** Die bisherigen ganzen m² sind konservativ, nicht zentimetergenau. Getrennte Rollen
  bleiben getrennte Bestaende. Keine SumUp-Anbindung; das Team muss vor dem Ladenabschluss
  buchen. Keine echten Produkt- oder Bestandsaenderungen im Test.
- **Naechste Stufe:** PR-Diff unabhaengig pruefen und bestehenden Dashboard-Dienst aktualisieren;
  neue Artikel bleiben bis zu bestaetigten Rollendaten und Preisen unveroeffentlicht.

## 2026-10-23 · Offene Servicefolgearbeit und freiwilliges Versionsupdate (#1631)

- **Geaendert:** Kontaktierte Anfragen, Termine und Angebote bleiben auf „Heute“ sichtbar und
  zaehlen im Kundenreiter/der Navigation mit. Der vorhandene naechste Schritt und ein gezielter
  Sprung zur bestehenden Anfrage ersetzen die reine Erstkontaktliste. Nur neue Anfragen tragen
  die vorhandene Alterswarnung. Ein Dienstupdate zeigt einen manuellen Hinweis ausserhalb der
  Ansicht; offene Eingaben und Dialoge sperren den Neuladen-Knopf bis zum Speichern/Schliessen.
- **Getestet:** Ableitung mit allen offenen/abgeschlossenen Stati, genaue ID-Spruenge, keine
  erfundene Ueberfaelligkeit; Versionsfingerabdruck ohne Datenexporte, HTML/GET-Konsistenz,
  Herkunfts-/Methoden-/Rollenpruefung und Eingabeschutz. Browserpruefung gegen Datenkopie.
- **Risiken:** Sichtbarkeit ist keine gemeinsame Statussynchronisation mit dem Laden. Dessen
  vorhandene Wiedervorlage und der aggregierte Zahlenendpunkt bleiben erhalten; eine bestaetigte
  Service→Laden-Vorgangsverknuepfung braucht weiterhin beide Datenmodelle.
- **Naechste Stufe:** Nach Review den Dashboard-Dienst abgleichen; vorhandene offene Tabs sehen
  den neuen Hinweis erstmals nach einem Laden dieser Fassung.

## 2026-10-23 · Gewicht und gemeinsame Rollenmaße im Packdialog (#1629)

- **Geaendert:** Der vorhandene Packstueckdialog berechnet aus Fertigmassen, Form,
  echter Teppichanzahl und Gesamtgewicht je m² das Materialgewicht; Verpackungsgewicht
  ergibt das Bruttogewicht. Gesamtdicke, Rollenkern und Verpackungszugabe liefern einen
  theoretischen Durchmesser und kurze gemeinsame Rollenachse. Belegte Angaben sind
  vorausgefuellt, fehlende Angaben direkt ergaenzbar. Vorschlaege fuellen die vorhandenen
  Packfelder, manuelle Korrekturen bleiben moeglich. Neue Zusammenstellung entfernt alte
  Packwerte; Aenderungen setzen physische Bestaetigungen zurueck. Der fertige Kettler-Verlauf
  ist aufklappbar, die Packvorbereitung dadurch weiter oben.
- **Getestet:** Rechen-, Daten-, API- und Bedienregressionen einschliesslich unterschiedlicher
  Rollenbreiten, Hundertstel-m² statt Stueckzahl, unbekannter Materialwerte, Dezimalkomma,
  Rundung und manueller Korrekturen. Gesamtsuite und Projekt-Guards gruen. Klickprobe auf
  isolierter Datenkopie: zwei Rechtecke mit 120/80 × 170 cm ergeben 3,40 m² und mindestens
  120 cm gemeinsame Achse; synthetische Materialwerte ergeben 122 × 21 × 21 cm und
  7,30 kg, Speichern schliesst an den bestehenden GLS/GEL-Vergleich an.
- **Risiken:** Rechenwerte ersetzen weder Messen/Wiegen noch schadloses gemeinsames Rollen.
  Ohne Gesamtgewicht oder Gesamtdicke bleiben die betroffenen Vorschlaege leer; Polgewicht
  und Florhoehe werden nicht ersatzweise genutzt. Es gibt keinen neuen Portokauf,
  Versandnachweis oder Shopify-Schreibweg. Materialeingaben gelten fuer die aktuelle Planung.
- **Naechste Stufe:** Nach Review den Dienst abgleichen; fertige Rolle im Betrieb messen und wiegen.

## 2026-10-22 · Bewusste Shopify-Archivierung erhalten (#1626)

- **Geaendert:** Der Shop-Fokus uebernimmt den ausdruecklichen Archivstatus aus `closedAt`.
  Bewusst archivierte Warenauftraege mit geklaertem finanziellem Endzustand stehen unter
  Fertig/Alle. Offene und unbekannte Zahlungen bleiben sichtbar. Die Anzeige sagt archiviert
  und leitet daraus keinen Versand ab. Nicht archivierte lokale Abschluesse ohne Versandbeleg
  bleiben weiterhin zur Kontrolle offen.
- **Getestet:** Gesamtsuite 3.772 Tests gruen, gezielte Modell-/Projektions-/Filterregressionen
  fuer Archivierung, Zahlungszustaende und alte Fehlmarker; Syntax und Projekt-Guards gruen.
  Zwoelf Browserkombinationen der betroffenen Start-/Bestellansichten auf Desktop und Handy
  mit drei Rollen ohne Fehler oder seitlichen Ueberlauf.
- **Risiken:** Keine Shopify-Schreibaktion, kein neuer Versandbeleg oder automatischer Abschluss.
  Vorhandene Bestelldaten und bewusste Archivierung bleiben die Quelle.
- **Naechste Stufe:** Nach Review den laufenden Dienst mit diesem Anschlussfix abgleichen.

## 2026-10-22 · Shop-Übersicht mit Warenkunden zuerst (#1624)

- **Geaendert:** Heute startet mit offenen Warenbestellungen: zahlende Kunden zuerst,
  mit Kunde, ganzem Bestellwert, Wartezeit und nächstem Schritt. Gemischte Aufträge nutzen
  ausschließlich den Warenfortschritt; Muster, Details und bewusste Gesamtbestellaktionen
  bleiben erhalten. Fehlmengen, offene Versandbuchungen und manuelle Haken ohne Nachweis
  verschwinden nicht aus der Warenarbeit; auch alte lokale Abschlüsse ohne Versandvermerk
  bleiben prüfpflichtig. Musterbestellung und Packstation folgen darunter;
  allgemeine Laden-, Aufgaben- und Technikansichten bleiben gezielt erreichbar.
- **Geaendert:** Bestellart `bart=ware|muster|alle` ergänzt die vorhandenen Statusfilter.
  Alte direkte Links ohne Artwahl behalten alle Arten. Warenzahl auf Heute, Navigationszahl
  und offene Warenliste verwenden denselben Umfang. Vier mobile Hauptwege sind Bestellungen,
  Muster bestellen, Packstation und Lexikon; Mehr und der Hausknopf erhalten alle weiteren Wege.
- **Geaendert:** Musterwirkung zeigt rein lesende Beobachtungen zu späteren Warenkäufen,
  Wiederholungsmustern und jungen oder unklaren Fällen. Die Exportabfrage ergänzt den gegen
  Admin-API 2026-07 validierten Positionswert nach allen Rabatten. Die Ansicht benennt das
  Betriebsfenster von 90 Tagen plus älteren offenen Versand-/Zahlungsfällen; keine behauptete
  vollständige Historie, Kaufursache oder Rentabilität. Versand-/Empfangskontrolle und bestehendes
  Nachfassen bleiben in den vorhandenen Arbeitswegen. Ein vorhandener Bewertungsablauf wird
  nicht um eine zweite Sendelogik ergänzt.
- **Getestet:** gezielte Regressionen für Waren-/Mustertrennung einschließlich gemischter
  Aufträge, Fortschritt, Zahlengleichheit, Fehler statt Null, Bestellfilter und Renderer;
  Eigenleistungen ohne Lieferanten-ID-Pflicht; Syntax- und Importprüfungen. Gesamtsuite
  3.767 Tests grün, Projekt-Guards und Geheimnisprüfung grün. 194 Browserkombinationen
  aller Ansichten auf Desktop/Handy mit drei Rollen sowie 63 im Dunkelmodus und 24
  Nachprüfungen der Eigenleistungs-/Versandbeleg-Korrekturen ohne Fehler oder seitlichen Überlauf.
  Klickprobe auf isolierter Datenkopie: Warenzahl auf Startseite, Navigation und Liste
  identisch; getrennte Artfilter ergeben zusammen den Gesamtumfang, konkreter Warenauftrag
  direkt erreichbar.
  Eine synthetische neue Musterposition erschien direkt auf Heute und in der bestehenden
  Lieferanten-Vorbereitung; Dialog ohne Senden geschlossen, Datenkopie danach entfernt.
  Alte Exportwerte erscheinen als unklar statt als erfundene Käufe.
- **Risiken:** alte Exporte können die neuen Rabattwerte noch nicht enthalten; daraus wird
  kein Kaufbeleg geraten. Frühere abgeschlossene Käufe außerhalb des Betriebsfensters können
  fehlen. Der aktuelle Live-/Versandstatus des bestehenden Bewertungs-/Flow-Ablaufs ist über
  die verfügbare Anbindung technisch nicht lesbar und bleibt ungeprüft. Keine automatische
  Bestellung, Nachricht, physische Bestätigung oder Versandbuchung durch diesen Umbau.
- **Naechste Stufe:** Nach PR-Review den Dienst abgleichen und den Bestellexport auffrischen;
  reguläre Bedienung im Betrieb mit Ware und Drucker sowie Kostenbelege zur Musterbewertung.

## 2026-10-22 · Sichere Mitarbeiterwege und sichtbare offene Arbeit (#1618)

- **Geaendert:** Heute zeigt wartende Umschlaege und notwendige Bestellkontrollen direkt;
  „Dringendes bearbeiten“ fuehrt in die vorhandene Wichtigkeitssortierung. Unvollstaendige
  Quellen bleiben sichtbar; geladene Zusatzaufgaben behaupten keinen Gesamtabschluss.
- **Geaendert:** Zahlung offen verwendet in Browser und Server dieselbe Zahlungsregel, auch
  nach Versand und bei alten Treffern. Mobile Bestellkarten behalten jeden Kundennamen.
  Sammelstatus laedt geladene Arbeitslisten einmal nach allen Positionen.
- **Geaendert:** Gemischter Wareneingang liest den Positionsstand frisch und verlangt eine
  ausdrueckliche Bestaetigung je Muster. Oeffnen/Abbrechen schreibt nichts; Doppelklicks sind
  gesperrt. Packfehler erhalten den letzten Stand mit gezieltem lesendem Neuabruf. Alle
  Bestellungen eines Umschlags und der Partnerladen-Rueckweg bleiben erreichbar.
- **Geaendert:** Betriebsaufgaben, Rueckrufe, Kundenfaelle und Service-Anfragen sind Teil der
  lokalen Arbeitsrevision. Aufgabenlisten laden im bestehenden geschuetzten Takt nach;
  Detailformulare bleiben geschuetzt. Suchpalette bietet direkte Bestell-/Packwege und die
  Team-Aufgabensuche, ohne Treffer der vorigen Eingabe weiterzuzeigen.
- **Getestet:** Gesamtsuite, Projekt-Guards, alle Ansichten auf Desktop/Handy mit drei Rollen,
  betroffene Ansichten im Dunkelmodus. Klickprobe auf isolierter Datenkopie: gemischter
  Testauftrag beim Abbrechen 4 bestellt / 0 geliefert, nach Einzelbestaetigung 3 / 1;
  Dringlichkeitseinstieg und Suche direkt zur Packstation. Fehler-, Kontext- und Retryfaelle
  durch Regressionen abgesichert.
- **Risiken/Annahmen:** Gemeinsamer Zugang und bestehende Fachablaeufe bleiben erhalten;
  keine automatische Bestellung, Nachricht, Pack- oder Versandbestaetigung. Details in
  [Mitarbeiterpruefung](MITARBEITERPRUEFUNG.md).
- **Naechste Stufe:** regulaere Bedienung im Betrieb mit Ware und Drucker.

## 2026-10-22 · Großbrief-Messwerte bleiben je Umschlag erhalten (#1621)

- **Geändert:** Gewicht und Maße speichern automatisch zentral im privaten Datenordner und
  erscheinen beim erneuten Öffnen, nach Neuladen und an anderen Arbeitsplätzen wieder.
  Der Dialog wartet beim Schließen auf ausstehende Speicherung; Fehler lassen die Eingaben
  stehen. Unvollständige Zahlen sind als Entwurf erlaubt. Geänderte Bestellungen, Muster oder
  Adressen erhalten einen neuen Messkontext. Versionsprüfung verhindert stilles Überschreiben
  durch parallele Arbeitsplätze. Bestandsbestätigung und Eignungsprüfung werden neu angefordert.
- **Getestet:** API-Roundtrip mit neuer Instanz, Rollen, Versionenkonflikte, geänderte Adresse,
  Menge/Bestellgruppe, unvollständige und ungültige Eingaben, defekte Ablage sowie Dateirechte.
  Dashboard 811/811, Gesamtlauf 3661/3661; 180 Ansichtsprüfungen ohne Befund. Klickprobe
  gegen Datenkopie: Schließen/ESC/Neuladen erhält alle Werte, Bestätigung bleibt offen,
  paralleler Arbeitsplatz erhält Konflikt und kann den gespeicherten Stand neu laden; 390 px.
- **Risiken:** Gemessene Werte sind keine Versandfreigabe. Bei Speicherfehlern die Meldung
  beachten; die Vorbereitung bleibt bis zur Klärung offen. Kein Portokauf und keine Versandbuchung.
- **Nächste Stufe:** physischer Probedruck und Altfallklärung bleiben unabhängig davon offen.

## 2026-10-22 · Aktuelle Arbeitslisten und gemeinsame Bestellvorbereitung (#1616)

- **Geaendert:** Der bestehende Statusabruf liefert eine lokale Arbeitsrevision. Geaenderte
  Bestell-, Pack- und Einkaufsdaten werden alle 30 Sekunden und bei Tab-Rueckkehr nachgeladen;
  laufende Eingaben und offene Dialoge bleiben geschuetzt. Bei einem Fehler bleibt der bisherige
  Stand sichtbar, statt eine leere oder vermeintlich erledigte Liste anzuzeigen.
- **Geaendert:** Nach Status- und Wareneingangsaktionen werden bereits geladene Bestell- und
  Packlisten erneut gelesen. Das gilt fuer Einzelaktionen und nach Abschluss einer Sammelaktion.
- **Geaendert:** Bewusstes Vorbereiten einer Lieferantenbestellung uebernimmt die enthaltenen
  Positionen gemeinsam. Vor Kopieren, externem Oeffnen und „Als bestellt markieren“ prueft der
  Server den aktuellen fachlichen Mailabschnitt und die eigene Arbeitsuebernahme erneut.
  Fremde Uebernahmen blockieren auch den Inhaber, bis er die vorhandene ausdrueckliche
  Uebernahmeaktion verwendet. Andere unveraenderte Mailabschnitte bleiben getrennt pruefbar.
- **Getestet:** Gesamtsuite und Projekt-Guards; 60 Browserkombinationen auf Desktop/Handy,
  drei Rollen und Dunkelmodus. Private Klickprobe mit zwei Zugaengen: fremde Uebernahme
  blockiert, nach Freigabe weiterarbeiten, alte Vorlage abgewiesen; 3 Muster bestaetigt → 0
  offen, lokale Wiedereroeffnung ohne Exportwechsel automatisch 0 → 3. Kein echter Versand.
  Regressionen fuer Teilfehler, geschuetzte Eingaben und getrennte Mailabschnitte.
  Kopieren beginnt auch bei verzoegerter Serverantwort im Benutzerklick; Inhalte bleiben bis
  zur Freigabe gesperrt. Aeltere Browser bieten nach Pruefung einen kurzen zweiten Klick.
  Kopierprobe im Browser sowie Regressionen fuer Gestenverlust, Ablehnung und manuelle Auswahl.
- **Risiken/Annahmen:** Gleiche Anmeldung bedeutet weiterhin gemeinsame Identitaet. Externe
  Mailprogramme und Gmail bestaetigen dem Dashboard keinen Versand; mehrfaches externes
  Absenden kann es nicht ausschliessen. Keine automatischen Kaeufe, Nachrichten oder physischen
  Pack-/Versandbestaetigungen; keine zweite Beleg- oder Shopify-Automatik.
- **Naechste Stufe:** regulaere Bedienprobe im Betrieb.

## 2026-10-22 · Ruhige Startseite und vier Arbeitswege (#1614)

- **Geaendert:** Vier Hauptwege Heute / Muster bestellen / Bestellungen / Packstation;
  weitere Links in vier standardgeschlossenen Bereichsgruppen. Aktive bzw. bewusst gewaehlte
  Gruppe bleibt erreichbar, der alte globale Mehr-Offen-Schalter wird nicht uebernommen.
  Bestehende Rollenrechte, externe Dashboardlinks und mobile Bedienung bleiben erhalten.
- **Geaendert:** Heute buendelt offene Muster automatisch nach Lieferant und oeffnet zur
  Vorbereitung den vorhandenen Bestelldialog. Bestellstand wird weiterhin bewusst bestaetigt. Fehlende Musterartikelnummern und
  Mengen bleiben als Klaerbedarf sichtbar.
  `art=muster` / `art=ware` trennen die Einkaufsprojektion ohne zweite Datenablage.
  Weitere Aufgaben folgen darunter, System- und Hintergrundinformationen bleiben nachrangig.
- **Geaendert:** Packstation zeigt jeweils eine der vier Arbeitslisten; Suche beruecksichtigt
  alle Listen, Direktumschlaege oeffnen ihren Bereich. Bestellungen zeigen vier Hauptfilter;
  sieben weitere Filter bleiben gezielt aufklappbar erhalten.
- **Getestet:** gezielte Regressionen fuer Navigation, Gruppierung und Filter, Gesamtsuite und
  Projekt-Guards; 24 helle Browserkombinationen auf drei Breiten sowie 24 dunkle Kombinationen
  auf Desktop und Handy mit Inhaber-, Mitarbeiter- und Leserechten. Klickproben auf privater Datenkopie: direkte
  Mustervorbereitung, Pack-Suche ueber alle Arbeitslisten und Abschlussfilter.
- **Risiken/Annahmen:** Bestehender Betriebsbestand, keine neue Datenbank. Die Vorbereitung
  bestellt und sendet nichts automatisch; Packstand bleibt von Versandbuchung getrennt.
- **Naechste Stufe:** regulaere Bedienprobe der vier Arbeitswege im Betrieb.

## 2026-10-22 · Vollstaendigkeit und sichere Packfaelle (#1608)

- **Geaendert:** Auch Positionen nach der ersten API-Seite werden vollstaendig geladen; defekte,
  wiederholte oder waehrend des Ladens geaenderte Seiten brechen ab und erhalten den bisherigen
  Export. Aeltere Bestellungen mit offener Zahlung bleiben im Betriebsfenster. Fehlende
  Positionskennungen verhindern den Abschluss, auch bei gemischten Auftraegen.
- **Geaendert:** Bestellfilter „Alle Bestellungen“ und „Kontrolle noetig“; expliziter Abschlussfilter
  zeigt auch aeltere Treffer seitenweise. Suche erklaert ihren Filter und kann mit einem Klick
  auf alle echten Bestellungen erweitert werden. Manuelle Haken mit offenem Versand bleiben kontrollierbar.
- **Geaendert:** Muster je Empfaengeradresse getrennt; unbekannte Kunden nie zusammenlegen.
  Teilrueckerstattung und Direktversand sichtbar klaeren; Nullmengen nicht erneut packen.
  Fehlende Adressen fuehren zur Bestellung, fehlende Zuordnung ins Lexikon. Serverseitige
  Packpruefung verlangt eindeutige Angaben, erledigte Klaerung und eingelegte Muster.
  Bei Teilrueckerstattung kann nur der ausdruecklich gepruefte Restumfang lokal bestaetigt werden;
  die Bestaetigung bleibt an der Packmarke erhalten. Direktversand bleibt gesperrt.
- **Getestet:** gezielte Regressionen, Dashboard-/Gesamtsuite, Projekt-Guards sowie
  Browserpruefung mit privater Datenkopie auf Desktop und Handy; Klickproben fuer Suche und Filter.
- **Risiken/Annahmen:** „Alle“ umfasst den aktuellen Betriebs-Export, kein historisches Vollarchiv.
  Keine Versandbuchung, Nachricht, Erstattung oder Aenderung echter Packstaende durch Tests.
- **Naechste Stufe:** regulaere Bedien-/Druckprobe im Betrieb.

## 2026-10-22 · Direkte Umschlagwahl und Datumssortierung (#1606)

- **Geaendert:** Ein neuer Umschlag-Direktlink ersetzt die zuvor manuell geoeffnete Karte;
  auch die Rueckkehr aus dem Wareneingang zum gleichen URL-Ziel waehlt wieder diesen Umschlag.
  Stille Neuzeichnungen erhalten weiterhin die manuelle Auswahl. „Neueste zuerst“ setzt alte
  Sortierrichtung und Blaetterseite zurueck, Suche und Filter bleiben erhalten.
- **Getestet:** zwei gezielte Handler-Regressionstests, Dashboard-/Gesamtsuite, Projekt-Guards
  und Browserpruefung der betroffenen Ansichten auf Datenkopie.
- **Risiken/Annahmen:** Nur Navigation und Darstellung; keine Aenderung an Betriebsdaten.
- **Naechste Stufe:** menschliche Bedien-/Druckprobe wie bei #1604.

## 2026-10-22 · Bestellungen und Packstation zuerst (#1604)

- **Geaendert:** Direkte Einstiege auf Heute, in der Seitenleiste und am Handy. Bestehende
  Kundenrouten bleiben erhalten; die beiden Hauptansichten zeigen nur drei Wechsel-Links statt
  acht Reitern. Bestellliste mit vier Hauptspalten und aufklappbaren Kontakten/Belegen.
  Arbeitsstand aus bestehenden Versand-/Positionsdaten statt widerspruechlicher Pruefstatus.
  Claude #1599 vollstaendig integriert: neueste zuerst, manueller Listenhaken ohne Versand,
  mit der neueren Wichtigkeitssortierung aus #1602 verbunden. Abgehaktes und Versandtes sind
  getrennt vom fachlichen Abschluss benannt.
- **Geaendert:** Packbereit / Wartet auf Ware / Zu klaeren / Gepackt. Packbereit nur mit
  bestaetigtem Bestand oder eingelegten Mustern und eindeutiger Aufkleber-/Adresszuordnung.
  Ein aufklappbarer Umschlag je Kunde, Suche auch nach Farbnummer, stabile Bestellnummer(n)
  statt wandernder Listennummer, direkter Wechsel vom Wareneingang zum Umschlag.
  Packdetails bleiben beim Abhaken offen. Bestehende Bilder, Haken, Druck und Klaerung erhalten.
  Bereits vorhandene Grossbrief-Vorbereitung wieder am gepackten Umschlag angeschlossen.
  Pack- und Bestellmarken in Sicherung, Bestellmarken auch in der Browser-Datenkopie.
- **Getestet:** Dashboard- und Gesamtsuite, Projekt-Guards; Browser auf Datenkopie, fuenf
  Breiten und Dunkelmodus. Klickprobe: drei Muster abhaken, packen, neu laden; Stand erhalten,
  kein Shopify-Aufruf. Rollen-Gesamtlauf 455 Kombinationen; zwei 360-px-Ueberstaende in
  der Lieferantenliste behoben, danach alle 45 betroffenen Rollen-/Breitenkombinationen gruen.
- **Risiken/Annahmen:** Alte Datenstaende werden nicht automatisch umgebucht. Ein Muster kann
  physisch vorliegen, obwohl der Eingang fehlt; dann Muster nach Sichtpruefung abhaken oder
  vorhandenen Wareneingang eintragen. Gepackt ist weiterhin kein Versandnachweis.
- **Naechste Stufe:** echte Bedienprobe im Laden; Porto/Versand nur ueber die bestehende
  getrennte Versandaktion. Keine automatischen Bestellungen, Nachrichten oder Portokaeufe.

## 2026-10-22 · Lieferantenlisten nach überfälligen Posten

- **Geändert:** Bestellen › Je Lieferant: rot überfällig → bernstein überfällig → zu bestellen → Rest,
  darin die längste Wartezeit zuerst (vorher: zu bestellen zuerst, dann A–Z). Lieferantenübersicht
  (`lieferantenUebersicht`): mehr rote, dann mehr bernsteinfarbene Posten, dann älteste offene
  Bestellung zuerst; ohne offene Posten A–Z. „Nicht zugeordnet“ bleibt hinten.
- **Getestet:** neuer Fall in `operations/tests/lieferanten.test.mjs`; `dashboard:test` und `npm test`
  grün; `dashboard:pruefen` für Einkauf ohne Befund.
- **Risiken/Annahmen:** keine; nur die Reihenfolge.
- **Nächste Stufe:** –

## 2026-10-22 · Arbeitslisten nach Wichtigkeit

- **Geändert:** Wo eine Arbeitsliste noch alphabetisch oder „neueste zuerst“ stand, steht jetzt das
  Dringendste oben:
  - **Kunden › Rückrufe:** „Nicht erreicht“ vor offen vor angerufen, darin die älteste zuerst.
  - **Kunden › Service-Anfragen (offen):** nach Bearbeitungsstand (neu zuerst), darin wer am längsten wartet.
  - **Kunden › Angebote:** offene Angebote, das älteste zuerst (Abgeschlossene weiter neueste zuerst).
  - **Bestellen › nach Kunde:** wer am längsten wartet, zuerst (vorher A–Z), Positionen älteste zuerst.
  - **Genossenschaften › Alle Firmen:** fällige zuerst, dann nach Wiedervorlage, dann A–Z.
  - **Heute, Spalten „Wer wartet auf was“:** Rot vor Gelb vor normal, darin die älteste zuerst.
  Bewusst unverändert: das Auftragsband (Probleme sind dort mit Grund geparkt und stehen absichtlich
  hinten) sowie Nachschlagelisten (Musterlager-Bestand, Lexikon).
- **Getestet:** `einkauf-kundengruppen.test.mjs` angepasst und neuer Fall; `dashboard:test` 690 grün,
  `npm test` grün; `dashboard:pruefen` für Heute, Rückrufe, Service, Angebote, Einkauf, Genossenschaften
  ohne Befund.
- **Risiken/Annahmen:** keine; Sortierung allein, keine Daten geändert.
- **Nächste Stufe:** Lieferantenlisten nach überfälligen Posten statt A–Z.

## 2026-10-22 · Kunden › Bestellungen nach Wichtigkeit

- **Geändert:** Neue Standardsortierung „Wichtigkeit“ (vorher: Kundenname A–Z). Reihenfolge: bezahlt
  und es fehlt etwas (nicht bestellt, Rückruf, Maßprüfung, ID) → bezahlt und alles unterwegs → noch
  nicht bezahlt → schon an den Kunden raus, erledigt oder storniert; jeweils die älteste zuerst.
  Bestellungen eines Kunden bleiben zusammen, der Kunde steht so weit oben wie seine dringendste
  Bestellung. Am Kunden steht der Grund („wartet seit 12 Tagen · noch nicht bestellt“). Die
  Spaltenköpfe sortieren wie bisher; „Nach Wichtigkeit sortieren“ führt zurück.
  `wichtigkeit`/`sortiereNachWichtigkeit` in `lib/kunden-bestellgruppen.mjs`.
- **Getestet:** neuer Fall in `kunden-bestellgruppen.test.mjs`; `dashboard:test` 689 grün;
  `dashboard:pruefen` für den Reiter in allen Breiten ohne Befund.
- **Risiken/Annahmen:** Die Reihenfolge hängt am Auftragsfluss: wo „bestellt“/„raus“ nicht
  nachgetragen ist, steht eine Bestellung höher als nötig.
- **Nächste Stufe:** dieselbe Logik für weitere Listen des Dashboards prüfen.

## 2026-10-22 · Muster packen: Wareneingang nach Partnerladen

- **Geändert:** Umschalter „Nach Kunde packen“ / „Wareneingang nach Partnerladen“ (`mp=laden`). Je
  Partnerladen alle noch nicht eingelegten Muster der offenen Kunden, nach Name und Farbnummer, mit
  Bild und dem Ziel: Umschlag-Nummer (dieselbe wie in „Zu packen“, „zu klären“ gesondert), Kunde,
  Bestellung. `musterNachLaden` in `lib/muster-packen.mjs`, rein aus den schon geladenen Daten.
- **Getestet:** neuer Fall in `muster-packen.test.mjs`; `dashboard:test` 688 grün; `dashboard:pruefen`
  für beide Ansichten in allen Breiten ohne Befund.
- **Risiken/Annahmen:** Die Umschlag-Nummer verschiebt sich, sobald ein Kunde gepackt ist – beim
  Sortieren die Liste nicht zwischendurch neu laden oder nach Namen sortieren.
- **Nächste Stufe:** weitere Wünsche aus dem Laden sammeln; alte Bestellungen aussortieren.

## 2026-10-22 · Muster packen: Farbbild macht Breiten nicht mehr mehrdeutig

- **Geändert:** Dieselbe SKU in mehreren Breiten trägt je ein eigenes Variantenbild; das galt als
  Widerspruch, und 40 von 68 offenen Mustern zeigten keine Lieferantenangaben. Das Bild entscheidet
  jetzt nicht mehr über „mehrdeutig“. Echte Daten danach: 66 von 68 mit Angaben, 65 mit Farbbild.
- **Getestet:** neuer Fall in `muster-packen.test.mjs`; `dashboard:test` grün.
- **Risiken/Annahmen:** keine.
- **Nächste Stufe:** Teil 3 – Wareneingang nach Partnerladen sortieren.

## 2026-10-22 · Muster packen: Muster sicher erkennen, abhaken, „Zu klären“

- **Geändert:** Je Muster ein Bild genau dieser Farbe (Variantenbild, neu im Lexikon-Export;
  Produktbild nur bei einfarbigen Produkten, sonst „kein Farbbild“), der Partnerladen mit Namen aus
  den privaten Stammdaten, der Produktname wie auf dem Lieferantenetikett und die Farbnummer groß.
  Zwei Muster derselben Kollektion im selben Umschlag tragen „Ähnliches Muster – Farbnummer prüfen“.
  Die Seite hat drei Bereiche: Zu packen · Zu klären · Gepackt. Die Haken liegen jetzt zentral in
  `muster-packen.json` statt im Browser. Ist alles abgehakt, heißt der Knopf „Umschlag gepackt“; bleibt
  etwas offen, „Fehlt etwas – zu klären“ (mit Notiz). Der Kunde wandert mit den nicht abgehakten
  Mustern nach „Zu klären“, „Fehlendes ist da“ holt ihn zurück, die Haken bleiben. Die Zahl am Reiter
  zählt nur „zu packen“. `POST /api/kunden/muster-packen` hat dafür `aktion: haken | klaeren`.
- **Getestet:** `muster-packen.test.mjs` (9), `muster-packen-api.test.mjs` (6), `lexikon.test.mjs`
  (Variantenbild); `dashboard:test` 686 grün; `dashboard:pruefen` für den Reiter in allen Breiten ohne Befund.
- **Risiken/Annahmen:** Farbbilder erscheinen erst nach dem nächsten Lexikon-Export. Viele
  Varianten haben in Shopify kein eigenes Bild, dann steht „kein Farbbild“.
- **Nächste Stufe:** Teil 3 – Wareneingang nach Partnerladen sortieren.

## 2026-10-22 · Adressaufkleber ohne Bestellnummer

- **Geändert:** Auf dem gedruckten Adressaufkleber (Kunden → Muster packen) steht keine
  Bestellnummer mehr, nur Absender und Empfänger; die Empfängerzeilen bekommen den Platz.
  Die Zuordnung Umschlag ↔ Bestellung zeigt weiter die Karte in der Packliste und die
  Druckvorschau. `adressLayout` in `lib/adress-etiketten.mjs`.
- **Getestet:** `muster-packen.test.mjs` prüft, dass keine Bestellnummer gezeichnet wird;
  `dashboard:test` grün.
- **Risiken/Annahmen:** keine.
- **Nächste Stufe:** Versandschritt, sobald der Versandweg entschieden ist.

## 2026-10-22 · Großbrief ohne Portokauf vorbereiten (#1591)

- **Geändert:** „Großbrief vorbereiten“ je Kunde in Muster packen: gebündelte Bestellnummern,
  Adresse, Preis und Messfelder für den fertig gepackten Umschlag. Prüft Grenzen, Inland,
  Gepackt-Status und Bestätigung zum lokalen Bestand/Direktversand. Eingaben bleiben nur im
  offenen Dialog. Kein Kaufknopf, keine Versandbuchung, keine Nachricht, keine neue API.
- **Getestet:** Grenzwerte, gedrehte Maße, deutsche Dezimalwerte, ungültige/fehlende Angaben,
  Ausland, ungepackter Umschlag, fehlende Zuordnung und Tarifende in muster-grossbrief.test.mjs.
  Dashboard 682/682, Gesamtsuite 3502/3502. Browserklicks gegen Datenkopie: leere Angaben
  bleiben offen, 501 g abgelehnt, gepackt + 499,5 g/20 mm/250 × 353 mm passend; Änderung
  verwirft Ergebnis, Esc schließt, erneutes Öffnen leer. Desktop/390 px visuell geprüft;
  alle 36 Ansichten in fünf Breiten (180 Fälle) ohne JS-Fehler oder Querscrollen.
- **Risiken:** Gewicht und Maße müssen am realen Umschlag ermittelt werden. Die Bestätigung
  zum Bestand ersetzt keinen physischen Nachweis. Porto-/Formatstand nach 2026 erneut prüfen.
- **Nächste Stufe:** Portodruck und Versandbuchung erst mit gesondertem Auftrag verbinden.

## 2026-10-22 · Verlegereste als Mustermaterial

- **Geändert:** Regel vom 21.10.: Teppichboden und Vinyl von Lieferant A und C, den wir verlegen,
  hinterlassen Reste – aufheben, beschriften, daraus Muster schneiden. Neue Lagerart „Verlegerest“.
  Vorschläge „Einlagern?“ zeigen gelieferte Verlegeware (Baustelle oder Verlegung gebucht, höchstens
  45 Tage). Ware anderer Quelle nur, wenn A oder C dieselbe Ware führt (Abgleich Hersteller,
  Qualität, Farbnummer gegen das Lexikon, `operations/lib/reste.mjs`); der Rest liegt dann unter der
  A/C-SKU. Neuer Knopf „Rest prüfen…“ für direkt beim Hersteller bestellte Ware, Hersteller allein
  zeigt alles von ihm bei A/C (C führt Herstellerware oft unter eigenem Namen). „Etikett“ an jedem
  Lagereintrag, an Verlegerest-Vorschlägen und an Treffern.
- **Getestet:** `reste.test.mjs` (8 neu), `musterlager-api.test.mjs` (Abgleich + Einlagern als Rest),
  `operations:test`, `dashboard:test`. Browser mit Datenkopie: „Rest prüfen“ mit Kürzel + Farbnummer
  findet die Ware bei C, Einlagern, Etikettvorschau, 375 px.
- **Risiken/Annahmen:** Verlegeaufträge laufen heute fast nie über den Shop (0 von 58 offenen
  Bestellungen) – der automatische Vorschlag greift selten, der Hauptweg ist „Rest prüfen…“.
  Online-Muster für C-Ware bleiben aus (Inhaberregel); deren Reste sind Material für Laden/Beratung.
- **Nächste Stufe:** Hinweis „Rest mitnehmen und beschriften“ im Auftrag für die Monteure.
## 2026-10-21 · Mitarbeiter-Ansicht einfacher, Daten immer aktuell

- **Geaendert:** Rolle Mitarbeiter: Menue nur Heute, Kunden, Bestellen, Genossenschaften, Lexikon,
  Hilfe (`data-nicht-mitarbeiter`, Seiten bleiben ueber Links erreichbar). „Heute“ ist fuer
  Mitarbeiter eine einzige Liste (immer Sicht Laden, ohne Zahlenzeile, Vorbereiten, Hintergrund).
  To-do-Titel als Satz („Bei … melden: neue Anfrage …“, „Storno vom Lieferanten prüfen“), Leerzustand
  „Alles erledigt“. Hilfe beginnt mit „In 1 Minute erklärt“ (je Menuepunkt ein Satz, drei Ablaeufe).
  Neu `lib/datenstand.mjs` (Grenzen je Quelle: Bestellungen/Kunden/Angebote/Warenkoerbe 30 Min.,
  Kennzahlen 2 Std., Lexikon/Bestand 1 Tag; der Server nutzt dieselben fuer `veraltet`) und
  `bausteine/datenstand.mjs`: Zeile „Stand: vor 3 Min.“ ueber Heute/Kunden/Bestellen/Lexikon,
  deutlicher Hinweis fuer alle bei veralteten Quellen, To-do „Daten-Abgleich prüfen“ fuer den Inhaber.
  Die offene Seite fragt alle 2 Minuten und beim Zurueckkehren den Stand ab und laedt neue Daten
  (inkl. Lieferantenpost, Shopify-Abgleich) – nicht, solange jemand tippt, ein Dialog offen ist oder
  ungespeicherte Eingaben stehen.
- **Getestet:** `dashboard:test` 641/0, `npm test` gruen, `dashboard:pruefen --rollen` 360–1440 px nur OK.
  Klickstrecke gegen Datenkopie: Mitarbeiter-Menue 6 Punkte, Heute 8 To-dos ohne Hintergrund;
  Stand auf 130 Min. gesetzt → Hinweis erscheint, getippte Eingabe bleibt erhalten, nach Freigabe
  neu gezeichnet; Inhaber-To-do erscheint und verschwindet wieder bei frischen Daten.
- **Risiken:** Ohne laufenden Sync-Dienst steht der Hinweis dauerhaft (gewollt). Ein Mitarbeiter mit
  ueberwiegend Website-Aufgaben sieht jetzt die Laden-Liste. Lieferantenpost, Shop-Kontrolle und
  Ausschreibungen haben weiter eigene Hinweise, nicht die neue Zeile.
- **Naechste Stufe:** Rueckmeldung des Teams.
## 2026-10-21 · Kunden → Muster packen (#1572)

- **Geändert:** Neuer Reiter „Muster packen“ unter Kunden. Alle offenen, bezahlten, nicht versendeten
  Musterbestellungen, nach Kunde gebündelt (mehrere Bestellungen = ein Umschlag), wer am längsten
  wartet zuerst. Je Muster „Auf dem Muster“ (Produktname und Farbnummer des Lieferanten aus dem
  Lexikon, nur wenn eindeutig) → „Unser Aufkleber“ (Serie · Farbe, SKU), Stand aus Auftragsfluss bzw.
  Musterlager, Link zur Lieferantenseite. „Aufkleber drucken“ je Kunde und „Alle drucken“: erst die
  Muster, zuletzt ein Adressaufkleber (Absender, Empfänger, Bestellnummer, `lib/adress-etiketten.mjs`).
  „Umschlag gepackt“ liegt zentral in `$TP_PRIVAT_DIR/muster-packen.json` (`GET/POST
  /api/kunden/muster-packen`, Rolle „lesen“ nur lesend) und gilt genau für diese Bestellungen – kommt
  eine dazu, ist der Kunde wieder offen. Massartikel ohne eigene SKU finden jetzt über belegte
  Artikelnummer (oder die Muster-SKU der Position) und Farbe genau eine Musterfarbe: bei den echten
  offenen Musterbestellungen fehlte die Zuordnung vorher bei 25 von 62 Positionen, jetzt bei 1.
- **Getestet:** `muster-packen.test.mjs` (7), `muster-packen-api.test.mjs` (4), neuer Fall in
  `server.test.mjs` und `bestellungs-musteretiketten.test.mjs`; `dashboard:test` 655 grün.
  `dashboard:pruefen --ansichten 'kunden?tab=muster'` in allen fünf Breiten ohne Befund. Klickstrecke
  (Datenkopie): Zahl am Reiter = Karten, Druckdialog eines Kunden zeigt Muster und danach die Adresse,
  Gepackt/Zurücknehmen ändert die Zahl, Haken bleiben nach Neuladen, 390 px ohne Querscrollen,
  0 JS-Fehler. Adressaufkleber 50 × 50 vorab am echten B1 gedruckt (lokale Packliste, gleiche Layoutregeln).
- **Risiken/Annahmen:** Eine Position bleibt „Zuordnung fehlt“, weil Lexikon und Bestellung die
  Artikelnummer verschieden schreiben (mit/ohne führende Null) – wird nicht geraten. „Beim
  Lieferanten bestellt“ wird im Auftragsfluss oft nicht auf „geliefert“ weitergesetzt, deshalb warnt
  nur „noch nicht bestellt“. Der Druck aus dem Reiter selbst ist am B1 noch nicht ausprobiert.
  Porto und Versandbuchung sind bewusst nicht enthalten.
- **Nächste Stufe:** Versandschritt (Briefmarke über Internetmarke, `operations/lib/internetmarke.mjs`,
  und Versand in Shopify buchen), sobald der Versandweg entschieden ist.

## 2026-10-21 · Alle gekettelten Maßteppiche automatisch zum Kettler

- **Geändert:** Regel des Inhabers vom 19.10. abends umgesetzt: Maßteppiche mit Einfassung gehen
  ohne Auswahl zum Kettler, **egal wie groß** (bisher nur kürzere Seite unter 2 m). Auch bei
  Direktversand des Lieferanten; Baustellenlieferungen bleiben, wie sie sind. Ohne Fertigmaß greift
  die Regel nicht (der Lieferant kann dann nicht zuschneiden). Ein von Hand gewähltes Ziel im Dialog
  gilt weiter für die ganze Gruppe; dann schlägt der Hinweis „Über unseren Kettler?“ die gekettelten
  Positionen vor. Der Kettler verschickt bis 200 cm kurze Seite per Paket, darüber per Spedition.
- **Getestet:** `lieferanten.test.mjs` (neu: 400 × 500, rund 300, ohne Fertigmaß, Direktversand
  2 × 3 m, Vorschlag bei Ziel Laden), `auftragsverlauf.test.mjs`, `npm test`.
- **Risiken/Annahmen:** Laut Inhaber lohnt sich der Weg nur, wenn die Ware mit einer ohnehin
  laufenden Sammellieferung kommt; das prüft die Regel nicht. Wer einen Teppich ausnahmsweise beim
  Lieferanten ketteln lassen will, wählt im Dialog „Kunden“ oder „Laden“.
- **Nächste Stufe:** Versand vom Kettler (Paket/Spedition) im Auftragsfluss abbilden.

## 2026-10-21 · Musteraufkleber auch 50 × 100 mm (zum Ausprobieren)

- **Geändert:** Im Druckfenster „Etikettengröße“ 50 × 50 mm oder 50 × 100 mm; die Wahl merkt sich der
  Browser (localStorage, ohne Speicher 50 × 50). 50 × 100 = 400 × 800 px, ungedreht (Druckkopf
  bleibt 50 mm breit): dieselben Angaben, alles 1,6-mal so groß, Schrift nur so groß, dass kein
  Wort getrennt wird; Technik über die volle Breite, QR-Code darunter (bis 288 px). `ETIKETT_FORMATE`,
  `etikettFormat` und `layout(e, mass, format)` in `lib/muster-etiketten.mjs`; 50 × 50 unverändert.
- **Getestet:** `muster-etiketten.test.mjs` 13 grün (neu: 50 × 100 im Rahmen, nichts abgeschnitten,
  QR unter dem Text, größer als 50 × 50); `dashboard:test` 634 grün. Browser (Datenkopie): Wechsel
  auf 50 × 100 → Canvas 400 × 800, gemerkt, 0 JS-Fehler. QR-Bibliothek lädt in der Remote-Session
  nicht (CDN gesperrt), deshalb QR dort leer.
- **Risiken/Annahmen:** Echter Druck auf einer 50 × 100-Rolle am B1 nicht geprüft (labelType 1 wie bisher).
- **Nächste Stufe:** Probedruck; bei Bedarf mehr Angaben auf die größere Fläche.

## 2026-10-21 · Produktsuche findet Lieferantenname mit Linie und Farbnummer

- **Geändert:** Die Suche zerlegt den Text in Wörter; jedes muss am Produkt oder an derselben
  Variante stehen (vorher: der ganze Text als ein Begriff, „Linie027 Kora 98“ fand nie etwas).
  An den Namen geklebte Nummern werden getrennt („linie027“ → „linie“ + „027“), kurze Zahlen
  zählen nur ganz und ohne führende Nullen („72“ findet 072, nie 172). Durchsucht werden zusätzlich
  Variantentitel und die Original-Angaben der Muster. Trefferkarte: „Beim Lieferanten: …“, wenn
  der Treffer nicht am Shop-Titel liegt, und „Passende Farbe: … · Farbnr. …“. Produktdetail mit
  `lq`: passende Farben oben, „passt zur Suche“, Musteraufkleber auf diese Farbe vorgewählt
  (Handwahl gewinnt). Neu `lib/lexikon-suche.mjs` (Server und Browser).
- **Getestet:** `tests/lexikon-suche.test.mjs` (7) und `api.test.mjs` (neuer Fall); `dashboard:test`
  633 grün, 8 abgebrochen in `laden-zahlen.test.mjs` (auf main in der Remote-Session genauso).
  Klickstrecke gegen erfundene Datenkopie bei 390 und 1440 px: Karte „Grau Hell · Farbnr. 95“,
  Aufkleber vorgewählt, 0 JS-Fehler, 0 px Überlauf. Echte Daten (Shopify) bestätigen beide
  Schreibweisen der Linie beim Lieferanten (mit und ohne Leerzeichen).
- **Risiken/Annahmen:** Wörter, die über zwei Farben verteilt sind, finden das Produkt, aber keine
  einzelne Farbe. `npm test` (übrige Suiten) und `dashboard:pruefen` mit echten Daten noch lokal laufen lassen.
- **Nächste Stufe:** Auf dem Mac mit echtem Lexikon-Export gegenprüfen.

## 2026-10-21 · Einfache, eindeutige Begriffe im ganzen Control Center

- **Geaendert:** Sichtbare Beschriftungen nach dem neuen Glossar `docs/control-center/BEGRIFFE.md`:
  Menue „Neue Aufträge“ (statt Akquise), „Bestellen“ (Einkauf), „Produktsuche“ (Lexikon),
  „Vorbereiten“ (Arbeitsplatz), „Shop-Kontrolle“, „Technik“, „Entscheidungen“, „Kennzahlen“,
  „Verlauf“, „Zugänge“, „Ideen & Fragen“; Reiter „Lieferantenpost“ (Belege), „Auftragsbestätigung“
  statt AB, „wieder melden“ statt Wiedervorlage, Aufgabenstatus „Sichten“/„Zur Prüfung“, „Zuständig“
  statt Owner. Seitentitel, Browser-Titel, Suche/Befehle, To-do-Titel, Hilfe und Leerzustaende
  ziehen mit; Untertitel als ein Satz „Hier …“. Routen, Rollen und Funktionen unveraendert.
- **Getestet:** `dashboard:test` 633/633, `npm test` 3435/0 Fehler, `dashboard:pruefen` 34 Ansichten
  bei 360/390/800/1024/1440 px nur OK, kein Ueberlauf. Keine Aktion geaendert, deshalb keine Klickstrecke.
- **Risiken:** Gewohnte Woerter aendern sich fuer das Team; alte Links (`#/akquise`, `#/lexikon`) gehen weiter.
  Kurzmarken „AB/LS“ in Tabellenzellen der Lieferantenpost bleiben vorerst.
- **Naechste Stufe:** Rueckmeldung des Teams, dann Glossar nachschaerfen.
## 2026-10-21 · In Shopify archivierte Auftraege und Teilversand nicht mehr offen

- **Geaendert:** Der Bestellexport laedt `closedAt` mit. Eine in Shopify archivierte
  Bestellung gilt ueberall im Dashboard (Einkauf, Kunden, Lexikon) als abgehakt, auch ohne
  Versand – Hinweis „In Shopify archiviert“. Die Produktanzeige im Lexikon blendet bei
  Teilversand schon verschickte Positionen aus.
- **Getestet:** `npm test` alle Suiten gruen, 5 neue Pruefungen (Archiv, Teilversand,
  Abfragefeld). Abgleich gegen Shopify (lesend): alle 22 offenen Bestellungen stehen im
  Export; archiviert und unversendet sind derzeit nur 4 Testbestellungen.
- **Risiken:** Wirkt erst nach dem naechsten Sync-Lauf (alle 10 Minuten). Wer in Shopify
  versehentlich archiviert, sieht den Auftrag nicht mehr als offen – Wiederherstellen in
  Shopify holt ihn zurueck.
- **Naechste Stufe:** keine.

## 2026-10-21 · Offene Bestellungen in der Produktsuche, Kunden ueber Produktnamen (#1558)

- **Geaendert:** Lexikon-Treffer zeigen „N offene Bestellung(en)“ (Bernstein) und leise
  „N Muster offen“. Die Produktseite listet oben jede offene Bestellung mit diesem Produkt:
  Kunde (Link zur Kundenakte), Bestellnummer, Datum, Farbe, Menge, Stand im Auftragsfluss
  und den naechsten Schritt aus „Zu tun“; ersetzt den bisherigen Block „Kunden warten“.
  Offen heisst: echte, nicht stornierte Bestellung, in Shopify nicht ganz versendet und im
  Auftragsfluss nicht erledigt; Eigenleistungen zaehlen nicht, Muster stehen getrennt.
  Die Kundensuche (Kunden → Suche und Schnellsuche) findet Kunden jetzt auch ueber den
  Produktnamen oder die SKU einer Bestellung und sagt dazu „bestellt: Produkt · Farbe“.
  Treffer ueber Kontaktdaten stehen weiter vorn. Die Schnellsuche nennt am Produkt die
  Zahl der offenen Bestellungen.
- **Getestet:** `npm test` alle Suiten gruen (633 Dashboard, 794 Operations inkl. 4 neuer
  Tests in `offene-bestellungen-produkt.test.mjs`). `dashboard:pruefen` 34 Ansichten bei
  360–1440 px ohne Ueberlauf. Klickstrecke gegen Datenkopie: Lexikon-Suche zeigt die Marke,
  Produktseite eine Bestellung mit zwei Positionen samt Stand, Link fuehrt in die Kundenakte;
  Kundensuche und Schnellsuche finden den Kunden ueber den Produktnamen. Echte Daten
  (lesend): 3 Produkte mit offener Ware, 63 mit offenen Mustern; Lexikonliste ~170 ms.
- **Risiken:** Die Lexikonliste laedt dafuer das Bestellmodell je Abfrage mit (wie die
  Kundensuche). Kurze Suchwoerter treffen ueber Produktnamen mehr Kunden als bisher.
- **Naechste Stufe:** Bei Bedarf Filter „hat offene Bestellungen“ im Lexikon.

## 2026-10-20 · Muster aus offenen Druckauftraegen entfernen (#1547)

- **Geaendert:** Reservierte Muster aus einer frueheren Sitzung oder von einem anderen
  Arbeitsplatz haben jetzt „Entfernen…“ je Position und „Gesamten Auftrag entfernen…“.
  Einzelentfernen beendet den alten Auftrag und gibt seine uebrigen Positionen gemeinsam
  wieder unter „Noch zu drucken“ frei. Ein atomarer Schreibvorgang prueft den vollstaendigen
  Auftrag samt Revisionen, erhaelt den Verlauf und setzt keine Position als gedruckt.
  Mehr als 25 Positionen sind schrittweise erreichbar; geoeffnete Auftragsdetails bleiben
  beim Aktualisieren erhalten. Ein bestaetigter Text erklaert Restpositionen und vorhandene
  Ausdrucke vor dem Entfernen.
- **Getestet:** 3435/3435 Gesamttests (633 Dashboard), 58/58 synthetische Browserstrecken:
  Einzel-/Gesamtentfernen, Abbrechen, Mehrplatzkonflikt, Antwortfehler/Wiederholung,
  Leserechte und Auftraege mit mehr als 25 Positionen samt bestehenden Verbindungs-/Sammeldruckstrecken.
  30 Rollen-/Breitenansichten bei 360/390/800/1024/1440 px in heller/dunkler Ansicht ohne
  Ueberlauf oder JS-Fehler. Klickstrecke mit echter Datenkopie: 5 reservierte Positionen
  werden zu 1 entfernt und 4 offen, ohne Druck oder Gedruckt-Markierung. Unabhaengige
  Pruefung des gefrorenen Produkt-Diffs ohne offene Befunde.
- **Risiken:** Die Listenaktion stoppt keinen bereits laufenden Hardwaredruck. Dieser wird
  vor der Aenderung am betreffenden Arbeitsplatz beendet. Entfernte Eintraege bleiben fuer
  Verlauf und Wiederholungsschutz erhalten; Kundenbestellungen werden nicht veraendert.
- **Naechste Stufe:** Projektpruefungen, PR und Aktualisierung des privaten Dashboard-Dienstes.

## 2026-10-20 · Drucker getrennt verbinden und Dashboard-App druckfaehig starten (#1540)

- **Geaendert:** Die Druckvorschau bietet „Drucker verbinden“ als eigenen Schritt mit sichtbarem
  Verbindungsstatus. Die reine Verbindung sendet keine Etiketten, setzt keinen Druckversuch und
  aendert keinen Drucklistenstatus. Der spaetere bewusste Druckklick nutzt dieselbe Verbindung.
  Doppelklick, Abbruch und verspaetete Geraeteauswahl bleiben getrennt vom Druck; Schliessen einer
  ungedruckten Vorschau gibt den Auftrag weiterhin frei. Zum Wechseln zwischen Bluetooth und USB
  zuerst trennen. Der Tastaturfokus beginnt beim Verbinden und springt danach nicht zum Druckstart.
  Ein gemeinsamer macOS-App-Starter oeffnet ein eigenes Chrome-/Edge-Fenster ueber localhost;
  optional eine sichere HTTPS-Zentrale. Der installierte App-Einstieg kann darauf delegieren,
  ohne die privaten Betriebsstarter zu ersetzen. Dienstpruefung, Wiederanlauf und privates Log
  bleiben erhalten; LAN-HTTP und unsichere Browserausnahmen werden nicht verwendet.
- **Getestet:** 48 Browserstrecken mit ausschliesslich synthetischem Drucker: Verbinden ohne
  Druckbefehle/Callbacks, Verbindung wiederverwenden, Doppelklick, Fehler und Wiederholung,
  Schliessen/Escape/Backdrop/Sitzungsende/Dialogersatz waehrend der Geraeteauswahl sowie gesperrte
  bzw. wechselnde Verbindungsart. Bestehende Sammeldruck-/Papierbestaetigung und private
  Datenkopie auf Handy/Tablet/Rechner in heller und dunkler Ansicht geprueft. 14 isolierte
  Startertests ersetzen alle App-/Netz-/Dienstaufrufe; sichere URL, App-Modus, Browserauswahl,
  Wiederanlauf und Fehlerpfade geprueft. Unabhaengige Pruefung der gefrorenen Produktdateien.
- **Risiken:** Kein echter Niimbot verbunden oder physischer Ausdruck ausgefuehrt. Der Status
  bestaetigt die Geraeteverbindung, nicht die Qualitaet eines spaeteren Ausdrucks.
- **Naechste Stufe:** Projektpruefungen, PR und Aktualisierung des privaten Dashboard-Dienstes.

## 2026-10-20 · Muster sammeln und im selben Fenster abschliessen (#1536)

- **Geaendert:** Im Lexikon ist Vormerken die Hauptaktion; eine bestaetigte Rueckmeldung nennt
  Ausfuehrung/Kopien und fuehrt zur naechsten Suche oder Druckliste. Die gemeinsame Liste nimmt
  standardmaessig alle offenen Positionen. Haekchen und Sammelentfernen erscheinen erst unter
  „Auswahl aendern“; eine leere Auswahl bleibt leer. „Druckvorschau oeffnen“ reserviert den Auftrag,
  erst „Jetzt … Aufkleber drucken“ startet die Ausgabe. Druckereinstellungen sind eingeklappt.
  Die Papierkontrolle schliesst den Auftrag direkt im Druckfenster ab. Schliessen vor einem
  Druckversuch gibt den Auftrag wieder frei; ab dem Druckklick bleibt er bei Abbruch/Fehler erhalten.
  Nach der Druckerwahl prueft ein frischer Abruf IDs/Revisionen vor jedem ersten Hardwarebefehl.
- **Getestet:** 29 synthetische Browserstrecken mit Druckerattrappe, darunter Reihenfolge/Kopien,
  individuelle/leere Auswahl, Mehrplatzkonflikt waehrend Druckerwahl, Abbruch/Teiltransport,
  Sitzungsende, Papierbestaetigung und wiederholbare Callbackfehler. Lexikon-Doppelklick,
  Farbwechselmenge, bestaetigte/unbestaetigte Vormerkung und Suchfokus. Bestehende Gesamtsuite
  3407/3407 (605 Dashboard), 30 Rollen-/Breitenansichten sowie gefuellte Liste/Vorschau auf einer
  privaten Datenkopie bei 360/390/800/1024/1440 px, hell/dunkel, ohne Ueberlauf oder JS-Fehler.
  Unabhaengige Pruefung des gefrorenen Produkt-Diffs ohne offene Befunde.
- **Risiken:** Kein physischer Druck erfolgt. Die Papierkontrolle bleibt erforderlich; ein
  bestaetigter Datentransport beweist keinen lesbaren Ausdruck. Tab-Schliessen/Neustart und
  Sitzungsende geben Reservierungen bewusst nicht automatisch frei.
- **Naechste Stufe:** Projekt-Guards abschliessen, PR zusammenfuehren und privaten Dienst lesend pruefen.

## 2026-10-20 · Akquise gefuehrt: eine Firma „Als Nächstes“ (#1533)

- **Geändert:** Statt einer langen Liste mit Dropdown, Datum und Notiz je Firma: oben ein Erklärkasten
  (worum es geht, drei Schritte, Fortschritt „x von 33 angeschrieben · Antworten · Aufträge“), darunter
  genau eine Karte „Als Nächstes“ – fällige Wiedervorlagen zuerst, dann noch nicht angeschriebene nach
  Wohnungsbestand, dann Nähe zu Oranienburg (ungefähre km je Ort in `lib/akquise.mjs`). Karte: Name, Ort,
  Art, Wohnungen, Kontakt (CSV-Spalte `kontakt`, jetzt von `/api/akquise/liste` geliefert), ein Satz warum,
  was zu tun ist, Knöpfe „E-Mail öffnen“ (mailto mit Betreff/Text), „Text kopieren“, „Anrufen“, dann
  „Erledigt: angeschrieben“ (+14 Tage) bzw. „Nachgefasst“ (neue Aktion, Status bleibt, +14 Tage,
  Zähler), „Antwort bekommen“ (Feld „Was wurde gesagt?“ → Termin vereinbaren / Angebot schicken, +7),
  „Kein Interesse“, „Später“ (+7). Ohne Kontakt: „Kontakt fehlt – Website ansehen“. „Alle Firmen“
  zugeklappt als kompakte Tabelle (Stand-Chip, Wiedervorlage, Notiz, „Oben zeigen“). Ausschreibungen
  als eigener Kasten mit Erklärung, Ampel und „noch N Tage“.
- **Getestet:** `tests/akquise.test.mjs` 10 (3 neu); `dashboard:test` 608 grün, `npm test` 3406 grün;
  `dashboard:pruefen` alle Ansichten 360–1440 px OK, 0 px Überlauf. Klickstrecke Datenkopie (390 px):
  angeschrieben → Fortschritt 0 → 1, Karte springt zur nächsten Firma; Später → nächste Firma,
  Wiedervorlage +7; „Oben zeigen“ → angeschrieben → Karte „Nachfassen“; Antwort + Notiz → Termin:
  Antworten 0 → 1, Notiz gespeichert; 0 JS-Fehler.
- **Risiken/Annahmen:** Wohnungszahl fehlt in der CSV fast überall, die Reihenfolge läuft dort über die
  Entfernung. Status von Hand zurücksetzen geht nur noch über die Karten-Knöpfe. mailto-Länge hängt
  vom Mailprogramm ab (Text ~1,5 kB). Bereich bleibt nur für die Rolle Inhaber sichtbar.
- **Nächste Stufe:** Wohnungszahlen in der privaten CSV ergänzen; falls Mitarbeiter den Bereich nutzen
  sollen, Rolle in `kern/router.mjs` und Server freigeben.

## 2026-10-20 · Cleanup-PRs gemeinsam abgesichert (#1441, #1457)

- **Geändert:** Änderungen aus #1444 und #1460 zusammengeführt. Tempordner brauchen eine Besitzkennung,
  die an Verzeichnisidentität und Prozess gebunden ist; fremde und unmarkierte Ordner bleiben erhalten.
  Echte Pfadauflösung verhindert Löschung außerhalb des Tempbereichs über Symlink/`..`. Ein lebender
  Besitzer oder offene Dateien/cwd blockieren die Altbereinigung; unklare Prüfungen ebenfalls.
  `--aus` behält auch eine frühere automatische Ablage dauerhaft. Browserstart/-ende und Serverende
  werden vor der Bereinigung abgewartet; bei Fehlern bleibt keine unbeabsichtigt offene Prüf-Instanz.
  Der Teststarter verwaltet eine eigene POSIX-Prozessgruppe einschließlich Enkelprozessen und eskaliert
  ignorierte Abbrüche begrenzt; Ausgabe und Rückgabecode bleiben erhalten, Signale liefern 130/143/129.
- **Getestet:** Synthetische Regressionen für fremde/aktive Ordner, verlinkte Exporte und Pfade, kopierte
  Kennungen, reale cwd-Nutzung, Browserstart/-abbruch, verzögertes Kindende und parallele Testsuiten.
  Echter Puppeteer-Prüflauf mit synthetischen Daten: regulär, `--offen` plus Server-TERM, Fehler mit
  `--offen`, INT/TERM/HUP. Vollsuite und Commit-Guards im zugehörigen PR dokumentiert.
- **Risiken:** SIGKILL/Stromverlust können keinen Exit-Handler ausführen. Unmarkierte Altbestände werden
  absichtlich nicht automatisch übernommen. Windows-Fallback und bewusst abgekoppelte Test-Prozessgruppen
  sind durch die macOS-Prüfung nicht abgedeckt. Keine pauschale Tempbereinigung oder Dienst-Neustarts.
- **Nächste Stufe:** Konsolidierten Entwurfs-PR prüfen; Merge/Preview/Live bleiben gesperrt.

## 2026-10-20 · Aufkleberbestand automatisch pruefen und gemeinsame Druckliste vereinfachen (#1525, #1526)

- **Geaendert:** Interne Katalogpruefung im Lexikon mit Suche, Status und offenen Zuordnungen.
  Neue Produkte und Farben erscheinen nach dem Lexikonabgleich automatisch. Belegte Einzeldekore
  und Basisartikel erhalten vollstaendige Aufkleber, mehrdeutige Quellen bleiben gesperrt.
  Die Druckliste bietet seitenuebergreifende Auswahl, einzelnes/gesammeltes Entfernen und einen
  Drucklauf fuer bis zu 1000 Positionen/5000 Aufkleber. Automatische 100er-Transportteile ueber
  dieselbe Verbindung, hoechstens 12 Vorschaumotive. Sichere Vorgangskennungen auch auf privatem
  HTTP; Anzahl bleibt beim Farbwechsel erhalten. „Aufkleber ansehen“ oeffnet die Vorschau.
- **Getestet:** Reine Export-, Zuordnungs-, API- und Speicherfaelle sowie synthetische
  Browserstrecken fuer Mehrplatzbetrieb, Rollen, Reihenfolge/Kopien, 100er-Teile, Entfernen,
  Abbruch, Verbindungsfehler, B1-Abschluss und Sitzungsablauf. Frischer Rohdatenabgleich gegen
  kanonische Aufkleber prueft Produktquellen, Farbe, Shop-SKU, QR und hinterlegte Technik.
  Gesamtsuite 3403/3403 (605 Dashboard), 170 Standardansichten plus 99 Rollen-/Breitenfaelle
  ohne Ueberlauf. 18 Katalog- und 17 Drucklisten-Browserstrecken ohne offene Befunde; alle
  Aufkleber im Browser mit echtem Canvas/QR auf Volltext, Grenzen und Ueberlappung geprueft.
  Projekt-Guards, Theme-Check, Secret-Scan und statischer Workflow erfolgreich.
- **Risiken:** Produktdatenkonsistenz beweist keine Hersteller-Vollstaendigkeit und keinen
  physischen Lagerbestand. Ungeklaerte Musterfaehigkeit bleibt sichtbar; fehlende optionale SKU
  wird weggelassen. Echter B1/50x50-Hardwaredruck bleibt zu pruefen. Abbruch bestaetigt keinen
  Ausdruck; Reservierung bleibt bis zur bewussten Freigabe/Kontrolle bestehen.
- **Naechste Stufe:** Gefrorenen PR-Diff pruefen, Dienst aktualisieren und intern lesend verifizieren.

## 2026-10-20 · Einkauf „Je Auftrag“: nur Handlungsbedarf offen, Kunde informieren, Verzug (#1522)

- **Geaendert:** „Je Auftrag“ zeigt oben nur „Jetzt zu tun“ (bestellen, Ungeklaertes, Ware da und
  Kunde nicht informiert, Muster da, Verzug), aelteste zuerst. Bestellte Auftraege, die auf Ware
  warten, liegen eingeklappt unter „Unterwegs (N)“, informierte/rausgegebene unter „Beim Kunden (N)“
  (`?abg=` haelt die Gruppe offen). Schritt 4: „Nachricht an Kunde“ (fertiger Text in Sie-Form,
  kopieren oder Mailprogramm, Telefon) und „Kunde informiert“ – neuer Zeitleisten-Schritt
  `kunde_informiert` (Ware) im Auftragsverlauf, Datum und Person an der Karte. Verzug: bestellt seit
  mehr als 10 Werktagen ohne Wareneingang (mit bestaetigtem Liefertermin erst danach) → Hinweis
  „Beim Lieferanten nachfragen“ mit fertiger Nachfrage; das bisherige To-do „Nachhaken“ (7
  Kalendertage) folgt derselben Regel und fuehrt nach `#/einkauf?ab=verzug`. „Heute“ hat oben die
  Zeile „Zu bestellen · Kunde informieren · Verzug · Nachfassen Akquise“, je Zahl ein Sprung in die
  gefilterte Liste (`?ab=bestellen|informieren|verzug`). Rechnung in `lib/auftrags-ablauf.mjs`.
  Nichts wird automatisch gesendet.
- **Getestet:** dashboard:test 522, npm test gruen, dashboard:pruefen 165 OK (33 Ansichten,
  360–1440 px, 0 px Ueberlauf). Klickstrecke gegen die Kopie: Ware-Position auf „geliefert“ →
  Heute „Kunde informieren“ 1, Liste 1 Karte → Dialog (Sie-Form, Mailto) → „Kunde informiert“ →
  Liste 1 → 0, Heute 1 → 0, Server liefert `kundeInformiert`; Verzug 3 Karten, Nachfrage-Text mit
  Kommission; „Unterwegs (15)“ eingeklappt, aufgeklappt 20 Karten; 0 JS-Fehler.
- **Risiken:** Liefer-/Montagetermin aus der Auftrags-App nicht angebunden: die App liefert per
  Schluessel nur Zahlen, Termine stehen in Google Sheets/Kalender ohne Shopify-Bestellnummer.
- **Naechste Stufe:** Lesende Termin-Ansicht in der Auftrags-App mit Bestellnummer, dann Termin an
  Schritt 4.
## 2026-10-20 · Benoetigte Musteraufkleber direkt bei der Bestellung (#1506)

- **Geaendert:** Musterbestellungen zeigen intern Produkt, Farbe, Shop-SKU, offene Aufklebermenge
  und Drucklistenstand. Ein Klick merkt die zugeordneten Positionen gemeinsam vor. Die interne
  Quellbestellung ist in der Druckliste verlinkt, erscheint aber nicht auf Aufkleber, PNG oder QR.
  Mehrere Arbeitsplaetze und Neuladen verdoppeln keine Bestellposition. Aenderungen, unklare
  Zuordnungen und Mengen verlangen Pruefung; bereits vorbereitete Auftraege bleiben unveraendert.
  Der vorhandene Direktdruck verwendet dieselben kanonischen Daten und die bestellten Gesamtmengen.
- **Getestet:** 3.310 Tests gruen (538 Dashboard-Tests), davon 33 neue Zuordnungs-, Speicher-
  und API-Faelle. Browserfaelle mit getrennten
  Mitarbeitersitzungen: Quell-ID vor alter Muster-SKU, Mengen/Teilversand, Tombstone,
  Reservierungskonflikte, Storno, Direkt-/Nachdruck und verspaetete Antworten. Ohne Anmeldung
  liefern beide APIs 401, private Dateipfade bleiben unzugaenglich, „lesen“ erhaelt bei POST 403.
  Druckbild und QR enthalten ausschliesslich Produktdaten; synthetische Kunden-/Bestellmarker
  fehlen. 30 Rollen-/Ansichts-/Breitenpruefungen bei 360–1440 px sowie Desktop-/Handy-Klickfaelle
  ohne Browserfehler oder Ueberlauf. Projekt-Guards, Theme-Check, Secret-Scan und statischer
  Workflow erfolgreich.
- **Risiken:** Physische Ausgabe am echten Niimbot bleibt separat zu pruefen. Nachtraeglich
  geaenderte oder entfernte Vormerkungen werden bewusst nicht automatisch neu erzeugt.
- **Naechste Stufe:** Dashboard-Dienst nach Merge aktualisieren und die interne Zuordnung lesend
  im laufenden Dienst kontrollieren.

## 2026-10-20 · Aufgeraeumt: Navigation mit „Mehr“, Einkauf „Je Auftrag“ (#1513)

- **Geaendert:** Seitenleiste nur noch Heute, Kunden, Einkauf, Akquise (Inhaber), Lexikon; alles
  Seltene (Arbeitsplatz, Aufgaben, Sonderposten, Bildrechte, Social Media, Shop-Wache und die
  frueheren Buero-Punkte) liegt unter einem eingeklappten „Mehr“ – fuer alle Rollen, Inhaber-Punkte
  bleiben je Link `data-nur-inhaber`. Einkauf startet jetzt im neuen Reiter „Je Auftrag“
  (`ansichten/einkauf/ablauf.mjs`, Rechnung in `lib/auftrags-ablauf.mjs`): je offene
  Kundenbestellung fuenf Schritte (eingegangen → Lieferantenbestellung vorbereiten → bestellt →
  Ware da/Lieferung/Montage → erledigt). Schritt 2 zeigt je Lieferant „Bestellnachricht zeigen“ –
  der vorhandene Bestellmail-Dialog, auf diesen einen Auftrag gefiltert (`openBestellmailDialog(…,
  { auftrag })`); „Als bestellt markieren“ dort hakt Schritt 3 ab. Fehlender Lieferant,
  Artikelnummer oder Bestellmenge steht als „Ungeklaert – erst klaeren, nicht raten“. Die bisherige
  Ansicht heisst „Je Lieferant“ (`?tab=lieferant`; alte Adressen mit `?af=`, `?auftrag=`, `?lf=`
  und `?tab=bestellungen` landen weiter dort). Nichts wird automatisch gesendet.
- **Getestet:** `tests/auftrags-ablauf.test.mjs` (5), dashboard:test 517, npm test gruen,
  dashboard:pruefen nur OK auf 33 Ansichten (360–1440 px, kein Querscrollen), Klickstrecke gegen
  die Kopie: ein Auftrag auf „vorbereiten“ zurueckgesetzt → Karte zeigt Schritt 2, „Bestellnachricht
  zeigen“ oeffnet die Mail nur fuer diesen Auftrag, „Als bestellt markieren“ → „vorbereiten“ 1 → 0,
  0 JS-Fehler.
- **Risiken:** Lieferung-/Montagetermin gibt es in den Daten nicht; Schritt 4 sagt nur „Termin mit
  dem Kunden ausmachen“. Muster-Schritte nutzen den gemeinsamen Knopf („Alle 3 angekommen“).
- **Naechste Stufe:** Termin aus der Auftrags-App uebernehmen, wenn der Inhaber das moechte.

## 2026-10-20 · Akquise Verlegeauftraege bei Wohnungsunternehmen (#1447)

- **Geaendert:** Neuer Bereich „Akquise“ (nur Inhaber): je Firma Status (neu / angeschrieben /
  Antwort / Termin / Auftrag / kein Interesse), letzte Aktion, Wiedervorlage (automatisch +14 Tage
  nach „angeschrieben“), Notiz, Filter nach Status; „Nachricht kopieren“ legt das Anschreiben mit
  Firmennamen in die Zwischenablage, versendet nichts. Darunter die Ausschreibungen Bodenbelag.
  Auf „Heute“ das To-do „Akquise: N Nachfassen fällig“. Firmenliste und Vorlage liegen privat
  (Gedaechtnis-Ordner, `TP_AKQUISE_DIR`/`TP_AKQUISE_CSV`/`TP_AKQUISE_VORLAGE`), der Stand unter
  `$TP_PRIVAT_DIR/akquise/status.json`. API `/api/akquise/liste|aendern`, nur Inhaber.
- **Getestet:** `tests/akquise.test.mjs` (7, u. a. Rollen lesen/mitarbeiter 403, kaputter Stand
  wird nicht ueberschrieben), dashboard:test 513, npm test gruen, dashboard:pruefen nur OK
  (360–1440 px), Klickstrecke gegen die Kopie: Status → angeschrieben, Wiedervorlage 03.11.,
  Notiz gespeichert, „kein Interesse“ → Liste „Offen“ 33 → 32.
- **Risiken:** Standardpfad der Liste ist der Gedaechtnis-Ordner dieses Macs; auf dem Dienst-Mac
  ggf. per Umgebungsvariable setzen. Kopieren braucht die Zwischenablage-Freigabe (HTTPS/localhost).
- **Naechste Stufe:** Ansprechpartner/Telefon je Firma anzeigen, wenn der Inhaber das wuenscht.

## 2026-10-20 · Gemeinsame Druckliste fuer Musteraufkleber (#1493)

- **Geaendert:** Im Lexikon Farbe/Ausfuehrung und Anzahl waehlen und „Zum Drucken vormerken“.
  Der Kollege oeffnet „Gemeinsame Druckliste“, waehlt Eintraege und druckt den reservierten
  Auftrag. Erst „Ausdruck geprueft – als gedruckt markieren“ erledigt ihn. Neue Vormerkungen
  bleiben separat; Abbruch, fehlende Verbindung und Neustart loeschen nichts. Andere Sitzungen
  koennen einen reservierten Auftrag nicht erneut zum Druck oeffnen. Bewusste Wiederfreigabe
  verlangt die Pruefung bereits gedruckter Aufkleber. Server erzeugt die unveraenderlichen
  Etikettdaten selbst aus dem Lexikon. Private atomare Ablage mit Revisionen, Wiederholungsschutz,
  Prozesssperre und Sicherung; Mitarbeiter duerfen bearbeiten, „lesen“ bleibt lesend.
- **Getestet:** Alle 3.240 Tests gruen (505 Dashboard-Tests), Projekt-Guards erfolgreich. 16 gezielte Speicher-/API-Tests
  einschliesslich zwei paralleler Prozesse, doppelter Reservierung, spaeterer Vormerkung,
  Rollenrechten, Original-SKU, kaputter Ablage und Erholung nach Prozessabbruch. Datenkopie:
  45 Rollen-/Ansicht-/Breitenpruefungen zwischen 360 und 1440 px ohne Browserfehler oder Ueberlauf.
  Vier weitere Ansichten im Dunkelmodus sowie 14 Browser-Klickfaelle mit zwei getrennten
  Browsersitzungen und Druckerattrappe erfolgreich.
- **Risiken:** Beide Arbeitsplaetze muessen denselben privaten Dashboard-Dienst verwenden.
  Die Papierausgabe am echten Niimbot bleibt zu pruefen; ein geschlossener Dialog oder
  erfolgreicher Download gilt nie als bestaetigter Ausdruck.
- **Naechste Stufe:** Nach dem Merge den Dashboard-Dienst nachziehen und einen echten
  50×50-mm-Testaufkleber im Laden pruefen.

## 2026-10-20 · Musteraufkleber direkt im Lexikon (#1489, #1490)

- **Geaendert:** Produkt oder Muster im Lexikon oeffnen, Farbe/Ausfuehrung und Anzahl waehlen,
  fertiges 50×50-mm-Etikett im vorhandenen Niimbot-Dialog drucken oder als PNG speichern.
  Gleiche SKU/Farbe auf mehreren Breiten wird gebuendelt, andere SKUs bleiben waehlbar.
  Muster verwenden die explizite Originalreferenz und echte Shop-SKU. Fehlende Angaben lassen
  sich in der Vorschau ergaenzen; paralleles Speichern kann kein anderes Etikett ueberschreiben.
  Lange Paketetiketten behalten alle Technikzeilen und die vollstaendige Artikelnummer.
  Einzelvarianten mit dem internen Titel „Default“ verwenden Marke und Dekor aus dem belegten
  Produkttitel; der Platzhalter erscheint nicht als Farbe auf dem Etikett.
- **Getestet:** Alle 3.223 Tests gruen, davon 488 Dashboard-Tests; 17 synthetische Browserfaelle bei 1440/390 px einschliesslich
  verzogertem Nachladen, zwei Kopien, PNG, Ergaenzen, bestehendem Bestellungsdruck und QR-Netzfehler.
  Read-only-Abgleich aller 5.971 aktuellen Mustervarianten: vollstaendige Etikettdaten fuer
  3.927 unterschiedliche Muster-SKUs, kein Text ausserhalb, kein QR unter 100 px und keine fehlende
  Technikzeile. Zusaetzlich Lexikonliste, Original- und Musterprodukt in der Datenkopie bei
  360/390/800/1024/1440 px: 15 Ansichten ohne Browserfehler oder Ueberlauf. Projekt-Guards,
  Theme-Check, Secret-Scan und statischer Workflow erfolgreich.
- **Risiken:** Der Browser-Druckauftrag ist mit einer Druckerattrappe geprueft; physischer
  Testdruck am Niimbot bleibt offen. Keine Produktdaten oder Lagerbestaende geaendert.
- **Naechste Stufe:** Nach dem Merge Dashboard-Dienst nachziehen und den echten Testdruck bestaetigen.

## 2026-10-19 · Belege: Absender und fehlende Bestelldaten absichern (#1463)

- **Geändert:** Bei allgemeinen Mailanbietern verknüpft dieselbe Vorgangsnummer nur noch Belege
  derselben vollständigen E-Mail-Adresse. Anzeigename, Leerraum und Großschreibung ändern den
  Vergleich nicht; eine gemeinsame Domain oder eine fehlende Adresse reichen nicht.
  Adressen im Anzeigenamen werden dabei nicht als Postfach gelesen; mehrdeutige oder beschädigte
  Angaben können keinen sicheren Vorgang bestätigen. Auch die Lieferantenzuordnung nutzt die echte Adresse.
  Die Ansicht nennt solche Absender mit ihrer Adresse und gruppiert verschiedene Postfächer getrennt.
  Lange Adressen brechen in den Gruppen- und Belegköpfen um, auch auf kleinen Handys.
  Fehlt der Bestellexport oder ist er beschädigt, meldet die Belegansicht eine Datenstörung statt
  alle Belege als unzugeordnet und die Arbeitsliste als leer darzustellen.
  GraphQL-Exporte brauchen ausdrücklich ein `nodes`-Array; fehlende oder falsche Container sind
  ein Quellenfehler. Echte leere Bestelllisten bleiben gültig.
- **Getestet:** Beide Fehler vor der Korrektur synthetisch reproduziert; Regressionen für fremde,
  gleiche und fehlende Adressen sowie fehlenden und beschädigten Bestellexport. Die Belegablage
  bleibt beim Lesen unverändert. 3.166 Tests grün, davon 465 Dashboardtests und 30 Belegtests;
  vollständige Rollen-Baseline mit 350 Ansichten, nach den letzten Korrekturen 24 gezielte Ansichten
  mit drei Rollen gegen die Datenkopie. Synthetische Klickstrecke bei 390/1440 px: AB bestätigen, richtiger LS erbt die
  Bestellung, fremdes Postfach bleibt ohne Zuordnung; Absender getrennt, Exportfehler sichtbar,
  „Nochmal versuchen“ nach Wiederherstellung erfolgreich, Dialog per Esc geschlossen.
  Zusätzlich Adressen mit 64 Zeichen vor dem @ bei 360/390/768/1440 px auf seitlichen Überlauf geprüft.
- **Risiken:** Keine Änderung an gespeicherten Belegen, Bestellungen, Mailversand oder Shopify.
- **Nächste Stufe:** Nach dem Merge den Dashboard-Dienst nachziehen und den Versionsstand prüfen.

## 2026-10-19 · Prüfwerkzeug: Datenkopie verschwindet bei jedem Ende (#1441)

- **Geändert:** Mit `dashboard:pruefen -- --offen` endet das Prüf-Skript nach dem Bericht; das ausgegebene
  `kill <pid>` traf nur den Server, der von der Datenkopie nichts wusste – sie blieb jedes Mal im Temp-Ordner
  (16 Kopien mit Kunden- und Einkaufsdaten, 13.–19.10.). Jetzt löscht der Server seine Kopie selbst, sobald er
  endet (`TP_DASHBOARD_DATENKOPIE`, neues Modul `scripts/dashboard-datenkopie.mjs`). Ein Fehler im Lauf mit
  `--offen` ließ bisher Instanz und Kopie ohne ausgegebene PID stehen, jetzt wird beides beendet. Beim Start
  löscht `dashboard:pruefen` Kopien ohne laufenden Prozess, die älter als einen Tag sind (Prozess-Prüfung über
  `ps axeww`, unter Windows wird nichts gelöscht). Gelöscht wird nur ein echter Ordner
  `tp-dashboard-daten-XXXXXX` direkt im Temp-Ordner; die verlinkten Exporte (Lexikon usw.) bleiben.
- **Getestet:** `docs/ai-dashboard/tests/datenkopie.test.mjs` (5 Tests, darunter echter Server + `SIGTERM`; ohne
  den Fix rot). Reproduktion `--offen --ansichten heute --breiten 1440`, dann `kill <pid>`: vorher Kopie mit
  31 Einträgen übrig, jetzt weg. Fehler im Lauf mit `--offen`, Strg-C mit und ohne `--offen` (ganze
  Prozessgruppe), normaler Lauf: keine Kopie, kein Prüf-Server übrig. Die 16 alten Kopien gelöscht, nachdem
  `lsof` und `ps` keinen Prozess darauf zeigten.
- **Risiken:** `kill -9` auf den Server lässt die Kopie weiter liegen, bis ein Lauf sie nach einem Tag findet.
  Ohne `--aus` bleiben die Screenshots (zeigen ebenfalls echte Daten) in `tp-dashboard-pruefung-*` liegen.
- **Nächste Stufe:** Screenshot-Ordner ohne `--aus` ebenfalls nach einigen Tagen wegräumen.

## 2026-10-19 · Temp-Ordner: Screenshots und Testordner bleiben nicht mehr liegen (#1457)

- **Geändert:** Im Temp-Ordner des Macs lagen rund 194.000 Einträge aus diesem Repository. `dashboard:pruefen`
  ohne `--aus` ließ jeden Screenshot-Ordner `tp-dashboard-pruefung-XXXXXX` (echte Kunden- und Einkaufsdaten)
  für immer liegen (59 Ordner); jetzt löscht jeder Lauf beim Start solche Ordner, die älter als drei Tage sind
  (`scripts/dashboard-pruefung-ordner.mjs`, nur echte Verzeichnisse mit genau diesem Namen direkt im
  Temp-Ordner, nie Links). Die Testsuiten legten per `mkdtemp` Ordner mit rund hundert Präfixen an
  (`cc-api-*` allein 42.000) und räumten sie nicht weg: die npm-Testskripte laufen jetzt über
  `scripts/test-temp.mjs`, der jeder Suite einen eigenen Temp-Ordner gibt (`TMPDIR`/`TMP`/`TEMP`) und ihn
  danach löscht, auch bei roten Tests und `kill`. Die sieben größten Verursacher (`_testumgebung.mjs`,
  `api`, `sonderposten-api`, Ops-Server, Log-Filter, Deploy-Fenster, Worktree-Sperre) räumen zusätzlich selbst
  auf (`wegwerfOrdner`), damit auch ein Einzelaufruf `node --test datei` nichts hinterlässt.
- **Getestet:** `docs/ai-dashboard/tests/pruefung-ordner.test.mjs` (4 Tests: Name, Ort, Link, Alter, Inhalt).
  Zwei volle `npm test`-Läufe grün (3.148 Tests), Temp-Ordner vorher und nachher gleich viele Einträge, kein
  neuer mit einem Test-Präfix. Die sieben Dateien einzeln ohne Starter: kein neuer Ordner. Starter mit rotem
  Test (Exit 1) und mit `kill` (Exit 1): Ordner jeweils weg.
- **Risiken:** Tests, die einen Kindprozess mit selbst gebauter Umgebung ohne `TMPDIR` starten, schreiben
  weiter nach `/tmp` (in beiden Läufen kein Fall). Einzelaufrufe der übrigen Testdateien ohne Starter
  hinterlassen weiter Ordner.
- **Nächste Stufe:** Screenshot-Aufräumen und `verwaisteDatenkopien` (#1444) in ein Modul zusammenführen.

## 2026-10-19 · Übersicht: „Heute“ als eine Liste, Lieferantenbelege aus dem Postfach (#1427)

- **Geändert:** Inhaber 19.10. „immer noch zu unübersichtlich … Schnittstelle zu Gmail“; Audit und
  Postfach-Konzept mit Codex abgestimmt.
  - **Heute** ist eine Arbeitsliste: Zahl oben = Zeilen der Liste, Chips Laden/Website/Alles mit Zahl,
    „Im Hintergrund“ statt Musterkarten und Warteübersicht, „Liste unvollständig“ statt falschem „Alles
    erledigt“. Fehler behoben: „Alles“ verschwieg Laden-Arbeit; neue Service-Anfragen fehlten auf Heute
    (vier hingen seit drei Tagen auf „neu“); Liefertermin in der Zukunft hieß „Nachhaken“.
  - **Einkauf › Belege** (neu, Architektur § 25): ABs, Lieferscheine, Stornos aus dem Postfach, zugeordnet
    zu Shop-Bestellungen und abgeglichen mit unserem Stand und Shopify. Storno und Lieferschein ohne Haken
    werden To-dos auf Heute, Vorschläge eine Sammelzeile. Marke „AB 14.10. · LS 16.10.“ an bestellten
    Posten im Einkauf.
  - **Einkauf**: Ware, die schon bei uns liegt, steht nicht mehr unter „Nachfassen“ (mit Telefon des
    Lieferanten), sondern unter „Liegt bei uns – Rausgeben“; die Nachfass-Kachel zählt Aufträge mit Ware
    von zwei Lieferanten einmal.
  - **Kunden**: Bestellliste seitenweise (25); der Menüzähler zählt neue Service-Anfragen mit.
- **Getestet:** `npm run dashboard:test` (460), `npm test` (3.121 grün), `dashboard:pruefen --rollen` über 70 Ansichten
  × 5 Breiten ohne Fehler und ohne seitliches Scrollen. Höhe Heute am Handy 3.870 → 2.355 px, Belege
  4.609 → 1.899 px (Desktop). Erkennung gegen 56 echte Mails aus dem Label „LS AB“ (nur lesend, in einer
  Datenkopie): 52 Belege (44 AB, 6 LS, 1 Avis, 1 Storno), 2 sicher, 4 Vorschläge, der Rest Laden-/
  Telefonbestellungen. Klickstrecke gegen die Kopie: Vorschlag annehmen (Zu prüfen 2 → 1, Lieferschein
  erbt die Bestellung der AB), „Passt nicht“ (1 → 0), Zuordnen-Dialog (39 Bestellungen, Esc),
  „Kein Shop-Lieferant“ (15 → 14 Absender), keine JS-Fehler.
- **Codex-Review des PR (10 Befunde, alle behoben):** beschädigte Ablage nicht mehr als leer; Sperre mit
  Besitzkennung; Teilnummer nie „sicher“; Vorgangsverknüpfung nur bei einigen Ankern; Vorschlag mit
  mehreren Bestellungen verlangt Auswahl; unbekannter Absender nicht bei allen Lieferanten; „Erledigt“ je
  Beleg und Auftrag, jeder offene Storno zählt; Shopify-Stand je Lieferant; Stornos von Unterdomains;
  Heute meldet ausgefallene Belege/Shopify-Abgleich als „Liste unvollständig“.
- **Codex-Nachprüfung (8 Punkte, alle behoben):** verwaiste Sperre räumt nur, wer die Räum-Sperre hält;
  eine nackte Belegnummer („2026“) ist nur bei genau dieser Notiz sicher; Vorgangsverknüpfung nur, wenn
  die eigenen Bestellnummern genau die des Ankers sind; unbekannter Absender bei Bestellung mit mehreren
  Lieferanten: Lieferant ist Pflicht (Dialog und Server), nur ein Lieferant dieser Bestellung; ein Storno
  ohne Lieferantenzeile bleibt rot; Teilversand innerhalb einer Position (neu `mengeBestellt` im Export);
  „Heute“ zeigt „Lade …“, bis Belege und Shopify-Abgleich da sind; die Lieferantenwahl im Dialog bleibt stehen.
- **Risiken/Annahmen:** Die meisten Lieferanten nennen unsere Bestellnummer nicht – sicher wird die
  Zuordnung erst, wenn beim „Als bestellt markieren“ die AB-/Vorgangsnummer notiert wird oder die
  Bestellnummer im Betreff steht. Anhänge (PDF) werden nicht gelesen.
- **Nächste Stufe:** Postfach-Lauf einrichten (nach dem Merge), eine Woche beobachten, dann entscheiden,
  ob „AB fehlt seit N Tagen“ eine Regel wird.

## 2026-10-19 · „Muster nachfassen“: Karte nach einem Versandlauf aktuell

- **Geändert:** Nach dem ersten Lauf (4 Mails) standen die Kunden in einem offenen Tab weiter als „offen“ –
  die Bestellzeilen werden je Tab nur einmal geladen, nur die Vorlage (mit „letzter Lauf“) alle 30 s.
  Meldet `/api/kunden/muster-texte` einen neuen Lauf (`neuerVersandlauf()`), lädt „Heute“ die
  Bestellzeilen nach (`ladeBestellzeilenNeu()`); ebenso nach einem abgelehnten „Jetzt senden“.
  `dashboard:pruefen` kopiert `nachfassen/` weiterhin nicht (Kommentar: sonst echte Mails aus der Prüfung).
- **Getestet:** Unit-Test `neuerVersandlauf` (erster Abruf, erster Lauf, neuer Lauf, gleicher Lauf),
  `npm test` grün, `dashboard:pruefen` Heute/Kunden alle Breiten OK.
- **Risiken/Annahmen:** Aktualisiert wird, solange „Heute“ offen ist und offene Zeilen zeigt.
- **Nächste Stufe:** —

## 2026-10-19 · Bestellungen: Zwei-Wege-Abgleich mit Shopify (#1419)

- **Geändert:** Was in Shopify versendet ist, steht im Control Center nach dem nächsten Bestellexport
  mindestens auf „An Kunden raus“ („aus Shopify übernommen“); stornierte Bestellungen sind keine offene Arbeit
  mehr. Umgekehrt bucht jedes „Erledigt“ (Einkauf, Zeitleiste, Muster-Ergebnis, „Kunde fertig“, „Ohne Einkauf
  abschließen…“) den Versand in Shopify, falls dort noch offen – ohne Mail an den Kunden. „Wieder öffnen“ und
  „Zurück auf offen“ storniert in Shopify nichts und sagt das. Auf „Heute“ steht, nur wenn es sie gibt, die
  Liste „In Shopify noch offen“ (im Dashboard abgehakt, in Shopify offen) mit „In Shopify nachbuchen“.
  Konfliktregel: „Versendet“ gewinnt, nichts wird automatisch zurückgenommen (ARCHITEKTUR §24).
- **Getestet:** 7 neue Regeltests, 11 neue API-Tests (Attrappe, nie echtes Shopify), 2 Tests an die neue Regel
  angepasst; `npm test` 3067/3067, `dashboard:test` 413/413, `dashboard:pruefen` nur OK (28 Ansichten,
  0 px Überlauf bis 360 px). Trockenlauf gegen eine Datenkopie: 1 Position „bestellt“ → „raus“ (der Fall
  von heute), 36 Vermerke richtiggestellt, 0 Stornos, zweiter Lauf 0 Änderungen; Abweichungsliste 1 Bestellung
  (Muster, abgeschlossen ohne Versand, in Shopify zurückgehalten). Klickstrecke gegen die Kopie mit
  Shopify-Attrappe: „In Shopify nachbuchen“ 1 → 0 (eine Buchung, ohne Mail); „Kunde fertig“ an einer
  Kundenbestellung: eine Buchung für 3 Artikel, ohne Mail, Rückfrage nennt Shopify; „Ohne Einkauf
  abschließen“ an einer Testbestellung: nichts gebucht; 390 px ohne Überlauf, 0 JS-Fehler.
- **Risiken/Annahmen:** Eine Position zählt erst als in Shopify erfüllt, wenn die ganze Menge erfüllt ist.
  „Ohne Einkauf abschließen“ für eine Bestellung, die in Wahrheit storniert ist, bucht sie als versendet – der
  Dialog sagt deshalb „zuerst in Shopify stornieren“. Bestellungen, die lokal storniert erledigt werden, könnten
  beim Lieferanten noch bestellt sein (Abbestellen bleibt Handarbeit).
- **Nächste Stufe:** Bei „in Shopify storniert, beim Lieferanten bestellt“ einen Hinweis „beim Lieferanten
  abbestellen?“ zeigen.

## 2026-10-19 · „Muster nachfassen“: Blindkopie abschaltbar

- **Geändert:** Inhaber 19.10. nach dem ersten echten Versand: keine Kopien ans Büro. `"kopie": false` in
  `nachfassen/postfach.json` schaltet die Blindkopie ganz ab (auch in der ersten Woche, auch mit
  `kopieImmer`); die Karte nennt dann keine Kopie.
- **Getestet:** `lesePostfach()` mit `kopie: false`; „Jetzt senden“ und Lauf gegen die SMTP-Attrappe nur
  an den Kunden; Kartenstand ohne `kopie`/`mitlesenBis`. `npm test` grün.
- **Risiken/Annahmen:** Wer mitlesen will, sieht die Mails im Ordner „Gesendet“ des Postfachs.
- **Nächste Stufe:** —

## 2026-10-19 · „Muster nachfassen“: E-Mail direkt aus der Karte senden

- **Geändert:** Wunsch Inhaber: die Nachfrage gleich aus der Karte an den Kunden schicken statt über
  „E-Mail öffnen“. Mit eingerichtetem Firmenpostfach hat jede offene Zeile „Jetzt senden“; Betreff und
  Text sind vorher bearbeitbar. `POST /api/kunden/nachfassen-senden` → `kundenNachfassenEinzeln()` mit
  denselben Sperren wie der tägliche Lauf (Empfänger nur aus den Bestelldaten, Stoppliste, kein zweiter
  Versand derselben Stufe, kein Platzhalter, Kopie-Woche) und Zeitleiste „nachgefasst“ vom Absender.
  Details: Architektur Abschnitt 23.
- **Getestet:** `npm test` grün (3046). Neu: Einzelversand gegen die SMTP-Attrappe (angepasster Text,
  fremde Adresse aus dem Browser ignoriert, Kopie, Zeitleiste von „Anna“, zweiter Klick 409, der Lauf
  danach lässt die Bestellung aus, Abgemeldete 409, Erinnerung aus der Vorlage), Postfach lehnt ab → 502
  ohne Passwort in der Meldung, Server-Rollen (lesen 403, ohne Postfach 409). Klickstrecke gegen die
  Datenkopie mit Attrappen-Postfach: Text geändert, „Jetzt senden“ → Mail mit Änderung und Blindkopie
  nur in der Attrappe, offen 6 → 5, Zeile unter „Erledigt … von Prüfung mitarbeiter“. 375 px ohne
  Überlauf, Knöpfe 44 px.
- **Risiken/Annahmen:** Ohne `nachfassen/postfach.json` erscheint der Knopf nicht – bis dahin bleibt
  „E-Mail öffnen“. Entwürfe leben nur im Tab (Neuladen der Seite verwirft sie).
- **Nächste Stufe:** Postfach einrichten (Inhaber), dann ersten echten Versand mit Kopie mitlesen.

## 2026-10-16 · „Muster nachfassen“ verschickt automatisch vom Firmenpostfach (Werkbank w-119)

- **Geändert:** Inhaber 16.10. (w-119, Option A): Text 1 und die Erinnerung gehen täglich automatisch
  vom Firmenpostfach raus, mit Abmelde-Satz. Neuer Lauf `npm run -s muster:nachfassen` (`--probe` =
  Trockenlauf) über `kundenNachfassenSenden()` im Server: fällige Kunden aus `musterNachfassen()`
  (Kaufprüfung, 30 Tage, eine Erinnerung), Text aus der Vorlage des Inhabers, Versand per SMTP ohne
  Fremdpaket (`operations/lib/smtp.mjs`), danach Zeitleiste „nachgefasst“ von „automatisch“. Zugang
  nur aus `$TP_PRIVAT_DIR/nachfassen/postfach.json` (Rechte 600) – fehlt sie, verschickt der Lauf nichts
  und die Karte sagt es. Erste Woche nach dem ersten Versand: jede Mail als Blindkopie ans Büro.
  Stoppliste (`nachfassen/stoppliste.json`) per Knopf „Abgemeldet“ in der Karte
  (`POST /api/kunden/nachfassen-abmelden`, write-Liste); Abgemeldete stehen getrennt und werden nie
  angeschrieben. Versandprotokoll mit Doppelschutz (kein zweiter Versand nach Abbruch, nur Zeitleiste
  nachtragen). Ein Platzhalter erreicht nie den Kunden (`platzhalterFrei()`; unbekannter Platzhalter im
  Betreff bleibt sichtbar statt still zu verschwinden). LaunchAgent-Vorlage
  `net.teppich-paradies.nachfassen.plist.vorlage` (Mo–Sa 9:30). Details: Architektur Abschnitt 23.
- **Getestet:** `npm test` grün (siehe PR). Neu: Trockenlauf ohne Postfach, echter Lauf gegen eine
  SMTP-Attrappe (Umschlag mit Blindkopie, Betreff/Text, Zeitleiste „automatisch“, kein zweites Mal,
  Erinnerung nach 10 Tagen ohne Kopie, danach Schluss), Doppelschutz nach Abbruch, Platzhalter,
  abgelehnte Anmeldung (535), kaputte Stoppliste stoppt alles, Rollen am Server (lesen 403). Trockenlauf
  gegen die echten Daten: 6 erste Nachfragen stehen an, 0 Fehler. Browserprüfung „Heute“ gegen die
  Datenkopie (Desktop und Handy) siehe PR.
- **Risiken/Annahmen:** Das Postfach legt der Inhaber selbst an; bis dahin läuft alles wie bisher per
  Klick. Die Abmeldung erfasst ein Mensch per Knopf (kein Posteingangs-Abgleich). Der LaunchAgent wird
  erst nach dem Merge im Dienst-Checkout eingerichtet, nach einem Trockenlauf von Hand. Rechtliche
  Einordnung der Mail ohne Newsletter-Einwilligung klärt der Inhaber (w-083).
- **Nächste Stufe:** Erste Woche mitlesen, dann `kopieImmer` entscheiden; Antworten „Abmelden“ zählen;
  Anteil Muster → Kauf aus der Zeitleiste auswerten.

## 2026-10-19 · Maßteppiche unter 2 m automatisch zum Kettler

- **Geändert:** Regel des Inhabers: Maßteppiche mit Einfassung und kürzerer Seite unter 2 m
  gehen ohne Auswahl in eine eigene Bestellmail an unseren Kettler, der Rest bleibt in seiner
  Mail. Der Kettler schneidet ohne Gebühr zu – der Lieferant bekommt deshalb Meterware von der
  Rolle (z. B. „1,50 lfm von der 4,00 m breiten Rolle, ohne Maßzuschnitt“) mit dem Fertigmaß für
  den Kettler, statt „1 Stück nach Maß“ (dort 10/15 € Zuschnitt). Im Dialog gibt es dafür den
  Knopf „Automatisch“; Kunden/Laden/Kettler schicken weiter alles an ein Ziel.
- **Getestet:** Neue Fälle für Meterware, Rolle quer, rund, Aufteilung, 2 m genau, ohne Kettler;
  `npm test` und `dashboard:test` grün, `dashboard:pruefen` ohne Befund.
- **Risiken/Annahmen:** Länge ohne Schnittzugabe (genau das Fertigmaß); braucht der Kettler
  Zugabe, kommt sie als Zuschlag hinzu. Rollenbreite kommt aus dem Konfigurator
  („_Zuschnitt aus Rolle“); fehlt sie, bleibt es beim Stück nach Maß.
- **Nächste Stufe:** Zugabe mit dem Kettler klären.

## 2026-10-19 · Ware über unseren Kettler (Berlin)

- **Geändert:** Im Bestellmail-Dialog (Einkauf, Ware) gibt es neben „Kunden“ und „Laden“ das
  Ziel **„Kettler“**. Die Mail bittet den Lieferanten dann, nur zuzuschneiden (nicht zu ketteln)
  und an unseren Kettelservice zu liefern; Anschrift und Telefon stehen nur privat in den
  Stammdaten (`absender.kettelservice`), ohne Eintrag wird der Kettler nicht angeboten.
  Ein Hinweis „Über unseren Kettler?“ nennt Kettel-Positionen, bei denen es naheliegt (Kunde in
  Berlin/PLZ 16 oder kürzere Seite bis 2 m). „Als bestellt markieren“ (Mail und Einzeldialog)
  vermerkt den Weg an der Position: Stand „Bestellt · unterwegs zum Kettler“, Knopf „Als beim
  Kettler abgeholt markieren“, danach „Beim Kettler abgeholt“; oben die Zahl „Ware unterwegs zum
  Kettler“. Die Schritte im Auftragsfluss bleiben dieselben.
- **Getestet:** 6 neue Tests (Mailtext, fehlende Anschrift, nur Ware, Vorschlag, Statusvermerk);
  `npm test` und `dashboard:test` grün. `dashboard:pruefen`: 28 Ansichten, 0 px Überlauf.
  Klickstrecke gegen Datenkopie: Dialog zeigt Kunden/Laden/Kettler, Kettler gewählt; Muster mit
  `ziel=kettler` → 400; Position auf „Bestellt · unterwegs zum Kettler“ (Band 0 → 1), dann
  „Beim Kettler abgeholt“. Keine JS-Fehler.
- **Risiken/Annahmen:** Der Umschalter gilt für die ganze Mail einer Gruppe – gemischte Ware
  (einiges zum Kettler, anderes zum Kunden) braucht zwei Durchgänge. „Bis 2 m“ ist als kürzere
  Seite gelesen (gerollt als Paket); Nähe = PLZ 10–14 und 16.
- **Nächste Stufe:** Echte Kettelpreise des Kettlers eintragen und je Auftrag „Kettler lohnt
  sich“ mit Fahrtkosten rechnen.

## 2026-10-16 · Angaben als Codex- und Claude-App-Entwurf oeffnen (#1404)

- **Geaendert:** Neue App-Ziele erhalten „Mit Angaben in … oeffnen“. Ein echter Klick uebergibt
  den vollstaendigen Auftrag mit Projektordner bzw. Repository-Zuordnung an die dokumentierten
  App-Protokolle. Keine Zwischenablage, kein neuer Server-Endpunkt und kein automatischer KI-Start.
  Gespeicherte Ziele bleiben promptfrei. Ein allgemeiner neuer Claude-Chat benennt das fehlende
  Projekt; vorhandene Chats und nicht unterstuetzte Cloud-Projekte behalten den manuellen Weg.
  Der native Link wird bei 12.000 kodierten Zeichen ohne Kuerzung abgewiesen; alle Angaben bleiben
  erhalten. Details: [APP-UEBERGABE.md](APP-UEBERGABE.md).
- **Getestet:** `npm test` 2.960/2.960, darunter 15 neue gezielte Pruefungen fuer Texttreue,
  Prozentkodierung, Projektparameter, echte Klicks, Laengengrenzen und Kontext-/Sitzungswechsel.
  Ein vorheriger einzelner Dashboard-Lauf traf den bestehenden 500-ms-Aktualisierungstest;
  zwei anschliessende vollstaendige Laeufe waren gruen. Browserpruefung gegen Datenkopie:
  36 Ansichts-/Rollen-/Breitenkombinationen (360, 390, 1440 px), kein Ueberlauf oder JS-Fehler.
  Der echte Codex-Knopf loest den nativen Aufruf aus und meldet ausschliesslich „Uebergabe
  angefordert“. Der Sichtvergleich in der Ziel-App ist noch offen: Codex darf die eigene
  Oberflaeche nicht auslesen; Claude zeigte beim bisherigen Aufruf keinen verifizierbaren Entwurf.
- **Risiken/Annahmen:** Die App muss am betreffenden Geraet installiert und das Projekt verfuegbar
  sein. Die Dashboard-Rueckmeldung bestaetigt keine Einfuegung. Claude Code fragt bei Ordnerlinks
  separat nach; ein ausgewaehlter Ordner-Chip beweist kein spaeter ausgefuehrtes Arbeitsverzeichnis.
  Der Text steht im fluechtigen nativen Protokoll-Link; Betriebssystem und Ziel-App verarbeiten ihn
  ausserhalb des Dashboard-Speicherverhaltens. Lokale Ordner uebernehmen keine alten Cloud-Chats.
- **Naechste Stufe:** Vollstaendigen Text und Ziel in den echten Apps bestaetigen, Claude-Ziele
  abschliessend zuordnen und erst danach den Dienst nachziehen.

## 2026-10-16 · Unklare Mustersperren und Teilfreigaben absichern (#1400)

- **Geändert:** Eine unlesbare Sperr-Gegenprobe gilt nicht mehr als nie geschriebene Sperre.
  Moegliche Shopify-Aenderungen werden getrennt von bestaetigten Sperren gespeichert; auch alte
  unklare Eintraege behalten den ersten Vorstand. Sicher erfolglose Versuche frieren keinen Vorstand
  ein: nach zwischenzeitlichem Bestandszugang zaehlt vor dem ersten echten Sperren der frische Stand.
  „Wieder verfügbar“ stellt diesen Stand frisch
  geprueft wieder her und entfernt den Eintrag erst bei exaktem Zielstand plus Bestellbarkeit.
  Teilfreigaben bleiben mit Fehler offen sichtbar und lassen sich erneut ausfuehren. Sicher nie
  geschriebene Versuche bleiben lokal entfernbar. Global bestellbare Varianten werden auch bei
  lokalem Bestand 0 und erneutem Versuch nicht als gesperrt bestaetigt.
- **Getestet:** Gezielte Mustersperren-/API-/Konfigurator-Suiten: 44/44, darunter Gegenprobe-Timeout,
  alte Ablage, fehlender Zugang, sichere Nicht-Mutation, Teilfreigabe, Wiederholung, verlorene
  Antwort und globale Bestellbarkeit. `npm test`: 2921/2921, Pflichtguards und statische
  Workflowpruefung gruen. Browser-Datenkopie: 24 Rollen-/Ansichts-/Breitenkombinationen (390/1440 px),
  0 px Ueberlauf. Synthetischer Klicktest: unklare Sperre, misslungene Teilfreigabe nach Neuladen
  sichtbar (390/1440 px), erneute Freigabe stellt untracked/Bestand 3 her, offene Liste 1 → 0;
  keine JavaScript-Fehler. Screenshots ausserhalb des Repositorys.
- **Risiken/Annahmen:** Nur Attrappen und isolierte Datenkopie, keine echte Shopify-Mutation.
  Eine reale Schreib-/Rueckwegprobe und die laufende Dienstversion sind damit nicht bestaetigt.
- **Nächste Stufe:** Unabhaengigen PR-Diff pruefen; kein Merge, Preview oder Live in diesem Auftrag.

## 2026-10-16 · Angaben direkt ins ChatGPT-Projekt uebergeben (#1397)

- **Geaendert:** „Im Projekt einfuegen“ uebergibt den vorbereiteten Auftrag ohne Zwischenablage an
  einen optionalen Chrome-Begleiter. Dieser oeffnet die hinterlegte ChatGPT-Projektseite, prueft
  deren leeres Eingabefeld und fuegt den vollstaendigen Text als Entwurf ein. Er sendet nichts ab.
  Die private Erweiterung wird ausserhalb des Repositorys mit ausdruecklichen Dashboard-Urspruengen
  erzeugt. Kein neuer Server-Endpunkt, API-Schluessel oder Text in der URL. Inhalte liegen nur
  kurz in `storage.session`; Abbruch, Verfall und Tab-Schliessen raeumen wartende Auftraege auf.
  Die manuellen Knoepfe bleiben aufklappbar; lokale Codex-/Claude-Ziele behalten ihren bisherigen Weg.
- **Getestet:** `npm test`: 2.930/2.930. Darunter 18 gezielte Dashboard-Tests sowie 15 Tests des
  Begleiters inklusive echter isolierter DOM-Pruefungen. Zusaetzlicher MV3-Start im temporaeren
  Testbrowser bestaetigt Statusnachricht, Portgrenze und Ablehnung kuenstlicher Klicks. Browserpruefung
  gegen Datenkopie: 36 Ansichts-/Rollen-/Breitenkombinationen (360, 390, 1440 px), kein Ueberlauf
  oder JS-Fehler; Desktop-/Handy-Screenshots gelesen. Klickstrecke: Ohne Begleiter bleibt der
  Direktknopf gesperrt, manuelle Alternative ist erreichbar und Anbieterwechsel erhaelt die Eingabe.
  Pflicht-Guards und Secret-Scan bestanden. Der erste Durchlauf im eingerichteten Profil fand
  einen Ladeabbruch: Ein spaetes `loading` wurde als Dokumentwechsel gewertet. Korrigiert und mit
  drei Regressionstests fuer Erstladen, URL-Wechsel und neue Dokumente abgesichert. Danach drei
  echte Uebergaben aus der Datenkopie im eingerichteten Chrome-Profil bestaetigt: alle Texte stimmen
  mit der Dashboard-Vorschau ueberein (1.689, 1.329 und 1.442 Zeichen), richtige Projektueberschrift,
  aktiver Sendeknopf und jeweils null abgesendete Nachrichten. Testentwuerfe anschliessend geleert.
- **Risiken/Annahmen:** Einmaliges Laden des privaten Pakets im Chrome-Profil des Arbeitsplatzes
  ist erforderlich. Die automatische Browsersteuerung darf Chromes Erweiterungsverwaltung nicht
  bedienen; Installation und spaeteres Neuladen bleiben beim Inhaber. Geaenderte ChatGPT-Oberflaechen
  koennen eine Adapterkorrektur erfordern. Andere Rechner brauchen ihre eigene Browser-Einrichtung.
- **Naechste Stufe:** Im Arbeitsalltag nutzen; fuer weitere Anbieter bleibt die direkte Texteingabe
  eine eigene Erweiterung.

## 2026-10-16 · Arbeitsplatz als Prozesszentrale (#1390)

- **Geändert:** Neuer Arbeitsplatz fuer E-Mail, Angebotsvorbereitung und Recherche, erreichbar
  aus „Heute“, Seitenleiste und Befehlspalette. Angaben ergeben eine pruefbare Arbeitsanweisung;
  getrennte Knoepfe kopieren den Text und oeffnen die passende App bzw. ein hinterlegtes Projekt.
  App-/Projektziele werden ausschliesslich privat in `prozesslinks.json` gespeichert, geprueft und
  mitgesichert. Kein Hintergrundlauf, keine neuen API-Schluessel, kein automatischer Versand.
  Lokale Eingaben werden bei Ansichtswechsel, Abmelden, `pagehide` und einer erhaltenen 401
  verworfen. Ein Datenabgleich erhaelt Fokus und Textauswahl. Details: Architektur „Arbeitsplatz“.
- **Getestet:** `npm test` 2.850/2.850, gemeinsame Linkvalidierung (auch native App-Ziele),
  Schreibrechte/Herkunft, atomare Ablage und beschaedigte Datei. Browserpruefung gegen Datenkopie:
  60 helle und 45 dunkle Ansichts-/Rollen-/Breitenkombinationen (360–1440 px), keine JS-Fehler,
  kein seitlicher Ueberlauf. Klickstrecke: Text kopiert, Ziel ohne Kontext, Konfiguration gespeichert,
  ungueltiges Ziel abgewiesen, Heute-Einstieg, Fokus/Auswahl nach Datenabgleich, Kontext nach
  Ansichtswechsel/`pagehide`/echter 401 leer. Screenshots Desktop und Handy gelesen.
- **Risiken/Annahmen:** Allgemeine App-Ziele waehlen noch kein Cloud-Projekt. Die konkreten
  Projektadressen muessen im privaten Einrichtungsbereich hinterlegt werden; sie werden nicht aus
  internen Kennungen geraten. Native Ordnerlinks beziehen sich auf das oeffnende Geraet; der
  App-Start selbst wurde nicht automatisiert ausgeloest. Der Lexware-Skill muss im Zielprojekt
  tatsaechlich vorhanden sein; das Dashboard prueft oder installiert ihn nicht. Bei einer parallel
  belasteten Wiederholung scheiterte einmal der bestehende 500-ms-Aktualisierungstest; die
  vollstaendige Testsuite war gruen, die Dashboard-Suite wurde anschliessend separat geprueft.
- **Nächste Stufe:** Gewuenschte Cloud-Projekte gemeinsam zuordnen und den E-Mail-Ablauf mit dem
  Team erproben; erst danach echte KI-Hintergrundausfuehrung separat planen.

## 2026-10-16 · „Muster nicht verfügbar – Kunde informiert“ schließt ab und sperrt die Farbe im Shop (#1385)

- **Geändert:** Inhaber 16.10.: Im Dialog „Etwas anderes ist passiert …“ gibt es direkt nach „Ergebnis:
  kein Interesse“ die Wahl „Muster nicht verfügbar – Kunde informiert“ („Der Kunde meldet sich und bestellt
  neue Muster; der Auftrag ist damit abgeschlossen.“). Darunter alle Muster des Auftrags als Kästchen
  (vorausgewählt) und ein Mailvorschlag mit den Farben zum Kopieren bzw. „E-Mail öffnen“ – nichts wird
  gesendet. Der Auftrag ist danach abgeschlossen wie bei „kein Interesse“ und fällt aus „Muster
  bestellen“, „nachhaken“, „Muster nachfassen“ und Kunden › „Zu tun“; die Zeitleiste zeigt das Ergebnis
  mit Datum, Person und der Notiz („Nicht verfügbar: Produkt: Farben – Freitext“, Pflicht). Die
  angekreuzten Farben werden im Shop sofort gesperrt (Mustervariante `M-…`: Bestand verfolgen, Bestand 0,
  nicht verkaufen wenn ausverkauft; Gegenprobe `availableForSale` false). Einkauf › Musterlager: oben „Im
  Shop sperren“, falls das nicht ging (mit Link zur Variante, „Erneut sperren“), unten „Im Shop gesperrte
  Muster“ mit „Wieder verfügbar“ (stellt den Stand vor der Sperre her). Ablage `mustersperre.json`, nur
  anhängen, in `daten:sichern`. Details: `ARCHITEKTUR.md` Abschnitt 22.
- **Getestet:** `operations/tests/mustersperre.test.mjs` (11: Ablage fehlend/leer/beschädigt/ohne
  Leserecht, nur anhängen, Stand je SKU mit Vorstand der ersten Sperre, Idempotenz, Rechteprüfung,
  Sperren/Freigeben gegen Attrappe inkl. verlorener Antwort, mehrdeutiger SKU, fehlendem Recht),
  `auftragsverlauf.test.mjs` (+2: Pflichtnotiz, Stufe erledigt, kein Nachhaken mehr),
  `docs/ai-dashboard/tests/mustersperre-api.test.mjs` (9: To-do und Kundenfall verschwinden, 2 Farben
  gesperrt, zweiter Klick schreibt nichts, Pflichtangaben 400, Rechte fehlen → nichts geschrieben,
  kein Zugang, Wieder verfügbar, Testbestellung, beschädigte Ablage, Mailtext, Server: Rolle „lesen“ 403,
  Mitarbeiter ohne Notiz 400). `npm test`: 2861 Tests grün (nach Rebase auf main). `dashboard:pruefen` (Heute, Einkauf,
  Musterlager, Kunden, Bestellungen, mit `--rollen`): nur OK, 0 px Überlauf bei 360–1440 px.
  Klickstrecke gegen die Kopie (390 px, ohne Shopify-Zugang): offene Musteraufträge 21 → 20, „Muster
  bestellen“ 2 → 1, „Im Shop sperren“ 0 → 3, Kästchen 3 von 3 vorausgewählt, Mailtext ohne Platzhalter
  und folgt der Auswahl; Beispiel des Inhabers #1021: „nachhaken“ 4 → 3; „Wieder verfügbar“ 5 → 4;
  keine JS-Fehler, keine Fehlerantworten. Shopify-Rechte des Dienstes nur lesend geprüft:
  `write_inventory` und `write_products` sind erteilt.
- **Risiken/Annahmen:** Die Shop-Anzeige „kein Muster verfügbar“ baut eine andere Sitzung im Theme; bis
  dahin ist eine gesperrte Farbe im Konfigurator einfach nicht bestellbar. Muster über „Kostenloses
  Muster“ (Vinyl von der Rolle) haben keine Variante je Farbe – dort steht nur der Hinweis. Die Sperre
  wurde nie gegen den echten Shop geschrieben (nur Attrappe und Kopie ohne Zugang); der erste echte Klick
  nach dem Merge ist die Probe – danach die Variante im Admin ansehen. Der Dienst muss neu starten.
- **Nächste Stufe:** „Im Shop sperren“ als To-do auf „Heute“, falls dort etwas liegen bleibt.

## 2026-10-16 · Claude-Verbrauch auf „Insights“ (#671)

- **Geändert:** Neue Kachel „Claude-Verbrauch“ auf Insights (nur Inhaber): Sitzungen und
  Langsitzungen der letzten 7 Tage (je Tag), Tokens gesamt und vom Modell geschrieben, Modell und
  Denkstufe je Klasse (Gespräche, geplante Aufgaben, Subagenten), die fünf größten Sitzungen mit
  Aufgabe, aktiver Zeit und Werkzeugaufrufen, Tokens je Aufgabe und je Modell, aufklappbar die
  übrigen Langsitzungen. Daten aus den lokalen Sitzungsprotokollen von Claude Code
  (`npm run verbrauch:sammeln` → `$TP_PRIVAT_DIR/verbrauch/claude.json`); der Server rechnet einen
  Stand älter als 30 Minuten im Hintergrund neu. Details: `ARCHITEKTUR.md` Abschnitt 21.
- **Getestet:** `operations/tests/claude-verbrauch.test.mjs` (Berliner Tage, doppelte Zeilen und
  mitkopierte Antworten einmal, Zeitraum, Klassen, Langsitzung über Zeit und über Aufrufe, Aufgaben nur
  aus `npm run task`, Worktree- und Subagenten-Dateien, kein Prompttext in der Ausgabe),
  `tests/verbrauch-api.test.mjs` (ohne Datei Hinweis statt Zahlen, frisch/veraltet, ein Lauf
  gleichzeitig, beschädigte Datei), `auth.test.mjs` (Mitarbeiter 403, Inhaber 200). Gegen die echten
  Protokolle: 645 Dateien in 8 s, 225 Sitzungen, 32 lang. `dashboard:pruefen` Insights: nur OK, 0 px
  Überlauf bei 360–1440 px.
- **Risiken/Annahmen:** Das Protokollformat von Claude Code ist nicht dokumentiert; ändert es sich,
  fehlen Zahlen (es wird nichts geschätzt). Nur 28 von 225 Sitzungen nennen ihre Aufgabe – Tokens je
  Aufgabe ist deshalb unvollständig. Cache-Lesen macht 98 % der Tokens aus; wie stark das aufs
  Wochenlimit drückt, ist nicht veröffentlicht.
- **Nächste Stufe:** Mehr Sitzungen einer Aufgabe zuordnen (z. B. `npm run task -- start` beim
  Sitzungsbeginn per Hook nahelegen) und eine Vorwoche zum Vergleich, sobald zwei Wochen Daten vorliegen.

## 2026-10-16 · Service-Anfragen kommen von selbst, Anzeigen werden erkannt (Werkbank w-030)

- **Geändert:** Inhaber 16.10.: ja zur automatischen Übernahme und zum Kampagnenfeld. Neuer geplanter
  Lauf `serviceanfragen-postfach` (Mo–Sa stündlich) liest Formular-Mails nur lesend und übergibt sie an
  `npm run -s service -- uebernehmen`; übernommen werden nur die festen Betreffe der Serviceseiten und
  die Startseite mit Service-Anliegen, ohne Dubletten (Mail-ID, gleicher Kontakt innerhalb 7 Tagen).
  Das Anfrageformular schickt jetzt ein verstecktes Feld „Herkunft“ (Anzeige/Kampagne aus der Adresse,
  ohne Speicherung, ohne Klick-ID); „Anzeige“ zählt als Quelle Werbung. Zeilen aus dem Postfach sind
  gekennzeichnet. Fremde Felder anderer Formulare („Phone:“) hängen nicht mehr am vorigen Wert.
  Details: `ARCHITEKTUR.md` Abschnitt 20.
- **Getestet:** Lib-Tests (Herkunft → Werbung, Betreff-Freigabe, alle Template-Betreffe eingeordnet,
  Formularskript mit gclid/utm/fbclid ohne Speicher und ohne Klick-ID), Postfach-Test (nur Service,
  Absender, von Hand Erfasstes, zweiter Lauf leer, Berliner Datum). Gegenprobe mit den echten Mails
  29.09.–09.10. in einem Wegwerf-Ordner: 4 Service-Anfragen angelegt, Musteranfrage übersprungen,
  zweiter Lauf ohne Änderung.
- **Risiken/Annahmen:** Der Lauf braucht beim ersten Mal Freigaben (Gmail lesen, Bash, Schreiben ins
  Scratchpad) – einmal „Jetzt ausführen“. Bis der PR in `~/tp-dashboard` nachgezogen ist, endet er mit
  „Skript noch nicht im Dienst“. Das Kampagnenfeld wirkt erst nach dem Theme-Deploy.
- **Nächste Stufe:** Nach zwei Wochen prüfen, wie viele Anfragen „Werbung“ tragen; erfasst nur der
  Landeseite-Fall zu wenig, die Anzeigenherkunft über Seitenwechsel tragen (bräuchte Speicherung im
  Browser, also Einwilligung).

## 2026-10-16 · Service-Anfragen unter „Kunden“ (#1361, Werkbank w-030)

- **Geändert:** Inhaber 15.10.: Service-Anfragen (Verlegeservice, Treppe, Aufmaß) im Control Center
  führen. Neuer Reiter „Service-Anfragen“ unter Kunden: Liste mit Datum, Kontakt, Leistung, Quelle,
  Status (neu → kontaktiert → Termin → Angebot → gewonnen/verloren), Notiz und nächstem Schritt;
  Standardfilter „Offen“, Zähler am Reiter = neue Anfragen. Oben die Auswertung der letzten 8 Wochen
  je Woche und je Quelle. Erfassen von Hand; eine Shopify-Formular-Mail lässt sich einfügen und füllt
  die Felder. Ablage `serviceanfragen.json` im Privatordner, gesichert von `daten:sichern`.
  Details: `ARCHITEKTUR.md` Abschnitt 20.
- **Getestet:** `tests/serviceanfragen.test.mjs` (Mail lesen inkl. Musteranfrage, Leistung aus
  Betreff/Anliegen, Feldprüfung, KW/Wochenbeginn, Auswertung, Server mit Rollen „lesen“ 403 /
  „mitarbeiter“ 200), `operations/tests/serviceanfragen.test.mjs` (Nummern, Mail nur einmal, Verlauf,
  beschädigte Datei). `dashboard:pruefen` für Kunden/Service/Rückrufe: nur OK, 0 px Überlauf bei
  360–1440 px. Klickstrecke gegen die Kopie mit erfundenen Daten: Mail einfügen → Felder gefüllt →
  angelegt (Liste 3 → 4) → Status geändert, keine JS-Fehler, 390 px ohne Überlauf.
- **Risiken/Annahmen:** Der Leser kennt den Mailaufbau von Shopify vom 29.09.–09.10.2026; ändert
  Shopify ihn, bleibt die Handeingabe. Hinweise unten (Toasts) liegen kurz über dem Dialog-Knopf –
  wie überall im Dashboard.
- **Nächste Stufe:** Formular-Mails automatisch übernehmen (geplanter Lauf liest das Postfach und
  legt per `mailId` an) und Kampagnenangabe (UTM/gclid) als verstecktes Feld ins Anfrageformular –
  beides wartet auf die Entscheidung in Werkbank w-030.

## 2026-10-15 · Herstellerware mit der Bezeichnung des Herstellers

- **Geändert:** Nächste Stufe aus dem Eintrag darunter. Warenbestellungen an die Markenhersteller
  (Lieferant D und E, Direktbezug) nannten unsere eigene SKU als Artikelnummer. Neues Stammdatenfeld
  `ware.nachBezeichnung`: dann nennt die Warenmail (an Kunden und an den Laden) die Bezeichnung aus
  `einkauf.farbname` der bestellten Variante, ohne Farbname (Vinyl: dort ist die Artikelnummer schon die
  echte) weiter die Artikelnummer – dieselbe Regel `artikelKopf()` wie bei Mustern. Menge, Rollenbreite,
  Fertigmaß, Einfassung und Kommission bleiben unverändert. Dafür führt der Einkaufsblock der Position
  (`resolve.mjs`, `EINKAUF_KEYS`) jetzt auch `farbname`; der Export holt den Namensraum `einkauf` schon
  vollständig.
- **Getestet:** `operations/tests/lieferanten.test.mjs`: Rollenware, Maßteppich und Vinyl mit Feld (an
  Kunden und an den Laden) und ohne Feld bzw. mit ungültigem Wert; Lieferant A mit gefülltem Farbnamen
  bleibt bei „Art.-Nr. … · Farb-Nr. …“. Gegen die echten Daten (nur lesend, Stammdaten im Speicher): offene
  Warenbestellungen bei D/E gibt es derzeit keine; die beiden echten Quellvarianten aus dem Export als
  Probeposition ergeben bei E die Bezeichnung statt der SKU, bei D (Vinyl) die echte Artikelnummer. Im
  Lexikon-Export tragen alle aktiven Rollenware-Varianten von D und E einen Farbnamen.
- **Risiken/Annahmen:** Wunschmaß-Varianten von D/E haben weder Artikelnummer noch Farbname und landen wie
  bisher unter „fehlt“ – unverändert. D und E haben in den Stammdaten noch keinen Warenweg/keine
  Warenmail; die Mail entsteht bis dahin als Text zum Kopieren.
- **Nächste Stufe:** Warenkontakt von D und E in den Stammdaten eintragen, sobald der erste Direktbezug
  ansteht.

## 2026-10-15 · Herstellermuster mit der Bezeichnung des Herstellers

- **Geändert:** Inhaber: Muster einiger Markenhersteller (Teppichboden und Vinyl) sind beim Hersteller
  kostenlos und werden getrennt dort bestellt. Deren Quellvarianten tragen bereits einen eigenen
  Lieferanten, die Karten und „Muster bestellen“ gab es also schon – nur nannte die Mail unsere
  eigene SKU als Artikelnummer, die der Hersteller nicht kennt. Neues Stammdatenfeld
  `muster.nachBezeichnung`: dann steht in der Mustermail (an Kunden und an den Laden) die Bezeichnung des
  Herstellers aus `einkauf.farbname` (Qualität plus Farbnummer, z. B. „Testquali 1Q00“), ohne Farbname weiter die
  Artikelnummer. Eine Farbnummer, die schon in Bezeichnung oder Artikelnummer steckt, steht nicht doppelt
  da (ganzes Wort bzw. gleiche Nummer – kein Teilstring). Kontakte und Musterweg stehen nur in der privaten
  Stammdatendatei.
- **Getestet:** `operations/tests/lieferanten.test.mjs`: Bezeichnung statt SKU (Kunde und Laden),
  Rückfall auf die Artikelnummer, ohne Feld unverändert, Farbnummer „4“ bei „TEST4_004“ bleibt stehen.
  Gegen die echten Bestelldaten (nur lesend): die beiden offenen Herstellermuster ergeben je eine Mail
  mit hinterlegtem Empfänger, Kundennummer und der Bezeichnung bzw. echten Artikelnummer.
- **Risiken/Annahmen:** `einkauf.farbname` ist bei Lieferant A und B ebenfalls gefüllt (Dekor- bzw.
  Farbwörter) – deshalb nur per Feld je Lieferant, nicht für alle. Warenbestellungen nennen weiter die
  Artikelnummer.
- **Nächste Stufe:** Warenmail für dieselben Hersteller genauso umstellen, wenn der erste Direktbezug
  ansteht.

## 2026-10-15 · Muster je Kunde mit einem Klick (#1322)

- **Geändert:** Innendienst: „zu umständlich, jetzt für jeden Artikel einzeln“. Seit #1206 öffnete
  „angekommen“ auch bei Mustern den Wareneingangs-Dialog mit Mengenfeldern – je Muster, auch über die
  Zeitleiste. Jetzt: Muster brauchen keine Mengen. In der Lieferantenkarte und im Kundenkopf der
  Muster-Tabelle steht je Kunde **ein** Knopf für den gemeinsamen nächsten Schritt
  (`musterSchritt()` in `lib/einkauf-uebersicht.mjs`): „Alle 3 angekommen“ (ein Klick, eine Meldung)
  bzw. „Verschicken…“/„Übergeben…“, sobald kein Muster des Auftrags mehr fehlt. Der Versand-Dialog
  kreuzt alle angekommenen Muster und Lagermuster vorab an (`vorauswahl(…, { status })`). Ein
  einzelnes Muster „Als geliefert markieren“ setzt direkt; die Zeitleiste setzt bei reinen
  Musterbestellungen wieder alle Muster auf einmal. Ware behält den Wareneingangs-Dialog.
- **Getestet:** `musterSchritt` (angekommen, teilweise da, verschicken, gemischt mit Lager, noch nicht
  bestellt, Übergabe, Ware), Vorauswahl mit Status, Servertest Zeitleisten-Schritt „geliefert“ für drei
  Muster. Klickstrecke gegen die Datenkopie: „Alle 3 angekommen“ → Nachfassen 5 → 4 Aufträge
  (14 → 11 Positionen); „Verschicken…“ beim selben Kunden → Dialog mit 3 von 3 angekreuzt; einzelnes
  Muster ohne Dialog → „geliefert“; Ware öffnet weiter den Wareneingang. 390 px ohne Überlauf.
- **Risiken/Annahmen:** „Angekommen“ gilt für alle bestellten Muster des Kunden bei diesem Lieferanten;
  kam nur ein Teil, je Muster in der Tabelle setzen bzw. „Zurück auf offen…“.
- **Nächste Stufe:** Rückmeldung des Innendiensts abwarten.

## 2026-10-15 · Musterlager: Antworten des Inhabers (Werkbank w-091, Folge zu #1183)

- **Geändert:** Mustergröße A5 – Probestück und Bahn zeigen „reicht noch für ca. N A5-Muster“ (54 je
  Probestück, 27 je Bahn; `musterJeStueck()`, `reichtNoch` in `wendeLagerAn()`), knapp ab 5, beim
  Probestück mit Nachkaufpreis 8–15 €. Gemischte Musterbestellungen gehen zusammen raus: kein To-do
  „Muster verschicken“, solange Lieferanten-Muster ausstehen; „rausgeben“ nennt die Lagermuster mit,
  der Versand-Dialog kreuzt sie vorab an; im Musterlager stehen sie als „zurückgelegt“. Keine
  Vorratsmuster in der Bestellmail und Etiketten (nur Name + Farbe, Gerät offen) als Entscheidung in
  ARCHITEKTUR 8b festgehalten.
- **Getestet:** neue Tests für A5, `reichtNoch` (Auffüllen setzt `basisAm`, leer = 0), gemischte Bestellung
  in drei Stufen (nicht bestellt, bestellt, eingetroffen) und Versand-Vorauswahl.
- **Risiken/Annahmen:** „reicht noch“ ist eine Schätzung aus verschickten Mustern; Verschnitt und Muster,
  die am Dashboard vorbei rausgehen, zählt sie nicht. Bahnbreite 20 cm gilt als A5-Höhe (21 cm).
- **Nächste Stufe:** Etikettendruck, sobald das Gerät feststeht; Bahnen nach Ahmets Freigabe einlagern.

## 2026-10-14 · Ansicht „Bildrechte“ (#1285, Refs #978)

- **Geändert:** Neue, rein lesende Ansicht `#/bildrechte` (Seitenleiste „Seltener“, für alle Rollen).
  Drei Kacheln wählen die Liste – Herkunft/Freigabe ungeklärt, schmaler als 1.200 px, ohne ALT-Text –,
  darunter Warengruppen-Filter und 25 Bilder je Seite mit Produkt, Bildposition, Dateiname (bei „zu klein“
  mit Maßen) und Links „In Shopify öffnen“ / „Im Shop ansehen“ (Produkt-ID und Shopadresse aus dem
  Lexikon, sonst Admin-Suche nach dem Handle). Neuer Endpunkt `GET /api/bildrechte/liste` liest
  `$TP_PRIVAT_DIR/bildrechte/bildrechte.csv` (zwischengespeichert bis zur nächsten Änderung) und liefert
  nur Listenfelder – Quellen, Lizenzen und Belege bleiben auf dem Server. Entfernte Bilder
  (`entfernt…`, „nicht mehr in Shopify“) zählen nirgends; „ungeklärt“ heißt nur Status `ungeklaert`
  oder leer. Fehlt die CSV: Hinweis mit `npm run bildrechte:inventur`, keine Demo-Daten.
  Logik in `prueflisten()` (`operations/lib/bildrechte.mjs`).
- **Getestet:** 5 neue Bibliotheks- und 4 neue Server-/API-Tests (Rolle „lesen“ 200, POST 405, ohne
  Anmeldung 401, keine Lizenz-/Quellenfelder in der Antwort). `dashboard:test` 337/337, `npm test`
  2573/2573. `dashboard:pruefen --rollen`: 275 OK-Zeilen, 0 px Überlauf bei 360–1440 px auf allen
  55 Ansichten; Screenshots Desktop und 390 px gelesen. Echte Daten (Kopie): 697 ungeklärt,
  3.114 zu klein, 0 ohne ALT-Text.
- **Risiken/Annahmen:** Die CSV enthält keine Bild-URL, deshalb Dateiname statt Vorschau. Bei rund
  3.150 Bildern fehlt die Breite (später ergänzte Zeilen) – die Ansicht nennt die Lücke. Im Verzeichnis
  stehen Statuswerte, die `STATUS` nicht kennt (`freigegeben`, `entfernt`, `nein`); `zusammenfuehren()`
  der Inventur würde sie auf `ungeklaert` zurücksetzen – eigener Fix nötig, bevor die Inventur wieder läuft.
- **Nächste Stufe:** Bild-URL und Breite in der Inventur nachziehen (dann Vorschaubild), Statuswerte in
  `operations/lib/bildrechte.mjs` vereinheitlichen.

## 2026-10-14 · Ungültige Fertigmaße vor dem Bestelltext klären (#1267, Folge zu #1225)

- **Geändert:** Erkannte Maßanfertigungen bleiben bei fehlender, nicht endlicher oder nicht positiver
  Breite/Länge ungeklärt, mit Hinweis „Fertigmaß unlesbar oder nicht positiv – Breite und Länge prüfen“.
  Die bestehende Mailprüfung führt diese Positionen unter „fehlt“; sie erzeugen keinen bestellbaren
  Mailtext. Gültige Rechteck-/Rundmaße bleiben ein Stück nach Maß; keine Rollen-Ersatzrechnung.
- **Getestet:** 62/62 gezielte Modell-/Lieferanten-Tests, darunter fehlende/0/negative/NaN/Infinity-Maße,
  sieben ungültige Rohmaßangaben ohne Bestelltext/Mailto, gültiges Rechteck und Rundteppich. Dashboard
  335/335 und Gesamtsuite 2554/2554 (nach konfliktfreiem Rebase auf frisches main); Syntax, Diff, Pflicht-Guards, statische Workflowprüfung und
  Geheimnisprüfung PASS. Einkauf mit ausschließlich erfundenen Daten bei 390/1440 px: beide OK,
  keine Browserfehler/kein Überlauf; Screenshots visuell gelesen.
- **Risiken/Annahmen:** Prüfung nutzt den vorhandenen lokalen Export und die bestehende Maß-Erkennung;
  keine neuen Größenlimits, keine Änderung der Lieferantenentscheidung über den Zuschnitt.
  Bestehende sechs Template-Hinweise und Theme-Check-Warnungen bleiben unverändert.
- **Nächste Stufe:** Unabhängiger PR-Zweitblick; Merge und Dienstübernahme erfolgen getrennt durch Root.
  Keine Shopify-/Google-Schreibaktion, keine Nachricht und kein eigener Dienstneustart.

## 2026-10-13 · Review-Korrekturen zu Mengen, Kaufquellen und Brückenstatus (#1206)

- **Geändert:** Der lokale Export liefert das aktuelle Gesamt-Soll über dieselbe bestehende Umrechnung;
  eine neue Bestellung von 12 statt 10 Einheiten zeigt sofort 2 offen, ohne Eingang neu einzugeben.
  Bereits versandte Mengen bleiben Teil des Gesamt-Solls. Verkleinerung unter den erfassten Eingang,
  geänderte Einheit oder fehlende Sollquelle führen zur Klärung; kein Kürzen und keine Umrechnung
  bestätigter Mengen. Einzel-/Sammelabschlüsse prüfen den frischen Stand vor dem Schreiben.
  Sammelergebnisse und Eigenbestandsübergabe schreiben bei abgelehntem Eingang kein Verlaufsereignis;
  alle Positionen werden vor einem einzigen atomaren Positions-Write geprüft. Beschädigte optionale
  Beschaffungsfelder sowie beschädigte Verlaufsdateien bleiben unangetastet. Übernahmesperren werden
  direkt vor dem lokalen Write frisch gelesen, ohne asynchrone Lücke.
  Kaufquellen verlangen jetzt zusätzlich eine belegte öffentliche Shop-URL und eine eindeutige verfügbare
  Variante. Der Werkbank-Zeitpunkt bezeichnet nur eine lokale Rückmeldung; der vollständige Abgleich
  bleibt unbekannt. Die Gesundheitsübersicht behandelt unbekannte Zustände als neutrale Information.
- **Getestet:** 50/50 gezielte Beschaffungs-/API-/Positions-/Zeitleistenregressionen mit Attrappen, darunter
  10 → 12 ohne Neueingabe/mit Bestätigung, 12 → 10, Einheitenwechsel, Versand mit offener Menge 0,
  blockierte Sammelergebnisse und Eigenbestandsübergabe, unveränderte Dateien bei Ablehnung,
  beschädigte Zusatztypen/Verlauf und konkurrierende Übernahmen. Public-/Health-Tests separat geprüft.
  Syntaxprüfung der betroffenen Module und Diff-Formatprüfung. Der abschließende gemeinsame Gesamt-
  und Browserlauf erfolgt durch Root; Loopback-Servertests benötigen den erlaubten lokalen Testbetrieb.
- **Risiken/Annahmen:** Sollabgleich nutzt den vorhandenen lokalen Export; nichts wird live aus Shopify
  abgefragt oder geändert. Alte Lexikonexporte ohne öffentliche Shop-URL zeigen bis zum nächsten bestehenden
  Export keine Kauflinks. Einheitenwechsel braucht fachliche Klärung; kein automatischer Datenabgleich.
  Ein lokaler Brückenzeitpunkt belegt weder vollständigen Abgleich noch externe Schreibrechte.
- **Nächste Stufe:** Root prüft und committet die gemeinsam abgegrenzten Korrekturen; kein eigenes Staging,
  Commit, Push, Dienstneustart oder Google-Release.

## 2026-10-13 · Direkte Vorgänge, Muster-Kauflinks und bestätigte Beschaffung (#1206)

- **Geändert:** Heute öffnet konkrete Aufträge/Rückrufe/Fälle mit Rückweg; der Auftragsfilter begrenzt auch
  Lieferantengruppen und Bestelltexte. Bestehende manuelle Mustertexte erhalten bis zu drei eindeutige
  öffentliche Variantenlinks aus aktiven Lexikonquellen; fehlende/archivierte Quellen werden ausgelassen.
  Liefertermin und kumulativer Wareneingang (angekommen/verwendbar/Grund) ergänzen den lokalen Positionsspeicher.
  Fehlmengen bleiben bestellt und sperren Sammelaktionen; vollständig verwendbare Menge wird geliefert.
  Einkauf und Kunden-Zeitleiste berücksichtigen Zusagen und Mängel; Wareneingang erfolgt je Position.
  Sichtbare Arbeitsübernahme ohne versteckten Ablauf: Mitarbeiter geben nur eigene Arbeit frei; fremde
  Übernahme nur durch bewussten Inhaber-Klick, Leser 403. Gesundheit zeigt belegte Sicherungs-/Werkbank-
  Zeitpunkte und optionale v49-Laufzeiten; fehlend ist unbekannt. Keine neuen Shopify-Schreibaktionen/Auto-Mails.
- **Getestet:** Neue Positions-/API-/Link-/Laufzeit-Regressionsfälle mit Attrappen; Legacy-Status-/Versand-
  tests erhalten. Dashboard-Suite 314/314, volle Projektsuite 2433/2433; bestehende Desktop-/Mobil-QA
  110/110 (22 Ansichten, fünf Breiten), finale Rollen-QA 98/98 bei 390/1440 px: kein Überlauf/JS-Fehler.
  Syntaxprüfung aller 31 Module, Pflicht-Guards und statische Workflowprüfung PASS (sechs unveränderte
  Template-Hinweise). CUA und unabhängige Root-Gegenprobe: 10 Pakete, 8 angekommen/7 verwendbar →
  weiterhin bestellt, 3 fehlen; Mengenfenster statt blindem Geliefert-Klick, sichtbare Übernahme,
  direkte Rückruf-/Aktenwege und zwei genaue Variantenlinks. Keine echten Daten oder Nachrichten.
- **Risiken/Annahmen:** Produktlinks nutzen den vorhandenen Lexikonstand. Mengen sind kumulative menschliche
  Angaben, keine Lagerkorrektur. Alte Positionsdaten bleiben kompatibel; beschädigte Zusatzfelder werden
  nicht überschrieben. Sicherungserfolg ab nächstem erfolgreichen Lauf; Werkbank-Zeit bestätigt das Einlesen,
  nicht jeden externen Schritt. Echt fehlende App-/Google-Konfiguration bleibt offen.
- **Nächste Stufe:** Unabhängiger Diff-Review und Veröffentlichung durch Root. Kein eigener Push/Merge/
  Dienstneustart oder Google-Release.

## 2026-09-08 · Phase A: Bestandsaufnahme

- **Geändert:** `BESTANDSAUFNAHME.md`, `ARCHITEKTUR.md`, Screenshots des Ist-Zustands
  (`screenshots/ist-*.png`), Launch-Konfiguration `dashboard-static` (Port 8001 war lokal belegt).
- **Getestet:** Screenshots über Puppeteer gegen `npm run dashboard:serve`; GitHub-Zugang (`gh auth status`)
  und Issue-Struktur (#34, #41, #42, #55, #92) geprüft; `gh api …/pages` meldet `errored`.
- **Risiken/Annahmen:** Repo ist öffentlich; Owner-Feld = Assignee (Annahme, rückgängig machbar);
  neue Status-Labels erst nach Freigabe.
- **Nächste Stufe:** Inkrement 1 – testbares Datenmodell (`lib/model.mjs`).

## 2026-09-08 · Inkrement 1: Datenmodell

- **Geändert:** `docs/ai-dashboard/lib/model.mjs` (Statusmodell mit Mapping und Übergangsregel,
  Body-Parser, Task-Normalisierung, Triage-Lücken, Dringlichkeits-Score mit Gründen, Übergänge mit
  Pflichtangaben, Label-Änderungen, gespeicherte Ansichten, Kennzahlen, Bereichszustand, Datenfrische);
  `docs/ai-dashboard/tests/model.test.mjs`; `npm run dashboard:test`, in `npm test` eingehängt.
- **Getestet:** 11 Tests grün (`npm run dashboard:test`), u. a. mit den echten Body-Formaten aus #34, #42, #41.
- **Risiken/Annahmen:** Score-Gewichte sind eine erste Setzung und in `ARCHITEKTUR.md` dokumentiert;
  „Owner" = GitHub-Assignee.
- **Nächste Stufe:** Inkrement 2 – `issues.json` Schema 2 mit den neuen Feldern und Sync-Status.

## 2026-09-08 · Inkrement 2: issues.json Schema 2

- **Geändert:** `scripts/build-dashboard-data.mjs` exportiert testbare Funktionen, schreibt `schema: 2`
  mit `fields` (extrahierte Body-Felder, kein Volltext), `assignees`, `comments`, `sync.labelsAvailable`;
  atomarer Schreibvorgang (tmp + rename), bei Abruffehler bleibt die alte Datei stehen und Exit 1.
  Parser: Checklisten ohne Überschrift und „Soll-Zustand"/„Aufgabe"/„Auftrag" erkannt.
- **Getestet:** 15 Tests grün; echter Lauf gegen das Repo: 30 Issues, 23 mit Checkliste,
  Blocker bei #34 erkannt, Ausführende (Codex, ChatGPT Work, Ahmet) aus `## Worker`.
- **Risiken/Annahmen:** Alte Felder unverändert, das bestehende Frontend liest die Datei weiter.
  Kein Issue hat bisher eine `Frist` – Fälligkeitslogik greift erst mit dem neuen Template.
- **Nächste Stufe:** Inkrement 3 – neues Frontend.

## 2026-09-08 · Inkrement 3: Neues Frontend

- **Geändert:** `docs/ai-dashboard/index.html`, `app.css`, `app.js` ersetzen die monolithische Seite.
  Navigation Heute / Arbeit (Liste + Kanban) / Freigaben / Bereiche / Insights / Aktivität, Command
  Palette (⌘K, `/`), Aufgaben-Detail als Sheet mit Deep Link (`#/arbeit?task=42`), Statusband mit
  Links auf vorgefilterte Ansichten, „Braucht jetzt Aufmerksamkeit" mit Gründen, Blocker mit Grund und
  Alter, Systemgesundheit (Datenstand, Sync-Workflow über die öffentliche Actions-API, Modus, fehlende
  Labels, KI-Läufe), gespeicherte Ansichten, Filter, Sortierung, Triage-Lücken, Tastatur (j/k/Enter/Esc),
  Dark Mode, responsive. Statischer Modus ist read-only und führt zu GitHub; Aktionsdialoge erscheinen
  nur, wenn `/api/capabilities` Aktionen meldet. `serve-dashboard.mjs` liefert `.mjs` als JavaScript.
- **Getestet:** Puppeteer-Screenshots aller Ansichten ohne JS-Fehler (`screenshots/neu-*.png`),
  Browser-Konsole geprüft; Modelltests grün.
- **Risiken/Annahmen:** Die Actions-API wird ohne Token abgefragt (öffentliches Repo, 60 Anfragen/Std.);
  bei Nichtverfügbarkeit wird das ehrlich als „nicht abrufbar" gezeigt. Keine KPIs, bewusst.
- **Nächste Stufe:** Inkrement 4 – lokaler Server mit validierten Statuswechseln.

## 2026-09-08 · Inkrement 4: Lokaler Aktions-Server

- **Geändert:** `scripts/dashboard-api.mjs` (neu) und `scripts/serve-dashboard.mjs`: `/api/capabilities`,
  `/api/sync`, `/api/activity`, `/api/agent-runs`, `/api/tasks/:n/activity|transition|assign|comment`.
  Übergänge werden **serverseitig** mit denselben Regeln wie im Browser geprüft (`requirementsFor`),
  Labels/Assignee/Kommentar/Schließen laufen über `gh` unter dem angemeldeten Konto, jeder Schreibvorgang
  erzeugt einen strukturierten Kommentar (`## Control Center: …`, Marker `tp-control-center`), ein lokales
  Audit-Log (`.router/control-center-audit.jsonl`, gitignored) und eine Neuerzeugung von `issues.json`.
  Schreibende Endpunkte: nur POST, nur JSON, nur lokaler Host/Origin, 64 KB. Server bindet 127.0.0.1.
  KI-Läufe der Steuerzentrale und das Provider-Ledger werden read-only gelesen.
- **Getestet:** 27 Tests grün (API mit Fake-gh: Ablehnung ohne Owner, Label-Übergangsregel, Freigabe
  entfernt Legacy-Marker, Erledigt nur mit Bestätigung, Origin-/Methoden-/Content-Type-Schutz).
  Manuell gegen das echte Repo: `capabilities` (angemeldet), `tasks/92/activity` (Events + Kommentare),
  `transition` ohne Owner → 400 mit Klartext. **Kein echter Schreibzugriff ausgeführt** (öffentliches Repo,
  Freigabe nötig); Dialog im Browser bis zur Validierung geprüft.
- **Risiken/Annahmen:** Ein Nutzer = das gh-Konto des Macs; Rollen darüber hinaus sind Stufe 2
  (`ARCHITEKTUR.md` Abschnitt 5). Die Steuerzentrale hat auf diesem Rechner keinen State-Ordner,
  deshalb „0 Läufe" – ehrlich angezeigt.
- **Nächste Stufe:** Inkrement 5 – Freigabe-Vorlage.

## 2026-09-08 · Inkrement 5: Freigabe-Workflow

- **Geändert:** Issue-Template `.github/ISSUE_TEMPLATE/entscheidung.yml` (Frage, Kontext, Optionen,
  Empfehlung, Auswirkungen, Entscheider, Frist), `setup-dashboard.sh` legt die neuen Labels an
  (`status:triage|bereit|freigabe|beobachten|abgebrochen`, `type:entscheidung`) – **nicht ausgeführt**.
  Freigaben-Ansicht mit Aktionen freigeben / ablehnen / Rückfrage / delegieren / später, die als
  Statuswechsel bzw. Kommentar protokolliert werden; Verlauf abgeschlossener Entscheidungen.
- **Getestet:** Parser-Tests für Entscheidungsvorlagen; Ansicht mit den drei echten Freigaben (#42, #41, #38).
- **Risiken/Annahmen:** Bis zur Label-Anlage werden Freigaben über die Übergangsregel erkannt.
- **Nächste Stufe:** Labels anlegen (Freigabe), GitHub Pages prüfen, dann Rollenmodell und erste
  read-only-Integration (Shopify) nach Sichtbarkeitsentscheidung.

## 2026-09-08 · Inbetriebnahme

- **Geändert:** PR #100 nach `main` gemergt. Labels `status:triage|bereit|freigabe|beobachten|abgebrochen`
  und `type:entscheidung` im Repository angelegt; #42, #41, #38 von der Übergangsregel auf `status:freigabe`
  umgestellt. `docs/.nojekyll` beendet den hängenden Jekyll-Build von GitHub Pages; Manifest auf das
  Control Center angepasst.
- **Getestet:** Workflow `dashboard-data` nach dem Merge: success, `issues.json` mit Schema 2 und allen
  Labels; Pages-Build: built; Live-URL liefert `index.html`, `app.js`, `lib/model.mjs` (JavaScript-MIME)
  und `issues.json`; Live-Screenshots ohne JS-Fehler (`screenshots/live-*.png`).
- **Offen:** Owner (Assignee) für die aktiven Aufgaben setzen – das ist eine fachliche Zuordnung, keine
  technische; Freigabe-Issues mit Optionen und Empfehlung nachtragen (Template „Entscheidung");
  Sichtbarkeitsentscheidung vor Kennzahlen-Integrationen.

## 2026-09-08 · Inkrement 6: Owner, Selbstaktualisierung, Task-Automation

- **Geändert:** Alle 24 offenen Aufgaben haben Ahmet (`kontakt755`) als Owner. Sync-Cron auf 30 Minuten
  (Events bleiben sofort). Neu: `.github/workflows/task-automation.yml` + `scripts/task-automation.mjs`
  (Eingang bei neuen Issues mit Typ/Bereich-Vorschlag, In Arbeit bei referenzierendem PR, Review bei Merge,
  Erledigt beim Schließen; jede Änderung als Kommentar mit Marker `tp-automation`, Bot-Ereignisse lösen
  keinen zweiten Lauf aus). Neu: `npm run task` (create/start/review/done/block/approve-request/comment/list)
  über dieselbe validierte Aktions-API; CLAUDE.md verpflichtet KI-Sessions dazu.
- **Getestet:** 33 Tests grün (Planung je Ereignis, Idempotenz, kein Zurücksetzen aus Review, Draft-PRs
  ignoriert, CLI-Argumente). Live: `npm run task -- list` zeigt 24 Aufgaben, `done 92` wird mit Klartext
  abgelehnt (Owner vorhanden, aber keine Bestätigung der Akzeptanzkriterien).
- **Risiken/Annahmen:** Automatik setzt nie Priorität, Owner oder schließt Issues; Typ/Bereich sind
  Vorschläge. Bei 30-Minuten-Cron ca. 600 Actions-Minuten/Monat (Free-Kontingent 2000).
- **Live-Nachweis:** PR #101 gemergt; `npm run task -- create` legte #102 an (Owner kontakt755, Eingang);
  Workflow `task-automation` lief für das Issue-Event und das PR-Event erfolgreich.

## 2026-09-08 · Freigaben entschieden und umgesetzt

- **Geändert:** `npm run task -- approve|reject` (Entscheidung protokolliert, Status → Bereit bzw. Abgebrochen).
  Freigaben #42 (Option 2), #41 (Option 1), #38 (Option 1+2) per CLI erteilt, umgesetzt und geschlossen;
  Folgeaufgabe #103. Shopify: 7 Sockelleisten aus der manuellen Kollektion Teppichboden entfernt, zwei
  ungenutzte Menüs gelöscht (Sicherung als Kommentar in #38). Merchant Center über Chrome geprüft.
- **Getestet:** 34 Tests grün; Read-back Kollektion 58 → 51, Menüliste ohne Alt-Menüs, Merchant Center
  225 = Shopify-Kanal 225, Suchen ohne Rollenware-Treffer.
- **Befund zur Vorlage:** Unterkategorien laufen über `custom.arten`, nicht `shopify.pile-type` – in #41
  korrigiert protokolliert.

## 2026-09-08 · #103 Teppichboden-Art mit Herstellerbeleg

- **Geändert (Shopify):** `custom.arten` = [Schlinge, Wolle] für Rubira, Nordica, Callista, Wovena; Beleg sind
  die Datenblätter der Hausmarke von A (TTD_WOOL-030-*.PDF, 01|2026) von Lieferant A. Datenblatt-Polhöhen decken sich mit den
  vorhandenen Florhöhen-Klassen. Vorgehen in der Memory-Notiz „Datenblätter von Lieferant A lesen" festgehalten.
- **Getestet:** Read-back der Metafelder; Rubira sofort in Schlinge + Wolle, restliche folgen mit der
  asynchronen Neuberechnung der automatischen Kollektionen.

## 2026-09-22 · Einkauf-Bereich (Bestellübersicht + Produktdaten-Status)

- **Geändert:** Neuer Tab „Einkauf" im Frontend (`docs/ai-dashboard/app.js`, `index.html`) mit drei
  Unteransichten: Bestellübersicht (offene Kundenbestellungen je Lieferant, Ampel, Kopier-Button für
  Bestelllisten, Muster getrennt), Produktdaten-Status (je Produktgruppe vollständig/offen, durchsuchbare
  und paginierte Liste offener Varianten mit Grund und nächstem Schritt) und eine kurze Hilfe-Seite.
  Neue lokale Endpunkte in `scripts/dashboard-api.mjs` (`einkaufBestellungen`, `einkaufProduktstatus`,
  `einkaufKlaerung`) und Routing in `scripts/serve-dashboard.mjs` (`/api/einkauf/*`, GET-only). Die
  Endpunkte lesen ausschließlich private Dateien unter `$TP_PRIVAT_DIR` (Standard
  `~/teppich-paradies-analyse`): `bestelluebersicht/orders.json` (über `operations/lib/bestelluebersicht.mjs`
  `aufbereiten()`), `einkauf-dryrun/plan.json` (serverseitig zusammengefasst und paginiert, ~11 MB/3.300
  Varianten), `einkauf-klaerung/klaerung.json`/`offen.json` (optional). Fehlende Dateien sind kein Fehler,
  nur ein leerer Zustand mit Hinweistext.
- **Getestet:** `npm run dashboard:test` (neue Fälle mit synthetischen Fixtures für alle drei Endpunkte,
  inkl. fehlender Dateien), `npm run control:center:test`, `npm test`. Manuell mit echten privaten Dateien
  gegen `npm run dashboard` bei 1366 px und 390 px geprüft (Screenshots unter
  `~/teppich-paradies-analyse/dashboard-einkauf/`, nicht im Repository); statischer Modus (GitHub Pages,
  kein `/api`) zeigt „Nur lokal im Betrieb verfügbar" ohne jeden Datenzugriff.
- **Offene Risiken/Annahmen:** „Vollständig" ist über drei Kernfelder definiert (Lieferant, Artikelnummer,
  Bestelleinheit); Farbnummer fließt nicht in die Kennzahl ein, erscheint aber als offenes Feld, wenn sie
  fehlt. `einkauf-klaerung/` ist beim Team noch nicht befüllt – Endpunkt liefert bewusst `verfuegbar:false`.
- **Nächste Stufe:** Sobald `einkauf-klaerung/klaerung.json`/`offen.json` regelmäßig exportiert werden, in
  der Produktdaten-Status-Ansicht ergänzen statt eines eigenen dritten Tabs.

## 2026-09-23 · Startbereich „Heute" mit Einkauf und Shop-Zahlen

- **Geändert:** `viewHeute()` in `docs/ai-dashboard/app.js` bekommt zwei neue, nur lokal befüllte Kacheln
  unter dem bestehenden Aufgaben-Teil: „Einkauf – heute zu tun" (Positionen zu bestellen, offene
  Musterbestellungen, Aufträge mit Problem aus der Ampel, ohne Großhändler-ID, sowie die Positionen je
  Schritt des Auftragsflusses Bestellt → Geliefert an uns → An Kunden raus → Erledigt sowie die konkreten
  Problem-Aufträge) und „Shop-Zahlen" (Bestellungen, Umsatz, Durchschnittsbon der letzten 7 und 30 Tage).
  Jede Kachel klickt in den zugehörigen Bereich (`#/einkauf`) durch. Neuer Endpunkt
  `einkaufKennzahlen()` in `scripts/dashboard-api.mjs`, geroutet über `/api/einkauf/kennzahlen`
  (GET-only) in `scripts/serve-dashboard.mjs`. Erwartetes Snapshot-Format:
  `kennzahlen/shop-snapshot.json` unter `$TP_PRIVAT_DIR` mit
  `{erstellt, zeitraeume: {"7": {bestellungen, umsatz, waehrung, durchschnitt}, "30": {...}}, topProdukte: [...]}`.
  Fehlt die Datei (noch kein Export eingerichtet), zeigt die Kachel den Hinweis samt Befehl statt
  erfundener Zahlen. Offene Inhaberentscheidungen (Freigaben/Review) waren bereits Teil von „Heute"
  (Band-Kachel „warten auf Freigabe", Abschnitt „Wartet auf dich") und wurden nicht verändert.
- **Getestet:** `npm run dashboard:test` (zwei neue Fälle für `einkaufKennzahlen`: fehlender Export mit
  Befehl, vorhandener Export mit Zahlen; ein neuer Server-Test für `/api/einkauf/kennzahlen` GET-only),
  `npm run control:center:test`, `npm test`. Manuell mit echten privaten Dateien gegen `npm run dashboard`
  bei 1366 px und 390 px per Puppeteer geprüft (Screenshots unter
  `~/teppich-paradies-analyse/dashboard-heute/`, nicht im Repository), Konsole ohne Fehler, Klick von der
  Einkauf-Kachel zu `#/einkauf` geprüft.
- **Offene Risiken/Annahmen:** `kennzahlen/shop-snapshot.json` wird noch von niemandem erzeugt – der
  Export selbst (`npm run kennzahlen:export`) ist nicht Teil dieser Änderung und muss noch gebaut werden.
  `einkauf-klaerung/offen.json` enthält in der Praxis ~17.000 Zeilen aus dem Produktdaten-Abgleich, nicht
  auftragsbezogene Klärungsfälle – deshalb bewusst nicht in „Heute" gezeigt, um keine irreführende Zahl
  anzuzeigen; das Format müsste erst geklärt werden, bevor es auf der Startseite erscheint.
- **Nächste Stufe:** Export-Skript für `kennzahlen/shop-snapshot.json` bauen (z. B. aus der Shopify Admin
  API, Analytics-Query), dann läuft die Shop-Zahlen-Kachel produktiv.

## 2026-09-23 · Automatische Datenaktualisierung

- **Geändert:** `operations/scripts/aktualisieren.mjs` (neu, `npm run daten:aktualisieren`, Teile
  lexikon/bestellungen/kennzahlen einzeln ausführbar über `--nur`, Fehler in einem Teil verhindert die
  anderen nicht, schreibt `$TP_PRIVAT_DIR/aktualisierung.json`); `operations/scripts/lexikon-export.mjs`
  und `kennzahlen-export.mjs` (`ladeLive` nutzt jetzt `operations/sync/zugang.mjs`, liest also `.env.local`
  statt nur `process.env` - Kennzahlen-`ladeLive` rief zuvor `fetchOrdersSince` ohne Proxy auf, das ist mit
  behoben); `scripts/dashboard-api.mjs` (`aktualisierung()`, liest die Statusdatei, rechnet Alter und
  24h-Schwelle); `scripts/serve-dashboard.mjs` (`/api/aktualisierung`); `docs/ai-dashboard/app.js`
  (`ensureAktualisierung()`, `aktualisierungHealth()` in der Kachel "Systemgesundheit" auf "Heute" und
  "Insights", nur im lokalen Modus).
- **Getestet:** `operations/tests/aktualisieren.test.mjs` (Teilausführung, Fehler in einem Teil ohne
  Auswirkung auf die anderen, alter Stand bleibt bei `--nur` erhalten, erster Lauf ohne vorhandene Datei);
  `docs/ai-dashboard/tests/api.test.mjs` (fehlende Datei, Alters-/Veraltet-Berechnung, fehlender Zeitpunkt
  wirft nicht); `npm run dashboard:test`, `npm run control:center:test`, `npm test`,
  `node --test operations/tests/*.test.mjs` - alle grün.
- **Risiken/Annahmen:** `--live` braucht `SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET` in
  `.env.local`; ohne Zugang bricht jeder Teil mit klarer Meldung ab, es werden keine Zahlen erfunden.
  "Letzte 50 Bestellungen" wird über ein 120-Tage-Fenster geholt und dann auf die 50 zuletzt
  aktualisierten gekürzt (kein direkter "letzte N"-Filter in der Admin API). Tägliche Automatisierung läuft
  über eine geplante Aufgabe in Claude Desktop auf einem eingeschalteten Rechner - kein Cloud-Cron; war der
  Rechner aus, bleibt der Stand einfach älter, sichtbar über die 24h-Warnung.
- **Nächste Stufe:** geplante Aufgabe tatsächlich anlegen (`~/.claude/scheduled-tasks/`) und einmal live
  gegen die Admin API laufen lassen, sobald ein Token vorliegt.

## 2026-09-23 · Design und Übersicht (#536)

- **Geändert:** `docs/ai-dashboard/index.html`, `app.js`, `app.css`; `operations/lib/kennzahlen.mjs`
  (neues Feld `kostenlos` je Zeitraum) samt Test.
  - Navigation nach Wichtigkeit: Heute · Einkauf · Arbeit · Lexikon, der Rest unter „Mehr" (trägt die
    Freigaben-Zahl mit). Datenstand-Chip nur noch „Stand HH:MM", Details im Tooltip.
  - Heute: Doppelungen entfernt (die Kundengeschäft-Zahlen standen zweimal), vier Zahlen zum Einkauf,
    darunter nur „Zuerst klären". Shop-Zahlen als kleine Tabelle; „Umsatz 0 €" wird erklärt (alle
    bezahlten Bestellungen waren kostenlose Muster – kein Datenfehler). Interne Kacheln mit 0 fallen
    weg. Systemgesundheit erscheint nur bei echten Warnungen; dauerhafte Hinweise (Ads/GA4 nicht
    angebunden) haben das Level `info` und zählen nicht mehr als Warnung.
  - Einkauf: Klartext statt Shopify-Rohwerten (`PAID`, `UNFULFILLED`, `UNGEKLAERT`), Aufträge zeigen nur
    Abweichungen. Muster-/Warengruppen ohne zugeordneten Lieferanten sind nur noch gelb markiert, wenn
    einem Artikel wirklich etwas fehlt. Tabellen von 9 auf 6 Spalten. Erledigte Artikel verschwinden aus
    der Standardansicht (Filter „Erledigt"). Neu: „Ohne Einkauf abschließen…" (Pflichtgrund) setzt die
    offenen Artikel eines Auftrags auf „Erledigt" – für Testbestellungen; Shopify bleibt unverändert.
    Aufträge, deren Artikel alle erledigt sind, zählen nicht mehr als offen oder als Problem.
  - Produktdaten: Standardliste „Braucht Handarbeit" (dieselbe Zahl wie die Kachel), 25 je Seite,
    Begründung im Tooltip; Seite wird von 23.000 auf rund 3.000 px kürzer.
  - Arbeit: Spalten ohne Unterschied (z. B. Owner bei nur einer Person) fallen weg; der Standardtext
    „Triage: Priorität, Owner …" wird ausgeblendet; Projekte mit ≥3 Aufgaben ohne Update seit 14 Tagen
    stehen eingeklappt als eine Zeile.
  - Freigaben: ohne hinterlegte Optionen ist „Rückfrage stellen" die Hauptaktion; Delegieren/Später
    unter „Mehr". Aktivität: Ereignisse je Person und Aufgabe innerhalb von drei Minuten gebündelt,
    Labels in Klartext. Lexikon: startet mit der Suche.
  - Behoben: Kopfzeile war am Handy breiter als der Bildschirm (seitliches Scrollen); „Heute" zeichnete
    nach dem Laden der Bestelldaten nicht neu; App-Manifest wurde im Netzmodus ohne Sitzungscookie
    angefragt (Konsolenfehler).
- **Getestet:** `npm run dashboard:test`, `node --test operations/tests/kennzahlen.test.mjs`, `npm test`;
  Puppeteer gegen eine lokale Instanz mit **Kopie** der privaten Daten (Desktop 1440 px, Handy 390 px,
  keine JS-Fehler, kein seitliches Scrollen); Klickstrecke: Auftrag ohne Einkauf abschließen
  (Problemzahl 2 → 1), Artikel als bestellt markieren mit Bestellnummer, Filter, Mehr-Menü,
  Freigabe-Aktionen, Projektgruppe aufklappen, Aufgaben-Detail, Lexikon-Suche, Produktdaten blättern
  und Filterwechsel.
- **Risiken/Annahmen:** „Ohne Einkauf abschließen" nutzt den bestehenden Auftragsfluss-Endpunkt
  (Status `erledigt` + Notiz); rückgängig über die Statusdatei, nicht über die Oberfläche. Das Feld
  `kostenlos` erscheint erst nach dem nächsten Kennzahlen-Export; bis dahin fällt die Erklärung auf den
  allgemeinen Satz zurück.
- **Nächste Stufe:** Rückmeldung aus dem Tagesbetrieb einholen (Einkauf zuerst).

## 2026-09-24 · Dashboard-Mitarbeiter: Skill, Agent und Sichtpruefung

- **Geändert:** `.claude/skills/control-center/SKILL.md` (Regeln, Gestaltung, Ablauf, Fallstricke aus
  #536–#555), `.claude/agents/control-center.md` (Subagent, arbeitet nach dem Skill),
  `scripts/dashboard-pruefen.mjs` + `npm run dashboard:pruefen` (eigene Instanz mit Kopie der privaten
  Daten und Wegwerf-Passwort, Screenshots aller Ansichten bei 1440/390 px, JS-Fehler, seitliches
  Scrollen mit Elementpfad, `--offen` für Klicktests). Behoben: aufklappbare Auftragsdetails im Einkauf
  liefen am Handy über den Rand (Tabelle ohne Scroll-Container, lange E-Mail-Adressen).
- **Getestet:** `npm run dashboard:pruefen` – vor dem Fix `FEHL handy einkauf` (Überstand bis 1015 px in
  `details.order-details`), danach alle 14 Prüfungen `OK`; `--offen` hält die Instanz (HTTP 200) und
  räumt ohne `--offen` Instanz und Datenkopie auf; `npm run dashboard:test`, `npm test`.
- **Risiken/Annahmen:** Grundsätze aus den öffentlichen Anthropic-Skills `frontend-design` und
  `webapp-testing` sinngemäß übernommen und auf den Betrieb zugeschnitten, kein Text kopiert.
- **Nächste Stufe:** Ideenliste im Skill mit dem Inhaber priorisieren und über den Agenten umsetzen.

## 2026-09-24 · Einkauf: Wieder öffnen, Wartezeit, Sammelaktion; Heute: „Seit gestern neu" (#561)

- **Geändert:** `docs/ai-dashboard/app.js`, `app.css`; `operations/lib/auftragsstatus.mjs`
  (`oeffneWieder()`, `statusVorErledigt()`); `scripts/dashboard-api.mjs` (POST
  `/api/einkauf/auftragsstatus` mit `aktion: "wiederOeffnen"`); `scripts/dashboard-pruefen.mjs`.
  - **Wieder öffnen:** Im Filter „Erledigt" hat jeder erledigte Artikel „Wieder öffnen…", darüber
    listet „Abgeschlossene Aufträge" jeden Auftrag mit erledigten Artikeln (auch Testbestellungen)
    samt wer/wann/Grund. Rückfrage-Dialog zeigt, wohin jeder Artikel zurückfällt: auf den letzten
    Schritt vor „Erledigt" (z. B. „An Kunden raus"), nach „Ohne Einkauf abschließen" auf „Noch nicht
    bestellt". Der Abschluss wird nicht gelöscht, sondern wandert mit Zeit, Person, Grund und
    optionaler Notiz in `verlauf` der Position; zusätzlich Audit-Zeile
    `auftragsstatus-wieder-geoeffnet` und ein Eintrag „Auftragsstatus wieder geöffnet" im
    Aktivitätsprotokoll (angemeldeter Benutzer). Die Zelle zeigt danach „wieder geöffnet … · @name".
  - **Wartezeit:** Bei „Bestellt" und „Geliefert an uns" steht „seit N Tagen" (aus
    `bestelltAm`/`geliefertAm`), ab 7 Tagen bernsteinfarben, ab 14 rot. Auf „Heute" erscheint die
    Kachel „seit 7 Tagen oder länger bestellt" nur, wenn die Zahl > 0 ist (Klick → Filter „Bestellt").
  - **Sammelaktion:** Lieferanten-Gruppen mit mindestens zwei sichtbaren, noch nicht bestellten
    Artikeln haben „Alle als bestellt markieren…" – Dialog mit Artikelliste, Hinweis auf fehlende
    Angaben und einer optionalen Lieferanten-Bestellnummer für alle; Rückmeldung
    „N Artikel als bestellt markiert".
  - **Heute – Seit gestern neu:** Kundenaufträge der letzten 24 Stunden (Auftragsdatum, ohne Test-
    und stornierte Bestellungen), Probleme darin rot markiert mit dem ersten Hinweis. Ohne neue
    Aufträge nur der Halbsatz „Seit gestern keine neuen Aufträge" in der Stand-Zeile.
  - Behoben: „Ohne Einkauf abschließen…" bei Testbestellungen tat nichts (Auftrag wurde nur unter
    den Kundenaufträgen gesucht). `dashboard:pruefen` blieb nach dem Bericht hängen (Server-Kind
    hielt die Ereignisschleife offen, Instanz und Datenkopie blieben liegen) – räumt jetzt selbst auf.
    `docs/ai-dashboard/tests/api.test.mjs` lädt jetzt zuerst `_testumgebung.mjs`: ohne das schrieben
    die API-Tests über `merke()` Testeinträge in das echte `protokoll.jsonl` unter `$TP_PRIVAT_DIR`.
- **Getestet:** `operations/tests/auftragsstatus.test.mjs` (+4: zurück auf „noch nicht bestellt"
  mit Verlauf, zurück auf letzten Schritt mit erhaltenem Bestelldatum, Ablehnung nicht erledigter
  Positionen, Zeitstempel nach Abschluss ignoriert), `docs/ai-dashboard/tests/api.test.mjs` (+1:
  wiederOeffnen über die API inkl. Audit, unbekannte Aktion → 400); `npm run dashboard:test` (99),
  `npm test` (alle Teilläufe grün); `npm run dashboard:pruefen` 14× `OK`. Klickstrecke gegen die
  Datenkopie (Puppeteer): Sammelaktion Muster-Gruppe „Noch zu bestellen 6 → 0, Bestellt 0 → 6",
  6 Einträge mit gemeinsamer Bestellnummer; Wartezeit nach Zurückdatieren in der Kopie „seit 15
  Tagen" rot, „seit 8 Tagen" bernstein, „seit 3 Tagen" neutral, Heute-Kachel 2; Testbestellung
  ohne Einkauf abgeschlossen (3 Artikel) → „Abgeschlossene Aufträge" 1 → wieder geöffnet → 0,
  Verlauf mit wer/wann/Grund/Notiz; ein Artikel über den Ablauf auf „Erledigt" → wieder geöffnet →
  „An Kunden raus" (Erledigt 1 → 0, Unterwegs 0 → 1); „Seit gestern neu" mit 1 Auftrag, nach
  Zurückdatieren in der Kopie die ruhige Zeile; Esc schließt den Dialog; Handy 390 px ohne
  Überstand; keine JS-Fehler.
- **Risiken/Annahmen:** Das echte `protokoll.jsonl` enthält bereits Testeinträge aus früheren
  Läufen (Benutzer „tobias", „Issue #41", „Order/1") – nicht angefasst, bitte einmal von Hand
  bereinigen. „Neu aufgetretene Probleme" = Probleme in den neuen Aufträgen; ältere
  Aufträge, die erst jetzt rot werden, erkennt die Liste nicht (kein gespeicherter Vortagesstand).
  Die Chip-Zahl „Erledigt" zählt wie bisher nur Artikel der Lieferanten-Gruppen; abgeschlossene
  Testbestellungen stehen nur in der Auftragsliste darüber. Sammelaktion schreibt Artikel
  nacheinander (je ein Request); bricht einer ab, meldet der Hinweis „nur N von M".
- **Nächste Stufe:** Vortagesstand der Ampeln sichern, damit „Seit gestern neu" auch neu rot
  gewordene ältere Aufträge zeigt; Einkauf-Suche nach Auftrag/Kunde.

## 2026-10-01 · Oberfläche in Module zerlegt (reiner Umbau)

- **Geändert:** `docs/ai-dashboard/app.js` (5100 Zeilen) ist jetzt der Einstieg in 44 ES-Module:
  `kern/` (9), `bausteine/` (7), `ansichten/` (26, davon 11 Teilmodule für Einkauf, Kunden und
  Aufgaben), `ereignisse.mjs`, `app.js`. Kein Build-Schritt, keine neue Abhängigkeit. Jede
  Top-Level-Anweisung des Monolithen steht unverändert in genau einem Modul; dazu kamen nur
  `import`/`export`. Vorab in einem eigenen Commit: `bindEvents()` ruft je Ansicht eine Funktion
  (`…Klick(e)`, `…Aenderung(e)`) in der bisherigen Reihenfolge auf, die Zwischenspeicher der
  Ansicht „Aktivität" werden an einer Stelle beschrieben, `render()` bekommt die Ansichten über
  `registriereAnsichten()`. `geldText`, `fmtPreis`, `NICHT_HINTERLEGT` liegen in `kern/helfer.mjs`.
  Server unverändert (liefert schon jede Datei unter `docs/ai-dashboard/` mit `no-store`).
  Neu: `tests/aufbau.test.mjs`; `tests/routen.test.mjs` liest alle Moduldateien;
  `tests/server.test.mjs` hält MIME-Typ und `no-store` je Modul fest. README, `ARCHITEKTUR.md`
  (Abschnitt 12) und Skill `control-center` nachgezogen.
- **Getestet:** `npm run dashboard:test` 152 grün (vorher 146, +6 neue), `npm run operations:test`
  399 grün (wie vorher), `npm run dashboard:pruefen` 38× `OK` (wie vorher), Seitenhöhe aller 38
  Ansichten identisch zum Stand davor. Zusätzlich DOM-Vergleich alter gegen neuer Stand, je mit
  eigener Datenkopie und angehaltener Browser-Uhr: 35 Adressen und 13 Klickstrecken (Palette,
  Aufgaben-Panel, Dialoge, Filter, Suche, Tastatur, Mengenhilfe, Foto-Formular, Auftragsfluss
  setzen, Aufgabe kommentieren/ändern/erledigen, Fall markieren) auf Desktop und Handy – 354
  Vergleiche, 353 gleich; die eine Abweichung ist die Minutenangabe „Stand der Bestellungen"
  (Dateizeit der zweiten Datenkopie). Namensprüfung der Module mit TypeScript (`checkJs`): kein
  ungebundener Name, kein fehlender Export.
- **Risiken/Annahmen:** Ein vergessener Import fällt nicht beim Laden auf, sondern erst, wenn die
  Stelle läuft. Im Vergleich nicht ausgelöst, weil die Datenkopie kein passendes Element hatte:
  „Wieder öffnen" im Einkauf, Rückruf-Dialog, Passwort eines Zugangs setzen, ruhendes Projekt
  aufklappen, „Filter zurücksetzen" bei Aufgaben, Kanban-Drag-and-drop, Auftragsfluss aus dem
  Reiter Kunden/Bestellungen, Foto-Upload, Schnellerfassung absenden. Statt einer Anfrage lädt der
  Browser rund 50 kleine Dateien.
- **Nächste Stufe:** `no-undef`-Prüfung als Test (braucht einen Parser als Entwicklungsabhängigkeit –
  Entscheidung offen); bei spürbarer Ladezeit am Handy `modulepreload`; die Tabelle der Seitentitel
  aus `kern/render.mjs` an die Ansichten geben, damit eine neue Ansicht eine Datei weniger anfasst.

## 2026-10-01 · Einkauf je Lieferant: Karten, Bestellmail-Dialog, Lieferant-Detail

- **Geändert:** Reiter „Bestellungen" zeigt eine Karte je Lieferant statt einer Tabelle je Position
  (`ansichten/einkauf/lieferanten.mjs`, `lib/einkauf-lieferanten.mjs`, `stile/einkauf-lieferanten.css`):
  Zahlen, Überfällig-Hinweis (gelb ab 7, rot ab 14 Tagen), ein Hauptknopf je Bestellweg, „Muster
  bestellen", Positionen aufklappbar mit den bisherigen Tabellen. Bestellmail-Dialog mit Text aus
  `/api/einkauf/bestellmail`, `mailto`, „Text kopieren", Liste „Nicht in der Mail" und der Frage „Als
  bestellt markieren?". Neue Detailseite `#/einkauf?lieferant=A`. Sammelaktion als
  `markiereAlsBestellt()` herausgezogen; Rolle „lesen" sieht keine Statusknöpfe mehr. Hilfe und
  Einkauf-Anleitung angepasst.
- **Getestet:** `npm run dashboard:test` (neu: `tests/einkauf-lieferanten.test.mjs`, 10 Tests),
  `npm run operations:test`, `npm run dashboard:pruefen`. Klickstrecke gegen eine Wegwerf-Instanz mit
  erfundenen Daten: Bestellmail öffnen → Frage erscheint → markieren: „Artikel noch zu bestellen"
  20 → 19, Karte 1 zu bestellen/1 bestellt → 2 bestellt, Bestellnummer im Verlauf. Screenshots
  1440/390/360 px hell und dunkel; Inhalt ohne seitliches Scrollen.
- **Risiken/Annahmen:** Die Kopfzeile ist mit angemeldetem Namen breiter als der Bildschirm (schon
  vorher, gehört zum Navigations-Umbau). Der Verlauf kennt nur, was der Auftragsfluss speichert
  (bestellt/geliefert/raus/erledigt) – kein „nachgehakt". Echte Stammdaten fehlen noch; ohne sie
  heißt der Knopf „Bestellliste öffnen".
- **Nächste Stufe:** Nachhak-Mail vom Server (Text + `mailto`), „Nachgehakt" als Zeitstempel mit
  drei Tagen Ruhe; Filter „Überfällig".
## 2026-10-01 · Zeitleiste je Auftrag mit genau einem nächsten Schritt

- **Geändert:** Neues Modul `operations/lib/auftragsverlauf.mjs`: Musterstrecke (angefragt → beim
  Lieferanten bestellt → bei uns angekommen → gelabelt und an Kunden verschickt → Kunde hat Muster →
  nachgefasst → Ergebnis) und Warenstrecke auf den bestehenden Positionswerten; Ereignisse je Auftrag
  in `auftragsverlauf.json` (privat, nur anhängen, in der Sicherung). Automatisch erkannt und so
  gekennzeichnet: Bestelleingang, Shopify-Versand, Zustellung, spätere Bestellung desselben Kunden.
  `naechsterSchritt` und `verlauf` additiv in `/api/kunden/detail`, `/api/kunden/bestellungen`,
  `/api/kunden/suche`; Schreiben über `POST /api/einkauf/auftragsstatus` mit `aktion: "schritt"`.
  Oberfläche: `ansichten/kunden/zeitleiste.mjs` (Karte „Nächster Schritt“, Verlauf, „Worum es geht“,
  Anrufen/E-Mail) in Kundenakte und Bestelldetail, Gestaltung in `stile/zeitleiste.css`.
- **Getestet:** `npm run dashboard:test`, `npm run operations:test`, `npm run dashboard:pruefen` grün;
  Klickstrecke gegen eine Wegwerf-Instanz mit erfundenen Daten bei 1440/390/360 px (Nachgefasst →
  „Kunde überlegt“, Ergebnis „kein Interesse“ → Kunde „Fertig“; Rolle „lesen“: keine Knöpfe, POST 403).
- **Risiken/Annahmen:** Zustelldatum = letzte Aktualisierung der Sendung (Shopify-Export führt kein
  eigenes Zustelldatum). Versandte Bestellungen ohne Auftragsstatus zeigen nach 7 Tagen „abschließen“.
  Die alten Knöpfe je Bestellung (Bestellt/Geliefert/Raus, „Kunde fertig“) bleiben vorerst daneben.
- **Nächste Stufe:** „Heute“ nutzt `naechsterSchritt`; Erinnerungen ruhen nach dem Nachfassen;
  Lieferzeit je Lieferant statt fester 7/14 Tage.
## 2026-10-01 · Navigation, Layout und Handy (Paket 1 des Konzepts)

- **Geändert:** Gerüst in `index.html`: Seitenleiste links (Heute, Kunden & Aufträge, Einkauf, Lexikon;
  „Seltener“: Aufgaben, Fotos, Shop-Wache, Sammelpunkt „Büro“ mit den Inhaber-Ansichten, Hilfe) statt
  Kopfzeilen-Navigation; Kopfzeile nur noch Seitentitel, Suche, „+ Erfassen“, Sitzung, Hell/Dunkel. Bis
  860 px feste Leiste unten (Heute, Aufträge, Lexikon, Einkauf, Mehr), „Mehr“ öffnet die übrigen Punkte
  als Blatt samt Datenstand und Abmelden. Neu `kern/navigation.mjs` (Markierung, Zähler, Seitentitel,
  „Mehr“); Routen, `ANSICHT_ROLLEN`, `darfAnsicht` und `data-nur-inhaber` unverändert. Hell/Dunkel folgt
  ohne eigene Wahl dem Gerät (`prefers-color-scheme`, auch beim Umschalten des Geräts), die Wahl am Knopf
  bleibt je Browser gespeichert. `app.css`: Safe-Area (`viewport-fit=cover`, `env(safe-area-inset-*)`),
  `100dvh`, keine Schrift unter 12 px, Tippflächen 44 px auch für Textlinks, Tabellen unter 1100 px als
  zweispaltige Karten, Reiter im Raster statt seitlich abgeschnitten, Kennzahlen am Handy zweispaltig und
  flach, Dialoge von unten; Verläufe, Einblend-Animation und dunkle Markenleiste entfernt. Lexikon:
  Treffer als Karten, Produktkarte mit Preis, Eckdaten und Farben oben, Bestellangaben am Handy als
  kompakte Liste je Farbe (die ersten sechs offen). `scripts/dashboard-pruefen.mjs` misst zusätzlich 360,
  800 und 1024 px, schlägt bei `scrollWidth > clientWidth` fehl und wartet nicht mehr auf `networkidle0`.
- **Getestet:** `npm run dashboard:test` (162), `npm run operations:test` (438), `npm run dashboard:pruefen`:
  19 Ansichten × 5 Breiten, 0 px Überlauf, keine JS-Fehler. Gegenprobe mit künstlich zu breiter Seite:
  Prüfung meldet FEHL. Klickstrecke gegen die Datenkopie bei 360 px (Mehr-Blatt, Esc, Thema merken,
  Palette, Erfassen-Dialog, Lexikon Suche → Karte → Produkt) und 1440 px dunkel.
- **Risiken/Annahmen:** Die Rollenbreite im Lexikon wird bei Werten bis 20 als Meter gelesen (stand vorher
  als „4.0 cm“ da). Lange Ansichten bleiben lang, wo der Inhalt es ist (Ratgeber, Hilfe, Entwicklung);
  Kopf-Knöpfe auf „Heute“ und die Fall-Karten gehören den Paketen 2 und 6. Nicht auf einem echten iPhone
  als Home-Bildschirm-App geprüft (Safe-Area nur nach Regelwerk).
- **Nächste Stufe:** Heute neu (Paket 2), Einkauf als Lieferanten-Karten (Paket 3), Zeitleiste (Paket 6).

## 2026-10-01 · „Heute" neu: To-dos zuerst

- **Geändert:** Startseite neu aufgebaut (`ansichten/heute.mjs`, Styles in der neuen `stile/heute.css`):
  „N offene To-dos für dich" mit je einem Knopf, Sprungfelder „offen im Laden / bei Website" (Inhaber),
  „Wer wartet auf was" in drei Spalten, vier Kennzahlen aus dem vorhandenen Shop-Export, Suchfeld
  „Produkt nachschlagen" (springt ins Lexikon). Ableitung als reine Funktionen in `lib/todos.mjs`.
  Bisherige Blöcke eingeklappt am Ende (`ansichten/heute/bisher.mjs`). Server: `orgListe` kennt
  `bereich=alle-aufgaben` und liefert `technisch` je Eintrag; der Datenstand ignoriert einen Fehlversuch,
  der älter ist als der letzte Erfolg derselben Quelle. Hinweis am Knopf „Jetzt aktualisieren" sagt jetzt,
  was zu tun ist.
- **Getestet:** `npm run dashboard:test` (187), `npm run operations:test` (438), `npm run dashboard:pruefen`
  (alle Ansichten OK); Sichtprüfung mit erfundenen Testdaten bei 1440/390/360 px, hell und dunkel, als
  Inhaber, Verkäufer und Website-Mitarbeiter; Klickstrecke gegen die Kopie (Sprungfeld, Spaltenwahl,
  Suche → Lexikon, Freigabe öffnet das Panel, „Nachhaken" → Einkauf mit aufgeklappter Karte des Lieferanten).
- **Risiken/Annahmen:** Fristen je To-do-Art (3/7, 2/7, 7/14 Tage) sind eine erste Setzung in
  `FRISTEN`. „Website"-Sicht ergibt sich aus den zugewiesenen Aufgaben – wer keine hat, sieht „Laden".
  „Bestellen" und „Nachhaken" öffnen die Karte des Lieferanten im Einkauf (`?lf=`), die Mail entsteht
  dort. Kennzahlen ohne Verlaufslinie, weil der Export keinen Wochenverlauf enthält.
- **Nächste Stufe:** Zeilen in „Wer wartet auf was" auf die Auftrags-Zeitleiste zeigen lassen, sobald
  sie gemergt ist; Zähler an „Heute" in der Navigation.


## 2026-10-01 · Zurück auf offen, Muster „haben wir da“

- **Geändert:** Positionen lassen sich von jedem Schritt zurück auf „Noch zu bestellen“ setzen
  (`setzeZurueckAufOffen`, Protokoll im `verlauf` der Position): Knopf „Zurück auf offen…“ je Artikel und
  „Alle zurück auf offen…“ je Tabelle und je Lieferantenkarte (in „Positionen bearbeiten“), im Bestelldetail
  unter „Etwas anderes ist passiert …“, und „Rückgängig“ direkt nach „Als bestellt markieren“ im Bestellmail-
  Dialog (der Dialog bleibt dafür offen). Neu `operations/lib/musterherkunft.mjs`: je Musterbestellung oder
  -position „Beim Lieferanten bestellen“ / „Aus eigenem Bestand – verschicken“ / „– persönlich vorbeibringen“
  (privat, nur anhängen). Solche Muster fehlen in der Bestellmail, in „Muster noch zu bestellen“ und im To-do
  „bestellen“; stattdessen To-do „Muster vorbeibringen bei …“ / „Muster verschicken an …“ mit Ort und Knopf
  „Erledigt – Kunde hat Muster“. Zeitleiste ohne Lieferanten-Schritte, „Persönlich übergeben“ statt
  „verschickt“. Rolle „lesen“ sieht keinen der neuen Knöpfe. `dashboard:pruefen` kopiert die neue Datei.
- **Getestet:** siehe PR (Testzahlen, Klickstrecke gegen die Kopie, Screenshots 1440/390 px).
- **Risiken/Annahmen:** „Rückgängig“ im Bestellmail-Dialog fragt nicht nochmal nach (es nimmt nur den
  gerade gesetzten Schritt zurück). Gemischte Musterbestellungen (teils Lieferant, teils eigen) laufen in der
  Zeitleiste weiter über die Lieferantenstrecke; die eigenen Muster erscheinen dann als To-do.
- **Nächste Stufe:** Kartenansicht/Entfernung für „Kunde in der Nähe“, falls die Stadt allein nicht reicht.

## 2026-10-08 · Link zur Werkbank Shop & Technik

- **Geändert:** Neuer Punkt „Werkbank“ in der Seitenleiste unter „Seltener“ (am Handy im „Mehr“-Blatt),
  direkt nach „Aufgaben“. Die Werkbank ist das gemeinsame Board von Inhaber und Shop-/Technik-Mitarbeiter
  (Ideen, Aufgaben, Fragen, Erledigtes) und liegt als privates claude.ai-Artefakt außerhalb des Control
  Centers. Deshalb öffnet der Link in einem neuen Tab (kleiner Pfeil statt Zähler) und trägt kein `data-nav`.
  Neues Attribut `data-nicht-lesen` blendet ihn für die Rolle „lesen“ aus; Inhaber und Mitarbeiter sehen ihn.
- **Getestet:** `npm run dashboard:test` 200/200, `npm test` grün. `dashboard:pruefen`: 19 Ansichten auf
  1440, 1024, 800, 390 und 360 px ohne seitliches Scrollen. Einziger Fehler ist ein 404 im Ratgeber bei
  1440 px, der schon vor der Änderung auftrat. Klickprüfung gegen die Kopie bei 390 px: Link im „Mehr“-Blatt
  sichtbar, 48 px hoch, `target=_blank`, `rel=noopener`; mit `rolle-lesen` `display: none`, mit
  `rolle-mitarbeiter` sichtbar.
- **Risiken/Annahmen:** Wer kein Claude-Konto mit Zugriff auf die Werkbank hat, landet bei Claude auf
  „kein Zugriff“. Die Freigabe erfolgt im Teilen-Menü der Werkbank, nicht hier.
- **Nächste Stufe:** Falls gewünscht, offene Fragen an den Inhaber aus der Werkbank als Zähler an den Link
  hängen (bräuchte einen lesenden Abruf über den Server).

## 2026-10-10 · „Muster nachfassen" auf „Heute"

- **Geändert:** Inhaberentscheidung vom 10.10. (Werkbank w-035): der Verkauf im Laden fasst Musterkunden
  nach. Neue Karte „Muster nachfassen" auf „Heute" (Sichten Laden und Alles) mit Kunde, Bestellnummer,
  Bestelldatum, Versand, Mustern je Produkt, Kontaktweg, Textvorschlag (aufklappbar, kopierbar, als
  `mailto:` vorbefüllt) und dem Knopf „Erledigt – nachgefasst". Der Knopf ist der vorhandene
  Zeitleisten-Schritt `nachgefasst` und hält wer und wann fest; Erledigtes bleibt eine Woche mit wer/wann
  sichtbar. Regeln (erste Nachfrage ab 4 Tagen nach Versand, eine Erinnerung nach 10 Tagen, nicht
  länger als 30 Tage) in `lib/muster-nachfassen.mjs`. Neuer lesender Endpunkt `/api/kunden/muster-texte`
  liest die Vorlage `muster-nachfassen-texte.md` aus dem Privatordner; `dashboard:pruefen` kopiert sie mit.
  Die offenen Kunden zählen bei „N offene To-dos" mit; „Alles erledigt" erscheint nicht, solange welche offen sind.
- **Getestet:** siehe PR (Testzahlen, Sichtprüfung 1440–360 px hell und dunkel, Klickstrecke gegen die Kopie).
- **Risiken/Annahmen:** Die Kundenakte rechnet „Nachfassen" weiter 5 Tage nach „Kunde hat Muster" und bietet
  dort „Kunden anrufen" an; die Karte folgt dem Konzept des Inhabers (E-Mail ab 4 Tagen nach Versand, Anruf
  nur bei Rückrufwunsch). Die Anrede (Herr/Frau) steht nicht in den Bestelldaten – der Text sagt
  „Guten Tag Vorname Nachname". Ein Link zum eigentlichen Produkt fehlt, weil Muster eigene Produkte sind.
  Die geplante Aufgabe „musterkunden-liste-montag" wird für die Karte nicht gebraucht (sie rechnet aus den
  Bestelldaten des Control Centers).
- **Nächste Stufe:** Zeitpunkt in Kundenakte und Karte angleichen, sobald der Inhaber die Regel bestätigt;
  Produktlink über die Musterzuordnung des Lexikons (`original.produktHandle`).
## 2026-10-08 · Sonderposten: „Im Laden verkauft“ (Teil von #978)

- **Geändert:** Neue Ansicht „Sonderposten“ (`#/sonderposten`, Seitenleiste unter „Seltener“ nach „Fotos“,
  am Handy im „Mehr“-Blatt). Sie zeigt Reststücke und Einzelstücke live aus Shopify (`productType`
  „Sonderposten“, ohne Archiv und ohne die Vorlage SP-0000/„VORLAGE …“) mit Foto, SKU, Titel, Maßen
  („4,00 × 2,35 m · 9,40 m²“), Zustand, Farbe, Lagerort, Preis und Status. Suchfeld für die SP-Nummer vom
  Etikett („SP-0042“, „sp 42“ und „42“ treffen dasselbe Stück). Verfügbare Stücke oben, darunter
  „Nicht mehr verfügbar“ mit „verkauft am … von … (im Laden)“. Einzige Hauptaktion: „Im Laden verkauft…“,
  nur bei Bestand 1 und nicht für die Rolle „lesen“; der Dialog zeigt Foto, Titel, SKU, Preis.
  Server: `GET /api/sonderposten/liste`, `POST /api/sonderposten/verkauft` (in der write-Liste:
  „lesen“ 403, „mitarbeiter“/„inhaber“ 200). Die Buchung liest das Produkt neu, bucht nur bei Bestand 1,
  setzt ihn per `inventorySetQuantities` mit `changeFromQuantity: 1` und `@idempotent` auf 0, schreibt erst
  danach `sonderposten.verkauft_am/_von/_kanal` (Name aus der Sitzung), protokolliert
  („sonderposten-im-laden-verkauft“) und liest zur Gegenprobe erneut. Logik in
  `operations/lib/sonderposten.mjs`. `write_inventory` steht jetzt in der Bereichszeile
  (`operations/README.md`, `app-einrichten.sh`) und als `SCHREIB_BEREICHE` in `sync/zugang.mjs`;
  `operations:verbindung` listet fehlende Schreibrechte getrennt. Servertests blenden den echten Zugang
  aus (`_testumgebung.mjs`).
- **Getestet:** `npm run dashboard:test` 207/207, `npm test` 1765/1765 (7 Suiten, nach Rebase auf main). Neu: 11 Tests in
  `operations/tests/sonderposten.test.mjs`, 7 in `tests/sonderposten-api.test.mjs` (Bestand 1 → Buchung,
  Felder, Protokoll, Gegenprobe; Bestand 0 → 409, nur ein Lesezugriff; ACCESS_DENIED → Klartext, keine
  Felder, kein Protokoll; über den Server „lesen“ 403 ohne Shopify-Aufruf, „mitarbeiter“ 200, zweiter
  Klick 409, „inhaber“ 200, GET 405), 1 in `zugang.test.mjs`. `dashboard:pruefen`: 20 Ansichten × 5
  Breiten = 100 × OK, 0 px Überlauf. Klickstrecke gegen die Kopie bei 390 und 1440 px mit vorgetäuschten
  Shopify-Antworten: Abbrechen/Esc → 0 Buchungen; „Recht fehlt“ → Meldung im Dialog; 409 → „bereits
  verkauft“; Erfolg → Rückmeldung „Als im Laden verkauft gebucht – online nicht mehr bestellbar“, Knöpfe
  1 → 0, Status „verkauft am … von … (im Laden)“; Suche „17“ → 1 Treffer. Echter Lesetest gegen Shopify:
  1 Sonderposten (Testprodukt SP-TEST-0001, Bestand 0), Vorlage ausgefiltert, 0,7 s. **Kein echter
  Schreibtest.**
- **Risiken/Annahmen:** Der Zugang des Dashboards hat heute kein `write_inventory` – bis der Inhaber es
  freischaltet, meldet der Knopf genau das und schreibt nichts (Rückfallweg: Bestand in der Shopify-App auf
  0). Shopify hat `compareQuantity` in API 2026-07 durch `changeFromQuantity` ersetzt; die Prüfung gegen
  das echte Schema (nur lesend) bestätigt das Feld. Scheitern nach gebuchtem Bestand nur die
  Verkaufsfelder, bleibt das Stück verkauft und der Dialog sagt, was fehlt.
- **Nächste Stufe:** Nach der Freischaltung einmal mit dem Testprodukt (Bestand vorher auf 1) durchbuchen;
  danach Archivieren nach 30 Tagen und optional der SumUp-Abgleich (Konzept Abschnitt 6, Weg C).

## 2026-10-10 · Sonderposten: Überverkauf und Antwortverlust (Review-Befunde vom 09.10.)

- **Geändert:** Buchen nur noch bei gesperrtem Überverkauf (`inventoryPolicy: DENY`); sonst 409 mit
  Handlungshinweis, kein Knopf in der Liste und der Status „„Verkauf bei Nichtverfügbarkeit fortsetzen“ ist
  an – in Shopify ausschalten“. Die Gegenprobe meldet `ok` nur bei Bestand 0 **und** gesperrtem Onlinekauf
  (`onlineGesperrt`). Antwortverlust bei der Bestandsmutation: erneutes Lesen entscheidet (0 = gebucht,
  1 = nicht angekommen, sonst „unklar“ mit Protokolleintrag). Scheitert nur die Gegenprobe nach der Buchung,
  antwortet der Server 200 mit `gegenprobe: "fehlgeschlagen"` statt eines Fehlers. Die Rückmeldung im
  Dialog kommt aus `lib/sonderposten.mjs`: ohne Antwort vom Dashboard „unklar, Liste neu laden“ statt
  „Es wurde nichts gebucht“.
- **Getestet:** 7 neue Tests in `operations/tests/sonderposten.test.mjs` (CONTINUE und fehlende Policy,
  Policy nach der Buchung geändert, Antwort nach/vor der Buchung verloren, Lesen danach gescheitert,
  Gegenprobe gescheitert, erstes Lesen gescheitert), neue `tests/sonderposten-meldung.test.mjs` (jede
  Rückmeldung; keine Negativbestätigung ohne Beleg) und Servertests für „unklar“ samt Protokoll und für die
  gescheiterte Gegenprobe. `npm run dashboard:test` 217/217, `npm test` 1782/1782 (7 Suiten).
  `dashboard:pruefen` 20 Ansichten × 5 Breiten = 100 × OK, 0 px Überlauf. Klickstrecke gegen die Kopie bei
  390 und 1440 px mit vorgetäuschten Antworten: Stück mit erlaubtem Überverkauf ohne Knopf und mit Hinweis;
  abgebrochene Verbindung → „unklar, Liste neu laden“; 504 „unklar“ → Servertext; 200 mit gescheiterter
  Gegenprobe → „angenommen, bitte prüfen“; Erfolg → Toast; 4 Anfragen, 0 JS-Fehler.
- **Risiken/Annahmen:** Bleibt eine Mutation in Shopify länger hängen als das erneute Lesen, meldet der
  Server „nicht angekommen“; ein zweiter Klick bucht wegen `changeFromQuantity: 1` trotzdem nie doppelt.
  Weiterhin kein echter Schreibtest (fehlendes `write_inventory`).
- **Nächste Stufe:** unverändert – nach der Freischaltung einmal mit dem Testprodukt durchbuchen.

## 2026-10-11 · Kachel „Laden“ auf „Heute“

- **Geändert:** Neue Kachel „Laden“ auf „Heute“ (Sichten Laden und Alles, nicht Website) mit den Zahlen aus dem
  Laden-Modus der Auftrags-App: offene Beratungen (davon neu), fällige Wiedervorlagen (Bernstein, wenn > 0),
  Angebote offen (davon zum Nachfassen), Fälle aus dem Shop der letzten 7 Tage, gewonnen und verloren der
  letzten 30 Tage, dazu der Link „Laden-Ansicht öffnen“ (neuer Tab). Neuer lesender Endpunkt
  `/api/laden/zahlen`: der Server ruft `<App-URL>?ansicht=zahlen&s=<Schlüssel>` ab (Weiterleitung folgen,
  15 s Zeitlimit, Erfolg 5 Minuten, Fehlschlag 1 Minute gemerkt) und reicht nur die bekannten Zahlenfelder
  durch (`scripts/laden-zahlen.mjs`). URL und Schlüssel stehen in `.env.local` des Dienstes
  (`LADEN_ZAHLEN_URL`, `LADEN_ZAHLEN_SCHLUESSEL`), nie im Repository und nie im Browser; ohne sie zeigt die
  Kachel „Nicht eingerichtet“. Platzhalter in `.env.local.example`.
- **Getestet:** `tests/laden-zahlen.test.mjs` (Konfiguration, Zahlenprüfung, Abruf mit Schlüssel, Zwischenspeicher,
  Fehlerfälle samt echtem Zeitlimit, Route über den Server, Kachel-Markup). `dashboard:pruefen` für „Heute“
  bei 1440, 1024, 800, 390 und 360 px ohne seitliches Scrollen. Sichtprüfung gegen die Kopie mit
  abgefangenem `/api/laden/zahlen` in allen drei Zuständen (Zahlen, nicht erreichbar, nicht eingerichtet),
  hell und dunkel: 5/3/2 Spalten, keine JS-Fehler, Link am Handy 44 px hoch.
- **Risiken/Annahmen:** Die Zahlen sind höchstens 5 Minuten alt (plus 10 s Zwischenspeicher in der App).
  „Angebote offen“ zählt Beratungen im Status Angebot oder Nachfassen. Die Kachel funktioniert erst, wenn die
  App mit dem Endpunkt ausgerollt und die Script-Property gesetzt ist.
- **Nächste Stufe:** Bei Bedarf fällige Wiedervorlagen als To-do „Laden: Wiedervorlage fällig“ in die Liste oben.

## 2026-10-12 · Sonderposten: Restrollen im Laden abbuchen (Inhaber)

- **Geändert:** Die Ansicht „Sonderposten“ zeigt neben Reststücken und Einzelstücken jetzt auch Restrollen
  (Rollenware mit Tag `sonderposten` und Rollenbreite, z. B. Passion Yasmin): „Restrolle · Rolle 4 m breit ·
  noch 20 m (80 m²)“, Preis je m² (online). Der Knopf „Im Laden verkauft…“ fragt dort nach der abgeschnittenen
  Länge, zeigt vor dem Klick „3,5 m × 4 m = 14 m² · danach noch 66 m² (16,5 m)“ (nicht glatte m² aufgerundet,
  mehr als der Rest gesperrt) und bucht „14 m² abbuchen“. Server `verkaufeVonRolle`
  (`operations/lib/sonderposten.mjs`) mit derselben Sicherung wie beim Stück (neu lesen, Compare-and-swap,
  `@idempotent`, Antwortverlust über erneutes Lesen, Gegenprobe), Protokoll
  `sonderposten-rolle-im-laden-verkauft`. Bestandsbuchung als gemeinsamer Helfer `bucheBestand` für beide Wege.
  Zweig vorher mit `main` zusammengeführt (217 Commits; Konflikte in `serve-dashboard.mjs` – Pfadliste
  vereinigt um `laden/zahlen` – und hier im Changelog, beide Seiten behalten).
- **Getestet:** `operations/tests/sonderposten-rolle.test.mjs` (15: Rechnung, Liste, 3,5 m → 80 → 66,
  genau der Rest, zu viel 409, ungültige Länge 400 ohne Aufruf, vertauschte Wege, ohne Tracking/mit
  Überverkauf 409, Recht fehlt 403, Item-ID, Antwortverlust nach/vor der Buchung, unklar, Gegenprobe nicht
  lesbar, gleichzeitige Buchung 409). Meldungs- und API-Tests ergänzt (u. a. Browser- und Serverrechnung für
  2000 Längen × 3 Breiten gleich). `dashboard:test` 230/230, `operations:test` grün. `dashboard:pruefen`
  (Liste live aus Shopify gelesen) ohne Überlauf bei 1440/1024/800/390/360 px. Klickstrecke bei 1440 und
  390 px mit abgefangener Buchung: 3,3 m → „13,2 m², aufgerundet 14 m²“, 25 m → gesperrt mit Hinweis, Esc
  schließt, 3,5 m → genau eine Anfrage `laengeM: 3.5` → Toast „14 m² abgebucht – noch 16,5 m (66 m²) auf
  der Rolle“, 0 JS-Fehler.
- **Risiken/Annahmen:** Kein echter Schreibtest – dem Zugang fehlt weiterhin `write_inventory` (am
  2026-10-12 per Token-Tausch geprüft). Aufrunden auf ganze m² nimmt bei krummen Längen bis zu knapp 1 m²
  je Buchung mehr vom Bestand, als physisch fehlt (lieber zu wenig anbieten als zu viel).
- **Nächste Stufe:** Nach der Freischaltung den ersten echten Ladenverkauf hier buchen und in Shopify
  (Bestandsverlauf der Variante, Referenz `tp://laden-verkauf/…`) und im Shop gegenprüfen.

## 2026-10-12 · Kachel „Laden“: Spam-Verdacht

- **Geändert:** Die Auftrags-App liefert ab Version 43 zusätzlich `spamVerdacht` – offene Fälle aus dem Shop,
  die im Laden im Filter „Spam prüfen“ warten und in keiner anderen Zahl mitzählen. Der Server reicht das Feld
  durch (`LADEN_ZAHLEN_FELDER`); fehlt es (ältere App), gilt es als 0 statt die Kachel auf „nicht erreichbar“ zu
  setzen (`LADEN_ZAHLEN_SPAETER`). Ist es da, gilt dieselbe Prüfung wie für alle Felder (ganze Zahl ≥ 0). Die
  Kachel zeigt nur bei > 0 eine Zeile unter den fünf Zahlen: „2 Fälle aus dem Shop mit Spam-Verdacht – in der
  Laden-Ansicht unter „Spam prüfen“ ansehen. In den Zahlen oben nicht enthalten.“ Die Zahl steht in Bernstein
  wie „Wiedervorlage fällig“, keine sechste Kachel. Nur Zahlen, keine Namen.
- **Getestet:** `tests/laden-zahlen.test.mjs` 9/9 (neu: Feld fehlt → 0 und erreichbar, Feld vorhanden, ungültige
  Werte −1/1,5/"3"/null/true → unbrauchbar, Zeile bei 2 und 1 – Einzahl „Fall“ –, keine Zeile bei 0 und ohne
  Feld). `npm run dashboard:test` 231/231, `npm test` 2109/2109 (nach Zusammenführen mit `main`). `dashboard:pruefen`
  für „Heute“ bei 1440, 1024, 800, 390 und 360 px nur `OK`. Sichtprüfung gegen die Kopie mit abgefangenem `/api/laden/zahlen` (2, 1, 0, Feld
  fehlt) bei 1440/390/360 px, hell und dunkel: Zeile nur bei 2 und 1, steht unter den Zahlen, Farbe gleich der
  Wiedervorlage-Zahl (hell `#9a6400`, dunkel `#e5b34f`), 0 px seitlicher Überlauf, keine JS-Fehler.
- **Risiken/Annahmen:** Die Laden-Ansicht der App hat keinen Sprunglink direkt auf den Filter; die Zeile nennt
  deshalb den Filternamen. Ein ungültiger Wert in `spamVerdacht` setzt – wie bei jedem anderen Feld – die ganze
  Kachel auf „nicht erreichbar“.
- **Nächste Stufe:** Falls die App einen Parameter für den Filter bekommt (z. B. `?ansicht=laden&filter=spam`),
  die Zeile direkt dorthin verlinken.
## 2026-10-12 · Ansicht „Social Media“: Upload-Link fürs Team und Kampagnen-Links

- **Geändert:** Neuer Punkt „Social Media“ unter „Seltener“ (`#/social`, für Rolle „lesen“ ausgeblendet). Karte
  „Foto-Upload fürs Team“: je Name der kopierbare Upload-Link für die Baustellenfotos; der Link kommt nur vom
  Server (`/api/social/zugaenge`, „lesen“ → 403). „Neuen Link anlegen“ (nur Inhaber) erzeugt einen Zugang im
  Social-Modul und merkt den Klartext im Privatordner; alte Links bleiben gültig. Karte „Kampagnen-Link“:
  Ziel (Startseite, Liefer- und Verlegeservice, Unsere Arbeit, Muster oder eigene Shop-Adresse), Kanal, Art,
  Kampagne → fertiger UTM-Link mit „Kopieren“. Darüber eine Zeile mit Social-Zentrale, Instagram, Facebook.
- **Getestet:** siehe PR (Testzahlen, `dashboard:pruefen`, Klickstrecke gegen die Kopie).
- **Risiken/Annahmen:** Der bestehende Zugang „Team“ ist nur als Hash gespeichert; sein Link lässt sich nicht
  wiederherstellen. Bis der Inhaber einmal „Neuen Link anlegen“ drückt, zeigt die Zeile nur den Hinweis.
  Die Zentrale (Port 8020) ist nur im Netz des Macs bzw. über Tailscale erreichbar.
- **Nächste Stufe:** Sperren eines Upload-Links direkt hier statt per Kommandozeile.


## 2026-10-12 · Einkauf: Bestellmenge für Teppich nach Maß, Kettelservice als Eigenleistung

- **Geändert:** `operations/lib/resolve.mjs` liest die Rollenbreite auch aus „_Zuschnitt aus Rolle“ – so schreibt
  der Konfigurator für Teppich nach Maß sie seit Beginn; die Einkaufsübersicht kannte nur „Aus Rolle“ des
  Rollenrechners, die Bestellmenge jedes Maßteppichs blieb deshalb ungeklärt. `operations/lib/bestelluebersicht.mjs`:
  Kettelservice und Wunschmaß-Pauschale (feste Liste nach Handle) sind Eigenleistung – nicht in der Bestellliste,
  nicht als „ohne Großhändler-ID“, in Auftrag und Zeitleiste als „Eigenleistung“ beschriftet. Die gekettelte
  Fußleiste bleibt bewusst offen, sie braucht Material.
- **Getestet:** neue Fälle in `operations/tests/bestelluebersicht.test.mjs` (Maße 120 × 280 cm aus 200-cm-Rolle →
  2,80 lfm; „Aus Rolle“ geht vor); alle Suiten grün; `dashboard:pruefen` nur OK. Echte Daten (Kopie, nur lesend):
  ohne ID 1 → 0, Menge ungeklärt 4 → 2, zu bestellen 3 → 2; der Maßteppich-Auftrag hat keine Warnung mehr.
- **Risiken/Annahmen:** Länge des Maßteppichs läuft entlang der Rolle (der Konfigurator begrenzt die Breite auf
  die Rollenbreite). Neue Eigenleistungen müssen in `EIGENLEISTUNG_HANDLES` nachgetragen werden.
- **Nächste Stufe:** Dieselbe Kennzeichnung in der internen Bestellmail (Shopify-Benachrichtigung), dort steht
  beim Kettelservice weiter „Großhändler-ID fehlt“.

## 2026-10-12 · Sonderposten: „Wer hat verkauft?“ im gemeinsamen Zugang, Recht erteilt

- **Geändert:** Das Control Center läuft ohne persönliche Konten (gemeinsames Passwort); jede Buchung stand
  deshalb als „Inhaber“ im Protokoll. Beide Dialoge („Im Laden verkauft?“ und „Von der Rolle verkauft“) fragen
  jetzt im gemeinsamen Zugang „Wer hat verkauft?“ – Pflicht, ohne Vorbelegung, zuletzt benutzte Namen als
  Vorschlag. Der Server verlangt den Namen dann (400 ohne Shopify-Aufruf) und schreibt ihn in `verkauft_von`
  und ins Protokoll (Vermerk „Name im gemeinsamen Zugang angegeben“). Mit persönlichem Konto (Kürzel) gilt
  weiter der Name aus der Sitzung. Doku: `write_inventory` ist seit heute erteilt.
- **Getestet:** API-Tests für Notzugang ohne/mit Namen (Stück und Rolle) und persönliches Konto schlägt
  Anfrage; `dashboard:test` grün. Klickstrecke 1440/390 px gegen die Kopie (Liste live gelesen, Buchung
  abgefangen): nur Länge → Knopf gesperrt, mit „Thomas“ → frei, Anfrage trägt `verkauftVon: "Thomas"`,
  zweiter Dialog leer mit Vorschlag „Thomas“, 0 JS-Fehler, 0 px Überlauf. Echter Schreibtest nach der
  Freischaltung nur am Testprodukt SP-TEST-0001: 0 → 1 → 0, Felder gesetzt, Gegenprobe ok; Yasmin unberührt.
- **Risiken/Annahmen:** Der Name ist im gemeinsamen Zugang eine Angabe, keine Anmeldung. Wer es genauer will,
  legt persönliche Konten unter „Team“ an.
- **Nächste Stufe:** Ersten echten Rollenverkauf in Shopify (Bestandsverlauf) gegenprüfen.

## 2026-10-12 · Kachel „Laden“: Spam-Zeile springt direkt in den Filter (#1138)

- **Geändert:** Die Zeile „n Fälle aus dem Shop mit Spam-Verdacht“ endet jetzt mit dem Link „Spam prüfen ↗“, der die
  Laden-Ansicht der Auftrags-App gleich mit dem Filter öffnet (`?ansicht=laden&filter=spam`, App ab Version 47), in
  einem neuen Tab wie „Laden-Ansicht öffnen“. Der Satz dazu ist kürzer („– in den Zahlen oben nicht enthalten.“),
  weil der Link den Weg ersetzt. `spamUrl()` in `ansichten/heute/laden.mjs` baut die Adresse per URL-API aus dem
  `ladenUrl` des Servers: weitere Parameter bleiben, `ansicht=laden` und `filter=spam` werden gesetzt, nur `https`.
  Ohne `ladenUrl` bleibt die bisherige Zeile ohne Link. Am Handy hat der Link wie der Kopf-Link 44 px Tippfläche.
- **Getestet:** `laden-zahlen.test.mjs` um einen Test erweitert (Link mit `ansicht=laden` und `filter=spam`, weitere
  Parameter bleiben, anderer Filter wird ersetzt, ohne/kaputter/relativer/`javascript:`/`http`-ladenUrl kein Link;
  Kachel mit und ohne `ladenUrl`). `npm run dashboard:test` 249/249, `npm test` 2206/2206 (nach Rebase auf `main`), `secret:scan` PASS,
  `validate --static` PASS. `dashboard:pruefen` für „Heute“ bei 1440, 1024, 800, 390 und 360 px (hell) und 1440/390 px (dunkel)
  nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie mit abgefangenem `/api/laden/zahlen` (Host `.invalid`, keine
  Anfrage nach draußen): Zeile mit Link bei 2 und 1 (Einzahl „Fall“), keine Zeile bei 0 und ohne Feld, ohne
  `ladenUrl` alter Text ohne Link; Link bei 1440/390/360 px nicht verdeckt (Desktop 16 px, Handy 44 px hoch),
  Terrakotta wie der Kopf-Link (hell `#98502f`, dunkel `#d68b65`); Klick bei 390 px öffnet genau einen neuen Tab
  auf `…/exec?ansicht=laden&authuser=1&filter=spam`, das Dashboard bleibt auf „Heute“, keine JS-Fehler.
- **Risiken/Annahmen:** Bis die Auftrags-App Version 47 läuft, öffnet der Link die Laden-Ansicht ohne Filter – der
  Inhaber muss dann noch auf „Spam prüfen“ tippen.
- **Nächste Stufe:** keine.

## 2026-10-12 · Einkauf und Lexikon: jedes Muster mit Weg zum Lieferanten, Lieferanten C–E zugeordnet (#1145)

- **Geändert:** Muster ohne eigenes Musterprodukt – fast alle Vinylböden von der Rolle (PVC/CV) und einige
  Designböden – laufen über das Sammelprodukt „Kostenloses Muster“. Ihre Position trug dessen Handle, „Im Lexikon
  ansehen“ öffnete deshalb das Sammelprodukt: kein Lieferant, keine Artikelnummer, kein Link zum Lieferanten.
  `aufbereiten()` (`operations/lib/bestelluebersicht.mjs`) setzt bei diesen Mustern jetzt den Handle des
  Quellprodukts (aus der geladenen Quellvariante, sonst aus `_Quellprodukt`); eigene Musterprodukte `muster-*`
  bleiben, weil das Lexikon dort das Original selbst zeigt. Damit stehen auch die wartenden Kunden am richtigen
  Produkt. Zweitens kannte die GID-Zuordnung für `einkauf.lieferant` nur A und B; jede Position von C, D und E
  stand unter „Lieferant nicht zugeordnet“. Die feste Liste kennt jetzt A–E, und der
  Export (`operations/scripts/aktualisieren.mjs`) liest alle `tp_lieferant`-Metaobjekte als `lieferanten` in
  `orders.json` mit – ein neuer Lieferant braucht keine Codeänderung mehr. Scheitert nur diese Abfrage, läuft der
  Export weiter und die feste Liste greift.
- **Getestet:** Zwei neue Tests in `operations/tests/bestelluebersicht.test.mjs` (Sammelprodukt-Muster →
  Quellprodukt mit Lieferant, Link und ID; ohne geladene Quellvariante aus `_Quellprodukt`; `muster-*` unverändert;
  C/D/E aus der festen Liste, unbekannte GID über `lieferanten` aus dem Export), Exporttest um die Lieferantenabfrage
  erweitert. `npm run dashboard:test` 249/249, `npm test` grün, Guards und `validate --static` PASS,
  `secret:scan` PASS. Vergleich alt/neu auf den echten Bestelldaten (nur lesend): 63 Positionen, genau 8 geändert –
  7 Sammelprodukt-Muster zeigen aufs Quellprodukt, ein Teppichboden-Muster bekommt statt „nicht
  zugeordnet“ seinen Lieferanten. `dashboard:pruefen` nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie: „Lieferant nicht
  zugeordnet“ verschwunden, Karten A, B, E; alle 7 Muster-Zeilen mit Lieferantenlink, „Im Lexikon ansehen“ beim
  PVC-Muster öffnet den Vinylboden mit Lieferant A, Artikelnummer und „Beim Lieferanten öffnen“ (375 px: 0 px
  Überlauf), dort „2 Kunden warten auf dieses Produkt“.
- **Risiken/Annahmen:** Die Zuordnung C–E greift für den aktuellen Export sofort über die feste Liste; die
  Metaobjekt-Liste kommt mit dem nächsten Lauf von `npm run daten:aktualisieren`. Für C–E fehlen ggf. noch
  Stammdaten (Bestellweg, Mail) – die Karte zeigt dann „nicht hinterlegt“.
- **Lexikon, Muster ohne Original:** Die Muster-SKU ist `M-` plus die SKU der Quellvariante, das Lexikon suchte das
  Original aber nur über die Lieferanten-Artikelnummer. Wo diese eine Null mehr trägt (Shop `…04_99`, Lieferant
  `…04_099`; Shop `…4_119`, Lieferant `…04_119`), fanden 88 Mustervarianten kein Original und zeigten keinen Weg
  zum Lieferanten. `operations/lib/lexikon.mjs` sucht jetzt zuerst über die Shop-SKU, dann über die Artikelnummer.
  Hat das Original keinen Direktlink, trägt es den Suchlink beim Lieferanten; die Muster-Zeile im Lexikon zeigt
  dann „Beim Lieferanten suchen ↗“. Test in `operations/tests/lexikon.test.mjs`. Live-Export in eine Testdatei:
  5850/5850 Mustervarianten mit Original (vorher 5762), alle mit Direkt- oder Suchlink; bisher gefundene Originale
  unverändert.
- **Nächste Stufe:** Lieferant B (Wohnteppiche, Dekofelle, Teppiche, Teppich nach Maß; 654 Varianten) hat keinen
  Schnellzugriff: keine Produktseiten online, kein Bestellweg in den Stammdaten. Bestellweg in „Einkauf ›
  Lieferanten“ hinterlegen und im Lexikon anzeigen.

## 2026-10-12 · „Fehler melden“ mit Weitergabe an die Werkbank (#1149)

- **Geändert:** Knopf „Fehler melden“ für alle Rollen (Seitenleiste unten, am Handy im „Mehr“-Blatt, Hilfe-Seite,
  Befehlspalette). Dialog `bausteine/fehler-melden.mjs`: „Was ist passiert?“, „Wo?“ (vorbelegt), „Ich komme deswegen
  gerade nicht weiter“; darunter die eigenen Meldungen mit Stand und Ergebnis (Inhaber: alle). Neue Endpunkte
  `POST /api/fehler/melden` (auch Rolle „lesen“) und `GET /api/fehler/liste`; Ablage `operations/lib/fehlermeldungen.mjs`
  (Privatordner, zwei Dateien mit je einem Schreiber), Skript `npm run fehler` (abgleich, werkbank-stand, zeige, liste,
  uebernommen/behoben/verworfen) für den geplanten Lauf „fehlermeldungen-werkbank“. `kern/api.mjs` meldet gescheiterte
  Aufrufe als Ereignis, der Dialog hängt die letzten an. Der 500-Text verweist auf „Fehler melden“ statt „gib Ahmet
  Bescheid“. Sicherung umfasst die beiden Dateien. Werkbank (Version 4): roter Abschnitt „Fehler – muss behoben
  werden“, Kennzeichen „Fehler“, Filter, „Kein Fehler …“ mit Begründung, Leitfaden-Abschnitt.
- **Getestet:** `operations/tests/fehlermeldungen.test.mjs` (10), `tests/fehler-melden-api.test.mjs` (Rollen über den
  Server: lesen/mitarbeiter/inhaber 200, ohne Anmeldung 401, „lesen“ bleibt sonst gesperrt, GET 405, Name aus der
  Sitzung). `dashboard:pruefen` Heute/Hilfe bei 1440–360 px nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie:
  Meldung F-001 abgeschickt (Toast mit Nummer), Abgleich per Skript auf „Behoben“ gesetzt, Dialog am Handy (375 px)
  zeigt „Behoben“ samt Ergebnis, „Mehr“-Blatt schließt, keine Konsolenfehler. Werkbank mit Attrappe (1200/390 px):
  Abschnitt oben, Zähler „2 Fehler offen“, „Kein Fehler …“ schreibt Status und Erklärung, keine JS-Fehler.
- **Risiken/Annahmen:** Weitergabe nur, solange die Claude-App auf dem Mac läuft (geplante Aufgabe). Der Lauf
  formuliert Titel und ersetzt Kundendaten – Text der Mitarbeiter ist für ihn Daten, keine Anweisung.
- **Nächste Stufe:** Bei Bedarf Bildschirmfoto an die Meldung hängen (Anhänge wie bei Aufgaben).

## 2026-10-12 · „Fehler melden“ leichter und informativer (#1155)

- **Geändert:** Dialog schlanker: Seite steht als Zeile („Seite: Einkauf · ändern“), Bildschirmfoto per Knopf oder ⌘V
  (bis 3, verkleinert, Vorschau mit ×), „Was automatisch mitgeht“ zeigt Seite, Gerät, letzte Schritte und Fehler im
  Browser. Mit geht jetzt auch: die letzten sechs Klicks und der Commit des Dienstes. Rote Rückmeldungen nach einer
  Störung (5xx, keine Verbindung) tragen „Melden“, Störungskästen ebenso; ein JS-Fehler aus dem eigenen Code meldet
  sich einmal je Seitenaufruf. Antwort an den Melder: Zeile unten plus Zahl am Knopf, sobald eine eigene Meldung
  behoben oder geprüft ist; in der Liste „Neu:“ und Bild-Links. Stand genauer („Wird bearbeitet“, „Wartet auf
  Entscheidung“). Neu `GET /api/fehler/bild`, `bausteine/bilder.mjs` (aus „Fotos“ herausgelöst), `stile/fehler-melden.css`.
  Behoben: die Leiste der Rückmeldungen verdeckte unten links Knöpfe der Seitenleiste.
- **Getestet:** Bibliothek 12 Tests (Bilder nur echte PNG/JPEG/WebP, getarntes SVG abgelehnt, höchstens 3, Pfade
  nur eigene Namen, gemeinsamer Zugang erkennt eigene Meldungen, Werkbank-Stand), Servertest mit Bild hochladen und
  abrufen (Melder und Inhaber 200, Fremde 404). `dashboard:pruefen` Heute/Hilfe/Fotos 1440–360 px nur `OK`. Klickstrecke
  gegen die Kopie: Schritte erfasst, Bild angehängt und gespeichert, Antwort per Skript → Zeile „Behoben – …“ und Zahl 1
  am Knopf, nach dem Öffnen weg, Bild abrufbar, „Melden“ in roter Rückmeldung öffnet den Dialog, am Handy kein ⌘V-Hinweis,
  0 JS-Fehler.
- **Risiken/Annahmen:** Bildschirmfotos zeigen oft Kundendaten. Nachtrag (nächster Eintrag): auf Wunsch des Inhabers erscheinen
  sie jetzt auch in der privaten Werkbank (Bildspeicher der Seite).
- **Nächste Stufe:** keine.

## 2026-10-12 · Lexikon: Gesamtprüfung aller Produkte, Mengenhilfe für Rollenware repariert (#1157)

- **Geändert:** Prüfung aller 3228 Lexikon-Produkte (20279 Varianten) mit dem echten Ansichtscode und gegen die
  Lieferantenseiten. Drei Fehler im Code behoben:
  - **Mengenhilfe rechnete Rollenware falsch oder gar nicht.** Shopify führt `custom.rollenbreite` in Metern
    („2.0“), die Mengenhilfe teilte pauschal durch 100 – für 20 m² auf einer 2-m-Rolle kamen 1000 lfm statt 10
    heraus (31 Produkte). Bei 570 Rollenprodukten mit mehreren Breiten steht die Breite nur an der Variante, die
    Mengenhilfe fand sie nicht. Jetzt: Breite je Variante (`rollenbreiteM` aus dem Export), Meter und Zentimeter
    werden erkannt (`rollenbreiteInMetern`), bei mehreren Breiten wählt man die Rolle im Widget. m²-Ware ohne
    Paket (Teppich nach Maß direkt vom Hersteller, 284 Produkte) ergibt die Fläche selbst statt „m² pro Paket
    fehlt“; Teppich nach Maß in lfm erklärt, dass der Einkauf die Menge aus den Maßen der Bestellung rechnet.
  - **Varianten ohne Farbe** (Vinyl von der Rolle, Sockelleisten, Zubehör; 723 Varianten) standen als
    „nicht hinterlegt“ da, 200/300/400 cm waren nicht zu unterscheiden. Die Bestellliste nennt jetzt die Variante.
  - **Teppich nach Maß direkt vom Hersteller** (3112 Varianten) zeigte „Art.-Nr. nicht hinterlegt“, obwohl die
    Bestellbezeichnung des Lieferanten da ist. Sie steht jetzt kopierbar an der Stelle der Artikelnummer.
- **Getestet:** Alle 3228 Detailseiten mit der laufenden Ansicht gerendert: 0 Abbrüche, keine „undefined“/„NaN“.
  Links gegen die Lieferanten: A 5510 bestätigt (Artikelnummer → offizielle Produktseite), C 1240, D 1046 (im
  Browser, Seitentitel nennt Qualität/Farbe), E 524 – alle erreichbar. Neue Tests in `api.test.mjs`
  (Meter/Zentimeter, mehrere Breiten, m², Teppich nach Maß) und `lexikon.test.mjs` (`rollenbreiteM`).
  `dashboard:test`, `npm test` grün, `dashboard:pruefen` nur OK; Sichtprüfung 375 px ohne Überlauf.
- **Daten (nicht im Repo):** 180 Lieferantenlinks von A korrigiert – 1 zeigte auf einen anderen Dekor, 1 fehlte,
  178 zeigten auf die Sammelseite der Qualität statt auf die Farbe. Plan, Rücksicherung und Gegenprobe (180/180)
  liegen lokal.
- **Risiken/Annahmen:** Der Hintergrunddienst `sync` lädt Code nur beim Start – nach einem Merge ins Lexikon
  auch ihn neu starten, sonst schreibt er den Export mit altem Code.
- **Nächste Stufe:** 12 Artikelnummern findet Lieferant A nicht mehr (ausgelaufen oder umnummeriert);
  Lieferant B ohne Schnellzugriff.

## 2026-10-12 · Bildschirmfotos auch in der Werkbank

- **Geändert:** Der geplante Abgleich `fehlermeldungen-werkbank` lädt Bildschirmfotos einer Meldung in den Bildspeicher der
  Werkbank (Fähigkeit `assets`) und trägt sie als `bilder: [{id, url}]` am Eintrag ein. Die Werkbank zeigt sie als Vorschau
  unter der Beschreibung (Klick vergrößert) und „Bildschirmfoto“ in der Zeile. Grund: Der Inhaber konnte den Anhang der
  Testmeldung nicht sehen. Doku in `ARCHITEKTUR.md` Abschnitt 15 nachgezogen.
- **Getestet:** Echte Testmeldung F-002 mit Bild: Upload in den Bildspeicher, Eintrag zeigt das Bild; Rückweg „Wird bearbeitet“
  und „Kein Fehler“ mit Erklärung im Dashboard angekommen. Werkbank-Seite mit Attrappe bei 1200 und 390 px: Bild lädt,
  Vergrößern geht, 0 px Überlauf, keine JS-Fehler.
- **Risiken/Annahmen:** Bildschirmfotos können Kundendaten zeigen; die Werkbank bleibt privat.
- **Nächste Stufe:** keine.

## 2026-10-12 · Befunde der Analyse umgesetzt: Zu tun, Einkauf, Rollen, Heute, Navigation, Montage (#1154)

- **Geändert:**
  - *Kunden „Zu tun“:* Der nächste Schritt kommt aus der Zeitleiste (Auftragsfluss + Verlauf), nicht aus dem
    Shopify-Versandstatus (`operations/lib/kundenfaelle.mjs`, `zeitleisteSchritt` aus `/api/kunden/faelle`).
    Muster beim Kunden heißen „Nachfassen …“ bzw. „… verschickt – sind sie angekommen?“ statt „Versenden“; was beim
    Lieferanten liegt, heißt „Beim Lieferanten nachhaken …“. Wer nur auf Lieferant oder Kunde wartet, steht nicht in
    der Arbeitsliste, die Kopfzeile nennt die Zahl. „In Shopify noch nicht als versendet gebucht“ ist nur noch ein
    Hinweis; die Bestellliste zeigt in derselben Zeile nicht mehr „Noch nicht versandt“ und „An Kunden raus“ zugleich.
  - *Heute:* Kennzahl „Ø je bezahlter Bestellung“ ohne kostenlose Muster. Fällige Nachfass-Muster stehen unter „Wir
    sind dran“, nicht zugleich unter „Kunde ist dran“. Die eingeklappten „Weiteren Übersichten“ sind weg (jede Zahl
    stand schon oben oder in Kunden/Einkauf/Entwicklung, „bezahlt, noch nicht versandt“ sogar falsch); eine seit
    über drei Stunden stumme Shop-Wache ist jetzt ein To-do, „GitHub synchronisieren“ steht in „Entwicklung“.
  - *Einkauf:* endet bei „bei uns eingetroffen“ – „An Kunden raus“ zählt als erledigt statt „Unterwegs“; Filter
    „Bei uns eingetroffen“, alter Link `af=unterwegs` landet dort. Nachhaken zählt Aufträge und Positionen getrennt.
    „Lieferantenraster ungeklärt“ statt `UNGEKLAERT`.
  - *Rollen:* `/api/agent-runs` fragt nur noch der Inhaber ab (vorher 403 samt Konsolenfehler für Mitarbeiter und
    „lesen“ auf jeder Seite). „lesen“ sieht „✓ Erledigt“, „Kein echter Kunde“ und „Jetzt aktualisieren“ nicht mehr.
  - *Navigation:* überall „Kunden“ (vorher „Kunden & Aufträge“, „Aufträge“, „Kunden“). „Fotos“ ohne eigenen Punkt,
    verlinkt aus „Social Media“. „KI-Läufe“ (Systemzustand) und „KI wartet“ (Entwicklung) entfernt – seit dem Wegfall
    des Routers immer 0. GitHub-Login → „Inhaber“, Lexikon-Status nur bei Abweichung und deutsch, Geldbeträge
    „0,00 €“, Ratgeber ohne Skriptpfad und Befehl, Shop-Wache-Tabellen im Scroll-Rahmen.
  - *Weitere Dashboards:* Gruppe in der Seitenleiste mit Werkbank, Laden, Montage (neuer Tab). Adressen aus
    `WERKBANK_URL` und `AUFTRAGS_APP_URL` (Laden = `?ansicht=laden`; ohne `AUFTRAGS_APP_URL` gilt `LADEN_ZAHLEN_URL`),
    über `/api/capabilities` (`scripts/weitere-dashboards.mjs`), nur https, ohne Adresse kein Link. Die Werkbank-Adresse
    steht nicht mehr in `index.html`. Kachel „Laden“: „Schlüssel fehlt“ statt „Nicht eingerichtet“, wenn nur der
    Schlüssel fehlt; „Laden-Ansicht öffnen“, sobald eine App-Adresse bekannt ist.
  - *Montage:* Kachel neben „Laden“ aus dem neuen Objekt `montage` der Zahlenantwort (`MONTAGE_FELDER`): vorhandene
    Zahlen, fehlende weggelassen, ohne Objekt/Schlüssel „noch nicht verbunden“, Link „Montage-App öffnen“. Nur Zahlen.
  - *Prüfwerkzeug:* `dashboard:pruefen` kopiert auch `kunden/`, `angebote/`, `warenkoerbe/`, `shopwache/`, `bestand/`,
    `erfuellung/` und die beschreibbaren Einzeldateien; `--rollen` prüft mit drei Wegwerf-Zugängen nur in der Kopie;
    Netzfehler zählen wie Fehlerantworten. Doku: README ohne „öffentliche“ Pages-Adresse, ARCHITEKTUR §1e
    (vorher doppelt „1d“) mit „Zugänge einrichten“, §5 und §7 auf Stand, §8/§9/§9b zu Einkauf, Heute, Zu tun.
- **Getestet:** `npm run dashboard:test` 263/263, `npm test` 2250/2250 (7 Suiten, nach Rebase auf `main`).
  `dashboard:pruefen` 21 Ansichten × 5 Breiten = 105 × OK, 0 px Überlauf; `--rollen` (Inhaber 21, Mitarbeiter 13,
  „lesen“ 12 Ansichten) × 5 Breiten = 230 × OK. Vorher (origin/main, `--rollen`, 1440/390 px): 3 × FEHL –
  403 auf `/api/agent-runs` für Mitarbeiter und „lesen“, Shop-Wache-Tabelle bei 390 px (erst sichtbar, seit die Kopie
  `shopwache/` enthält). Klickstrecken gegen die Kopie (Zahlen):
  „Zu tun“ 15 Kunden/10 sofort (14 × „Versenden“) → 10/2 und 6 wartend, 0 × „Versenden“; Menüzahl 10 → 2;
  „✓ Erledigt“ 10 → 9, „Wieder einblenden“ → 10. Heute „Wir/Lieferant/Kunde“ 7/5/9 → 10/5/6; „Erledigt – nachgefasst“
  → 9/5/7, Muster nachfassen 3 → 2. Einkauf „Alle offenen/Bestellt/Unterwegs/Erledigt“ 56/27/27/4 → 29/27/0
  („Bei uns eingetroffen“)/31, Lieferant A „53 Muster laufen“ → 26, „15 Bestellungen warten“ → „5 Aufträge warten (15
  Positionen)“; Position → „Geliefert an uns“: Bestellt 27 → 26, Eingetroffen 0 → 1; → „An Kunden raus“: Erledigt 31
  → 32. Rollen: 0 × 403; Werkbank für „lesen“ ausgeblendet, Laden/Montage sichtbar; Knöpfe Erledigt/Kein echter
  Kunde/Jetzt aktualisieren für „lesen“ 0 (Mitarbeiter 20). Laden mit Adresse ohne Schlüssel: „Schlüssel fehlt“ + Link;
  Montage mit Beispielantwort 7 Kacheln (2 in Bernstein), mit zwei Zahlen 2 Kacheln, ohne Objekt „noch nicht
  verbunden“. 0 JS-Fehler.
- **Risiken/Annahmen:** „Zu tun“ zeigt weniger Kunden – wer nur wartet, steht unter „Bestellungen“ und auf „Heute“ in
  „Wer wartet auf was“. Der Einkauf zählt „An Kunden raus“ als erledigt; `/api/einkauf/lieferanten` (Server) zählt noch
  nach dem alten Schnitt, die Oberfläche nutzt davon nur die Stammdaten. Ohne `WERKBANK_URL` in `.env.local` des
  Dienstes fehlt der Werkbank-Link (vorher fest im Markup). Die Montage-Felder sind mit der parallel gebauten App
  abgestimmt, aber erst mit deren Auslieferung sichtbar. Der Kennzahlen-Export liefert `mitBetrag` erst nach dem
  nächsten Lauf; bis dahin rechnet die Kachel aus `kostenlos`.
- **Nächste Stufe:** `WERKBANK_URL` und `AUFTRAGS_APP_URL` im Dienst setzen; Zugänge anlegen (ARCHITEKTUR §1e); in
  „Zu tun“ einen Knopf für den Zeitleisten-Schritt (wie auf „Heute“), damit „Nachfassen“/„Abschließen“ direkt geht.

## 2026-10-12 · Durchsicht des ganzen Control Centers: veraltete Produktdaten, Mengen, Testwarenkörbe, Laden-Zähler (#1172)

- **Geändert:** Alle 25 Ansichten und Reiter im laufenden Dashboard durchgesehen (JS-Fehler, fehlgeschlagene Abrufe,
  „undefined/NaN“, interne Marker, Überlauf, Zahlen gegen Listen). Mechanisch war alles sauber, inhaltlich fünf Fehler:
  - **Einkauf › Produktdaten las Dateien vom 22./23. September**, die nie erneuert wurden: „0 von 509 vollständig“ und
    „Lieferant fehlt“ bei Produkten, die ihn längst haben; die 2.700 später angelegten Produkte fehlten. Die Liste kommt
    jetzt aus dem Lexikon-Export, den der Sync-Dienst laufend erneuert (`produktstatusAusLexikon`), mit Datenstand. Die
    Septemberdateien bleiben nur Rückfall, wenn es noch kein Lexikon gibt. Ergebnis heute: 2506 von 2629 vollständig,
    0 mit Handarbeit, 123 nur mit Zusatzinfos (Produktseite des Lieferanten, Farbnummer). Der Erklärtext nennt jetzt
    die tatsächlich blockierenden Felder; „füllt sich selbst“ hieß es auch dort, wo jemand den Link suchen muss.
  - **„0 Stk.“ bei gelieferter Ware** in Kunden › Zu tun: gezeigt wurde die offene statt der bestellten Menge.
  - **Einheiten:** „800 Stk. Kettelservice“ sind 8,00 lfm Kante (verkauft je 0,01 lfm), „25 Stk.“ einer Unterlage
    „je lfm“ sind 25 lfm.
  - **Liegengeblieben zählte Testkäufe** (qa-test@example.com aus den Shop-Prüfungen): rund 3.150 der angezeigten
    3.338 €. Jetzt gilt dieselbe Testadress-Regel wie in der Kunden-Arbeitsliste (`istTestkontakt`, nur reservierte
    Domänen), im Export und beim Lesen älterer Exporte; die Ansicht nennt, wie viele ausgeblendet sind.
  - **Heute:** Das Sprungfeld „offen im Laden“ zählte die Muster-Nachfassungen nicht, die Laden-Ansicht schon (2 statt 5).
- **Getestet:** Neue Tests (`api.test.mjs` Produktstatus aus dem Lexikon, `bestelluebersicht.test.mjs` Mengen,
  `warenkoerbe.test.mjs` Testkäufe; der Warenkorb-Test nutzte selbst eine reservierte Testdomäne als Kundenadresse).
  `dashboard:test` 264/264, `npm test` grün, Guards und `validate --static` PASS, `dashboard:pruefen` nur OK.
  Kopie mit echten Daten: Produktdaten 2506/2629, Liegengeblieben 188,36 € (3 Testkäufe ausgeblendet), „5 offen im Laden“.
- **Risiken/Annahmen:** Das Test-Sonderpostenstück SP-TEST-0001 bleibt sichtbar – es ist klar gekennzeichnet und wird
  für Schreibtests über die Liste gebraucht (die Test-Attrappe nutzt dieselbe SKU).
- **Nächste Stufe:** Bestellweg für Lieferant C, D und E in den Stammdaten fehlt (Karte „Bestellweg nicht hinterlegt“).

## 2026-10-12 · Robustheit: kein Absturz durch Anfragen, Fehler im Protokoll, Lesefehler, Blocker, Tailscale (#1175)

- **Geändert** (Befunde der Prüfung vom 12.10., Details ARCHITEKTUR §16):
  - *Absturz:* Eine Anfrage mit `Cookie: x=%` beendete ohne Anmeldung den ganzen Dienst (URIError in
    `parseCookies`). Kaputte Cookie-Werte werden übersprungen, `requestHandler` fängt jeden Fehler (auch aus
    `handleApi`/`handleLogin`) als 500, `uncaughtException`/`unhandledRejection` werden protokolliert.
  - *Fehler sichtbar:* je Fehlerantwort der API (auch 4xx), abgelehnter Anmeldung und unerwartetem Fehler eine
    Zeile mit ISO-Zeit, Status, Methode und Pfad ohne Abfrageteil (`scripts/dashboard-log.mjs`) – keine Cookies,
    Körper, Passwörter oder Suchbegriffe. Sync-Protokoll mit Uhrzeit je Zeile. Ein abgebrochener Klick auf „Jetzt
    aktualisieren“ bleibt als `letzterKnopfLauf` stehen: Rückmeldung „abgebrochen“ statt „abgeschlossen“ und eine
    Zeile im Systemzustand.
  - *Lesefehler:* Auftragsstatus, Rückrufe, Fallmarken, Aufgaben/Notizen und Benutzer gelten nur bei fehlender
    Datei als leer; beschädigt oder unlesbar → Fehler, die Datei wird nicht mehr mit einem Eintrag überschrieben.
    Beschädigte `benutzer.json`: Anmeldung 503 mit Klartext, Notzugang geht, Sitzungen bleiben.
  - *Blocker:* „Blockieren“ schreibt den Grund als `## Blocker` in den Issue-Body (vorher nur Kommentar →
    „Blocker-Grund fehlt“). Gilt auch für `npm run task -- block`. Das Detailblatt zeigt den Abschnitt nur noch,
    solange die Aufgabe blockiert ist.
  - *Tempo:* Lexikon (27 MB) nach Größe/Änderungszeit zwischengespeichert statt bei jeder Anfrage gelesen.
    Sync-Dienst holt den Lagerbestand nur noch stündlich (`TP_SYNC_BESTAND_MINUTEN`); Sonderposten buchen weiter
    live gegen Shopify.
  - *Aktualität:* `issues.json` wird im Dienst alle 10 Minuten neu gebaut (`TP_DASHBOARD_NEUBAU_MINUTEN`, nie
    überlappend). Der Chip zeigt bei einem älteren Stand das Datum („10.10. 09:00“).
  - *Handy:* Im „Mehr“-Blatt bleibt der Fuß stehen; „Fehler melden“ steht dort zuerst über die volle Breite.
    Rückmeldungen erscheinen bei offenem Blatt oben.
  - *Kleinigkeiten:* 413 kommt an (statt Verbindungsabbruch); Eingabefehler bei Aufgaben/Notizen 400 statt 500;
    Anhänge nur als Bild/PDF/Text im Fenster, sonst Download, immer `nosniff`; jede Antwort mit
    `X-Frame-Options: DENY` und `frame-ancestors 'none'`.
  - *Tailscale-Wache:* Ist Tailscale am Mac mini gestoppt oder abgemeldet (nur gelesen über
    `tailscale status --json`), steht beim Inhaber ein To-do in der Website-Sicht, ein Hinweis auf der
    Shop-Wache und eine Zeile im Systemzustand – mit dem Handgriff.
  - *Prüfwerkzeug:* `dashboard:pruefen` räumt auch bei SIGTERM/SIGHUP auf; „Lade …“ nach 6 s ist `FEHL`.
    Verwaiste Prüf-Instanz (127.0.0.1:58704, Worktree pr1077-merge) beendet, drei Datenkopien im Temp-Ordner
    gelöscht.
- **Getestet:** `dashboard:test` 264 → 282 grün (neu `tests/robustheit.test.mjs`, Blocker/Lexikon/Knopf-Lauf/
  Tailscale in `api.test.mjs`, `model.test.mjs`, `todos.test.mjs`); `npm test` 7 Suiten grün (2282 Tests, neu
  `operations/tests/speicher-lesefehler.test.mjs`, `tailscale.test.mjs`, Sync-Takt); `secret:scan` PASS, Guards
  und `validate --static` PASS. `dashboard:pruefen` 105 × OK vorher und nachher (21 Ansichten × 5 Breiten, jetzt
  mit „Lade“-Prüfung), `--rollen` bei 390/1440 px 92 × OK (Inhaber 42, Mitarbeiter 26, „lesen“ 24). Gegen die Kopie: `Cookie: x=%` und `a=%E0%A4%A` → `/` 302, `/api/capabilities` 401,
  `/api/logout` 200, Prozess-ID unverändert; `org/neu` ohne Titel 400 (vorher 500), 70-KB-Körper 413 mit Text;
  Protokollzeilen mit ISO-Zeit. „Mehr“-Blatt mit Weiteren Dashboards: „Fehler melden“ vorher 852–900 px bei
  844 px Fenster (unsichtbar), nachher 674–722 px (390×844), 497–545 px (375×667), 570–618 px (360×740), jeweils
  klickbar. Tailscale (am Mac mini gerade gestoppt): To-do „Tailscale ist aus …“ in Heute › Website, Hinweis auf
  der Shop-Wache, Zeile im Systemzustand; Heute › Laden ohne Eintrag. 0 JS-Fehler.
- **Risiken/Annahmen:** Eine beschädigte Datei bringt die betroffene Ansicht jetzt sichtbar zum Stehen (500 mit
  Hinweis auf die Sicherung) statt still leer zu zeigen – gewollt, aber neu. Das Lexikon liegt geparst im
  Speicher des Dienstes. Der Blockieren-Klick schreibt in den öffentlichen Issue-Body (wie bisher der Kommentar).
  Der Lagerbestand im Einkauf ist bis zu einer Stunde alt.
- **Nächste Stufe:** Tailscale am Mac mini wieder verbinden (Menüleiste → Connect); danach verschwindet das To-do.

## 2026-10-13 · Social Media: Upload-Link sperren

- **Geändert:** Neben jedem Upload-Zugang in `#/social` steht „Sperren“ (nur Inhaber sichtbar), mit Rückfrage
  „Link für <Name> sperren? Er funktioniert danach nicht mehr.“. `POST /api/social/sperren` (Inhaber; Mitarbeiter
  und „lesen“ 403, steht in der write-Liste) nutzt `zugangSperren` aus `social/lib/eingang.mjs` – dieselbe Sperre wie
  `npm run social -- zugang sperren`, also alle Links dieses Namens – und löscht den gemerkten Klartext. Der Zugang
  verschwindet aus der Liste.
- **Getestet:** `dashboard:test` 282/282, `npm test` grün, `dashboard:pruefen` 105 × OK. Klickstrecke gegen die Kopie:
  Rückfrage abgebrochen → aktive Zugänge 2 → 2, bestätigt → 2 → 1, Zeile weg; Knopf bei Rolle Mitarbeiter ausgeblendet.
- **Risiken/Annahmen:** Sperren wirkt je Name, nicht je einzelnem Link (wie die Kommandozeile).
- **Nächste Stufe:** keine geplant.

## 2026-10-13 · Muster einfacher: Inhalt auf einen Blick, Musterlager (#1179)

- **Geändert:**
  - *Bestellliste (Kunden › Bestellungen):* unter jeder Bestellung eine Zeile mit dem Inhalt – bei Mustern
    Produkt, Farben und woher („aus dem Musterlager (Regal B)“, „haben wir da – vorbeibringen“), bei Ware die
    Artikel. Reine Musterbestellungen „kostenlos“ statt „0,00 €“. Suche auch über Produkt und Farbe.
  - *Heute:* „Muster bei … bestellen“ nennt Produkt und Farben statt „3 Positionen“; „Muster verschicken an …“
    nennt den Lagerplatz.
  - *Einkauf › Musterlager (neu):* Einzelmuster, Probestück 2 × 1 m, Bahn 4 m × 20 cm mit Lagerplatz einlagern
    (Produktsuche im Lexikon, mehrere Farben auf einmal), „Ist leer“, „Wieder da…“, Bearbeiten, Herausnehmen.
    Vorschläge „Einlagern?“ aus eingetroffenen PVC-/Linoleum-Probestücken und mehrfach bestellten Farben.
  - *Automatik:* Offene Musterpositionen, deren Muster im Lager liegt, kommen von dort – nicht in die
    Bestellmail, kein „Muster bestellen“-To-do. Einzelmuster zählen beim Verschicken ab (Ereignis mit
    `lagerId` in `musterherkunft.json`). Lagerplatz an der Position im Einkauf und in der Bestellmail-Begründung.
  - *Server:* `operations/lib/musterlager.mjs`, `GET/POST /api/einkauf/musterlager`,
    `GET /api/einkauf/musterlager-farben`; `musterlager.json` in Sicherung und Prüfkopie.
- **Getestet:** neu `operations/tests/musterlager.test.mjs` (12), `docs/ai-dashboard/tests/musterlager-api.test.mjs`
  (5, inkl. Rolle „lesen“ 403 / „mitarbeiter“ 200), `tests/bestellinhalt.test.mjs` (5), `todos.test.mjs` +1;
  `npm test` alle 7 Suiten grün, Guards und `validate --static` PASS. `dashboard:pruefen` (Heute, Einkauf,
  Musterlager, Bestellungen bei 1440/390 px) nur OK, 0 px Überlauf. Klickstrecke gegen die Datenkopie:
  Regalia Creme (511) als Einzelmuster 2 Stück „Regal B, Fach 3“ eingelagert → die offene Bestellung zeigt „1 aus dem
  Musterlager (Regal B, Fach 3)“, Heute „Muster verschicken an … · aus dem Musterlager“, die zwei anderen Farben
  weiter „bei Lieferant A bestellen“, Bestellmail nimmt Creme (511) mit Grund aus; Vorschlag Selene Taupe mit
  vorbelegter Art „Probestück“ eingelagert; „Ist leer“ → Creme (511) wieder beim Lieferanten. 0 JS-Fehler.
- **Risiken/Annahmen:** Zuordnung über die SKU – ein Muster ohne SKU (Sammelprodukt ohne Quellvariante) findet
  das Lager nicht und läuft wie bisher. Probestück und Bahn zählen nicht ab; wer das letzte Stück aufbraucht,
  muss „Ist leer“ klicken. Im gemeinsamen Zugang steht „Inhaber“ als handelnde Person im Verlauf.
- **Nächste Stufe:** Inhaberfragen (PVC/Linoleum im Shop wieder mit Muster, wenn ein Probestück da ist;
  Etiketten mit QR-Code; Mustergröße je Bahn); die zwei schon eingetroffenen Probestücke (PVC, Linoleum) einlagern.

## 2026-10-12 · Lexikon: Bestellweg als Schnellzugriff, wenn es keinen Link gibt (#1168)

- **Geändert:** Auftrag des Inhabers: bei Ware und Mustern immer ein Schnellzugriff zum Lieferanten. Lieferant B
  hat online keine Artikelseiten und keine brauchbare Suche – 654 Varianten (Wohnteppich, Teppich nach Maß,
  Teppich, Dekofell) hatten weder Direkt- noch Suchlink. Neu `lexikonSchnellzugriff()` und
  `lexikonProduktMitSchnellzugriff()` in `operations/lib/lieferanten.mjs`: `/api/lexikon/produkt` hängt an
  jede Variante ohne Link den Bestellweg aus den Lieferanten-Stammdaten (Mail, Portal, Telefon; Hauptweg
  zuerst). Das Lexikon zeigt unter „Zum Bestellen“ einmal Weg, Kundennummer und „Anrufen“, je Variante
  „Bestellmail“ (mit Artikel-/Farbnummer und Bezeichnung des Lieferanten, Menge und Lieferanschrift leer
  zum Ausfüllen) plus „in Gmail“; Muster entsprechend über den Musterweg. Ohne Stammdaten ein Hinweis, was
  fehlt und wo es gepflegt wird.
- **Daten (nicht im Repo):** Bestellweg von B aus der Korrespondenz belegt (Bestellungen per Mail an den
  Verkauf, zuletzt 12.10.; Kundennummer aus zwei Mails) und in der privaten Stammdatendatei eingetragen –
  damit zeigt auch die Lieferantenkarte im Einkauf „per E-Mail“ und die fertige Bestellmail.
- **Getestet:** 6 neue Tests in `operations/tests/lieferanten.test.mjs`, 2 in `api.test.mjs`;
  `dashboard:test` 253/253, `npm test` grün. Gegenprobe über den ganzen Export: 14434 Varianten – 12898
  Direktlink, 882 Suchlink, 654 Bestellweg, 0 ohne; 5850/5850 Muster mit Weg. `dashboard:pruefen` (Lexikon,
  Fellara, Kontura, Einkauf) 1440–360 px nur `OK`, 0 px Überlauf. Klickstrecke gegen die Kopie: Bestellmail
  an die hinterlegte Adresse mit Betreff „Bestellung – Kd.-Nr. … – Art.-Nr. …“, Gmail-Link gleich befüllt,
  `tel:`-Link; ohne Eintrag Hinweis mit Datei, mit leerem Eintrag „Was fehlt?“ → Lieferant-Detail
  „noch keine Stammdaten hinterlegt“; 0 JS-Fehler.
- **Risiken/Annahmen:** Die Lieferzeit von B steht nur als Freitext in den Hinweisen („ca. 5 Tage“ ist nicht
  als Werktage belegt). Die Trefferliste zählt Bestellweg-Varianten weiter als „Link fehlt“.
- **Nächste Stufe:** Musterweg von B eintragen, sobald belegt.


## 2026-10-13 · Muster und Rückrufe: das Control Center führt (w-078, #1201)

- **Geändert:** Entscheidung des Inhabers (Werkbank w-078): Shop-Musterbestellungen und Rückrufwünsche werden im
  Control Center nachgefasst (Heute → „Muster nachfassen“, Kunden → „Rückrufe“), nicht mehr in der Laden-Ansicht der
  Auftrags-App. Die App legt dafür ab Version 50 keine Beratungsfälle mehr an und zeigt nur noch Zahl und Link hierher.
  Damit nichts durchfällt, gehört „Verlegung: Angefragt“ jetzt in die Rückrufliste (`istRueckrufKandidat`, Thema
  „Interesse an Aufmaß/Verlegung“) – die interne Bestellmail sagt dazu „bitte beim Rückruf ansprechen“, bisher rief
  dafür der Laden über die App zurück. Text im Reiter „Rückrufe“ angepasst; die Laden-Kachel zählt unter „Aus dem Shop“
  nur noch Anfragen (Kontaktformular).
- **Getestet:** neue `operations/tests/rueckrufliste.test.mjs` (3), `dashboard:test` 295/295, `npm test` grün;
  `dashboard:pruefen` (Heute, Kunden, Rückrufe) bei 1440 und 390 px nur `OK`, 0 px Überlauf.
- **Risiken/Annahmen:** Eine Bestellung mit „Verlegung: Angefragt“ ohne Beratungswunsch erscheint jetzt als offener
  Rückruf (vorher nur in der Laden-Ansicht). Muster außerhalb des Verlegegebiets standen schon immer nur hier.
- **Nächste Stufe:** Wer die offenen Zahlen „Muster nachfassen“/„Rückrufe“ auch in der Laden-Ansicht sehen will:
  das Control Center müsste sie beim Abruf von `?ansicht=zahlen` an die App mitgeben (eigener Schritt, braucht
  `LADEN_ZAHLEN_SCHLUESSEL`). Bis dahin zeigt die App die Zahl der eingegangenen Muster-/Rückruf-Mails (7 Tage).

## 2026-10-13 · „An Kunden raus“ bucht den Versand in Shopify (#1185)

- **Geändert** (Inhaber 13.10., Werkbank w-079; Details ARCHITEKTUR §17):
  - *Für die Mitarbeiter:* „Als raus zum Kunden markieren…“ (Einkauf), „Muster sind verschickt…“ bzw. „An Kunden
    raus…“ (Zeitleiste) und „An Kunden raus…“ in Kunden › Bestellungen öffnen ein Fenster „An Kunden raus“: Häkchen für die Artikel im Paket (Teillieferung),
    Sendungsnummer und Versanddienst (optional), „Kunde bekommt die Versandmail von Shopify“. „Als verschickt
    buchen“ setzt den Schritt **und** bucht die Sendung in Shopify; Shopify schickt die Versandmail, mit
    Sendungsnummer samt Verfolgungslink. Persönlich vorbeigebrachte Muster und „Kunde hat Muster“ (eigener
    Bestand): gebucht, ohne Mail; die Mail-Wahl steht an der Position und gilt auch beim Nachholen.
  - *Wenn es nicht klappt* (Recht fehlt, kein Zugang, Netz, in Shopify zurückgehalten): Der Schritt steht trotzdem,
    die Rückmeldung ist rot und sagt den Grund; an der Zeitleiste und an der Einkaufsposition steht „Versand nicht
    in Shopify gebucht“ mit „In Shopify buchen“ zum Nachholen (je Sendung eine Buchung mit ihrer Nummer). Endgültige
    Gründe (storniert, Testbestellung, Artikel nicht mehr in der Bestellung) zeigen keinen roten Hinweis. Im
    Protokoll „Versand in Shopify gebucht / nicht gebucht / unklar“, Fehlschläge zusätzlich im Dienstprotokoll.
  - *Sicherheit:* der alte Einzelweg je Position bucht nicht mehr sofort („ausstehend“, dann ein Paket über „In
    Shopify buchen“) – sonst je Artikel eine Mail; Zeitlimit 25 s je Shopify-Aufruf; nur Positionen, die vor dem
    Klick noch nicht raus waren; nie rückwirkend (alte „raus“-Positionen
    ohne Vermerk bleiben unberührt); Buchungen derselben Bestellung nacheinander und gegen die frisch gelesene offene
    Menge – doppelter Klick bucht nicht doppelt. Zurückhaltung „Bestand fehlt“ hebt das Control Center auf, andere
    Gründe nicht. Testbestellungen und stornierte Bestellungen werden nicht gebucht.
  - *Hinweis „In Shopify noch nicht als versendet gebucht“* entfällt, sobald der Vermerk „gebucht“ da ist (der
    Bestellexport hinkt bis zum nächsten Lauf hinterher); bei gescheiterter Buchung heißt er „Versand in Shopify nicht
    gebucht – in der Bestellung nachholen“.
  - *Handy:* Rückmeldungen erscheinen bei offenem Dialog oben, nicht über den Knöpfen des von unten kommenden Dialogs.
  - *Prüfwerkzeug:* `dashboard:pruefen` startet seine Instanz ohne Shopify-Zugang (auch nicht aus `.env.local`).
  - `SCHREIB_BEREICHE` um `write_fulfillments` und `write_merchant_managed_fulfillment_orders` ergänzt
    (`operations:verbindung` meldet sie, wenn sie fehlen). Beide sind erteilt (Lesprobe 13.10.).
- **Getestet:** neu `operations/tests/versand.test.mjs` (15: Teillieferung, bereits erfüllt, Recht fehlt beim Lesen
  und Buchen, Netzfehler beim Lesen / Antwort verloren nach und vor der Buchung / ohne Beleg = unklar,
  Zurückhaltung aufheben bzw. stehen lassen, Teilergebnis, Ablehnung, gleichzeitig gebucht, storniert,
  Testbestellung laut Shopify, Spedition, geschlossene Fulfillment Orders), `docs/ai-dashboard/tests/versand-api.test.mjs`
  (10: Auswahl, Einzelklick, doppelter Klick → 1 Buchung, Recht fehlt → nachholen, kein Zugang, unklar, keine
  rückwirkende Buchung, Testbestellung, Vorbeibringen ohne Mail, Nachholen mit Mail-Wahl und je Sendung, storniert,
  Zurück auf offen), `auftragsstatus.test.mjs` (Vermerk). Zwei Review-Runden (`code-review` high, 15 + 15 Befunde) eingearbeitet; bewusst
  belassen: Freigabe „Bestand fehlt“ für die ganze Fulfillment Order (ARCHITEKTUR §17), „erledigt“ ohne „raus“
  bucht nichts (nur „raus“ ist beauftragt). Lesprobe der Standabfrage gegen den echten Shop (nur lesend): 3 offene
  Bestellungen „buchbar“, die 2 zurückgehaltenen „aufhebbar“.
  `dashboard:test` und `npm test` grün (nach Rebase auf `main`), Guards, `validate --static` und `secret:scan` PASS.
  `dashboard:pruefen` 22 Ansichten × 5 Breiten = 110 × OK, 0 px Überlauf; `--rollen` bei 390/1440 px 98 × OK
  (Inhaber 44, Mitarbeiter 28, „lesen“ 26). Klickstrecke gegen die Datenkopie mit
  Shopify-Attrappe (nie echter Shop): Musterbestellung mit 3 Artikeln, 1 abgewählt, Sendungsnummer + GLS → 1 Buchung
  mit 2 Zeilen, Mail an, Sendung GLS; Rest danach → 1 Buchung mit 1 Zeile; nächster Schritt „Muster sind unterwegs
  zum Kunden“. Einkauf in der Prüf-Instanz ohne Zugang: 1 von 3 vorgewählt, rote Rückmeldung „… kein Zugang …“,
  1 rote Zeile + 1 Knopf „In Shopify buchen“ an der Position; Nachholen aus der Kundenakte → 1 Buchung, rote Zeilen
  1 → 0. Handy 390 px: Dialog 390 px breit, 0 px Überlauf, Esc schließt, Mail abgewählt → Buchung ohne Mail;
  „Bitte mindestens einen Artikel ankreuzen“ steht bei 14–55 px, der Dialog beginnt bei 229 px (vorher lag ein
  Hinweis über dem Häkchen). 0 JS-Fehler.
- **Risiken/Annahmen:** Die Buchung schickt dem Kunden eine echte Mail – deshalb das Fenster statt eines Ein-Klick-
  Knopfs. Ein versehentliches „raus“ lässt sich im Control Center zurücknehmen, die Sendung in Shopify und die Mail
  nicht (der Dialog „Zurück auf offen“ sagt das). Musterbestellungen seit 21.09.: 21 in Shopify nicht erfüllt
  (19 unerfüllt, 2 zurückgehalten), 12 davon stehen im Control Center schon auf „raus“ oder später – sie werden
  bewusst nicht nachträglich gebucht.
- **Nächste Stufe:** Entscheidung des Inhabers, ob die 12 alten Muster-Sendungen ohne Mail in Shopify nachgebucht
  werden sollen (ein Sammelknopf wäre klein); Sendungsnummer später direkt aus dem Versandetikett übernehmen.

## 2026-10-13 · Auslauf-Prüfung (wöchentlich)

- **Geändert:** `operations/lib/auslauf.mjs` (Prüfziele aus dem Lexikon, Bewertung je Lieferant,
  Ausfallschutz ab 5 %), `operations/scripts/auslauf-pruefen.mjs` (`npm run auslauf:pruefen`:
  A per Schnellsuche, C/E per Produktseite, D per Headless-Browser; B nur offline),
  LaunchAgent-Vorlage `net.teppich-paradies.auslauf` (montags 4:00), `shopwacheStatus` liefert
  `auslauf` mit, To-do `auslauf` in der Website-Sicht (Befund rot, Ausfall/stumm gelb).
- **Getestet:** `operations/tests/auslauf.test.mjs`, To-do-Test; Probelauf je 15 Artikel bei A/C/D/E.
- **Risiken/Annahmen:** Archiviert wird nie automatisch – eine Störung beim Lieferanten sähe sonst
  wie ein Massenauslauf aus. Fehlcodes je Lieferant beobachtet am 13.10. (C 500, D 410, E 404).
- **Nächste Stufe:** neue Artikel einer Linie automatisch melden.

## 2026-10-13 · Auslauf-Prüfung: Neuheiten bei Lieferant A

- **Geändert:** `operations/lib/auslauf.mjs` (`artikelStamm`, `neuheitenZiele`, `neueArtikel`,
  `neuSeitVorlauf`), `auslauf-pruefen.mjs` sucht je Artikelstamm alle Ergebnisseiten der
  Schnellsuche ab (`--ohne-neuheiten` schaltet das ab), To-do `neuheiten` in der Website-Sicht.
- **Getestet:** Einheitentests; Probelauf mit 15 Stämmen (3 Kandidaten, alle plausibel).
- **Risiken/Annahmen:** Gemeldet wird nur, was seit dem letzten Lauf dazukam – der erste Lauf ist
  Grundbestand. Fällt die Suche aus (über 5 %), bleibt der Vorlauf stehen.
- **Nächste Stufe:** Grundbestand einmal sichten (bewusst nicht geführt oder anlegen?).

## 2026-10-14 · Einkauf: Karte je Lieferant in Arbeitsschritten

- **Geändert:** Inhaber: „teilweise alles sehr unübersichtlich“, dazu „für Nachfassen extra Zeile, für
  Muster bestellen extra Zeile, und wichtigste natürlich Bestellungen ganz vorne“. Vorher stand auf der
  Karte eine gemischte Liste „Zu bestellen“ (Ware und Muster durcheinander, nur 4 sichtbar), jedes Muster
  als eigene Zeile mit doppeltem Namen, von 25 laufenden Posten 3 („+ 22 weitere“), vier Zahlen-Chips im
  Kopf und ein gelber Kasten fürs Nachhaken; Maß und Einfassung erst in der Bestellmail, Kunde am
  Zeilenende. Jetzt: Abschnitte „Ware bestellen“ (mit Bestellknopf, Menge, Fertigmaß, Einfassung,
  Kunde · Auftrag, Blockiert-Grund), „Muster bestellen“ (je Kunde eine Zeile mit allen Farben),
  „Nachfassen“ (alle überfälligen Posten, Knopf Anrufen/E-Mail/Kontakt), darunter ruhig was im Plan
  läuft. „Ist eingetroffen“ direkt an bestellter Ware. Kacheln oben: Ware zu bestellen · Muster zu
  bestellen · Aufträge nachfassen · Aufträge mit Problem (die Zahl offener Kundenaufträge steht unten
  bei „Alle offenen Aufträge“). Neu `lib/einkauf-uebersicht.mjs`, Anleitung und Hilfe nachgezogen.
  Baut auf #1248/#1251 auf; Bestellmengen- und Statuslogik unverändert.
- **Getestet:** `tests/einkauf-uebersicht.test.mjs` (4); `dashboard:test` 313 grün, `npm test` alle
  Suiten grün (2488 Tests); `dashboard:pruefen` 22 Ansichten × 5 Breiten = 110 × OK, 0 px Überlauf.
  Klickstrecke gegen die Datenkopie (390 px): „Ist eingetroffen“ → Filter „Bestellt“ 26 → 25,
  „Bei uns eingetroffen“ 0 → 1, Abschnitt „Bestellt, im Plan“ 13 → 12; Muster-Dialog öffnet, Esc
  schließt; 0 JS-Fehler. Kachel „Aufträge nachfassen“ 4 = Abschnitt „Nachfassen 4 Aufträge“.
- **Risiken/Annahmen:** „Blockiert“ prüft im Browser nur Artikelnummer und Menge; was die Bestellmail
  zusätzlich ausschließt, steht weiter im Dialog. Eine Kundenbestellung mit Posten bei zwei Lieferanten
  zählt in der Nachfass-Kachel je Lieferant. PR #1225 (offen) ändert dieselben Dateien.
- **Nächste Stufe:** die aufgeklappte Tabelle („Positionen bearbeiten“) am Handy kürzen (bei Lieferant A
  rund 18 000 px hoch); Heute-To-dos in derselben Reihenfolge (Bestellen, Muster, Nachhaken) sortieren.

## 2026-10-20 · Muster-Etiketten drucken (Niimbot B1)

- **Geändert:** Musterbestellung aufklappen → „Etiketten drucken“: alle Muster der Bestellung als
  50 × 50-mm-Etiketten mit Vorschau, nacheinander gedruckt in einem Auftrag. Einkauf › Musterlager →
  „Etikett drucken…“ für ein Etikett von Hand (Produktlink genügt). Inhalt: Shopname, Serie, Farbe,
  bei Paketware Art, Stärke/Nutzschicht, Nutzungsklassen, Format; QR-Code zur Produktseite;
  Artikelnummer der echten Variante. Fehlende Angaben stehen rot unter der Vorschau. Verbindung per
  Bluetooth (USB als Ausweg), nur Chrome/Edge auf https bzw. localhost. Neu `lib/muster-etiketten.mjs`,
  `bausteine/etiketten-druck.mjs`; Lexikon-Export führt zusätzlich `nutzschicht`, `format`, `arten`.
- **Getestet:** `tests/muster-etiketten.test.mjs` (11); `dashboard:test` 476 grün, `npm test` alle
  Suiten grün; `dashboard:pruefen` 145 × OK, 0 px Überlauf. Datenkopie: 39 Musterbestellungen →
  105 Etiketten, 58 vollständig, 47 ohne Artikelnummer (Produkte ohne SKU im Shop, z. B. Teppich nach
  Maß), 4 ohne Farbe, 0 mit Muster-SKU, 6 mit Technikzeilen. Klickstrecke (Kopie, 800 px):
  Bestellung aufklappen → „Etiketten drucken“ → 2 Etiketten; Musterlager → Produktlink eintragen →
  1 Etikett mit 4 Technikzeilen; Esc schließt; 0 JS-Fehler. niimbluelib lädt mit SRI, `encodeCanvas`
  liefert 400 × 400.
- **Risiken/Annahmen:** Echter Druck nicht geprüft (kein Drucker am Prüfrechner). Bild 400 px breit
  bei 384 px Druckkopf wie in NiimBlue – Rand 18 px hält Inhalte im Druckbereich. Serie aus dem Titel
  (Marke nur, wenn der Titel damit beginnt).
- **Nächste Stufe:** „auch als Klickvinyl“ bei gleichem Dekor in anderer Art; Druck am B1 bestätigen.

## 2026-10-20 · Akquise ausgebaut, Einkauf mit Termin und Referenz (#1544)

- **Geändert:** Akquise ist jetzt auch für Mitarbeiter offen (Router, Navigation, Server; Rolle
  „lesen“ schreibt weiter nichts), die Fortschrittszeile nennt, wer angeschrieben hat. TED-Titel ohne
  „Deutschland – <Kategorie> –“ (`titelKurz`, auch in `ausTed`). Nach „Antwort bekommen“ steht auf der
  Karte eine kleine Zeile „Unser Richtpreis: …“ (nur, wenn `$TP_PRIVAT_DIR/akquise/richtpreise.json`
  existiert; ohne Freigabe „Richtpreis noch nicht freigegeben (Inhaber)“) und der Knopf
  „Angebotsentwurf“ (Text zum Kopieren, kein Lexware-Zugriff). Einkauf „Je Auftrag“: Einleitung
  gekürzt; nach „Kunde informiert“ ein Datumsfeld „Termin“ und der Link „Als Referenz merken“ (Notiz,
  privat in `akquise/referenzen.json`, in der Akquise zugeklappt „Referenzen (N)“). Am Vortag eines
  Termins To-do „Kunde an Termin morgen erinnern“ mit „Text kopieren“. Bestellnachricht: Feld
  „Bestellnummer des Lieferanten (aus der AB)“ mit Hinweis, die Bitte um Bestätigung nennt die
  Kommission. Neu `/api/akquise/referenz`, `/api/einkauf/kundentermin` (beide in der write-Liste).
- **Getestet:** `tests/akquise.test.mjs` 14 (Rollen lesen 403 / mitarbeiter 200, Titel, Richtpreis,
  Referenz, Termin-To-do); `dashboard:test` 612 grün, `npm test` alle Suiten grün; `dashboard:pruefen`
  170 × OK, 0 px Überlauf 360–1440 px. Klickstrecke gegen die Datenkopie (390 px): angeschrieben 1 → 2
  mit Namen, Antwort → Richtpreis-Hinweis, Angebotsentwurf öffnet, Esc schließt; Termin auf morgen →
  To-do „Kunde an Termin morgen erinnern: #1013“ im Laden; Kunde informiert → „Als Referenz merken“
  → „Referenzen (1)“; 0 JS-Fehler.
- **Risiken/Annahmen:** Richtpreis-Vorschläge stammen aus Lexware-Artikelpreisen (Abruf 13.10., netto,
  nur Arbeit), `freigegeben: false` bis der Inhaber zustimmt. Fotos zur Referenz weiter über „Fotos“.
- **Nächste Stufe:** Richtpreise live in Lexware gegenprüfen und freigeben.

## 2026-10-23 – Kostenlose Muster automatisch bestellen (#1648)

- Vorhandene Bestellvorlagen und Firmenpostfach fuer privat freigegebene kostenlose Muster verbunden.
- Versandnachweis und Bestellt-Status automatisch; Artikel und Farben je Kunde direkt sichtbar.
- Doppelversand, unklare SMTP-Ausgaenge, alte Anfragen und kostenpflichtige Muster abgesichert.
