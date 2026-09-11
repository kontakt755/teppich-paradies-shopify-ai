# Lexware Office API – Funktionsumfang

Stand 2026-09-11 · Quelle: offizielle Doku https://developers.lexware.io/docs/ (per curl gelesen).
Die Doku kann sich ändern – unten steht der Befehl, mit dem sich der Kern in einer Zeile nachprüfen lässt.

## Kurzfassung

Angebote lassen sich per API **anlegen, abrufen und – sobald finalisiert – als PDF holen**.
**Ändern, Löschen und Statuswechsel** (etwa auf angenommen/abgelehnt) bietet die API nicht an. Die Doku
sagt dazu wörtlich: „The status of a quotation cannot be changed via the api."

Das betrifft jedes Werkzeug gleich – ChatGPT, Claude, Codex, jede App. Kann ein Werkzeug es trotzdem,
arbeitet es über die Lexware-Oberfläche und nicht über die API.

## Was davon ein Agent tun darf

Die Tabelle weiter unten beschreibt, was die **API technisch** kann – nicht, was ein Agent hier darf.

- **Heute: nichts.** Es gibt keine Lexware-Anbindung, weder im Repo noch als Connector.
- **Geplanter Start: nur lesen** (`FUTURE_DOMAIN_PACKS.md` §9, Schritt 5). Schreibrechte werden erst nach
  erfolgreichen Nur-lesen-Läufen freigeschaltet.
- **Danach laut Plan autonom vorgesehen** (§2): Exportanalyse, Plausibilitätsberichte, Angebotsentwürfe
  ohne Versand.
- **Immer Human Gate** (§2): Buchung, Versand, Storno, Kundenänderung, Artikelpreise. Buchungs-, Steuer-,
  Kunden- und Belegschreibvorgänge sind HIGH; `RISK_MAP.yaml` setzt `lexware.default_write_risk: HIGH`
  und `high_task_action: NEEDS_AHMET`.
- **Löschen** (Artikel, Webhooks) und **Finalisieren** stehen in keiner Liste autonomer Arbeiten. Sie
  brauchen eine konkrete Freigabe im Einzelfall.

## Was die API technisch kann

Keine Handlungsbefugnis – was davon erlaubt ist, steht im Abschnitt oben.

| Bereich | Anlegen | Abrufen | Ändern | Löschen | Hinweis |
|---|---|---|---|---|---|
| Angebote `/v1/quotations` | ✅ | ✅ + PDF/Datei | ❌ | ❌ | ohne Parameter Entwurf, mit `?finalize=true` offen; Status nicht änderbar |
| Rechnungen `/v1/invoices` | ✅, auch als Folgebeleg | ✅ + PDF/Datei | ❌ | ❌ | Entwurf bzw. `finalize`; Status nicht änderbar |
| Auftragsbestätigungen `/v1/order-confirmations` | ✅, auch als Folgebeleg | ✅ + PDF/Datei | ❌ | ❌ | Entwurf bzw. `finalize` |
| Lieferscheine `/v1/delivery-notes` | ✅, auch als Folgebeleg | ✅ + PDF/Datei | ❌ | ❌ | Entwurf bzw. `finalize`; Status nicht änderbar |
| Gutschriften `/v1/credit-notes` | ✅, auch als Folgebeleg | ✅ + PDF/Datei | ❌ | ❌ | Entwurf bzw. `finalize`; Status nicht änderbar |
| Kontakte `/v1/contacts` | ✅ | ✅ + Filter | ✅ | ❌ | Ändern nur, wenn jede Liste (Ansprechpartner, Adressen …) höchstens einen Eintrag hat |
| Artikel `/v1/articles` | ✅ | ✅ + Filter | ✅ | ✅ | |
| Buchhaltungsbelege `/v1/vouchers` | ✅ + Datei anhängen | ✅ + Filter | ✅ | ❌ | |
| Belegliste `/v1/voucherlist` | – | ✅ | – | – | `voucherType` und `voucherStatus` sind Pflicht; Angebote: `voucherType=quotation`, Status u. a. `draft`, `open`, `accepted`, `rejected` |
| Webhooks `/v1/event-subscriptions` | ✅ | ✅ | – | ✅ | |
| Mahnungen `/v1/dunnings` | ✅ | ✅ | ❌ | ❌ | |

