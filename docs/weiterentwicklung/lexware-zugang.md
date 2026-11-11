# Lexware Office: API oder Weboberfläche – Tarif-Prüfung (w-346)

Stand 2026-11-11 · reine Prüfung, in Lexware wurde nichts geändert oder ausprobiert.

## Empfehlung

**Im Tarif XL bleiben.** Der Rückwechsel nach L spart rund **132 € netto im Jahr** (11 € × 12; Tarifseite 11.11.2026), kostet aber den einzigen Weg, auf dem der Angebotsassistent und Claude Lexware-Entwürfe sicher, geprüft und ohne offenes Browserfenster anlegen. Die Annahme aus dem Instagram-Video stimmt nur zum Teil: Ein „MCP ohne API“ gibt es nicht; was ohne API geht, ist das Bedienen der Weboberfläche im angemeldeten Chrome – das ist langsamer, brüchiger und nur mit Mensch davor sinnvoll.

## 1. Bestand im Projekt

Nur **eine** Anbindung nutzt die API: der Angebotsassistent (`domains/lexware/angebotsassistent/`, Google Apps Script, Schlüssel in den Skripteigenschaften).

| Was | API-Aufruf | Zweck |
|---|---|---|
| Artikelstamm lesen | `GET /v1/articles` | einzige Preisquelle des Assistenten |
| Entwurf anlegen | `POST /v1/quotations` (ohne `finalize`) | genau ein Angebotsentwurf je Klick, danach vollständig zurückgelesen |
| Entwürfe suchen | `GET /v1/voucherlist` | Dublettenschutz |
| Verbindungstest | `GET /v1/profile` | |

Alles andere ist nicht verbunden: Das Control Center führt Lexware-Nummern nur als Textfeld (Hausverwaltungen), die Akquise erzeugt Angebotstexte nur zum Kopieren, Rechnungen und Kontakte werden nicht per API angefasst. Eingangsrechnungen laufen gar nicht über Lexware (Papierablage). Den Artikelstamm haben wir zusätzlich einmal über den angemeldeten Chrome gelesen (die Seite ruft intern denselben Abruf auf), ohne API-Schlüssel.

Der Assistent wird per Klick von einem Menschen bedient, es gibt keinen unbeaufsichtigten Lauf und keinen Mac-Dienst, der Lexware anspricht. Die Grenzen des Funktionsumfangs stehen in `domains/lexware/api-funktionsumfang.md`.

## 2. Öffentliche Fakten (abgerufen 11.11.2026)

