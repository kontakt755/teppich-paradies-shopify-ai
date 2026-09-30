# Die Agenten des Social-Media-Betriebs

Sieben Rollen statt der zehn aus dem ersten Entwurf: wo zwei Aufgaben immer
zusammen laufen (Eingang + technische Prüfung, Freigabe + Veröffentlichung,
Story + Beitrag), sind sie eine Rolle. Fünf der sieben sind reine Programme –
sie kosten nichts, laufen ohne offene Sitzung und tun jedes Mal dasselbe. Nur
wo Urteil nötig ist (Bilder ansehen, Texte schreiben), arbeitet Claude.

```
 Monteur-Handy ──► 1 Eingang ─────────┐
                                      ▼
 Shop-Feed ──────► 2 Shop-Scout ──► Datenbank ◄──► 3 Redaktion (Claude)
 Referenzgalerie ────────────────────┘ │                │ Bauplan + Text
                                       ▼                ▼
                                 5 Planer ◄──── 4 Werkstatt (Bild + Vorlage)
                                       │
                                       ▼
                         6 Freigabe ──► Publisher ──► Instagram / Facebook
                                       ▲                    │
                                       └──── 7 Auswertung ◄─┘  (Lernstand)
```

Alle Agenten teilen sich eine Datenbank (`$TP_PRIVAT_DIR/social/social.db`) und
sprechen nur über sie miteinander. Fällt einer aus, bleiben die anderen
arbeitsfähig.

---

## 1 · Eingang (Content Inbox + Baustellen-Agent, technischer Teil)

| | |
|---|---|
| **Aufgabe** | Fotos und Videos der Bodenleger entgegennehmen, technisch prüfen, einsortieren. |
| **Input** | Upload über den persönlichen Link: Dateien (JPG, HEIC, PNG, WebP, MP4, MOV) und wenige Angaben zum Antippen (Ort, Boden, Raum, Tätigkeit, vorher/nachher, Einwilligung). |
| **Output** | Inhalt `baustelle` im Status `NEU` → `IN_PRUEFUNG`; je Datei ein Medium mit Urteil `ok`, `unsicher`, `aussortiert` oder `dublette` samt Grund. |
| **Trigger** | sofort nach jedem Upload; zusätzlich alle 15 Minuten (`social-takt`). |
| **Schnittstellen** | eigener Upload-Server (Port 8021), macOS `sips` für HEIC und Messung, SQLite. |
| **Regeln** | Ohne Einwilligung des Kunden entsteht kein Eintrag. Nie genauer als der Ort: Angaben mit Straße oder Hausnummer werden verworfen. Dateityp wird am Inhalt erkannt, nicht am Namen. Aussortiert wird: lange Kante unter 1080 px, zu dunkel, überbelichtet, verwackelt. Dubletten per Bild-Hash, auch gegen ältere Baustellen. Originale bleiben unverändert liegen. |
| **Fehlerbehandlung** | Unlesbare Datei → `aussortiert` mit Grund, der Rest läuft weiter. Reißt die Verbindung ab, wird die halbe Datei gelöscht und die Seite sendet sie erneut (bis zu dreimal); eine Ablehnung wie „falscher Dateityp“ wird nicht wiederholt. Der Takt fasst eine Baustelle erst 20 Minuten nach ihrem Start an, damit kein laufender Upload halb geprüft wird; nachgereichte Dateien werden trotzdem erfasst. Je Upload höchstens 25 Dateien und 1,5 GB, je Link 30 Uploads am Tag. Bleibt kein brauchbares Bild, wird die Baustelle mit Begründung verworfen. |
| **Mensch nötig** | nein. |

Code: `lib/eingang.mjs`, `lib/bildpruefung.mjs`, `lib/pruefung.mjs`, `scripts/server.mjs` (Upload), `ui/upload.html`.

## 2 · Shop-Scout (Shopify-Agent und Produkt-Content-Agent)

