# Direkte App-Entwuerfe aus dem Arbeitsplatz

Ein eingerichteter neuer Codex- oder Claude-Chat bekommt die Angaben ueber den Knopf „Mit Angaben
in … oeffnen“. Die Ziel-App muss auf dem oeffnenden Geraet installiert sein. Sie zeigt den Entwurf;
die Person prueft ihn und startet selbst. Dafuer wird kein Browserbegleiter benoetigt.

## Ziele einrichten

Im privaten Einrichtungsbereich ausschliesslich promptfreie Navigationsziele hinterlegen:

- Codex im lokalen Arbeitsordner: `codex://new?path=%2Fabsoluter%2Fprojektordner`
- Codex mit vorhandener Repository-Zuordnung: `codex://new?originUrl=https%3A%2F%2Frepo.example%2Fprojekt`
- Claude Code im lokalen Arbeitsordner: `claude://code/new?folder=%2Fabsoluter%2Fprojektordner`
- Neuer Claude-Chat ohne festes Projekt: `claude://claude.ai/new`

Ordner muessen auf dem betreffenden Geraet tatsaechlich vorhanden sein und ihre Projektregeln sowie
benoetigten Skills bereitstellen. Ein lokaler Ordner uebernimmt weder alte Cloud-Chats noch deren
Quellen oder Erinnerungen automatisch. Ein allgemeines neues Chat-Ziel bekommt einen sichtbaren
Hinweis auf das noch fehlende Projekt. Ein vorhandener Chat oder ein Cloud-Projekt ohne dokumentierte
Entwurfsuebergabe behaelt den manuellen Weg.

## Datenweg und Grenzen

Nur beim bewussten Klick baut das Dashboard den nativen Link mit `prompt` (Codex) bzw. `q` (Claude).
Der Text geht dabei an die installierte App. Das Dashboard speichert den erzeugten Link nicht,
gibt ihn nicht als HTML-Attribut aus und sendet ihn nicht an seinen Server. Die Betriebssystem- und
App-Verarbeitung liegt ausserhalb des Dashboard-Speicherverhaltens.

Der fertige kodierte Link darf hoechstens 12.000 Zeichen lang sein. Claude dokumentiert eine
Kuerzung des Prompts ungefaehr ab 14.000 Zeichen; diese Grenze wird konservativ vorher abgefangen.
Es gibt keine stille Kuerzung, keinen automatischen Ausweichanbieter und keinen automatischen
KI-Start. Falls ein Text zu lang ist, bleibt er komplett erhalten und die manuelle Alternative
ist erreichbar.

Eine angenommene Navigation beweist keine Einfuegung. Der Dashboard-Status sagt deshalb nur
„Uebergabe angefordert“. Browser bzw. Betriebssystem koennen beim App-Start nachfragen. Claude Code
fragt beim Ordnerlink jedes Mal nach Bestaetigung; das muss die Person in Claude selbst erledigen.

## Pruefung

Mit einer Datenkopie und rein erfundenen Angaben uebergeben. In der echten Ziel-App den ganzen
Text mit der Dashboard-Vorschau vergleichen, den Arbeitsordner bzw. die fehlende Projektzuordnung
pruefen und sicherstellen, dass nichts abgesendet wurde. Den Testentwurf anschliessend entfernen.
Ein Ordner-Chip ist nur ein Beleg fuer die Entwurfsauswahl; er belegt keine spaeter ausgefuehrte
Sitzung oder deren tatsaechliches Arbeitsverzeichnis.

Quellen:

- [Codex-App-Links](https://learn.chatgpt.com/docs/reference/commands)
- [Claude-Desktop-Links](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link)
