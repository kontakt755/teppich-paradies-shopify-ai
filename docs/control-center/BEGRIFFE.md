# Begriffe im Control Center

Eine Liste fuer alle sichtbaren Woerter im Control Center. Wer eine Ansicht,
einen Knopf oder ein To-do neu beschriftet, nimmt die Woerter von hier. Gilt
seit 2026-10-21 (Wunsch eines Mitarbeiters: leicht und eindeutig, fuer neue
Leute im Laden genauso wie fuer alte Hasen).

## Regeln

- **Alltagsdeutsch.** Das Wort sagt, was man dort *tut* oder *findet*.
- **Kurz.** Menuepunkte hoechstens zwei Woerter.
- **Ein Begriff = eine Bedeutung**, ueberall gleich (Menue, Seitentitel,
  Knoepfe, To-dos, Hilfe, Suche/Befehle).
- **Fachwoerter nur, wenn sie im Laden- und Bodenlegeralltag ueblich sind**
  (Kommission, Lieferschein, Muster). Abkuerzungen ausschreiben.
- **Unter jedem Seitentitel genau ein Satz „Hier …“**, was man auf der Seite
  macht. Kein zusaetzlicher Kasten.
- **Routen bleiben** (`#/akquise`, `#/lexikon`, `#/einkauf` …), damit alte
  Links weiter gehen. Nur die Beschriftung aendert sich. Interne Namen in
  Code, Dateien und Kommentaren duerfen bleiben.

## Alt → neu

