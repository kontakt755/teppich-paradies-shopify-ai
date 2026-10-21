# KI-Bilder: Muster wird neu erfunden, Kennzeichnung geht verloren

Regel: Skill `theme-regeln`, Abschnitt Bilder. Kurz: gemusterte und gerichtete Ware nie generativ
neu erzeugen; KI-Bilder tragen die IPTC-Kennzeichnung; Bilder in Gemini mit 3.1 Pro, nie mit 4 Argon.

## Was passierte

**Muster.** Das Raumbild von Ginevra Wohnteppich Grau (15.10.2026, Nano Banana Pro ueber Higgsfield)
zeigte eine andere Anordnung der Formen als der echte Teppich und wurde wieder entfernt. Am 19.10. lief
derselbe Auftrag mit derselben Vorlage und demselben Prompt in Gemini 3.1 Pro und Gemini 4 Argon: Beide
machten denselben Fehler, fast deckungsgleich. Ein unabhaengiger Test (Photoroom, Juli 2026,
850 Produkte) fand bei den besten Modellen nur 28–29 % unveraendert wiedergegebene Produkte, das Muster
war in 11 % der Bilder veraendert. Vorher schon gescheitert: feine Rautenschlinge (cassia), weiche
gebrochene Streifen (arvida), Schlinge, die zu Noppen wird.

Die verfuehrerische Diagnose war: "anderes Modell, besserer Prompt". Gewechselt hat das nichts. Das
Modell zeichnet den Teppich neu, statt das Foto zu uebernehmen. Bei uni und melierter Ware faellt das
nicht auf, bei Mustern immer.

**Argon.** Mit Modell "4 Argon" verwarf das Werkzeug "Bild erstellen" 3 von 4 Sendungen ohne Meldung.
Argon ist laut Google ein reines Textmodell.

**Kennzeichnung.** Gemini (C2PA) und Higgsfield (IPTC `DigitalSourceType = trainedAlgorithmicMedia`)
liefern ihre Bilder gekennzeichnet. Am 19.10. trugen 38 von 38 zufaellig geprueften live KI-Bildern
keine Kennzeichnung mehr: Die lokale Farbkorrektur bzw. das Neuspeichern hatte sie entfernt. Der
Shopify-CDN reicht XMP unveraendert durch, ein einzelnes unbearbeitet hochgeladenes Bild trug den
Eintrag live. Google Merchant Center verlangt, dass KI-Bilder diese Angabe behalten.

## Was jetzt gilt

- Gemusterte/gerichtete Ware: echtes Foto oder Komposit aus dem echten Draufsichtfoto (KI hoechstens
  fuer Licht und Schatten), nie Neuerzeugung.
- `bilder_hochladen.py` (lokale Bildkette, nicht im Repository) schreibt vor jedem Upload die Kennzeichnung
  (Spalte `ki`; ohne Spalte gilt sie bei Alt-Text mit "Beispielbild").
- Die schon live stehenden KI-Bilder ohne Kennzeichnung sind nicht nachgeruestet. Das hiesse, sie neu
  hochzuladen. Entscheidung des Inhabers, zusammen mit der Frage nach sichtbarer KI-Kennzeichnung
  (AI Act Art. 50, seit 02.08.2026).
- Kanten (19.10.): Fertig-Wohnteppiche sind an den kurzen Seiten umgeschlagen, nicht gekettelt. Man sieht
  nur Flor, der ueber die Kante auf den Boden laeuft, kein Band und keine Naht. Kettelung, Paspel oder
  andere Einfassungen nur in Bildern von Teppichen nach Wunschmass zeigen. Der Prompt verlangt das
  ausdruecklich, und das Ergebnis wird an den kurzen Seiten in voller Aufloesung geprueft.
