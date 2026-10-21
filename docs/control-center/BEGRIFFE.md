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
| Akquise | **Neue Aufträge** | Menue, Seite, To-do „Neue Aufträge: N Firmen nachfassen“ (Genossenschaften, Hausverwaltungen, Ausschreibungen) |
| Einkauf | **Bestellen** | Menue und Seitentitel; gemeint ist immer: wir bestellen beim Lieferanten. Die Bestellungen der Kunden heissen weiter „Bestellungen“ |
| Lexikon | **Produktsuche** | Menue, Seite, Knoepfe „In der Produktsuche ansehen“; untere Handy-Leiste kurz **Produkte** (Platz) |
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

## Bleibt bewusst

Heute, Kunden, Sonderposten, Bildrechte, Social Media, Ratgeber, Bereiche,
Hilfe, Musterlager, Produktdaten, Kommission, Lieferschein, Ampel (im Laden
gebraeuchlich), Erfassen.

## Noch offen

- In der Tabelle der Lieferantenpost steht in den Zellen weiter die Kurzmarke
  „AB 14.10.“ / „LS 16.10.“ (`ART_KURZ` in `lib/lieferbelege.mjs`), die
  Spaltenkoepfe sind ausgeschrieben.
