# Teppichboden-Ratgeber – Pilotartikel

**Veröffentlichte Fassung = konservativer Schnitt.** Auf Entscheidung des Inhabers vom
2026-09-21 wurden alle Aussagen entfernt, die das Verlegeteam nicht bestätigt hat. Stehen
geblieben sind nur die veröffentlichten Hausangaben des Shops (Rollenbreiten, Rechner,
Hausbeispiele, Muster, Services), allgemein Unstrittiges und Verweise auf Produktseite,
Herstellerangaben oder Beratung.

Fünf Pilotartikel für den Blog `ratgeber-teppichboden`. Aufbau, Metafelder und
Redaktionsregeln stehen in `docs/ratgeber/README.md`. Je Artikel gibt es zwei Dateien:
`<handle>.html` (nur der Artikeltext, ohne H1) und `<handle>.json` (Titel, Tags, SEO,
Metafelder, Status `freigegeben`). `geprueft_von` und `stand` sind leer: Eine fachliche
Prüfung durch das Verlegeteam hat nicht stattgefunden. `dauer`, `schwierigkeit` und
`personen` sind in allen Artikeln leer.

## Übersicht

| Nr. | Titel | Handle | Art | Themengruppe | Wörter | PRUEFEN |
|---|---|---|---|---|---|---|
| 1 | Teppichboden richtig ausmessen: So ermitteln Sie Breite, Länge und Zugabe | `teppichboden-richtig-ausmessen` | Planung | Planen & Messen | 1053 | 0 |
| 2 | Rollenbreite wählen und Bahnen planen: 400 oder 500 cm? | `rollenbreite-und-bahnen-planen` | Planung | Planen & Messen | 900 | 0 |
| 3 | Welcher Teppichboden passt zu welchem Raum? | `welcher-teppichboden-fuer-welchen-raum` | Kaufberatung | Auswahl & Kaufberatung | 930 | 0 |
| 4 | Teppichboden verlegen: lose, fixiert oder vollflächig verklebt? | `teppichboden-verlegen-lose-fixieren-oder-kleben` | Anleitung | Verlegen | 955 | 0 |
| 5 | Teppichboden pflegen und Flecken entfernen: Was wirklich hilft | `teppichboden-pflegen-und-flecken-entfernen` | Pflege | Pflege | 668 | 0 |

Wörter ohne HTML gezählt. PRUEFEN-Marken gesamt: 0.

## Regel für den Ausbau

- **Eine Aussage kommt erst zurück in den Artikel, wenn das Verlegeteam sie bestätigt hat.**
- Bestätigte Aussagen ohne Marke einfügen; die `kurzantwort` in der JSON-Datei mit anpassen,
  wenn sich dadurch eine Kernaussage ändert.
- `geprueft_von` und `stand` füllt der Inhaber erst nach einer tatsächlichen fachlichen Prüfung.
- `grep -c "PRUEFEN" *.html` muss überall 0 ergeben; `scripts/ratgeber-payload.mjs` sperrt
  jeden Artikel mit Marke oder ohne Status `freigegeben`.

## Was der Schnitt entfernt hat

Entscheidungstabelle der Verlegearten, Stärken-/Schwächen-Spalten der Macharten, Regeln zur
Nahtlage und Überlappung, Zeit-, Maß- und Mengenangaben zum Verlegen, Werkzeugdetails,
Saugrhythmus und Düsenzuordnung, Flecken-Tabelle samt Hausmitteln, Hinweise zu Dampfreiniger,
Druckstellen, Flusen und Neugeruch, die nachgerechneten Flächenvergleiche und die
zusätzlichen Beispielräume. Artikel 3 hat jetzt fünf interne Links (vier Kollektionen in
der Tabelle, ein Ratgeber-Artikel).

## Offene Fachfragen – für den späteren Ausbau

Die 71 Fragen aus den Entwürfen. Die zugehörigen Aussagen stehen nicht mehr in den
Artikeln; jede Antwort des Verlegeteams ist ein möglicher Ausbau. Die ursprünglichen
Entwurfstexte mit den Marken liegen in der Git-Historie dieses Ordners.

### 1. Teppichboden richtig ausmessen: So ermitteln Sie Breite, Länge und Zugabe

