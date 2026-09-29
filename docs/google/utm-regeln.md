# UTM-Regeln fuer TeppichParadies (#53)

Stand 2026-09-29. Gilt fuer jeden Link, der von aussen in den Shop fuehrt.

## Grundsatz

**Google Ads bekommt keine UTM-Parameter.** Google Ads markiert jeden Klick
automatisch (`gclid`, „Automatische Tag-Kennzeichnung\" im Ads-Konto, muss
**an** sein). GA4 liest daraus Kampagne, Anzeigengruppe und Suchbegriff.
Manuelle UTMs an Ads-Links liefern weniger Daten und koennen die automatische
Zuordnung ueberschreiben.

UTMs gehoeren an **alle anderen** Links: Newsletter, Willkommensmail,
Social Media, Google-Unternehmensprofil, Flyer/QR-Codes, Partnerseiten.

## Schreibweise

- nur Kleinbuchstaben, keine Leerzeichen, keine Umlaute; Woerter mit `-`
- immer alle drei: `utm_source`, `utm_medium`, `utm_campaign`
- `utm_content` nur, wenn es in einer Quelle mehrere Links gibt (z. B. Bild vs. Knopf)
- keine Rabattcodes, Kundendaten oder Lieferantennamen in Parametern

## Feste Werte

| Kanal | utm_source | utm_medium | Beispiel utm_campaign |
|---|---|---|---|
| Google Ads (Suche, Shopping, PMax) | – (automatisch) | – | – |
| Google-Unternehmensprofil | `google` | `organic` | `profil-website`, `profil-produkt` |
| Newsletter / Shopify Messaging | `newsletter` | `email` | `willkommen`, `aktion-2026-10` |
| Transaktionsmails (Versand, Bestellung) | `shopify` | `email` | `versandmail` |
| Instagram (Beitrag, Profil-Link) | `instagram` | `social` | `profil`, `beitrag-<thema>` |
| Facebook | `facebook` | `social` | `beitrag-<thema>` |
| Bezahlte Social-Anzeigen | `facebook` / `instagram` | `paid-social` | `<thema>-<jjjj-mm>` |
| Flyer / Aufkleber / QR-Code | `flyer` | `offline` | `messe-<ort>`, `ausstellung` |
| Partner / Verleger-Empfehlung | `<partner-kurzname>` | `referral` | `empfehlung` |

## Kampagnennamen (Google Ads und uebrige Kanaele gleich benennen)

`<bereich>-<zweck>[-<zeitraum>]`, zum Beispiel:

- `teppichboden-suche` · `teppiche-suche` · `vinyl-suche`
- `verlegeservice-oranienburg`
- `muster-bestellen`
- `aktion-2026-10` (zeitlich begrenzte Aktion)

In Google Ads heissen die Kampagnen genauso. Dann stehen Ads- und
UTM-Zugriffe in GA4 unter demselben Namen nebeneinander.

## Ziel-Seiten (geprueft 2026-09-29, HTTP 200)

- `https://www.teppich-paradies.net/collections/teppichboden`
- `https://www.teppich-paradies.net/collections/teppiche`
- `https://www.teppich-paradies.net/pages/muster`

## Beispiele

```
https://www.teppich-paradies.net/collections/teppichboden?utm_source=newsletter&utm_medium=email&utm_campaign=aktion-2026-10
https://www.teppich-paradies.net/?utm_source=google&utm_medium=organic&utm_campaign=profil-website
https://www.teppich-paradies.net/pages/muster?utm_source=flyer&utm_medium=offline&utm_campaign=ausstellung
```

## Auswertung in GA4

Berichte → Akquisition → Traffic-Akquisition, Dimension
„Sitzung – Quelle/Medium\" bzw. „Sitzung – Kampagne\". Eine eigene Segmentierung
ist erst sinnvoll, wenn Zugriffe da sind; die Werte oben sind so gewaehlt, dass
die GA4-Standardgruppen (Email, Organic Search, Organic Social, Paid Social, Referral) greifen; `offline` landet dort unter „Unassigned\" und wird ueber utm_source gefiltert.

Offen, braucht das Ads-Konto (Inhaber): „Automatische Tag-Kennzeichnung\"
eingeschaltet? Doppelte Kauf-Conversion bereinigt? (#52)