- **Tarife** laut [lexware.de/preise](https://www.lexware.de/preise/), netto je Monat: S 3,95 / 7,90 €, M 6,45 / 12,90 €, L 10,95 / 21,90 €, XL 16,45 / 32,90 €. Die Seite nennt zwei Werte je Tarif; der höhere ist vermutlich der Regelpreis (der niedrigere der Rabatt, „50 % für 3 Monate“) – das ist eine Schlussfolgerung. Passt zu Ahmets „über 30 €“. Kein Mindestvertrag, Version jederzeit in den Kontoeinstellungen wechselbar. Quelle für die Listenpreise bestätigt auch [Finom](https://finom.co/de-de/blog/lexware-office-preise/) (L 21,90 €, XL 32,90 €).
- **API nur ab XL**, ohne Zusatzkosten: [Public API](https://www.lexware.de/partner/public-api/) („steht aktuell ab der Version XL zur Verfügung“). L enthält Buchhaltung, EÜR und Umsatzsteuer; XL zusätzlich EU-/Abschlagsrechnungen und die API. Eine vollständige Funktionsmatrix L gegen XL war nicht abrufbar – vor einem Wechsel in Lexware prüfen, ob Ahmet weitere XL-Funktionen nutzt (Abschlagsrechnungen, EU-Rechnungen).
- **Was die API kann und nicht kann:** Angebote anlegen, lesen, abschließen; Rechnungen, Kontakte, Artikel u. a. Angebote und Rechnungen **ändern** oder deren Status setzen geht nicht („The status of a quotation cannot be changed via the api.“), einen Versand per E-Mail bietet die API nicht an. Einzelheiten und Befehl zum Nachprüfen: `domains/lexware/api-funktionsumfang.md` (Stand 11.09.2026, per curl gegen [developers.lexware.io](https://developers.lexware.io/docs/)). Die Doku wurde diesmal nur zu einem Zehntel erneut gelesen; die Aussage zu Änderungen stützt sich auf den früheren Lauf.
- **Grenzen:** 2 Anfragen je Sekunde (HTTP 429). [Lizenzbedingungen der Public API](https://agb.lexware.de/lexware-office/public-api-lizenz--und-nutzungsbedingungen): Nutzung eigener Software ist erlaubt, das Recht ist „widerruflich“; Lexware darf mit 90 Tagen Frist kündigen und künftig Gebühren (mit 90 Tagen Vorlauf) verlangen. [Fair-Usage-Policy](https://agb.lexware.de/lexware-office/fair-usage-policy): u. a. höchstens 20 Ausgangsbelege je Minute – für uns unerheblich.
- **Fertige MCP-Server:** Es gibt keinen von Lexware. Community-Server existieren, z. B. [JannikWempe/mcp-lexware-office](https://github.com/JannikWempe/mcp-lexware-office) (MIT, standardmäßig nur lesend), [lazyants/lexware-mcp-server](https://mcpservers.org/servers/lazyants/lexware-mcp-server) und [jacomeit/lexware-php-mcp](https://packagist.org/packages/jacomeit/lexware-php-mcp). **Alle brauchen den API-Schlüssel** (`LEXWARE_OFFICE_API_KEY` bzw. Token) und damit XL. Sie rufen dieselben API-Endpunkte auf, können also nichts, was die API nicht kann. Die Repositories wurden nicht geprüft; Fremdcode mit Schlüssel und Schreibrechten wäre ein eigenes Sicherheitsthema. Ein Vergleich mit dem eigenen Apps-Script-Assistenten bringt nichts Neues.

## 3. Der Weg ohne API: Chrome bedient die Weboberfläche

| Punkt | Bewertung |
|---|---|
| Was ginge | Angebot im Entwurf bearbeiten, Status setzen, Rechnung versenden, lesen (der Artikelabruf per Chrome läuft schon). Also genau die Lücken der API. |
| Unbeaufsichtigt / Mac-Dienst | **Nein.** Braucht Chrome, geöffneten Tab und die angemeldete Firmenanmeldung; bei Sitzungsablauf oder Zwei-Faktor steht es. Nichts davon eignet sich für einen Dienst. |
| Tempo und Zuverlässigkeit | Klick für Klick, deutlich langsamer als ein API-Aufruf; Eingaben werden nicht deterministisch gegengeprüft wie beim Assistenten (Zurücklesen, Pflichtkontrolle). |
| Bruch bei Änderungen | Lexware ändert die Oberfläche ohne Ankündigung; die interne `/mat/material-rest/…`-Schnittstelle ist undokumentiert und kann jederzeit wegfallen. Die API ist versioniert und dokumentiert. |
| Nutzungsbedingungen | In den gefundenen AGB steht nichts ausdrücklich zu Bots oder Oberflächenautomatisierung; das ist **nicht belegt erlaubt**. Die Lizenz regelt nur die API. Für Schreibvorgänge am Beleg wäre das ohnehin Menschensache. |
| Regeln des Projekts | Claude finalisiert und versendet nie; das gilt auch im Browser. Rechnung verschicken bleibt also bei einem Menschen. |

Das Chrome-Werkzeug ist damit eine **Ergänzung** für lesende und vorbereitende Schritte, kein Ersatz für die API.

## 4. Rechnung

- **Ersparnis:** 11 € netto/Monat = **132 € netto/Jahr** (rund 157 € brutto), falls die Regelpreise stimmen.
- **Verlust bei Wechsel nach L:** Angebotsassistent (am 13.10. gebaut, Entwurf inkl. Pflichtkontrolle und Rücklesen) fällt aus oder müsste als Chrome-Ablauf neu gebaut werden; jeder Entwurf wäre manuell oder mit einem Menschen vor dem Browser. Die weitere Lexware-Planung (Angebote aus Claude, w-164) hängt an der API.
- **Mehraufwand:** Ein Neubau über Chrome wäre mehrere Stunden Arbeit plus laufende Pflege bei Oberflächenänderungen; schon wenige Stunden im Jahr kosten mehr als 132 €.
- **Ausfallrisiko:** Mit API gering (versioniert, dokumentiert); ohne API hoch (Anmeldung, Oberfläche, nicht belegt erlaubt).
- **Was die API-Einschränkung nicht löst:** Weder ein Wechsel auf L noch ein MCP ändert, dass die API Angebote nicht ändern und Rechnungen nicht versenden kann. Das bleibt eine Handarbeit in Lexware (Entwurf anlegen lassen, dort bearbeiten, dort versenden).

**Wann sich ein Wechsel lohnt:** Würde der Angebotsassistent nicht mehr genutzt und w-164 aufgegeben, wären 132 €/Jahr bei XL → L ohne Gegenwert. Dann in den Kontoeinstellungen zurückstellen (monatlich möglich) und vorher XL-Funktionen prüfen.

## Offene Punkte

- Die vollständige Funktionsmatrix L gegen XL und der Effekt auf bestehende API-Schlüssel nach einem Wechsel waren auf den Seiten nicht abrufbar (Ahmet kann es im Lexware-Konto unter „Version wechseln“ sehen, ohne zu wechseln).
- Ob Ahmet den Regelpreis oder Rabattpreis zahlt, steht nicht im Repository (Rechnung von Lexware prüfen).
