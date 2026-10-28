# Service-Anfrage als Ziel (Werkbank w-111)

Stand 2026-10-28. Vorbereitet, **nicht eingeschaltet**. In Google Ads und GA4
wurde nichts angelegt oder geändert; das Einschalten entscheidet Ahmet.

## Was zählt

Genau eine Sache: eine **von Shopify bestätigte** Anfrage über das Formular
der Serviceseiten (Teppichboden verlegen lassen, Vinylboden verlegen,
Treppenverlegung, Liefer- & Verlegeservice) und der Kontaktseite.

- Nicht der Klick auf „Anfrage senden“ (zählt Fehleingaben, Captcha-Abbrüche, Bots).
- Nicht der Klick auf „Verlegung anfragen“ oben (springt nur zum Formular).
- Anruf- und WhatsApp-Klicks bleiben Hilfsmetrik (`tp_lead_call`,
  `tp_lead_whatsapp`): ein Klick ist Absicht, kein Ergebnis. Wenn überhaupt,
  in Google Ads nur als **sekundäre** Aktion, nie als Gebotsziel.
- Musteranfragen zählen getrennt (`tp_sample_form_submit`).

## Wie es im Theme gezählt wird

`snippets/tp-lead-events.liquid` (seit 29.09., erweitert für w-111):

1. Beim Absenden merkt sich der Tab kurz, dass eine Anfrage unterwegs ist,
   dazu das Kampagnenfeld aus w-030 (`contact[Herkunft]`, z. B.
   „Google-Anzeige · Kampagne Vinyl verlegen“) und das Anliegen.
2. Erst wenn Shopify die Anfrage annimmt, steht auf der Seite die Bestätigung
   (`data-tp-lead-success`). Dann wird **einmal** `tp_lead_form_submit`
   veröffentlicht und der Zwischeneintrag gelöscht. Neu laden zählt nicht
   noch einmal.
3. Nutzdaten: `page` (Pfad), `form`, `herkunft`, `anliegen`. Keine Namen,
   E-Mails, Telefonnummern oder Nachrichten. Klick-IDs (gclid …) gehen nicht
   mit, nur ihr Kanal.

Weg des Ereignisses: `Shopify.analytics.publish` → Kundenereignisse (Custom
Pixel), zusätzlich `window.dataLayer`. Belegt durch
`qa/tests/service-hauptaktion.test.mjs`.

## Was es schon heute ohne Einschalten gibt

Das Kampagnenfeld steht in jeder Anfrage-Mail, und der Postfach-Lauf trägt die
Anfrage samt Quelle im Control Center unter „Kunden“ ein (w-030). Damit ist
schon jetzt zählbar, wie viele Anfragen über Werbung kamen, ohne Google.

## Was das Einschalten wäre (Frage an Ahmet)

Laut `docs/google/ads-startcheck-2026-09-29.md` existiert im Shopify-Admin das
Custom Pixel „Google Ads Lead Erfolg“. Es hört nur auf `tp_lead_form_submit`
und schickt dann die Ads-Aktion „Kontaktformular“. Der Test mit echtem
Formularabschluss steht seit 29.09. aus (Captcha im eingebetteten Browser).
Den aktuellen Pixel-Code haben wir in dieser Runde nicht gelesen.

Vorschlag, in dieser Reihenfolge und erst nach Freigabe:

1. **Echten Test machen** (Ahmet oder Tobias im eigenen Browser, mit Einwilligung
   im Cookie-Banner): auf `/pages/vinylboden-verlegen?utm_source=test&utm_medium=cpc&utm_campaign=w111-test`
   eine klar gekennzeichnete Testanfrage senden. Erwartet: Shopify Pixel Helper
   zeigt **ein** `tp_lead_form_submit` mit `herkunft: "Anzeige (test) · Kampagne w111-test"`;
   die Mail trägt dieselbe Herkunft. Danach die Anfrage im Control Center löschen.
2. **GA4 ergänzen** (kostenlos): im Pixel zusätzlich ein GA4-Ereignis
   `generate_lead` senden und es in GA4 als Schlüsselereignis markieren.
   Vorschlag für den Zusatz im Pixel:

   ```js
   analytics.subscribe('tp_lead_form_submit', (event) => {
     const d = event.customData || {};
     gtag('event', 'generate_lead', {
       lead_seite: d.page || '',
       lead_anliegen: d.anliegen || '',
       lead_herkunft: d.herkunft || '',
     });
     // bestehend: gtag('event', 'conversion', { send_to: 'AW-…/…' });  (Aktion „Kontaktformular“)
   });
   ```

   In GA4 dafür drei benutzerdefinierte Dimensionen (Ereignisbereich)
   `lead_seite`, `lead_anliegen`, `lead_herkunft` anlegen.
3. **Google Ads**: „Kontaktformular“ erst als primäres Gebotsziel nutzen, wenn
   Schritt 1 eine Conversion in der Diagnose zeigt (Eingang kann bis zu einem
   Tag dauern). Zählung „Eine“ pro Klick, nicht „Jede“. Kein zweites Tag für
   dieselbe Anfrage anlegen (das alte GTM-Tag „Kontaktformular“ mit Trigger
   `form_submit` darf nicht zusätzlich laufen, sonst doppelt gezählt).

Bei abgelehnter Einwilligung zählt weder GA4 noch Ads – das ist gewollt. Die
Zahl im Control Center bleibt davon unberührt und ist die verlässliche Basis.
