# 00 – Masterplan: TP Operations V3

Stand: 2026-09-22 · Phase 1 (Analyse) abgeschlossen, Phase 2 (Architektur) festgelegt, Phase 3 (Umsetzung) nicht begonnen.
Grundsatz: **Hinten komplex, vorne extrem einfach.** Ein normaler Auftrag soll intern nur Sekunden Pruefzeit kosten.

Lieferanten werden in diesem Ordner ausschliesslich als **Lieferant A–D** gefuehrt (Regel 8, `CLAUDE.md`). Theme-IDs stehen nur in `domains/shopify/live-theme.json`.

## Was dieser Audit ist – und was nicht

- Er deckt die **Betriebsebene** ab: Auftraege, Beratung, Einkauf, Muster, Versand, Probleme, Rollen, Datenmodell, Shopify-Anbindung, Ads-Readiness.
- Er **doppelt nicht** den laufenden Frontend-Audit unter `audit/` (Preis-/Rechner-/Cart-/Varianten-/Runtime-Logik des Themes, 31 Sessions, 17 Issues). Dessen offene Bereiche (SEO, Performance, UX, Mobile) bleiben dort.
- Der Masterprompt V3 bricht bei Abschnitt 60 („EINKAUFSSTATUS … TEIL") ab. Alles ab Abschnitt 60 (Einkaufsstatus-Werte, Wareneingang, Versand, Probleme, Reklamationen, Auswertungen) ist aus dem Kontext abgeleitet und in `12-OPEN-ITEMS.md` als **Klaerungsbedarf** markiert.

## Kernbefund in fuenf Saetzen

1. Es gibt **keinen einzigen Codepfad, der Bestellungen liest**. Alles Bestehende schreibt Produktdaten in Richtung Shopify hinein (`08-SHOPIFY-INTEGRATION.md`).
2. Das Control Center (`docs/ai-dashboard/`) ist ein GitHub-Issue-Board ohne Datenbank, ohne Rollen, ohne Shopify-Bezug – bewusst, weil das Repository **oeffentlich** ist (`01-CURRENT-ARCHITECTURE.md`).
3. Das Lieferanten-Datenmodell existiert in **drei Generationen nebeneinander**: `grosshandel.sku` (Freitext, alt, im Einsatz), `lieferant.*` (2026-09-12, 943 Varianten) und `service.*`/`einkauf.*` (geplant, nicht angelegt). Bei Rollenware sind die `lieferant.*`-Felder leer, bei Fliesen tragen sie nur die eigene SKU (`02-DATA-MODEL.md`).
4. Die interne Bestellmail mit Grosshaendler-ID und Masspruefung ist fertig getestet, aber **noch nicht im Admin eingesetzt** (`10-FULFILLMENT.md`).
5. Google Ads ist blockiert durch 225/225 Feedprodukte `awaiting_review`, fehlende Versandrichtlinie (404) und fehlende Conversion-Aktionen; der Shop hatte in 90 Tagen 0 echte Kaeufe, alle 9 Bestellungen sind Tests (`11-ADS-READINESS.md`).

## Zielarchitektur (Kurzfassung, Details in 05-DECISIONS.md)

```
Shopify (Orders, Customers, Products, Fulfillment)   ← bleibt Quelle der Wahrheit
        │  Admin GraphQL (shpat_, read_orders/write_orders)   ← Blocker #34
        ▼
operations/  (neues Node-Modul, lokal / privater Host, nie GitHub Pages)
  ├─ sync: Bestellungen abrufen (Polling, spaeter Webhook)
  ├─ resolve: Position → procurement_item → Lieferant, Art.-Nr., Farbnr., Menge, Route
  ├─ state: Auftragsstatus als Order-Metafelder + Tags (in Shopify sichtbar)
  ├─ api: /api/ops/*  (hinter Rollenpruefung)
  └─ ui:  AUFTRAEGE · BERATUNG · EINKAUF · MUSTER · VERSAND · PROBLEME
        ▲
docs/ai-dashboard (Control Center)  ← bekommt nur den Einstieg, keine Kundendaten
```

Stammdaten der Beschaffung (`procurement_item`) leben als **Varianten-Metafelder im Namespace `einkauf`** plus Metaobjekt `tp_lieferant` – nicht in einer zweiten Datenbank. Betriebszustand je Auftrag lebt als **Order-Metafelder/-Tags**. Lokale Persistenz nur fuer Protokolle und Cache (gitignored, Muster `.router/`).

## Phasen

| Phase | Inhalt | Gate |
|---|---|---|
| 1 Analyse | dieses Dokumentenpaket | erledigt |
| 2 Architektur | Entscheidungen D1–D12 in `05-DECISIONS.md` | Inhaber-Freigabe fuer D3 (Token), D9 (Beratungspflichtfeld), D11 (Rollenmodell) |
| 3a Fundament | Order-Leseweg, `procurement_item`, Produktampel, Bestellmail einsetzen | Token #34 |
| 3b Auftragsband | AUFTRAEGE-Ansicht, FREIGEBEN/SPAETER/PROBLEM, Keyboard-Mode, Suche | 3a |
| 3c Beratung + Muster | Pflichtfeld im Cart, BERATUNG-Kachel, Muster-Routen | D9 |
| 3d Einkauf | Gruppierung je Lieferant, Mengenumrechnung, Einkaufsbestellung als Vorschau, manuelles Senden | 3b |
| 3e Versand + Probleme | Routen, Teilversand, Tracking-Rueckfluss | 3d |
| 4 Ads-Start | Merchant-Center-Blocker abarbeiten | 3a–3c stabil |

## Arbeitsregeln fuer die Umsetzung

- Nicht neu bauen, was existiert: GraphQL-Client `workflow/graphql-proxy.mjs`, Aufgabenmodell `docs/ai-dashboard/lib/model.mjs` (nur fuer Aufgaben, **nicht** fuer Auftraege), Mengenlogik aus den Theme-Rechnern (`02-DATA-MODEL.md` §4), Bestellmail-Block.
- Ein Writer je Datei; Reviewer parallel. Parallele Schreibzugriffe auf `docs/ai-dashboard/app.js`, `scripts/dashboard-api.mjs`, `workflow/graphql-proxy.mjs` sind verboten.
- Keine kostenpflichtige App, kein Shopify Flow, solange Polling + Metafelder reichen (`05-DECISIONS.md` D5).
- Kundendaten nie unter `docs/`, nie in Issues, nie in `issues.json`.
