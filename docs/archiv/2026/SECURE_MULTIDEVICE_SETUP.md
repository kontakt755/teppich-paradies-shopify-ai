# Sicheres Multi-Device-Setup

## Grundsatz

API-Schlüssel gehören nie in Quellcode, Markdown, Shell-History, Commits oder Chat-Ausgaben. Verwende ausschließlich einen Secret Manager oder eine lokale, gitignorierte Umgebungsdatei.

## Lokale Konfiguration

1. Lege den Schlüssel lokal außerhalb versionierter Dateien ab.
2. Stelle ihn nur dem Prozess bereit, der den API-Adapter ausführt.
3. Prüfe die Existenz mit `./api_cost_check.sh`; das Script zeigt keinen Schlüsselwert an.
4. Setze getrennte Schlüssel und Spend-Limits pro Umgebung.

## Python

```python
import os

api_key = os.environ["ANTHROPIC_API_KEY"]
```

Der Code darf keinen Fallback-Schlüssel, keinen Beispielwert mit key-ähnlichem Inhalt und keine Ausgabe des Werts enthalten.

## Gerätewechsel und Rotation

- Bei Verlust eines Geräts den betroffenen Schlüssel im Provider-Console-Portal widerrufen und neu ausstellen.
- Alte Schlüssel aus lokalen Umgebungen und Secret Stores entfernen.
- Keine Schlüssel zwischen Geräten kopieren oder per Messenger weitergeben.
- Nach der Rotation den Preflight und einen begrenzten Staging-Test ausführen.

## Repository-Schutz

- `.env*` bleibt ignoriert.
- Vor jedem Push den Secret-Scan ausführen.
- Ein Scan-Fund wird zuerst entfernt oder rotiert; niemals durch eine Ausnahmeregel unterdrücken.
