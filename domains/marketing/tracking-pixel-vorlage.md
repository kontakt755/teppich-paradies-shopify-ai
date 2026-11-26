# Tracking: Custom Pixel und Conversion-Aufteilung (Vorlage, M8)

Stand 2026-09-22. Ziel (Auftrag §§ 26–28): kompletter Trichter in GA4/Ads,
Muster **nicht** als Umsatz werten, kein doppeltes `purchase`, UTMs erhalten.

## Was bereits läuft (Belege in audit/shop-2-0-prelaunch/01-CURRENT-STATE.md, 3)

- Google-Tag `GT-NBPR47T2` über die Google-&-YouTube-App; Consent Mode v2.
- Shopify-Standard-Kundenereignisse (product_viewed, collection_viewed,
  search_submitted, product_added_to_cart, checkout_started,
  checkout_completed) → GA4 `view_item`, `view_item_list`, `search`,
  `add_to_cart`, `begin_checkout`, `purchase` – über die App gemappt.
- Theme-Events über `Shopify.analytics.publish` + `dataLayer`:
  `tp_farbe_gewaehlt`, `tp_masse_eingegeben`, `tp_muster_cta_klick`,
  `tp_muster_im_warenkorb`, `tp_in_den_warenkorb_konfiguriert`,
  `tp_lead_call`, `tp_lead_whatsapp`, `tp_lead_mail`, `tp_lead_form_submit`,
  neu (M5): `tp_beratung_ja`, `tp_beratung_nein`, `tp_masspruefung_ja`,
  `tp_verlegung_angefragt`.

## Zuordnung Theme-Event → Sollname (Auftrag § 26)

| Soll | Quelle |
|---|---|
| view_item, view_item_list, search, add_to_cart, begin_checkout, purchase | Shopify-Standard (App) |
| select_item | Standard `product_viewed` mit Referrer Kollektion (nicht separat nötig) |
| sample_click | `tp_muster_cta_klick` |
| sample_add | `tp_muster_im_warenkorb` |
| sample_order | Pixel: `checkout_completed` mit nur Musterzeilen (unten) |
| color_select | `tp_farbe_gewaehlt` |
| measure_start / measure_complete | `tp_masse_eingegeben` / `tp_in_den_warenkorb_konfiguriert` |
| consultation_yes / consultation_no | `tp_beratung_ja` / `tp_beratung_nein` |
| measurement_review | `tp_masspruefung_ja` |
| installation_request | `tp_verlegung_angefragt` |
| phone_click / whatsapp_click | `tp_lead_call` / `tp_lead_whatsapp` |

## Fertiger Code (2026-10-02, Audit Quick Win 3; ergänzt 2026-10-12) – so im Admin aktiv

