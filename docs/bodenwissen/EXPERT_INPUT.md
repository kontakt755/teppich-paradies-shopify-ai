# Was wir von Teppich Paradies brauchen

Stand 2026-09-23 · Aufgabe #505.

**Das ist der Engpass des Projekts.** 107 der 121 Backlog-Themen brauchen eine
Auskunft aus dem eigenen Betrieb. Ohne sie entsteht genau der austauschbare
Text, den der Auftrag ausschliesst — und die Regel vom 2026-09-21 gilt weiter:
**ungeprueft wird gestrichen, nicht vermutet.**

Die technische Arbeit laeuft unabhaengig davon weiter. Nur die Artikel warten.

## 1. Entscheidungen — blockieren jeweils etwas Konkretes

| # | Frage | Blockiert | Empfehlung |
|---|---|---|---|
| E-1 | Soll der Bereich sichtbar **„Bodenwissen"** heissen (H1 und Menuepunkt), waehrend die URL `/pages/ratgeber` bleibt? | Umbau der Einstiegsseite | Ja. Die URL ist indexiert und verlinkt, ein Wechsel kostet Weiterleitungen ohne Nutzen. |
| E-2 | Wer wird als **Fachpruefer** genannt? Name und Funktion, oder nur „Teppich Paradies Oranienburg GmbH"? | `geprueft_von` in jedem Artikel; derzeit ueberall leer | Firma nennen, keine erfundenen Titel. |
| E-3 | Welcher **Text steht in der Firmenbox** am Artikelende? | Vertrauensmodul, seit dem Livegang offen | Kurz: Ladengeschaeft, Beratung, Aufmass, Verlegung. Keine Zahlen ohne Beleg. |
| E-4 | **`/pages/uber-uns`** steht auf Stand 2024 und ist verwaist — aktualisieren? | Die Firmenbox verlinkt dorthin; das Vertrauenssignal zeigt derzeit ins Leere. | Ja, vor der naechsten Artikelwelle. |
| E-5 | Duerfen wir **Baustellenfotos** aus laufenden Auftraegen verwenden? Braucht es eine Einwilligung der Kunden? | 37 Bildbedarfe aus dem Backlog | Klaeren, bevor fotografiert wird. |
| E-6 | Welche **Produkte/Kollektionen** sollen aus den Ratgebern bevorzugt verlinkt werden? | `metafields.produkte` und `kollektion` | — |
| E-7 | Gibt es gemusterte **Rollenware mit Rapport** im Sortiment? | TB-P-08; sonst faellt das Thema weg | — |

## 2. Fragen zu den fuenf veroeffentlichten Artikeln

**71 Fragen liegen vollstaendig in `content/ratgeber/teppichboden/README.md`**,
gegliedert nach Artikel (1.1 bis 5.29). Sie werden hier nicht wiederholt —
eine Liste, eine Wahrheit.

Wichtig zum Verstaendnis: Diese Fragen blockieren **nichts**. Die zugehoerigen
Aussagen sind aus den Artikeln entfernt; die Artikel sind in sich vollstaendig.
Jede Antwort ist ein moeglicher **Ausbau** eines lebenden Artikels — und Ausbau
ist laut Auftrag (Abschnitt 44) meist wertvoller als ein neuer Artikel.

**Die zehn mit der groessten Wirkung**, wenn Zeit fuer nur zehn ist:

| Nr. | Frage | Warum diese |
|---|---|---|
| 1.4 | Stimmt die Zugabe 10 cm bei geraden, 20 cm bei schiefen Waenden? | Steht so im Artikel und im geplanten Rechner |
| 1.6 | Wie viel Ueberlappung je Naht muss der Kunde zusaetzlich bestellen? | Fehlbestellungen |
| 2.4 | Werden Bahnen einer Bestellung aus derselben Charge geschnitten? | Haeufigste Reklamationsursache |
| 2.6 | Naht nicht in die Hauptlaufzone, bevorzugt unter Moebel — bestaetigt? | Traegt TB-V-01 und TB-X-02 |
| 3.6 | Welche Nutzungsklasse mindestens fuer Flur und Treppe? | Traegt die ganze Kaufberatung |
| 4.3 | Stimmt die Entscheidungstabelle lose/fixiert/verklebt? | Kern des meistgelesenen Artikels |
| 4.7 | Bei Fussbodenheizung grundsaetzlich vollflaechig verkleben? | TB-A-09, haeufige Frage |
| 5.11 | Feinwaschmittel als Hausmittel — ja oder nur Fleckentferner? | Steuert 8 Reinigungsartikel |
| 5.20 | Welche Hausmittel sollen Kunden ausdruecklich **nicht** verwenden? | Schadenvermeidung, klarer Mehrwert |
| 5.21 | Dampfreiniger auf Teppichboden — generell abraten? | TB-R-06 |