| | |
|---|---|
| **Aufgabe** | Im Shop Anlässe finden, die einen Beitrag wert sind, und daraus einen Vorrat anlegen. |
| **Input** | öffentlicher Produktfeed `/products.json` (Titel, Bilder, Farben, Preise, Streichpreise, Tags, Datum); Quadratmeterpreise aus dem Produktlexikon des Control Centers; Musterbestellungen aus `kennzahlen/shop-snapshot.json`; letzter bekannter Stand je Produkt. |
| **Output** | bis zu zehn Inhalte `shopify` je Lauf mit Art (`produkt_neu`, `produkt_farben`, `angebot`, `raumidee`, `produkt_woche`), Punktzahl, Begründung und Bildern. |
| **Trigger** | täglich 06:40 (`social-lauf`). |
| **Schnittstellen** | Shop-Feed per HTTPS – ohne Zugangsdaten. Später zusätzlich Shopify-Webhooks (siehe `PLAN.md`). |
| **Regeln** | Gewertet wird die Produktfamilie, nicht das Einzelprodukt (39 Dekore einer Serie sind ein Thema). Kein Beitrag ohne taugliches Bild; Raumbilder vor Musterflächen. Kein Zubehör, nichts Ausverkauftes. „Angebot" erst ab 20 % oder Tag `stark-reduziert` – der übliche Shop-Rabatt ist kein Anlass. „Neu" nur in den ersten 14 Tagen. Eine gezeigte Familie ruht 45 Tage. Je Lauf höchstens drei Anlässe derselben Art und derselben Warengruppe. Jahreszeit und Musterbestellungen heben die Punktzahl. |
| **Fehlerbehandlung** | Feed nicht erreichbar oder leer → Abbruch ohne Änderung, nächster Versuch am Folgetag. Tauscht der Shop Produktbilder aus, wird der Anlass freigegeben und beim nächsten Lauf mit frischen Bildern neu angelegt. |
| **Mensch nötig** | nein. |

Code: `lib/shop-quelle.mjs`, `lib/produkt-auswahl.mjs`, `lib/ablauf.mjs` (`shopAbgleich`).

## 3 · Redaktion (Baustellen-Sichtung, Text-Agent, Story-/Reel-Entscheidung)

| | |
|---|---|
| **Aufgabe** | Bilder ansehen und beurteilen, das Beste auswählen, Vorher/Nachher und Bodenart erkennen, Texte schreiben, das Format wählen (Beitrag, Karussell, Story, Reel). |
| **Input** | `npm run social -- offen --json`: offene Inhalte mit Bildpfaden, Angaben, Shopdaten und den Stilregeln. |
| **Output** | Sichtungsurteil je Bild (`sichtung`), ergänzte Angaben (`inhalt`), Entwürfe mit Bauplan und Text (`entwurf`). |
| **Trigger** | geplante Claude-Aufgabe „Social-Redaktion", werktags morgens nach dem Grundlauf. Arbeitsanweisung: `REDAKTION.md`. |
| **Schnittstellen** | ausschließlich die Kommandozeile `npm run social`; keine direkten Schreibzugriffe auf Meta oder Shopify. |
| **Regeln** | **Datenschutz zuerst:** jedes Baustellenbild wird auf Personen, Kennzeichen, Namen, Adressen, Dokumente, Bildschirme, Familienfotos und Klingelschilder geprüft; bei Zweifel `bedenken` – das Bild ist dann für jeden Beitrag gesperrt. Texte nach den Stilregeln in `lib/texte.mjs`: nur Angegebenes, kein Werbeton, Sie-Form, Ort nur wenn bekannt, Preise nur je Quadratmeter aus den Shopdaten. Jeder Text läuft durch `pruefeText`; Floskeln und Adressen lehnt das System ab. Aus jeder Baustelle wird zusätzlich eine Story geprüft, bei Vorher + Arbeit + Nachher ein Reel. |
| **Fehlerbehandlung** | Abgelehnter Text → neu formulieren, höchstens drei Versuche, dann den Inhalt mit Notiz liegen lassen. Läuft die Redaktion nicht, bleibt der Vorrat stehen; in der Zentrale erzeugt „Entwurf erstellen" einen Vorschlag mit schlichtem Standardtext. |
| **Mensch nötig** | nein für Entwürfe – aber kein Entwurf erscheint ohne Freigabe. |

Code: `lib/texte.mjs` (Regeln, Hashtags, Handlungsaufruf, Prüfung), `REDAKTION.md`.

## 4 · Werkstatt (Bild-Agent)

