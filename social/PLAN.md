# Social-Media-Betriebssystem – technischer Plan

Stand: 30.09.2026 · Modul `social/` · Branch `feature/social-media-os`

Ziel: Instagram und Facebook von Teppich Paradies bleiben dauerhaft aktuell,
gespeist aus dem Shop und aus echten Baustellenfotos der Bodenleger. Der
Inhaber sieht eine Übersicht und gibt frei – mehr nicht.

## 1. Was schon da war und weiterverwendet wird

| Vorhanden | Verwendung |
|---|---|
| Control Center auf dem Mac mini, über Tailscale erreichbar, mit Zugängen und Rollen | dieselben Zugänge gelten für die Social-Zentrale; derselbe Rechner trägt die Dienste |
| Privatverzeichnis `$TP_PRIVAT_DIR` samt täglicher Sicherung | Datenbank, Fotos und Zugänge liegen dort, nie im (öffentlichen) Repository |
| Produktlexikon und Shop-Kennzahlen (zweimal täglich erneuert) | Quadratmeterpreise und Musterbestellungen für den Shop-Scout |
| Referenzgalerie „Unsere Arbeit" (14 Projekte, Metaobjekt `tp_projekt`) | als Startvorrat übernommen – echte Arbeiten, sofort verwendbar |
| Konzept „Baustellenfotos für Instagram" samt Einwilligungsregel | Grundsätze übernommen: ohne Zustimmung kein Eintrag, Auftrag/Bodenname optional |
| `puppeteer` (QA-Screenshots), macOS `sips` | Rendern der Vorlagen bzw. Bildprüfung – keine neue Abhängigkeit |
| Geplante Aufgaben in Claude Desktop | die Redaktion läuft dort, ohne zusätzliche API-Kosten |
| Farbwelt und Schrift des Shops (`--tp-*`, Inter) | Grundlage des Designsystems |

Neu eingeführt wurde **nichts Kostenpflichtiges**: kein Planungswerkzeug, kein
Canva, kein n8n/Make, kein Cloud-Speicher. Die Meta Graph API ist kostenlos.

## 2. Architektur

```
                         Mac mini (Betriebsrechner)
 ┌───────────────────────────────────────────────────────────────────────┐
 │  social-Dienst (launchd)                                              │
 │   ├─ Zentrale :8020  ── Inhaber: Übersicht · Freigabe · Plan · Vorrat │
 │   └─ Upload   :8021  ── Bodenleger: persönlicher Link, nur Annahme    │
 │  social-takt  (alle 15 min)  Uploads prüfen · Fälliges veröffentlichen│
 │  social-lauf  (täglich 6:40) Shop abgleichen · planen · Kennzahlen    │
 │  Redaktion    (Claude, werktags)  sichten · schreiben · Entwürfe      │
 │                                                                       │
 │  $TP_PRIVAT_DIR/social/   social.db · medien/ · zugang.env · Logs     │
 └───────────────────────────────────────────────────────────────────────┘
        ▲ Tailscale / Firmennetz            │ HTTPS
        │                                   ▼
   Handy Inhaber, Monteure        Shop-Feed · Meta Graph API
```

Entscheidungen und ihre Gründe:

- **Eigenes Modul, eigener Dienst** statt Einbau ins Control Center: das läuft
  auf einem eigenen Betriebszweig und zeigt Kundendaten. Ein Fehler im
  Social-Teil darf es nicht treffen; die Anmeldung wird trotzdem geteilt.
- **SQLite über `node:sqlite`**: eine Datei, in Node eingebaut. Der Grundlauf
  schreibt täglich einen stimmigen Abzug (`sicherung.db`), den die bestehende
  Betriebssicherung mitnimmt. Die Fotos selbst sind dafür zu groß – sie liegen
  nur auf dem Betriebsrechner. Kein Datenbankdienst.
