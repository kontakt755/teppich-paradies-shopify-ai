// Teppich Paradies - Funnel und Musterbestellung
// GA4-purchase und App-Kauf sendet nur die Google-&-YouTube-App. Meta-Kauf nur ueber die Facebook-App.
// Ads-Conversion "Kauf Ware" kommt von hier: nur Bestellungen mit mindestens einem Artikel, der kein Muster ist.
// Quelle fuer Shopify-Admin -> Kundenereignisse -> "TP Funnel und Musterbestellung" (1:1 einfuegen).
const GA4 = 'G-3KKWHJHS0D';
const META_PIXEL = '1401914534871545';
const ADS = 'AW-10991759596';
const ADS_KAUF_WARE_LABEL = ''; // Label der Ads-Aktion "Kauf Ware" (legt der Inhaber an); leer = nichts senden

const s = document.createElement('script');
s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4;
s.async = true;
document.head.appendChild(s);
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
const cp = (init && init.customerPrivacy) || {};
gtag('consent', 'default', {
  ad_storage: cp.marketingAllowed ? 'granted' : 'denied',
  ad_user_data: cp.marketingAllowed ? 'granted' : 'denied',
  ad_personalization: cp.marketingAllowed ? 'granted' : 'denied',
  analytics_storage: cp.analyticsProcessingAllowed ? 'granted' : 'denied'
});
gtag('js', new Date());
gtag('config', GA4, { send_page_view: false, page_location: init.context.document.location.href });
if (ADS_KAUF_WARE_LABEL) gtag('config', ADS, { send_page_view: false });

!function (f, b, e, v, n, t, sc) {
  if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  t = b.createElement(e); t.async = !0; t.src = v; sc = b.getElementsByTagName(e)[0]; sc.parentNode.insertBefore(t, sc);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', META_PIXEL);

// Muster: Produkttyp Musterservice (alle 636 Musterprodukte, belegt an Bestellungen 29.10.-26.11.2026).
// Nicht ueber die SKU "M-...": die ist kein sicheres Merkmal fuer Ware.
function istMuster(li) {
  const v = li.variant || {};
  const typ = (v.product && v.product.type) || '';
  return typ === 'Musterservice' || (v.sku || '').startsWith('TP-MUSTER-');
}

const themeEvents = ['tp_farbe_gewaehlt', 'tp_masse_eingegeben', 'tp_muster_cta_klick', 'tp_muster_im_warenkorb',
  'tp_in_den_warenkorb_konfiguriert', 'tp_lead_call', 'tp_lead_whatsapp', 'tp_lead_mail', 'tp_lead_form_submit',
  'tp_beratung_ja', 'tp_beratung_nein', 'tp_masspruefung_ja', 'tp_verlegung_angefragt', 'tp_newsletter_anmeldung_erfolg',
  'tp_ratgeber_cta_klick'];
themeEvents.forEach(function (name) {
  analytics.subscribe(name, function (e) { gtag('event', name, Object.assign({}, e.customData || {}, { page_location: e.context.document.location.href })); });
});

analytics.subscribe('checkout_completed', function (e) {
  const co = e.data.checkout;
  const items = co.lineItems || [];
  const muster = items.filter(istMuster);
  const ware = items.filter(function (li) { return !istMuster(li); });
  const wert = Number((co.totalPrice && co.totalPrice.amount) || 0);
  const typ = ware.length === 0 ? 'muster' : (muster.length ? 'misch' : 'ware');
  const tid = (co.order && co.order.id) || co.token || '';
  gtag('event', 'tp_bestellung_typ', { typ: typ, wert: wert, transaction_id: tid, muster_anzahl: muster.length, page_location: e.context.document.location.href });
  // Ab 01.12.2026 kosten Musterbestellungen 4,99 EUR Versand: entscheidend ist der Artikel, nicht der Wert.
  if (ware.length && ADS_KAUF_WARE_LABEL) {
    gtag('event', 'conversion', { send_to: ADS + '/' + ADS_KAUF_WARE_LABEL, value: wert, currency: co.currencyCode || 'EUR', transaction_id: String(tid) });
  }
  if (typ === 'muster' || wert === 0) {
    gtag('event', 'sample_order', { muster_anzahl: muster.length, transaction_id: tid, value: 0, currency: 'EUR', page_location: e.context.document.location.href });
    fbq('trackCustom', 'Musterbestellung', { muster_anzahl: muster.length, value: 0, currency: 'EUR' }, { eventID: 'muster-' + tid });
  } else {
    fbq('trackCustom', 'KaufWare', { value: wert, currency: 'EUR' }, { eventID: 'ware-' + tid });
  }
});
