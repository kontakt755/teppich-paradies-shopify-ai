# Funnel-Ereignisse messen

Stand 2026-09-21. Ergaenzt `../analyse/service-funnel-events.md` (Lead-Ereignisse
`tp_lead_*`) um den Rest des Kauftrichters: Farbwahl, Konfiguration, Muster,
Warenkorb, Rabattcode, Newsletter, Ratgeber. Implementiert in
`snippets/tp-funnel-events.liquid`, eingebunden in `layout/theme.liquid` direkt
nach `tp-lead-events`. Gleiches Muster: `publish(name, payload)` an
`window.Shopify.analytics.publish` (Kundenereignisse) und zusaetzlich
`window.dataLayer.push`, falls ein Tag Manager laeuft. Keine personenbezogenen
Daten, keine Formularinhalte, kein Rabattcode-Wert.

## Der Trichter

```
Besuch -> Produkt angesehen -> Farbe gewaehlt -> Masse eingegeben
       -> Muster / Beratung  ODER  Warenkorb -> Checkout -> Kauf
```

| Schritt | Ereignis | Quelle |
|---|---|---|
| Besuch | `page_viewed` | Shopify Standard |
| Produkt angesehen | `product_viewed` | Shopify Standard |
| Farbe gewaehlt | `tp_farbe_gewaehlt` | dieses Snippet |
| Masse eingegeben | `tp_masse_eingegeben` | dieses Snippet |
| Muster | `tp_muster_cta_klick`, `tp_muster_im_warenkorb` | dieses Snippet |
| Beratung | `tp_lead_call`, `tp_lead_whatsapp`, `tp_lead_mail`, `tp_lead_contact_click`, `tp_lead_form_submit` | `tp-lead-events.liquid` |
| Warenkorb | `product_added_to_cart` (Shopify Standard) + `tp_in_den_warenkorb_konfiguriert` | Shopify Standard + dieses Snippet |
| Warenkorb-Pflege | `tp_rabattcode_eingegeben` | dieses Snippet |
| Checkout | `checkout_started` | Shopify Standard |
| Kauf | `checkout_completed` | Shopify Standard |
| Newsletter (parallel, kein Kaufschritt) | `tp_newsletter_anmeldung_abgeschickt`, `tp_newsletter_anmeldung_erfolg` | dieses Snippet |
| Ratgeber (Einstieg vor dem Produkt) | `tp_ratgeber_cta_klick` | dieses Snippet |
| Bodenwissen (Einstieg vor dem Produkt) | `tp_bodenwissen_problem_gewaehlt`, `tp_bodenwissen_lexikon`, `tp_bodenwissen_rechner` | dieses Snippet |
| Bodenwissen-Suche | `tp_bodenwissen_suche`, `tp_bodenwissen_suche_leer` | `assets/tp-bodenwissen-suche.js` |

## Ereignisse

| Ereignis | Ausloeser | Payload | Trichter-Schritt |
|---|---|---|---|
| `tp_farbe_gewaehlt` | `tp:farbe-wechsel` (color-swatch-picker.liquid), nativer Variantenwaehler bei Optionsname Farbe/Dekor/Color (deckt auch die Leisten-Farbwahl ab) | `page`, `product_handle`, `variant_id` | Farbe gewaehlt |
| `tp_masse_eingegeben` | erste gueltige Eingabe (`change`) je Rechner und Seitenaufruf | `page`, `product_handle`, `rechner` (rollware\|paket\|wunschmass\|einfassung\|zubehoer) | Masse eingegeben |
| `tp_muster_cta_klick` | Klick auf einen Link zu `/pages/muster` oder den Muster-Knopf (`tp-muster-cta.liquid`) | `page`, `product_handle` | Muster |
| `tp_muster_im_warenkorb` | Klick auf den Musterkonfigurator-Absenden-Knopf, Bestaetigung ueber sessionStorage-Uebergabe auf `/cart`, nur mit Analyse-Einwilligung (siehe Risiken) | `page`, `anzahl` (wenn bekannt) | Muster |
| `tp_in_den_warenkorb_konfiguriert` | `cart:update` auf einer Produktseite, hoechstens 3 s nach einer Rechner-Eingabe/einem Klick auf deren Kaufknopf | `page`, `product_handle`, `rechner` | Warenkorb (Zusatzkontext) |
| `tp_rabattcode_eingegeben` | `submit` auf dem Rabattcode-Formular im Warenkorb | `page`, `erfolg` (true\|false\|unknown) | Warenkorb-Pflege |
| `tp_newsletter_anmeldung_abgeschickt` | `submit` auf `form[data-tp-newsletter-form]` | `page`, `quelle` (`data-tp-newsletter-quelle`) | Newsletter |
| `tp_newsletter_anmeldung_erfolg` | Seitenaufruf mit `[data-tp-newsletter-erfolg]` oder `?customer_posted=true` | `page` | Newsletter |
| `tp_ratgeber_cta_klick` | Klick auf einen Link innerhalb `[data-tp-rg-cta]` | `page`, `ziel` (Pfad ohne Query), `cta_typ` (Wert von `data-tp-rg-cta`) | Ratgeber |
| `tp_bodenwissen_problem_gewaehlt` | Klick auf `.tp-bp__link` im Problem-Finder | `page`, `belag`, `symptom`, `ziel` | Ratgeber |
| `tp_bodenwissen_lexikon` | Aufklappen eines Fachbegriffs (`summary` ueber `[data-tp-bw-lexikon]`) oder Sprung in der Lexikon-Navigation | `page`, `begriff`, `von` (`produkt`\|`ratgeber`\|`lexikon`) | Ratgeber |
| `tp_bodenwissen_rechner` | erster Klick auf `[data-berechnen]` im Bedarfsrechner, einmal je Seitenaufruf | `page`, `rechner` | Ratgeber |