- **Shop über den öffentlichen Produktfeed** statt Admin-Token: enthält alles
  Nötige, nichts Privates, und läuft ohne Zugangsdaten als einfacher Dienst.
  Webhooks (Produkt angelegt/geändert) sind die spätere Ergänzung, sobald ein
  öffentlich erreichbarer Endpunkt feststeht – der tägliche Abgleich findet
  dieselben Anlässe höchstens einen Tag später.
- **Programme, wo Regeln reichen – Claude, wo Urteil nötig ist.** Prüfen,
  Auswählen, Planen, Rendern, Veröffentlichen und Messen sind deterministisch
  und getestet. Bilder beurteilen und Texte schreiben macht die Redaktion.
- **Instagram-Bilder über die Facebook-Seite**: jedes Bild wird erst als
  unveröffentlichtes Seitenfoto abgelegt, Instagram bekommt dessen Adresse.
  Damit braucht die Veröffentlichung keinen eigenen öffentlichen Server.

## 3. Der Upload-Weg der Bodenleger

Gewählt: **eine eigene, sehr einfache Upload-Seite mit persönlichem Link**
(auf dem Handy als Symbol auf dem Startbildschirm).

| Weg | Warum nicht |
|---|---|
| WhatsApp | Bilder werden stark verkleinert; die Business-API braucht Meta-Verifizierung, einen öffentlichen Webhook und kostet je Gespräch; Zuordnung von Ort, Boden und Einwilligung bliebe Handarbeit |
| Telegram, Slack | zusätzliche App auf jedem Privathandy |
| Google Drive, Dropbox | kein Platz für Angaben und Einwilligung, Fotos von Kundenwohnungen bei einem Dritten, Zuordnung von Hand |
| E-Mail | Anhänge begrenzt, Angaben im Freitext, keine Rückmeldung |

Die eigene Seite: Fotos wählen, vier Gruppen zum Antippen, ein Häkchen, senden.
Originalqualität, Videos bis 400 MB, Wiederholung bei schlechtem Netz,
sofortige Rückmeldung. Kein Konto, kein Passwort – geht ein Handy verloren,
wird genau dieser eine Link gesperrt.

**Auffangnetz WhatsApp** (Entscheidung 30.09.2026): was trotzdem nur in der
Firmengruppe landet, übernimmt der Takt aus der WhatsApp-App auf dem
Betriebsrechner – ohne Einwilligung, die bestätigt der Inhaber in der Zentrale
(`WHATSAPP.md`).

**Erreichbarkeit** (Entscheidung 30.09.2026: Funnel nur für den Upload-Port): im Laden-WLAN
und über Tailscale funktioniert der Link sofort. Für Handys ohne Tailscale
stellt `tailscale funnel` ausschließlich den Upload-Port (8021) öffentlich
bereit – mit HTTPS, ohne Domain- oder DNS-Änderung. Die Zentrale und das
Control Center bleiben privat.

## 4. Datenmodell

`inhalt` (Material) → `medium` (Bilder, Videos) → `beitrag` (Veröffentlichung) → `kennzahl`.

| Feld aus dem Auftrag | Ablage |
|---|---|
| Datum, Quelle, Baustelle oder Produkt | `inhalt.erstellt`, `.quelle`, `.titel`, `.produkt_handle` |
| Bilder, Videos | `medium` (Pfad oder Shop-Adresse, Maße, Schärfe, Helligkeit, Hash, Prüf- und Datenschutzurteil, Rolle vorher/nachher) |
| Ort, Produkt, Bodenart | `inhalt.ort`, `.produkt_titel`, `.bodenart`, `.raum`, `.taetigkeit` |
| Status | `inhalt.status` (NEU → IN_PRUEFUNG → CONTENT_ERSTELLT) und `beitrag.status` (FREIGABE → GEPLANT → VEROEFFENTLICHT → ARCHIV; daneben VERWORFEN, FEHLER) |
| Instagram, Facebook, Story, Reel | `beitrag.plattformen`, `.format` |
| Veröffentlichungsdatum, verwendeter Text | `beitrag.veroeffentlicht_am`, `.text`, `.hashtags`, `.ergebnis` (IDs, Links) |
| Performance | `kennzahl` je Beitrag und Plattform, `lernstand.json` |
| Wiederverwendbar? bereits veröffentlicht? | `inhalt.wiederverwendbar`; `produkt_stand.zuletzt_beworben`; Archiv → IN_PRUEFUNG ist ein erlaubter Statuswechsel |

