---
name: handoff
description: Uebergabetext fuer eine neue Sitzung erzeugen (npm run -s handoff), um "Was als Naechstes" und offene Entscheidungen ergaenzen, als einen kopierbaren Block ausgeben. Verwenden bei "Uebergabe", "handoff", "Prompt fuer neuen Chat", "neuer Chat", wenn der Kontext voll wird (Auto-Compact greift bei 50 %) - und von sich aus anbieten, bevor es so weit ist. Uebergaben an Codex laufen nur auf ausdruecklichen Auftrag ueber den Vault (Zusammenarbeit/).
---

# Uebergabe an eine neue Sitzung

Eine neue Sitzung kostet die Grundlast einmal, eine lange alte Sitzung in
jeder Runde (Kopf von `scripts/handoff.mjs`). Auto-Compact greift bei 50 %
(`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` in `~/.claude/settings.json`) und fasst dann
ungefragt zusammen - was dabei verloren geht, weiss danach niemand.

## Wann

- Der Benutzer sagt „Uebergabe“, „handoff“, „Prompt fuer neuen Chat“ o. ae.
- **Von sich aus anbieten**, in einem Satz: sobald der Kontext sich der Grenze
  naehert oder ein Teilziel erreicht ist und der Rest eine frische Sitzung
  lohnt - vor dem Auto-Compact, nicht danach.
- `ki:frag` endet mit Exit 3 oder das eigene Limit naht: Stand sichern und
  Uebergabe (`AGENTS.md`, „Zusammenarbeit Claude und Codex“).

## Ablauf

1. **Stand sichern.** Uncommittete Arbeit moeglichst als Zwischenstand auf den
   Branch committen und pushen - Zwischenstaende gehoeren auf einen Branch,
   nicht in Working Tree oder Stash (`AGENTS.md`, „Arbeitskopien“). Vorher
   `npm run -s pruefen`, Dateien einzeln stagen, nie `git add -A`. Was nicht
   committet wird, steht im Text unter „Nicht committet“; die neue Sitzung
   muss dann in derselben Arbeitskopie weitermachen.
2. **Text erzeugen**, in der aktuellen Arbeitskopie (nicht im Hauptcheckout):
   ```
   npm run -s handoff                  # Issue aus dem Branchnamen (2-5 Ziffern zwischen / _ -)
   npm run -s handoff -- --issue <n>   # Issue ausdruecklich angeben
   ```
   Das Skript liest nur Git: Arbeitskopie, Branch gegen `origin/main`, eigene
   Commits (bis 15), nicht committete Dateien (bis 20) und den Startbefehl -
   mit Issue `gh issue view <n> --comments | tail -30`. Einen PR kennt es nicht.
3. **Ergaenzen.** Die beiden Platzhalter ersetzen, den Rest stehen lassen:
   - `Was als Naechstes:` ein konkreter Satz (Datei, Befehl, Abnahme).
   - `Offene Entscheidungen:` was der Benutzer oder Inhaber entscheiden muss,
     sonst „keine“.
   - Gibt es einen PR: Nummer und Stand (`gh pr view --json number,state,url`).
     Gelaufene Tests mit Ergebnis; was ungetestet ist, ausdruecklich so nennen.
4. **Ausgeben** als genau ein kopierbarer Block (```` ```text ````), davor
   hoechstens ein Satz. Keine Secrets, Zugangsdaten oder Kundendaten.
5. Gibt es ein Issue, denselben Stand kurz als Notiz anhaengen:
   `npm run task -- comment <n> --note "…"` - das ist die Uebergabe ueber
   Rechner hinweg (Skill `control-center`). Issues sind oeffentlich: Lieferanten
   nur als Pseudonym (`AGENTS.md` Punkt 8).

## Uebergabe an Codex

Nur auf ausdruecklichen Auftrag: `Zusammenarbeit/Start.md` im Gedaechtnis-Vault
lesen, je Uebergabe eine Datei unter `Zusammenarbeit/Aufgaben/` nach der Vorlage
dort, genau ein `zustaendig`. Pflichtinhalt: `AGENTS.md`, „Gedaechtnis,
Uebergaben und Review“. Eine kurze Rueckfrage braucht keine Uebergabe:
`npm run -s ki:frag` (Skill `codex`).
