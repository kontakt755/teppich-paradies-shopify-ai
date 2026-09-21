# Google Analytics 4 anlegen – Anleitung für den Inhaber

Stand 2026-09-21 · Aufgabe #422. Dauer etwa 5–10 Minuten, kostenlos. Danach lassen
sich die Shop-Ereignisse (Farbe gewählt, Maße eingegeben, Muster, Warenkorb, Kauf)
als Trichter auswerten. Ohne diesen Schritt laufen die Ereignisse zwar mit, landen
aber nur in Shopify.

## Teil 1 – Property anlegen (Sie)

1. <https://analytics.google.com> öffnen, mit dem Google-Konto des Geschäfts anmelden
   (am besten dasselbe Konto wie Merchant Center und Unternehmensprofil).
2. Unten links **Verwaltung** (Zahnrad) → **Erstellen** → **Property**.
   - Name: `Teppich Paradies Shop`
   - Zeitzone: Deutschland · Währung: Euro
3. Branche „Einkaufen" o. ä., Unternehmensgröße wählen, als Ziel „Umsatz steigern"
   bzw. „Leads generieren" ankreuzen. **Weiter.**
4. Plattform **Web** wählen.
   - Website-URL: `https://www.teppich-paradies.net`
   - Stream-Name: `Shop`
   - „Optimierte Analysen" darf an bleiben.
5. **Stream erstellen.** Oben rechts steht jetzt die **Mess-ID** im Format
   `G-XXXXXXXXXX`. Diese ID brauche ich.
6. Das Fenster „Tag-Anleitung" einfach schließen – **keinen Code ins Theme kopieren.**
   Der Shop sendet über Shopifys Kundenereignisse, nicht über einen Theme-Schnipsel.

Zwei Einstellungen, die sich lohnen (Verwaltung → Datenerhebung und -änderung):
- **Datenaufbewahrung** → Ereignisdaten auf **14 Monate** stellen (Standard sind 2).
- **Google-Signale** aus lassen, solange die Datenschutzerklärung das nicht abdeckt.

## Teil 2 – Pixel im Shop eintragen (Sie, mit meiner Vorlage)

1. Mir die Mess-ID nennen. Ich setze sie in die fertige Vorlage aus
   `docs/kundenbindung/funnel-events.md` (Abschnitt „Custom Pixel") ein und gebe
   Ihnen den fertigen Code.
2. Shopify-Admin → **Einstellungen → Kundenereignisse → Custom Pixel hinzufügen**.
   - Name: `TP Funnel-Ereignisse`
   - Kundendatenschutz: **Analytics** (Marketing nur, wenn Sie die Daten auch für
     Werbezielgruppen nutzen wollen). Damit sendet das Pixel **nur mit
     Einwilligung** aus dem Cookie-Banner – es ist kein weiterer Code dafür nötig.
   - Code einfügen → **Speichern** → **Verbinden**.
   Das Speichern müssen Sie selbst bestätigen; Kontoeinstellungen ändere ich nicht
   ohne Sie.

## Teil 3 – Prüfen (ich oder Sie)

In GA4 **Berichte → Echtzeit** öffnen, im Shop (nach Zustimmung im Cookie-Banner)
eine Farbe wählen, ein Maß eingeben, ein Muster in den Warenkorb legen. Binnen einer
Minute müssen `tp_farbe_gewaehlt`, `tp_masse_eingegeben`, `tp_muster_im_warenkorb`
erscheinen. Erst danach Berichte darauf aufbauen.

## Danach sinnvoll

- In GA4 unter **Verwaltung → Ereignisse** `checkout_completed`,
  `tp_lead_form_submit` und `tp_lead_call` als **Schlüsselereignisse** markieren.
- Trichter als **Explorative Datenanalyse → Trichteranalyse** anlegen:
  `product_viewed` → `tp_farbe_gewaehlt` → `tp_masse_eingegeben` →
  `product_added_to_cart` → `checkout_started` → `checkout_completed`.
- Die Datenschutzerklärung nennt Google Analytics dann ausdrücklich
  (siehe `datenschutz-faktenliste.md`).

Hinweis: In Shopify liegt bereits ein älteres Custom Pixel mit einem
Tag-Manager-Container („Checkout Tracking"). Das neue Pixel ersetzt es nicht und
stört es nicht. Ob das alte noch gebraucht wird, klären wir, sobald GA4 läuft.
