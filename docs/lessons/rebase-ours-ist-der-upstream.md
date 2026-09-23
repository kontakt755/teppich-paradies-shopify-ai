# Beim Rebase ist `--ours` der Server, nicht die eigene Arbeit

**Regel:** Wer in einem Rebase einen Konflikt zugunsten der *eigenen*, gerade
wiedergespielten Fassung aufloest, nimmt `--theirs`. `--ours` nimmt den
Upstream. Beim Merge ist es genau umgekehrt.

## Warum die Benennung dreht

Ein Rebase spielt die eigenen Commits **auf** den Upstream. Waehrend des
Replays ist `origin/main` das Ziel, auf das aufgesetzt wird — aus Git-Sicht die
aktuell ausgecheckte Seite, also `ours`. Der eigene Commit ist der, der
aufgespielt wird — `theirs`. Ein Merge sieht es umgekehrt: dort ist der eigene
Branch `ours` und der hereingezogene `theirs`.

Der Satz, der im Kopf bleiben soll: **wer rebased, ist Gast auf fremdem Boden.**

## Der Vorfall

`.github/workflows/dashboard-data.yml` erzeugt `issues.json` und
`bodenwissen.json` und committet sie nach `main`. Landet zwischen Checkout und
Push ein fremder Commit, wird der Push abgelehnt; der Workflow rebased und
loeste den Konflikt auf:

```
git checkout --ours -- docs/ai-dashboard/issues.json
```

Der Kommentar daneben behauptete „bei Konflikt gewinnt immer unsere neue
Version". Tatsaechlich gewann die aeltere Fassung vom Server, und die im selben
Lauf frisch erzeugte Datei war weg.

## Der Beleg

Wegwerf-Repo, Szenario eins zu eins: Ausgangsstand auf `main`, der Bot erzeugt
`issues.json` neu und committet, parallel aendert ein fremder Commit dieselbe
Datei auf `origin/main`, Push wird abgelehnt, Rebase, Konflikt, Aufloesung.

| Aufloesung | Was danach auf `origin/main` steht |
|---|---|
| `git checkout --ours` | `{"stand":"FREMD-VOM-SERVER"}` — unsere Daten verworfen |
| `git checkout --theirs` | `{"stand":"UNSERE-FRISCHEN-DATEN"}` — wie beabsichtigt |

## Warum es lange nicht auffiel

Der Schaden ist klein und selbstheilend: die Datei ist generiert, der naechste
Lauf — spaetestens der 30-Minuten-Cron — schreibt sie neu. Bis dahin steht ein
veralteter Stand auf `main`. Genau deshalb faellt so ein Fehler nicht durch
Symptome auf, sondern nur beim Lesen — und ein falscher Kommentar daneben haelt
ihn am Leben.

## Was daraus folgt

Ein Kommentar, der eine Git-Semantik behauptet, ist keine Pruefung. Wo eine
Aufloesungsrichtung wichtig ist, gehoert sie in einen Test:
`docs/ai-dashboard/tests/dashboard-workflow.test.mjs` liest die Workflow-Datei
und besteht nur, solange die Bot-Dateien mit `--theirs` aufgeloest werden.