**Nachtrag 2026-10-12:** Die Annahme oben („purchase … über die App gemappt“) stimmt nicht.
Die Google-&-YouTube-App meldet Käufe nur an Google Ads („Google Shopping App Purchase“),
nicht an GA4. Bis 05.10. kam das GA4-`purchase` aus dem GTM-Pixel; nach dessen Trennung
kam von 07.10. bis 12.10. kein einziges `purchase` mehr in GA4 an (auch nicht der
Warenkauf #1031). Die primäre Ads-Conversion „Kauf Ware (GA4, ohne Muster)“ zählte
deshalb nichts. Seit 12.10. sendet dieses Pixel für Warenkäufe > 0 € ein GA4-`purchase`
mit Bestellnummer, Betrag und Artikeln (Freigabe Tobias). Muster bleiben ausgenommen;
doppelt wird nichts gezählt, solange das GTM-Pixel getrennt bleibt.
Gegenprobe ohne Testkauf: echte Bestellungen (Admin API) gegen GA4-Ereignisse
(`purchase`, `sample_order`, `tp_bestellung_typ`) abgleichen.

**Nachtrag 28.10. (Fehlersuche, PR #1785):** `tp_ratgeber_cta_klick` fehlte in
`themeEvents` - Klicks aus den Ratgebern kamen deshalb nie in GA4 an (Admin
gelesen 28.10.: Code = diese Vorlage ohne die letzte Zeile der Liste). Unten ist
das Ereignis ergänzt; im Admin muss es der Inhaber eintragen und speichern.
Weil das Pixel `customData` komplett weiterreicht, kommen die Felder `ziel`,
`cta_typ` und `ort` (Ratgeber) bzw. `ort` (Muster, ab PR #1789) ohne weitere
Änderung mit. Sichtbar in GA4-Berichten erst als benutzerdefinierte Dimension
(Ereignisbereich).

**Nachtrag 23.11. (Stand des Admin-Codes, Wirkung noch nicht belegt):** Der Code im
Admin weicht von der Vorlage unten ab und ist maßgeblich: Er setzt vorab
`gtag('consent', 'default', …)` aus `init.customerPrivacy`, gibt jedem Theme-Ereignis
und `tp_bestellung_typ` die echte Seiten-URL als `page_location` mit
(`event.context.document.location.href`) und sendet kein eigenes `purchase`
(das kommt nur von der Google-&-YouTube-App). Die GA4-Prüfung 17.–23.11. zeigte
trotzdem Sandbox-URLs als `page_location` bei `scroll` (Ursache: automatische
Messung von gtag nutzt die Konfiguration, nicht die Ereignisparameter), und
`tp_ratgeber_cta_klick` hatte 0 Ereignisse. Am 23.11. wurde deshalb die Zeile
`gtag('config', GA4, { send_page_view: false, page_location: init.context.document.location.href });`
im Admin gespeichert (Freigabe Tobias). Nachprüfen ab 25.11. in GA4: `scroll` ohne
`web-pixels@…/sandbox`-URL, `tp_ratgeber_cta_klick` > 0 (Werkbank w-184).

Shopify-Admin → Einstellungen → Kundenereignisse → Pixel **„TP Funnel und
Musterbestellung“** (angelegt, noch leer und nicht verbunden). Einwilligung:
Erforderlich, Marketing + Analysen. Code einfügen → Speichern → Verbinden.
Danach das alte Pixel **„GTM-KRXFFDSL Checkout Tracking“** trennen (erledigt) und löschen
(fremdes Meta-Pixel 1997776204331503). Nicht wieder verbinden: Es sendet ebenfalls ein GA4-`purchase`.

**Seit 26.11.2026 steht der Code nur noch in `domains/marketing/tp-funnel-pixel.js`**
(1:1 so im Admin, Test `qa/tests/tp-funnel-pixel.test.mjs`). Er sendet kein
eigenes GA4-`purchase`. Neu: Ads-Conversion **„Kauf Ware“** (`AW-10991759596/<Label>`)
bei `checkout_completed`, nur wenn mindestens ein Artikel kein Muster ist
(Produkttyp `Musterservice` = Muster), Wert = Bestell-Gesamtbetrag brutto,
`transaction_id` = Bestell-ID. „Wert > 0“ wäre falsch, weil Muster ab 01.12. 4,99 €
Versand kosten. Ohne Label sendet der Code nichts an Ads. Entscheidung Inhaber 26.11.:
diese Aktion primär, „Google Shopping App Purchase“ sekundär.

Folgeschritte nach dem Verbinden:
- GA4: `sample_order` als Schlüsselereignis markieren; in Google Ads als
  sekundäre Conversion „Musterbestellung“ importieren.
- Meta: Kampagne „TP | Meta | Muster“ auf das benutzerdefinierte Ereignis
  `Musterbestellung` optimieren; Custom Conversion „Kauf > 0 €“ auf `KaufWare`.
- Nachweis per Netzwerkmitschnitt einer Testbestellung (nicht über Ads-Zahlen).

## Custom Pixel – ursprüngliche Vorlage (2026-09-22)

Berechtigungen: Analytics + Marketing (Consent-Pflicht, Pixel läuft nur mit
Einwilligung). `G-XXXXXXXXXX` durch die GA4-Mess-ID des Inhabers ersetzen.

```js
// Teppich Paradies – Funnel-Pixel (Vorlage 2026-09-22)
const GA4 = 'G-XXXXXXXXXX';
const script = document.createElement('script');
script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4;
script.async = true; document.head.appendChild(script);
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA4, { send_page_view: false });

// Muster erkennen: SKU M-… oder TP-MUSTER-000 (siehe domains/shopify/benachrichtigungen/musterartikel.md)
function istMuster(li) {
  const sku = (li.variant && li.variant.sku) || '';
  return sku.startsWith('M-') || sku === 'TP-MUSTER-000';
}

// Theme-Events 1:1 weiterreichen
const themeEvents = ['tp_farbe_gewaehlt','tp_masse_eingegeben','tp_muster_cta_klick','tp_muster_im_warenkorb',
  'tp_in_den_warenkorb_konfiguriert','tp_lead_call','tp_lead_whatsapp','tp_lead_mail','tp_lead_form_submit',
  'tp_beratung_ja','tp_beratung_nein','tp_masspruefung_ja','tp_verlegung_angefragt','tp_newsletter_anmeldung_erfolg'];
themeEvents.forEach((name) => analytics.subscribe(name, (e) => gtag('event', name, e.customData || {})));

// Kauf: Muster getrennt vom Warenkauf. KEIN zweites purchase senden – das
// purchase kommt aus der Google-&-YouTube-App. Hier nur die Trennung.
analytics.subscribe('checkout_completed', (e) => {
  const co = e.data.checkout;
  const items = co.lineItems || [];
  const muster = items.filter(istMuster);
  const ware = items.filter((li) => !istMuster(li));
  const typ = ware.length === 0 ? 'muster' : (muster.length ? 'misch' : 'ware');
  gtag('event', 'tp_bestellung_typ', { typ, wert: Number(co.totalPrice && co.totalPrice.amount || 0), transaction_id: co.order && co.order.id, muster_anzahl: muster.length });
  if (typ === 'muster') gtag('event', 'sample_order', { muster_anzahl: muster.length, transaction_id: co.order && co.order.id });
});
```

## Google Ads Conversion-Aktionen (Empfehlung)

| Aktion | Quelle | Primär? | Wert |
|---|---|---|---|
| Kauf Ware | `purchase` (App) **mit Wert > 0** – in Ads als Regel: Conversions ohne Wert ausschließen, oder GA4-Import mit Bedingung `tp_bestellung_typ.typ != muster` | ja | Umsatz |
| Musterbestellung | `sample_order` (GA4-Import) | nein (sekundär) | fest 5 € |
| Beratungs-Lead | `tp_beratung_ja` | nein | fest 15 € |
| Verlegeservice-Lead | `tp_verlegung_angefragt` | nein | fest 30 € |
| Anruf / WhatsApp | `tp_lead_call`, `tp_lead_whatsapp` | nein | fest 5 € |

Nur **eine** Purchase-Quelle in Ads aktiv lassen (App **oder** GA4-Import),
sonst Doppelzählung (PL-017). Prüfung: Testbestellung, dann in Ads „Conversions
diagnostizieren" und in GA4 DebugView genau ein `purchase`.

## UTM

Tracking-Vorlage auf Kontoebene (Google Ads → Einstellungen):
`{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={_campaign}&utm_content={_adgroup}&utm_term={keyword}&gclid={gclid}`
(`automation/scripts/google-ads-phase-4-2-utm-parameters.md`). Shopify
speichert die Landing-Page-UTMs am Kunden-/Bestellobjekt (Marketing-
Attribution); im Theme ist nichts nötig.

## Gegenprobe vor dem ersten Euro

1. Consent ablehnen → kein GA4-Hit, keine Ads-Hits (Netzwerk-Tab).
2. Consent annehmen → `view_item` auf PDP, `tp_farbe_gewaehlt` bei Farbwahl,
   `add_to_cart`, `tp_beratung_ja` im Warenkorb, `begin_checkout`.
3. Testbestellung Muster → `sample_order`, **kein** Ads-Kauf mit Wert.
4. Testbestellung Ware → genau ein `purchase` mit Wert, `tp_bestellung_typ` = ware.