## 5. Phasen und Stand

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Accounts analysieren und verbessern | **Analyse fertig** (`ACCOUNT-ANALYSE.md`). Änderungen am Konto brauchen die Anmeldung des Inhabers; Texte und Links liegen einfügefertig bereit. |
| 2 | Content-Datenbank | **fertig**, in Betrieb. |
| 3 | Shopify-Schnittstelle | **fertig**: Shop-Scout liest 534 Produkte, bildet Familien, legt den Vorrat an. Offen: Webhooks. |
| 4 | Monteur-Upload | **fertig und mit echten Dateien geprüft** (JPG, HEIC, Dublette, unscharf). Offen: Erreichbarkeit von unterwegs, Links für die Monteure. |
| 5 | Content-Agenten | **fertig**: Eingang, Shop-Scout, Werkstatt mit sieben Vorlagen, Planer, Textregeln. Redaktion als Arbeitsanweisung vorbereitet; der erste Schwung (9 Beiträge, 3 Storys) liegt in der Freigabe. Reel-Schnitt mit ffmpeg gegen echte Fotos geprüft (`entwurf <id> --format reel`). |
| 6 | Freigabesystem | **fertig**: Zentrale mit Freigeben, Bearbeiten, Verwerfen, Sperren und Hinweisen. |
| 7 | Meta-Veröffentlichung | **gebaut, gegen einen Meta-Nachbau getestet und unabhängig gegengelesen** (Doppelpost, Prüfung beim Veröffentlichen, Upload-Härtung – 15 Befunde, alle behoben und mit Tests belegt). Reels gehen per direktem Upload zu Instagram, ohne öffentliche Videoadresse. Wartet auf den Zugang (`META-EINRICHTUNG.md`); der erste echte Beitrag sollte beobachtet werden. |
| 8 | Analytics und Optimierung | **gebaut**: Messwerte, Punkte, Lernstand, Rückkopplung in den Planer. Füllt sich mit den ersten veröffentlichten Beiträgen. |

## 6. Offene Entscheidungen des Inhabers

1. **Meta-Zugang einrichten** – ohne ihn veröffentlicht nichts (rund 20 Minuten, `META-EINRICHTUNG.md`).
2. **Upload von unterwegs**: entschieden – Upload-Link als Abgabe über Funnel (Port 8443 → 8021), dazu die WhatsApp-Gruppe als Auffangnetz. Offen: Funnel in der Tailscale-Verwaltung freischalten, Festplattenvollzugriff für node, Gruppenname in `zugang.env`.
3. **Einwilligung auf dem Auftragszettel**: eine Zeile zum Ankreuzen („Fotos der fertigen Arbeit dürfen für Website und Social Media verwendet werden"). Das System verlangt das Häkchen – der Zettel ist der Beleg dahinter.
4. ~~Redaktion einschalten und ffmpeg installieren~~ – erledigt am 30.09.2026 (Redaktion werktags gegen 8 Uhr).
5. **Automatische Freigabe**: frühestens nach vier Wochen Betrieb und nur für Shop-Inhalte ohne Preis.

## 7. Nicht gebaut – bewusst

- Kein automatisches Beantworten von Kommentaren und Nachrichten: das ist Kundenkontakt und bleibt beim Menschen. Die Auswertung zählt sie.
- Keine KI-erzeugten Bilder. Alles, was erscheint, ist ein Foto des Betriebs oder des Herstellers.
- Keine Musik in Reels über die API (Lizenzfrage; Instagram bietet sie nur in der App).