| Alt | Neu | Wo / Bemerkung |
|---|---|---|
| Akquise | **Genossenschaften** (Seite: „Genossenschaften & Hausverwaltungen“) | Menue, Seite, To-do „Genossenschaften: N Firmen nachfassen“; enthaelt auch Ausschreibungen. Nicht verwechseln mit „Neue Aufträge“ der Auftrags-App-Zahlen |
| – (neu 28.10.) | **Hausverwaltungen** | Menue „Kunden & Einkauf“, Seite und To-do „Hausverwaltungen: N wieder melden“; Verwaltungen mit Ansprechpartner, Objekten und Angeboten. Die Erstansprache bleibt unter „Genossenschaften“ |
| Einkauf | **Bestellen** | Menue und Seitentitel; gemeint ist immer: wir bestellen beim Lieferanten. Die Bestellungen der Kunden heissen weiter „Bestellungen“ |
| Lexikon | **Lexikon** (bleibt, Inhaber/Mitarbeiter 21.10.) | Menue, Seite, Handy-Leiste |
| Belege (Reiter) | **Lieferantenpost** | Reiter unter „Bestellen“; ein einzelnes Stueck ist ein „Schreiben“ |
| AB | **Auftragsbestätigung** | ausgeschrieben in Ueberschriften und Feldern |
| Wiedervorlage | **wieder melden (am)** | Spalten, Kacheln, Leerzustaende |
| Arbeitsplatz | **Vorbereiten** | E-Mail, Angebot, Recherche vorbereiten |
| Aufgaben & Organisation | **Aufgaben** | |
| Shop-Wache | **Shop-Kontrolle** | Seite und To-dos |
| Entwicklung | **Technik** | GitHub-Aufgaben an Shop und Technik (nur Inhaber) |
| Freigaben | **Entscheidungen** | nur Inhaber |
| Review / Review-Queue | **Zur Prüfung** | Status; Knoepfe „Zur Prüfung geben“, „Prüfung abschließen“ |
| Triage | **Sichten** | Status „Sichten“, Filter „Zu sichten“ |
| Owner | **Zuständig** | „ohne Zuständigen“, „Zuständigen festlegen“ |
| Unzugeordnet | **Ohne Zuständigen** | Filter |
| Insights | **Kennzahlen** | nur Inhaber |
| Aktivität | **Verlauf** | nur Inhaber |
| Team · Zugänge | **Zugänge** | nur Inhaber |
| Werkbank | **Ideen & Fragen** | Link zur eigenen Anwendung |
| GitHub synchronisieren | **Aufgaben neu laden** | |
| Packliste (lokale Datei) | **Packstation** (Arbeitsgang: „Muster packen“) | Reiter unter Kunden (#1572); „Umschlag gepackt“ ist der gemeinsame Stand, das Abhaken je Muster nur eine Packhilfe am Gerät |
| Einkauf & Wareneingang (Menuepunkt) | **Bestellen** | Menuepunkt unter „Kunden & Einkauf“, wie der Seitentitel (Rundgang 26.10.2026) |
| Partnerladen | **Lieferant** | Packstation, Reiter „Muster kommt an“ („Lieferant nicht hinterlegt“) |
| Wareneingang nach Partnerladen | **Muster kommt an** | Reiter der Packstation; auch in Leerzustaenden und Rueckweg-Knoepfen |

## Bleibt bewusst

Heute, Kunden, Sonderposten, Bildrechte, Social Media, Ratgeber, Bereiche,
Hilfe, Musterlager, Produktdaten, Kommission, Lieferschein, Ampel (im Laden
gebraeuchlich), Erfassen.

## Noch offen

- **Gewicht & Rollenmaße berechnen:** unverbindliche Vorschlaege aus Teppichmassen, Gesamtgewicht je m², Gesamtdicke und Verpackung; fertiges Packstueck weiterhin messen und wiegen.
- **Rollenachse:** Laenge der aufgerollten Teppichkante; bei mehreren Teppichen mindestens die laengste kurze Seite.

- In der Tabelle der Lieferantenpost steht in den Zellen weiter die Kurzmarke
  „AB 14.10.“ / „LS 16.10.“ (`ART_KURZ` in `lib/lieferbelege.mjs`), die
  Spaltenkoepfe sind ausgeschrieben.

- **Großbrief vorbereiten:** Gewicht und Maße je Umschlag speichern und prüfen; kauft kein Porto und bucht keinen Versand.

## Bestellungen und Packstation (22.10.2026)

- **Bestellungen** = Kundenbestellungen; **Bestellen** = Einkauf beim Lieferanten.
- **Packbereit** = alle Muster haben bestaetigten Bestand oder sind bereits eingelegt, Aufkleber und Adresse sind eindeutig.
- **Wartet auf Ware** = mindestens ein Muster ist noch nicht als vorhanden bestaetigt.
- **Alle offenen** = Standard der Packstation (26.10.2026): Packbereit, Zu klaeren und Wartet auf Ware zusammen; wartende Umschlaege mit Anmerkung „Noch nicht da … bestellt am …“.
- **Zu klaeren** = fehlende Muster gemeldet oder Aufkleber/Adresse nicht eindeutig.
- **Aufkleber drucken** (je Muster) = nur dieses Muster neu etikettieren; **Aufkleber erneut drucken** = ganzer gepackter Umschlag samt Adresse (26.10.2026).
- **Alle n Muster eingelegt – Umschlag gepackt** = alle offenen Muster abhaken und den Umschlag packen in einem Schritt.
- **Versatz waagerecht / senkrecht** (Drucker-Einstellungen) = Druckbild um bis zu 3 mm verschieben, wenn der Drucker nicht mittig auf das Etikett druckt; gilt je Rechner, die Vorschau bleibt mittig (26.10.2026).
- **Außerhalb der Packliste** = Suchtreffer in Musterbestellungen, die hier nicht gepackt werden (Zahlung offen, geschlossen, storniert, schon versandt oder erledigt).
- **Bestellung packen** / **Muster kommt an** = die zwei Reiter der Packstation (26.10.2026); vorher „Nach Kunde packen“ / „Wareneingang nach Partnerladen“. Seit 29.10. führt auch der Knopf auf Heute (vorher „Muster-Wareneingang“ in die Bestellen-Liste) zu „Muster kommt an“.
- **Aufkleber-Druckliste** (29.10.) = vorher „Etiketten-Druckliste“ bzw. „Gemeinsame Druckliste“; Knöpfe im Musterlager „Aufkleber“ / „Aufkleber drucken…“ statt „Etikett“. „Etikett“ bleibt nur für das Druckmaterial (Etikettenrolle, Drucker).
- **Schritte im Umschlag:** 1 · Bestellung drucken („Aufkleber und Adresse drucken“), 2 · Was ist da? („Da: x von n · Fehlt: …“), 3 · Zukleben („Umschlag gepackt“).
- **Fehlt noch – zurücklegen** = Umschlag geht nach „Zu klären“, bis „Fehlendes ist da – weiter packen“.
- **Eingelegt ✓** = Muster liegt überklebt im Umschlag (derselbe Haken wie in der Liste).
- **Ratgeber drucken** = Kurz-Ratgeber zur Bodenart als PDF (zwei Seiten, beidseitig), Bestellnummer und Maß schon eingetragen; **Bitte beilegen: Ratgeber …** steht im Dialog „An Kunden raus“, wenn die Ware bei uns liegt oder abgeholt wird (28.10.2026).
- **Ratgeber zum Ausdrucken** = leere Vorlagen aller Bodenarten unter Kunden → Bestellungen (nur bei Waren), ohne Bestellbezug (29.10.2026).
- **Umschlag vorbereitet** = Aufkleber und Adresse sind gedruckt, der Umschlag liegt bereit und wartet auf die
  fehlenden Muster; sichtbar auf allen Geräten, mit Datum und Person. **Schon gedruckt** trägt es von Hand nach,
  **Druckvermerk zurücknehmen** (unter „Mehr …“) nimmt es zurück (#1718, 26.10.2026).
- **x von n Mustern schon im Umschlag** = Marke in Bernstein für einen angefangenen Umschlag (mindestens ein Haken);
  ersetzt „x von n abgehakt“, solche Umschläge stehen in ihrer Gruppe oben (#1720, 26.10.2026).
- **Gepackt** = gemeinsamer Packstand; keine Versandbuchung.
- **Abgehakt / versandt** = aus der Bestell-Arbeitsliste genommen; die Zeile unterscheidet manuelles Abhaken, Versand und Abschluss.
- Umschlaege tragen die Bestellnummer(n), keine wechselnden Listennummern.
- **Alle Bestellungen** = alle echten Bestellungen im aktuellen Export, einschliesslich Storno und Archiv; Testbestellungen bleiben gesondert.
- **Kontrolle nötig** = unklare Artikel, offene Versandbuchung oder manueller Haken ohne nachgewiesenen Versand.


## Vier Arbeitswege (#1614)

- **Muster bestellen** = offene Muster je Lieferant vorbereiten; vorhandener Dialog,
  Bestellstand erst nach bewusster Bestaetigung. Allgemeiner Einkauf bleibt unter „Kunden & Einkauf“.
- **Weitere Aufgaben heute** = uebrige Tagesaufgaben unter der priorisierten Bestellarbeit.
- **Probleme** (Shop-Übersicht, seit 29.10., w-206) = nur die roten To-dos, ganz oben; „Rot heißt: das muss
  heute jemand lösen.“ Gelbes und Normales sowie Laden-Anfragen, Angebote und Team-Aufgaben bleiben
  unter „Weitere Bereiche“.
- **Arbeitsliste** in der Packstation = Alle offenen (Standard) oder jeweils Packbereit / Wartet auf Ware /
  Zu klaeren / Gepackt; die Suche beruecksichtigt alle vier Listen und liest auch Hersteller, Produkt und Farbnummer.
- **Weitere Filter** = zusaetzliche Bestellfilter; vier Hauptfilter bleiben direkt sichtbar.

## Shopfokus (#1624)

- **Shop-Übersicht** = Startseite für Warenbestellungen, Muster und Versand; zahlende
  Warenkunden stehen zuerst. Allgemeine Laden- und Tagesaufgaben bleiben unter „Weitere Bereiche“.
- **Waren / Muster / Waren und Muster** = unabhängige Artwahl der Bestellliste. Ein gemischter
  Auftrag bleibt bei Waren und bei Mustern auffindbar; Statusfilter gelten zusätzlich.
- **Warenfortschritt** = Fortschritt ausschließlich der Warenpositionen eines Auftrags;
  Muster und bewusste Gesamtbestellaktionen bleiben in den Details erhalten.
- **Bestellwert** = Wert der ganzen Bestellung einschließlich eines eventuellen Musteranteils;
  kein Warenumsatz, Gewinn oder Nachweis eines Zahlungseingangs.
- **Musterwirkung** = beobachtete Musterbestellungen und spätere belegte Warenkäufe im
  verfügbaren Bestand; keine behauptete Kaufursache oder Rentabilität.
- **Ohne beobachtetes Muster** = im verfügbaren Betriebsbestand kein früheres Muster belegt;
  frühere Muster außerhalb des Fensters bleiben möglich.
- **Noch junge Musterkunden** = die erste beobachtete Musterbestellung ist für eine längere
  Beobachtung noch zu neu; das ist kein Misserfolg.
- **Betriebsbestand / Betriebsfenster** = letzte 90 Tage plus ältere offene Versand- und
  Zahlungsfälle; kein vollständiges Bestellarchiv.
- **Nicht bestimmbar / unklar** = Quelle oder Beleg reicht nicht; darf nicht als Null,
  ausgebliebener Kauf oder erledigte Arbeit gelesen werden.
- **Versandt, Empfang noch nicht belegt** = vorhandener Versandstand ohne bestätigte
  Zustellung oder dokumentierten Empfang; kein Beweis eines Verlusts.
- **Hausknopf** = zurück zur Shop-Übersicht; **Mehr** öffnet weitere vorhandene Arbeitswege.

## Aufräumen (#1698)

- **Alte Bestellungen aufräumen** = Block auf der Shop-Übersicht, nur sichtbar, wenn es Fälle gibt:
  offene Bestellungen ohne Bewegung (Muster ab 14, Ware ab 30 Tagen), bei denen nichts belegt, dass sie
  fertig sind.
- **Keine Bewegung** = seit dem Tag hat niemand etwas erfasst (Bestellt, Angekommen, Notiz, Packstation …).
- **Abschließen** = alle offenen Artikel auf „Erledigt“ mit dem Vorschlag als Vermerk; in Shopify als
  versendet gebucht, ohne Mail an den Kunden (wie „Kunde fertig“).
- **Läuft noch** = die Bestellung bleibt offen; das Dashboard merkt sich das als Notiz und fragt nach
  14 Tagen (Ware 30) wieder.
- **Belegt fertig** = in Shopify versendet, storniert, archiviert oder voll erstattet, oder im Dashboard
  abgeschlossen; fällt ohne Klick aus den Listen.
- **Gepackt, nicht verschickt** (#1709) = Umschlag in der Packstation gepackt, Versand aber nicht
  eingetragen; steht nach 3 Tagen in der Aufräumliste.
- **Ist verschickt…** = Versanddialog „An Kunden raus“ für diesen Umschlag, Versandmail vorab aus.
- **Liegt noch hier** = der Umschlag ist noch nicht zur Post; die Liste fragt nach 3 Tagen wieder.

## Dashboard-Updates (#1710)

- **Dashboard-Update** = eine neue Version des Control Centers. Sie kommt von selbst (alle
  5 Minuten geprüft, vorher getestet); offene Seiten zeigen dann „Neue Version verfügbar“.
- **Dashboard-Update hängt** = Zeile im Systemzustand: die neue Version wurde nicht übernommen,
  das Dashboard läuft auf dem bisherigen Stand weiter. Dann Claude im Chat Bescheid geben.
- **wartet** = eine neue Version ist getestet, wird aber erst übernommen, wenn gerade niemand
  eingibt und kein Codex-Lauf arbeitet; erst nach über einer Stunde Warten wird das gemeldet.

## Rundgang 26.10.2026

- **Sendungsnummer schon vergeben** = Hinweis im Versanddialog, wenn dieselbe Nummer schon an einer
  anderen Bestellung steht; gebucht wird erst nach **Trotzdem buchen** (nur wenn wirklich beide
  Bestellungen im selben Paket sind).
- **Bestellmail öffnen (Lieferant)** / **Ware ist bestellt…** = die zwei Knoepfe im Schritt „Ware beim
  Lieferanten bestellen“ der Kundenakte; der zweite fragt nach, ob wirklich alles bestellt ist.
- **Lieferant nicht zugeordnet** = statt „UNGEKLAERT“; ohne Stammdaten-Namen „Lieferant A“ usw.
- **Inhaberzeile** = eine Zeile unter den Warenbestellungen, nur Inhaber: „Shop in Ordnung · 7 Tage … €
  Umsatz · N Entscheidungen offen · nächste Frist TT.MM.“; der Umsatz klappt die Kennzahlen auf.
- **Ideen & Fragen öffnen ↗** = Link unter „Entscheidungen“; die Werkbank-Fragen bleiben dort.
- **nicht eingelegt · laut Bestand da – im Regal suchen** = Packstation: als fehlend gemeldet, laut
  Auftragsfluss aber angekommen (vorher „fehlt · angekommen“).
- **Shopify ist nicht verbunden** = Sonderposten ohne Shop-Zugang, mit „Fehler melden“.
- **Alle anderen Geräte abmelden…** = Knopf unter Zugänge › Angemeldete Geräte (nur Inhaber); meldet
  im Control Center und in der Social-Zentrale ab, das eigene Gerät bleibt im Control Center angemeldet.
  Immer klickbar, auch wenn im Control Center nur dieses Gerät zählt (die Social-Zentrale zählt dort nicht mit).
