# Angebotsassistent (Google Apps Script + Lexware)

Stand 2026-10-13 · erster lauffähiger Stand · Grundlage: Lexware-Skill
„teppich-paradies-lexware-angebote“ (SKILL.md, angebotsregeln.md,
formulierungen.md, pflichtkontrolle.md) und der Artikelabruf vom 13.10.2026.

Kundenangaben und Aufmaße werden zu einer **prüfbaren Vorschau**. Erst wenn
alle Pflichtkontrollen bestanden und bestätigt sind, legt ein Mensch per Klick
**genau einen bearbeitbaren Lexware-Entwurf** an. Der wird sofort vollständig
zurückgelesen und verglichen.

**Was das Programm nie tut:** Angebote finalisieren oder versenden, Artikel
anlegen, Artikelpreise ändern, Kunden anlegen, Preise schätzen oder einen
unbekannten Preis mit 0,00 € ersetzen.

## Architektur

```
Google Drive: Ordner „TP Angebotsassistent“
 ├─ Artikel_aktuell.json        aktueller Lexware-Artikelstamm (einzige Preisquelle)
 ├─ Artikel_JJJJ-MM-TT_hhmm.json ältere Stände (automatisch umbenannt)
 ├─ Vorgänge/<ID>_<LexwareID>.json  Ablage: Eingabe, gesendet, gespeichert, Summen
 └─ Google Sheet „Angebotsassistent“ mit gebundenem Apps-Script
     ├─ Kopf / Räume / Zusatz   Eingabe (Kunde, Aufmaß, Zusatzpositionen)
     ├─ Vorschau                Positionen, Summen, Meldungen, Pflichtkontrolle
     ├─ Vorgänge                fortlaufendes Protokoll (Dublettenschutz)
     └─ Artikel                 lesbare Übersicht des Artikelstamms
                 │ UrlFetch (Bearer-Schlüssel aus Skripteigenschaften)
                 ▼
Lexware Office API: /v1/articles (lesen), /v1/quotations (Entwurf anlegen, lesen),
                    /v1/voucherlist (Entwürfe suchen), /v1/profile (Verbindungstest)
```

| Datei | Inhalt | Wer pflegt |
|---|---|---|
| `src/00_konfig.js` | Regelparameter (649 €, 15 km, 12 m², Zugabe 10 cm), Artikelverweise je Leistung, Reihenfolge – **keine Preise** | Regeländerung per PR |
| `src/20_textbausteine.js` | Formulierungen wortgleich aus dem Skill | per PR |
| `src/21_pflichtkontrolle.js` | jeder Punkt der Pflichtkontrolle als automatische Prüfung oder als Bestätigung | per PR |
| `src/10_artikel.js` | Artikelstamm einlesen, AUSORTIERT/archiviert ausschließen, Preisstatus | – |
| `src/30_kalkulation.js` | Kalkulation (rein deterministisch, ohne KI) | – |
| `src/40_lexware.js` | Payload, Rücklese-Vergleich, Fehlertexte, Dublettenschutz (rein) | – |
| `src/50_eingabe.js` | Tabellen ↔ Vorgang | – |
| `src/60_google.js` | Einzige Datei mit Google-Diensten: Menü, Drive, Sheets, UrlFetch | – |
| `src/80_beispiele.js` | drei erfundene Testvorgänge (einfach, Verlegung, umfangreich) | – |
| `test/` | 28 Node-Tests, laufen in `npm test` (`npm run lexware:test`) | – |

Preise, Kunden- und Angebotsdaten liegen nur in Drive, nie in diesem öffentlichen
Repository. `test/fixtures/artikel_auszug.json` ist ein Auszug mit echten IDs,
Nummern und Preisen. Die Bezeichnungen der Belags- und Leistenartikel sind darin
neutralisiert.

## Einrichtung (einmalig, ca. 15 Minuten)

1. In Google Drive den Ordner **„TP Angebotsassistent“** anlegen und
   `Artikel_aktuell.json` aus dem Übergabepaket hineinlegen.
2. Im Ordner ein neues Google Sheet „Angebotsassistent“ anlegen.
   **Erweiterungen → Apps Script**.
3. Code übertragen, eine von zwei Varianten:
   - **Mit clasp (empfohlen, versioniert):** `.clasp.json.beispiel` nach
     `.clasp.json` kopieren und die Script-ID eintragen (Apps Script →
     Projekteinstellungen). Dann in diesem Ordner `npx @google/clasp login`
     und `npx @google/clasp push` ausführen.
   - **Von Hand:** für jede Datei aus `src/` im Editor eine gleichnamige
     Skriptdatei anlegen und den Inhalt einfügen. Für `appsscript.json` vorher
     unter Projekteinstellungen „Manifest anzeigen“ aktivieren.
