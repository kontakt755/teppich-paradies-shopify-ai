# Versand-Schnittstellen: GLS und GEL mit dem Control Center verbinden

Prüfbericht zu Werkbank w-342, Stand 11.11.2026. Reine Recherche: nichts gebaut, kein Konto angelegt, nichts beantragt oder abgesendet. Aussagen mit Quelle; **offen** heißt: öffentlich nicht belegt, nur per Rückfrage beim Dienst zu klären. GLS und GEL sind Dienstleister, daher stehen die echten Namen hier.

## 1. Ausgangslage im Control Center

- „An Kunden raus“ ([versand.mjs](../ai-dashboard/ansichten/einkauf/versand.mjs)) bucht die Sendung in Shopify (Versanddienst aus der Liste GLS, GEL, DHL … plus von Hand getippte Sendungsnummer); Shopify schickt die Versandmail. Der Dienst ist heute nur ein Textfeld, keine Verbindung.
- Der Tab „Versandkosten“ ([versandkosten.mjs](../ai-dashboard/ansichten/einkauf/versandkosten.mjs)) rechnet GLS gegen GEL aus Tarifen vom September 2026. Das sind Planwerte; echte Rechnungen werden nirgends abgeglichen.
- Fehlt also: automatischer Sendungsstatus, echte Kosten je Sendung, Etikett aus dem Dashboard.

## 2. Ergebnis je Dienst