**PDF/Datei erst nach dem Finalisieren:** Für Belege im Entwurf existiert in Lexware keine Datei. Die API
lehnt den Abruf dann ab (HTTP 406 bzw. 409). Das PDF entsteht, sobald der Beleg vom Entwurf in den
Status offen wechselt. Das gilt für Angebote, Rechnungen, Abschlagsrechnungen, Auftragsbestätigungen,
Lieferscheine und Gutschriften.

Dateien lassen sich über `/v1/files` hoch- und herunterladen. Nur lesend außerdem: Länder,
Zahlungsbedingungen, Zahlungen, Buchungskategorien, Abschlagsrechnungen, Drucklayouts, Profil,
Serienvorlagen.

**Folgebeleg** heißt: neuer Beleg mit `precedingSalesVoucherId` auf einen vorhandenen. Ein Angebot kann
so zu Auftragsbestätigung, Lieferschein oder Rechnung werden. Enthält das Angebot alternative oder
optionale Positionen, lehnt die API das mit HTTP 406 ab.

**Rate-Limit:** 2 Anfragen pro Sekunde. Darüber antwortet die API mit HTTP 429 und führt den Aufruf
nicht aus – später erneut versuchen, mit wachsender Wartezeit.

## Anmeldung

- Privater API-Schlüssel als Bearer-Token, erzeugt unter https://app.lexware.de/addons/public-api.
- Laut Changelog (07.05.2024): mehrere Schlüssel pro Nutzer, Scope-Auswahl pro Schlüssel, Erneuerung.
  Fehlt einem Schlüssel die Berechtigung, lehnt die API den Aufruf ab.
- Welche Scopes es gibt – ob etwa ein reiner Lese-Schlüssel möglich ist –, nennt die Doku nicht.
  Beim Anlegen des Schlüssels in Lexware nachsehen. Für den geplanten Nur-lesen-Start
  (`FUTURE_DOMAIN_PACKS.md` §8, Punkt 4: getrennte Lese- und Schreibzugänge) wäre das der Weg.
- Schlüssel nur in `.env.local`, nie ins Repo, nie als Kommandozeilen-Argument.

## Wenn etwas geändert werden muss

- **Angebot korrigieren:** per API als Entwurf anlegen (ohne `finalize`) und in Lexware bearbeiten.
  Ein PDF gibt es erst, wenn das Angebot finalisiert ist.
  Direktlink in die Bearbeitung: `{appbaseurl}/permalink/quotations/edit/{id}`, Ansicht: `…/view/{id}`.
  Ein Werkzeug sollte nach dem Anlegen diesen Link ausgeben.
- **„Ändern" per API** heißt: neues Angebot anlegen. Das alte löscht ein Mensch in Lexware.
- **Angenommen/abgelehnt setzen:** nur in Lexware.
- **Rechnung zurücknehmen:** Löschen geht nicht. Eine Gutschrift mit `precedingSalesVoucherId` auf die
  Rechnung wird, sobald finalisiert, sofort verrechnet und senkt den offenen Betrag der Rechnung.

## Nachprüfen, statt dieser Datei zu glauben

```bash
curl -sL https://developers.lexware.io/docs/ | grep -oE '(PUT|DELETE|PATCH) \{resourceurl\}/v1/[A-Za-z0-9_/{}-]+' | sort -u
```

Am 2026-09-11 kamen genau fünf Zeilen: `PUT` für articles, contacts und vouchers, `DELETE` für articles
und event-subscriptions. Taucht dort `quotations` auf, ist diese Datei veraltet.

## Einordnung im Repo

- Eine Lexware-Anbindung gibt es noch nicht. Laut `FUTURE_DOMAIN_PACKS.md` ist Lexware Schritt 5 der
  Ausbaufolge, zuerst nur lesend. Human Gates dort: Buchung, Versand, Storno, Kundenänderung,
  Artikelpreise. `RISK_MAP.yaml`: `lexware.default_write_risk: HIGH`.
- Diese Datei ist der Anfang des Operationsinventars, das die Onboarding-Checkliste
  (`FUTURE_DOMAIN_PACKS.md` §8, Punkt 1) verlangt.