4. Das Sheet neu laden. Dann im Menü **Angebote → Einrichtung**:
   **Tabellenblätter anlegen**, anschließend **Drive-Ordner festlegen**
   (Ordnerlink einfügen), zuletzt **Lexware-API-Schlüssel hinterlegen**.
   Beim ersten Aufruf fragt Google nach den Berechtigungen.
5. **Angebote → Lexware: Verbindung & Feldprüfung.** Der Test liest ein
   vorhandenes Angebot und belegt die verwendeten Feldnamen (✔/✘). Erst danach
   den ersten Entwurf anlegen.
6. **Angebote → Beispiel laden → …** zeigt die Vorschau mit Testdaten.

**Zum API-Schlüssel:**
- Er liegt nur in den Skripteigenschaften, nicht im Sheet und nicht im Repository.
- Wer das Sheet bearbeiten darf, kann auch das Skript öffnen. Deshalb das Sheet
  nur für Inhaber und Angebotskollegen freigeben, nie „jeder mit Link“.
- Wenn Lexware getrennte Lese- und Schreibschlüssel anbietet, reicht für den
  Artikelabruf ein Leseschlüssel.

## Bedienung

1. Blatt **Kopf** ausfüllen:
   - Vorgangs-ID, Datum, Kundentyp, Kontakt-ID oder Anschrift
   - Entfernung, Fahrzone, Anzahl Fahrten
2. Blatt **Räume**: je Raum eine Zeile mit:
   - Maßen, Bodenart, Belag-Artikel und Verlegeart
   - bei Bedarf Dämmung, Silikon, Sockelleiste, Einschubleiste und Profil
3. Blatt **Zusatz**: weitere Positionen (z. B. AB-, UG-, ZU-Positionen) mit
   Menge. Hier lassen sich Positionen auch als optional markieren oder mit
   begründetem Sonderpreis versehen.
4. **Angebote → Vorschau berechnen.** Die Vorschau zeigt:
   - Positionen in Regelreihenfolge
   - Summen und optionale Positionen
   - Status der Aktion
   - Meldungen und Pflichtkontrolle
5. Fehler und Regelkonflikte (rot) beheben. Offene Punkte (gelb) blockieren
   nicht, werden aber ausgewiesen. Bei „Grobe Erstkalkulation = ja“ erscheinen
   sie im Schlusstext.
6. Die vier manuellen Prüfungen im Kopf auf „ja“ setzen:
   - Kunde und Anschrift korrekt
   - Adresse öffentlich geprüft
   - Untergrund berücksichtigt
   - Fahrten realistisch
7. **Angebote → Lexware-Entwurf erstellen …**. Nach der Bestätigung entsteht
   genau ein Entwurf. Er wird zurückgelesen und verglichen, dann erscheint der
   Bearbeitungslink.
8. Änderung nach dem Anlegen: Die Lexware-API kann Angebote nicht ändern. Also
   neue Vorgangs-ID (`…-v2`) vergeben, neuen Entwurf anlegen und den alten in
   Lexware löschen.

Werte für **Bodenart**: `teppichboden`, `pvc`, `klebevinyl`, `klickvinyl`,
`laminat`, `parkett`.

Werte für **Verlegeart**:

| Bodenart | Verlegearten |
|---|---|
| Teppichboden | `lose`, `band`, `klett`, `fixiert`, `verklebt` (mit „Wolle = ja“ → TB-070) |
| PVC | `lose`, `band`, `fixiert`, `verklebt` |
| Klebevinyl | `verklebt`, `fischgraet` |
| Klickvinyl | `mit_daemmung`, `ohne_daemmung` |
| Laminat | `mit_daemmung` |
| Parkett | `schwimmend`, `verklebt`, `landhausdiele_verklebt` |

Werte für **Sockelleisten-Montage**: `cubu_bis60`, `kso_bis60`,
`hamburger_bis60`, `kunststoff_ab80`, `holz_bis60`, `holz_ab80`.

## Wie die Regeln umgesetzt sind

