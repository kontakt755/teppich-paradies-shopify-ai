# Referenzgalerie „Unsere Arbeit" pflegen

Seite: `/pages/unsere-arbeit` · Template: `templates/page.unsere-arbeit.json`

## Ein neues Projekt hinzufügen (ohne Code)

1. Shopify-Admin öffnen → linke Leiste **Inhalt** → **Metaobjekte**
2. **Referenzprojekt (TP)** anklicken → oben rechts **Eintrag hinzufügen**
3. Ausfüllen:

| Feld | Pflicht | Was hinein gehört |
|---|---|---|
| Titel | ja | Kurzer Projektname, z. B. „Treppenrenovierung Oranienburg" |
| Kategorie | ja | Aus der Liste wählen – bestimmt, unter welchem Filter das Projekt erscheint |
| Titelbild | ja | Das eine Bild, das in der Übersicht steht. Bestes Foto zuerst. |
| Weitere Bilder | nein | Alle anderen Bilder desselben Projekts (vorher, Verlegung, Detail, fertig) |
| Ort | nein | „Oranienburg", „Birkenwerder", „Berlin-Pankow" – hilft bei Google |
| Verwendeter Belag | nein | „Teppichboden Velours", „Klickvinyl Eiche" |
| Beschreibung | nein | Zwei bis drei Sätze zur Ausführung |
| Vorher / Nachher | nein | **Nur beide zusammen.** Dann erscheint automatisch ein Schieberegler. |
| Jahr | nein | Ausführungsjahr |
| Reihenfolge | nein | Kleinere Zahl steht weiter vorn. Leer heißt: ans Ende. |

4. Oben rechts Status auf **Aktiv** stellen, dann **Speichern**.

Das Projekt steht sofort in der Galerie. Der Zähler am Kategorie-Filter zählt
automatisch mit, und ein Filter erscheint erst, wenn mindestens ein Projekt
darin liegt.

## Ein Projekt vorübergehend ausblenden

Status auf **Entwurf** stellen. Es verschwindet aus der Galerie, bleibt aber
erhalten. Nicht löschen, wenn es später wieder gezeigt werden soll.

## Eine neue Kategorie anlegen

Zwei Schritte, sonst erscheint die Kategorie nicht:

1. **Einstellungen → Benutzerdefinierte Daten → Metaobjekte →
   Referenzprojekt (TP) → Feld „Kategorie"** → den neuen Wert zur Auswahlliste
   hinzufügen.
2. In `sections/tp-arbeiten-galerie.liquid` die Zeile mit `assign reihenfolge =`
   ergänzen – sie legt fest, in welcher Reihenfolge die Filter stehen.

Ohne Schritt 2 lässt sich die Kategorie zwar auswählen, sie bekommt aber keinen
Filterknopf. Die Projekte sind dann nur unter „Alle Arbeiten" zu sehen.

## Bilder: worauf es ankommt

- **Querformat bevorzugen.** Die Kacheln sind 4:3; hochkant fotografierte Bilder
  werden oben und unten beschnitten. In der Detailansicht ist immer das ganze
  Bild zu sehen.
- **Alt-Text setzen** (im Medien-Bereich beim Bild). Er ist das, was Google liest
  und was Screenreader vorlesen. Beschreiben, was zu sehen ist, plus Ort:
  „Gewendelte Treppe mit dunkelblauem Velours-Teppichboden, Oranienburg".
- Die Größe muss nicht reduziert werden. Shopify liefert automatisch die passende
  Auflösung je Gerät aus, und die Galerie lädt nur, was sichtbar ist.

## Wo die Galerie überall auftaucht

| Ort | Was dort steht |
|---|---|
| `/pages/unsere-arbeit` | Die vollständige Galerie mit Filtern |
| Startseite, Abschnitt „Echte Arbeiten" | Fünf handverlesene Bilder, gepflegt im Theme-Editor |
| Startseite, Knopf „Unsere Treppenarbeiten ansehen" | Öffnet die Galerie direkt mit dem Filter Treppen |

Der Startseiten-Abschnitt ist **nicht** mit den Metaobjekten verbunden. Er wird
im Theme-Editor gepflegt und zeigt bewusst nur die stärksten Bilder.

## Technischer Hintergrund

- Metaobjekt-Definition: `tp_projekt`
- Sections: `tp-arbeiten-intro`, `tp-arbeiten-galerie`, `tp-vorher-nachher`
- Skript: `assets/tp-arbeiten.js` (Filter, Nachladen, Lightbox, Vorher/Nachher) –
  kein Framework, keine externe Bibliothek
- Die Galerie zeigt zunächst 9 Projekte und lädt in Schritten nach. Bei vielen
  Projekten bleibt die Seite dadurch schnell.
- **Obergrenze: 250 aktive Projekte.** Shopify gibt Metaobjekte in Liquid ohne
  `paginate` nur bis 50 heraus, mit `paginate` bis 250 pro Seite. Darüber
  würden Projekte still fehlen – dann die Galerie auf echte Seiten umstellen.
