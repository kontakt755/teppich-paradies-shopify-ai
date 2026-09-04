# Gemeinsamer Claude-/Codex-Router

Ein LOW-/MEDIUM-Routerauftrag erzeugt zuerst einen kurzen, gemessenen Hand-off. Mit vorhandenem `GEMINI_API_KEY` wird Gemini Flash-Lite zuerst verwendet; bei fehlendem Key oder Fehler folgt OpenRouter. Es wird niemals parallel mehrfach gefragt. HIGH-Risk-Anfragen werden gestoppt und weder an einen externen Brief-Provider noch an den unbeaufsichtigten Claude-/Codex-Zyklus übergeben.

## Automatischer Hook

Der projektweite `UserPromptSubmit`-Hook in `.claude/settings.json` gilt für Claude Code im Terminal und in der Desktop-App. Du beschreibst deine Aufgabe normal. Bei substanziellen Analyse-, Fehler-, Implementierungs- oder Review-Aufträgen ergänzt der Hook automatisch eine kompakte Voranalyse und verpflichtet Claude zu diesem Ablauf:

1. untersuchen und minimal implementieren
2. passende Tests ausführen
3. Fehler korrigieren und erneut testen
4. beim Abschluss automatisch den Stop-Hook mit unabhängiger Codex-Prüfung ausführen lassen
5. P1-/P2-Befunde korrigieren und höchstens drei Review-Runden durchlaufen
6. erst bei `PASS` oder einem echten Human Gate stoppen

Der Stop-Hook übergibt Codex die lokale Auftragsdatei, nicht deinen Chatverlauf. Bei Befunden blockiert er Claudes ersten Abschlussversuch und gibt die strukturierten Befunde direkt an dieselbe Claude-Sitzung zurück. Manuelles Kopieren ist nicht erforderlich. `npm run agents:review -- --task-file <datei>` bleibt als manueller Diagnosebefehl verfügbar.

Kurze Folgefragen und Slash-Befehle laufen ohne Router-Umweg. Übertragen wird nur der aktuelle Aufgabentext, nicht der Chatverlauf oder Repository-Dateien. Ein Brief-Provider-Ausfall blockiert Claude nicht.

```sh
npm run claude:route -- --task "Beschreibe deine konkrete Aufgabe"
```

Mit `--delegate` wird der erzeugte Hand-off direkt an die lokal installierte Claude-Code-CLI übergeben:

```sh
npm run claude:route -- --task "Repariere den klar beschriebenen LOW-Risk-CSS-Fehler" --delegate
```

Für einen vollständigen unbeaufsichtigten Durchlauf im Terminal genügt ein Auftrag:

```sh
npm run agents:loop -- --task "Repariere den beschriebenen Fehler vollständig und teste die Änderung"
```

Claude implementiert, Codex prüft read-only, Claude korrigiert und Codex prüft erneut. Vor dem Start wird die Claude-Code-Pro-Anmeldung ohne `ANTHROPIC_API_KEY` geprüft. Pro wird immer zuerst verwendet. Ausschließlich bei einem erkannten Nutzungs-, Quota- oder Ratenlimit wird derselbe Auftrag mit `ANTHROPIC_FALLBACK_API_KEY` neu gestartet. Bei fehlender Pro-Anmeldung stoppt der Router ohne API-Ausgabe und fordert `claude auth login` an. Der Ablauf ist auf drei Review-Runden und standardmäßig 1 USD Claude-API-Budget pro Worker-Aufruf begrenzt. HIGH-Risk-Aufträge enden vor dem ersten Modellaufruf am Human Gate.

Wichtig: In der normalen Claude-Desktop-Sitzung überschreibt ein gesetztes `ANTHROPIC_API_KEY` das Abo vollständig. Die automatische Abo→API-Umschaltung gilt deshalb für `npm run agents:loop`; ein bereits offener Desktop-Chat kann seine Authentifizierung nicht mitten in einer Antwort wechseln. Ein Worker ist zusätzlich standardmäßig auf 12 Agentenschritte begrenzt, damit eine fehlerhafte Schleife nicht unnötig Budget oder Zeit bindet.

Die Skripte lesen `.env.local` selbst. API-Keys werden nie in Ausgabe, Git oder dem Nutzungsledger gespeichert. Gemessene Provider-Tokens und Kosten stehen in `.router/ai-usage.jsonl`:

```sh
npm run ai:usage
```

## Was der Router nicht behauptet

Der Claude-Desktop-Hook ersetzt den ursprünglichen Prompt nicht; die Voranalyse verbessert Vollständigkeit und reduziert Wiederholungsrunden, spart aber nicht automatisch die Eingangstokens dieses einzelnen Claude-Aufrufs. Messbar sind Provider-Tokens, Kosten, Review-Runden und das Ergebnis. Eine echte Ersparnis entsteht, wenn dadurch manuelle Rückfragen und erneute lange Prompts entfallen.
