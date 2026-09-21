# Automationen: Willkommen, Muster-Nachfassen, Warenkorbabbrecher

Stand 2026-09-21. **Nichts davon ist eingerichtet** – es fehlt das Werkzeug
(Shopify Messaging ist nicht installiert) und es fehlen Inhaberentscheidungen.
Dieses Dokument ist der Bauplan, damit die Einrichtung danach eine Sache von
einer Sitzung ist. Rabatthöhen, Wartezeiten und Rhythmus sind Platzhalter.

## Voraussetzungen (in dieser Reihenfolge)

1. Datenschutzerklärung um Newsletter/E-Mail-Marketing ergänzen (Inhaber).
2. Shopify Messaging installieren (kostenlos bis 10.000 Mails/Monat, danach ab
   1 $/1.000 – Stand App Store 2026-09-21). Für das Muster-Nachfassen zusätzlich
   Shopify Flow (kostenlos, im Basic-Plan verfügbar).
3. Absenderadresse der eigenen Domain bestätigen (SPF/DKIM-Einträge macht Shopify
   vor; **DNS-Änderung = Inhaberfreigabe**).
4. Newsletter-Baustein im Theme einschalten (siehe `README.md`).

Grundsatz für alle drei Strecken: **Marketing-Mails gehen nur an bestätigte
Abonnenten.** Double-Opt-in ist im Shop bereits aktiv; jede Mail trägt den
Abmeldelink von Shopify. Wer ohne Einwilligung nachfassen will (Bestandskunden-
ausnahme), klärt das vorher rechtlich – hier wird es nicht vorausgesetzt.

## 1. Willkommensserie

Auslöser: „Kunde hat E-Mail-Marketing abonniert" (Vorlage in Shopify Messaging).

| Mail | Wann | Inhalt | Verkauf |
|---|---|---|---|
| 1 Willkommen | sofort nach Bestätigung | Wer wir sind (Fachhandel, Ladengeschäft, Verlegeteam), was im Newsletter kommt. Optional Willkommensvorteil | Code nur, wenn der Inhaber einen festlegt (Kanal `NEWSLETTER`) |
| 2 Hilfe | nach `<X>` Tagen | Ratgeber „Teppichboden richtig ausmessen" | Link zum Artikel, von dort zum Rechner |
| 3 Auswahl | nach `<Y>` Tagen | Kostenlose Muster, zwei bis drei Ratgeber zur Auswahl | Link `/pages/muster` |
| danach | – | normaler Newsletter | – |

Drei Mails, dann Schluss. Wer in der Serie kauft, fällt aus den Verkaufs-Mails
heraus (Bedingung „hat bestellt" vor Mail 3).

## 2. Musterbesteller zurückholen

Der Shop liefert die nötigen Daten schon: Jede Musterzeile einer Bestellung trägt
`_Quellprodukt`, `_Quellprodukt_ID`, `_Quellvariante_ID`, `_Produktlink`, `_Bild`
und `Farbe`. Musterbestellungen erkennt man an der SKU (`TP-MUSTER-000` bzw.
`M-…`) oder am Produkttyp „Musterservice".

Ablauf (Shopify Flow → Shopify Messaging):

```
Bestellung erstellt
  └ enthält Musterzeile?  ── nein → Ende
      └ Kunde hat Marketing-Einwilligung? ── nein → Ende (kein Nachfassen)
          └ Tag am Kunden setzen: muster-besteller, muster-JJJJ-MM
          └ warten <A> Tage (Muster ist angekommen und angeschaut)
          └ hat inzwischen gekauft? ── ja → Ende
          └ Mail 1 „Wie gefallen Ihnen die Muster?" – Hilfe zuerst:
               Farbe bei Tages- und Kunstlicht prüfen, Rollenbreite wählen,
               Link zu Ratgeber und Beratung, Links zurück zu den bestellten Produkten
          └ warten <B> Tage, wieder Kaufprüfung
          └ Mail 2 (optional, Inhaberentscheidung): gezielter Anreiz, Kanal `MUSTER`
```

**Bestellte Farben in der Mail zeigen – zwei Stufen:**
1. Sicher machbar: Die Mail verlinkt je Musterzeile `_Produktlink` mit
   `?variant=<_Quellvariante_ID>` – der Kunde landet auf genau seiner Farbe.
   Flow kann die Werte aus den Zeileneigenschaften lesen und als Kunden-Metafeld
   (Liste der Links/Titel) ablegen; die Mail liest das Metafeld.
2. Zu prüfen nach der Installation: ob die Mailvorlage Bild und Titel je Muster
   dynamisch rendern kann (hängt vom Funktionsumfang der Vorlagen ab). Wenn nicht,
   bleibt Stufe 1 mit Textlinks – das reicht für den Zweck.

**Messung Muster → Kauf** ohne Zusatzwerkzeug: Kundensegment
„Tag `muster-besteller` UND Anzahl Bestellungen mit Umsatz > 0". Die Quote
Musterkunden → Käufer ist dann eine Segmentgröße geteilt durch die andere. Welche
Farben zu Mustern führen, beantwortet der Bericht „Verkäufe nach Produktvariante"
gefiltert auf Muster-SKUs bzw. die Eigenschaft `Farbe` der Musterzeilen.

## 3. Warenkorbabbrecher

Bestand: Die eingebaute Mail „abgebrochener Checkout" ist **an**, Versand nach
10 Stunden, **nur an E-Mail-Abonnenten**. Bei 0 Abonnenten ging sie noch nie
raus (8 abgebrochene Checkouts insgesamt). Die Einstellung „nur Abonnenten" ist
die vorsichtige und bleibt.

| Stufe | Wann | Inhalt |
|---|---|---|
| 1 Erinnerung | 10 Std. (wie heute) | Warenkorb mit Konfiguration, Link zurück, Hinweis auf Beratung und Muster. **Kein Rabatt.** |
| 2 Anreiz (nur vorbereitet) | `<C>` Tage später, nur wenn nicht gekauft | optionaler Code, Kanal `WARENKORB`. Inhaberentscheidung. |

Der Link aus der Shopify-Mail stellt den Checkout samt Zeileneigenschaften (Maße,
Breite, Farbe) wieder her – die Konfiguration geht nicht verloren. Mit Shopify
Messaging gibt es dieselbe Strecke als bearbeitbare Automation („Automatisierung
anzeigen" in den Checkout-Einstellungen); dann die alte Einstellung ausschalten,
damit nicht zwei Mails gehen.

Hebel Nr. 1 ist nicht die Mail, sondern die **Einwilligung**: Das Häkchen
„Neuigkeiten und Angebote via E-Mail" im Checkout existiert und ist korrekt nicht
vorausgewählt. Erst Abonnenten machen diese Strecke wirksam.

## Was bewusst nicht vorgesehen ist

- kein Popup, kein Exit-Intent, kein Glücksrad
- kein Rabatt in der ersten Mail einer Strecke (außer der Inhaber will den
  Willkommensvorteil)
- keine Mail an Personen ohne Einwilligung
- keine feste Newsletter-Frequenz im System
