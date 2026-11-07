---
name: restrollen-bilder
description: Zusatzbilder fuer Restrollen (Sonderposten) bauen und hochladen - flacher Blick vor Wand, Seitenansicht der Schnittkante mit Lupe, Kettelkante fuer den Kettelteppich, verlegte Flaeche von weiter weg. Teppich aus echten Fotopixeln, Gemini nur fuer Hintergrund und Kettelwulst. Verwenden bei "Bilder fuer die Restrolle", "wie bei der gruenen Rolle", neuen Drive-Fotos von Restrollen-Musterstuecken und bevor ein Restrollen-Bild per KI entsteht.
---

# Restrollen-Bildsatz

Werkzeuge, Prompts und Vorlagen liegen lokal unter
`~/teppich-paradies-analyse/produktbilder/restrollen-bildsatz/`. Die vollstaendige
Anleitung mit allen Stellschrauben steht dort in `ANLEITUNG.md`. Diese Datei fasst nur
zusammen, was verbindlich ist.

## Die vier Bilder

| Bild | Inhalt | Produkt | IPTC |
|---|---|---|---|
| A | flacher Blick ueber den Flor, weisse Wand, Fussleiste, Boucle-Hocker | Restrolle | composite |
| B | Seitenansicht der Schnittkante mit Ruecken, Lupe mit echtem Flor | Restrolle | composite |
| C | wie B, mit Kettelkante (schmale Garnwulst in Teppichfarbe, nie Stoffband) | Kettelteppich | composite |
| D | verlegte Flaeche von weiter weg, KI-Bild, Farbe an A angeglichen | Restrolle | trainedAlgorithmicMedia |

Muster ist die erste Rolle TPR0017 vom 06.11.2026. Die Skripte erzeugen ihre freigegebenen Bilder
pixelgleich, das wurde gegengeprueft.

## Verbindlich

- **Teppich = echte Pixel** bei A, B und C. Gemini liefert nur Wand, Leiste, Hocker, Boden,
  Kontaktschatten und bei C die Kettelwulst. Die Lupe ist ein echter Ausschnitt ohne KI.
  Den Flor zeichnet Gemini kuerzer, grauer oder als eigene Matte.
- **D ist reines KI-Bild**: nur mit Farbangleich (`farbe_angleichen.py`) und mit
  „Beispielbild … Flor und Farbe koennen abweichen“ im Alt-Text. Ein echtes Foto von einem
  groesseren ausgelegten Stueck waere besser.
- **Farbe** kommt aus der Weisskarte im eigenen Foto (`kalib.py`, `entw.py`). Fotos nicht
  untereinander angleichen: Shaggy wirkt schraeg deutlich heller als von oben.
- **Vor dem Zeigen pruefen**: Ausgabe der Skripte lesen, Ansicht bei 800 px und 100 %, dann zwei
  unabhaengige Pruefer (Realismus, 1:1-Treue und Farbe).
- **Sichtfreigabe des Benutzers vor jedem Upload.** Nur hinzufuegen, die Draufsicht bleibt Hauptbild.
  Bilder nur an dem Produkt loeschen, das der Benutzer nennt.
- **Upload** mit `hochladen.py` (vorbereiten, posten, pruefen). Das Skript druckt die
  `shopify store execute`-Befehle aus, jeder wird einzeln ausgefuehrt. Es setzt IPTC und prueft am
  Ende Admin (READY) und den oeffentlichen Shop.
- **Gemini** nur ueber Claude in Chrome, Konto `/u/1`, Pro, „Bild erstellen“, je Motiv ein neuer
  Chat. Klickfolge: `~/teppich-paradies-analyse/produktbilder/ANLEITUNG-GEMINI.md`.
  `gemini_paket.py` legt Grundbilder, Vorlagen und fertige Prompts in den Scratchpad, denn
  `file_upload` liest nur von dort.
- Lieferantennamen gehoeren nicht ins Repository (AGENTS.md Punkt 8). `rolle.json` und die
  Bilder bleiben lokal.

## Kurzablauf

```
P=~/.venvs/analyse/bin/python; T=~/teppich-paradies-analyse/produktbilder/restrollen-bildsatz
$P -I $T/neue_rolle.py <ordner> --name "…" --sku TPR… --rolle <ID> --kettel <ID> --farbwort "…" --fotos <drive>
# DNG -> roh/*.tif (sips), kalib.py, entw.py, Boxen in rolle.json, dann:
$P -I $T/schnitt.py rolle.json
$P -I $T/gemini_paket.py rolle.json <scratchpad>/gemini-<sku>      # Gemini A, B, C, D
$P -I $T/montage_a.py rolle.json gemini-roh/flach.jpg kandidat-A-flach-wand.jpg
$P -I $T/montage_b.py rolle.json gemini-roh/kante.jpg kandidat-B-kante-lupe.jpg
$P -I $T/montage_b.py rolle.json gemini-roh/kante.jpg kandidat-C-kettel-lupe.jpg kettel gemini-roh/kettel.jpg
$P -I $T/farbe_angleichen.py rolle.json kandidat-D-weit.jpg
# pruefen, Sichtfreigabe, dann:
$P -I $T/hochladen.py rolle.json vorbereiten | posten | pruefen [fertig]
```

Liegt eine gefundene Kante falsch (die Skripte drucken ihre Lage), wird der Suchbereich in
`rolle.json` angepasst, nicht der Code. Die Stellschrauben stehen in `ANLEITUNG.md`.
