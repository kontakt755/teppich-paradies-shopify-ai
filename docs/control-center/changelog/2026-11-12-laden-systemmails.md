## 2026-11-12 · Ansicht Laden: eigene Post faellt weg, Unzustellbar-Meldung ist Info

- **Geaendert:** In der Spalte „Mails“ erscheinen keine Mails von den eigenen Adressen mehr und nicht mehr die Bestaetigung der Weiterleitung vom Mailanbieter - darauf antwortet niemand, sie wurden trotzdem rot. Unzustellbar-Meldungen (Absender mailer-daemon/postmaster) bleiben sichtbar, aber als Info mit „Gesehen“ und dem Satz „Eine Mail von uns ist nicht angekommen. Bitte Adresse prüfen und neu senden.“
- **Getestet:** `docs/ai-dashboard/tests/laden.test.mjs` (neuer Test), `npm run -s pruefen`.
- **Risiken/Annahmen:** Testmails von fremden Adressen erkennt die Regel nicht. Unzustellbar-Meldungen werden bewusst nicht ausgeblendet: sonst merkt niemand, dass eine Antwort den Kunden nie erreicht hat.
- **Naechste Stufe:** Luecken in den Postfach-Filtern schliessen.
