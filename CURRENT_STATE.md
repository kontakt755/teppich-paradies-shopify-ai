# Current State

Diese Datei speichert absichtlich keinen Branch, Commit, PASS-Status oder Human Approval. Solche Angaben veralten und dürfen keine Aktion autorisieren.

Verbindlichen aktuellen Zustand mit `npm run workflow:state` aus Git und commitgebundener Runtime-Evidence ermitteln. Die maschinenlesbare Ausgabe liegt nur lokal und unversioniert unter `.workflow/state.json` und setzt `READY FOR LIVE` immer auf `NEIN`. Diese Datei nicht als laufendes Statusprotokoll manuell fortschreiben.

Wenn die Ermittlung fehlt, veraltet ist oder `STOP_REVIEW` meldet: keine automatische Aktion; menschliche Prüfung erforderlich.
