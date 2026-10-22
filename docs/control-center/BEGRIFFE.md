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

## Bleibt bewusst

Heute, Kunden, Sonderposten, Bildrechte, Social Media, Ratgeber, Bereiche,
Hilfe, Musterlager, Produktdaten, Kommission, Lieferschein, Ampel (im Laden
gebraeuchlich), Erfassen.

## Noch offen

- In der Tabelle der Lieferantenpost steht in den Zellen weiter die Kurzmarke
  „AB 14.10.“ / „LS 16.10.“ (`ART_KURZ` in `lib/lieferbelege.mjs`), die
  Spaltenkoepfe sind ausgeschrieben.

- **Großbrief vorbereiten:** Gewicht und Maße je Umschlag speichern und prüfen; kauft kein Porto und bucht keinen Versand.

## Bestellungen und Packstation (22.10.2026)

- **Bestellungen** = Kundenbestellungen; **Bestellen** = Einkauf beim Lieferanten.
- **Packbereit** = alle Muster haben bestaetigten Bestand oder sind bereits eingelegt, Aufkleber und Adresse sind eindeutig.
- **Wartet auf Ware** = mindestens ein Muster ist noch nicht als vorhanden bestaetigt.
- **Zu klaeren** = fehlende Muster gemeldet oder Aufkleber/Adresse nicht eindeutig.
- **Gepackt** = gemeinsamer Packstand; keine Versandbuchung.
- **Abgehakt / versandt** = aus der Bestell-Arbeitsliste genommen; die Zeile unterscheidet manuelles Abhaken, Versand und Abschluss.
- Umschlaege tragen die Bestellnummer(n), keine wechselnden Listennummern.
- **Alle Bestellungen** = alle echten Bestellungen im aktuellen Export, einschliesslich Storno und Archiv; Testbestellungen bleiben gesondert.
- **Kontrolle nötig** = unklare Artikel, offene Versandbuchung oder manueller Haken ohne nachgewiesenen Versand.


## Vier Arbeitswege (#1614)

- **Muster bestellen** = offene Muster je Lieferant vorbereiten; vorhandener Dialog,
  Bestellstand erst nach bewusster Bestaetigung. Allgemeiner Einkauf bleibt unter „Kunden & Einkauf“.
- **Weitere Aufgaben heute** = uebrige Tagesaufgaben unter der priorisierten Bestellarbeit.
- **Arbeitsliste** in der Packstation = jeweils Packbereit / Wartet auf Ware / Zu klaeren / Gepackt;
  die Suche beruecksichtigt alle vier Listen.
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
