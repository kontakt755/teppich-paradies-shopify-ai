# Bewertung nach Zustellung/Montage

> **Status: LIVE seit 2026-10-21** (Freigabe Inhaber, Werkbank w-139, Aufgabe #1446).
> Shopify Flow „Bewertungsbitte 7 Tage nach Versand (Google)“ ist aktiv:
> Auslöser *Order fulfilled* → 7 Tage warten → Bedingungen: Bestellung voll bezahlt,
> Zahlungsstatus PAID, Kunde hat **keinen** Tag `bewertung-angefragt`, **keine** Position
> mit Produkttyp `Musterservice` → Messaging-Aktion *Send marketing email* (geht nur an
> Kunden mit E-Mail-Einwilligung) → Kunden-Tag `bewertung-angefragt`.
> Mail als eigener Code in Shopify Messaging (Vorlage „Wie gefällt Ihnen Ihr neuer Boden?“).
> Abschalten: Flow → Workflow deaktivieren. Zettel und Karten sind noch nicht gedruckt.

Ziel: mehr **Google-Unternehmensbewertungen**, gleichmäßig über das Jahr (6–10 pro Monat).
Google gewichtet frische Bewertungen stärker als die Gesamtzahl – darum jede Bestellung
fragen statt einzelner Aktionen.

## 0. Regeln

- **Alle fragen, kein Review-Gating.** Keine getrennten Wege „zufrieden → Google /
  unzufrieden → an uns“. Ein Bewertungsknopf für alle; der Hilfe-Weg heißt „Frage oder
  Problem“ und steht zusätzlich da. Gating verstößt gegen Google-Richtlinien (und die von
  Trusted Shops) und kann zur Löschung von Bewertungen führen.
- **Keine Gegenleistung**, kein „bitte 5 Sterne“, keine Sterne-Grafik in der Bitte.
- **Mail nur mit Werbe-Einwilligung** (BGH VI ZR 225/17), einmal je Kunde, keine Erinnerung.
  Zettel und Karte gehen an alle.
- Keine Bewertungen von Mitarbeitern/Familie, kein Bewertungs-Tablet im Laden.
- Keine Musterbestellungen, keine stornierten/erstatteten Bestellungen.

## 1. Bewertungslink

Alle Texte und QR-Codes zeigen auf **`https://www.teppich-paradies.net/bewerten`**.
Das ist eine Shop-Weiterleitung (Online-Shop → Navigation → URL-Weiterleitungen, angelegt
2026-10-20), derzeit auf das Google-Profil (`maps.google.com/?cid=…`). Sobald der direkte
Link aus dem Google-Unternehmensprofil („Bewertungen erhalten“, Form `g.page/r/…/review`)
vorliegt, nur das Ziel der Weiterleitung ändern – Gedrucktes bleibt gültig.

## 2. E-Mail an Shop-Kunden

**Betreff:** Wie gefällt Ihnen Ihr neuer Boden, {{ customer.first_name }}?
(ohne Vornamen: „Wie gefällt Ihnen Ihr neuer Boden?“)
**Vorschautext:** Wir freuen uns auf Ihr Feedback – dauert nur zwei Minuten.

```
[Logo]

Vielen Dank für Ihre Bestellung!

Hallo {{ customer.first_name }},

vielen Dank, dass Sie bei Teppich Paradies bestellt haben. Ihre Bestellung {{ order.name }}
ist vor ein paar Tagen bei Ihnen angekommen. Wie gefällt Ihnen Ihr neuer Boden, und lief
alles gut?

Wir freuen uns auf Ihr Feedback als Bewertung bei Google. Erzählen Sie gern, welchen Boden
Sie gewählt haben und wie Beratung und Lieferung waren – ein Foto vom verlegten Boden hilft
anderen Kunden besonders.

    [ Bewertung bei Google schreiben ]  →  https://www.teppich-paradies.net/bewerten

┌ Etwas passt nicht oder Sie haben eine Frage?
│ Schreiben Sie uns direkt an kontakt@teppich-paradies.net oder antworten Sie auf diese
└ Mail. Wir melden uns innerhalb eines Werktags.

Viel Freude mit Ihrem neuen Boden und herzliche Grüße aus Oranienburg
Ihr Team von Teppich Paradies

Tipp: Neue Teppiche und Teppichböden riechen in den ersten Tagen oft etwas und können
anfangs leicht fusseln. Das ist normal und vergeht durch Lüften und regelmäßiges Saugen.
---
Sie erhalten diese Nachricht, weil Sie dem Empfang unserer E-Mails zugestimmt haben. [Abmelden]
```

Kein QR-Code in der Mail (doppelt zum Knopf, wirkt werblicher).

## 3. Zettel, Karte und Team

**Paketzettel A6** (nur Pakete, die wir selbst versenden; Direktversand erreicht nur die Mail):
Logo · „Vielen Dank für Ihre Bestellung!“ · „Wie gefällt Ihnen Ihr neuer Boden? Wir freuen uns
auf Ihr Feedback bei Google – gern mit Foto.“ · QR-Code (≥ 3 cm) · „Code scannen und bewerten –
dauert zwei Minuten.“ · teppich-paradies.net/bewerten · Fußband: „Frage oder Problem? Schreiben
Sie uns: kontakt@teppich-paradies.net – wir kümmern uns.“

**Visitenkarte 85 × 55 mm** (Laden und Montage): Logo · „Danke für Ihr Vertrauen!“ · „Wie war
Ihre Erfahrung mit uns? Wir freuen uns über Ihre Bewertung bei Google.“ · Kurzadresse · QR-Code.

**Satz fürs Team** (persönlich fragen wirkt am stärksten, Karte an alle geben):
- Laden: „Schön, dass Sie da waren. Wenn Sie mögen, schreiben Sie uns eine kurze Bewertung bei
  Google – hier ist der Code dafür.“
- Montage: „Wir sind fertig. Schauen Sie gern noch einmal über alles. Wenn Sie zufrieden sind
  oder etwas auffällt, sagen Sie es uns – und über eine Bewertung bei Google freuen wir uns sehr.“

## 3a. Antworten auf Bewertungen

Jede Bewertung beantworten: gute innerhalb von 1–2 Tagen, kritische am selben Tag. Vorlagen
anpassen, nie wortgleich kopieren.

- **Gut, Teppichboden:** „Vielen Dank, Frau Müller! Schön, dass Ihnen der neue Teppichboden im
  Wohnzimmer so gut gefällt. Es hat uns Freude gemacht, Sie in unserem Laden in Oranienburg zu
  beraten. Viel Freude damit!“
- **Gut, Montage:** „Vielen Dank, Herr Schulz! Wir geben das Lob gern an unser Montageteam weiter.
  Schön, dass die Verlegung so reibungslos lief – genießen Sie den neuen Boden.“
- **Gut, Online:** „Vielen Dank für Ihre Bewertung! Freut uns, dass Lieferung und Qualität gepasst
  haben. Wenn Sie wieder etwas brauchen, beraten wir Sie gern auch persönlich in Oranienburg.“
- **Kritisch:** danken, bedauern (ohne Schuldeingeständnis), nicht streiten, Kontakt anbieten:
  „Hallo Herr Wagner, danke, dass Sie uns das schreiben. Es tut uns leid, dass die Lieferung
  länger gedauert hat als angekündigt – so soll es nicht laufen. Bitte melden Sie sich direkt
  bei uns unter kontakt@teppich-paradies.net, damit wir das mit Ihnen klären können.“
  Nach einer Lösung einmal und ohne Druck fragen, ob der Kunde die Bewertung aktualisieren möchte.

Grundlage für Aufbau und Regeln: Google-Richtlinien zu Rezensionen sowie öffentliche
Bewertungs-Skills auf GitHub (review-management, review-request-kit, reputation-management).

## 4. Technischer Weg (Shop): Shopify Flow + Shopify Messaging

Beide Apps sind kostenlos (Messaging: Freikontingent ~10.000 Mails/Monat, weit über
Bedarf). Installation = App-Installation → Freigabe. Absender-Domain verifizieren
heißt DNS-Einträge (SPF/DKIM) → **DNS-Änderung, nur mit Freigabe**.

### Anleitung zum Anlegen (als inaktiver Entwurf)

1. Apps installieren: **Shopify Flow**, **Shopify Messaging** (Admin → Apps → Shopify App Store).
2. Messaging → Vorlage „Leer“ → Betreff, Vorschautext und Text aus Abschnitt 2 einsetzen;
   Knopf „Bewertung bei Google schreiben“ mit `https://www.teppich-paradies.net/bewerten`. Als **Entwurf speichern**.
3. Flow → Workflow erstellen → Name „Bewertungsbitte nach Zustellung“:
   - **Auslöser:** `Fulfillment event created` (Status *delivered*). Fallback, wenn die
     Spedition keine Zustellmeldung liefert: zweiter Workflow mit `Order fulfilled`.
   - **Warten:** 3 Tage nach *delivered* bzw. 7 Tage nach *fulfilled*.
   - **Bedingungen (alle):**
     - `order.cancelledAt` ist leer
     - `order.displayFinancialStatus` ist nicht `REFUNDED` / `PARTIALLY_REFUNDED`
     - keine Position mit Produkt-Tag `muster` (bzw. Produkttyp der Musterprodukte –
       vor Einschalten gegen echte Musterbestellung prüfen)
     - `customer.emailMarketingConsent.marketingState` = `SUBSCRIBED`
     - Kunde hat **nicht** den Tag `bewertung-angefragt`
   - **Aktionen:** Messaging-Mail aus Schritt 2 senden → Kunden-Tag `bewertung-angefragt` hinzufügen.
4. Workflow **nicht einschalten** (Schalter bleibt aus).
5. Vor dem Einschalten: Testlauf mit eigener Bestellung/eigenem Kundenkonto
   (Einwilligung gesetzt), Mail-Darstellung mobil prüfen, dann erst aktivieren.

Ohne Messaging (nur Flow): Aktion „Send internal email“ kann nur intern senden – für
Kundenmails ist Messaging (oder eine andere Mail-App) nötig.

## 5. Offene Entscheidungen (Ahmet)

1. Google-only? (Empfehlung: ja; Produktbewertungen erst bei mehr Bestellungen)
2. Shopify Flow + Messaging installieren, Absender-Domain per DNS verifizieren
3. Wartezeit: 3 Tage nach Zustellung / 7 Tage nach Versand (Empfehlung)
4. Einwilligungstext Checkout/Auftrag (Rechtstext)
5. QR-Karten drucken lassen (Auflage z. B. 500, Kosten)
6. Direkten Bewertungslink aus dem Google-Profil liefern (Ziel der Weiterleitung /bewerten)
