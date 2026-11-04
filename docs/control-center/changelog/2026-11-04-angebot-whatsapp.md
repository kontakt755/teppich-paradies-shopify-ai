## 2026-11-04 · Angebot per WhatsApp mit Kontodaten vorbereiten (#1893)

- **Geaendert:** Offene Angebote (Kunden → Angebote) haben jetzt „In WhatsApp öffnen“ und „Text kopieren“: fertiger Text mit Positionen, Gesamtbetrag aus dem Shopify-Entwurf, Kontodaten, Verwendungszweck und Links zu Widerrufsbelehrung und AGB. Abgeschickt wird nichts automatisch, das macht der Mitarbeiter in WhatsApp. „In Shopify öffnen“ führt zum Entwurf, der nach dem Geldeingang als bezahlt markiert wird. Die Abfrage liest zusätzlich den Versand des Entwurfs.
- **Getestet:** `docs/ai-dashboard/tests/angebot-nachricht.test.mjs` (IBAN-Prüfsumme, Text, Rufnummern, Linklänge); Testlauf siehe PR.
- **Risiken/Annahmen:** Testversion. Die Kontodaten liegen nur privat in `angebote/kontodaten.json`; ohne gültige IBAN gibt es keinen Text. Der Entwurf wird weiter von Hand in Shopify angelegt. Der Text ist nicht rechtlich geprüft. Ohne eingetragenen Versand nennt der Text keinen Versand, und die Zeile weist auf die Betragsprüfung hin.
- **Naechste Stufe:** Entwurf direkt aus einer Musterbestellung anlegen, wenn sich der Weg im Test bewährt.