- **1.1** Nimmt das Verlegeteam vorhandene Sockelleisten grundsätzlich ab, oder wird auch an die Leiste geschnitten? Stimmt die Empfehlung „immer Wandmaß“? → bleibt offen (Hauspraxis Sockelleiste)
- **1.2** Endet der Belag bei Ihnen mittig unter dem geschlossenen Türblatt, oder gilt eine andere Regel (z. B. bündig mit der Zarge auf der Raumseite)? → bleibt offen (Hausregel Türblatt; nicht in Artikel 1 nötig)
- **1.3** Ab welcher Reserve in der Breite raten Sie zur nächstgrößeren Rolle? Ist die gelieferte Rolle verlässlich mindestens so breit wie angegeben? → bleibt offen (Shop: Reserve/Rollentoleranz); Text verweist weiter auf Kontakt
- **1.4** Stimmt die Abstufung 10 cm bei geraden Wänden / 20 cm bei schiefen Wänden und Nischen, oder empfehlen Sie pauschal einen Wert? → beantwortet: rund 10 cm Übermaß je Bahn (Verlegeanleitung Bahnenware, heinze.de-PDF); Spanne 10–20 cm bleibt
- **1.5** Entspricht diese Rechnung Ihrer Empfehlung „bei 350 × 480 cm lohnt sich oft die 500-cm-Rolle“? Reichen 20 cm Reserve in der Breite (10 cm je Seite) in der Praxis aus? → teilweise: Rechnung im Artikel; Hausempfehlung zur Reserve bleibt offen
- **1.6** Wie viel Überlappung planen Sie je Naht für den Nahtschnitt ein, und muss der Kunde das in der Breite oder Länge zusätzlich bestellen? → beantwortet: 2–3 cm je Seite für den Nahtschnitt (Verlegeanleitung Bahnenware, heinze.de-PDF), als „nach Herstellerangabe“ formuliert
- **1.7** Soll die Option „Raummaß“ im Ratgeber erwähnt werden, solange sie nur bei einzelnen Produkten verfügbar ist? → beantwortet 2026-10-02 aus Shopdaten: Raummaß bei 50 von 113 Teppichböden (Rechner „zentimetergenau aus der Rolle“), als Tipp in Artikel 1 und im Verschnitt-Artikel
- **1.8** Wie soll der Kunde mehrere Bahnen bestellen – je Bahn eine eigene Position mit eigener Länge? Werden die Bahnen dann einzeln zugeschnitten und aus derselben Charge geliefert? → teilweise aus Shopdaten: jede Länge ist eine eigene Warenkorbposition (Tipp in Artikel 1); Charge-Zusage bleibt offen

### 2. Rollenbreite wählen und Bahnen planen: 400 oder 500 cm?

- **2.1** Ist die Aussage „die Naht ist die Stelle, die bei starker Beanspruchung zuerst nachgibt“ aus Ihrer Sicht zutreffend, oder zu pauschal? → nicht übernommen (keine belastbare Quelle)
- **2.2** Entspricht diese Rechnung Ihrer Hausempfehlung für 350 × 480 cm? Reichen 20 cm Reserve in der Breite (480 cm Raum auf 500 cm Rolle) bei üblichen Wänden aus? → teilweise: Rechnung im Artikel; Reserve bleibt offen
- **2.3** Ist die Laufrichtung auf der Rückseite der Ware in der Regel bereits aufgedruckt, oder muss sie immer selbst bestimmt und markiert werden? → bleibt offen (keine einheitliche Quellenlage)
- **2.4** Können Sie zusagen, dass Bahnen aus einer Bestellung aus derselben Charge bzw. Rolle geschnitten werden? Falls nicht: Wie soll der Kunde das sicherstellen? → Shop-Zusage bleibt offen; allgemeiner Hinweis „gleiche Partie, Reihenfolge der Rollennummern“ belegt (Verlegeanleitung Bahnenware, heinze.de-PDF, Herstelleranleitungen)
- **2.5** Gibt es eine Hausregel für die Florrichtung im Raum (z. B. Flor zur Tür bzw. vom Fenster weg)? Wenn ja, bitte hier ergänzen. → bleibt offen (Hausregel)
- **2.6** Bestätigen Sie die Regel „Naht nicht in die Hauptlaufzone, bevorzugt unter Möbel“? → beantwortet: keine Naht in Eingängen/Laufwegen (Verlegeanleitung Bahnenware, heinze.de-PDF)
- **2.7** Setzen Sie im Türdurchgang zwischen zwei Räumen mit gleichem Teppichboden grundsätzlich ein Profil, oder wird dort auch Naht an Naht gearbeitet? → bleibt offen (Hauspraxis Türdurchgang)
- **2.8** Stimmt die Regel „Naht parallel zum Hauptlichteinfall, also auf das Fenster zulaufend“? Gibt es Ausnahmen je Machart? → beantwortet: Naht zur Hauptlichtquelle (Verlegeanleitung Bahnenware, heinze.de-PDF; selbst.de)
- **2.9** Gibt es eine Mindestbreite für angesetzte Streifen, die Sie empfehlen (z. B. nicht unter 50 cm)? → bleibt offen (keine belastbare Quelle)
- **2.10** Wie viele Zentimeter Überlappung je Naht soll der Kunde zusätzlich einplanen? → beantwortet wie 1.6
- **2.11** Führt der Shop gemusterte Rollenware mit Rapport? Falls ja: Wo steht der Rapport, und wie wird der Mehrbedarf berechnet? Falls nein, Satz streichen. → beantwortet aus Shopdaten: alle 30 Treffer „rapportfrei“, kein Rapport-Mehrbedarf; Satz entfällt

