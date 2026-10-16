# Negative Keywords, Optimierungszyklus 16.10.2026

Konto 334-557-2870, Zeitraum 01.–15.10.2026 (Google-Ads-Oberfläche, Standardzeitraum
„Letzte 30 Tage“ = 16.09.–15.10.; vor dem 01.10. lief keine Ausgabe).
Regel aus dem Auftrag: nur klar unpassende Suchbegriffe mit Kosten ≥ 1 € und 0 Conversions,
Phrase Match auf Kampagnenebene. Vorher gelesen: `google_ads_ausschluss_entscheidungen`
(Marken „tarkett“, „teppichscheune“, „knutzen“, „vorwerk“ bleiben drin).

## Ausgangslage

- 5.936 Suchbegriffe, 563 Klicks, 219,82 € (Such- und Shopping-Kampagnen), 0 Conversions.
- Nur **31 Suchbegriffe** kosten ≥ 1 € (zusammen etwa 49 € bei 125 Klicks). Der Rest sind
  Einzelklicks unter 1 €.
- Bereits vorhanden: Liste „TP Ausschluss: Fachfremd/Jobs/Baumarkt/Wettbewerb“ (74 Begriffe,
  an 6 Kampagnen), „TP Negative Produkte“ (24, 2 Kampagnen), „Temporaer: Laminat/Parkett“
  (13, 4 Kampagnen).

## Prüfung der 31 Begriffe ≥ 1 €

| Thema | Begriffe (Kosten) | Entscheidung |
|---|---|---|
| Passend, im Sortiment | vorwerk teppich (3,31), vorwerk teppichboden (2,92), vinylboden (2,38 / 2,11), linoleum boden (2,35), laminat (2,22), teppichboden meterware (2,09 / 2,08), teppichboden (1,56 / 1,12), fischgräten vinyl (1,55), teppichboden kaufen (1,67), auslegware kaufen (1,51), bodenbelag (1,47), pvc bodenbelag (1,36), vinylboden buche (1,28), fußboden fliesen holzoptik (1,30), kinderzimmer teppich meterware (1,25), teppich wohnzimmer (1,19), dicker pvc bodenbelag (1,18), eichenparkett fischgrät (1,20), teppichboden beige (1,12), kräuselvelours teppich meterware (1,04), parkett (1,06), fischgrät eiche (1,03), vinyl selbstklebend (1,02) | **nicht ausschließen** (Produkt ist da, es fehlt der Kauf, nicht der Begriff) |
| Bereits durch Liste „TP Ausschluss“ abgedeckt | teppich für boote (1,71; Phrase „boot“, „boote“), ttm teppich meterware (1,23; Phrase „ttm“), fußboden trends 2026 (1,18; Phrase „trends“), fischgrätparkett (1,80; Status „Ausgeschlossen“) | nichts anlegen; die Klicks stammen sehr wahrscheinlich aus der Zeit vor dem jeweiligen Eintrag. Beim nächsten Zyklus prüfen, ob sie wieder auftauchen |
| Fremdsprachig / unpassend | **parchet premium** (1,13, Shopping Laminat & Parkett; rumänisch für Parkett) | **anlegen** |

## Zu setzen

| Kampagne | Keyword | Match |
|---|---|---|
| TP \| Shopping \| Laminat & Parkett | parchet | Phrase |

Die Liste ist bewusst kurz: Es gibt kein Muster aus Jobs, DIY, Reparatur oder Fremdmarken,
das sich mit den vorhandenen Listen nicht schon abdeckt. Das Geld geht nicht an falsche
Suchbegriffe verloren; Ursachen und Empfehlungen: `optimierung-2026-10-16.md`.

## Grenzfälle (nicht angelegt, nur Vorschlag)

- **„fußboden fliesen holzoptik“** (Shopping Vinyl): Absicht kann Fliese statt Vinyl sein.
  Erst beobachten.
- **Verlegeservice-Suchen** (Teppichboden/Vinyl verlegen lassen): gehören zu 11880, es gab
  im Zeitraum keinen Treffer, nichts zu tun.
- **„vorwerk …“**: bleibt drin (Inhaberentscheidung, lokale Anfragen).

## Gegenprobe nach dem Schreiben

Gesetzt am 16.10.2026 in der Oberfläche (Auszuschließende Keywords, Ebene Kampagne).
Nach Neuladen: 71 statt 70 Einträge, Zeile `"parchet"`, Kampagne
TP | Shopping | Laminat & Parkett, Ebene Kampagne, Passende Wortgruppe. Gegenprobe per
Oberfläche, weil die API-Werkzeuge (HYPD, Ryze) ohne Plan nicht lesen.
