# Faktenliste für die Datenschutzerklärung

Stand 2026-09-21 · Aufgabe #422. **Das ist kein Rechtstext und keine Rechtsberatung.**
Es ist die Liste dessen, was im Shop technisch tatsächlich läuft – gemessen am
Live-HTML, im Theme-Code und über die Admin-API –, damit der Rechtstext-Anbieter
oder Anwalt die Erklärung passend ergänzen kann. Formulierung, Rechtsgrundlagen und
Anbieterangaben (Sitz, Auftragsverarbeitung, Drittlandtransfer) kommen von dort.

Anlass: Die heutige Erklärung (Shopify-Richtlinie „Datenschutzerklärung" und Seite
`/pages/datenschutzerklarung`) erwähnt **weder Newsletter noch Google-Tag/Tag
Manager noch das Bewertungs-Widget** (Volltextsuche am 2026-09-21: 0 Treffer für
Newsletter, E-Mail-Marketing, Opt-in, Abmeldung, Google Analytics, Tag Manager,
Meta, Facebook, Elfsight).

## 1. Läuft heute schon

| Dienst | Was passiert | Wann | Einwilligung |
|---|---|---|---|
| **Shopify** (Shop, Warenkorb, Checkout, Kundenkonto, Shop Pay) | Betrieb des Shops, Bestellabwicklung, technisch nötige Cookies | immer | technisch notwendig |
| **Shopify-Cookie-Banner** (Kundendatenschutz) | fragt Einwilligung für Analyse und Marketing ab; steuert alle Pixel | erster Besuch | – |
| **Google & YouTube App** (Shopify-Vertriebskanal) | Google-Tag mit Merchant-Center-Ziel: Ereignisse Seitenaufruf, Produkt angesehen, Kauf | nach Einwilligung (Pixel läuft in Shopifys Kundenereignis-Umgebung) | Analyse/Marketing |
| **Custom Pixel mit Google-Tag-Manager-Container** („Checkout Tracking") | Tag Manager im Checkout-Umfeld; als Zwecke hinterlegt: Analyse, Marketing, Datenverkauf | nach Einwilligung | Analyse/Marketing |
| **Elfsight** (Widget mit Google-Rezensionen, Startseite und Service-Seiten) | lädt Skript von `static.elfsight.com`, zeigt Rezensionen aus dem Google-Unternehmensprofil | **erst nach** Marketing-Einwilligung; vorher nur ein Textlink zu Google | Marketing |
| **Eigene Shop-Ereignisse** (`tp_lead_*`, `tp_*` Funnel) | Klicks auf Telefon/WhatsApp/Mail/Kontakt, Farbe gewählt, Maße eingegeben, Muster, konfigurierter Warenkorb, Rabattcode-Eingabe (ohne Codewert), Newsletter, Ratgeber-Verweise. **Keine personenbezogenen Inhalte, keine Formularinhalte, keine exakten Maße.** Gehen an Shopifys Kundenereignisse; von dort nur an Pixel, die eine Einwilligung haben | beim Klick | Weitergabe nur mit Einwilligung |
| **Kurzzeit-Merker im Browser** (`sessionStorage`, Schlüssel `tpFunnelMusterPending`) | merkt für höchstens 20 Sekunden, dass eine Musterauswahl abgeschickt wurde | **nur mit Analyse-Einwilligung** | Analyse |
| **Produktvergleich** (`localStorage`) | merkt die bis zu drei Vergleichsprodukte im Browser des Besuchers | bei Nutzung der Funktion | funktional, vom Nutzer ausgelöst |
| **Kontaktformular** | Name, E-Mail, Nachricht gehen per Shopify-Formular an den Shop | beim Absenden | Anfragebearbeitung |
| **Links nach außen** | Google Maps (Unternehmensprofil), WhatsApp (`wa.me`), OpenStreetMap-Urheberhinweis – **reine Links**, es wird nichts eingebettet oder vorab geladen. Die Karte des Verlegegebiets ist ein eigenes, vorgerendertes Bild | erst beim Klick | – |

Nicht vorhanden (am 2026-09-21 geprüft): Google Analytics 4 im Theme, Google-Ads-
Conversion-Label, Meta-/Facebook-Pixel, TikTok, Hotjar, Clarity, eingebettete
YouTube-Videos, Google Fonts von Google-Servern, reCAPTCHA im Theme.

## 2. Vorbereitet, aber ausgeschaltet – braucht vorher einen Abschnitt

| Vorhaben | Was dann passiert | Offen |
|---|---|---|
| **Newsletter** | Anmeldung über Shopifys Kundenformular; E-Mail-Adresse wird als Kunde mit Marketing-Status gespeichert, dazu ein Tag mit dem Ort der Anmeldung (z. B. `quelle-footer`). **Double-Opt-in ist im Shop bereits aktiv** (Bestätigungsmail von Shopify), Abmeldelink in jeder Mail | Versanddienst noch nicht gewählt (Inhaber: „erstmal auslassen"); ohne Abschnitt in der Erklärung bleibt die Anmeldung aus |
| **Automatische Mails** (Willkommen, Muster-Nachfassen, Warenkorbabbrecher) | nur an bestätigte Abonnenten; Muster-Nachfassmail nutzt die bestellten Produkte/Farben aus der Bestellung | hängt am Versanddienst |
| **Google Analytics 4** | Weiterleitung der Shop-Ereignisse über ein Custom Pixel, nur mit Einwilligung | Mess-ID fehlt (Inhaber: „später") |
| **Videos im Ratgeber** | Vorschaubild aus dem eigenen Shop; YouTube (`youtube-nocookie`) wird **erst nach Klick** geladen | noch kein Video vorhanden |

## 3. Was der Rechtstext-Anbieter von Ihnen braucht

1. Diese Liste.
2. Die Entscheidung, ob und mit welchem Dienst der Newsletter versendet wird –
   davon hängt der Newsletter-Abschnitt ab.
3. Den Hinweis, dass alle Analyse-/Marketing-Dienste über das Shopify-Cookie-Banner
   gesteuert werden und ohne Einwilligung nicht laden.

Sobald die Erklärung ergänzt ist: Bescheid geben, dann wird die Newsletter-Anmeldung
im Theme eingeschaltet (Fußzeile, Artikelende im Ratgeber – nicht auf der Produktseite).
