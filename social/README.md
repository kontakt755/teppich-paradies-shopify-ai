# social/ – Social-Media-Betrieb für Instagram und Facebook

Hält die Kanäle von Teppich Paradies aktuell: aus dem Shop und aus echten
Baustellenfotos entstehen Entwürfe, der Inhaber gibt frei, das System
veröffentlicht und misst.

| Dokument | Inhalt |
|---|---|
| [`PLAN.md`](PLAN.md) | Architektur, Entscheidungen, Phasen und Stand, offene Punkte |
| [`AGENTEN.md`](AGENTEN.md) | die sieben Rollen: Aufgabe, Input, Output, Trigger, Regeln, Fehler, Freigabe |
| [`ACCOUNT-ANALYSE.md`](ACCOUNT-ANALYSE.md) | Bestandsaufnahme der Konten, Maßnahmen, einfügefertige Texte |
| [`DESIGNSYSTEM.md`](DESIGNSYSTEM.md) | Bildsprache und Vorlagen |
| [`META-EINRICHTUNG.md`](META-EINRICHTUNG.md) | Zugang zu Instagram und Facebook einrichten |
| [`REDAKTION.md`](REDAKTION.md) | Arbeitsanweisung für die Redaktion (Claude) |
| [`WHATSAPP.md`](WHATSAPP.md) | WhatsApp-Gruppe als Auffangnetz für Baustellenfotos |

## Grenzen

- **Das Repository ist öffentlich.** Fotos, Datenbank, Zugänge und Protokolle
  liegen ausschließlich unter `$TP_PRIVAT_DIR/social` (Standard
  `~/teppich-paradies-analyse/social`). `lib/pfade.mjs` verweigert jeden Pfad
  im Repository.
- **Nichts erscheint ohne Freigabe.** Freigeben darf nur die Rolle Inhaber.
- **Kein Schreibzugriff auf Shop oder Theme** aus diesem Modul.
- **Lieferantennamen** gehören auch hier nicht in Code, Tests oder Dokumente.

## Betrieb

```
npm run social -- status              # die Übersicht
npm run social:zentrale               # Zentrale :8020 und Upload :8021 im Vordergrund
npm run social:einrichten             # als Dienste (launchd) einrichten bzw. neu laden
bash social/scripts/dienste-einrichten.sh entfernen
npm run social:test
```

Die Dienste laufen aus der Arbeitskopie, in der `social:einrichten` aufgerufen
wurde (Stand 30.09.2026: der Worktree des Branches `feature/social-media-os`).
**Vor dem Entfernen dieses Worktrees** – etwa nach dem Merge – das Skript in der
dauerhaften Arbeitskopie erneut ausführen, sonst zeigen die Dienste ins Leere.

Alle Befehle stehen im Kopf von `scripts/social.mjs`. Die wichtigsten:

| Befehl | Zweck |
|---|---|
| `lauf` | täglicher Grundlauf: Eingang prüfen, Shop abgleichen, planen, Kennzahlen |
| `takt` | alle 15 Minuten: Uploads prüfen, Fälliges veröffentlichen |
| `offen --json` | Arbeitsliste der Redaktion |
| `entwurf <inhalt>` | Beitrag rendern und in die Freigabe legen |
| `zugang anlegen "Name"` | persönlichen Upload-Link für einen Bodenleger erzeugen |
| `veroeffentlichen --trocken` | zeigen, was der Publisher täte |
| `meta-pruefen` | Meta-Zugang prüfen |
| `bild-ersetzen <medium> <datei>` | KI-bearbeitete Fassung eines Fotos einsetzen (`REDAKTION.md`, 2b) |
| `whatsapp --pruefen` | zeigen, was in der WhatsApp-Gruppe neu ist (übernimmt nichts) |
| `inhalt <id> --einwilligung` | Einwilligung vom Auftragszettel vermerken |

## Einstellungen

Umgebung, `$TP_PRIVAT_DIR/social/zugang.env` oder `.env.local` (in dieser Reihenfolge):

| Variable | Bedeutung | Standard |
|---|---|---|
| `META_PAGE_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID` | Meta-Zugang | – (dann Trockenbetrieb) |
| `META_GRAPH_VERSION` | Version der Graph API | `v24.0` |
| `TP_SOCIAL_HOST` / `TP_SOCIAL_PORT` | Zentrale | `127.0.0.1` / `8020` |
| `TP_SOCIAL_UPLOAD_HOST` / `TP_SOCIAL_UPLOAD_PORT` | Upload | `127.0.0.1` / `8021` |
| `TP_DASHBOARD_EXTRA_HOSTS` | zusätzliche Hostnamen (Tailscale) | – |
| `SOCIAL_UPLOAD_BASIS_URL` | Adresse, die `zugang anlegen` in den Link schreibt | Platzhalter |
| `SOCIAL_WHATSAPP_GRUPPE` | Name der Firmengruppe, deren Fotos übernommen werden (`WHATSAPP.md`) | – (aus) |
| `SOCIAL_WHATSAPP_DIR` | Datenordner der WhatsApp-Mac-App | `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared` |
| `SOCIAL_AUTO_FREIGABE` | `1` Shop-Inhalte ohne Preisrisiko automatisch freigeben, `2` zusätzlich eigene Fotos mit Einwilligung und Sichtung (Reels laufen mit, nie Angebote) | aus |
| `TP_SOCIAL_DIR` | abweichendes Datenverzeichnis (Tests, Probeläufe) | `$TP_PRIVAT_DIR/social` |

Die Zentrale verlangt im Netz die Zugänge des Control Centers
(`benutzer.json` bzw. Notpasswort) und verweigert sonst den Start.

## Aufbau

```
lib/       pfade · konfig · status · db            Grundlagen
           eingang · bildpruefung · pruefung       Baustellen-Eingang
           shop-quelle · produkt-auswahl           Shop-Scout
           vorlagen · rendern · werkstatt · reel   Bild-Werkstatt
           texte · planer · freigabe               Regeln
           meta · auswertung · ablauf · zugang     Veröffentlichen, Messen, Abläufe
           whatsapp                                Auffangnetz aus der Firmengruppe
scripts/   social.mjs (Kommandozeile) · server.mjs (Zentrale + Upload) · dienste-einrichten.sh
ui/        zentrale.* · anmelden.html · upload.html
tests/     node --test, ohne Netz und ohne Browser
```

Voraussetzungen: macOS (für `sips` und launchd), Node 24 oder neuer
(`node:sqlite`), die vorhandenen devDependencies (`puppeteer`). Für Reels
zusätzlich `ffmpeg`.
