# Bewertung nach Zustellung/Montage – einschaltfertiger Entwurf

> **Status: Entwurf, NICHT aktiv** (Stand 2026-10-20, Aufgabe #1446). Nichts installiert,
> kein Flow angelegt, keine Mail versendet, nichts gedruckt. Einschalten nur nach Freigabe
> des Inhabers (Werkbank). Grundlage: Kommentar in #1446 vom 19.10., Entscheidung
> „keine Bewertungs-App“ in `docs/weiterentwicklung/bewertungen.md`.

Ziel: mehr **Google-Unternehmensbewertungen** (keine Produktbewertungen). Drei Wege:
Shop-Kunden per Mail, Montage- und Ladenkunden per QR-Karte.

## 0. Regeln (gelten für alle Wege)

- **Keine Gegenleistung** (kein Rabatt, kein Gutschein, keine Verlosung) – Google-Richtlinie.
- **Kein Review-Gating:** alle Kunden fragen, nicht nur zufriedene; keine Vorab-Frage
  „Waren Sie zufrieden?“ mit Weiterleitung nur bei Ja.
- **Mail nur mit Werbe-Einwilligung** (Bewertungsbitte = Werbung, BGH VI ZR 225/17).
  Einwilligungstext im Checkout bzw. Auftrag ist Rechtstext → Ahmet.
- **Nur einmal je Kunde** (Tag `bewertung-angefragt`), keine Erinnerungsmail.
- Keine Musterbestellungen, keine stornierten/erstatteten Bestellungen.

## 1. Bewertungslink

Platzhalter in allen Texten: `{{BEWERTUNGSLINK}}`.

Beschaffen (Ahmet, 1 Minute): Google Unternehmensprofil → „Bewertungen erhalten“ /
„Formular für Rezensionen teilen“ → Link kopieren (Form `https://g.page/r/…/review`).
Daraus den QR-Code erzeugen (das Profil bietet ihn dort direkt zum Download an). Der Link
gehört danach auch in die Theme-Einstellung „TP Google-Bewertung“ → nichts ändern, dort
steht der Profil-Link zum *Lesen*; der Formular-Link ist nur für die Bitte.

## 2. E-Mail an Shop-Kunden

**Betreff:** Wie gefällt Ihnen Ihr neuer Boden?

**Vorschautext:** Zwei Minuten für eine kurze Google-Bewertung – das hilft uns sehr.

```
Hallo {{ customer.first_name | default: "liebe Kundin, lieber Kunde" }},

vor ein paar Tagen ist Ihre Bestellung {{ order.name }} bei Ihnen angekommen.
Wir hoffen, alles hat gepasst und der neue Boden gefällt Ihnen.

Als Fachgeschäft aus Oranienburg leben wir von Empfehlungen. Wenn Sie zwei Minuten
Zeit haben, schreiben Sie uns gern eine ehrliche Bewertung bei Google – ob Lob oder Kritik:

    [ Jetzt bei Google bewerten ]  →  {{BEWERTUNGSLINK}}

Falls etwas nicht in Ordnung ist, antworten Sie einfach auf diese Mail oder rufen Sie
uns an – wir kümmern uns darum.

Vielen Dank und viel Freude mit Ihrem Boden
Ihr Team von Teppich Paradies Oranienburg

---
Sie erhalten diese Nachricht, weil Sie dem Empfang von E-Mails zugestimmt haben.
[Abmelden]
```

Hinweis: Der Satz „Falls etwas nicht in Ordnung ist …“ steht *zusätzlich* zum
Bewertungsknopf, nicht statt seiner – sonst wäre es Review-Gating.

## 3. QR-Karte (Laden und Montage)

Format: Visitenkarte 85 × 55 mm, beidseitig; Druck lokal oder Online-Druckerei
(Kosten → Freigabe Ahmet).

**Vorderseite**

```
   Danke für Ihren Einkauf!
   Wie zufrieden sind Sie mit uns?

   [ QR-CODE → {{BEWERTUNGSLINK}} ]

   Scannen und bei Google bewerten
   – dauert nur 2 Minuten
```

**Rückseite**

```
   Teppich Paradies Oranienburg
   Ihr Fachgeschäft für Teppich, Teppichboden, Vinyl & Verlegung
   www.teppich-paradies.net

   Etwas nicht in Ordnung? Sprechen Sie uns direkt an –
   wir kümmern uns darum.
```

Ausgabe:
- **Laden:** an der Kasse mit dem Beleg übergeben bzw. in die Tüte; Aufsteller mit
  gleichem QR an der Kasse (A6).
- **Montage:** Monteur übergibt die Karte bei Fertigstellung mit einem Satz
  („Wenn Sie zufrieden sind – oder auch nicht – freuen wir uns über eine Bewertung“).
  Später optional: Hinweis im Auftrags-App-Schritt „Fertigstellung“ („Bewertungskarte
  übergeben ☐“) – eigene Aufgabe, nicht Teil dieses Entwurfs.
- Mail/WhatsApp an Montagekunden nur mit dokumentierter Einwilligung im Auftrag.

## 4. Technischer Weg (Shop): Shopify Flow + Shopify Messaging

Beide Apps sind kostenlos (Messaging: Freikontingent ~10.000 Mails/Monat, weit über
Bedarf). Installation = App-Installation → Freigabe. Absender-Domain verifizieren
heißt DNS-Einträge (SPF/DKIM) → **DNS-Änderung, nur mit Freigabe**.

### Anleitung zum Anlegen (als inaktiver Entwurf)

1. Apps installieren: **Shopify Flow**, **Shopify Messaging** (Admin → Apps → Shopify App Store).
2. Messaging → Vorlage „Leer“ → Betreff, Vorschautext und Text aus Abschnitt 2 einsetzen;
   Knopf „Jetzt bei Google bewerten“ mit `{{BEWERTUNGSLINK}}`. Als **Entwurf speichern**.
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
6. Bewertungslink aus dem Google-Profil liefern
