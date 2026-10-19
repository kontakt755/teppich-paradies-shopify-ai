# Control Center – Fortschritt

Format je Inkrement: Änderung · Test · offene Risiken/Annahmen · nächste Stufe.

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
