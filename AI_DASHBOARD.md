# TP AI Steuerzentrale

Die lokale Steuerzentrale startet den vorhandenen sicheren Agenten-Zyklus: Router → Umsetzung → Tests → unabhängiger Codex-Review → Korrektur oder Human Gate.

## Start

```bash
npm run dashboard
```

Danach zeigt das Terminal die lokale Adresse und einen einmaligen Zugangscode. Die Steuerzentrale akzeptiert immer nur einen Auftrag gleichzeitig und speichert keine Prompts in der Token-/Kostenübersicht. Der Zugangscode liegt geschützt im macOS-Benutzerbereich, nicht im Repository.

## Verbindung zum Online-Shop-Dashboard

Das Online-Shop-Dashboard zeigt GitHub-Issues. Vor dem Start eines Auftrags kann optional eine offene Aufgabe ausgewählt werden. Die Steuerzentrale setzt dann ausschließlich diese eine Aufgabe auf `status:in-arbeit` und hinterlegt einen kurzen Statuskommentar.

Nach dem Lauf gilt:

- erfolgreich und unabhängig geprüft: `status:review` plus `reviewer:codex`
- Human Gate oder nicht abgeschlossener Lauf: `status:blockiert` plus `reviewer:mensch`

Die Aufgabe wird nie automatisch geschlossen. Ohne ausgewählte GitHub-Aufgabe bleibt ein Dashboard-Auftrag vollständig lokal und verändert GitHub nicht.

Für neue Probleme ist „Neue Online-Shop-Aufgabe automatisch erstellen“ voreingestellt. Die Steuerzentrale erzeugt Titel und Labels ohne zusätzlichen Modellaufruf. Eine offene Aufgabe mit exakt demselben erzeugten Titel wird wiederverwendet. Da das Repository öffentlich ist, dürfen keine Kunden- oder Zugangsdaten in solche Aufträge geschrieben werden; typische Schlüssel und E-Mail-Adressen werden zusätzlich entfernt.

## Handy-Zugriff

Standardmäßig ist die Seite nur auf diesem Mac erreichbar. Für sicheren Zugriff vom iPhone/Android aus wird später der Dashboard-Prozess ausschließlich über das private Tailscale-Netz gestartet:

```bash
npm run dashboard:install
```

Der Dienst läuft danach in einer privaten Benutzer-Sitzung und bindet sich nur an dessen Tailscale-Adresse. Nach einem Mac-Neustart denselben Startbefehl erneut ausführen. Den Zugangscode weiterhin nicht weitergeben. Tailscale muss auf Mac und Handy angemeldet sein; keine Ports im Router öffnen und keinen öffentlichen Tunnel verwenden.

## Sicherheitsgrenzen

- KI- und Shopify-Schlüssel bleiben lokal in `.env.local`.
- Das Dashboard veröffentlicht selbst nichts und umgeht keine Human Gates.
- Preis-, Produkt-, Checkout-, Live-Theme- und andere geschäftskritische Änderungen stoppen zur Freigabe.