| Frage | GLS (Paket) | GEL (Spedition) |
|---|---|---|
| Offizielle Schnittstelle | **Ja.** ShipIT-Farm-API (REST und SOAP) für Sendung anlegen, Label, Stornieren; REST-Tracking nach Sendungsnummer. Auth über GLS-Developer-Portal (Authentication API v2). Quellen: [ShipIT REST Shipment](https://shipit.gls-group.eu/webservices/3_2_9/doxygen/WS-REST-API/rest_shipment_processing.html), [REST Tracking](https://gls-shipit.gls-group.eu:443/webservices/3_2_9/doxygen/WS-REST-API/rest_tracking.html), [easyConnect-Handbuch S. 4–5](https://www.gls-pakete.de/downloads/easyConnect_Handbuch_de.pdf) | **Nicht belegt.** Die Website nennt nur „Datenschnittstellen für marktgängige Systeme, alternativ Tailor-Made-Lösungen“ ([Leistungsübersicht](https://www.gel-express.de/de/produktuebersicht/)) und Rückspiel von Statusdaten ([B2B](https://www.gel-express.de/de/b2b/)). Keine Entwicklerseite, kein Protokollname. Nur Kontaktformular. |
| Etikett / Sendung anlegen | Ja, per API (ShipIT) oder fertig über easyConnect (Portal) | Nur manuell im Webportal GISA (Depotnummer, Kundennummer, Benutzer, Passwort; [Anleitung 12/2022](https://www.gel-express.de/wp-content/uploads/2022/12/Anleitung-GISA.pdf)). Per API: offen |
| Abholauftrag | Über easyConnect „Abholliste“ (Fahrer unterschreibt, [Handbuch S. 14](https://www.gls-pakete.de/downloads/easyConnect_Handbuch_de.pdf)). Eigener Pickup-Endpunkt: **offen** (nur über Dritt-Connector als Funktion genannt, [PlentyONE](https://whatsnew.plentyone.com/en/product-updates/gls-core-integration-ready-for-your-orders)) | GISA kennt „Versand“ und „Beschaffung“ (Abholung bei Dritten, z. B. Kettler). Über API: offen |
| Sendungsverfolgung | REST-Tracking per TrackID/Paketnummer/Referenz (siehe oben). Rate-Limits, Basis-URL Deutschland: offen | Öffentliche Seite mit Feld „Sendungsnummer“ ([gel-express.de](https://www.gel-express.de/de/sendungsverfolgung/)); **kein** belegtes URL-Schema, kein maschinenlesbarer Abruf, Nutzungsbedingungen zur Automatisierung nicht geprüft. Tracking-Aggregatoren (AfterShip, TrackingMore) führen GEL, die Qualität ist ungeprüft ([AfterShip](https://carriers.aftership.com/gel-express)) |
| Preise / Abrechnung je Sendung | Per API **nicht belegt**. Bleibt: Rechnungsdatei/Portal von GLS | Nicht belegt. Keine Rechnungsdaten als CSV/EDI genannt |
| Voraussetzungen | Vertrag mit Kundennummer und Contact-ID; Konto im GLS-Onboarding- oder Developer-Portal, App anlegen (Authentication API v2 + ShipIT-Farm API v1), dann **Freigabe durch den GLS-Ansprechpartner**, danach Public Key und Secret Key. ShipIT ist laut GLS für „Versender mit regelmäßig über 30 Paketen am Tag“ gedacht ([GLS AT](https://api.gls-group.eu/AT/en/sending-parcel/shiping-information/dispatch-system/)); ob das für uns gilt, ist offen | Bestehende Kundennummer (hat Ahmet, Tarif V1.0 09/2026) |
| Kosten der Schnittstelle | Für easyConnect „kostenlos“ ([Handbuch S. 2](https://www.gls-pakete.de/downloads/easyConnect_Handbuch_de.pdf)); ShipIT-Farm-Entgelt für Direktanbindung: offen | Offen |
| Shopify-Anbindung | **GLS easyConnect (Germany)**, GLS-eigene App, kostenlose Installation, Label erstellen/stornieren, Sendungsnummer und Status werden in Shopify aktualisiert, Rücksendelabel. „Externe Kosten“ möglich, Höhe offen. Bewertung 3,3 von 5 bei 5 Rezensionen; Rezension 17.11.2025: nach einem Fulfillment über die App lässt sich kein zweites starten (Teillieferungen!) ([Shopify App Store](https://apps.shopify.com/gls-de?locale=de)). Drittanbieter easyGLS: 50 Bestellungen gratis, dann ab 25 USD/Monat ([App Store](https://apps.shopify.com/easygls?locale=de)) | **Keine** belegt (weder Plugin noch Partner). Nur allgemein „Sendungsdaten direkt aus dem Shop-System“ ([E-Commerce](https://www.gel-express.de/de/e-commerce/)) |

## 3. Bewertung

- **GLS ist machbar und offiziell**, aber die Freigabe läuft über den GLS-Ansprechpartner und ist nicht selbst zu erledigen. Das Paketvolumen im Alltag (Muster, Zubehör, kurze Ware) ist klein; die „30 Pakete am Tag“ sind eine Richtlinie, keine harte Grenze (nicht belegt).
- **GEL hat öffentlich keine Schnittstelle.** Realistisch sind: (a) GEL fragen, ob und welche Datenschnittstelle (Status, Etikett) für Kunden unserer Größe freigeschaltet wird; (b) bis dahin Status per Hand oder über die öffentliche Seite, ohne Automatik.
- **Eigene Weg-Alternative für GEL-Status:** Sendungsnummer-Abfrage der GEL-Website nachbauen ist nur sinnvoll, wenn die Nutzungsbedingungen es erlauben und GEL kein Formular-Token verlangt; beides ungeprüft. Nicht empfohlen, bevor GEL geantwortet hat.
- **easyConnect statt Eigenbau für Etiketten:** Das Control Center müsste sonst Label-PDF/ZPL, Gefahrgut-/Serviceregeln, Stornierung und Fehlertexte selbst pflegen. easyConnect hat das schon, kostenlos, und schreibt Sendungsnummern nach Shopify zurück; die Teillieferungs-Schwäche (Rezension) muss vorher getestet werden, weil unser „raus“-Dialog genau Teillieferungen bucht.

## 4. Empfehlung in Stufen

| Stufe | Inhalt | Voraussetzung | Aufwand (Schätzung) |
|---|---|---|---|
| 0 | Bei beiden Diensten schriftlich fragen (Liste unten). Nichts bauen | Ahmet | 1 Stunde Ahmet |
| 1a | **GLS-Sendungsstatus** ins Control Center: an der Position/Auftrag Status und Zustelldatum zeigen (Tracking-REST, nur lesend, Abruf serverseitig mit Schlüsseln aus der Konfiguration, Cache) | GLS-Keys (Stufe 0) | 2–3 Tage |
| 1b | **Echte Kosten** je Sendung: Rechnungs-/Faktura-Datei von GLS und GEL (CSV/PDF) einlesen und gegen die Kalkulation (`versandkosten.mjs`) abgleichen; Abweichungen markieren. Kein API-Weg belegt, also Datei-Import | Datei-Muster von beiden Diensten | 2–4 Tage je Dienst |
| 1c | **GEL-Status**: erst nach GEL-Antwort. Ohne Schnittstelle bleibt Handeintrag (Status-Knopf „zugestellt“) | GEL-Antwort | 0,5 Tag (Knopf) bzw. offen |
| 2 | **Etikettendruck**: für GLS zuerst easyConnect-App in Shopify testen (Teillieferung, Abholliste), erst bei Bedarf eigene ShipIT-Anbindung im Dashboard (Label per „raus“-Dialog, Nummer zurück nach Shopify). GEL: GISA-Portal von Hand, Dashboard nur Sendungsnummer-Feld | Stufe 1a, easyConnect-Test | easyConnect: 1 Tag Test; Eigenbau 5–8 Tage |
| 3 | Abholauftrag aus dem Dashboard | Pickup-Endpunkt bei GLS belegt, GEL-API | nicht schätzbar |

Reihenfolge wie vom Inhaber gewünscht: zuerst Status und echte Kosten, dann Etiketten. Alle Schlüssel liegen nur in der lokalen Dienst-Konfiguration, nie im Repository (AGENTS.md).

## 5. Was Ahmet beantragen muss (nichts davon ist bereits geschehen)

**GLS (Ansprechpartner/Vertrieb):**
1. Im GLS-Developer- oder Onboarding-Portal mit einer Team-Adresse registrieren, App „Control Center“ anlegen mit Authentication API v2 und ShipIT-Farm API v1 (und Tracking, falls getrennt angeboten).
2. Dem GLS-Ansprechpartner schreiben: App-ID und Team-Adresse nennen, **ShipIT-Farm- und Tracking-Zugang** beantragen, Contact-ID bestätigen lassen.
3. Fragen mitgeben: Gilt die 30-Pakete-Richtlinie für uns? Entgelt für ShipIT? Gibt es Abholauftrag per API? Wird die Rechnung je Sendung als CSV/EDI geliefert? Welche Basis-URL und Rate-Limits für Tracking?
4. Optional: GLS easyConnect im Onboarding freischalten lassen, um es mit einem Testpaket zu probieren (Teillieferung zweimal fulfillen).

**GEL (Kontaktformular https://www.gel-express.de/kontakt/ oder Depot):**
1. Fragen: Gibt es für Kunden eine Datenschnittstelle (Name, Protokoll, Dokumentation) für Sendung anlegen, Etikett, Abholauftrag, Statusrückmeldung? Kosten und Voraussetzungen?
2. Gibt es einen maschinenlesbaren Status (z. B. Statusdatei, Webservice) für die Sendungsnummer? Darf die öffentliche Sendungsverfolgung automatisch abgefragt werden?
3. Gibt es Rechnungs-/Abrechnungsdaten je Sendung als Datei? Gibt es ein Shopify-Plugin oder einen Systempartner?
4. Rundungsfragen aus der Kalkulation gleich mitklären (Avis, 60 kg, Maut-Rundung, Querverkehr-Prozentbasis; siehe Gedächtnis `versandkalkulation_gls_gel`).

Vor jedem Mail-Versand an die Dienste zuerst Zweck, Empfänger und Text mit Ahmet abstimmen (Gedächtnis `feedback_mails_erst_erklaeren`).

## 6. Grenzen dieses Berichts

- Das GLS-Developer-Portal (`developer.gls-group.eu`) war am 11.11.2026 nicht erreichbar, die ShipIT-Doku hatte ein Zertifikatsproblem. Endpunkte, Rate-Limits und Pickup-Funktion stammen daher nur aus Suchtreffern, dem easyConnect-Handbuch und Dritt-Doku, nicht aus gelesener Entwicklerdokumentation.
- Das Handbuch trägt kein Datum; die easyConnect-Shopify-Rezensionen sind Einzelstimmen.
- GEL: nur öffentliche Seiten, keine Broschüren; robots.txt und Nutzungsbedingungen nicht gelesen.