## 3. Fragen zu den fuenf Entwuerfen der naechsten Welle

Diese fuenf Artikel sind **geschrieben und liegen als Entwurf im Repository**.
Sie sind vollstaendig aufgebaut; an jeder Stelle, die eine Auskunft aus dem Betrieb
braucht, steht eine `PRUEFEN`-Marke mit der konkreten Frage direkt im Text.
`npm run ratgeber:payload` sperrt jeden von ihnen, solange die Marken offen sind —
sie koennen also nicht versehentlich veroeffentlicht werden.

**Jede beantwortete Frage macht ein Stueck Artikel veroeffentlichbar.** Die Fragen
stehen maschinenlesbar im Feld `expert_input` der jeweiligen `.json` und wortgleich
als Kommentar an der passenden Stelle in der `.html`.

| Entwurf | Offene Fragen | Datei |
|---|---|---|
| Teppichboden auf Fliesen verlegen: Was der Untergrund hergeben muss | 10 | `content/ratgeber/teppichboden/teppichboden-auf-fliesen.json` |
| Teppichboden wirft Wellen: mögliche Ursachen und was hilft | 7 | `content/ratgeber/teppichboden/teppichboden-wirft-wellen.json` |
| Verschnitt bei Teppichboden: warum Sie mehr bestellen als der Raum misst | 3 | `content/ratgeber/teppichboden/verschnitt-bei-teppichboden.json` |
| Untergrund prüfen und vorbereiten: fest, eben, trocken, sauber | 9 | `content/ratgeber/untergrund/untergrund-pruefen-und-vorbereiten.json` |
| Klickvinyl oder Klebevinyl: Was ist der Unterschied? | 8 | `content/ratgeber/vinylboden/klickvinyl-oder-klebevinyl.json` |

Zusammen **37 Fragen**. Die wichtigsten je Entwurf:

### Teppichboden auf Fliesen verlegen: Was der Untergrund hergeben muss
- Welche Punkte prüft das Team am Fliesenboden, in welcher Reihenfolge?
- Woran erkennt ein Kunde eine hohl liegende Fliese zuverlässig?
- Ab welcher Fugenbreite oder -tiefe raten Sie zum Spachteln?
- Welche Teppichbodenaufbauten verzeihen Fugen besser, welche schlechter?
- … 6 weitere in `content/ratgeber/teppichboden/teppichboden-auf-fliesen.json`

### Teppichboden wirft Wellen: mögliche Ursachen und was hilft
- Welche Ursachen sehen Sie in der Praxis am häufigsten? Nach Häufigkeit ordnen.
- Fehlt in der Liste eine Ursache?
- Welche Fälle lassen sich nachträglich beheben, welche nicht?
- Gehen Wellen nach dem Nachfixieren vollständig weg?
- … 3 weitere in `content/ratgeber/teppichboden/teppichboden-wirft-wellen.json`

### Verschnitt bei Teppichboden: warum Sie mehr bestellen als der Raum misst
- Nennen Sie Kunden eine übliche Größenordnung für Verschnitt, oder raten Sie davon ab?
- Wie viel Überlappung je Naht muss zusätzlich eingeplant werden?
- Können Reststücke mitgeliefert werden, oder bleiben sie beim Zuschnitt?

### Untergrund prüfen und vorbereiten: fest, eben, trocken, sauber
- Welche Prüfungen halten Sie für einen Kunden für sinnvoll, welche führen in die Irre?
- Ist der Folientest brauchbar, oder raten Sie davon ab?
- Mit welchem Verfahren messen Sie Restfeuchte?
- Auf welche Norm bzw. welches Messverfahren beziehen Sie sich bei der Ebenheit?
- … 5 weitere in `content/ratgeber/untergrund/untergrund-pruefen-und-vorbereiten.json`

### Klickvinyl oder Klebevinyl: Was ist der Unterschied?
- Stimmen alle Zeilen der Vergleichstabelle, besonders 'einzelne Planke tauschen'?
- Fehlt eine Zeile, die Kunden regelmäßig fragen?
- Welche Ebenheit verlangen Sie je Verlegeart?
- Gibt es Untergründe, die eine der beiden Arten ausschließen?
- … 4 weitere in `content/ratgeber/vinylboden/klickvinyl-oder-klebevinyl.json`

## 4. Wie eine Antwort in den Shop kommt

1. Antwort in die passende Zeile von `content/ratgeber/<bereich>/README.md` oder
   direkt in den Artikeltext.
2. `geprueft_von` und `stand` setzen — **nur**, wenn wirklich geprueft wurde.
3. `npm run bodenwissen:guard` und `npm run ratgeber:payload` laufen lassen.
4. Ueber die normale Kette live: PR → main → Preview → Live.

Eine Antwort, die nur im Chat steht, ist nicht im Shop.
