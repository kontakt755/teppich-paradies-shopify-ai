# Baustellenfotos für Instagram

Idee des Inhabers, festgehalten am 25.09.2026. Noch nicht umgesetzt – dieses
Dokument hält fest, was gemeint ist, damit es beim Ausbau des Dashboards nicht
neu erfunden wird.

## Worum es geht

Der Betrieb verlegt jeden Tag Böden. Die Monteure sehen die fertigen Räume,
bevor es irgendjemand sonst tut – und genau daraus entsteht das Bildmaterial,
das für Instagram fehlt. Heute versickert es: Fotos bleiben auf Privathandys,
der Auftragszettel wandert in den Ordner, und abends weiß niemand mehr, welcher
Boden auf welchem Bild liegt.

Beispiel aus dem Gespräch: ein Raum 4 × 5 m, Teppichboden verlegt, Fotos
gemacht. Auf dem Auftragszettel steht, wie der Boden heißt. Führen wir ihn im
Shop, gehört der Link unter den Beitrag. Führen wir ihn nicht, ist das ebenfalls
eine Aussage – „exklusiv bei Teppich-Paradies".

## Der Ablauf, wie er gedacht ist

1. **Monteur schickt Fotos und Auftragsnummer** vom Handy weg – ohne Anmeldung,
   ohne App, mit möglichst wenigen Schritten. Mehr als Fotos auswählen und
   Auftragsnummer eintippen darf es nicht sein, sonst passiert es nicht.
2. **Das Dashboard nimmt beides entgegen** und legt daraus einen Eintrag an:
   Fotos, Auftrag, Datum, wer es geschickt hat.
3. **Der Boden wird erkannt** – über den Namen auf dem Auftragszettel bzw. die
   Position im Auftrag. Treffer im Lexikon heißt: Produktlink liegt bereit.
   Kein Treffer heißt: Hinweis „nicht im Shop", Beitrag wird ohne Link geplant.
4. **Der Beitrag wird vorbereitet**: Bildauswahl, Text, Produktlink. Den Text
   liefert ChatGPT aus den Eckdaten (Raumgröße, Bodenname, Besonderheit).
5. **Freigabe durch den Inhaber**, dann veröffentlichen.

## Was wir schon haben

- **Anhänge an Aufgaben** (`operations/lib/organisation-speicher.mjs`):
  JPG, PNG, HEIC, WebP, PDF bis 10 MB je Datei, Ablage außerhalb des
  Repositories unter `$TP_PRIVAT_DIR`. Der Fotoeingang muss also nicht bei null
  anfangen.
- **Produktlexikon** mit Namen, Handles und Bildern – die Grundlage, um vom
  Bodennamen auf die Produktseite zu kommen.
- **Aufgabensystem mit Status und Freigabe** – ein Beitrag ist nichts anderes
  als eine Aufgabe, die durch INBOX → REVIEW → DONE läuft.
- **Auftragsdaten** aus Shopify und dem Auftragsstatus.

## Zu entscheiden

**Wie kommen die Fotos herein?** Drei Wege stehen im Raum:

| Weg | Dafür | Dagegen |
|---|---|---|
| Eigener Upload im Dashboard | alles an einem Ort, Auftrag direkt zuordenbar, keine fremde Firma | Dashboard muss von außen erreichbar sein |
| Google Drive / Dropbox | sofort nutzbar, Monteure kennen es | Zuordnung zum Auftrag passiert von Hand, zweiter Ort zum Nachsehen |
| WhatsApp an eine Sammelnummer | niedrigste Hürde von allen | Fotos landen im Chat, Zuordnung und Ablage komplett manuell |

Der Upload im Dashboard passt am besten zu dem, was schon da ist – er hängt
aber daran, dass das Dashboard von unterwegs erreichbar ist. Das ist die
eigentliche Vorfrage.

**Einwilligung der Kunden.** Fotos aus Privatwohnungen dürfen nicht ohne
Zustimmung öffentlich werden. Das gehört auf den Auftragszettel (eine Zeile zum
Ankreuzen) und als Feld an den Foto-Eingang: ohne Häkchen kein Beitrag. Ohne
diese Klärung ist der Rest nicht startbar.

**Was zeigen wir bei Böden, die wir nicht führen?** „Exklusiv bei
Teppich-Paradies" ist eine Möglichkeit; ebenso der Verweis auf eine
vergleichbare Ware aus dem Sortiment. Entscheidung des Inhabers.

## Warum das wichtig ist

Instagram steht bereits als Aufgabe im Dashboard, zusammen mit wöchentlichen
Aktionsbeiträgen. Beides scheitert am selben Punkt: Es fehlt nicht der Wille,
sondern regelmäßiges, echtes Bildmaterial. Die Baustellen liefern es täglich –
es muss nur den Weg ins Haus finden.
