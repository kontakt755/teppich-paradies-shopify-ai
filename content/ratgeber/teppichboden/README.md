# Teppichboden-Ratgeber – Pilotartikel (Entwürfe)

**Entwurf – nicht veröffentlichen, bevor alle PRUEFEN-Marken beantwortet und entfernt sind.**

Vier Pilotartikel für den Blog `ratgeber-teppichboden`. Aufbau, Metafelder und
Redaktionsregeln stehen in `docs/ratgeber/README.md`. Je Artikel gibt es zwei Dateien:
`<handle>.html` (nur der Artikeltext, ohne H1) und `<handle>.json` (Titel, Tags, SEO,
Metafelder, Status `entwurf`). `geprueft_von` und `stand` bleiben leer, bis der Inhaber
sie nach der fachlichen Prüfung füllt.

## Übersicht

| Nr. | Titel | Handle | Art | Themengruppe | Wörter | PRUEFEN |
|---|---|---|---|---|---|---|
| 1 | Teppichboden richtig ausmessen: So ermitteln Sie Breite, Länge und Zugabe | `teppichboden-richtig-ausmessen` | Planung | Planen & Messen | 1323 | 8 |
| 2 | Rollenbreite wählen und Bahnen planen: 400 oder 500 cm? | `rollenbreite-und-bahnen-planen` | Planung | Planen & Messen | 1236 | 11 |
| 3 | Welcher Teppichboden passt zu welchem Raum? | `welcher-teppichboden-fuer-welchen-raum` | Kaufberatung | Auswahl & Kaufberatung | 1137 | 7 |
| 4 | Teppichboden verlegen: lose, fixiert oder vollflächig verklebt? | `teppichboden-verlegen-lose-fixieren-oder-kleben` | Anleitung | Verlegen | 1198 | 16 |

Wörter ohne HTML und ohne Kommentare gezählt. PRUEFEN-Marken gesamt: 42.

## So funktioniert die Prüfung

- Jede Handwerksregel und jede Zahl, die das Verlegeteam bestätigen soll, trägt im HTML
  direkt hinter dem Satz einen Kommentar `<!-- PRUEFEN: Frage -->`.
- Antwort „stimmt“: Marke löschen. Antwort „anders“: Satz korrigieren, Marke löschen.
  Antwort „wissen wir nicht sicher“: Satz streichen.
- Die `kurzantwort` in der JSON-Datei wiederholt Aussagen aus dem Text. Ändert sich im
  Text eine Regel (z. B. die Grenze für lose Verlegung), die Kurzantwort mit anpassen.
- Artikel 4: `dauer`, `schwierigkeit`, `personen` und `material` in der JSON-Datei sind
  vorsichtige Platzhalter und selbst Prüfpunkte (Fragen 4.1 und 4.2).
- Vor dem Veröffentlichen: `grep -c "PRUEFEN" *.html` muss überall 0 ergeben.

## Bewusste Abweichung

Artikel 3 enthält acht interne Links statt der sonst üblichen rund sechs: sechs
Kollektionslinks (je Machart einer, gebündelt in der Übersichtstabelle) und zwei
Ratgeber-Artikel. Das war so beauftragt; wenn es zu viel ist, die Kollektionslinks auf
die vier wichtigsten Macharten kürzen.

## Alle PRUEFEN-Fragen an das Verlegeteam

### 1. Teppichboden richtig ausmessen: So ermitteln Sie Breite, Länge und Zugabe

- **1.1** Nimmt das Verlegeteam vorhandene Sockelleisten grundsätzlich ab, oder wird auch an die Leiste geschnitten? Stimmt die Empfehlung „immer Wandmaß“?
- **1.2** Endet der Belag bei Ihnen mittig unter dem geschlossenen Türblatt, oder gilt eine andere Regel (z. B. bündig mit der Zarge auf der Raumseite)?
- **1.3** Ab welcher Reserve in der Breite raten Sie zur nächstgrößeren Rolle? Ist die gelieferte Rolle verlässlich mindestens so breit wie angegeben?
- **1.4** Stimmt die Abstufung 10 cm bei geraden Wänden / 20 cm bei schiefen Wänden und Nischen, oder empfehlen Sie pauschal einen Wert?
- **1.5** Entspricht diese Rechnung Ihrer Empfehlung „bei 350 × 480 cm lohnt sich oft die 500-cm-Rolle“? Reichen 20 cm Reserve in der Breite (10 cm je Seite) in der Praxis aus?
- **1.6** Wie viel Überlappung planen Sie je Naht für den Nahtschnitt ein, und muss der Kunde das in der Breite oder Länge zusätzlich bestellen?
- **1.7** Soll die Option „Raummaß“ im Ratgeber erwähnt werden, solange sie nur bei einzelnen Produkten verfügbar ist?
- **1.8** Wie soll der Kunde mehrere Bahnen bestellen – je Bahn eine eigene Position mit eigener Länge? Werden die Bahnen dann einzeln zugeschnitten und aus derselben Charge geliefert?

### 2. Rollenbreite wählen und Bahnen planen: 400 oder 500 cm?

