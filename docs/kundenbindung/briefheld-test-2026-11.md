# Briefheld-Test für Montagekunden (3 Monate)

> **Stand 2026-11-09 · Aufgabe #1445 · Werkbank w-142 · Entwurf, nichts bestellt, nichts versendet,
> keine Kundendaten exportiert.** Das Dokument bereitet den Test vor; bestellen, Musterset anfordern
> und den Vertrag prüfen macht Ahmet (Inhaber). Regeln für Bewertungsbitten allgemein:
> `bewertung-nach-zustellung.md` (kein Gating, keine Gegenleistung, keine Mail ohne Einwilligung).

## 1. Entscheidungslage

| Wann | Entscheidung | Quelle |
|---|---|---|
| 2026-10-26 | Briefheld 3 Monate für **Montagekunden** testen: ja. Gedruckte QR-Karte: nein. | Ahmet im Chat, Werkbank w-142 |
| 2026-11-04 | Claude hilft bei Text und Anbindung, **Ahmet bestellt**. | Ahmet, Klick-Seite |
| offen | Musterset anfordern, AV-Vertrag prüfen, Rechtsgrundlage und Datenschutzerklärung | Ahmet (Abschnitt 6) |

Nicht im Test: Shop-Kunden (die bekommen die Bewertungsbitte bereits über den Flow aus
`bewertung-nach-zustellung.md`, nur mit E-Mail-Einwilligung) und Ladenkunden.

## 2. Briefheld: belegte Angaben

Alle Angaben von der öffentlichen Website, abgerufen am **2026-11-09**, Preise **netto** zuzüglich
USt. Was nicht dasteht, steht unter „nicht gefunden“ (nie geraten).

| Thema | Angabe | Quelle (briefheld.de/…) |
|---|---|---|
| Preis A6-Karte im Umschlag | 3,70 € je Karte (ab 1 Stück/Jahr); 2,64 € ab 750, 2,14 € ab 3.500 Karten/Jahr | `/preise` |
| Preis A6-Postkarte (ohne Umschlag) | 2,95 € (ab 1); Text bis 250 Zeichen | `/preise` |
| Textlänge | A6-Karte im Umschlag und Klappkarte bis 400 Zeichen, A4-Brief bis 600 | `/preise` |
| Porto | Selbstkosten der Post 1:1, Standard 0,95 € je Sendung (0,65 € ab 500 Stück je Auftrag) | `/preise` |
| Mindestmenge, Grundgebühr | Karten ab 1 Stück, **keine Grundgebühr**; Briefe/DIN-lang ab 100 Stück | `/preise` |
| Jahrespaket (Guthaben) | Beispiel 3.290 € für ca. 900 Karten im Umschlag inkl. Porto, 12 Monate gültig, automatische Verlängerung, Kündigung 3 Monate vor Ablauf | `/preise` |
| Pilotpaket | 990 € einmalig für 250 Karten inkl. Porto (eigene Rechnung: ca. 3,96 € je Karte) | `/preise` |
| Paketbeileger | ab 500 Karten je Auftrag, ab 1,20 € (kurzer Text) bzw. 1,70 € (A6, 400 Zeichen) | `/preise` |
| Handschrift | Roboter schreibt mit echtem Kugelschreiber auf Papier, jede Karte einzeln; über 40 Handschriften zur Wahl, Wahl je Auftrag/Vorlage | `/funktionen/handschriften` |
| Individualisierung | Platzhalter (Vorname, Produkt, Bestellnummer); eigener Text je Empfänger über Tabellenspalte „Nachricht“; optional eigener QR-Link je Empfänger (`qr_target_url`, nur mit QR-Vorlage) | `/funktionen/hyperpersonalisierung` |
| Shopify-Anbindung | Auslöser „Bestellung wird versendet“ oder „Kunde hat seit X Tagen nicht bestellt“; Filter nach Bestellwert, Land, Produkt, Kunden-Tag | `/integrationen/shopify` |
| Zapier / Make | Aktion „Brief oder Karte versenden“; Auslöser „QR-Code gescannt“, „Brief versendet“; API-Schlüssel aus Briefheld | `/integrationen/zapier`, `/integrationen/make` |
| REST-API | `POST /v1/orders` mit Header `x-api-key`, Empfängerfelder `first_name`, `last_name`, `street`, `zip`, `city`, Testmodus, Webhooks | `/integrationen/api` |
| Tabellen-Upload | Eine Zeile je Empfänger mit Adresse und Spalte „Nachricht“ (Excel, Google Sheets, CSV, Numbers), Upload oder Einfügen | `/funktionen/hyperpersonalisierung` |
| Musterset | kostenlos, per Post, Anforderung über Formular (Firma, Name, Adresse; Frage nach Lieferung AT/CH) | `/sample` |
| AV-Vertrag | AGB § 15: Bei Verarbeitung im Auftrag schließen die Parteien **vor Beginn** eine Vereinbarung nach Art. 28 DSGVO | `/agb` (Stand laut Seite: Mai 2026) |
| Vertragspartner | Briefheld UG (haftungsbeschränkt), Solingen; AGB gelten nur gegenüber Unternehmen, Widerrufsrecht ausgeschlossen | `/agb`, `/datenschutz` |
| Unterauftragnehmer | AGB § 3: Subunternehmer erlaubt, keine Namen; Datenschutzseite nennt Deutsche Post, weitere Paketdienste, Stripe, Creditreform Boniversum (Bonitätsprüfung des Auftraggebers) | `/agb`, `/datenschutz` |

