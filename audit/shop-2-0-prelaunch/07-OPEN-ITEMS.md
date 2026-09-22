# Offene Punkte (nicht in dieser Umgebung lösbar oder Inhaberentscheidung)

| # | Punkt | Wer | Warum offen |
|---|---|---|---|
| 1 | Flow ist installiert. Entwurf „Tag orders based on consultation attribute" fertigstellen: am Wahr-Ausgang der Bedingung „Beratung = Nein" Aktion *Add order tags* → `BERATUNG-NEIN`; umbenennen in „TP Bestell-Tags Beratung Masspruefung Verlegung"; „Zum Shop hinzufügen" (aktivieren). Zweiter Workflow TYP-MUSTER/-WARE/-MISCHBESTELLUNG laut `domains/shopify/flow/bestell-tags.md` | Ahmet/Kaya (Admin, 2 Minuten) | Agent-Chrome-Sitzung abgemeldet |
| 2 | GA4-Mess-ID und Ads-Conversion-Aktionen; Custom-Pixel-Code einsetzen | Inhaber + Admin | keine API |
| 3 | Merchant Center: Prüfstatus, Ablehnungen, Versandrichtlinie anlegen (`/policies/shipping-policy` 404) | Admin | keine API; Vorlage `domains/shopify/versandrichtlinie-vorlage.md` |
| 4 | Interne Mail ist gespeichert (22.09.). Noch offen: Kundenvorlagen im Admin einsetzen: `bestellbestaetigung-block.liquid`, `versandbestaetigung-block.liquid`, `interne-bestellmail-block.liquid` (Anleitung `domains/shopify/benachrichtigungen/README.md`); danach Testbenachrichtigung + Testbestellung mit Beratung Ja | Ahmet/Kaya (Admin) | kein API-Zugriff auf Vorlagen; Browser-Session nicht im Admin angemeldet |
| 7 | Internes Lieferanten-Mapping (`lieferant.*`) für alle Produkte füllen | Datenlauf lokal (Rohdaten außerhalb Repo) | Lieferantendaten nicht im Repo |
| 8 | Lieferzeit auf 5–7 Werktage vereinheitlicht – nur Einspruch nötig, falls Teppich nach Maß schneller geht | Ahmet | Information |
| 9 | Google-Bewertung/Anzahl als Theme-Einstellung im Live-Theme prüfen und ins Repo (`settings_data.json`) übernehmen | Session mit Theme-Pull | Editor-Stand ≠ Repo |
| 10 | Custom Pixel aus `domains/marketing/tracking-pixel-vorlage.md` anlegen (GA4-ID einsetzen), in Ads genau eine Purchase-Quelle | Ahmet (Admin/Ads) | keine API |
| 11 | Follow-up-Mails nach Zustellung (Ware: Ankunft/Verlegung/Pflege/Bewertung; Muster: „Muster angesehen?") – braucht Flow (Zeitverzögerung) oder Shopify Email; Texte können vorbereitet werden, sobald Werkzeug entschieden ist | Ahmet | Werkzeugentscheidung (docs/shop-decisions.md: Newsletter „erstmal auslassen") |
| 12 | Cookie-Banner-Text auf Sie-Form umstellen (Admin → Einstellungen → Kundendatenschutz → Cookie-Banner → Text) | Ahmet/Kaya | Shopify-nativ, kein Theme-Code |
| 13 | Admin-Klicks „Speichern" (Benachrichtigungsvorlagen) werden dem Agenten vom Freigabe-Filter verweigert – Vorlagen sind eingesetzt/vorbereitet, Speichern bitte selbst | Ahmet/Kaya | Sicherheitsfilter |

## Stand 2026-09-22 nachmittags (nach Admin-Session)

Erledigt: Flow-Workflow Beratung/Maßprüfung/Verlegung aktiv · interne Mail, Bestell- und Versandbestätigung gespeichert · Versandrichtlinie live.
Weiter offen (nicht per Agent lösbar):
- **Cookie-Banner-Text (du → Sie):** im Admin nicht editierbar, solange „Automatisierte Einstellungen" aktiv ist; Text kommt aus Shopifys Übersetzungen. Weg: Einstellungen → Sprachen → Deutsch → Übersetzen (Translate & Adapt, kostenlos) → Kundendatenschutz. Entscheidung Ahmet, ob die Automatik abgeschaltet werden soll.
- **GA4-Mess-ID:** muss vom Inhaber kommen (Google-Konto); danach Pixel aus `domains/marketing/tracking-pixel-vorlage.md`.
- **Merchant Center:** kein Zugang in dieser Umgebung (Google-Konto des Inhabers).
- **TYP-MUSTER/-WARE/-MISCH-Workflow:** Vorlage `domains/shopify/flow/bestell-tags.md`; bis dahin zeigt die interne Mail den Typ.
- **SKU-Bereinigung:** nur mit ausdrücklicher Freigabe.
- **Turku/Marlow:** dieselben 8 Klickvinyl-Artikel doppelt im Shop. Eine Linie auf Entwurf stellen (Weiterleitung der URLs einrichten) oder beide bewusst behalten. SKU-Bereinigung sonst abgeschlossen (104 Varianten, 2026-09-22).
- **Sylvara (3 Produkte + Kopie):** Artikelnummer beim Lieferanten nachfragen oder Produkte prüfen, ob sie noch geführt werden.
