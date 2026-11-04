## 2026-11-03 · Sync-Dienst startet nach jedem Ende neu

- **Geaendert:** Die Plist-Vorlage des Sync-Dienstes setzt `KeepAlive` auf `true`. Bisher startete launchd nur nach einem Fehler neu; nach SIGTERM endet der Dienst aber mit Exit-Code 0. Am 03.11. blieb er so von 14:41 bis 16:04 Uhr stehen, die Bestelldaten veralteten und die Musterautomatik bestellte nicht.
- **Getestet:** `npm run -s pruefen`; Plist-Syntax mit `plutil -lint`. Auf dem Mac: Dienst per SIGTERM beendet, launchd startet ihn neu.
- **Risiken/Annahmen:** Die Ursache des SIGTERM ist ungeklaert, die Aenderung behebt nur die Folge. `kill` und `launchctl stop` halten den Dienst nicht mehr an, dafuer `launchctl unload` oder `bootout`. Die installierte Plist wird von dieser Aenderung nicht erfasst und muss einmal neu erzeugt werden.
- **Naechste Stufe:** Keine.
