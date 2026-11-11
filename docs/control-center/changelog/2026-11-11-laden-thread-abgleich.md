## 2026-11-11 · Laden: Thread-Abgleich bei „Anfragen ohne Antwort“ (w-352)

- **Geändert:** Eine Mail im Laden-Postfach gilt auch dann als beantwortet, wenn die Antwort an eine andere Adresse ging, aber im selben Verlauf steht (`In-Reply-To`/`References` nennt die Message-ID der Mail). Die Gesendet-Suche nimmt dafür zusätzlich den Betreff. Nur lesend im Postfach.
- **Getestet:** neuer Test in `operations/tests/laden-mails.test.mjs`; `npm run -s pruefen` grün (ohne Theme Check).
- **Risiken/Annahmen:** Ungeprüft, ob weitergeleitete Mails im Laden-Postfach die Original-Message-ID behalten. Serviceanfragen (Formular) haben keine Message-ID, dort bleibt es beim Adressabgleich. Wirkt erst nach Dienst-Neustart.
- **Nächste Stufe:** Thread-Abgleich auch für Serviceanfragen, falls die Formularmail eine Message-ID bekommt.