### Verschnitt bei Teppichboden (`verschnitt-bei-teppichboden`, freigegeben 2026-10-02)

- **V.1** Übliche Größenordnung → bewusst kein Pauschalwert, Artikel rät zum Rechnen mit eigenen Maßen
- **V.2** Überlappung je Naht → beantwortet wie 1.6
- **V.3** Reststücke mitliefern → bleibt offen (Shop-Ablauf), nicht erwähnt

### 3. Welcher Teppichboden passt zu welchem Raum?

- **3.1** Stimmen die Stärken und Schwächen in der Tabelle mit Ihrer Erfahrung überein – insbesondere „Velours zeigt Trittspuren“, „Schlingen können durch Krallen gezogen werden“ und „Hochflor in der Regel nicht für Stuhlrollen“?
- **3.2** Wolle – welche Pflegehinweise geben Sie Kunden mit (Reinigungsmittel, Feuchtigkeit)? Ist „empfindlicher gegenüber falscher Reinigung und Dauernässe“ so richtig formuliert?
- **3.3** Welche Macharten empfehlen Sie für Treppen, und von welchen raten Sie ab (z. B. grobe Schlinge, die an der Stufenkante aufklafft)?
- **3.4** Bestätigen Sie den Hinweis „harte Rollen für Teppichboden, weiche Rollen für Hartboden“? Empfehlen Sie bei fehlender Eignung eine Bodenschutzmatte?
- **3.5** Gilt bei Ihnen „unter Stuhlrollen immer vollflächig verkleben“, oder lassen Sie Fixierung in Wohn-Arbeitszimmern zu?
- **3.6** Welche Nutzungsklasse empfehlen Sie mindestens für Flur/Treppe und für das Arbeitszimmer? Sind die Klassen bei allen Shop-Produkten in den technischen Daten gepflegt?
- **3.7** Bestätigen Sie den Hinweis, dass melierte Töne im Eingangsbereich Schmutz besser kaschieren als helle oder dunkle Unifarben?

> Stand 2026-10-02 (Recherche): **beantwortet** 3.2 (Wolle: keine alkalischen Reiniger, keine Dauernaesse – Vorwerk, Utopia), 3.4 (harte Rollen Typ H nach DIN EN 12529 auf Teppichboden, weiche Typ W fuer Hartboden – Baunetz Wissen), 3.5 (vollflaechig verkleben unter Stuhlrollen – Baunetz Wissen), 3.6 teilweise (Klasse 23 fuer intensiv genutzte Wohnbereiche wie Flur – Baunetz Wissen/EN 1307). **Bleibt offen:** 3.1, 3.3, 3.7 (Erfahrungswerte des Hauses), 3.6 Pflege der Klassen im Shop, 3.4 Bodenschutzmatte (Quellen uneinheitlich).

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

