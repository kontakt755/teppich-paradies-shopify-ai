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
- **Der Upload kann die Platte nicht füllen** (seit 2026-10-26, `lib/eingang.mjs`, `GRENZEN`):
  je Upload höchstens 25 Dateien und 1,5 GB, je Link-Name und Tag höchstens 30 Uploads und
  5 GB. Der Tageszähler liegt in `upload-tageszaehler.json` und übersteht einen Neustart.
  Sind auf der Platte weniger als 15 GiB frei, nimmt der Upload nichts mehr an (Antwort 507),
  damit Control Center, Datenabgleich und Sicherung weiterlaufen.
- **Upload-Links laufen nach 180 Tagen ab** (`LINK_GUELTIG_TAGE`). Links ohne Ablaufdatum
  (vor dem 26.10.2026 angelegt) gelten 180 Tage ab dem Anlegen. Das Datum steht unter
  „Social Media“ im Control Center und in `npm run social -- zugang`. Vorher einen neuen Link
  anlegen; der alte bleibt bis zu seinem Datum gültig.

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
| `zugang anlegen "Name"` | persönlichen Upload-Link für einen Bodenleger erzeugen (gilt 180 Tage) |
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
| `SOCIAL_AUTO_FREIGABE` | `1` Shop-Inhalte ohne Preisrisiko automatisch freigeben, `2` zusätzlich eigene Fotos mit Einwilligung und Sichtung (Reels laufen mit, nie Angebote). Produkt-Reels mit echtem Foto laufen ab `1` mit – der Publisher prüft ihren Preis direkt vor dem Posten live | aus |
| `SOCIAL_REEL_PYTHON` | Python mit numpy, OpenCV und Pillow für `werkzeuge/reel_zoom.py` | – (dann `uv run --script`) |
| `SOCIAL_REEL_SCHRIFT`, `SOCIAL_REEL_LOGO` | Schrift (Inter) und Logo der Produkt-Reels | `$TP_PRIVAT_DIR/social/werkzeug/inter-variable-font.woff2`, `…/logo.png` |
| `TP_SOCIAL_DIR` | abweichendes Datenverzeichnis (Tests, Probeläufe) | `$TP_PRIVAT_DIR/social` |

Die Zentrale verlangt im Netz die Zugänge des Control Centers
(`benutzer.json` bzw. Notpasswort) und verweigert sonst den Start.

## Aufbau

```
lib/       pfade · konfig · status · db            Grundlagen
           eingang · bildpruefung · pruefung       Baustellen-Eingang
           shop-quelle · produkt-auswahl           Shop-Scout
           vorlagen · rendern · werkstatt · reel   Bild-Werkstatt
           produkt-reel                            Produkt-Reels aus einem Standbild (Zoom, Preis live geprüft)
           highlights                              was in den Instagram-Highlights fehlt
           texte · planer · freigabe               Regeln
           meta · auswertung · ablauf · zugang     Veröffentlichen, Messen, Abläufe
           whatsapp                                Auffangnetz aus der Firmengruppe
scripts/   social.mjs (Kommandozeile) · server.mjs (Zentrale + Upload) · dienste-einrichten.sh
werkzeuge/ reel_zoom.py (Zoom-Reel zeichnen und die Schärfe prüfen; Python über uv)
ui/        zentrale.* · anmelden.html · upload.html
tests/     node --test, ohne Netz und ohne Browser
```

Voraussetzungen: macOS (für `sips` und launchd), Node 24 oder neuer
(`node:sqlite`), die vorhandenen devDependencies (`puppeteer`). Für Reels
zusätzlich `ffmpeg`, für Produkt-Reels `uv` (`brew install uv`; holt numpy, OpenCV
und Pillow beim ersten Lauf selbst) sowie Schrift und Logo unter
`$TP_PRIVAT_DIR/social/werkzeug/` (Inter-Variable als `inter-variable-font.woff2`,
Logo als `logo.png`, 400 px breit, transparent).
