# Automation Control Center · Stufe 1

Lokale, read-only Statusoberfläche für den vorhandenen Workflow.

```bash
npm run control:center
```

Danach `http://127.0.0.1:4177` öffnen. Ein anderer Port kann ausschließlich über `CONTROL_CENTER_PORT` gesetzt werden.

## Sicherheitsgrenzen

- Bindet nur an `127.0.0.1`.
- Akzeptiert nur `GET` und `HEAD`.
- Liest ausschließlich fest definierte Workflow-, QA-, Evidence- und Preview-Pfade innerhalb des Repository-Roots.
- Führt keine Eingaben als Shell-Befehl aus.
- Redigiert geheimnisähnliche JSON-Felder defensiv.
- Startet keine Agenten- oder Kosten-API, schreibt nicht nach Shopify und speichert keine Freigabe.
- Fehlende Daten werden als `UNKNOWN` beziehungsweise `NOT LOADED` gezeigt.
