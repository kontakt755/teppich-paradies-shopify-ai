# Service-Funnel: Lead-Ereignisse messen (Maßnahme 2)

Stand 2026-09-09. Gehört zu `SHOP_ANALYSE_2026-09-09.md`, Maßnahme 2.

## Ausgangslage

37 % aller Einstiege landen auf den drei Verlegeservice-Seiten (Teppichboden
verlegen lassen, Vinylboden verlegen, Treppenverlegung). Diese Besucher rufen
an, schreiben per WhatsApp oder schicken das Kontaktformular ab. Nichts davon
wurde gemessen, und die Seite mit den meisten Einstiegen hatte keinen einzigen
Handlungsaufruf.

## Was im Theme jetzt passiert

1. **Anfrage-Block** (`sections/final-cta.liquid`, lag ungenutzt im Theme) auf
   allen drei Serviceseiten direkt unter dem Seiteninhalt: Angebot anfragen →
   `/pages/kontakt`, Direkt anrufen (`tel:`), WhatsApp schreiben, Telefonnummer
   als Text. Überschrift und Text je Seite, im Theme-Editor änderbar.
2. **Lead-Ereignisse** (`snippets/tp-lead-events.liquid`, in `layout/theme.liquid`
   eingebunden). Jeder Klick auf Telefon, WhatsApp, Mail oder Kontaktseite und
   jedes abgeschickte Kontaktformular veröffentlicht ein Custom Event:

   | Ereignis | Auslöser | Nutzdaten |
   |---|---|---|
   | `tp_lead_call` | Klick auf `tel:`-Link | `page`, `target` (Nummer), `label` |
   | `tp_lead_whatsapp` | Klick auf wa.me / WhatsApp | `page`, `label` |
   | `tp_lead_mail` | Klick auf `mailto:` | `page`, `target`, `label` |
   | `tp_lead_contact_click` | Klick auf `/pages/kontakt` | `page`, `label` |
   | `tp_lead_form_submit` | Kontaktformular abgeschickt | `page`, `form` |

   Die Ereignisse gehen über `Shopify.analytics.publish` an die Kundenereignisse
   und zusätzlich in `window.dataLayer`. Formularinhalte werden nicht gelesen.
3. Auf der Vinyl-Verlegeseite zeigten drei Kollektionslinks auf 404
   (`/collections/klickvinyl`, `klebevinyl`, `rollenware`). Korrigiert, plus
   Weiterleitungen für die alten Pfade.

## Was Ahmet im Admin macht (die eigentliche Zieldefinition)

**Schritt 1 – Custom Pixel anlegen.** Einstellungen → Kundenereignisse →
Custom Pixel hinzufügen, Name „TP Lead-Ereignisse", Datenschutz: Marketing.
Code (GA4-Mess-ID und Ads-Conversion-Label eintragen):

```js
// GA4 laden (Mess-ID aus GA4 → Datenstreams)
const GA4_ID = 'G-XXXXXXXXXX';
// Optional: Google-Ads-Conversion, Format AW-XXXXXXXXX/LabelXYZ
const ADS_CONVERSION = '';

const script = document.createElement('script');
script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
script.async = true;
document.head.appendChild(script);
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA4_ID, { send_page_view: false });

const leadEvents = ['tp_lead_call', 'tp_lead_whatsapp', 'tp_lead_mail', 'tp_lead_contact_click', 'tp_lead_form_submit'];
leadEvents.forEach((name) => {
  analytics.subscribe(name, (event) => {
    const data = event.customData || {};
    gtag('event', name, { page_path: data.page, lead_label: data.label, lead_target: data.target });
    if (ADS_CONVERSION && (name === 'tp_lead_call' || name === 'tp_lead_form_submit')) {
      gtag('event', 'conversion', { send_to: ADS_CONVERSION });
    }
  });
});
```

**Schritt 2 – Ziele festlegen.** In GA4 die Ereignisse `tp_lead_call` und
`tp_lead_form_submit` als Schlüsselereignisse markieren. In Google Ads eine
Conversion „Anruf über Website" und „Anfrage über Formular" anlegen und die
Labels oben eintragen. Empfehlung: `tp_lead_whatsapp` ebenfalls als
Schlüsselereignis, `tp_lead_contact_click` nur als Hilfsmetrik.

**Schritt 3 – Testen.** Auf einer Serviceseite einmal auf „Direkt anrufen"
tippen (Mobil) und das Kontaktformular abschicken. In GA4 → Echtzeit müssen
`tp_lead_call` und `tp_lead_form_submit` erscheinen. Erst danach Kampagnen
darauf optimieren.

## Was danach messbar wird

- Wie viele Service-Besucher tatsächlich Kontakt aufnehmen (heute: unbekannt).
- Welche der drei Seiten und welche Herkunft (Google, Direkt, Social) Anfragen
  bringt.
- Ob der Anfrage-Block unten auf der Seite genutzt wird (`label` = Buttontext).