| | |
|---|---|
| **Aufgabe** | Aus Bauplan und Bildern fertige Beitragsbilder rendern – im Designsystem, in den richtigen Formaten. |
| **Input** | Bauplan: Liste von Folien, je Vorlage und Daten; Bilder als Medium-ID oder Shop-Adresse. |
| **Output** | JPEG 1080 × 1350 (Beitrag, Karussell) bzw. 1080 × 1920 (Story, Reel-Standbild) unter `medien/<inhalt>/beitrag-<n>/`; bei Reels zusätzlich `reel.mp4` (H.264/AAC, 30 fps), die Standbilder heißen dort `rahmen-*.jpg` und werden nie einzeln veröffentlicht; ein Beitrag im Status `FREIGABE`. |
| **Trigger** | jeder `entwurf`-Aufruf (Redaktion, Zentrale). |
| **Schnittstellen** | Headless-Chrome über das vorhandene `puppeteer`; `ffmpeg` für Reels (`brew install ffmpeg`). |
| **Regeln** | Baustellenfotos: nur Zuschnitt, kleine Signatur und eine Helligkeitskorrektur von höchstens 10 % – nie Sättigung, Farbton oder KI-Bearbeitung; Herstellerbilder bleiben ganz unberührt. Text im Bild nur, wo er etwas sagt (Farbname, „Vorher", Preis). Preis im Bild nur als Euro je Quadratmeter, nie der Paketpreis. Fertige Bilder tragen keine Metadaten (kein GPS aus dem Handyfoto). Ein Bild mit Datenschutz-Bedenken lässt sich nicht verbauen. |
| **Fehlerbehandlung** | Lädt ein Bild nicht, entsteht kein Beitrag (nie ein Bild mit Lücke). Bei ausgetauschten Shop-Bildern → siehe Shop-Scout. |
| **Mensch nötig** | nein. |

Code: `lib/vorlagen.mjs`, `lib/rendern.mjs`, `lib/werkstatt.mjs`, `lib/reel.mjs`, `DESIGNSYSTEM.md`.

## 5 · Planer (Content-Planer)

| | |
|---|---|
| **Aufgabe** | Aus den Entwürfen einen Veröffentlichungsplan mit sinnvoller Mischung machen. |
| **Input** | Entwürfe ohne gültigen Termin, bereits geplante Beiträge, Lernstand der Auswertung. |
| **Output** | Terminvorschlag je Entwurf (sichtbar in der Freigabe als „Geplant: …"). |
| **Trigger** | nach jedem neuen Entwurf und im täglichen Grundlauf. |
| **Schnittstellen** | nur die Datenbank. |
| **Regeln** | Raster: Dienstag und Donnerstag 18:00, Samstag 10:30; Montag und Freitag nur bei vollem Vorrat. Höchstens fünf Beiträge und ein Angebot je Woche, ein Beitrag je Tag. Nie zweimal hintereinander dieselbe Themengruppe (Handwerk, Produkt, Angebot, Wissen). Frisches von der Baustelle zuerst, Befristetes vor Zeitlosem. Storys haben ein eigenes, häufigeres Raster (Mo–Fr 12:00, Sa 9:30). Der Lernstand verschiebt die Reihenfolge um höchstens ±25 %. |
| **Fehlerbehandlung** | Verstreicht ein Vorschlag ohne Freigabe, vergibt der nächste Lauf einen neuen. |
| **Mensch nötig** | nein – der Termin ist bis zur Freigabe ein Vorschlag und dort änderbar. |

Code: `lib/planer.mjs`, `lib/konfig.mjs` (`RASTER`).

## 6 · Freigabe und Publisher

| | |
|---|---|
| **Aufgabe** | Jeden Entwurf einem Menschen vorlegen; Freigegebenes zum Termin veröffentlichen. |
| **Input** | Beiträge im Status `FREIGABE` bzw. `GEPLANT`. |
| **Output** | Status `GEPLANT` → `VEROEFFENTLICHT` mit Beitrags-IDs und Links; oder `VERWORFEN` / `FEHLER` mit Grund. |
| **Trigger** | Freigabe: Knopf in der Zentrale (Freigeben, Bearbeiten, Verwerfen). Publisher: alle 15 Minuten (`social-takt`). |
| **Schnittstellen** | Zentrale (Port 8020, Anmeldung des Control Centers); Meta Graph API: Seiten-Fotos, Seiten-Feed, Foto-Storys, Instagram Content Publishing. |
| **Regeln** | **Sperren** (Freigabe nicht möglich): fehlende Einwilligung, ungesichtete oder bedenkliche Baustellenbilder, Floskel oder Adresse im Text. **Hinweise** (Freigabe möglich, aber zu lesen): Preis im Text, Angebot, Duzen, Superlativ, unbekannter Ort, Reel. Freigeben darf nur die Rolle Inhaber. Der Publisher prüft unmittelbar vor dem Veröffentlichen noch einmal – bekommt ein Bild nach der Freigabe Bedenken oder wird das Material verworfen, geht der Beitrag zurück in die Freigabe. Er nimmt jeden Beitrag erst in Arbeit („Wird veröffentlicht“), sodass von zwei gleichzeitigen Läufen nur einer postet, und speichert das Ergebnis jeder Plattform sofort. Höchstens ein Feed-Beitrag je Lauf, nichts, was länger als 36 Stunden überfällig ist. |
| **Fehlerbehandlung** | Vorübergehender Meta-Fehler (Last, Ratenlimit) → bis zu drei Versuche im 15-Minuten-Takt. **Unklarer** Fehler – die Antwort auf den eigentlichen Veröffentlichungsaufruf kam nie an, oder der Lauf wurde unterbrochen – → nie automatisch wiederholen, sondern `FEHLER` mit der Bitte, auf der Plattform nachzusehen: lieber ein Beitrag zu wenig als einer doppelt. Endgültiger Fehler oder abgelaufener Token → Status `FEHLER`, sichtbar oben in der Freigabe; bei Token-Fehlern bricht der Lauf ab, statt weitere Beiträge zu verbrennen. Verpasster Termin → zurück in die Freigabe. Ohne Meta-Zugang verändert der Publisher nichts. |
| **Mensch nötig** | **ja, immer** – in der Lernphase für jeden Beitrag. Die automatische Freigabe ist gebaut, aber aus (`SOCIAL_AUTO_FREIGABE=1`); sie käme nur für Shop-Inhalte ohne Preis in Frage (Farbvorstellung, Wohnidee, Produkt der Woche) und nie für Baustellen, Angebote oder Reels. |

Code: `lib/freigabe.mjs`, `lib/meta.mjs`, `lib/ablauf.mjs` (`veroeffentlicheFaellige`), `scripts/server.mjs`, `ui/zentrale.*`.

## 7 · Auswertung (Performance-Agent)

| | |
|---|---|
| **Aufgabe** | Messen, was dem Betrieb nützt, und es an den Planer zurückgeben. |
| **Input** | Insights der Graph API je veröffentlichtem Beitrag; wöchentlich zusätzlich Shopbesuche nach UTM-Parameter (`utm_content=b<Beitrag>`) und Anfragen aus dem Control Center. |
| **Output** | Tabelle `kennzahl`; `lernstand.json` mit Faktor je Inhaltsart, Quelle, Format, Bodenart, Ort und Wochentag; Erkenntnisse in Sätzen in der Zentrale. |
| **Trigger** | täglich im Grundlauf; Wochenbericht durch die Redaktion montags. |
| **Schnittstellen** | Meta Graph API (Insights), ShopifyQL über den Shopify-Connector (nur im Wochenbericht). |
| **Regeln** | Punkte: Shop-Klick 6, Profilbesuch 4, gespeichert 3, geteilt 3, Kommentar 2, Like 0,3, Reichweite 0,01 je Person. Ein Faktor gilt erst ab drei Beiträgen je Gruppe; belastbar heißt der Lernstand ab zwölf Beiträgen. Der Planer übernimmt Faktoren nur gedeckelt – die Mischung bleibt. |
| **Fehlerbehandlung** | Unbekannte Metriknamen (Meta ändert sie regelmäßig) werden einzeln übersprungen; der Rohwert bleibt gespeichert. Story-Werte gibt es nur rund 24 Stunden – danach wird nicht mehr gefragt. Nach 30 Tagen wandert ein Beitrag ins Archiv. |
| **Mensch nötig** | nein. Änderungen am Raster oder an den Gewichten bleiben eine bewusste Entscheidung (eine Zeile in `lib/konfig.mjs` bzw. `lib/auswertung.mjs`). |

Code: `lib/auswertung.mjs`, `lib/ablauf.mjs` (`holeKennzahlen`, `schreibeLernstand`).

---

## Wann ein Mensch gebraucht wird – auf einen Blick

| Situation | Wer | Wo |
|---|---|---|
| Jeder Beitrag vor der Veröffentlichung (Lernphase) | Inhaber | Zentrale → Freigabe |
| Bild mit Datenschutz-Bedenken | Inhaber klärt mit dem Kunden oder lässt es weg | Zentrale zeigt die Sperre mit Begründung |
| Angebot mit Preis oder Rabatt | Inhaber prüft gegen den Shop | Hinweis an der Karte |
| Meta-Token abgelaufen | Inhaber erneuert ihn | `META-EINRICHTUNG.md`, Abschnitt „Token erneuern" |
| Neuer Monteur, verlorenes Handy | Büro legt Link an bzw. sperrt ihn | `npm run social -- zugang …` |