- **2.1** Ist die Aussage „die Naht ist die Stelle, die bei starker Beanspruchung zuerst nachgibt“ aus Ihrer Sicht zutreffend, oder zu pauschal?
- **2.2** Entspricht diese Rechnung Ihrer Hausempfehlung für 350 × 480 cm? Reichen 20 cm Reserve in der Breite (480 cm Raum auf 500 cm Rolle) bei üblichen Wänden aus?
- **2.3** Ist die Laufrichtung auf der Rückseite der Ware in der Regel bereits aufgedruckt, oder muss sie immer selbst bestimmt und markiert werden?
- **2.4** Können Sie zusagen, dass Bahnen aus einer Bestellung aus derselben Charge bzw. Rolle geschnitten werden? Falls nicht: Wie soll der Kunde das sicherstellen?
- **2.5** Gibt es eine Hausregel für die Florrichtung im Raum (z. B. Flor zur Tür bzw. vom Fenster weg)? Wenn ja, bitte hier ergänzen.
- **2.6** Bestätigen Sie die Regel „Naht nicht in die Hauptlaufzone, bevorzugt unter Möbel“?
- **2.7** Setzen Sie im Türdurchgang zwischen zwei Räumen mit gleichem Teppichboden grundsätzlich ein Profil, oder wird dort auch Naht an Naht gearbeitet?
- **2.8** Stimmt die Regel „Naht parallel zum Hauptlichteinfall, also auf das Fenster zulaufend“? Gibt es Ausnahmen je Machart?
- **2.9** Gibt es eine Mindestbreite für angesetzte Streifen, die Sie empfehlen (z. B. nicht unter 50 cm)?
- **2.10** Wie viele Zentimeter Überlappung je Naht soll der Kunde zusätzlich einplanen?
- **2.11** Führt der Shop gemusterte Rollenware mit Rapport? Falls ja: Wo steht der Rapport, und wie wird der Mehrbedarf berechnet? Falls nein, Satz streichen.

### 3. Welcher Teppichboden passt zu welchem Raum?

- **3.1** Stimmen die Stärken und Schwächen in der Tabelle mit Ihrer Erfahrung überein – insbesondere „Velours zeigt Trittspuren“, „Schlingen können durch Krallen gezogen werden“ und „Hochflor in der Regel nicht für Stuhlrollen“?
- **3.2** Wolle – welche Pflegehinweise geben Sie Kunden mit (Reinigungsmittel, Feuchtigkeit)? Ist „empfindlicher gegenüber falscher Reinigung und Dauernässe“ so richtig formuliert?
- **3.3** Welche Macharten empfehlen Sie für Treppen, und von welchen raten Sie ab (z. B. grobe Schlinge, die an der Stufenkante aufklafft)?
- **3.4** Bestätigen Sie den Hinweis „harte Rollen für Teppichboden, weiche Rollen für Hartboden“? Empfehlen Sie bei fehlender Eignung eine Bodenschutzmatte?
- **3.5** Gilt bei Ihnen „unter Stuhlrollen immer vollflächig verkleben“, oder lassen Sie Fixierung in Wohn-Arbeitszimmern zu?
- **3.6** Welche Nutzungsklasse empfehlen Sie mindestens für Flur/Treppe und für das Arbeitszimmer? Sind die Klassen bei allen Shop-Produkten in den technischen Daten gepflegt?
- **3.7** Bestätigen Sie den Hinweis, dass melierte Töne im Eingangsbereich Schmutz besser kaschieren als helle oder dunkle Unifarben?

### 4. Teppichboden verlegen: lose, fixiert oder vollflächig verklebt?

- **4.1** Eckdaten im Metafeld – Dauer „etwa ein halber Tag für einen Raum bis 20 m², ohne Untergrundarbeiten“, Schwierigkeit „mittel“, Personen „2“. Bitte bestätigen oder korrigieren.
- **4.2** Material- und Werkzeugliste im Metafeld (Verlegeband oder Fixierung, Teppichmesser mit Hakenklingen, Stahllineal, Kantenandrücker, Andrückwalze usw.) – vollständig und so richtig benannt?
- **4.3** Stimmt die Entscheidungstabelle in allen Zeilen mit Ihrer Praxis überein – insbesondere „fixiert unter Stuhlrollen nur eingeschränkt“, „Treppe nur verklebt“ und „lose bei Fußbodenheizung ungünstig“?
- **4.4** Bis zu welcher Raumgröße empfehlen Sie lose Verlegung? Ist „rund 20 m²“ richtig, oder setzen Sie die Grenze niedriger?
- **4.5** Welche Rückenarten eignen sich aus Ihrer Sicht für die lose Verlegung, welche nicht?
- **4.6** Bestätigen Sie „Fixieren ist für die meisten Wohnräume und Mietwohnungen der passende Weg“? Wann raten Sie zu Verlegeband, wann zur flüssigen Fixierung?
- **4.7** Empfehlen Sie bei Fußbodenheizung grundsätzlich die vollflächige Verklebung (Wärmeübergang ohne Luftpolster)? Wenn ja, bitte hier ergänzen.
- **4.8** Auf welchen Untergründen raten Sie von Verlegeband oder Fixierung ab (z. B. alte PVC-Beläge, Parkett, sandender Estrich)? Wann ist eine Grundierung nötig?
- **4.9** Welche Akklimatisierungszeit und welche Mindesttemperatur empfehlen Sie? Stimmt „etwa 24 Stunden, ausgerollt“?
- **4.10** Wie viel Überstand je Wand empfehlen Sie für den Grobzuschnitt?
- **4.11** Welchen Gitterabstand empfehlen Sie beim Verlegeband in der Fläche, und ab welcher Raumgröße?
- **4.12** Stimmt „Fixierung erst nach dem Ablüften belegen“ für die Produkte im Shop?
- **4.13** Ist der Doppelnahtschnitt für alle Macharten Ihre Empfehlung? Wie schneiden Sie Schlingenware (in der Schlingengasse)? Werden Nahtkanten zusätzlich versiegelt?
- **4.14** Bestätigen Sie „Belag endet mittig unter dem geschlossenen Türblatt“?
- **4.15** Sichern Sie bei loser Verlegung den Türbereich grundsätzlich mit Band oder Profil?
- **4.16** Welche Angaben zu Zahnung und Einlegezeit sollen Kunden beachten – reicht der Verweis auf den Kleberhersteller?