> Stand 2026-10-02 (Recherche, Artikel neu im Kurzformat): **beantwortet** 4.2 (Anreiber/Andrueckwalze ergaenzt – TKB-Merkblatt 13, Klebstoffhersteller), 4.3 (Stuhlrollen: Fixierung nur bedingt, Kleben empfohlen; Treppe: Kontakt-/Trockenklebstoff – Baunetz Wissen, TKB 13, Datenblatt Verlegenetz), 4.4 (lose nur nahtfrei, also eine Bahn – Baunetz Wissen; keine m²-Grenze belegt), 4.6 teilweise (Fixierung fuer Klasse 21/22 Wohnbereich – TKB 13), 4.7 (keine Pflicht zum Verkleben; Belag und Verlegewerkstoff muessen freigegeben sein, Richtwert R ≤ 0,15 m²K/W – DIN EN 1264-2, Herstellerdatenblaetter), 4.8 (Untergrundtabelle Fixierer, Grundierung bei saugenden/staubenden Flaechen – Hersteller-Merkblaetter), 4.9 (24–48 h, Raum/Material ≥ 18 °C, Boden ≥ 15 °C, 40–65 % r. F. – TKB 13/17, Klebstoffhersteller), 4.12 (Ablueften Pflicht, auf dichten Untergruenden laenger – TKB 13, Fixierer-Merkblatt), 4.13 (Methode nach Belaghersteller, Schlinge in der Florgasse, Doppelschnitt nie im Kleberbett – TKB 13, Klebstoffhersteller), 4.15 (lose: Raender und Tuerbereich mit Band – Baunetz Wissen), 4.16 (TKB-Zahnung laut Kleberhersteller, anwalzen 50 kg, nach 30–45 min wiederholen – TKB 13). **Bleibt offen:** 4.1 (Dauer/Personen nicht belegt, Metafelder leer), 4.5 (Rueckenarten fuer lose Verlegung), 4.6 Band vs. fluessig als Hausempfehlung, 4.10 (Ueberstand), 4.11 (Bandabstand – je Produkt), 4.13 Nahtversiegelung, 4.14 (Belagende unter dem Tuerblatt). Entwuerfe RAT-TB-006 (Fliesen) und RAT-TB-007 (Wellen) recherchiert und auf `freigegeben`; offen bleiben dort nur Hausfragen (Praxisfall, Nachfixieren als Leistung, Reklamationsabgrenzung).

### 5. Teppichboden pflegen und Flecken entfernen: Was wirklich hilft