## Custom Pixel (fertig zum Einfuegen)

Einstellungen -> Kundenereignisse -> Custom Pixel hinzufuegen, Name
„TP Funnel-Ereignisse", Datenschutz: Analytics (plus Marketing, falls die
Farb-/Rechner-Ereignisse auch fuer Werbezielgruppen genutzt werden sollen).
Der Versand haengt allein an der Datenschutz-Einstellung dieses Pixels - kein
zusaetzlicher Consent-Code noetig.

```js
// GA4-Mess-ID aus GA4 -> Datenstreams
const GA4_ID = 'G-XXXXXXXXXX';

const script = document.createElement('script');
script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
script.async = true;
document.head.appendChild(script);
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA4_ID, { send_page_view: false });

// tp_* Ereignisse dieses Pakets, 1:1 an GA4 weitergereicht.
const events = [
  'tp_farbe_gewaehlt', 'tp_masse_eingegeben', 'tp_muster_cta_klick',
  'tp_muster_im_warenkorb', 'tp_in_den_warenkorb_konfiguriert',
  'tp_rabattcode_eingegeben', 'tp_newsletter_anmeldung_abgeschickt',
  'tp_newsletter_anmeldung_erfolg', 'tp_ratgeber_cta_klick',
];
events.forEach((name) => {
  analytics.subscribe(name, (event) => {
    const d = event.customData || {};
    gtag('event', name, {
      page_path: d.page, product_handle: d.product_handle, variant_id: d.variant_id,
      rechner: d.rechner, erfolg: d.erfolg, quelle: d.quelle, ziel: d.ziel,
      cta_typ: d.cta_typ, anzahl: d.anzahl,
    });
  });
});

// Shopify-Standardereignisse fuer denselben Trichter, unveraendert weitergereicht.
['product_viewed', 'product_added_to_cart', 'checkout_started', 'checkout_completed'].forEach((name) => {
  analytics.subscribe(name, (event) => {
    gtag('event', name, { page_path: event.context.document.location.pathname });
  });
});
```

Danach in GA4 testen: Farbe waehlen, Rechner ausfuellen, ein Muster in den
Warenkorb legen - GA4 Echtzeit muss die passenden Ereignisse zeigen, bevor
Berichte/Zielgruppen darauf aufgebaut werden.

## Welche Frage beantwortet welches Ereignis

