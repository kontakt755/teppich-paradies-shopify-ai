# Claude-Code-Router

Ein LOW-/MEDIUM-Routerauftrag erzeugt zuerst einen kurzen, gemessenen OpenRouter-Hand-off. HIGH-Risk-Anfragen werden gestoppt und weder an OpenRouter noch an Claude Code übergeben.

## Automatischer Hook

Der projektweite `UserPromptSubmit`-Hook in `.claude/settings.json` gilt für Claude Code im Terminal und in der Desktop-App. Du beschreibst deine Aufgabe normal. Bei substanziellen Analyse-, Fehler-, Implementierungs- oder Review-Aufträgen ergänzt der Hook automatisch eine kompakte OpenRouter-Voranalyse. Kurze Folgefragen und Slash-Befehle laufen ohne OpenRouter-Umweg. Übertragen wird nur der aktuelle Aufgabentext, nicht der Chatverlauf oder Repository-Dateien. Ein Hook-Ausfall blockiert Claude nicht.

```sh
npm run claude:route -- --task "Beschreibe deine konkrete Aufgabe"
```

Mit `--delegate` wird der erzeugte Hand-off anschließend direkt an die lokal installierte Claude-Code-CLI übergeben. Verwende dies nur für einen konkreten Auftrag, dessen Änderungen Claude Code ausführen darf:

```sh
npm run claude:route -- --task "Repariere den klar beschriebenen LOW-Risk-CSS-Fehler" --delegate
```

Die Skripte lesen `.env.local` selbst. Der API-Key wird nie in Ausgabe, Git oder dem Nutzungsledger gespeichert. Messwerte stehen in `.router/openrouter-usage.jsonl`:

```sh
npm run openrouter:usage
```
