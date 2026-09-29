# Google Ads: Vorbereitung und Startcheck, 29.09.2026

**Status: NO-GO für Search Ads.** Keine Kampagne erstellt oder aktiviert, kein Budget ausgegeben. Diese Datei trennt geprüfte Fakten von Einstellungen, für die der Zugang zu Ads, GA4, Merchant Center oder Shopify Admin fehlt.

## Änderungen in diesem Arbeitszweig

- `snippets/tp-lead-events.liquid`: `tp_lead_form_submit` wird erst nach einer von Shopify bestätigten Kontaktanfrage veröffentlicht. Der vorherige `submit`-Listener zählte auch ungültige und abgewiesene Formulare. Musterformulare sowie die Auswahl „Muster bestellen“ im Startseitenformular melden stattdessen `tp_sample_form_submit`.
- Bestätigungsmarker ergänzt in `blocks/contact-form.liquid`, `sections/tp-start-kontakt.liquid`, `sections/contact-form.liquid` und `snippets/tp-muster-beratungsanfrage.liquid`. Keine Formulardaten werden an das Theme-Ereignis gehängt.
- `snippets/meta-tags.liquid`: `/collections/teppiche` erhält den Canonical und `og:url` der Hauptadresse `/collections/teppich-nach-mass`. Bekannte Menüliste und Such-Chip zeigen nun auf die Hauptadresse (`sections/header-group.json`, `sections/tp-header-suche.liquid`).
- Noch **nicht live**: Der Branch muss erst durch die Projekt-Review- und Deploy-Gates.

## Website und Shopify

| Punkt | Befund / nächster Schritt |
|---|---|
| Vinyl-Verlegeseite | Live HTTP 200. Das Seiten-Template zeigt Vinyl-Kategorie-CTAs. Die gefundenen Linoleum- und Teppich-Produktlinks stammen aus dem globalen Menü bzw. der Suchvorschau, nicht aus dem Seiteninhalt; deshalb keine Produktentfernung. |
| `/collections/vinylboden` | **Erledigt im Shopify Admin:** URL-Redirect auf `/collections/vinylboden-1` angelegt. Öffentlicher HTTP-Test: 301 mit `Location: /collections/vinylboden-1`, Ziel 200. |
| Teppich nach Maß | `/collections/teppich-nach-mass` und `/collections/teppiche` sind HTTP 200, führen dieselben 50 Produkte und hatten je einen eigenen Canonical. Hauptadresse ist jetzt im Arbeitszweig `/collections/teppich-nach-mass`; die zweite URL zeigt per Canonical darauf. Ein 301-Redirect kann für die noch aktive Collection nicht einfach als Shopify-URL-Redirect angelegt werden. Nach Adminprüfung über Deaktivierung/Umbenennung der doppelten Collection entscheiden und dann 301 einrichten; die Datenänderung bleibt offen. |
| Treppenverlegung | Live HTTP 200. Für die drei geplanten lokalen Search-Kampagnen keine Treppen-Anzeigengruppe vorgesehen; daher keine Änderung. |

## Tracking: Sollzustand und Prüfprotokoll

Shopify Admin wurde am 29.09.2026 geprüft: Die Google-&-YouTube-App ist mit Ads, GA4 und Merchant Center verbunden; das App-Pixel läuft mit Datenzugriff „Optimiert“, Enhanced Conversions ist in der App aktiviert. Zusätzlich existiert das Custom Pixel „GTM-KRXFFDSL Checkout Tracking“. Es lädt den GTM-Container **erst beim Ereignis `checkout_completed`** und schiebt dabei ein `purchase` mit Transaktions-ID, Wert und Währung in dessen dataLayer; `begin_checkout` wird ebenfalls gepusht. Der GTM-Container enthält ein altes Ads-Tag „Kontaktformular“ mit Trigger `form_submit` und weitere Google-/Meta-/Consent-Tags. Diese Konstruktion ist für normale Service-Leads nicht geeignet: Der Container wird auf der Kontaktseite durch dieses Pixel nicht geladen. Die Kaufaktion der Google-App ist bereits separat verbunden. Das Custom Pixel darf nicht pauschal entfernt werden, bevor abhängige Tags geprüft sind.

Im Ads-Konto sind aktuell **eine primäre App-Kaufaktion** und sekundäre App-Aktionen für Add to cart und Begin checkout vorhanden. Daneben sind zwei Anrufaktionen, fünf Kontaktaktionen und eine von Google gehostete Website-Besuchsaktion primär; die Ziele Anruf, Kontakt und Seitenaufruf gelten derzeit als Kontostandard für alle drei vorhandenen pausierten Kampagnen. Eine Kontaktformular-Aktion meldet „Überprüfung erforderlich“, mehrere andere melden keine kürzlich erfassten Conversions. GA4 zeigt `form_start`, `form_submit`, `purchase`, `kontakt_WA` und `ads_conversion_Kontakt_1` als Schlüsselereignisse; die letzten beiden hatten keine Streamdaten. **Vor Gebotsoptimierung müssen die nicht belastbaren Mikroziele aus der Primärzählung herausgenommen und ein nach Erfolg ausgelöster Lead nachweislich angebunden werden.**