**Nicht gefunden:** Lieferzeit (Produktion bis Versand, Zustellung; AGB § 11 schuldet keine
bestimmte Laufzeit), FAQ-Seite, Link oder Download zum AV-Vertrag, Serverstandort, Löschfrist für
hochgeladene Adressen (die Datenschutzseite nennt nur die Löschung hochgeladener Bilddateien),
Preise für Zapier/Make, Brutto-Preise, Versanddauer des Musterset.

**Abweichungen zur Recherche vom 2026-10-19** (Kommentar in #1445):
- Die Pläne „Starter 329 / Growth 1.099 / Scale 3.299“ stehen auf `/preise` nicht mehr; die Seite
  kennt Staffelpreise nach Karten je Jahr und ein Jahrespaket. Für den Test unerheblich, weil
  keine Mindestmenge und keine Grundgebühr gelten.
- Der Shopify-Auslöser ist „Bestellung wird **versendet**“, nicht „order/created“.
- Die Pay-as-you-go-Preise (3,70 / 2,95 / 4,30 €) und das Porto (0,95 €) sind unverändert.
- Die Preisseite wirbt mit „Preisgarantie“ bei der Verlängerung, AGB § 9 erlaubt dagegen eine
  angemessene Erhöhung nach der Erstlaufzeit. Für den Test ohne Jahrespaket ohne Belang.

## 3. Kosten des Tests (Rechenbeispiel)

A6-Karte im Umschlag, Staffel „ab 1“: 3,70 € + 0,95 € Porto = **4,65 € netto je Karte**. Pilotpaket
und Jahrespaket sind für den Test nicht nötig. Wie viele Montagekunden im Monat fertig werden, ist
nicht belegt; Beispiele:

| Karten je Monat | je Monat | 3 Monate |
|---|---|---|
| 10 | 46,50 € | 139,50 € |
| 20 | 93,00 € | 279,00 € |
| 30 | 139,50 € | 418,50 € |

Alle Beträge netto zuzüglich USt, Porto 1:1 wie von der Post weitergegeben.

## 4. Kartentexte (zwei Entwürfe)

Anrede im Shop: **Sie** (Theme-Texte, Bewertungsmail in `bewertung-nach-zustellung.md`). Format:
A6-Karte im Umschlag, **bis 400 Zeichen**. Beide Texte haben rund 350 Zeichen und 52–55 Wörter
(`{Name}` = voller Name aus dem Kundenblatt, bis ca. 40 Zeichen; Herr/Frau ist dort nicht
gespeichert, deshalb keine Anrede mit Nachnamen). Kein Rabattcode, keine Gegenleistung, kein „5 Sterne“,
kein Filter nach Zufriedenheit; der Hilfeweg steht in beiden Texten. Die Kurzadresse ist die
Shop-Weiterleitung auf das Google-Profil (`bewertung-nach-zustellung.md`, Abschnitt 1).

**Text A (sachlich, kurz)**

```
Guten Tag {Name},

Ihr neuer Boden liegt, und wir hoffen, Sie fühlen sich darauf wohl. Wenn Sie mit unserer Arbeit zufrieden waren, freuen wir uns über ein paar Zeilen als Bewertung bei Google: teppich-paradies.net/bewerten. Wenn etwas nicht passt, melden Sie sich bitte direkt bei uns, wir kümmern uns darum.

Ihr Team Teppich Paradies Oranienburg
```

**Text B (persönlicher)**

```
Guten Tag {Name},

vielen Dank, dass Sie uns Ihren Boden anvertraut haben. Unser Montageteam hat gern für Sie gearbeitet. Wie war Ihre Erfahrung mit uns? Ihre ehrliche Bewertung bei Google hilft anderen Kunden bei der Entscheidung: teppich-paradies.net/bewerten. Bei Fragen oder Problemen erreichen Sie uns jederzeit direkt.

Ihr Team Teppich Paradies Oranienburg
```

Empfehlung: Text A für Test 1; Text B als Gegenprobe, wenn die Rücklaufquote nach dem ersten
Monat schwach ist. Mit dem Musterset prüfen: Lesbarkeit der Webadresse in der gewählten
Handschrift (sonst `bewerten` ausschreiben oder QR-Vorlage nutzen, falls Ahmet das will; die
„QR-Karte nein“-Entscheidung betraf die eigene gedruckte Karte), Umlaute, Zeilenumbrüche und ob
Leerzeilen in die 400 Zeichen zählen.

## 5. Anbindung: kleinste Lösung zuerst (manuell, keine Automatik)

**Woher die Daten kommen.** Die Montagekunden stehen nicht in Shopify, sondern in der
Auftrags-App der Monteure (Google Sheet „Auftrags-App Daten“ im Firmenkonto; Code lokal in
`~/Developer/tp-auftrags-app`, Stand 2026-11-09). Das Control Center („Kunden“) zeigt Shopify-Kunden und
ist dafür nicht die Quelle.

| Blatt | Spalten, die der Test braucht |
|---|---|
| `Auftraege` | `Status`, `KundeID`, `Quelle` (OWG = Wohnungsgesellschaft), `Referenz` |
| `Kunden` | `KundeID`, `Name`, `Straße`, `PLZ`, `Ort` (E-Mail und „Zugang / Hinweise“ **nicht** mitnehmen) |
| `Einsaetze` | Datum des letzten erledigten Einsatzes |
| `Maengel` | offene Mängel je `AuftragID` |

**Auslöser = Auftrag fertig.** Die App setzt `Status = erledigt`, sobald alle nicht abgesagten
Einsätze erledigt sind; Wohnungen in Phasen erst nach dem letzten Einsatz der letzten Phase
(Endschliff). Es gibt keinen eigenen Status „Montage abgeschlossen“ und keinen Bewertungsmerker.

**Auswahl (wöchentlich, von Hand):**
1. `Auftraege` nach `Status = erledigt` filtern, letzter erledigter Einsatz **5 bis 10 Tage** her
   (Vorschlag: Der Kunde hat den Boden erlebt, die Karte kommt noch zeitnah; die Laufzeit der Post ist
   nicht belegt und wird mit den ersten Karten gemessen).
2. **Ausschließen:** `Quelle = OWG` (dort ist die Hausverwaltung Auftraggeber, die Mieter sind keine
   Kunden von uns), Beispielkunden („Max Muster“ u. ä.), Aufträge mit offenem Mangel in `Maengel`,
   Kunden mit offener Reklamation oder Werbewiderspruch, Firmennamen statt Personen (Anrede prüfen).
3. **Doppelte vermeiden:** Briefheld-Auftragsliste ist das Protokoll („schon eine Karte erhalten“);
   Shop-Kunden, die zusätzlich den Flow aus `bewertung-nach-zustellung.md` bekamen (Kunden-Tag
   `bewertung-angefragt`), nicht noch einmal anschreiben.
4. Nur **Name, Straße, PLZ, Ort** plus Spalte „Nachricht“ (fertiger Text A) in die Tabelle für Briefheld
   übernehmen. Keine E-Mail, kein Telefon, keine Auftragsdaten, kein Betrag.
5. Upload bzw. Einfügen der Tabelle bei Briefheld, Vorschau prüfen, **Ahmet bestätigt den Versand**
   (jede Karte kostet 4,65 € netto, Porto fällt beim Versand an).

**Erste Runde:** vor dem Echtbetrieb 2–3 Karten an Team-Adressen (Testmodus bzw. eigene Anschrift) und
die Zeit bis zur Zustellung notieren.

**Wer:** Auswahl und Tabelle bereiten Tobias oder Ahmet vor; Claude schlägt nur die Liste vor, wenn
einer von beiden sie ihm ausdrücklich gibt. Es wird kein Export durch Claude und kein Skript gebaut.

**Automatik erst danach:** Lohnt sich der Test (Abschnitt 8) und werden es mehr als etwa 20 Karten im
Monat, kommen Zapier/Make oder die API in Betracht (Auslöser aus der Tabelle, Empfängerfelder wie in
Abschnitt 2). Preise für Zapier/Make sind nicht belegt, vorher bei Briefheld erfragen.

## 6. Rechtliches: nur melden, Ahmet entscheidet

Keine anwaltliche Prüfung. Das Dokument legt nichts fest, es listet, was vor dem ersten Versand
geklärt sein muss (Gedächtnis: rechtliche Pflichtthemen macht Ahmet):

1. **AV-Vertrag nach Art. 28 DSGVO** mit Briefheld muss vor dem ersten Upload von Kundendaten stehen.
   AGB § 15 nennt ihn, ein Download steht auf der Website nicht; Ahmet fordert ihn bei Briefheld an
   (Kontakt laut Datenschutzseite: `projekt@briefheld.de`). Beim Lesen klären: Löschfrist der
   Adressen, Serverstandort, Unterauftragnehmer, Drittlandübermittlung.
2. **Rechtsgrundlage für die Karte** (Post an Bestandskunden mit Bitte um Bewertung). Die Bitte
   gilt nach BGH VI ZR 225/17 als Werbung, deshalb kommt sie bewusst als Post und nicht als Mail.
   Ahmet entscheidet, worauf die Karte gestützt wird und ob Kunden mit Werbewiderspruch gesperrt
   werden (Abschnitt 5, Auswahl).
3. **Datenschutzerklärung** nennt Briefheld bisher nicht (Fakten dazu: `datenschutz-faktenliste.md`).
   Ergänzung und Hinweis auf das Widerspruchsrecht liegen bei Ahmet.
4. **Kein Gating, keine Gegenleistung, keine Sterne-Vorgabe** (Google-Richtlinien), sonst können
   Bewertungen gelöscht werden. Die Entwürfe halten das ein.
5. Briefheld liefert nur an Unternehmen (AGB); die Teppich Paradies Oranienburg GmbH ist Unternehmen.

## 7. Reihenfolge

1. Ahmet: kostenloses Musterset über `briefheld.de/sample` anfordern (Firmenadresse eintragen).
2. Ahmet: AV-Vertrag anfordern und lesen (Claude liest mit, wenn Ahmet ihn bereitstellt).
3. Ahmet: Rechtsgrundlage und Datenschutzerklärung entscheiden (Abschnitt 6).
4. Gemeinsam: Handschrift und Text wählen, 2–3 Testkarten an Team-Adressen.
5. Ahmet: Bestellung/Konto bei Briefheld, erster Wochenlauf nach Abschnitt 5.

## 8. Auswertung nach 3 Monaten

- **Ausgangswert** am Starttag: Anzahl der Google-Bewertungen laut Metafeld `custom.google_bewertung`
  (monatlich aktualisiert, `npm run google-bewertung`).
- **Zählen:** verschickte Karten, Kosten netto, neue Google-Bewertungen im Zeitraum gegenüber den
  drei Monaten davor. Eine einzelne Bewertung lässt sich keiner Karte zuordnen (kein Tracking-Link, das
  wäre auch nicht gewollt); die Rechnung ist deshalb „Kosten je zusätzliche Bewertung“, grob.
- **Entscheidung** danach bei Ahmet: weitermachen, auf Shop-Kunden ausweiten, Automatik bauen oder
  einstellen. Kein Jahrespaket vor dieser Entscheidung.

## 9. Offen

- Anzahl fertiger Montagekunden je Monat (bestimmt die Kosten, nicht belegt).
- Lieferzeit der Karten (nicht auf der Website, wird mit den Testkarten gemessen).
- AV-Vertrag, Löschfrist, Serverstandort (Abschnitt 6).
- Ob Ahmet eine QR-Vorlage auf der Briefheld-Karte will (`qr_target_url`); bisher entschieden ist nur,
  dass es keine gedruckte QR-Karte gibt.