| Regel (angebotsregeln.md) | Umsetzung |
|---|---|
| 2 Artikel | Preis, Einheit, Beschreibung nur aus dem Artikelstamm. Archivierte und AUSORTIERT-Artikel sind ausgeschlossen. Preis 0 nur bei bestätigt kostenloser Aktionsposition, sonst Fehler. Spezialfälle (Steuersatz ≠ 19 %, Netto mit mehr als 2 Stellen) werden als Konflikt gemeldet. |
| 3 Aktion 649 € | Brutto-Warenwert nur aus Teppich-/PVC-Rollenware. Bedingungen: höchstens 15 km, Privatkunde, kein rabattierter Belag. Bei unbekannter Entfernung wird die Aktion nicht angewendet, es kommt eine Rückfrage. Bei aktiver Aktion: Aktions-Verlegeposition 0 € und 1. Fahrt inklusive. |
| 4 Fixierung | Bei Aktion „Zusätzlich Rollenware vollflächig fixieren“ bzw. Klettband-Zusatz. TB-020 bei Aktion ist ein Konflikt. Sprühkleber ist gesperrt. Bei loser Verlegung kommt ein Hinweis „Fixierung anbieten“, oder die Fixierung wird als optionale Position aufgenommen. |
| 5 Flächen | Bestellmaß je Raum/Bahn = Rollenbreite × (Länge + 10 cm), auf volle cm. Verlegung, Fixierung und Kleber nach Netto-Verlegefläche. Eine kürzere Bestelllänge ist ein Konflikt. Ist der Raum breiter als die Rolle, müssen Bahnen angegeben werden. |
| 5a Dämmung | Netto / Rolleninhalt ohne extra Verschnitt (Entscheidung 14.10.2026), auf halbe Rolle aufgerundet (optional ganze Rollen). Menge = Rollen × Inhalt, Beschreibung „entspricht ca. X Rollen à Y m²“. |
| Verpackung | Paketware: Netto × (1 + Verschnitt %) / Paketinhalt → ganze Pakete. Ohne Verschnittangabe wird nichts geschätzt, das ist ein Fehler. „Anteilig“ ist bewusst wählbar. |
| Pauschalen | Lexware-Pauschale „Einzelraum bis 12 m²“, wenn die Verlegegruppe genau ein Raum mit höchstens 12 m² ist. |
| 6 Fahrten | FA-010 (nah), „An- und Abfahrt Berlin“, weitere Entfernung = Fehler. Mehrere Fahrten laufen über die Menge. |
| 7 / 14 Reihenfolge | Sortierung nach Regel 14. MG-010 ist automatisch vorletzte, An-/Abfahrt letzte Position; beides wird geprüft. |
| 8 Silikon | 2 × (L + B) − Türbreiten + Zusatz, auf volle lfm. Ohne Türbreiten wird die Menge als vorläufig markiert. TZ-020 je Zarge. Silikonfarbe-Text. |
| 8a Profile | PR-010 als Standard, Länge vorläufig markierbar, Textbaustein. |
| 9 / 9a Sockelleisten | Material (ganze Leisten mit Verschnitt) und Montage getrennt. Bei bestehenden Einschubleisten: AB-012 + SL-101, nie SL-100. |
| 10 / 11 / 17 | Hinweis, wenn kein Untergrund kalkuliert ist. Sigan-Hinweis. Erstkalkulationstext mit offenen Punkten. Malerhinweis nur als Text. |
| 13 Preise | Netto mit 2 Stellen. Sonderpreise brauchen eine Begründung und werden in der Vorschau gelb sowie im Protokoll markiert. |
| 15 Pflichtkontrolle | 21 Punkte, davon 4 per Bestätigung. Ohne alle Punkte kein Entwurf. |
| 16 Lernregel | Eine neue allgemeine Regel wird eine Änderung an `00_konfig.js`, `20_` oder `21_` per PR, mit Test. So bleibt sie nachvollziehbar und gilt für alle. |

## Festgelegte Werte (Inhaber, 14.10.2026)

| Wert | Festlegung |
|---|---|
| Dämmunterlagen | ohne extra Verschnitt, auf halbe Rolle aufgerundet |
| Sockelleisten-Verschnitt | Standard 10 %, ein Wert im Vorgang geht vor |
| Angebotsgültigkeit | 30 Tage |
| Pauschale „Einzelraum bis 12 m²“ | nur wenn die Verlegegruppe genau ein Raum mit höchstens 12 m² ist |
| Aktions-Verlegeartikel | Lexware-ID `a8cdfc6b-e55b-4859-8098-1818210a7e67` |

## Lexware-Anbindung

- **Endpunkt:** `POST /v1/quotations` ohne `finalize`, legt einen Entwurf an.
- **Pflichtangaben:**
  - `voucherDate` und `expirationDate` im Format `JJJJ-MM-TTT00:00:00.000+01:00/+02:00`; Sommerzeit Europe/Berlin wird berechnet.
  - `address` mit `contactId` oder Name + `countryCode`
  - `lineItems` mit `type` (`service`/`material`), Artikel-`id`, `name`, `quantity`, `unitName`, `unitPrice` (`currency`, `netAmount`, `taxRatePercentage`)
  - `totalPrice.currency`
  - `taxConditions.taxType = net`