Ein Tag-Assistant-Debugversuch für `/pages/kontakt` ließ sich am 29.09. im eingebetteten Browser nicht mit dem geöffneten Shopfenster verbinden („Nicht verbunden“, null Tags). Das ist **kein** Befund über die tatsächliche Consent-Konfiguration. Der Test muss in einer unterstützten Browsersitzung mit beobachteten Zuständen vor und nach Einwilligung wiederholt werden.

| Ziel | Einstellung vor Start | Beleg fehlt |
|---|---|---|
| Kauf | Genau **eine** primäre Ads-Kaufaktion. Wert in EUR und eindeutige Transaktions-ID aus bestätigter Bestellung. 0-Euro-Muster ausschließen oder sekundär halten. | Google Ads: Conversion-Übersicht und Testbestellung; Shopify: Kundenereignisse; GA4: DebugView. |
| Angebotsformular | `tp_lead_form_submit` als primärer Lead, nur nach Erfolg. Quelle des Events in einem einzigen Pixel/GTM-Tag an Ads anbinden. | Pixel-Konfiguration und Test einer echten, erlaubten Anfrage. |
| Add to cart / Begin checkout | Sekundär. | GA4 DebugView und Ads-Zielstatus. |
| Telefonklick / WhatsApp / Muster | Sekundär, getrennte Aktionen. Telefonklick ist kein bestätigter Anruf. | GTM/Pixel-Konfiguration und Echtzeit-Test. |
| Enhanced Conversions | Nur über die vorhandene Google-&-YouTube-/Ads-Integration und nach Consent-Prüfung aktivieren, wenn das Konto dies unterstützt. Keine Kundendaten in Theme-Code oder Dokumentation. | Integration und Ads-Diagnose. |
| Consent Mode | Mit Tag Assistant vor und nach Einwilligung testen: Analytics/Ads-Signale entsprechend der Auswahl, kein unbeabsichtigter Doppelversand. | Browser-Test mit Kontozugriff. |

**Konkrete Kontoprüfung:** Shopify Admin → Google & YouTube: verbundenes Ads-, Merchant- und GA4-Konto notieren. Kundenereignisse: App-Pixel und Custom-Pixel auflisteten, GTM-Container und dessen Tags prüfen. Google Ads → Ziele → Conversions: Namen, Quelle, Primär/Sekundär, „In Conversions“, Zählmethode, Wert und Status vergleichen; direkte Shopify-Kaufaktion und GA4-Import dürfen nicht beide primär sein. GA4 → Datenstream und Produktverknüpfung mit Ads prüfen. Tag Assistant mit abgelehntem und angenommenem Consent, anschließend Warenkorb, Checkout und genehmigtem Testkauf durchführen. Eine Testbestellung ist wegen Kosten/geschäftlicher Wirkung separat freizugeben.

## Merchant Center

Die Google-&-YouTube-App zeigt am 29.09.2026 **1.631 von 1.633 Varianten genehmigt**, zwei in Prüfung, keine eingeschränkt oder abgelehnt. Im Merchant Center selbst sind **2.214 Produkte** gelistet: 1.634 bereitgestellte Produkte und 580 zusätzlich von Google auf der Website gefundene Produkte. Dort sind 2.189 genehmigt, 22 nicht genehmigt und drei in Prüfung. Die unterschiedlichen Zähler beziehen sich also nicht auf denselben Produktbestand. Unter „Überprüfung erforderlich“ entfallen die 22 Ablehnungen auf **17 Fälle „Einfarbiges Bild“ und fünf Fälle „Produktpreis fehlt“**. Ein geprüfter Preisfall („Turku Eiche Chalet – Klickvinyl 7mm“) stammt aus der automatisch gefundenen Website-Quelle, nicht aus der Shopify App API. Keine pauschale Preis- oder Bildänderung daraus ableiten; erst die fünf betroffenen URLs und ihre Shopify-Feed-Dubletten einzeln abgleichen. Für die geplanten lokalen Search-Kampagnen ohne Produktfeed ist dies kein Startblocker. Der Bericht vom 11.09. (damals 225 im Review) ist überholt.

Für spätere Shopping-Anzeigen Feed-Preis gegen Landingpage und Versandangaben an Beispielprodukten prüfen. Das Theme-Snippet `snippets/tp-product-structured-data.liquid` enthält Beschreibungs-, Preis- und GTIN-Logik. Keine GTIN erfinden und `identifier_exists=false` nur für nachweislich ohne Kennung hergestellte Produkte setzen. Versandkosten nicht ohne Freigabe ändern.

