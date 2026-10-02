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

## Fertiger Code (2026-10-02, Audit Quick Win 3) – zum Einfügen

Shopify-Admin → Einstellungen → Kundenereignisse → Pixel **„TP Funnel und
Musterbestellung“** (angelegt, noch leer und nicht verbunden). Einwilligung:
Erforderlich, Marketing + Analysen. Code einfügen → Speichern → Verbinden.
Danach das alte Pixel **„GTM-KRXFFDSL Checkout Tracking“** trennen und löschen
(doppeltes `purchase`, fremdes Meta-Pixel 1997776204331503).

```js
// Teppich Paradies - Funnel und Musterbestellung (2026-10-02)
// KEIN zweites purchase: der Kauf kommt aus der Google-&-YouTube- und der Facebook-App.
const GA4 = 'G-3KKWHJHS0D';
const META_PIXEL = '1401914534871545';

const s = document.createElement('script');
s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4;
s.async = true;
document.head.appendChild(s);
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA4, { send_page_view: false });

!function (f, b, e, v, n, t, sc) {
  if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  t = b.createElement(e); t.async = !0; t.src = v; sc = b.getElementsByTagName(e)[0]; sc.parentNode.insertBefore(t, sc);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', META_PIXEL);

// Muster: SKU M-..., TP-MUSTER-... oder Produkttyp Musterservice
function istMuster(li) {
  const v = li.variant || {};
  const sku = v.sku || '';
  const typ = (v.product && v.product.type) || '';
  return sku.startsWith('M-') || sku.startsWith('TP-MUSTER-') || typ === 'Musterservice';
}

const themeEvents = ['tp_farbe_gewaehlt', 'tp_masse_eingegeben', 'tp_muster_cta_klick', 'tp_muster_im_warenkorb',
  'tp_in_den_warenkorb_konfiguriert', 'tp_lead_call', 'tp_lead_whatsapp', 'tp_lead_mail', 'tp_lead_form_submit',
  'tp_beratung_ja', 'tp_beratung_nein', 'tp_masspruefung_ja', 'tp_verlegung_angefragt', 'tp_newsletter_anmeldung_erfolg'];
themeEvents.forEach(function (name) {
  analytics.subscribe(name, function (e) { gtag('event', name, e.customData || {}); });
});

analytics.subscribe('checkout_completed', function (e) {
  const co = e.data.checkout;
  const items = co.lineItems || [];
  const muster = items.filter(istMuster);
  const ware = items.filter(function (li) { return !istMuster(li); });
  const wert = Number((co.totalPrice && co.totalPrice.amount) || 0);
  const typ = ware.length === 0 ? 'muster' : (muster.length ? 'misch' : 'ware');
  const tid = (co.order && co.order.id) || co.token || '';
  gtag('event', 'tp_bestellung_typ', { typ: typ, wert: wert, transaction_id: tid, muster_anzahl: muster.length });
  if (typ === 'muster' || wert === 0) {
    gtag('event', 'sample_order', { muster_anzahl: muster.length, transaction_id: tid, value: 0, currency: 'EUR' });
    fbq('trackCustom', 'Musterbestellung', { muster_anzahl: muster.length, value: 0, currency: 'EUR' }, { eventID: 'muster-' + tid });
  } else {
    fbq('trackCustom', 'KaufWare', { value: wert, currency: 'EUR' }, { eventID: 'ware-' + tid });
  }
});
```

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
