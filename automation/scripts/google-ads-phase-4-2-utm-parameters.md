# Google Ads Phase 4.2 – UTM Parameter Strategie
## Tracking-Konsistenz über alle Kampagnen

**Issue:** #53
**Status:** In Development
**Priority:** P2
**Date:** 2026-09-03
**Depends On:** Phase 2.1–2.3 (#46–#48) Kampagnen, Phase 4.1 (#52) Conversion Tracking

---

## Ziel

Issue #53 verlangt eine **dokumentierte, konsistente UTM-Parameter-Strategie**
für alle drei Search-Kampagnen, damit GA4-Segmente und Dashboard-Filter
zuverlässig nach Kampagne/Anzeigengruppe/Keyword auswerten können. Bisher
lagen UTM-Werte nur verstreut in den Phase-2-Guides (`utm_source=google`,
`utm_medium=cpc`) – dieses Dokument ist die einzige Quelle der Wahrheit.

**Hinweis zur vorherigen Fehlzuordnung:** Für Issue #53 wurde zunächst
fälschlich ein Bid-Optimization-Guide erstellt (falsches Thema für diese
Issue-Nummer). Dieser Inhalt wurde nach
`automation/scripts/google-ads-bid-optimization-budget-reallocation.md`
verschoben und ist nicht mehr an Phase 4.2 gebunden.

---

## Standard-UTM-Format

```
https://www.teppich-paradies.net/collections/{collection}
  ?utm_source=google
  &utm_medium=cpc
  &utm_campaign={campaign_id}
  &utm_content={ad_group_id}
  &utm_term={keyword}
```

Google Ads füllt `utm_term` und Klick-Metadaten automatisch über
ValueTrack-Parameter, wenn die **Tracking-Vorlage** (nicht die finale URL)
verwendet wird. Das vermeidet manuelle Pflege pro Anzeige.

### ValueTrack-Tracking-Vorlage (in allen 3 Kampagnen identisch)

```
{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={_campaign}&utm_content={_adgroup}&utm_term={keyword}&gclid={gclid}
```

Konfiguriert auf **Kontoebene** (Tools & Einstellungen → Tracking-Vorlage),
damit sie automatisch für alle Kampagnen/Anzeigen gilt und nicht pro Anzeige
gepflegt werden muss.

**Benutzerdefinierte Parameter je Kampagne** (in den Kampagneneinstellungen):
```
{_campaign} = teppichboden_search | teppiche_search | vinylboden_search
{_adgroup}  = z.B. teppichboden_basics | teppiche_stil | vinylboden_installation
```

---

## UTM-Werte pro Kampagne

### Phase 2.1 – Teppichboden

| Parameter | Wert |
|---|---|
| `utm_source` | `google` |
| `utm_medium` | `cpc` |
| `utm_campaign` | `teppichboden_search` |
| `utm_content` | Anzeigengruppen-Slug: `basics`, `kaufen`, `typen`, `verlegen` |

### Phase 2.2 – Teppiche

| Parameter | Wert |
|---|---|
| `utm_source` | `google` |
| `utm_medium` | `cpc` |
| `utm_campaign` | `teppiche_search` |
| `utm_content` | `basics`, `stil-design`, `material`, `kommerziell` |

### Phase 2.3 – Vinylboden

| Parameter | Wert |
|---|---|
| `utm_source` | `google` |
| `utm_medium` | `cpc` |
| `utm_campaign` | `vinylboden_search` |
| `utm_content` | `basics`, `installation-technik`, `raum-spezifisch`, `kommerziell` |

**Regel:** `utm_campaign` ist immer `{produkt}_search` (snake_case, keine
Leerzeichen/Umlaute) – das ist der Schlüssel, über den Dashboard und GA4
später filtern.

---

## GA4 Segments (Explorationen)

In GA4 unter **Explorieren → Freie Form** je Kampagne ein Segment mit
folgender Bedingung anlegen:

```
Segment "Teppichboden Paid Traffic":
  Session-Quelle/Medium = google / cpc
  UND Session-Kampagne enthält "teppichboden_search"

Segment "Teppiche Paid Traffic":
  Session-Quelle/Medium = google / cpc
  UND Session-Kampagne enthält "teppiche_search"

Segment "Vinylboden Paid Traffic":
  Session-Quelle/Medium = google / cpc
  UND Session-Kampagne enthält "vinylboden_search"
```

**Verwendung:** Diese 3 Segmente sind Grundlage für alle ROAS-Vergleiche in
Phase 5.2/5.3 (Wochenmonitoring / Optimierungszyklus) – ohne konsistente
`utm_campaign`-Werte laufen diese Segmente leer oder vermischen Kampagnen.

---

## Dashboard-Filter (localhost:8001 / Phase 4.3)

Für das in Phase 4.3 beschriebene Dashboard werden dieselben
`utm_campaign`-Werte als Filter-Optionen verwendet:

```js
const CAMPAIGN_FILTERS = {
  teppichboden_search: "Teppichboden",
  teppiche_search: "Teppiche",
  vinylboden_search: "Vinylboden",
};
```

Das Dashboard gruppiert Conversions/Spend/ROAS nach diesem Wert – die
Konsistenz aus diesem Dokument ist Voraussetzung dafür, dass Phase 4.3
korrekte Zahlen zeigt.

---

## Validierung

Das bestehende Skript prüft bereits die 4 Pflichtparameter:

```bash
node automation/scripts/verify-google-ads-tracking.mjs
```

Es meldet fehlende `utm_source`/`utm_medium`/`utm_campaign`/`utm_content`.
Nach Einrichtung der Tracking-Vorlage sollte ein Testklick (oder manuell
konstruierte URL) durch dieses Skript ohne Fehler laufen.

---

## Implementation Checklist

- [ ] Tracking-Vorlage auf Kontoebene gesetzt (ValueTrack)
- [ ] `{_campaign}` und `{_adgroup}` Custom Parameter je Kampagne/Anzeigengruppe gepflegt
- [ ] UTM-Werte stimmen exakt mit obiger Tabelle überein (keine Tippfehler, keine Großschreibung)
- [ ] 3 GA4-Segmente angelegt und getestet (zeigen Daten nach erstem Klick)
- [ ] Dashboard-Filter-Mapping (Phase 4.3) verwendet dieselben `utm_campaign`-Werte
- [ ] `verify-google-ads-tracking.mjs` läuft ohne fehlende Parameter

---

## Success Criteria

✅ **Phase 4.2 (UTM) abgeschlossen wenn:**
1. UTM-Strategie dokumentiert (dieses Dokument)
2. Tracking-Vorlage für alle 3 Kampagnen identisch konfiguriert
3. GA4 Segments für alle 3 Kampagnen erstellt und liefern Daten
4. Dashboard-Filter (Phase 4.3) nutzt dieselben Werte
5. `verify-google-ads-tracking.mjs` bestätigt vollständige Parameter

---

**Status:** Ready for Implementation
**Version:** 1.0
**Nächster Schritt (laut Issue #53):** GA4 Custom Reports erstellen