**Konkreter Prüffall für Produktanzeigen:** Beim öffentlich erreichbaren Produkt `solenta-schiefer-grau` beträgt der Shopify-Variantenpreis 87,86 € pro Paket; das JSON-LD meldet `offers.price` 26,31 € pro m². Die Seite zeigt beide Preisarten. Googles Merchant-Center-Hilfe erklärt, dass der Feed-Preis mit Landingpage beziehungsweise strukturierten Daten abgeglichen wird. Deshalb im Merchant Center genau diesen Artikel und weitere Paketartikel auf Preisabweichungen prüfen, bevor Paket-JSON-LD oder Feed geändert wird. Ohne den tatsächlichen Feed- und Diagnoseeintrag ist die Ursache einer möglichen Ablehnung nicht sicher genug belegt. Für reine lokale Search-Anzeigen ohne Produktfeed ist dies kein Startblocker.

## Lokaler Search-Entwurf (nur Planung, keine Aktivierung)

Anzeigen, Suchbegriffe, Ausschlüsse und Freigabekriterien sind in `docs/google/search-ads-entwurf-2026-09-29.md` vollständig als pausierter Entwurf ausgearbeitet.

| Kampagne | Landingpage | Exact / Phrase Startbegriffe | Startbudget-Entwurf |
|---|---|---|---:|
| Bodenleger lokal | `/pages/liefer-verlegeservice` | `[bodenleger oranienburg]`, `"bodenleger in der nähe"`, `"boden verlegen lassen oranienburg"` | 15 €/Tag |
| Teppichboden-Verlegung | `/pages/teppichboden-verlegen-lassen` | `[teppichboden verlegen lassen]`, `"teppichboden verlegung berlin"`, `"teppich verlegen lassen oranienburg"` | 10 €/Tag |
| Vinyl-Verlegung | `/pages/vinylboden-verlegen` | `[vinylboden verlegen lassen]`, `"vinyl verlegen lassen berlin"`, `"klickvinyl verlegen lassen"` | 10 €/Tag |

Gesamt: **35 €/Tag als unverbindlicher Entwurf**, keine Ausgabe. Standortausrichtung Oranienburg plus tatsächlich bedienter Umkreis (laut Website regulär 50 km), Präsenz im Zielgebiet statt bloßes Interesse; Sprache Deutsch. Anzeigentexte: eigenes Verlegeteam, Untergrundprüfung, Aufmaß, Angebot anfragen, lokale Rufnummer. Assets: Sitelinks zu Leistungen, Kontakt und Referenzen, Anruf-Asset nur während erreichbarer Zeiten, Standort-Asset erst nach Kontoprüfung. Vor Veröffentlichung Leistungs- und Reichweitenaussagen mit dem Betrieb abgleichen. Keine Preisversprechen ohne Beleg.

Gemeinsame Negativliste als Startentwurf: `jobs`, `stellenangebote`, `ausbildung`, `gehalt`, `selber verlegen`, `anleitung`, `tutorial`, `youtube`, `kostenlos`, `gebraucht`, `pdf`. Suchbegriffsbericht nach Start eng prüfen; Negative nur nach tatsächlichem Kontext auf Kampagnenebene ergänzen. **AI Max, Broad Match, Display und Performance Max bleiben aus.**

## Startampel

- **Erledigt:** Vinyl-Redirect live; Google-&-YouTube-Kontoverknüpfung und Feed-Freigabestand geprüft; bestehende Ads-/GA4-/GTM-Ziele inventarisiert; Doppel-Collection identifiziert, Hauptadresse im Branch per Canonical und internen Links festgelegt; Formularzählfehler im Branch behoben; lokale Search-Struktur entworfen.
- **Offen:** Branch prüfen/deployen; belastbaren Formular-Lead an Ads anbinden; primäre Ads-Mikroziele bereinigen; Consent mit Tag Assistant und Kauf-/Lead-Datenfluss prüfen; Produktpreis-Prüffall im Merchant Center nachsehen.
- **Blockiert:** Die neue Lead-Quelle ist noch nicht live; Kaufprüfung erfordert eine genehmigte Testbestellung. Im verwendeten Browser meldet Google Ads zudem einen Werbeblocker und die Bearbeitung der Zielvorhaben öffnete keinen nutzbaren Dialog. Ohne Live-Ereignisse und diese Kontoprüfung wäre eine Aussage zu genau einer gezählten Kauf- und Lead-Conversion unbegründet.

**GO erst dann:** Redirect 301, Tracking ohne Doppelzählung samt Consent nachweislich korrekt, erfolgreiche Lead-Probe, Ads-Ziele sauber auf primär/sekundär gesetzt, Kampagnen pausiert geprüft und Tagesbudget ausdrücklich freigegeben. Shopping/PMax benötigt zusätzlich einen freigegebenen Feed. Bis dahin **NO-GO**.
