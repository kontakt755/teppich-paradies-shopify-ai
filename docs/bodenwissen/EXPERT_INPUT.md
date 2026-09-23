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

## 3. Fragen fuer die naechste Welle

Zu den fuenf Themen aus `CONTENT_BACKLOG.md`, Abschnitt „Naechste Welle".
Jeweils das, was ohne Antwort nicht geschrieben werden kann.

### TB-V-02 Teppichboden auf Fliesen
- Wie geht Ihr Team bei ausgepraegten Fliesenfugen tatsaechlich vor — spachteln,
  ausgleichen, oder haengt es von der Fugenbreite ab? Ab welcher Breite?
- Wird auf Fliesen grundsaetzlich grundiert? Wenn ja, womit — oder haengt das am
  Produkt des Herstellers?
- Muessen lose oder hohle Fliesen vorher raus? Woran erkennt der Kunde das?
- Bei welchen Teppichboeden (Ruecken, Machart) raten Sie auf Fliesen ab?

### TB-A-01 Schlinge oder Velours
- Welche der beiden empfehlen Sie wofuer — und was ist der Grund, den Sie
  Kunden im Laden nennen?
- Trifft „Velours zeigt Trittspuren" und „Schlingen koennen durch Krallen
  gezogen werden" zu, oder ist das zu pauschal?
- Gibt es Raeume, in denen Sie von einer der beiden grundsaetzlich abraten?

### UG-01 Untergrund pruefen
- Welche Punkte pruefen Sie vor jeder Verlegung, in welcher Reihenfolge?
- Was davon kann ein Kunde selbst pruefen, was nicht?
- Ab welcher Unebenheit muss gespachtelt werden? Wie messen Sie das?

### TB-X-01 Teppichboden wirft Wellen
- Welche Ursachen sehen Sie in der Praxis am haeufigsten?
- Was davon laesst sich nachtraeglich beheben, was nicht?
- Ab wann ist das ein Reklamationsfall?

### VI-01 Klickvinyl oder Klebevinyl
- Wozu raten Sie in der Mietwohnung, wozu im Eigentum?
- Welche Untergruende schliessen eine der beiden Arten aus?
- Bei Fussbodenheizung: gibt es eine klare Hausempfehlung?

## 4. Wie eine Antwort in den Shop kommt

1. Antwort in die passende Zeile von `content/ratgeber/<bereich>/README.md` oder
   direkt in den Artikeltext.
2. `geprueft_von` und `stand` setzen — **nur**, wenn wirklich geprueft wurde.
3. `npm run bodenwissen:guard` und `npm run ratgeber:payload` laufen lassen.
4. Ueber die normale Kette live: PR → main → Preview → Live.

Eine Antwort, die nur im Chat steht, ist nicht im Shop.