| Frage des Inhabers | Ereignis/Bericht |
|---|---|
| Wo brechen Kunden ab? | Trichter `product_viewed` -> `tp_farbe_gewaehlt` -> `tp_masse_eingegeben` -> `product_added_to_cart` -> `checkout_started` -> `checkout_completed` als Explorationsbericht in GA4 |
| Welche Farben fuehren zu Musterbestellungen? | `tp_farbe_gewaehlt` (Segment) verglichen mit `tp_muster_cta_klick`/`tp_muster_im_warenkorb` auf denselben `product_handle` |
| Welcher Rechner wird begonnen, aber nicht gekauft? | `tp_masse_eingegeben` nach `rechner` ohne folgendes `tp_in_den_warenkorb_konfiguriert` |
| Verhindert ein Rabattcode-Fehler den Kauf? | `tp_rabattcode_eingegeben` mit `erfolg:false`, zeitlich vor Warenkorb-Abbruch |
| Bringt der Ratgeber Kaeufe? | `tp_ratgeber_cta_klick` als Startpunkt einer Sitzung, GA4-Attribution auf `checkout_completed` |
| Welche Kampagne erzeugt Umsatz? | GA4-Kampagnenzuordnung (UTM) auf `checkout_completed`, kein eigenes Ereignis noetig |
| Wirkt der Newsletter? | `tp_newsletter_anmeldung_erfolg` als Segmentstart, GA4-Kohorte gegen spaetere `checkout_completed` |

## Risiken

- **`tp_muster_im_warenkorb` hat kein natives Bestaetigungs-Ereignis.**
  `assets/tp-sample-checkout.js` fuegt per eigenem `fetch` hinzu und navigiert
  bei Erfolg sofort per `window.location.href` weg, ohne `cart:update` zu
  feuern. Das Snippet merkt die Auswahl beim Klick auf den Absenden-Knopf in
  `sessionStorage` (Schluessel `tpFunnelMusterPending`, Altersgrenze 20 s) und
  liest sie auf der naechsten Seite. Faellt aus, wenn der Kunde nach einem
  erfolgreichen Klick den Tab schliesst.
  **Zwei Sicherungen seit 2026-09-21:** (1) Der Merker wird nur mit
  Analyse-Einwilligung geschrieben und gelesen
  (`Shopify.customerPrivacy.analyticsProcessingAllowed()`) - Speichern auf dem
  Geraet zu Messzwecken braucht sie. Die API ist auf den Seiten nicht von selbst
  vorhanden (gemessen), das Snippet laedt sie wie `sections/google.liquid` ueber
  `Shopify.loadFeatures` nach; ohne API gilt "nein". Wer nicht einwilligt,
  erzeugt dieses eine Ereignis nicht - alle anderen Ereignisse speichern nichts
  und sind davon unberuehrt. (2) Das Ereignis zaehlt nur auf `/cart`, wohin
  `tp-sample-checkout.js` nach Erfolg leitet. Ein Merker, der auf einer anderen
  Seite gefunden wird (Neuladen nach Fehlschlag), wird verworfen, ohne zu melden.
  Beleg: Puppeteer mit injiziertem Skript, drei Faelle (ohne Einwilligung, mit
  Einwilligung, Merker ausserhalb des Warenkorbs).
- **`origin/feature/pdp-kompakt` (Rollenware-Neugestaltung, #420) laeuft
  parallel.** Gewaehlte Selektoren gegen diesen Branch geprueft:
  `data-length-input`, `data-wunsch-input`, `.tp-kaufweg`, `data-add-to-cart`
  und `tp:farbe-wechsel` bleiben dort unveraendert (nur cm/m-Umschalter und
  Farb-Dropdown-Optik kamen hinzu). Benennt ein spaeterer Merge diese
  Attribute um, fallen `tp_masse_eingegeben`/`tp_farbe_gewaehlt` fuer
  Rollenware still aus - `npm run liquid:guard` faengt das nicht ab.
- **`tp_farbe_gewaehlt` beim nativen Variantenwaehler ist eine Naeherung.**
  Ein `change` auf einem Farbe/Dekor/Color-Feld merkt ein 2-s-Fenster; das
  naechste `variant:update` darin liefert die Varianten-ID. Wechselt der
  Kunde in diesen 2 s blitzschnell noch eine zweite Option (z. B. Groesse),
  kann das faelschlich als Farbwechsel zaehlen - seltener Randfall.
- **`tp_newsletter_anmeldung_*` und `tp_ratgeber_cta_klick` haengen an
  Attributen aus zwei parallel laufenden Sitzungen**
  (`data-tp-newsletter-form/-quelle/-erfolg`, `data-tp-rg-cta`). Fehlen sie im
  Markup, bleiben die Ereignisse aus - keine Daten, bis sie gesetzt sind.
- **`tp_rabattcode_eingegeben` mit `erfolg:'unknown'`** entsteht, wenn nach
  1,5 s weder `discount:update` noch eine sichtbare Fehlermeldung vorliegt
  (z. B. sehr langsames Netz). Haeuft sich das, Timeout pruefen statt das
  Ereignis zu verwerfen.
