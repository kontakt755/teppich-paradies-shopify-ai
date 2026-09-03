# Claude-Code-Router

Ein LOW-/MEDIUM-Routerauftrag erzeugt zuerst einen kurzen, gemessenen OpenRouter-Hand-off. HIGH-Risk-Anfragen werden gestoppt und weder an OpenRouter noch an Claude Code übergeben.

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