- **5.1** Ist die Aussage „eingetretener Sand wirkt wie ein Schleifmittel und macht Laufzonen stumpf“ aus Ihrer Sicht richtig und so formulierbar?
- **5.2** Welchen Saugrhythmus empfehlen Sie Kunden je Raumnutzung? Stimmen „mehrmals pro Woche“, „ein- bis zweimal“ und „einmal pro Woche“?
- **5.3** Stimmt die Zuordnung Bürste / glatte Düse je Machart mit Ihrer Empfehlung überein – insbesondere „Schlinge und Hochflor nur mit glatter Düse“ und „Nadelvlies mit Bürste“?
- **5.4** Bestätigen Sie „herausstehende Fäden und gezogene Schlingen abschneiden, nie ziehen“?
- **5.5** Welche Mindestlänge der Sauberlaufzone empfehlen Sie im Wohnbereich (z. B. zwei bis drei Schrittlängen)?
- **5.6** Welche Gleiter empfehlen Sie auf Teppichboden – Filzgleiter oder glatte Kunststoff- bzw. Metallgleiter?
- **5.7** Empfehlen Sie Bodenschutzmatten auf Teppichboden, und worauf soll der Kunde bei der Matte achten?
- **5.8** Materialliste im Metafeld (weiße Tücher, Löffel, Wasser, weiche Bürste, Kühlakku, Staubsauger, geeigneter Fleckentferner) – vollständig und so richtig benannt?
- **5.9** Bestätigen Sie „Mittel immer auf das Tuch, nie direkt auf den Belag“ – oder gilt das bei bestimmten Fleckentfernern anders?
- **5.10** Stimmt „Reinigerreste führen zu schnellerer Wiederanschmutzung“ nach Ihrer Erfahrung?
- **5.11** Empfehlen Sie verdünntes Feinwaschmittel als Hausmittel, oder ausschließlich Teppich-Fleckentferner?
- **5.12** Raten Sie bei Rotwein von Salz ab, oder empfehlen Sie es? Bitte Zeile entsprechend anpassen.
- **5.13** Welche erste Maßnahme empfehlen Sie bei Fett – gibt es ein Hausmittel, das Sie guten Gewissens nennen?
- **5.14** Bestätigen Sie die Kältemethode bei Kaugummi für alle Macharten?
- **5.15** Empfehlen Sie die Bügeleisen-Methode bei Wachs – wenn ja, bei welcher Einstellung –, oder raten Sie davon ab?
- **5.16** Bestätigen Sie „Schlamm erst trocknen lassen, dann saugen“?
- **5.17** Gibt es bei Tinte eine erste Maßnahme, die Sie empfehlen (z. B. Alkohol auf dem Tuch), oder soll der Kunde nichts selbst versuchen?
- **5.18** Empfehlen Sie bei Tierurin ein Hausmittel (z. B. verdünntes Essigwasser) oder einen bestimmten Reinigertyp?
- **5.19** Stimmt „Durchnässen kann Fixierung bzw. Kleber beeinträchtigen“ für die bei Ihnen üblichen Verlegearten?
- **5.20** Welche Haushaltsmittel sollen Kunden ausdrücklich nicht verwenden? Ist die Liste vollständig?
- **5.21** Raten Sie von Dampfreinigern auf Teppichboden generell ab oder nur bei verklebter bzw. fixierter Ware?
- **5.22** Welche Pflegehinweise geben Sie Kunden zu Wollteppichboden mit – stimmen „wenig Feuchtigkeit, kein heißes Wasser, keine stark alkalischen Mittel, nur wollgeeignete Reiniger“?
- **5.23** In welchem Abstand empfehlen Sie im Wohnbereich eine Grundreinigung – oder nur nach Bedarf?
- **5.24** Für welche Verlegearten und Rückenarten halten Sie die Sprühextraktion für geeignet, für welche nicht?
- **5.25** Bieten Sie eine Grundreinigung selbst an oder vermitteln Sie sie? Sollen Kunden mit Pflegefragen auf die Kontaktseite verwiesen werden? → beantwortet aus Shopdaten: /pages/teppichreinigung nur fuer lose Teppiche, keine verlegte Auslegware; Hinweis im Artikel
- **5.26** Welche Methode empfehlen Sie bei Druckstellen (anfeuchten und aufbürsten, Eiswürfel, Dampf mit Abstand)? Gibt es Macharten, bei denen Druckstellen dauerhaft bleiben?
- **5.27** Trifft „Flusen in den ersten Wochen sind normal und lassen nach“ auf die Qualitäten im Shop zu – bei welchen Macharten besonders, und welchen Zeitraum nennen Sie Kunden?
- **5.28** Wie formulieren Sie den Hinweis zum Neugeruch gegenüber Kunden, und welchen Zeitraum nennen Sie?
- **5.29** Setzen Sie bei kleinen Schäden Flicken aus Reststücken ein, und soll der Ratgeber dazu raten, ein Reststück aufzubewahren?

> Stand 2026-10-02 (Recherche): **beantwortet** 5.8 (Kuehlakku ergaenzt), 5.14 (Kaeltemethode Kaugummi), 5.15 (Wachs: Loeschpapier, lauwarmes Buegeleisen – Vorwerk, toom), 5.16 (Schlamm trocknen lassen, dann saugen), 5.12/5.13/5.17/5.18 (kein Hausmittel genannt, Fleckentferner mit Test an verdeckter Stelle – Quellen uneinheitlich), 5.22 (Wolle: keine alkalischen Mittel, wenig Naesse – Vorwerk, Utopia). **Bleibt offen:** 5.25 (Angebot Grundreinigung) und alle Fragen nach Hauserfahrung (5.1–5.7, 5.9–5.11, 5.19–5.21, 5.23, 5.24, 5.26–5.29) – keine zwei uebereinstimmenden seriösen Quellen gefunden bzw. Shop-Entscheidung.