- **Rundung:**
  - Einzelpreise netto mit 2 Stellen, Mengen mit höchstens 4 Stellen.
  - Zeilensummen auf 2 Stellen.
  - Umsatzsteuer auf die Nettosumme je Steuersatz.
  - Die Vorschau rechnet so wie Lexware; das Rücklesen vergleicht Netto, Steuer und Brutto auf den Cent.
- **Optionale Positionen:**
  - Werden mit `optional: true` gesendet und gehen nicht in die Summe ein.
  - Das Rücklesen prüft, ob Lexware das Kennzeichen gespeichert hat.
  - Optionale oder alternative Positionen verhindern später Folgebelege über die API (HTTP 406).
- **Fehler:**
  - Beide Lexware-Fehlerformate werden lesbar angezeigt (`IssueList` bzw. `details`).
  - 429: genau ein Wiederholungsversuch; Lexware führt den Aufruf bei 429 nicht aus.
  - Höchstens 2 Anfragen pro Sekunde.
  - 5xx oder Netzfehler beim Anlegen gelten als „UNKLAR“. Dann ist keine neue Erstellung möglich, bis geprüft ist, ob ein Entwurf entstanden ist.
- **Dublettenschutz:**
  - Dokumentsperre gegen Doppelklick bzw. zwei Personen gleichzeitig.
  - Protokolleintrag „ERSTELLUNG_LAEUFT“ vor dem Senden.
  - Fingerabdruck des Inhalts.
  - Je Vorgangs-ID höchstens ein Entwurf.
- **Rücklesen:** `GET /v1/quotations/{id}`. Verglichen werden:
  - Status Entwurf
  - Kontakt
  - jede Position (ID, Name, Beschreibung, Menge, Einheit, Preis, Steuer, optional)
  - Summen, Schlusstext, Datum
- **Live geprüft am 14.10.2026:**
  - Die Feldprüfung zeigt ✔ bei allen Kopf- und Positionsfeldern, geprüft an einer service-Position mit Artikel-ID.
  - Der erste Testentwurf (TEST-EINFACH, 4 Positionen) wurde angelegt und zurückgelesen. Der gespeicherte Entwurf stimmte vollständig mit der Vorschau überein.
  - Die offizielle Doku war aus der Entwicklungsumgebung gesperrt. Die Feldnamen sind deshalb durch diesen Live-Test belegt, nicht durch die Doku.

## Befunde aus den gelieferten Daten

- **Dämmunterlagen:** Die aktiven Dämmartikel enthalten den Verschnitt laut Text
  bereits. Entscheidung Inhaber 14.10.2026: kein zusätzlicher Verschnitt, weiter
  auf die nächste halbe Rolle aufrunden. Regel 5a im Lexware-Skill entsprechend anpassen.
- **Historische Werte nicht als Standard übernommen:**
  - Anfahrt 39 €: Der aktuelle Standard FA-010 kostet 59 €. Ein abweichender Preis braucht eine Begründung.
  - Fehlendes MG-010: wird bei Verlegeangeboten automatisch ergänzt.
  - Reinigung 29 €: nur als begründeter Sonderpreis möglich.
  - Bestelllänge 4,15 m statt 4,16 m: wird als Konflikt gemeldet.
- **Doppelte Anfahrtsartikel:** Neben FA-010 gibt es den Artikel „An- und
  Abfahrt“ ohne Nummer mit gleichem Preis. Das Programm nutzt nur FA-010.
  Berlin und die Aktionspositionen haben keine Artikelnummer und werden deshalb
  per Lexware-ID referenziert.
- **Kundenspezifische Einzelfreigabe in Regel 8:** 10 lfm Silikon für ein
  bestimmtes Bad wurde nicht als allgemeine Regel übernommen; sie gehört in den
  jeweiligen Vorgang.

## Wo noch KI hilft – und wo nicht

**Ohne KI**, deterministisch in diesem Programm:
- Mengen, Bestellmaße, Verschnitt, Pakete und Rollen
- Aktion
- Fahrten
- Reihenfolge
- Pflichtkontrolle
- Summen
- Lexware-Entwurf
- Rücklesen

**Mit KI sinnvoll**, als Vorschlag in die Tabellen und mit Prüfung durch einen Menschen:
- Freitext, Sprachnotizen oder Fotos vom Aufmaß in Raumzeilen übersetzen
- Den passenden Belagsartikel vorschlagen
- Einleitungstexte formulieren
- Adressen gegen öffentliche Quellen prüfen

Die öffentliche Adressprüfung bleibt vorerst eine Bestätigung durch einen
Menschen.
